/**
 * Video Segmentation Worker
 * ==========================================================================
 * BullMQ worker that processes video segmentation jobs.
 * Downloads YouTube videos, segments into clips, and stores in R2 + Vector DB.
 */

import { Worker, Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getRedisConnection } from '../redis';
import { segmentVideo } from '@/lib/segmentation/segment-video';
import { 
  downloadVideo, 
  extractClip, 
  extractThumbnail, 
  extractAudio,
  isYtdlpInstalled 
} from '@/lib/segmentation/yt-dlp';
import type { SegmentVideoJobData, SegmentVideoJobResult, VideoClip } from '@/lib/segmentation/types';
import { 
  uploadAudioBuffer, 
  getPublicUrl,
  generateStockScraperSourceKey,
  generateStockScraperSourceThumbnailKey,
  generateStockScraperClipKey,
  generateStockScraperClipThumbnailKey,
} from '@/lib/services/r2-storage';

// ==========================================================================
// Worker Configuration
// ==========================================================================

const QUEUE_NAME = 'video-segmentation';

// ==========================================================================
// Job Processor
// ==========================================================================

export async function segmentProcessor(
  job: Job<SegmentVideoJobData>
): Promise<SegmentVideoJobResult> {
  const { userId, videoId, sourceUrl, targetClipDuration } = job.data;
  const startTime = Date.now();
  const tempDir = path.join(os.tmpdir(), `segment-${videoId}`);

  console.log(`[SegmentWorker] Starting job ${job.id} for video ${videoId}`);

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // 1. Check yt-dlp is available
    const ytdlpAvailable = await isYtdlpInstalled();
    if (!ytdlpAvailable) {
      throw new Error('yt-dlp is not installed. Please install it to process YouTube videos.');
    }

    // 2. Download video
    await job.updateProgress({ stage: 'downloading', progress: 5, message: 'Downloading video...' });
    const downloadResult = await downloadVideo(
      sourceUrl,
      tempDir,
      (progress) => {
        job.updateProgress({ 
          stage: 'downloading', 
          progress: Math.floor(progress.progress * 0.3), // 0-30%
          message: progress.message 
        });
      }
    );
    console.log(`[SegmentWorker] Downloaded: ${downloadResult.videoPath}`);

    // 3. Upload original video to R2
    await job.updateProgress({ stage: 'uploading', progress: 35, message: 'Uploading original video...' });
    const videoBuffer = fs.readFileSync(downloadResult.videoPath);
    const videoR2Key = generateStockScraperSourceKey(videoId);
    await uploadAudioBuffer(videoBuffer, videoR2Key, 'video/mp4');
    console.log(`[SegmentWorker] Uploaded original video to R2: ${videoR2Key}`);

    // 4. Extract and upload thumbnail
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
    await extractThumbnail(downloadResult.videoPath, 2, thumbnailPath);
    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailR2Key = generateStockScraperSourceThumbnailKey(videoId);
    await uploadAudioBuffer(thumbnailBuffer, thumbnailR2Key, 'image/jpeg');

    // 5. Extract audio for transcription
    await job.updateProgress({ stage: 'transcribing', progress: 40, message: 'Extracting audio...' });
    let audioBuffer: Buffer | null = null;
    try {
      const audioPath = await extractAudio(downloadResult.videoPath);
      audioBuffer = fs.readFileSync(audioPath);
      fs.unlinkSync(audioPath); // Clean up audio file
    } catch (err) {
      console.warn('[SegmentWorker] Audio extraction failed, continuing without:', err);
    }

    // 6. Run segmentation pipeline
    // Include video duration for chunked analysis of long videos
    const videoDuration = downloadResult.videoInfo.duration;
    console.log(`[SegmentWorker] Video duration: ${videoDuration}s (${Math.round(videoDuration / 60)} min)`);
    console.log(`[SegmentWorker] Video title: ${downloadResult.videoInfo.title}`);
    
    await job.updateProgress({ stage: 'analyzing', progress: 45, message: 'Analyzing scenes...' });
    
    // Pass videoDuration and video context to enable better scene descriptions
    const jobDataWithContext = {
      ...job.data,
      videoDuration,
      videoTitle: downloadResult.videoInfo.title,
      videoDescription: downloadResult.videoInfo.description,
    };
    
    const { clips, transcription, hadAudioTranscription } = await segmentVideo(
      jobDataWithContext,
      audioBuffer,
      async (stage, progress) => {
        // For chunked analysis, the stage message will include chunk info
        const numChunks = Math.ceil(videoDuration / 295); // ~5 min chunks with overlap
        const isChunked = videoDuration > 300;
        const message = isChunked 
          ? `Analyzing scenes (chunked: ${numChunks} parts)...`
          : `${stage}...`;
        
        await job.updateProgress({ 
          stage, 
          progress: 45 + Math.floor(progress * 0.25), // 45-70%
          message 
        });
      }
    );
    console.log(`[SegmentWorker] Found ${clips.length} clips, had audio: ${hadAudioTranscription}`);

    // 7. Extract clips
    await job.updateProgress({ stage: 'extracting', progress: 70, message: 'Extracting clips...' });
    const classifiedClips: VideoClip[] = [];
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const progress = 70 + Math.floor((i / clips.length) * 20); // 70-90%
      await job.updateProgress({ 
        stage: 'extracting', 
        progress, 
        message: `Extracting clip ${i + 1}/${clips.length}...` 
      });

      // Extract clip video
      const clipPath = path.join(tempDir, `${clip.id}.mp4`);
      await extractClip(downloadResult.videoPath, clip.startTime, clip.endTime, clipPath);
      
      // Upload clip to R2 (unified storage - just uses clip.id)
      const clipBuffer = fs.readFileSync(clipPath);
      const clipR2Key = generateStockScraperClipKey(clip.id);
      await uploadAudioBuffer(clipBuffer, clipR2Key, 'video/mp4');

      // Extract and upload thumbnail (non-fatal - continue if fails)
      let clipThumbR2Key: string | undefined;
      let thumbnailUrl: string | undefined;
      try {
        const clipThumbPath = path.join(tempDir, `${clip.id}-thumb.jpg`);
        await extractThumbnail(
          clipPath, 
          (clip.endTime - clip.startTime) / 2, 
          clipThumbPath
        );
        
        const clipThumbBuffer = fs.readFileSync(clipThumbPath);
        clipThumbR2Key = generateStockScraperClipThumbnailKey(clip.id);
        await uploadAudioBuffer(clipThumbBuffer, clipThumbR2Key, 'image/jpeg');
        thumbnailUrl = getPublicUrl(clipThumbR2Key);
        
        // Clean up thumbnail temp file
        fs.unlinkSync(clipThumbPath);
      } catch (thumbErr) {
        console.warn(`[SegmentWorker] Thumbnail extraction failed for clip ${clip.id}, continuing without thumbnail:`, thumbErr);
        // Continue without thumbnail - not fatal
      }

      classifiedClips.push({
        ...clip,
        r2Key: clipR2Key,
        thumbnailR2Key: clipThumbR2Key,
        videoUrl: getPublicUrl(clipR2Key),
        thumbnailUrl,
        qualityRating: 7, // Default, would be set by classifier
      });

      // Clean up clip temp file
      fs.unlinkSync(clipPath);
    }

    // 8. Store in vector database
    await job.updateProgress({ stage: 'storing', progress: 92, message: 'Storing in vector DB...' });
    
    const { StockMediaService } = await import('@/lib/stock-media/service');
    const stockMediaService = new StockMediaService();
    
    let storedCount = 0;
    for (const clip of classifiedClips) {
      try {
        await stockMediaService.storeClip({
          id: clip.id,
          parentVideoId: videoId,
          description: clip.description,
          subjects: clip.subjects,
          mood: clip.mood,
          sceneType: clip.sceneType,
          r2Key: clip.r2Key,
          thumbnailR2Key: clip.thumbnailR2Key,
          videoUrl: clip.videoUrl,
          thumbnailUrl: clip.thumbnailUrl,
          startTime: clip.startTime,
          endTime: clip.endTime,
          hasAudio: clip.audioType === 'visual+audio',
          qualityRating: clip.qualityRating,
          suggestedUses: clip.suggestedUses,
        });
        storedCount++;
      } catch (err) {
        console.warn(`[SegmentWorker] Failed to store clip ${clip.id} in vector DB:`, err);
        // Continue with other clips even if one fails
      }
    }
    console.log(`[SegmentWorker] Stored ${storedCount}/${classifiedClips.length} clips in vector DB`);

    // 9. Cleanup
    await job.updateProgress({ stage: 'complete', progress: 100, message: 'Complete!' });
    
    // Clean up temp directory
    fs.unlinkSync(downloadResult.videoPath);
    fs.unlinkSync(thumbnailPath);
    fs.rmdirSync(tempDir);

    const totalTime = Date.now() - startTime;
    console.log(`[SegmentWorker] ✓ Job ${job.id} complete in ${totalTime}ms - ${classifiedClips.length} clips`);

    return {
      videoId,
      clips: classifiedClips,
      hadAudioTranscription,
      totalProcessingTimeMs: totalTime,
    };

  } catch (error) {
    // Cleanup on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
    
    console.error(`[SegmentWorker] ✗ Job ${job.id} failed:`, error);
    throw error;
  }
}

// ==========================================================================
// Worker Setup
// ==========================================================================

/**
 * Create and start the segmentation worker.
 */
export function createSegmentationWorker(): Worker<SegmentVideoJobData, SegmentVideoJobResult> {
  const worker = new Worker<SegmentVideoJobData, SegmentVideoJobResult>(
    QUEUE_NAME,
    segmentProcessor,
    {
      connection: getRedisConnection(),
      concurrency: 1, // Process 1 video at a time (CPU intensive)
      limiter: {
        max: 5,
        duration: 60000, // 5 jobs per minute max
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[SegmentWorker] Job ${job.id} completed: ${result.clips.length} clips`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[SegmentWorker] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress: any) => {
    console.log(`[SegmentWorker] Job ${job.id} progress: ${progress.stage} (${progress.progress}%)`);
  });

  console.log('[SegmentWorker] Worker started');
  return worker;
}

export default createSegmentationWorker;
