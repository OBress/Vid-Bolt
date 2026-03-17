/**
 * Stock Media Utilities
 * ==========================================================================
 * Shared utilities for stock media operations used by both the stock-media
 * worker and the StockMediaDirector.
 * 
 * Provides:
 * - Serper image search and download
 * - R2 storage for stock images
 * - Supabase stock_media table operations
 * - Embedding generation for vector search
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  searchSerperImages, 
  downloadSerperImage, 
  getExtensionFromUrl 
} from '@/lib/serper/client';
import { generateEmbedding } from '@/lib/ai/embedding';
import { validateStockImage, classifyAndValidateImage } from '@/lib/classification/media-classifier';
import { 
  uploadAudioBuffer,
  getPublicUrl,
  generateVideoStockImageKey,
  deleteFile,
  getKeyFromUrl,
} from '@/lib/services/r2-storage';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/lib/logger';

const log = createLogger('StockMediaUtils');

// ==========================================================================
// Types
// ==========================================================================

export interface StoredStockImage {
  id: string;
  r2Key: string;
  publicUrl: string;
  title: string;
  query: string;
}

export interface SearchAndStoreResult {
  stored: StoredStockImage[];
  failed: number;
}

// ==========================================================================
// Supabase Client
// ==========================================================================

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

// ==========================================================================
// Embedding Generation
// ==========================================================================

/**
 * Generate embedding for stock media, with error handling.
 * Returns null if embedding generation fails.
 */
