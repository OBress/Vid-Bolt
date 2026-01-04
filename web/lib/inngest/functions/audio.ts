import { inngest } from "../client";
import { 
  getSupabaseServiceClient,
  addTaskStep, 
  completeStep, 
  failStep, 
  updateTaskStatus 
} from "./shared";

interface AudioWorkflowInput {
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
  TTS_BASE: 10, // Chunk generation uses 10 + chunkIndex
  UPLOAD_BASE: 100, // Uploads use 100 + chunkIndex
  FINALIZE: 200,
} as const;

export const audioWorkflow = inngest.createFunction(
  {
    id: "audio-workflow",
    retries: 3,
    concurrency: {
      limit: 5,
      key: "event.data.userId",
    },
  },
  { event: "audio/generate.start" },
  async ({ event, step }) => {
    const input = event.data as AudioWorkflowInput;
    const { taskId, userId, videoId, script, voiceProvider, voiceModel, voiceName, voiceSettings } = input;

    // Link task to video project
    await step.run("link-task-to-video", async () => {
      const { linkTaskToVideo, updateVideoProgress } = await import("@/lib/services/video-service");
      await linkTaskToVideo(videoId, taskId, "audio");
      await updateVideoProgress(videoId, "audio", "Starting audio generation", 5);
    });

    // Start audio generation
    await step.run("start-audio-generation", async () => {
      await updateTaskStatus(taskId, {
        status: "running",
        current_phase: "audio_generation",
        current_step: "Preparing script for audio...",
        progress_percent: 5,
        started_at: new Date().toISOString(),
      });
    });

    // Step 1: Split script into chunks
    const chunks = await step.run("split-script-into-chunks", async () => {
      const stepId = await addTaskStep(taskId, "audio_generation", "Split Script", AUDIO_STEP_ORDER.SPLIT_TEXT);
      await updateTaskStatus(taskId, { current_step: "Splitting script into chunks...", progress_percent: 10 });

      try {
        const { splitTextIntoChunks, getChunkStats } = await import("@/lib/utils/text-chunking");
        const textChunks = splitTextIntoChunks(script, 200);
        const stats = getChunkStats(textChunks);

        console.log(`Split script into ${stats.totalChunks} chunks, estimated duration: ${stats.estimatedTotalDuration}s`);

        await completeStep(taskId, stepId);
        return textChunks;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 2: Generate TTS and upload each chunk immediately
    // IMPORTANT: We do NOT store base64 data in step results to avoid Inngest's 32MB state limit
    // Each step generates audio and uploads it to R2 in one operation, only returning the URL
    const uploadedChunks: Array<{
      chunkIndex: number;
      url: string;
      durationSeconds: number;
      wordTimestamps?: import("@/types/task").WordTimestamp[];
      text?: string;
    }> = [];

    // Track failed chunks for logging
    const failedChunkErrors: string[] = [];

    const progressPerChunk = 80 / chunks.length; // 80% of progress for TTS generation + upload

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Combined generate + upload step to avoid storing base64 in state
      const chunkResult = await step.run(`process-chunk-${i}`, async () => {
        const stepId = await addTaskStep(taskId, "audio_generation", `Process Chunk ${i + 1}`, AUDIO_STEP_ORDER.TTS_BASE + i);
        // ... (keep existing updateTaskStatus) ...
        await updateTaskStatus(taskId, {
          current_step: `Processing chunk ${i + 1} of ${chunks.length} (generating + uploading)...`,
          progress_percent: Math.round(15 + i * progressPerChunk),
        });

        try {
          // ... (keep existing logic) ...
          // Only Inworld is implemented currently
          if (voiceProvider !== 'inworld') {
            throw new Error(`Voice provider '${voiceProvider}' is not yet implemented. Currently only 'inworld' is supported.`);
          }

          // Step 2a: Generate TTS
          const { generateSpeech } = await import("@/lib/services/inworld-tts");
          const ttsResult = await generateSpeech(userId, chunk.text, {
            voiceId: voiceName || voiceModel,
            speakingRate: voiceSettings?.speakingRate,
            temperature: Math.max(0.1, voiceSettings?.temperature || 1.0), // Ensure min 0.1, default 1.0
          });

          // Step 2b: Upload to R2 immediately (don't store base64 in state!)
          const { uploadAudioBuffer, generateAudioKey, isR2Configured } = await import("@/lib/services/r2-storage");

          if (!isR2Configured()) {
            throw new Error("R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL environment variables.");
          }

          const key = generateAudioKey(userId, videoId, chunk.index, "mp3");
          const uploadResult = await uploadAudioBuffer(ttsResult.audioBuffer, key, "audio/mpeg");

          await completeStep(taskId, stepId);

          // Return only URL and duration - NO base64 data in state!
          return {
            success: true,
            chunkIndex: chunk.index,
            url: uploadResult.url,
            durationSeconds: ttsResult.durationSeconds,
            wordTimestamps: ttsResult.wordTimestamps,
            text: chunk.text,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          // Mark step as failed but DON'T throw - allows workflow to continue
          await failStep(taskId, stepId, errorMessage);
          console.error(`Chunk ${i} failed, continuing:`, error);
          
          return {
            success: false,
            chunkIndex: chunk.index,
            url: null,
            durationSeconds: 0,
            wordTimestamps: [],
            error: errorMessage,
          };
        }
      });

      if (chunkResult.success && chunkResult.url) {
        uploadedChunks.push({
          chunkIndex: chunkResult.chunkIndex,
          url: chunkResult.url,
          durationSeconds: chunkResult.durationSeconds,
          wordTimestamps: chunkResult.wordTimestamps,
          text: chunk.text,
        });
      } else {
        if ('error' in chunkResult && chunkResult.error) {
            failedChunkErrors.push(`Chunk ${chunkResult.chunkIndex}: ${chunkResult.error}`);
        }
      }
    }

    if (failedChunkErrors.length > 0) {
      console.warn(`${failedChunkErrors.length} chunks failed:`, failedChunkErrors);
    }
    
    // FAIL THE WORKFLOW if 0 chunks succeeded but we had input chunks
    if (uploadedChunks.length === 0 && chunks.length > 0) {
        throw new Error(`Audio generation failed. All ${chunks.length} chunks failed. Errors: ${failedChunkErrors.join('; ')}`);
    }

    // Step 4: Finalize and update video project
    const finalResult = await step.run("finalize-audio", async () => {
      const stepId = await addTaskStep(taskId, "audio_processing", "Finalize Audio", AUDIO_STEP_ORDER.FINALIZE);
      await updateTaskStatus(taskId, { current_step: "Finalizing audio...", progress_percent: 95 });

      try {
        // Calculate total duration
        const totalDuration = uploadedChunks.reduce((sum, chunk) => sum + chunk.durationSeconds, 0);

        // For now, use the first chunk as the main audio URL
        // In a full implementation, we would merge all chunks
        const primaryAudioUrl = uploadedChunks.length > 0 ? uploadedChunks[0].url : null;

        // Update task output with audio data
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

        await completeStep(taskId, stepId);

        // Consolidate all word timestamps with absolute offsets
        const allWordTimestamps: import("@/types/task").WordTimestamp[] = [];
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

        return {
          totalDuration,
          chunkCount: uploadedChunks.length,
          primaryAudioUrl,
          allWordTimestamps,
        };
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Complete workflow
    await step.run("complete-workflow", async () => {
      await updateTaskStatus(taskId, {
        status: "completed",
        current_step: "Audio generation complete!",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      });

      // Update video project with audio URL, word timestamps, AND audio chunks
      const { updateVideoContent, updateVideoProgress } = await import("@/lib/services/video-service");
      const updates: any = {};
      
      if (finalResult.primaryAudioUrl) {
        updates.audio_url = finalResult.primaryAudioUrl;
      }
      
      // Update metadata with word timestamps and audio chunks
      // We need to merge with existing metadata
      updates.metadata = {
        word_timestamps: finalResult.allWordTimestamps || [],
        audio_chunks: uploadedChunks.map(c => ({
          chapterNumber: c.chunkIndex,
          url: c.url,
          durationSeconds: c.durationSeconds,
          wordTimestamps: c.wordTimestamps,
          text: c.text,
        }))
      };
      
      if (Object.keys(updates).length > 0) {
        await updateVideoContent(videoId, updates);
      }
      
      // Keep stage as 'audio' so user lands on Review step
      await updateVideoProgress(videoId, "audio", "Audio generation complete", 100);
    });

    // Trigger AV Script generation asynchronously
    // The wizard will poll for av_script_completed flag before advancing to editor
    if (finalResult.allWordTimestamps && finalResult.allWordTimestamps.length > 0) {
      await step.sendEvent("trigger-av-script", {
        name: "av-script/generate.start",
        data: {
          userId,
          videoId,
          script,
          wordTimestamps: finalResult.allWordTimestamps,
          totalDurationSeconds: finalResult.totalDuration,
        },
      });
      console.log(`[AudioWorkflow] Triggered AV Script generation for video ${videoId} with ${finalResult.allWordTimestamps.length} words`);
    }

    return {
      success: true,
      taskId,
      videoId,
      totalDuration: finalResult.totalDuration,
      chunkCount: finalResult.chunkCount,
      audioUrl: finalResult.primaryAudioUrl,
    };
  }
);
