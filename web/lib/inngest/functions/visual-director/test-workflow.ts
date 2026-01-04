/**
 * Visual Director Test Workflow
 * ============================================================================
 * Inngest function for testing the visual director pipeline.
 * 
 * ARCHITECTURE: Chunked processing like the writing workflow
 * - Phase 1: Parse script into segments
 * - Phase 2: Generate high-level scene structure (no prompts yet)
 * - Phase 3: Process each scene individually for detailed shot prompts
 * - Phase 4: Assemble final output
 * 
 * This approach avoids context window issues and yields better results.
 */

import { inngest } from '../../client';
import { getSupabaseServiceClient, updateTaskStatus } from '../shared';
import { generateJSON } from '@/lib/ai/openrouter';
import { VISUAL_DIRECTOR_PROMPTS } from './prompts';

// ============================================================================
// TYPES
// ============================================================================

interface TestWorkflowInput {
  taskId: string;
  userId: string;
  scriptText: string;
}

interface ScriptSegment {
  index: number;
  text: string;
  wordCount: number;
  estimatedDurationSeconds: number;
}

interface SceneStructure {
  sceneIndex: number;
  sceneType: string;
  summary: string;
  segmentIndices: number[];
  estimatedDurationSeconds: number;
}

interface ProcessedShot {
  shotIndex: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  imagePrompt: string;
  imageEditPrompt: string | null;
  videoMotionPrompt: string;
  generationStrategy: "create_new" | "edit_existing";
}

interface ProcessedScene {
  sceneIndex: number;
  sceneType: string;
  summary: string;
  narration: string;
  duration: number;
  shots: ProcessedShot[];
}

// ============================================================================
// WORKFLOW
// ============================================================================

