/**
 * Audio Workflow Worker
 * ============================================================================
 * BullMQ worker for TTS audio generation.
 */

import { Job, Processor } from 'bullmq';
import type { WordTimestamp } from '@/types/task';
import { 
  getSupabaseServiceClient,
  addTaskStep, 
  completeStep, 
  failStep, 
  updateTaskStatus 
} from '@/lib/queues/shared';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface AudioJobData {
  taskId: string;
  userId: string;
  videoId: string;
  script: string;
  voiceProvider: 'elevenlabs' | 'genai' | 'inworld';
  voiceModel?: string;
  voiceName?: string;
  voiceSettings?: {
    speakingRate?: number;
    stability?: number;
    similarityBoost?: number;
    temperature?: number;
  };
}

const AUDIO_STEP_ORDER = {
  SPLIT_TEXT: 1,
  TTS_BASE: 10,
  UPLOAD_BASE: 100,
  FINALIZE: 200,
} as const;

// ============================================================================
// PROCESSOR
// ============================================================================

export const audioProcessor: Processor<AudioJobData> = async (job: Job<AudioJobData>) => {
  const { taskId, userId, videoId, script, voiceProvider, voiceModel, voiceName, voiceSettings } = job.data;

  console.log(`[Audio] Starting job ${job.id} for task ${taskId}`);

  try {
    // Link task to video project
    const { linkTaskToVideo, updateVideoProgress } = await import('@/lib/services/video-service');
    await linkTaskToVideo(videoId, taskId, 'audio');
    await updateVideoProgress(videoId, 'audio', 'Starting audio generation', 5);

    // Start audio generation
    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'audio_generation',
      current_step: 'Preparing script for audio...',
      progress_percent: 5,
      started_at: new Date().toISOString(),
    });

    // Step 1: Split script into chunks
    const stepId = await addTaskStep(taskId, 'audio_generation', 'Split Script', AUDIO_STEP_ORDER.SPLIT_TEXT);
    await updateTaskStatus(taskId, { current_step: 'Splitting script into chunks...', progress_percent: 10 });

    const { splitTextIntoChunks, getChunkStats } = await import('@/lib/utils/text-chunking');
    const chunks = splitTextIntoChunks(script, 200);
    const stats = getChunkStats(chunks);

    console.log(`[Audio] Split script into ${stats.totalChunks} chunks, estimated duration: ${stats.estimatedTotalDuration}s`);
    await completeStep(taskId, stepId);

    // Step 2: Generate TTS and upload each chunk
    const uploadedChunks: Array<{
      chunkIndex: number;
      url: string;
      durationSeconds: number;
      wordTimestamps?: WordTimestamp[];
      text?: string;
    }> = [];

    const failedChunkErrors: string[] = [];
    const progressPerChunk = 80 / chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkStepId = await addTaskStep(taskId, 'audio_generation', `Process Chunk ${i + 1}`, AUDIO_STEP_ORDER.TTS_BASE + i);
      
      await updateTaskStatus(taskId, {
        current_step: `Processing chunk ${i + 1} of ${chunks.length} (generating + uploading)...`,
        progress_percent: Math.round(15 + i * progressPerChunk),
      });

      try {
        if (voiceProvider !== 'inworld') {
          throw new Error(`Voice provider '${voiceProvider}' is not yet implemented. Currently only 'inworld' is supported.`);
        }

        // Generate TTS
        const { generateSpeech } = await import('@/lib/services/inworld-tts');
        const ttsResult = await generateSpeech(userId, chunk.text, {
          voiceId: voiceName || voiceModel,
          speakingRate: voiceSettings?.speakingRate,
          temperature: Math.max(0.1, voiceSettings?.temperature || 1.0),
        });

        // Upload to R2
        const { uploadAudioBuffer, generateTtsKey, isR2Configured } = await import('@/lib/services/r2-storage');

        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured.');
        }

        const key = generateTtsKey(userId, videoId, chunk.index);
        const uploadResult = await uploadAudioBuffer(ttsResult.audioBuffer, key, 'audio/mpeg');

        await completeStep(taskId, chunkStepId);

        uploadedChunks.push({
          chunkIndex: chunk.index,
          url: uploadResult.url,
          durationSeconds: ttsResult.durationSeconds,
          wordTimestamps: ttsResult.wordTimestamps,
          text: chunk.text,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await failStep(taskId, chunkStepId, errorMessage);
        console.error(`[Audio] Chunk ${i} failed:`, error);
        failedChunkErrors.push(`Chunk ${chunk.index}: ${errorMessage}`);
      }
    }

    if (failedChunkErrors.length > 0) {
      console.warn(`[Audio] ${failedChunkErrors.length} chunks failed:`, failedChunkErrors);
    }

    if (uploadedChunks.length === 0 && chunks.length > 0) {
      throw new Error(`Audio generation failed. All ${chunks.length} chunks failed. Errors: ${failedChunkErrors.join('; ')}`);
    }

    // Step 3: Finalize
    const finalizeStepId = await addTaskStep(taskId, 'audio_processing', 'Finalize Audio', AUDIO_STEP_ORDER.FINALIZE);
    await updateTaskStatus(taskId, { current_step: 'Finalizing audio...', progress_percent: 95 });

    const totalDuration = uploadedChunks.reduce((sum, chunk) => sum + chunk.durationSeconds, 0);
    const primaryAudioUrl = uploadedChunks.length > 0 ? uploadedChunks[0].url : null;

    // Update task output
    const supabase = getSupabaseServiceClient();
    await supabase.rpc('merge_task_output', {
      p_task_id: taskId,
      p_updates: {
        tts_chunks: uploadedChunks.map(c => ({
          chapterNumber: c.chunkIndex,
          url: c.url,
          duration_seconds: c.durationSeconds,
          word_timestamps: c.wordTimestamps,
          text: c.text,
        })),
        total_duration_seconds: totalDuration,
        final_audio: primaryAudioUrl,
        generation_errors: failedChunkErrors.length > 0 ? failedChunkErrors : null
      },
    });

    await completeStep(taskId, finalizeStepId);

    // Consolidate word timestamps
    const allWordTimestamps: WordTimestamp[] = [];
    let timeOffset = 0;
    for (const chunk of uploadedChunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0))) {
      if (chunk.wordTimestamps) {
        for (const wt of chunk.wordTimestamps) {
          allWordTimestamps.push({
            ...wt,
            start_seconds: wt.start_seconds + timeOffset,
            end_seconds: wt.end_seconds + timeOffset,
          });
        }
      }
      timeOffset += chunk.durationSeconds;
    }

    // Complete workflow
    await updateTaskStatus(taskId, {
      status: 'completed',
      current_step: 'Audio generation complete!',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    });

    // Update video project
    const { updateVideoContent } = await import('@/lib/services/video-service');
    await updateVideoContent(videoId, {
      audio_url: primaryAudioUrl ?? undefined,
      metadata: {
        word_timestamps: allWordTimestamps,
        audio_chunks: uploadedChunks.map(c => ({
          chapterNumber: c.chunkIndex,
          url: c.url,
          durationSeconds: c.durationSeconds,
          wordTimestamps: c.wordTimestamps,
          text: c.text,
        }))
      }
    });

    await updateVideoProgress(videoId, 'audio', 'Audio generation complete', 100);

    console.log(`[Audio] Completed for task ${taskId}`);

    return {
      success: true,
      taskId,
      videoId,
      totalDuration,
      chunkCount: uploadedChunks.length,
      audioUrl: primaryAudioUrl,
      allWordTimestamps,
    };

  } catch (error) {
    console.error(`[Audio] Failed for task ${taskId}:`, error);
    
    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
