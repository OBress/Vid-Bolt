/**
 * Audio Workflow Worker
 * ============================================================================
 * BullMQ worker for TTS audio generation.
 *
 * Pipeline (Inworld TTS):
 *   1. Split script into chunks
 *   2. Optimize chunks for speech (Gemini 3 Flash, Inworld-only)
 *   3. Generate TTS + upload per chunk
 *   4. Finalize metadata
 */

import { Job, Processor } from 'bullmq';
import type { WordTimestamp } from '@/types/task';
import { 
  getSupabaseServiceClient,
  addTaskStep, 
  completeStep, 
  failStep, 
  updateTaskStatus,
  type TaskLifecycleOwner,
} from '@/lib/queues/shared';
import { CostTracker } from '@/lib/queues/cost-tracker';
import { CancellationError, checkCancelled } from '@/lib/queues/cancellation';
import type { TtsOptimizationContext } from '@/lib/services/tts-text-optimizer';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface AudioJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
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
  /**
   * Project style context used by the TTS text optimizer.
   * Only consumed when voiceProvider === 'inworld'.
   * If omitted, optimization is skipped and the raw script is used.
   */
  ttsOptimizationContext?: TtsOptimizationContext;
}

const AUDIO_STEP_ORDER = {
  SPLIT_TEXT: 1,
  OPTIMIZE_TEXT: 5,  // Inworld-only: LLM-based speech text optimization
  TTS_BASE: 10,
  UPLOAD_BASE: 100,
  FINALIZE: 200,
} as const;

// ============================================================================
// PROCESSOR
// ============================================================================

