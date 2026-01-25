/**
 * Serper Image Scrape API
 * ============================================================================
 * POST /api/serper/scrape
 * Full ingestion pipeline: watermark check, classify with Gemini 3 Flash,
 * relevance check, duplicate detection, store in R2 + vector DB.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { searchSerperImages, downloadSerperImage, getExtensionFromUrl } from '@/lib/serper/client';
import {
  classifyMedia,
  checkImageForWatermark,
  checkImageRelevance,
} from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import { uploadAudioBuffer, generateStockScraperImageKey, getPublicUrl } from '@/lib/services/r2-storage';
import type { SerperScrapeRequest, SerperScrapeResult, SerperImage } from '@/lib/serper/types';

const QUALITY_THRESHOLD = 6; // Minimum quality rating to keep
const RELEVANCE_THRESHOLD = 5; // Minimum relevance score to keep
const WATERMARK_CONFIDENCE_THRESHOLD = 0.7; // Reject if watermark confidence above this
const DUPLICATE_THRESHOLD = 0.95; // Vector similarity threshold for duplicates

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check API key
    if (!process.env.SERPER_API_KEY) {
      return NextResponse.json(
        { error: 'SERPER_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // 3. Parse request body
    const body: SerperScrapeRequest = await req.json();
    const { query, filters = {}, selectedImageUrls } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`[Serper Scrape] Starting for query: "${query}"`);

    // 4. Get images to process
    let images: SerperImage[];
    if (selectedImageUrls && selectedImageUrls.length > 0) {
      // User selected specific images from preview
      const allImages = await searchSerperImages(query, { ...filters, maxResults: 100 });
      images = allImages.filter(img => selectedImageUrls.includes(img.imageUrl));
    } else {
      images = await searchSerperImages(query, filters);
    }

    console.log(`[Serper Scrape] Processing ${images.length} images`);

    const result: SerperScrapeResult = {
      processed: 0,
      approved: 0,
      rejected: 0,
      stored: [],
      rejectedDetails: [],
    };

    // Use service client for DB operations (bypasses RLS)
    const serviceClient = createServiceClient();

    // 5. Process each image
    for (const image of images) {
      result.processed++;

      try {
        console.log(`[Serper Scrape] Processing ${image.title} (${result.processed}/${images.length})...`);

        // 5a. Watermark Check (FIRST - reject early if watermarked)
        console.log(`[Serper Scrape] Checking for watermarks...`);
        const watermarkResult = await checkImageForWatermark(image.imageUrl, user.id);

        if (watermarkResult.hasWatermark && watermarkResult.confidence >= WATERMARK_CONFIDENCE_THRESHOLD) {
          console.log(`[Serper Scrape] ✗ Watermark detected (${(watermarkResult.confidence * 100).toFixed(0)}% confidence)`);
          result.rejected++;
          result.rejectedDetails?.push({
            imageUrl: image.imageUrl,
            title: image.title,
            reason: `Watermark detected: ${watermarkResult.details}`,
            rejectionType: 'watermark',
            details: {
              confidence: watermarkResult.confidence,
              watermarkDetails: watermarkResult.details,
            },
          });
          continue;
        }

        // 5b. Classify with Gemini 3 Flash
        console.log(`[Serper Scrape] Classifying image...`);
        const classification = await classifyMedia(image.imageUrl, 'image', user.id);
        const qualityRating = classification.classification.qualityRating || 0;

        console.log(`[Serper Scrape] Quality: ${qualityRating}/10`);

        if (qualityRating < QUALITY_THRESHOLD) {
          result.rejected++;
          result.rejectedDetails?.push({
            imageUrl: image.imageUrl,
            title: image.title,
            reason: `Quality rating ${qualityRating} below threshold ${QUALITY_THRESHOLD}`,
            rejectionType: 'quality',
            details: { qualityRating },
          });
          continue;
        }

        // 5c. Relevance Check
        console.log(`[Serper Scrape] Checking relevance to query...`);
        const relevanceResult = await checkImageRelevance(image.imageUrl, query, user.id);

        if (relevanceResult.score < RELEVANCE_THRESHOLD) {
          console.log(`[Serper Scrape] ✗ Low relevance (${relevanceResult.score}/10): ${relevanceResult.reason}`);
          result.rejected++;
          result.rejectedDetails?.push({
            imageUrl: image.imageUrl,
            title: image.title,
            reason: `Low relevance to "${query}": ${relevanceResult.reason}`,
            rejectionType: 'relevance',
            details: {
              relevanceScore: relevanceResult.score,
              relevanceReason: relevanceResult.reason,
            },
          });
          continue;
        }

        // 5d. Download image
        console.log(`[Serper Scrape] Downloading image...`);
        const imageBuffer = await downloadSerperImage(image.imageUrl);
        const extension = getExtensionFromUrl(image.imageUrl);

        // 5e. Upload to R2
        const imageId = `serper-${image.id}-${Date.now()}`;
        const r2Key = generateStockScraperImageKey(imageId, extension);

        await uploadAudioBuffer(imageBuffer, r2Key, `image/${extension === 'jpg' ? 'jpeg' : extension}`);
        const publicUrl = getPublicUrl(r2Key);

        console.log(`[Serper Scrape] Uploaded to R2: ${r2Key}`);

        // 5f. Generate embedding from description
        const embedding = await generateEmbedding(classification.classification.description);

        // 5g. Check for near-duplicates using vector similarity
        const { data: duplicates } = await serviceClient.rpc('match_stock_media', {
          query_embedding: embedding,
          match_threshold: DUPLICATE_THRESHOLD,
          match_count: 1
        });

        if (duplicates && duplicates.length > 0) {
          const existingAsset = duplicates[0];
          console.log(`[Serper Scrape] ✗ Duplicate detected: ${existingAsset.id} (similarity: ${existingAsset.similarity.toFixed(3)})`);

          result.rejected++;
          result.rejectedDetails?.push({
            imageUrl: image.imageUrl,
            title: image.title,
            reason: `Near-duplicate of existing asset (${(existingAsset.similarity * 100).toFixed(1)}% similar)`,
            rejectionType: 'duplicate',
            details: {
              existingAssetId: existingAsset.id,
              similarity: existingAsset.similarity,
            },
          });
          continue;
        }

        // 5h. Store in vector DB
        const { error: dbError } = await serviceClient
          .from('stock_media')
          .insert({
            source: 'serper',
            external_id: image.id,
            r2_key: r2Key,
            metadata: {
              title: image.title,
              description: classification.classification.description,
              tags: [],
              mediaType: 'image',
              width: image.width,
              height: image.height,
              aspectRatio: image.width && image.height
                ? (image.width > image.height ? 'landscape' : image.width < image.height ? 'portrait' : 'square')
                : undefined,
              url: publicUrl,
              thumbnailUrl: image.thumbnailUrl,
              qualityRating,
              mood: classification.classification.mood,
              subjects: (classification.classification as any).subjects || [],
              style: (classification.classification as any).style,
              dominantColors: (classification.classification as any).dominantColors || [],
              sourceUrl: image.sourceUrl,
              sourceDomain: image.source,
              relevanceScore: relevanceResult.score,
            },
            embedding,
          });

        if (dbError) {
          console.error(`[Serper Scrape] DB error for ${image.title}:`, dbError);
          throw dbError;
        }

        result.approved++;
        result.stored.push({
          id: image.id,
          title: image.title,
          r2Key,
          qualityRating,
        });

        console.log(`[Serper Scrape] ✓ Stored ${image.title} (quality: ${qualityRating}, relevance: ${relevanceResult.score})`);

      } catch (imgError) {
        console.error(`[Serper Scrape] Failed to process ${image.title}:`, imgError);
        result.rejected++;
        result.rejectedDetails?.push({
          imageUrl: image.imageUrl,
          title: image.title,
          reason: imgError instanceof Error ? imgError.message : 'Processing failed',
          rejectionType: 'error',
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Serper Scrape] ✓ Complete in ${totalTime}ms - ${result.approved} approved, ${result.rejected} rejected`);

    return NextResponse.json({
      success: true,
      ...result,
      processingTimeMs: totalTime,
    });

  } catch (error) {
    console.error('[Serper Scrape] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
