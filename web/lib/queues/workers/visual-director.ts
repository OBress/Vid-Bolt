/**
 * Visual Director Workflow Worker
 * ============================================================================
 * BullMQ worker for the visual director pipeline that plans scenes,
 * generates images, and creates videos.
 * 
 * NOTE: This is a simplified placeholder. Full GPU integration will use
 * webhooks instead of polling (future implementation).
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface VisualDirectorJobData {
  taskId: string;
  userId: string;
  videoId: string;
  projectId?: string;
  spine?: {
    title: string;
    duration_seconds: number;
    beats: Array<{
      beat_id: string;
      content: string;
      start_time: number;
      end_time: number;
    }>;
  };
  assetRegistry?: {
    characters: Array<{ id: string; name: string; description: string }>;
    locations: Array<{ id: string; name: string; description: string }>;
    objects: Array<{ id: string; name: string; description: string }>;
  };
  expandedBeats?: Array<{
    beat_id: string;
    expanded_content: string;
    visual_description: string;
  }>;
  finalScript?: string;
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const visualDirectorProcessor: Processor<VisualDirectorJobData> = async (job: Job<VisualDirectorJobData>) => {
  const { taskId, userId, videoId, spine, assetRegistry, expandedBeats } = job.data;

  console.log(`[VisualDirector] Starting job ${job.id} for video ${videoId}`);

  try {
    const supabase = getSupabaseServiceClient();

    // Step 1: Build scene list from beats
    console.log('[VisualDirector] Step 1: Building scene list from expanded beats...');
    const scenes = (expandedBeats || []).map((beat, index) => ({
      scene_id: `scene-${index}`,
      beat_id: beat.beat_id,
      content: beat.expanded_content,
      visual_description: beat.visual_description,
      shots: []
    }));
    console.log(`[VisualDirector] Created ${scenes.length} scenes`);

    // Step 2: Build generation queues (placeholder - actual GPU calls would go here)
    console.log('[VisualDirector] Step 2: Building generation task queues...');
    const imageQueue: Array<{ taskId: string; sceneId: string; prompt: string }> = [];
    const videoQueue: Array<{ taskId: string; sceneId: string; imageUrl: string }> = [];

    for (const scene of scenes) {
      if (scene.visual_description) {
        imageQueue.push({
          taskId: `img-${scene.scene_id}`,
          sceneId: scene.scene_id,
          prompt: scene.visual_description,
        });
      }
    }

    console.log(`[VisualDirector] Queue sizes - Images: ${imageQueue.length}, Videos: ${videoQueue.length}`);

    // Step 3-5: Placeholder for actual GPU generation (will use webhooks)
    console.log('[VisualDirector] Step 3-5: GPU generation (placeholder - pending webhook implementation)');
    const generatedImages: Record<string, string> = {};
    const generatedVideos: Record<string, string> = {};

    // Step 6: Store results in metadata
    console.log('[VisualDirector] Step 6: Storing results in video metadata...');

    const visualDirectorOutput = {
      scenes,
      generatedImages,
      generatedVideos,
      stats: {
        totalScenes: scenes.length,
        totalShots: scenes.reduce((sum, s) => sum + (s.shots?.length || 0), 0),
        imagesQueued: imageQueue.length,
        videosQueued: videoQueue.length,
      },
    };

    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;

    const { error } = await supabase
      .from('video_projects')
      .update({
        metadata: {
          ...existingMetadata,
          visual_director_output: visualDirectorOutput,
          visual_director_completed: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (error) {
      console.error('[VisualDirector] Failed to store results:', error);
      throw error;
    }

    console.log(`[VisualDirector] Stored visual director output for video ${videoId}`);
    console.log(`[VisualDirector] Workflow complete for video ${videoId}`);
    console.log(`[VisualDirector] Stats: ${visualDirectorOutput.stats.totalScenes} scenes`);

    return {
      success: true,
      videoId,
      stats: visualDirectorOutput.stats,
    };

  } catch (error) {
    console.error(`[VisualDirector] Failed for video ${videoId}:`, error);
    throw error;
  }
};