export const audioProcessor: Processor<AudioJobData> = async (job: Job<AudioJobData>) => {
  const { taskId, userId, videoId, script, voiceProvider, voiceModel, voiceName, voiceSettings } = job.data;
  const isClosedLoop = job.data.taskLifecycleOwner === 'orchestrator' || job.name === 'closed-loop-tts';
  const jobStartTime = Date.now();

  console.log(`[Audio] Starting job ${job.id} for task ${taskId}${isClosedLoop ? ' (closed-loop)' : ''}`);
  console.log(`[Audio] Config: provider=${voiceProvider}, model=${voiceModel}, voice=${voiceName}, script=${script.length} chars`);

  try {
    // Cost tracking for Step 4 (Audio/TTS)
    const costTracker = new CostTracker(4, userId);

    // Link task to video project (skip in closed-loop — orchestrator manages this)
    if (!isClosedLoop) {
      const { linkTaskToVideo, updateVideoProgress } = await import('@/lib/services/video-service');
      await linkTaskToVideo(videoId, taskId, 'audio');
      await updateVideoProgress(videoId, 'audio', 'Starting audio generation', 5);
    }

    // Start audio generation (skip task progress in closed-loop)
    if (!isClosedLoop) {
      await updateTaskStatus(taskId, {
        status: 'running',
        current_phase: 'audio_generation',
        current_step: 'Preparing script for audio...',
        progress_percent: 5,
        started_at: new Date().toISOString(),
      });
    }

    // Step 1: Split script into chunks
    const splitStepId = !isClosedLoop ? await addTaskStep(taskId, 'audio_generation', 'Split Script', AUDIO_STEP_ORDER.SPLIT_TEXT) : null;
    if (!isClosedLoop) await updateTaskStatus(taskId, { current_step: 'Splitting script into chunks...', progress_percent: 10 });

    const { splitTextIntoChunks, getChunkStats } = await import('@/lib/utils/text-chunking');
    let chunks = splitTextIntoChunks(script, 200);
    const stats = getChunkStats(chunks);

    console.log(`[Audio] Split script into ${stats.totalChunks} chunks, estimated duration: ${stats.estimatedTotalDuration}s`);
    if (splitStepId) await completeStep(taskId, splitStepId);

    // Step 2 (Inworld only): Optimize chunks for speech delivery
    // Uses Gemini 3 Flash to apply register-aware Inworld TTS optimizations:
    // emphasis injection, pacing punctuation, SSML breaks, number normalization.
    // Fully non-blocking — failures fall back to raw text per-chunk.
    const chunkOriginalTexts: Map<number, string> = new Map();

    if (voiceProvider === 'inworld' && job.data.ttsOptimizationContext) {
      const optimizeStepId = !isClosedLoop
        ? await addTaskStep(taskId, 'audio_generation', 'Optimize Script for Speech', AUDIO_STEP_ORDER.OPTIMIZE_TEXT)
        : null;

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          current_step: 'Optimizing script for speech delivery...',
          progress_percent: 12,
        });
      }

      try {
        const { optimizeChunksForInworldTts } = await import('@/lib/services/tts-text-optimizer');
        const optimized = await optimizeChunksForInworldTts(
          userId,
          chunks,
          job.data.ttsOptimizationContext,
          async (done, total) => {
            if (!isClosedLoop) {
              await updateTaskStatus(taskId, {
                current_step: `Optimizing speech text... (${done}/${total})`,
                progress_percent: 12 + Math.round((done / total) * 3), // 12% → 15%
              });
            }
          }
        );

        // Replace chunk texts with optimized versions; stash originals for metadata
        chunks = chunks.map((chunk, i) => {
          const opt = optimized[i];
          chunkOriginalTexts.set(chunk.index, opt.originalText);
          return { ...chunk, text: opt.text, charCount: opt.charCount };
        });

        const optimizedCount = optimized.filter(o => o.wasOptimized).length;
        console.log(`[Audio] TTS optimization complete: ${optimizedCount}/${chunks.length} chunks transformed`);
        if (optimizeStepId) await completeStep(taskId, optimizeStepId);
      } catch (optError) {
        // Non-blocking — log and continue with raw chunks
        console.warn('[Audio] TTS optimization step failed (non-blocking), using raw script:', optError);
        if (optimizeStepId) await failStep(taskId, optimizeStepId, String(optError));
      }
    } else if (voiceProvider === 'inworld' && !job.data.ttsOptimizationContext) {
      console.log('[Audio] No ttsOptimizationContext provided — skipping TTS optimization step');
    }

    // Step 3: Generate TTS and upload each chunk
    const uploadedChunks: Array<{
      chunkIndex: number;
      url: string;
      durationSeconds: number;
      wordTimestamps?: WordTimestamp[];
      text?: string;
      originalText?: string;
    }> = [];

    const failedChunkErrors: string[] = [];
    const progressPerChunk = 80 / chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      // In closed-loop mode, check for task cancellation between chunks.
      // This allows the worker to self-terminate immediately when the user
      // stops production, rather than processing all N remaining chunks.
      if (isClosedLoop) {
        await checkCancelled(taskId);
      }

      const chunk = chunks[i];
      const chunkStart = Date.now();
      console.log(`[Audio] === Chunk ${i + 1}/${chunks.length} === (${chunk.charCount} chars, elapsed: ${((Date.now() - jobStartTime) / 1000).toFixed(1)}s)`);

      const chunkStepId = !isClosedLoop ? await addTaskStep(taskId, 'audio_generation', `Process Chunk ${i + 1}`, AUDIO_STEP_ORDER.TTS_BASE + i) : null;
      
      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          current_step: `Processing chunk ${i + 1} of ${chunks.length} (generating + uploading)...`,
          progress_percent: Math.round(15 + i * progressPerChunk),
        });
      }

      try {
        if (voiceProvider !== 'inworld') {
          throw new Error(`Voice provider '${voiceProvider}' is not yet implemented. Currently only 'inworld' is supported.`);
        }

        // Generate TTS
        const { generateSpeech, validateVoice } = await import('@/lib/services/inworld-tts');
        
        // Validate voice on first chunk (once per job, not per chunk)
        let resolvedVoice = voiceName || 'Hades';
        if (i === 0) {
          console.log(`[Audio] Validating voice: ${resolvedVoice}`);
          resolvedVoice = await validateVoice(userId, resolvedVoice);
          console.log(`[Audio] Resolved voice: ${resolvedVoice}`);
          // Store validated voice for subsequent chunks
          (job.data as any)._validatedVoice = resolvedVoice;
        } else {
          // Use previously validated voice
          resolvedVoice = (job.data as any)._validatedVoice || resolvedVoice;
        }

        console.log(`[Audio] Chunk ${i + 1}: calling TTS...`);
        const ttsStart = Date.now();
        const ttsResult = await generateSpeech(userId, chunk.text, {
          voiceId: resolvedVoice,
          modelId: voiceModel || undefined,
          speakingRate: voiceSettings?.speakingRate,
          temperature: Math.max(0.1, voiceSettings?.temperature || 1.0),
        });
        console.log(`[Audio] Chunk ${i + 1}: TTS done in ${Date.now() - ttsStart}ms (${ttsResult.audioBuffer.length} bytes, ${ttsResult.durationSeconds.toFixed(1)}s audio, ${ttsResult.wordTimestamps?.length ?? 0} timestamps)`);

        // Normalize TTS audio to -16 LUFS (EBU R128 compliant)
        const { normalizeAudio } = await import('@/lib/services/audio-normalizer');
        let audioToUpload = ttsResult.audioBuffer;
        try {
          const normResult = await normalizeAudio(ttsResult.audioBuffer, { inputFormat: 'mp3' });
          if (normResult.normalized) {
            audioToUpload = normResult.buffer;
            console.log(
              `[Audio] Chunk ${i + 1}: normalized ${normResult.originalLufs.toFixed(1)} → ${normResult.normalizedLufs.toFixed(1)} LUFS ` +
              `(${normResult.gainApplied > 0 ? '+' : ''}${normResult.gainApplied.toFixed(1)} dB, ${normResult.processingTimeMs}ms)`
            );
          } else if (normResult.skipReason) {
            console.log(`[Audio] Chunk ${i + 1}: normalization skipped — ${normResult.skipReason}`);
          }
        } catch (normErr) {
          console.warn(`[Audio] Chunk ${i + 1}: normalization failed, using original audio:`, normErr);
        }

        // Upload to R2
        const { uploadAudioBuffer, generateTtsKey, isR2Configured } = await import('@/lib/services/r2-storage');

        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured.');
        }

        console.log(`[Audio] Chunk ${i + 1}: uploading to R2...`);
        const uploadStart = Date.now();
        const key = generateTtsKey(userId, videoId, chunk.index);
        const uploadResult = await uploadAudioBuffer(audioToUpload, key, 'audio/mpeg');
        console.log(`[Audio] Chunk ${i + 1}: R2 upload done in ${Date.now() - uploadStart}ms`);

        await (chunkStepId ? completeStep(taskId, chunkStepId) : Promise.resolve());

        uploadedChunks.push({
          chunkIndex: chunk.index,
          url: uploadResult.url,
          durationSeconds: ttsResult.durationSeconds,
          wordTimestamps: ttsResult.wordTimestamps,
          text: chunk.text,
          // Preserve the original (pre-optimization) text for debugging/re-gen
          originalText: chunkOriginalTexts.get(chunk.index),
        });
        console.log(`[Audio] Chunk ${i + 1}: complete (${Date.now() - chunkStart}ms total)`);
      } catch (error) {
        // CancellationError must bubble up immediately — do not treat it as a
        // recoverable chunk failure as it would be swallowed by the outer loop.
        if (error instanceof CancellationError) throw error;

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (chunkStepId) await failStep(taskId, chunkStepId, errorMessage);
        console.error(`[Audio] Chunk ${i + 1} FAILED after ${Date.now() - chunkStart}ms:`, error);
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
    const finalizeStepId = !isClosedLoop ? await addTaskStep(taskId, 'audio_processing', 'Finalize Audio', AUDIO_STEP_ORDER.FINALIZE) : null;
    if (!isClosedLoop) await updateTaskStatus(taskId, { current_step: 'Finalizing audio...', progress_percent: 95 });

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
          // Preserved for debugging: what was sent vs the raw script text
          original_text: c.originalText ?? null,
        })),
        total_duration_seconds: totalDuration,
        final_audio: primaryAudioUrl,
        generation_errors: failedChunkErrors.length > 0 ? failedChunkErrors : null
      },
    });

    if (finalizeStepId) await completeStep(taskId, finalizeStepId);

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

    // Complete workflow (skip in closed-loop — orchestrator manages task lifecycle)
    if (!isClosedLoop) {
      await updateTaskStatus(taskId, {
        status: 'completed',
        current_step: 'Audio generation complete!',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      });
    }

    // Save cost data (TTS character count + emit cost_events row)
    const ttsModelKey = voiceModel || voiceName || 'inworld-tts-1.5-max';
    costTracker.setTtsUsage(script.length, ttsModelKey);
    await costTracker.save(videoId);

    // Emit dedicated TTS cost event
    try {
      const { emitCostEvent } = await import('@/lib/costs/emit-cost-event');
      const { getTtsPricePerChar } = await import('@/lib/costs/pricing');
      const pricePerChar = getTtsPricePerChar(ttsModelKey);
      const ttsAmountUsd = script.length * pricePerChar;
      await emitCostEvent({
        userId,
        videoId,
        category: 'tts',
        service: 'inworld_tts',
        subLabel: ttsModelKey,
        amountUsd: ttsAmountUsd,
        rawUnits: { chars: script.length },
        isEstimated: false,
      });
    } catch (costErr) {
      console.warn('[Audio] TTS cost event emission failed (non-blocking):', costErr);
    }

    // Update video project
    const { updateVideoContent } = await import('@/lib/services/video-service');
    await updateVideoContent(videoId, {
      audio_url: primaryAudioUrl ?? undefined,
      metadata: {
        word_timestamps: allWordTimestamps,
        audio_chunks: uploadedChunks.map(c => ({
          chapterNumber: c.chunkIndex,
          url: c.url,
          duration_seconds: c.durationSeconds,
          wordTimestamps: c.wordTimestamps,
          text: c.text,
          original_text: c.originalText ?? null,
        }))
      }
    });

    if (!isClosedLoop) {
      const { updateVideoProgress } = await import('@/lib/services/video-service');
      await updateVideoProgress(videoId, 'audio', 'Audio generation complete', 100);
    }

    console.log(`[Audio] Completed for task ${taskId} in ${((Date.now() - jobStartTime) / 1000).toFixed(1)}s (${uploadedChunks.length}/${chunks.length} chunks, ${failedChunkErrors.length} failures)`);

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
    // CancellationError is a clean exit — don't overwrite the "cancelled"
    // task status with a failure state. Re-throw so BullMQ marks the job
    // as failed (expected behaviour for an interrupted job).
    if (error instanceof CancellationError) {
      console.log(`[Audio] Task ${taskId} cancelled — stopping TTS cleanly after ${((Date.now() - jobStartTime) / 1000).toFixed(1)}s`);
      throw error;
    }

    console.error(`[Audio] Failed for task ${taskId}:`, error);
    
    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
