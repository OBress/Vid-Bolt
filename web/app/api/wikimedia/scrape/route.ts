/**
 * Wikimedia Image Scrape API
 * ============================================================================
 * POST /api/wikimedia/scrape
 * Full ingestion pipeline: search, classify with Gemini 3 Flash, store in R2 + vector DB.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchWikimediaImages, downloadWikimediaImage, getExtensionFromMime } from '@/lib/wikimedia/client';
import { classifyMedia } from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import { uploadAudioBuffer, generateStockScraperImageKey, getPublicUrl } from '@/lib/services/r2-storage';
import { createServiceClient } from '@/lib/supabase/service';
import type { WikimediaScrapeRequest, WikimediaScrapeResult, WikimediaImage } from '@/lib/wikimedia/types';

const QUALITY_THRESHOLD = 6; // Minimum quality rating to keep


export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body: WikimediaScrapeRequest = await req.json();
    const { query, filters = {}, selectedPageIds } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`[Wikimedia Scrape] Starting for query: "${query}"`);

    // 3. Search Wikimedia (or use selected IDs)
    let images: WikimediaImage[];
    if (selectedPageIds && selectedPageIds.length > 0) {
      // User selected specific images from preview
      const allImages = await searchWikimediaImages(query, { ...filters, maxResults: 100 });
      images = allImages.filter(img => selectedPageIds.includes(img.pageId));
    } else {
      images = await searchWikimediaImages(query, filters);
    }

    console.log(`[Wikimedia Scrape] Processing ${images.length} images`);

    const result: WikimediaScrapeResult = {
      processed: 0,
      approved: 0,
      rejected: 0,
      stored: [],
      rejectedDetails: [],
    };

    // Use service client for DB operations (bypasses RLS)
    const serviceClient = createServiceClient();

    // 4. Process each image
    for (const image of images) {
      result.processed++;
      
      try {
        console.log(`[Wikimedia Scrape] Classifying ${image.title}...`);
        
        // 4a. Classify with Gemini 3 Flash
        const classification = await classifyMedia(image.url, 'image', user.id);
        const qualityRating = classification.classification.qualityRating || 0;
        
        console.log(`[Wikimedia] Image quality: ${qualityRating}/10 - ${qualityRating >= QUALITY_THRESHOLD ? 'APPROVED' : 'REJECTED'}`);

        if (qualityRating < QUALITY_THRESHOLD) {
          result.rejected++;
          result.rejectedDetails?.push({
            pageId: image.pageId,
            title: image.title,
            qualityRating,
            reason: `Quality rating ${qualityRating} below threshold ${QUALITY_THRESHOLD}`,
          });
          continue;
        }

        // 4b. Download image
        const imageBuffer = await downloadWikimediaImage(image.url);
        const extension = getExtensionFromMime(image.mimeType, image.url);
        
        // 4c. Upload to R2
        const imageId = `wikimedia-${image.pageId}-${Date.now()}`;
        const r2Key = generateStockScraperImageKey(imageId, extension);
        
        await uploadAudioBuffer(imageBuffer, r2Key, image.mimeType || 'image/jpeg');
        const publicUrl = getPublicUrl(r2Key);
        
        console.log(`[Wikimedia Scrape] Uploaded to R2: ${r2Key}`);

        // 4d. Generate embedding from description
        const embedding = await generateEmbedding(classification.classification.description);

        // 4e. Check for near-duplicates using vector similarity
        const DUPLICATE_THRESHOLD = 0.95;
        const { data: duplicates } = await serviceClient.rpc('match_stock_media', {
          query_embedding: embedding,
          match_threshold: DUPLICATE_THRESHOLD,
          match_count: 1
        });

        if (duplicates && duplicates.length > 0) {
          const existingAsset = duplicates[0];
          console.log(`[Wikimedia Scrape] Duplicate detected for ${image.title}: ${existingAsset.id} (similarity: ${existingAsset.similarity.toFixed(3)})`);
          
          result.rejected++;
          result.rejectedDetails?.push({
            pageId: image.pageId,
            title: image.title,
            qualityRating,
            reason: `Near-duplicate of existing asset (${(existingAsset.similarity * 100).toFixed(1)}% similar)`,
            isDuplicate: true,
            existingAsset: {
              id: existingAsset.id,
              r2Key: existingAsset.r2_key,
              metadata: existingAsset.metadata,
              similarity: existingAsset.similarity
            }
          } as any);
          continue;
        }

        // 4f. Store in vector DB
        const { error: dbError } = await serviceClient
          .from('stock_media')
          .insert({
            source: 'wikimedia',
            external_id: String(image.pageId),
            r2_key: r2Key,
            metadata: {
              title: image.title,
              description: classification.classification.description,
              tags: [],
              mediaType: 'image',
              width: image.width,
              height: image.height,
              aspectRatio: image.width > image.height ? 'landscape' : image.width < image.height ? 'portrait' : 'square',
              license: image.license,
              author: image.author,
              url: publicUrl,
              thumbnailUrl: image.thumbnailUrl,
              qualityRating,
              mood: classification.classification.mood,
              subjects: (classification.classification as any).subjects || [],
              style: (classification.classification as any).style,
              dominantColors: (classification.classification as any).dominantColors || [],
              sourceUrl: image.descriptionUrl,
            },
            embedding,
          });

        if (dbError) {
          console.error(`[Wikimedia Scrape] DB error for ${image.title}:`, dbError);
          throw dbError;
        }

        result.approved++;
        result.stored.push({
          pageId: image.pageId,
          title: image.title,
          r2Key,
          qualityRating,
        });

        console.log(`[Wikimedia Scrape] ✓ Stored ${image.title} (quality: ${qualityRating})`);

      } catch (imgError) {
        console.error(`[Wikimedia Scrape] Failed to process ${image.title}:`, imgError);
        result.rejected++;
        result.rejectedDetails?.push({
          pageId: image.pageId,
          title: image.title,
          qualityRating: 0,
          reason: imgError instanceof Error ? imgError.message : 'Processing failed',
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Wikimedia Scrape] ✓ Complete in ${totalTime}ms - ${result.approved} approved, ${result.rejected} rejected`);

    return NextResponse.json({
      success: true,
      ...result,
      processingTimeMs: totalTime,
    });

  } catch (error) {
    console.error('[Wikimedia Scrape] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