export const visualDirectorTestWorkflow = inngest.createFunction(
  {
    id: 'visual-director-test-workflow',
    retries: 2,
    concurrency: {
      limit: 5,
      key: 'event.data.userId',
    },
  },
  { event: 'visual-director/test.start' },
  async ({ event, step }) => {
    const { taskId, userId, scriptText } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[VisualDirectorTest] Starting chunked workflow for task ${taskId}`);

    // =========================================================================
    // PHASE 1: PARSE SCRIPT INTO SEGMENTS
    // =========================================================================
    const segments = await step.run('parse-segments', async (): Promise<ScriptSegment[]> => {
      await updateTaskStatus(taskId, {
        status: 'running',
        current_phase: 'preprocessing',
        current_step: 'Parsing script...',
        progress_percent: 5,
      });

      // Split by double newlines (paragraphs) or single newlines if no doubles
      let paragraphs = scriptText.split(/\n\n+/).filter((p: string) => p.trim().length > 0);
      if (paragraphs.length < 3) {
        paragraphs = scriptText.split(/\n+/).filter((p: string) => p.trim().length > 0);
      }

      // Create segments with timing estimates (150 words per minute)
      return paragraphs.map((text: string, index: number) => {
        const wordCount = text.split(/\s+/).length;
        const estimatedDurationSeconds = Math.ceil((wordCount / 150) * 60);
        return {
          index,
          text: text.trim(),
          wordCount,
          estimatedDurationSeconds: Math.max(estimatedDurationSeconds, 3), // Minimum 3 seconds
        };
      });
    });

    console.log(`[VisualDirectorTest] Parsed ${segments.length} segments`);

    // =========================================================================
    // PHASE 2: GENERATE HIGH-LEVEL SCENE STRUCTURE
    // =========================================================================
    const sceneStructures = await step.run('plan-scene-structure', async (): Promise<SceneStructure[]> => {
      await updateTaskStatus(taskId, {
        current_step: 'Planning scene structure...',
        progress_percent: 15,
      });

      const segmentSummaries = segments.map(s => 
        `[${s.index}] (${s.estimatedDurationSeconds}s): ${s.text.substring(0, 100)}...`
      ).join('\n');

      const totalDuration = segments.reduce((acc, s) => acc + s.estimatedDurationSeconds, 0);

      const prompt = `# SCENE STRUCTURE PLANNING

You are planning the visual scene structure for a ${totalDuration} second video.

## SCRIPT SEGMENTS
${segmentSummaries}

## TASK
Group these segments into logical SCENES. Each scene should:
- Cover 1-3 related segments
- Have a coherent visual setting/location
- Last 10-30 seconds typically

Return JSON:
{
  "scenes": [
    {
      "sceneIndex": 1,
      "sceneType": "establishing|action|dialogue|transition|montage|emotional_beat",
      "summary": "Brief description of what this scene covers",
      "segmentIndices": [0, 1],  // Which segment indices this scene covers
      "estimatedDurationSeconds": 15
    }
  ]
}

IMPORTANT: Cover ALL ${segments.length} segments. Every segment must belong to exactly one scene.`;

      const result = await generateJSON<{ scenes: SceneStructure[] }>(
        userId,
        'You are a visual director planning scene structure. Return only valid JSON.',
        prompt,
        { maxTokens: 4096 }
      );

      return result.scenes;
    });

    console.log(`[VisualDirectorTest] Planned ${sceneStructures.length} scenes`);

    // =========================================================================
    // PHASE 3: PROCESS EACH SCENE FOR DETAILED SHOTS
    // =========================================================================
    const processedScenes: ProcessedScene[] = [];

    for (let i = 0; i < sceneStructures.length; i++) {
      const scene = sceneStructures[i];
      const progressPercent = 20 + Math.floor((i / sceneStructures.length) * 60);

      const processedScene = await step.run(`process-scene-${scene.sceneIndex}`, async (): Promise<ProcessedScene> => {
        await updateTaskStatus(taskId, {
          current_step: `Processing scene ${scene.sceneIndex} of ${sceneStructures.length}...`,
          progress_percent: progressPercent,
        });

        // Get the actual text for this scene's segments
        const sceneText = scene.segmentIndices
          .map(idx => segments[idx]?.text || '')
          .join('\n\n');

        const prompt = `# SCENE ${scene.sceneIndex} SHOT PLANNING

## SCENE INFO
- Type: ${scene.sceneType}
- Summary: ${scene.summary}
- Duration: ~${scene.estimatedDurationSeconds} seconds

## NARRATION TEXT FOR THIS SCENE
${sceneText}

## TASK
Create 2-4 shots for this scene. Each shot must be between 1 and 5 seconds ONLY.

For EACH shot, provide an EXTREMELY DETAILED image prompt (150-250 words) that includes:
1. SUBJECT: For people - exact age, build, facial features, skin tone, hair, clothing details, expression, posture
2. ENVIRONMENT: Architectural details, furniture, objects, textures, colors, depth
3. LIGHTING: Light source type/direction, shadows, color temperature, atmosphere
4. CINEMATOGRAPHY: Exact shot type, camera angle, depth of field (f-stop), composition
5. STYLE: Color grading, camera model reference, quality markers (8K, photorealistic, etc.)

Return JSON:
{
  "shots": [
    {
      "shotIndex": 1,
      "shotType": "extreme_wide|wide|medium_wide|medium|medium_close|close_up|extreme_close",
      "cameraAngle": "eye_level|low_angle|high_angle|birds_eye|worms_eye|dutch_angle",
      "cameraMovement": "static|slow_pan_left|slow_pan_right|slow_zoom_in|slow_zoom_out|slow_tilt_up|slow_tilt_down",
      "durationSeconds": 3,  // MUST be between 1 and 5 seconds
      "visualDescription": "EXTREMELY DETAILED 150-250 word prompt...",
      "motionPrompt": "Camera slowly zooms in, subtle movement",
      "generationStrategy": "create_new"
    }
  ]
}`;

        const result = await generateJSON<{ shots: any[] }>(
          userId,
          VISUAL_DIRECTOR_PROMPTS.imagePromptGenerator,
          prompt,
          { maxTokens: 8192 }
        );

        const processedShots: ProcessedShot[] = (result.shots || []).map((shot: any, idx: number) => ({
          shotIndex: shot.shotIndex || idx + 1,
          shotType: validateShotType(shot.shotType),
          cameraAngle: validateCameraAngle(shot.cameraAngle),
          cameraMovement: validateCameraMovement(shot.cameraMovement),
          duration: Math.min(Math.max(shot.durationSeconds || 3, 1), 5), // Enforce 1-5 seconds
          imagePrompt: shot.visualDescription || 'Documentary shot',
          imageEditPrompt: shot.generationStrategy === 'edit_existing'
            ? `Edit based on: ${shot.visualDescription?.substring(0, 100)}`
            : null,
          videoMotionPrompt: shot.motionPrompt || 'Camera remains static',
          generationStrategy: (shot.generationStrategy === 'edit_existing' ? 'edit_existing' : 'create_new') as "create_new" | "edit_existing",
        }));

        // Calculate scene duration as sum of shot durations
        const sceneDuration = processedShots.reduce((acc: number, shot: any) => acc + shot.duration, 0);

        return {
          sceneIndex: scene.sceneIndex,
          sceneType: scene.sceneType,
          summary: scene.summary,
          narration: sceneText.substring(0, 200),
          duration: sceneDuration,
          shots: processedShots,
        };
      });

      processedScenes.push(processedScene);
    }

    console.log(`[VisualDirectorTest] Processed all ${processedScenes.length} scenes`);

    // =========================================================================
    // PHASE 4: ASSEMBLE AND STORE RESULTS
    // =========================================================================
    const stats = await step.run('calculate-stats', async () => {
      await updateTaskStatus(taskId, {
        current_step: 'Assembling results...',
        progress_percent: 90,
      });

      return {
        totalScenes: processedScenes.length,
        totalShots: processedScenes.reduce((acc, s) => acc + s.shots.length, 0),
        newImagesNeeded: processedScenes.reduce(
          (acc, s) => acc + s.shots.filter(shot => shot.generationStrategy === 'create_new').length,
          0
        ),
        editsNeeded: processedScenes.reduce(
          (acc, s) => acc + s.shots.filter(shot => shot.generationStrategy === 'edit_existing').length,
          0
        ),
        totalDurationSeconds: processedScenes.reduce((acc, s) => acc + s.duration, 0),
      };
    });

    // Store results (outside step for guaranteed execution)
    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        current_step: 'Complete',
        progress_percent: 100,
        output_data: {
          scenes: processedScenes,
          stats,
        },
      })
      .eq('id', taskId);

    console.log(`[VisualDirectorTest] Workflow complete: ${stats.totalScenes} scenes, ${stats.totalShots} shots, ${stats.totalDurationSeconds}s total`);

    return {
      success: true,
      scenes: processedScenes,
      stats,
    };
  }
);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateShotType(raw: string): string {
  const valid = ['extreme_wide', 'wide', 'medium_wide', 'medium', 'medium_close', 'close_up', 'extreme_close'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_');
  return valid.includes(normalized) ? normalized : 'medium';
}

function validateCameraAngle(raw: string): string {
  const valid = ['eye_level', 'low_angle', 'high_angle', 'birds_eye', 'worms_eye', 'dutch_angle'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_');
  return valid.includes(normalized) ? normalized : 'eye_level';
}

function validateCameraMovement(raw: string): string {
  const valid = ['static', 'slow_pan_left', 'slow_pan_right', 'slow_zoom_in', 'slow_zoom_out', 'slow_tilt_up', 'slow_tilt_down', 'slow_dolly_in', 'slow_dolly_out'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_');
  return valid.includes(normalized) ? normalized : 'static';
}
