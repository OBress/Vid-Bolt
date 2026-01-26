import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { 
  classifyMedia,
  checkImageForWatermark,
  checkImageRelevance,
} from '@/lib/classification/media-classifier';
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

// Quality thresholds (matching Serper pipeline)
const QUALITY_THRESHOLD = 5;
const RELEVANCE_THRESHOLD = 5;
const WATERMARK_CONFIDENCE_THRESHOLD = 0.7;
const DUPLICATE_THRESHOLD = 0.95;

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
      query, // Search query for relevance check
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

    // ==========================================================================
    // STEP 1: Watermark Check (on thumbnail for speed)
    // ==========================================================================
    const checkUrl = thumbnailUrl || downloadUrl;
    console.log('[Pexels Process] Step 1: Checking for watermarks...');
    const watermarkResult = await checkImageForWatermark(checkUrl, user.id);

    if (watermarkResult.hasWatermark && watermarkResult.confidence >= WATERMARK_CONFIDENCE_THRESHOLD) {
      console.log(`[Pexels Process] ✗ Watermark detected (${(watermarkResult.confidence * 100).toFixed(0)}% confidence)`);
      return NextResponse.json({ 
        success: false, 
        rejected: true,
        rejectionType: 'watermark',
        reason: `Watermark detected: ${watermarkResult.details || 'Stock agency or copyright watermark'}`,
        confidence: watermarkResult.confidence
      });
    }

    // ==========================================================================
    // STEP 2: Quality Classification
    // ==========================================================================
    console.log('[Pexels Process] Step 2: Classifying quality...');
    const classificationResult = await classifyMedia(downloadUrl, internalMediaType, user.id);
    const quality = classificationResult.classification.qualityRating || 0;

    if (quality < QUALITY_THRESHOLD) {
      console.log(`[Pexels Process] ✗ Quality too low (${quality}/10)`);
      return NextResponse.json({ 
        success: false, 
        rejected: true,
        rejectionType: 'quality',
        reason: `Quality rating too low (${quality}/10, minimum ${QUALITY_THRESHOLD})`,
        classification: classificationResult
      });
    }

    console.log(`[Pexels Process] ✓ Quality passed (${quality}/10)`);

    // ==========================================================================
    // STEP 3: Relevance Check (if query provided)
    // ==========================================================================
    if (query) {
      console.log('[Pexels Process] Step 3: Checking relevance...');
      const relevanceResult = await checkImageRelevance(checkUrl, query, user.id);

      if (relevanceResult.score < RELEVANCE_THRESHOLD) {
        console.log(`[Pexels Process] ✗ Low relevance (${relevanceResult.score}/10): ${relevanceResult.reason}`);
        return NextResponse.json({ 
          success: false, 
          rejected: true,
          rejectionType: 'relevance',
          reason: `Low relevance to "${query}": ${relevanceResult.reason}`,
          relevanceScore: relevanceResult.score
        });
      }

      console.log(`[Pexels Process] ✓ Relevance passed (${relevanceResult.score}/10)`);
    }

    // ==========================================================================
    // STEP 4: Download and Upload to R2
    // ==========================================================================
    console.log('[Pexels Process] Step 4: Downloading asset...');
    const assetRes = await fetch(downloadUrl);
    if (!assetRes.ok) throw new Error(`Failed to download asset: ${assetRes.statusText}`);
    const assetBuffer = Buffer.from(await assetRes.arrayBuffer());
    const contentType = assetRes.headers.get('content-type') || (internalMediaType === 'video' ? 'video/mp4' : 'image/jpeg');

    let r2Key: string;
    if (internalMediaType === 'image') {
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      r2Key = generateStockScraperImageKey(`pexels_${id}`, ext);
    } else {
      r2Key = generateStockScraperClipKey(`pexels_${id}`);
    }

    await uploadBuffer(assetBuffer, r2Key, contentType);
    console.log(`[Pexels Process] ✓ Uploaded to R2: ${r2Key}`);

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

    // ==========================================================================
    // STEP 5: Duplicate Detection + Vector DB Storage
    // ==========================================================================
    console.log('[Pexels Process] Step 5: Checking for duplicates...');
    const description = classificationResult.classification.description;
    const embedding = await generateEmbedding(description);

    const serviceClient = createServiceClient();
    const { data: duplicates } = await serviceClient.rpc('match_stock_media', {
      query_embedding: embedding,
      match_threshold: DUPLICATE_THRESHOLD,
      match_count: 1
    });

    if (duplicates && duplicates.length > 0) {
      const existingAsset = duplicates[0];
      console.log(`[Pexels Process] ✗ Duplicate detected: ${existingAsset.id} (similarity: ${existingAsset.similarity.toFixed(3)})`);
      
      return NextResponse.json({
        success: false,
        duplicate: true,
        rejectionType: 'duplicate',
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
      tags: [],
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

    console.log(`[Pexels Process] ✓ Stored ${metadata.title} (quality: ${quality})`);

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

