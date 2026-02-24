/**
 * Stock Media Scrape Worker
 * ==========================================================================
 * BullMQ worker that processes stock media collection jobs.
 * Searches Serper for images, Pexels for videos, YouTube for clips,
 * classifies all with AI, and stores in R2 + Vector DB.
 */

import { Job } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { 
  classifyAndValidateImage,
} from '@/lib/classification/media-classifier';
import type { ClassificationResult, ImageClassification, VideoClassification } from '@/lib/classification/types';
import { generateEmbedding } from '@/lib/ai/embedding';
import { searchSerperImages, downloadSerperImage, getExtensionFromUrl } from '@/lib/serper/client';
import { YouTubeApi } from '@/lib/youtube/api';
import { selectBestVideo } from '@/lib/youtube/youtube-ranker';
import type { MediaDensityLevel } from '@/lib/query-generator/types';
import { 
  uploadAudioBuffer,
  getPublicUrl,
  generateVideoStockImageKey,
} from '@/lib/services/r2-storage';
import { v4 as uuidv4 } from 'uuid';
import { CostTracker } from '@/lib/queues/cost-tracker';

// ==========================================================================
// Types
// ==========================================================================

export interface StockMediaJobData {
  userId: string;
  videoId: string;
  taskId: string;
  level: 'standard' | 'extensive';
  mediaDensity: MediaDensityLevel;
  searchQueries: string[];
  topic: string;
  outlineAssets?: any;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  source: 'serper' | 'pexels' | 'youtube';
  url: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  duration?: number;
  r2Key?: string;
  qualityRating?: number;
  classification?: any;
  segmentJobId?: string; // For YouTube videos that are queued for segmentation
}

export interface StockMediaJobResult {
  videoId: string;
  media: MediaItem[];
  stats: {
    serperImages: number;
    pexelsVideos: number;
    youtubeClips: number;
    classified: number;
    stored: number;
    rejected: number;
  };
}

// ==========================================================================
// Configuration
// ==========================================================================

const _QUALITY_THRESHOLD = 5;
const _RELEVANCE_THRESHOLD = 5;
const _WATERMARK_CONFIDENCE_THRESHOLD = 0.7;

// Quotas by level - focused on quality over quantity
// Stock media is supplementary to motion graphics and 3D animation
const BASE_QUOTAS = {
  standard: { 
    maxImagesPerQuery: 3,    // Take max 3 valid images per query, then move on
    maxVideosPerQuery: 2,    // Take max 2 valid videos per query
    youtubeClips: 0,         // No YouTube for standard
    maxQueriesSearched: 10,  // Search up to 10 queries
    resultsToCheck: 10,      // Only check first 10 results per query
  },
  extensive: { 
    maxImagesPerQuery: 3,    // Take max 3 valid images per query
    maxVideosPerQuery: 2,    // Take max 2 valid videos per query
    youtubeClips: 3,         // Up to 3 YouTube clips
    maxQueriesSearched: 15,  // Search up to 15 queries
    resultsToCheck: 10,      // Only check first 10 results per query
  },
};

// Check if embedding is available
function isEmbeddingConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_WORKER_API_TOKEN);
}

// Safe embedding - returns null if not configured
async function safeGenerateEmbedding(text: string): Promise<number[] | null> {
  if (!isEmbeddingConfigured()) {
    console.log('[StockMediaWorker] Embedding skipped - Cloudflare not configured');
    return null;
  }
  try {
    return await generateEmbedding(text);
  } catch (err) {
    console.warn('[StockMediaWorker] Embedding failed:', err);
    return null;
  }
}

// ==========================================================================
// Helpers
// ==========================================================================

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

async function updateTaskProgress(
  supabase: ReturnType<typeof getSupabaseClient>,
  taskId: string,
  progress: number,
  phase: string,
  step: string
) {
  const { error } = await supabase
    .from('tasks')
    .update({
      progress_percent: progress,
      current_phase: phase,
      current_step: step,
      status: 'running',
    })
    .eq('id', taskId);
  
  if (error) {
    console.error(`[StockMediaWorker] Failed to update task progress: ${error.message}`, {
      taskId,
      progress,
      phase,
      step,
      code: error.code,
      details: error.details,
    });
  } else {
    console.log(`[StockMediaWorker] Task progress updated: ${progress}% - ${phase}: ${step}`);
  }
}

