import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { classifyMedia } from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import { 
  generateStockScraperImageKey, 
  generateStockScraperClipKey,
  generateStockScraperClipThumbnailKey,
  getS3Client,
  getBucketName,
  getPublicUrl
} from '@/lib/services/r2-storage';
import { PutObjectCommand } from "@aws-sdk/client-s3";

// Helper to upload buffer with correct content type
async function uploadBuffer(buffer: Buffer, key: string, contentType: string) {
  const client = getS3Client();
  const bucketName = getBucketName();
  
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  return getPublicUrl(key);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      id, 
      mediaUrl, // Pexels page URL
      mediaType, // 'photo' or 'video'
      downloadUrl, // Actual file URL (src.original for photos, video_files[].link for videos)
      thumbnailUrl, 
      photographer,
      alt,
      width,
      height,
      duration,
    } = body;

    if (!id || !mediaUrl || !mediaType || !downloadUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Map Pexels mediaType to our internal type
    const internalMediaType = mediaType === 'video' ? 'video' : 'image';

    console.log(`[Pexels Process] Processing ${internalMediaType} ${id} from ${mediaUrl}`);

    // 1. Classify first (using external URL) to check quality
    // This saves bandwidth/storage if quality is low
    console.log('[Pexels Process] Classifying...');
    const classificationResult = await classifyMedia(downloadUrl, internalMediaType, user.id);
    const quality = classificationResult.classification.qualityRating || 0;

    // Quality Check - Same threshold as Pixabay
    if (quality < 5) {
      return NextResponse.json({ 
        success: false, 
        rejected: true, 
        reason: `Quality rating too low (${quality}/10)`,
        classification: classificationResult
      });
    }

    console.log(`[Pexels Process] Quality passed (${quality}/10). Downloading...`);

    // 2. Download the asset
    const assetRes = await fetch(downloadUrl);
    if (!assetRes.ok) throw new Error(`Failed to download asset: ${assetRes.statusText}`);
    const assetBuffer = Buffer.from(await assetRes.arrayBuffer());
    const contentType = assetRes.headers.get('content-type') || (internalMediaType === 'video' ? 'video/mp4' : 'image/jpeg');

    // 3. Upload to R2
    let r2Key: string;
    if (internalMediaType === 'image') {
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      r2Key = generateStockScraperImageKey(`pexels_${id}`, ext);
    } else {
      r2Key = generateStockScraperClipKey(`pexels_${id}`);
    }

    await uploadBuffer(assetBuffer, r2Key, contentType);
    console.log(`[Pexels Process] Uploaded to R2: ${r2Key}`);

    // If video, upload thumbnail too
    let storedThumbnailUrl = thumbnailUrl;
    if (internalMediaType === 'video' && thumbnailUrl) {
      try {
        const thumbRes = await fetch(thumbnailUrl);
        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
          const thumbKey = generateStockScraperClipThumbnailKey(`pexels_${id}`);
          await uploadBuffer(thumbBuffer, thumbKey, 'image/jpeg');
          storedThumbnailUrl = getPublicUrl(thumbKey);
        }
      } catch (e) {
        console.warn('[Pexels Process] Failed to store thumbnail, using original URL', e);
      }
    }

    // 4. Index in DB
    const description = classificationResult.classification.description;
    const embedding = await generateEmbedding(description);

    // 4a. Check for near-duplicates using vector similarity
    // Use service client for stock_media operations (RLS requires service_role)
    const serviceClient = createServiceClient();
    const DUPLICATE_THRESHOLD = 0.95;
    const { data: duplicates } = await serviceClient.rpc('match_stock_media', {
      query_embedding: embedding,
      match_threshold: DUPLICATE_THRESHOLD,
      match_count: 1
    });

    if (duplicates && duplicates.length > 0) {
      const existingAsset = duplicates[0];
      console.log(`[Pexels Process] Duplicate detected: ${existingAsset.id} (similarity: ${existingAsset.similarity.toFixed(3)})`);
      
      return NextResponse.json({
        success: false,
        duplicate: true,
        reason: `Near-duplicate of existing asset (${(existingAsset.similarity * 100).toFixed(1)}% similar)`,
        existingAsset: {
          id: existingAsset.id,
          r2Key: existingAsset.r2_key,
          metadata: existingAsset.metadata,
          similarity: existingAsset.similarity
        }
      });
    }

    // Prepare metadata
    const metadata: Record<string, any> = {
      title: alt || `Pexels ${internalMediaType} ${id}`,
      description: description,
      tags: [], // Pexels doesn't provide tags in search response
      mediaType: internalMediaType,
      qualityRating: quality,
      mood: classificationResult.classification.mood,
      source: 'pexels',
      originalUrl: mediaUrl,
      thumbnailUrl: storedThumbnailUrl,
      photographer,
      width,
      height,
      duration,
    };

    if (internalMediaType === 'image') {
      const imgClass = classificationResult.classification as any;
      metadata.subjects = imgClass.subjects;
      metadata.style = imgClass.style;
      metadata.dominantColors = imgClass.dominantColors;
    } else {
      const vidClass = classificationResult.classification as any;
      metadata.subjects = vidClass.subjects;
      metadata.sceneTypes = vidClass.sceneTypes;
    }

    const { data: record, error: dbError } = await serviceClient
      .from('stock_media')
      .insert({
        source: 'pexels',
        external_id: `pexels_${id}`,
        r2_key: r2Key,
        metadata,
        embedding
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({
      success: true,
      id: record.id,
      classification: classificationResult,
      qualityRating: quality
    });

  } catch (error) {
    console.error('[Pexels Process] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
