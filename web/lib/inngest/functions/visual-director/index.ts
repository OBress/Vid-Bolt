/**
 * Visual Director Workflow
 * ============================================================================
 * Main Inngest function for the visual director pipeline that plans scenes,
 * generates images, edits for consistency, and creates video clips.
 */

import { inngest } from '../../client';
import { getSupabaseServiceClient } from '../shared';
import { planScenes } from './scene-planner';
import {
  createInitialContinuityState,
  updateContinuityState,
  analyzeSceneTransition,
  createGenerationTasks,
} from './visual-continuity';
import {
  generateImagesBatch,
  editImagesBatch,
  generateVideosBatch,
} from './services';
import type {
  VisualDirectorInput,
  VisualDirectorOutput,
  Scene,
  ImageGenerationTask,
  ImageEditingTask,
  VideoGenerationTask,
} from './types';

// ============================================================================
// EVENT TYPES
// ============================================================================

interface VisualDirectorStartEvent {
  name: 'visual-director/workflow.start';
  data: VisualDirectorInput;
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

export const visualDirectorWorkflow = inngest.createFunction(
  {
    id: 'visual-director-workflow',
    retries: 3,
    concurrency: {
      limit: 3,
      key: 'event.data.userId',
    },
  },
  { event: 'visual-director/workflow.start' },
  async ({ event, step }) => {
    const input = event.data;
    const { taskId, userId, videoId, spine, assetRegistry, expandedBeats, finalScript } = input;

    console.log(`[VisualDirector] Starting workflow for video ${videoId}`);
    console.log(`[VisualDirector] Processing ${spine.beatCount} beats, ${spine.totalDurationSeconds}s duration`);

    // =========================================================================
    // STEP 1: SCENE PLANNING
    // =========================================================================
    const scenePlanResult = await step.run('plan-scenes', async () => {
      console.log('[VisualDirector] Step 1: Planning scenes from beats...');

      const result = await planScenes({
        userId,
        videoId,
        spine,
        assetRegistry,
        expandedBeats,
        finalScript,
      });

      console.log(`[VisualDirector] Planned ${result.scenes.length} scenes`);
      return result;
    });

    const { scenes, continuityState } = scenePlanResult;

    // =========================================================================
    // STEP 2: BUILD GENERATION QUEUES
    // =========================================================================
    const generationQueues = await step.run('build-generation-queues', async () => {
      console.log('[VisualDirector] Step 2: Building generation task queues...');

      const imageQueue: ImageGenerationTask[] = [];
      const editQueue: ImageEditingTask[] = [];
      const videoQueue: VideoGenerationTask[] = [];

      // Build asset profiles for consistency
      type AssetProfile = { assetId: string; consistencyAnchors: string[] };
      const assetProfiles: AssetProfile[] = [
        ...assetRegistry.characters.map((c: VisualDirectorInput['assetRegistry']['characters'][0]) => ({
          assetId: c.id,
          consistencyAnchors: c.visualInstructions.consistencyAnchors,
        })),
        ...assetRegistry.locations.map((l: VisualDirectorInput['assetRegistry']['locations'][0]) => ({
          assetId: l.id,
          consistencyAnchors: l.visualInstructions.consistencyAnchors,
        })),
        ...assetRegistry.objects.map((o: VisualDirectorInput['assetRegistry']['objects'][0]) => ({
          assetId: o.id,
          consistencyAnchors: o.visualInstructions.consistencyAnchors,
        })),
      ];

      let localContinuityState = createInitialContinuityState();
      let previousScene: Scene | null = null;

      for (const scene of scenes) {
        // Analyze transition from previous scene
        const analysis = await analyzeSceneTransition(
          userId,
          previousScene,
          scene,
          localContinuityState
        );

        // Create generation tasks for this scene
        const { imageTasks, editTasks } = createGenerationTasks(
          scene,
          analysis,
          localContinuityState,
          assetProfiles
        );

        imageQueue.push(...imageTasks);
        editQueue.push(...editTasks);

        // Create video generation tasks for all shots
        scene.shots.forEach(shot => {
          const taskId = `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`;
          videoQueue.push({
            taskId,
            sceneIndex: scene.sceneIndex,
            shotIndex: shot.shotIndex,
            startFrameUrl: '', // Will be filled after image generation
            motionPrompt: shot.motionPrompt,
            durationSeconds: shot.durationSeconds,
            fps: 24,
            status: 'pending',
          });
        });

        previousScene = scene;
        localContinuityState = updateContinuityState(localContinuityState, scene);
      }

      console.log(`[VisualDirector] Queue sizes - Images: ${imageQueue.length}, Edits: ${editQueue.length}, Videos: ${videoQueue.length}`);

      return { imageQueue, editQueue, videoQueue };
    });

    const { imageQueue, editQueue, videoQueue } = generationQueues;

    // =========================================================================
    // STEP 3: GENERATE NEW IMAGES
    // =========================================================================
    const generatedImages = await step.run('generate-images', async (): Promise<Record<string, string>> => {
      if (imageQueue.length === 0) {
        console.log('[VisualDirector] Step 3: No new images to generate');
        return {};
      }

      console.log(`[VisualDirector] Step 3: Generating ${imageQueue.length} new images...`);

      const results = await generateImagesBatch(userId, imageQueue);
      
      // Convert to taskId -> imageUrl map
      const imageMap: Record<string, string> = {};
      results.forEach((response, taskId) => {
        imageMap[taskId] = response.imageUrl;
      });

      console.log(`[VisualDirector] Generated ${Object.keys(imageMap).length} images`);
      return imageMap;
    });

    // =========================================================================
    // STEP 4: EDIT EXISTING IMAGES
    // =========================================================================
    const editedImages = await step.run('edit-images', async (): Promise<Record<string, string>> => {
      if (editQueue.length === 0) {
        console.log('[VisualDirector] Step 4: No images to edit');
        return {};
      }

      console.log(`[VisualDirector] Step 4: Editing ${editQueue.length} images...`);

      const results = await editImagesBatch(userId, editQueue);
      
      // Convert to taskId -> imageUrl map
      const imageMap: Record<string, string> = {};
      results.forEach((response, taskId) => {
        imageMap[taskId] = response.imageUrl;
      });

      console.log(`[VisualDirector] Edited ${Object.keys(imageMap).length} images`);
      return imageMap;
    });

    // =========================================================================
    // STEP 5: GENERATE VIDEOS FROM IMAGES
    // =========================================================================
    const generatedVideos = await step.run('generate-videos', async (): Promise<Record<string, string>> => {
      console.log(`[VisualDirector] Step 5: Generating ${videoQueue.length} videos...`);

      // Fill in start frame URLs from generated/edited images
      const allImages: Record<string, string> = { ...generatedImages, ...editedImages };
      videoQueue.forEach(task => {
        const imageUrl = allImages[task.taskId];
        if (imageUrl) {
          task.startFrameUrl = imageUrl;
        } else {
          // Fallback placeholder
          task.startFrameUrl = 'https://placeholder.vidbolt.dev/fallback.jpg';
        }
      });

      const results = await generateVideosBatch(userId, videoQueue);
      
      // Convert to taskId -> videoUrl map
      const videoMap: Record<string, string> = {};
      results.forEach((response, taskId) => {
        videoMap[taskId] = response.videoUrl;
      });

      console.log(`[VisualDirector] Generated ${Object.keys(videoMap).length} videos`);
      return videoMap;
    });

    // =========================================================================
    // STEP 6: STORE RESULTS IN METADATA
    // =========================================================================
    const output = await step.run('store-results', async () => {
      console.log('[VisualDirector] Step 6: Storing results in video metadata...');

      const supabase = getSupabaseServiceClient();

      // Build output structure
      const visualDirectorOutput: VisualDirectorOutput = {
        scenes: scenes.map(scene => ({
          ...scene,
          shots: scene.shots.map(shot => {
            const taskId = `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`;
            return {
              ...shot,
              generatedImageUrl: generatedImages[taskId] || editedImages[taskId],
              generatedVideoUrl: generatedVideos[taskId],
            };
          }),
        })),
        imageGenerationQueue: imageQueue.map(t => ({ ...t, status: 'completed' as const })),
        imageEditingQueue: editQueue.map(t => ({ ...t, status: 'completed' as const })),
        videoGenerationQueue: videoQueue.map(t => ({ 
          ...t, 
          status: 'completed' as const,
          resultUrl: generatedVideos[t.taskId],
        })),
        continuityState,
        stats: {
          totalScenes: scenes.length,
          totalShots: scenes.reduce((acc, s) => acc + s.shots.length, 0),
          newImagesNeeded: imageQueue.length,
          editsNeeded: editQueue.length,
          videosToGenerate: videoQueue.length,
        },
      };

      // Get existing metadata and merge
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;

      const updatedMetadata = {
        ...existingMetadata,
        visual_director: visualDirectorOutput,
        visual_director_completed: true,
        visual_director_completed_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('video_projects')
        .update({
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      if (error) {
        console.error('[VisualDirector] Failed to store results:', error);
        throw error;
      }

      console.log(`[VisualDirector] Stored visual director output for video ${videoId}`);

      return visualDirectorOutput;
    });

    console.log(`[VisualDirector] Workflow complete for video ${videoId}`);
    console.log(`[VisualDirector] Stats: ${output.stats.totalScenes} scenes, ${output.stats.totalShots} shots, ${output.stats.newImagesNeeded} images, ${output.stats.videosToGenerate} videos`);

    return {
      success: true,
      videoId,
      stats: output.stats,
    };
  }
);