// Helper to extract classification data safely
function _getClassificationData(result: ClassificationResult) {
  const cls = result.classification as ImageClassification | VideoClassification;
  return {
    description: cls.description,
    qualityRating: cls.qualityRating,
    subjects: cls.subjects,
    mood: cls.mood,
  };
}

// ==========================================================================
// Processor
// ==========================================================================

export async function stockMediaProcessor(
  job: Job<StockMediaJobData>
): Promise<StockMediaJobResult> {
  const { userId, videoId, taskId, level, mediaDensity, searchQueries, topic } = job.data;
  
  // Determine if we should include video sources based on media density
  const includeVideos = mediaDensity !== 'images_only';
  const startTime = Date.now();
  const supabase = getSupabaseClient();
  
  // Cost tracking for Step 2 (Stock Media)
  const costTracker = new CostTracker(2);
  let serperSearchCount = 0;
  
  console.log(`[StockMediaWorker] Starting job ${job.id} for video ${videoId} (${level})`);
  
  const allMedia: MediaItem[] = [];
  const stats = {
    serperImages: 0,
    pexelsVideos: 0,
    youtubeClips: 0,
    classified: 0,
    stored: 0,
    rejected: 0,
  };
  
  const baseQuotas = BASE_QUOTAS[level];
  
  // Limits are now per-query based - we take max N items per query then move on
  const queryCount = searchQueries.length;
  const limits = {
    maxImagesPerQuery: baseQuotas.maxImagesPerQuery,  // Take max 3 valid images per query
    maxVideosPerQuery: baseQuotas.maxVideosPerQuery,  // Take max 2 valid videos per query
    youtubeClips: baseQuotas.youtubeClips,
    maxQueriesSearched: Math.min(queryCount, baseQuotas.maxQueriesSearched),
    resultsToCheck: baseQuotas.resultsToCheck,        // Only check first 10 results
  };
  
  const expectedImages = limits.maxQueriesSearched * limits.maxImagesPerQuery;
  const expectedVideos = limits.maxQueriesSearched * limits.maxVideosPerQuery;
  console.log(`[StockMediaWorker] Queries: ${queryCount}, Limits: ${limits.maxImagesPerQuery} imgs/query, ${limits.maxVideosPerQuery} vids/query`);
  console.log(`[StockMediaWorker] Expected max: ~${expectedImages} images, ~${expectedVideos} videos`);
  
  try {
    // ========================================================================
    // PHASE 1: Serper Images (0-30%)
    // ========================================================================
    await updateTaskProgress(supabase, taskId, 5, 'image_generation', 'Searching for images...');
    console.log('[StockMediaWorker] Phase 1: Serper Images');
    
    const maxQueries = limits.maxQueriesSearched;
    console.log(`[StockMediaWorker] Serper: Searching ${maxQueries} queries, checking first ${limits.resultsToCheck} results each`);
    
    for (let i = 0; i < maxQueries; i++) {
      const query = searchQueries[i];
      const progress = 5 + Math.floor((i / maxQueries) * 25);
      await updateTaskProgress(supabase, taskId, progress, 'image_generation', `Searching: ${query}`);
      
      try {
        const images = await searchSerperImages(query, {
          maxResults: limits.resultsToCheck,  // Only check first 10 results
          // Don't filter by size - allow medium and large images
        });
        serperSearchCount++; // Track Serper API calls
        
        let imagesFromThisQuery = 0;  // Track images collected from this query
        let imagesChecked = 0;  // Track total images checked (for limiting API calls)
        
        for (const img of images) {
          if (imagesFromThisQuery >= 5) break; // Hard limit: 5 accepted per query
          if (imagesChecked >= 10) break; // Hard limit: 10 checked per query to control API costs
          
          try {
            // Skip known problematic URLs
            if (img.imageUrl.includes('lookaside.instagram.com') || 
                img.imageUrl.includes('fbcdn.net') ||
                !img.imageUrl.startsWith('http')) {
              continue;
            }
            
            imagesChecked++;
            
            // Get file extension and check for supported formats
            const extension = getExtensionFromUrl(img.imageUrl);
            
            // WHITELIST: Only allow formats supported by Google Gemini Flash
            // Supported: PNG, JPEG/JPG, WebP
            // NOT supported for AI analysis: GIF, SVG, BMP, TIFF
            const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
            if (!SUPPORTED_IMAGE_FORMATS.includes(extension.toLowerCase())) {
              console.log(`[StockMediaWorker] Skipping unsupported format: ${extension}`);
              continue;
            }
            
            // Download image first
            let imageBuffer: Buffer;
            try {
              imageBuffer = await downloadSerperImage(img.imageUrl);
            } catch (_e) {
              continue; // Skip failed downloads silently
            }
            
            // INTEGRITY CHECK: Validate buffer size before API call
            // Corrupted downloads are typically < 5KB, oversized files > 10MB
            if (imageBuffer.length < 5000) {
              console.log(`[StockMediaWorker] Skipping corrupted image (${Math.round(imageBuffer.length / 1024)}KB < 5KB)`);
              continue;
            }
            if (imageBuffer.length > 10 * 1024 * 1024) {
              console.log(`[StockMediaWorker] Skipping oversized image (${Math.round(imageBuffer.length / 1024 / 1024)}MB > 10MB)`);
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
                console.log(`[StockMediaWorker] Rejected: ${classification.rejectionReason} - ${classification.rejectionDetails}`);
                stats.rejected++;
                continue;
              }
            } catch (classError) {
              console.error(`[StockMediaWorker] Classification error:`, classError);
              // On classification error, still store with basic metadata
              classification = null;
            }
            
            // UPLOAD TO R2: Only for valid images
            const imageId = `serper-${Date.now()}-${uuidv4().slice(0, 8)}`;
            const r2Key = generateVideoStockImageKey(userId, videoId, imageId, extension);
            
            try {
              await uploadAudioBuffer(imageBuffer, r2Key, mimeType);
            } catch (e) {
              console.error(`[StockMediaWorker] R2 upload failed:`, e);
              continue;
            }
            
            const publicUrl = getPublicUrl(r2Key);
            
            // Generate embedding from AI classification (much better for search)
            const embeddingText = classification?.embeddingText || `${img.title}. ${query}`;
            const embedding = await safeGenerateEmbedding(embeddingText);
            
            // Store in DB with AI-enriched metadata
            const { error: insertError } = await supabase.from('stock_media').insert({
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
            });
            
            if (insertError) {
              console.error(`[StockMediaWorker] DB insert failed for image:`, insertError.message);
              continue;
            }
            
            allMedia.push({
              id: uuidv4(),
              type: 'image',
              source: 'serper',
              url: publicUrl,
              thumbnailUrl: img.thumbnailUrl || publicUrl,
              title: classification?.description || img.title,
              r2Key,
            });
            
            stats.serperImages++;
            stats.stored++;
            stats.classified++;
            imagesFromThisQuery++;
          } catch (_err) {
            // Continue to next image on any error
          }
        }
        
        // No hard cap - continue searching queries
      } catch (err) {
        console.error(`[StockMediaWorker] Serper search error for "${query}":`, err);
      }
    }
    
    console.log(`[StockMediaWorker] Serper complete: ${stats.serperImages} images`);
    
    // ========================================================================
    // PHASE 2: Pexels Videos - DISABLED
    // Pexels returns generic stock footage (sea lions, couples on beach) that
    // doesn't match specific queries like "Jamie Dimon" or "Bear Stearns".
    // Better to leave generic video needs for AI generation/motion graphics.
    // ========================================================================
    console.log('[StockMediaWorker] Phase 2: Pexels SKIPPED (returns irrelevant generic footage)');
    
    // NOTE: If you need to re-enable Pexels for truly generic queries like
    // "aerial city drone shot" or "abstract motion graphics", uncomment below:
    /*
    if (limits.maxVideosPerQuery > 0) {
      await updateTaskProgress(supabase, taskId, 32, 'video_generation', 'Searching for videos...');
      console.log(`[StockMediaWorker] Phase 2: Pexels Videos (max ${limits.maxVideosPerQuery} per query)`);
      
      const pexelsApiKey = process.env.PEXELS_API_KEY;
      if (!pexelsApiKey) {
        console.warn('[StockMediaWorker] Pexels API key not configured, skipping');
      } else {
        const pexelsApi = new PexelsApi(pexelsApiKey);
        
        const pexelsQueryCount = Math.min(searchQueries.length, 4); // Search up to 4 queries
        for (let i = 0; i < pexelsQueryCount; i++) {
          const query = searchQueries[i];
          const progress = 32 + Math.floor((i / pexelsQueryCount) * 18);
          await updateTaskProgress(supabase, taskId, progress, 'video_generation', `Searching: ${query}`);
          
          try {
            const videosResponse = await pexelsApi.searchVideos({
              query,
              mediaType: 'video',
              maxResults: limits.resultsToCheck,
            });
            
            let videosFromThisQuery = 0;  // Track videos collected from this query
            for (const video of videosResponse.videos) {
              try {
                // Get best quality video file
                const videoFile = video.video_files.find(f => f.quality === 'hd') 
                  || video.video_files[0];
                
                if (!videoFile) continue;
                
                // Classify video thumbnail
                const thumbnailUrl = video.image;
                const classResult = await classifyMedia(thumbnailUrl, 'image', userId);
                const classData = getClassificationData(classResult);
                
                if (classData.qualityRating < QUALITY_THRESHOLD) {
                  stats.rejected++;
                  continue;
                }
                stats.classified++;
                
                // Generate embedding and store
                const embedding = await safeGenerateEmbedding(classData.description);
                const { error: pexelsInsertError } = await supabase.from('stock_media').insert({
                  user_id: userId,
                  video_id: videoId,
                  source: 'pexels',
                  external_id: String(video.id),
                  metadata: {
                    mediaType: 'video',
                    title: `Pexels Video ${video.id}`,
                    description: classData.description,
                    url: videoFile.link,
                    thumbnailUrl,
                    duration: video.duration,
                    width: videoFile.width,
                    height: videoFile.height,
                    qualityRating: classData.qualityRating,
                    photographer: video.user?.name,
                  },
                  ...(embedding && { embedding }),
                });
                
                if (pexelsInsertError) {
                  console.error(`[StockMediaWorker] DB insert failed for pexels video:`, pexelsInsertError.message);
                  continue;
                }
                
                allMedia.push({
                  id: uuidv4(),
                  type: 'video',
                  source: 'pexels',
                  url: videoFile.link,
                  thumbnailUrl,
                  title: `Pexels Video ${video.id}`,
                  description: classData.description,
                  duration: video.duration,
                  qualityRating: classData.qualityRating,
                  classification: classData,
                });
                
                stats.pexelsVideos++;
                stats.stored++;
                videosFromThisQuery++;
                
                // Take max N videos per query, then move on
                if (videosFromThisQuery >= limits.maxVideosPerQuery) {
                  console.log(`[StockMediaWorker] Reached ${limits.maxVideosPerQuery} videos for query "${query}", moving on`);
                  break;
                }
              } catch (err) {
                console.warn(`[StockMediaWorker] Error processing Pexels video: ${err}`);
                stats.rejected++;
              }
            }
            
            // Continue to next query
          } catch (err) {
            console.error(`[StockMediaWorker] Pexels search error for "${query}":`, err);
          }
        }
      }
      
      console.log(`[StockMediaWorker] Pexels complete: ${stats.pexelsVideos} videos`);
    }
    */ // END PEXELS DISABLED BLOCK
    
    // ========================================================================
    // PHASE 3: YouTube (50-90%)
    // ========================================================================
    if (limits.youtubeClips > 0 && includeVideos) {
      await updateTaskProgress(supabase, taskId, 52, 'video_generation', 'Connecting to YouTube...');
      console.log('[StockMediaWorker] Phase 3: YouTube Videos');
      
      try {
        // Import and use the proper token refresh utility
        const { getValidGCPToken } = await import('@/lib/gcp/token-refresh');
        
        console.log(`[StockMediaWorker] YouTube: Getting GCP token for user ${userId}`);
        
        let accessToken: string;
        try {
          accessToken = await getValidGCPToken(userId);
          console.log(`[StockMediaWorker] ✅ Got valid GCP token: ${accessToken.slice(0, 15)}...`);
        } catch (tokenError: any) {
          console.warn(`[StockMediaWorker] ❌ GCP token error: ${tokenError.message}`);
          console.warn('[StockMediaWorker] User needs to connect GCP account via /settings/integrations');
          throw tokenError; // Skip YouTube if no token
        }
        
        const youtubeApi = new YouTubeApi(accessToken);
        
        // Search for videos
        await updateTaskProgress(supabase, taskId, 55, 'video_generation', 'Searching YouTube...');
        const mainQuery = topic || searchQueries[0];
        const searchResult = await youtubeApi.searchVideos({
          query: mainQuery,
          maxResults: 15, // Get more results to pick from
          videoDuration: 'medium', // 4-20 minutes
          videoDefinition: 'high',
        });
        
        console.log(`[StockMediaWorker] YouTube search: ${searchResult.hits.length} results`);
        
        // Get details for top results
        await updateTaskProgress(supabase, taskId, 60, 'video_generation', 'Getting video details...');
        const videosWithDetails = await Promise.all(
          searchResult.hits.slice(0, 8).map(async (hit) => {
            const details = await youtubeApi.getVideoDetails(hit.id);
            return details ? {
              id: hit.id,
              title: details.title,
              description: details.description,
              channelTitle: details.channelTitle,
              viewCount: details.viewCount,
              durationSeconds: details.durationSeconds,
              thumbnailUrl: details.thumbnailUrl,
            } : null;
          })
        );
        
        const validVideos = videosWithDetails.filter(Boolean) as any[];
        
        // Use AI to select best 3 videos (not just 1)
        await updateTaskProgress(supabase, taskId, 70, 'video_generation', 'Selecting best videos...');
        const selectedResult = await selectBestVideo(validVideos, mainQuery, userId, 3); // Request top 3
        
        // Get segment queue for queueing jobs
        const { videoSegmentationQueue } = await import('@/lib/queues/queues');
        
        // Process up to 3 videos
        const videosToProcess = selectedResult 
          ? (Array.isArray(selectedResult) ? selectedResult : [selectedResult]).slice(0, 3)
          : [];
        
        console.log(`[StockMediaWorker] Queueing ${videosToProcess.length} YouTube videos for segmentation`);
        
        // Track segmentation jobs to wait for
        const segmentJobs: { jobId: string; videoTitle: string }[] = [];
        
        for (let i = 0; i < videosToProcess.length; i++) {
          const { video, validation } = videosToProcess[i];
          const progress = 55 + Math.floor((i / videosToProcess.length) * 5);
          await updateTaskProgress(supabase, taskId, progress, 'video_generation', `Queueing: ${video.title.slice(0, 30)}...`);
          
          // Generate unique ID for this source video
          const sourceId = `yt-${video.id}-${Date.now()}`;
          const jobId = `stock-scrape-${taskId}-${video.id}`;
          
          // Queue segmentation job (same as Stock Scraper Classify tab)
          // This will: download, transcribe, analyze scenes, extract clips, upload to R2
          const segmentJob = await videoSegmentationQueue.add('segment', {
            userId,
            videoId: sourceId,
            sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
            targetClipDuration: { min: 5, max: 15 }, // 5-15 second clips
            parentProjectVideoId: videoId, // Link to parent video project for per-video storage
          }, {
            jobId,
          });
          
          segmentJobs.push({ jobId: segmentJob.id!, videoTitle: video.title });
          console.log(`[StockMediaWorker] Queued segmentation job ${segmentJob.id} for: ${video.title}`);
          
          // Store reference to the video (clips will be stored by segmentation worker)
          const embedding = await safeGenerateEmbedding(
            `${video.title}. ${video.description?.slice(0, 200) || ''}`
          );
          
          const { error: ytInsertError } = await supabase.from('stock_media').insert({
            user_id: userId,
            video_id: videoId,
            source: 'youtube',
            external_id: video.id,
            metadata: {
              mediaType: 'video',
              title: video.title,
              description: video.description?.slice(0, 500),
              url: `https://www.youtube.com/watch?v=${video.id}`,
              thumbnailUrl: video.thumbnailUrl,
              duration: video.durationSeconds,
              channelTitle: video.channelTitle,
              viewCount: video.viewCount,
              segmentJobId: segmentJob.id, // Track the segmentation job
              validation,
            },
            ...(embedding && { embedding }),
          });
          
          if (ytInsertError) {
            console.error(`[StockMediaWorker] DB insert failed for youtube video:`, ytInsertError.message);
          }
          
          allMedia.push({
            id: uuidv4(),
            type: 'video',
            source: 'youtube',
            url: `https://www.youtube.com/watch?v=${video.id}`,
            thumbnailUrl: video.thumbnailUrl,
            title: video.title,
            description: video.description?.slice(0, 200),
            duration: video.durationSeconds,
            segmentJobId: segmentJob.id,
          });
          
          stats.youtubeClips++;
          stats.stored++;
        }
        
        // Wait for all segmentation jobs to complete
        if (segmentJobs.length > 0) {
          console.log(`[StockMediaWorker] Waiting for ${segmentJobs.length} segmentation jobs to complete...`);
          await updateTaskProgress(supabase, taskId, 60, 'video_generation', `Processing ${segmentJobs.length} YouTube videos...`);
          
          const { Job } = await import('bullmq');
          const { getRedisConnection: _getRedisConnection } = await import('@/lib/queues/redis');
          
          for (let i = 0; i < segmentJobs.length; i++) {
            const { jobId, videoTitle } = segmentJobs[i];
            const progress = 60 + Math.floor(((i + 1) / segmentJobs.length) * 30);
            await updateTaskProgress(supabase, taskId, progress, 'video_generation', `Segmenting: ${videoTitle.slice(0, 25)}...`);
            
            // Wait for job to complete (timeout after 10 minutes per video)
            const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
            const POLL_INTERVAL_MS = 5000; // Check every 5 seconds
            const startWait = Date.now();
            
            while (Date.now() - startWait < MAX_WAIT_MS) {
              const job = await Job.fromId(videoSegmentationQueue, jobId);
              if (!job) {
                console.warn(`[StockMediaWorker] Job ${jobId} not found, may have been removed`);
                break;
              }
              
              const state = await job.getState();
              if (state === 'completed') {
                console.log(`[StockMediaWorker] ✓ Segmentation complete for: ${videoTitle}`);
                break;
              } else if (state === 'failed') {
                console.warn(`[StockMediaWorker] ✗ Segmentation failed for: ${videoTitle}`);
                break;
              }
              
              // Still processing - wait and check again
              await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
          }
          
          console.log(`[StockMediaWorker] All segmentation jobs finished`);
        }
      } catch (err) {
        console.error('[StockMediaWorker] YouTube error:', err);
      }
      
      console.log(`[StockMediaWorker] YouTube complete: ${stats.youtubeClips} videos processed`);
    } else if (!includeVideos) {
      console.log('[StockMediaWorker] Phase 3: YouTube SKIPPED (images_only mode)');
    }
    
    // ========================================================================
    // PHASE 4: Finalize (90-100%)
    // ========================================================================
    await updateTaskProgress(supabase, taskId, 92, 'postprocessing', 'Saving results...');
    console.log('[StockMediaWorker] Phase 4: Finalizing');
    
    // Update video_projects with results
    const { data: videoData } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    
    const existingMetadata = (videoData?.metadata as Record<string, any>) || {};
    await supabase
      .from('video_projects')
      .update({
        current_stage: 'stock',
        metadata: {
          ...existingMetadata,
          stockMediaResults: allMedia,
          stockMediaTaskId: taskId,
          stockMediaStats: stats,
        },
      })
      .eq('id', videoId);
    
    // Mark task complete
    const { error: taskCompleteError } = await supabase
      .from('tasks')
      .update({
        status: 'completed',
        progress_percent: 100,
        current_phase: 'postprocessing',
        current_step: 'Done',
        output_data: { media: allMedia, stats },
      })
      .eq('id', taskId);
    
    if (taskCompleteError) {
      console.error(`[StockMediaWorker] CRITICAL: Failed to mark task complete: ${taskCompleteError.message}`, {
        taskId,
        code: taskCompleteError.code,
        details: taskCompleteError.details,
        hint: taskCompleteError.hint,
      });
    } else {
      console.log(`[StockMediaWorker] Task ${taskId} marked as completed successfully`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`[StockMediaWorker] ✓ Job ${job.id} complete in ${totalTime}ms`);
    console.log(`[StockMediaWorker]   Images: ${stats.serperImages}, Videos: ${stats.pexelsVideos}, YouTube: ${stats.youtubeClips}`);
    console.log(`[StockMediaWorker]   Classified: ${stats.classified}, Stored: ${stats.stored}, Rejected: ${stats.rejected}`);
    
    // Save cost data (Serper search count)
    costTracker.addSerperSearch(serperSearchCount);
    await costTracker.save(videoId);
    
    return {
      videoId,
      media: allMedia,
      stats,
    };
    
  } catch (error) {
    console.error(`[StockMediaWorker] ✗ Job ${job.id} failed:`, error);
    
    // Still try to save partial cost data
    costTracker.addSerperSearch(serperSearchCount);
    await costTracker.save(videoId);
    
    // Mark task failed
    await supabase
      .from('tasks')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', taskId);
    
    throw error;
  }
}
