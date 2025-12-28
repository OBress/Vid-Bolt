"use server";

import { generateSpeech } from "@/lib/services/inworld-tts";
import { uploadAudioBuffer, generateAudioKey } from "@/lib/services/r2-storage";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

// Helper to get service role Supabase client (for server actions)
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export interface RegenerateAudioResult {
  success: boolean;
  audioUrl?: string;
  duration?: number;
  wordTimestamps?: any[];
  delta?: number;
  error?: string;
}

export async function regenerateAudioClip(
  userId: string,
  videoId: string,
  chunkIndex: number,
  newText: string,
  currentDuration: number
): Promise<RegenerateAudioResult> {
  try {
    const supabase = getServiceClient();

    // 1. Get Video and linked Task ID
    const { data: video, error: videoError } = await supabase
      .from("video_projects")
      .select("audio_task_id, user_id")
      .eq("id", videoId)
      .single();

    if (videoError || !video) {
        throw new Error("Video not found");
    }

    // Verify ownership (optional if trusted caller, but good practice)
    if (video.user_id !== userId) {
        throw new Error("Unauthorized");
    }

    if (!video.audio_task_id) {
        throw new Error("No linked audio task found");
    }

    // 2. Generate new audio (Enforced Hades Voice & Max Model)
    // Note: inworld-tts.ts defaults have been updated to enforce this.
    const ttsResult = await generateSpeech(userId, newText);

    // 3. Upload to R2
    const key = generateAudioKey(userId, videoId, chunkIndex, "mp3");
    const uploadResult = await uploadAudioBuffer(ttsResult.audioBuffer, key, "audio/mpeg");

    // 4. Update Task Data
    const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("output_data")
        .eq("id", video.audio_task_id)
        .single();
    
    if (taskError || !task) {
        throw new Error("Audio task not found");
    }

    const outputData = task.output_data || {};
    const chunks = Array.isArray(outputData.tts_chunks) ? outputData.tts_chunks : [];
    
    // Find and update the specific chunk
    const chunkIdx = chunks.findIndex((c: any) => c.chapterNumber === chunkIndex);
    
    const newChunkData = {
        chapterNumber: chunkIndex,
        url: uploadResult.url,
        duration_seconds: ttsResult.durationSeconds,
        word_timestamps: ttsResult.wordTimestamps,
        text: newText
    };

    if (chunkIdx >= 0) {
        chunks[chunkIdx] = newChunkData;
    } else {
        chunks.push(newChunkData);
    }

    // Recalculate totals
    const totalDuration = chunks.reduce((acc: number, c: any) => acc + (c.duration_seconds || 0), 0);
    const delta = ttsResult.durationSeconds - currentDuration;

    // Update Task
    await supabase.rpc("merge_task_output", {
        p_task_id: video.audio_task_id,
        p_updates: {
            tts_chunks: chunks,
            total_duration_seconds: totalDuration
        }
    });

    // 5. Update Video Metadata (to keep word_timestamps in sync if used)
    // Needs to consolidate all timestamps again
    // Logic similar to functions.ts finalize-audio
    let allWordTimestamps: any[] = [];
    let timeOffset = 0;
    
    // Sort chunks by index to ensure correct order
    const sortedChunks = [...chunks].sort((a: any, b: any) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

    for (const chunk of sortedChunks) {
        if (chunk.word_timestamps) {
            for (const wt of chunk.word_timestamps) {
                allWordTimestamps.push({
                    ...wt,
                    start_seconds: wt.start_seconds + timeOffset,
                    end_seconds: wt.end_seconds + timeOffset,
                });
            }
        }
        timeOffset += (chunk.duration_seconds || 0);
    }

    await supabase.rpc("merge_video_metadata", {
        p_video_id: videoId,
        p_updates: {
             word_timestamps: allWordTimestamps
        }
    });
    
    revalidatePath(`/video/${videoId}`); // Revalidate relevant paths if needed

    return {
        success: true,
        audioUrl: uploadResult.url,
        duration: ttsResult.durationSeconds,
        wordTimestamps: ttsResult.wordTimestamps,
        delta
    };

  } catch (error) {
    console.error("Regeneration failed:", error);
    return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
