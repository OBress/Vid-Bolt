import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyMedia } from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import { 
  uploadAudioBuffer, // reusing generic upload capability, though we might want generic buffer upload
  generateStockScraperImageKey, 
  generateStockScraperClipKey,
  generateStockScraperClipThumbnailKey,
  getS3Client,
  getBucketName,
  getPublicUrl
} from '@/lib/services/r2-storage';
import { PutObjectCommand } from "@aws-sdk/client-s3";

// Helper to upload buffer since r2-storage's uploadAudioBuffer sets audio/mpeg
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
      mediaUrl, 
      mediaType, 
      downloadUrl, // For videos, this is the actual file URL. For images, usually same as mediaUrl or largeImageURL
      thumbnailUrl, 
      title, 
      tags 
    } = body;

    if (!id || !mediaUrl || !mediaType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[Pixabay Process] Processing ${mediaType} ${id} from ${mediaUrl}`);

    // 1. Classify first (using external URL) to check quality
    // This saves bandwidth/storage if quality is low
    console.log('[Pixabay Process] Classifying...');
    const classificationResult = await classifyMedia(mediaUrl, mediaType, user.id);
    const quality = classificationResult.classification.qualityRating || 0;

    // Quality Check
    if (quality < 5) {
      return NextResponse.json({ 
        success: false, 
        rejected: true, 
        reason: `Quality rating too low (${quality}/10)`,
        classification: classificationResult
      });
    }

    console.log(`[Pixabay Process] Quality passed (${quality}/10). Downloading...`);

    // 2. Download the asset
    const assetUrl = downloadUrl || mediaUrl;
    const assetRes = await fetch(assetUrl);
    if (!assetRes.ok) throw new Error(`Failed to download asset: ${assetRes.statusText}`);
    const assetBuffer = Buffer.from(await assetRes.arrayBuffer());
    const contentType = assetRes.headers.get('content-type') || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

    // 3. Upload to R2
    let r2Key;
    if (mediaType === 'image') {
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      r2Key = generateStockScraperImageKey(id.toString(), ext);
    } else {
      r2Key = generateStockScraperClipKey(`pixabay_${id}`);
    }

    await uploadBuffer(assetBuffer, r2Key, contentType);
    console.log(`[Pixabay Process] Uploaded to R2: ${r2Key}`);

    // If video, we might want to upload thumbnail too if provided
    let storedThumbnailUrl = thumbnailUrl;
    if (mediaType === 'video' && thumbnailUrl) {
      try {
        const thumbRes = await fetch(thumbnailUrl);
        if (thumbRes.ok) {
          const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
          const thumbKey = generateStockScraperClipThumbnailKey(`pixabay_${id}`);
          await uploadBuffer(thumbBuffer, thumbKey, 'image/jpeg');
          storedThumbnailUrl = getPublicUrl(thumbKey);
        }
      } catch (e) {
        console.warn('Failed to store thumbnail, using original URL as fallback', e);
      }
    }

    // 4. Index in DB
    const description = classificationResult.classification.description;
    const embedding = await generateEmbedding(description);

    // Prepare metadata
    const metadata: any = {
      title: title || `Pixabay ${mediaType} ${id}`,
      description: description,
      tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
      mediaType,
      qualityRating: quality,
      mood: classificationResult.classification.mood,
      source: 'pixabay',
      originalUrl: mediaUrl,
      thumbnailUrl: storedThumbnailUrl, // Use R2 URL if video thumb stored, or original
      width: body.width,
      height: body.height,
      duration: body.duration,
    };

    if (mediaType === 'image') {
      const imgClass = classificationResult.classification as any;
      metadata.subjects = imgClass.subjects;
      metadata.style = imgClass.style;
    } else {
      const vidClass = classificationResult.classification as any;
      metadata.subjects = vidClass.subjects;
      metadata.sceneTypes = vidClass.sceneTypes;
    }

    const { data: record, error: dbError } = await supabase
      .from('stock_media')
      .insert({
        source: 'pixabay',
        external_id: `pixabay_${id}`,
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
    console.error('[Pixabay Process] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