async function safeGenerateEmbedding(text: string): Promise<number[] | null> {
  try {
    return await generateEmbedding(text);
  } catch (error) {
    log.error('Embedding generation failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ==========================================================================
// On-Demand Serper Search
// ==========================================================================

/**
 * Search Serper for images matching a query, download them, and store in R2 + Supabase.
 * Used by StockMediaDirector when no existing stock matches a shot.
 * 
 * NO validation is done during storage (lazy validation strategy).
 * 
 * @param query - Search query for the images
 * @param userId - User ID
 * @param videoId - Video project ID
 * @param maxImages - Maximum images to store (default: 5)
 * @returns Object with stored images and failure count
 */
export async function searchAndStoreImages(
  query: string,
  userId: string,
  videoId: string,
  maxImages: number = 5
): Promise<SearchAndStoreResult> {
  const supabase = getSupabaseClient();
  const stored: StoredStockImage[] = [];
  let failed = 0;

  log.debug(`Searching Serper for: "${query}" (max: ${maxImages})`);

  try {
    // Search Serper - try large images first for better quality
    let images = await searchSerperImages(query, {
      maxResults: maxImages + 5, // Fetch extra in case some fail
      size: 'large',
    });

    // Fallback to medium if insufficient large results
    if (images.length < maxImages) {
      log.debug(`Only ${images.length}/${maxImages} large images, trying medium`);
      const mediumImages = await searchSerperImages(query, {
        maxResults: maxImages + 5 - images.length,
        size: 'medium',
      });
      images = [...images, ...mediumImages];
    }

    log.debug(`Found ${images.length} images from Serper (large+medium)`);

    for (const img of images) {
      if (stored.length >= maxImages) break;

      // Skip known problematic URLs (FB/IG CDNs block external access)
      if (
        img.imageUrl.includes('lookaside.instagram.com') ||
        img.imageUrl.includes('fbcdn.net') ||
        img.imageUrl.includes('fbsbx.com') ||
        img.imageUrl.includes('lookaside.facebook.com') ||
        !img.imageUrl.startsWith('http')
      ) {
        continue;
      }

      try {
        // Get file extension and check for supported formats
        const extension = getExtensionFromUrl(img.imageUrl);
        
        // WHITELIST: Only allow formats supported by Google Gemini Flash
        // Supported: PNG, JPEG/JPG, WebP
        // NOT supported for AI analysis: GIF, SVG, BMP, TIFF
        const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
        if (!SUPPORTED_IMAGE_FORMATS.includes(extension.toLowerCase())) {
          log.debug(`Skipping unsupported format: ${extension}`);
          continue;
        }
        
        // Download image
        const imageBuffer = await downloadSerperImage(img.imageUrl);

        // INTEGRITY CHECK: Validate buffer size before API call
        // Corrupted downloads are typically < 5KB, oversized files > 10MB
        if (imageBuffer.length < 5000) {
          log.debug(`Skipping corrupted image (${Math.round(imageBuffer.length / 1024)}KB < 5KB)`);
          continue;
        }
        if (imageBuffer.length > 10 * 1024 * 1024) {
          log.debug(`Skipping oversized image (${Math.round(imageBuffer.length / 1024 / 1024)}MB > 10MB)`);
          continue;
        }

        // Convert buffer to base64 data URL for classification
        // This ensures Google API can determine the MIME type correctly
        const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
        const base64DataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

        // AI CLASSIFICATION: Validate before uploading to R2
        let classification;
        try {
          classification = await classifyAndValidateImage(
            base64DataUrl,
            userId,
            img.width,
            img.height
          );
          
          // If rejected, skip - no R2 upload needed
          if (!classification.isValid) {
            log.debug(`Rejected: ${classification.rejectionReason} - ${classification.rejectionDetails}`);
            failed++;
            continue;
          }
        } catch (classError) {
          log.error('Classification error:', classError instanceof Error ? (classError as Error).message : classError);
          // On classification error, still store with basic metadata
          classification = null;
        }
        
        // UPLOAD TO R2: Only for valid images
        const imageId = `serper-${Date.now()}-${uuidv4().slice(0, 8)}`;
        const r2Key = generateVideoStockImageKey(userId, videoId, imageId, extension);

        await uploadAudioBuffer(imageBuffer, r2Key, mimeType);

        const publicUrl = getPublicUrl(r2Key);

        // Generate embedding from AI classification (much better for search)
        const embeddingText = classification?.embeddingText || `${img.title}. ${query}`;
        const embedding = await safeGenerateEmbedding(embeddingText);

        // Store in DB with AI-enriched metadata
        const { data, error: insertError } = await supabase
          .from('stock_media')
          .insert({
            user_id: userId,
            video_id: videoId,
            source: 'serper',
            external_id: img.id || img.imageUrl,
            r2_key: r2Key,
            metadata: {
              mediaType: 'image',
              title: img.title,
              description: classification?.description || img.title,
              url: publicUrl,
              thumbnailUrl: img.thumbnailUrl || publicUrl,
              source: img.source,
              query,
              width: img.width,
              height: img.height,
              // AI classification data
              ...(classification && {
                aiDescription: classification.description,
                aiSubjects: classification.subjects,
                namedEntities: classification.namedEntities,
                qualityScore: classification.qualityScore,
                resolutionScore: classification.resolutionScore,
              }),
            },
            ...(embedding && { embedding }),
          })
          .select('id')
          .single();

        if (insertError) {
          log.error('DB insert failed:', insertError.message);
          // Try to clean up R2 file
          try {
            await deleteFile(r2Key);
          } catch {}
          failed++;
          continue;
        }

        stored.push({
          id: data.id,
          r2Key,
          publicUrl,
          title: classification?.description || img.title,
          query,
        });

        log.debug(`Stored image: ${imageId} (${classification?.namedEntities?.length || 0} entities)`);
      } catch (_err) {
        failed++;
        // Continue to next image on any error
      }
    }
  } catch (err) {
    log.error('Serper search error:', err instanceof Error ? err.message : err);
  }

  log.info(`Complete: ${stored.length} stored, ${failed} failed`);
  return { stored, failed };
}

// ==========================================================================
// First Match Search (Efficient On-Demand)
// ==========================================================================

/**
 * Search Serper for ONE image that matches a shot requirement.
 * Processes images sequentially and stops immediately on first valid match.
 * 
 * Much more efficient than searchAndStoreImages for on-demand scraping
 * because it avoids downloading/storing extra images that won't be used.
 * 
 * @param query - Search query for the images
 * @param shotDescription - The shot summary to validate against
 * @param userId - User ID
 * @param videoId - Video project ID
 * @param videoContext - Optional video context for holistic relevance decisions
 * @returns First matching image or null if none found
 */
export async function searchAndStoreFirstMatch(
  query: string,
  shotDescription: string,
  userId: string,
  videoId: string,
  videoContext?: {
    videoTopic?: string;
    spineBeats?: string[];
  }
): Promise<StoredStockImage | null> {
  const supabase = getSupabaseClient();

  log.debug(`First-match search for: "${query.substring(0, 50)}..."`);

  try {
    // Search Serper - fetch 10 candidates
    let images = await searchSerperImages(query, {
      maxResults: 10,
      size: 'large',
    });

    // Fallback to medium if insufficient large results
    if (images.length < 5) {
      const mediumImages = await searchSerperImages(query, {
        maxResults: 10 - images.length,
        size: 'medium',
      });
      images = [...images, ...mediumImages];
    }

    log.debug(`Found ${images.length} candidates, validating sequentially`);

    for (const img of images) {
      // Skip known problematic URLs (FB/IG CDNs block external access)
      if (
        img.imageUrl.includes('lookaside.instagram.com') ||
        img.imageUrl.includes('fbcdn.net') ||
        img.imageUrl.includes('fbsbx.com') ||
        img.imageUrl.includes('lookaside.facebook.com') ||
        !img.imageUrl.startsWith('http')
      ) {
        continue;
      }

      try {
        // Get file extension and check for supported formats
        const extension = getExtensionFromUrl(img.imageUrl);
        
        const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
        if (!SUPPORTED_IMAGE_FORMATS.includes(extension.toLowerCase())) {
          continue;
        }
        
        // Download image
        const imageBuffer = await downloadSerperImage(img.imageUrl);

        // Size checks
        if (imageBuffer.length < 5000 || imageBuffer.length > 10 * 1024 * 1024) {
          continue;
        }

        // Convert buffer to base64 for classification
        const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
        const base64DataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

        // STEP 1: Quality classification (watermark, NSFW, etc.)
        let classification;
        try {
          classification = await classifyAndValidateImage(
            base64DataUrl,
            userId,
            img.width,
            img.height
          );
          
          if (!classification.isValid) {
            log.debug(`First-match rejected (quality): ${classification.rejectionReason}`);
            continue;
          }
        } catch {
          continue;
        }

        // STEP 2: Shot relevance validation (does it match the specific shot?)
        try {
          const validation = await validateStockImage(
            base64DataUrl, // Use base64 directly, not a URL
            userId,
            shotDescription,
            undefined, // No r2_key since image isn't stored yet
            videoContext // Pass video context for holistic relevance decisions
          );

          if (!validation.isValid) {
            log.debug(`First-match rejected (relevance): ${validation.failureReason}`);
            continue;
          }
          
          log.info(`First-match found! Relevance: ${validation.relevanceScore}/10`);
        } catch {
          continue;
        }

        // STEP 3: Store the matching image (only if it passed both checks!)
        const imageId = `serper-${Date.now()}-${uuidv4().slice(0, 8)}`;
        const r2Key = generateVideoStockImageKey(userId, videoId, imageId, extension);

        await uploadAudioBuffer(imageBuffer, r2Key, mimeType);
        const publicUrl = getPublicUrl(r2Key);

        // Generate embedding from AI classification
        const embeddingText = classification?.embeddingText || `${img.title}. ${query}`;
        const embedding = await safeGenerateEmbedding(embeddingText);

        // Store in DB
        const { data, error: insertError } = await supabase
          .from('stock_media')
          .insert({
            user_id: userId,
            video_id: videoId,
            source: 'serper',
            external_id: img.id || img.imageUrl,
            r2_key: r2Key,
            metadata: {
              mediaType: 'image',
              title: img.title,
              description: classification?.description || img.title,
              url: publicUrl,
              thumbnailUrl: img.thumbnailUrl || publicUrl,
              source: img.source,
              query,
              width: img.width,
              height: img.height,
              ...(classification && {
                aiDescription: classification.description,
                aiSubjects: classification.subjects,
                namedEntities: classification.namedEntities,
                qualityScore: classification.qualityScore,
                resolutionScore: classification.resolutionScore,
              }),
            },
            ...(embedding && { embedding }),
          })
          .select('id')
          .single();

        if (insertError) {
          try { await deleteFile(r2Key); } catch {}
          continue;
        }

        // SUCCESS! Return immediately
        log.info(`First-match stored: ${imageId}`);
        return {
          id: data.id,
          r2Key,
          publicUrl,
          title: classification?.description || img.title,
          query,
        };
      } catch {
        continue;
      }
    }
  } catch (err) {
    log.error('First-match search error:', err instanceof Error ? err.message : err);
  }

  log.info('First-match: No valid image found');
  return null;
}

// ==========================================================================
// Stock Media Deletion
// ==========================================================================

/**
 * Delete a stock media asset from both Supabase and R2.
 * Used when validation finds an invalid image.
 * 
 * @param stockMediaId - ID from stock_media table
 * @param r2Key - R2 storage key (optional, will be fetched if not provided)
 */
export async function deleteStockMediaAsset(
  stockMediaId: string,
  r2Key?: string
): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    // If r2Key not provided, fetch it first
    if (!r2Key) {
      const { data } = await supabase
        .from('stock_media')
        .select('r2_key')
        .eq('id', stockMediaId)
        .single();
      
      r2Key = data?.r2_key;
    }

    // Delete from Supabase
    const { error: dbError } = await supabase
      .from('stock_media')
      .delete()
      .eq('id', stockMediaId);

    if (dbError) {
      log.error('Failed to delete from DB:', dbError.message);
    }

    // Delete from R2
    if (r2Key) {
      try {
        await deleteFile(r2Key);
        log.debug(`Deleted from R2: ${r2Key}`);
      } catch (r2Error) {
        log.error('Failed to delete from R2:', r2Error instanceof Error ? r2Error.message : r2Error);
      }
    }
  } catch (err) {
    log.error('Delete asset error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Delete a stock media asset by URL (extracts r2Key from URL).
 */
export async function deleteStockMediaByUrl(
  stockMediaId: string,
  publicUrl: string
): Promise<void> {
  const r2Key = getKeyFromUrl(publicUrl);
  await deleteStockMediaAsset(stockMediaId, r2Key);
}
