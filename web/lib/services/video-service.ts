/**
 * Video Service - Server-side utilities for video project management
 * ============================================================================
 * Provides helper functions for updating video progress, linking tasks,
 * and determining resume points.
 */

import { createClient } from "@supabase/supabase-js";
import type { VideoProject, VideoStage } from "@/types/video";
import { getNextStage, calculateStageProgress, canResumeVideo } from "@/types/video";

// Get service role Supabase client
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Update video progress tracking
 * 
 * @param videoId - Video project ID
 * @param stage - Current pipeline stage
 * @param step - Current step description
 * @param progress - Progress percentage (0-100)
 */
export async function updateVideoProgress(
  videoId: string,
  stage: VideoStage,
  step: string,
  progress: number
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.rpc("update_video_progress", {
    p_video_id: videoId,
    p_current_stage: stage,
    p_current_step: step,
    p_progress_percent: progress,
  });

  if (error) {
    console.error("Failed to update video progress:", error);
    throw new Error(`Failed to update video progress: ${error.message}`);
  }
}

/**
 * Link a task to a video project
 * 
 * @param videoId - Video project ID
 * @param taskId - Task ID to link
 * @param taskType - Type of task (script, audio, video, export)
 */
export async function linkTaskToVideo(
  videoId: string,
  taskId: string,
  taskType: "script" | "audio" | "video" | "export"
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.rpc("link_task_to_video", {
    p_video_id: videoId,
    p_task_id: taskId,
    p_task_type: taskType,
  });

  if (error) {
    console.error("Failed to link task to video:", error);
    throw new Error(`Failed to link task to video: ${error.message}`);
  }
}

/**
 * Update video content (script, audio URL, video URL)
 * 
 * @param videoId - Video project ID
 * @param updates - Content updates
 */
export async function updateVideoContent(
  videoId: string,
  updates: {
    script_content?: string;
    audio_url?: string;
    video_url?: string;
    metadata?: any;
  }
): Promise<void> {
  const supabase = getServiceClient();
  const { metadata, ...otherUpdates } = updates;

  // 1. Update regular fields
  if (Object.keys(otherUpdates).length > 0) {
    const { error } = await supabase
      .from("video_projects")
      .update({
        ...otherUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (error) {
      console.error("Failed to update video content:", error);
      throw new Error(`Failed to update video content: ${error.message}`);
    }
  }

  // 2. Merge metadata if provided
  if (metadata) {
    const { error } = await supabase.rpc("merge_video_metadata", {
      p_video_id: videoId,
      p_updates: metadata,
    });

    if (error) {
      console.error("Failed to merge video metadata:", error);
      throw new Error(`Failed to merge video metadata: ${error.message}`);
    }
  }
}

/**
 * Determine the resume point for a video
 * 
 * @param video - Video project
 * @returns Object with next stage and action description
 */
export async function getResumePoint(
  video: VideoProject
): Promise<{ stage: VideoStage; action: string }> {
  if (!canResumeVideo(video)) {
    throw new Error("Video cannot be resumed");
  }

  const { current_stage, script_content, audio_url, video_url } = video;

  // Determine next action based on current stage and available content
  switch (current_stage) {
    case "idea":
      return { stage: "script", action: "Generate script from idea" };
    
    case "script":
      if (!script_content) {
        return { stage: "script", action: "Generate script" };
      }
      return { stage: "audio", action: "Generate audio from script" };
    
    case "audio":
      if (!audio_url) {
        if (!script_content) {
          return { stage: "script", action: "Generate script first" };
        }
        return { stage: "audio", action: "Generate audio" };
      }
      return { stage: "video", action: "Generate video from audio" };
    
    case "video":
      if (!video_url) {
        if (!audio_url) {
          return { stage: "audio", action: "Generate audio first" };
        }
        return { stage: "video", action: "Generate video" };
      }
      return { stage: "export", action: "Export final video" };
    
    case "export":
      return { stage: "export", action: "Complete export process" };
    
    default:
      throw new Error(`Unexpected stage: ${current_stage}`);
  }
}

/**
 * Get video by ID
 * 
 * @param videoId - Video project ID
 * @returns Video project or null
 */
export async function getVideoById(videoId: string): Promise<VideoProject | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("video_projects")
    .select("*")
    .eq("id", videoId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to fetch video: ${error.message}`);
  }

  return data;
}

/**
 * Mark video as completed
 * 
 * @param videoId - Video project ID
 */
export async function completeVideo(videoId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("video_projects")
    .update({
      status: "completed",
      current_stage: "completed",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (error) {
    throw new Error(`Failed to complete video: ${error.message}`);
  }
}

/**
 * Mark video as failed
 * 
 * @param videoId - Video project ID
 * @param errorMessage - Error description
 */
export async function failVideo(videoId: string, errorMessage: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("video_projects")
    .update({
      status: "failed",
      metadata: {
        error: errorMessage,
        failed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);

  if (error) {
    throw new Error(`Failed to mark video as failed: ${error.message}`);
  }
}

/**
 * Advance video to next stage
 * 
 * @param videoId - Video project ID
 */
export async function advanceVideoStage(videoId: string): Promise<void> {
  const video = await getVideoById(videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  const nextStage = getNextStage(video.current_stage);
  if (!nextStage) {
    // Already at final stage, mark as completed
    await completeVideo(videoId);
    return;
  }

  const progress = calculateStageProgress(nextStage);
  
  await updateVideoProgress(
    videoId,
    nextStage,
    `Starting ${nextStage} stage`,
    progress
  );
}
