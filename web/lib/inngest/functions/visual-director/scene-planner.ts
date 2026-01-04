/**
 * Scene Planner
 * ============================================================================
 * Plans scenes and shots from spine beats with full context awareness.
 * The LLM has access to previous scenes and future beats for professional planning.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import { VISUAL_DIRECTOR_PROMPTS } from './prompts';
import type {
  Scene,
  Shot,
  ScenePlannerOptions,
  ScenePlanResult,
  VisualContinuityState,
  CameraMovement,
  ShotType,
  CameraAngle,
  SceneType,
} from './types';

// ============================================================================
// MAIN SCENE PLANNER
// ============================================================================

/**
 * Plan all scenes for the video with full context awareness.
 * The LLM receives previous scene context and future beat previews.
 */
export async function planScenes(
  options: ScenePlannerOptions
): Promise<ScenePlanResult> {
  const { userId, videoId, spine, assetRegistry, expandedBeats, finalScript } = options;

  console.log(`[VisualDirector] Planning scenes for video ${videoId}`);
  console.log(`[VisualDirector] Processing ${spine.beatCount} beats, ${spine.totalDurationSeconds}s duration`);

  // Initialize continuity state
  const continuityState: VisualContinuityState = {
    generatedImages: {},
    currentLocation: null,
    timeOfDay: 'unspecified',
    atmosphere: '',
    activeCharacters: [],
    colorPalette: [],
    styleNotes: 'Documentary realism, cinematic lighting',
  };

  // Build context for the LLM
  const context = buildPlanningContext(spine, assetRegistry, expandedBeats, finalScript);

  try {
    // Call LLM for scene planning with full context
    const result = await generateJSON<{ scenes: RawSceneSpec[] }>(
      userId,
      VISUAL_DIRECTOR_PROMPTS.scenePlanner,
      context
    );

    // Process and validate the scenes
    const scenes = processSceneSpecs(result.scenes, spine, continuityState);

    console.log(`[VisualDirector] Planned ${scenes.length} scenes with ${scenes.reduce((acc, s) => acc + s.shots.length, 0)} total shots`);

    return {
      scenes,
      continuityState,
    };
  } catch (error) {
    console.error('[VisualDirector] Scene planning failed, using fallback:', error);
    
    // Fallback: create basic scene structure
    const fallbackScenes = createFallbackScenes(spine, expandedBeats);
    
    return {
      scenes: fallbackScenes,
      continuityState,
    };
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build the complete context for the LLM including:
 * - Full spine structure
 * - Asset registry profiles
 * - Beat narrations
 * - The complete script
 */
function buildPlanningContext(
  spine: ScenePlannerOptions['spine'],
  assetRegistry: ScenePlannerOptions['assetRegistry'],
  expandedBeats: ScenePlannerOptions['expandedBeats'],
  finalScript: string
): string {
  // Build asset profile summaries
  const characterProfiles = assetRegistry.characters.map(c => 
    `${c.id} (${c.name}): ${c.visualInstructions.consistencyAnchors.join(', ')}`
  ).join('\n');

  const locationProfiles = assetRegistry.locations.map(l =>
    `${l.id} (${l.name}): ${l.visualInstructions.consistencyAnchors.join(', ')}`
  ).join('\n');

  // Build beat summaries with narration
  const beatSummaries = spine.beats.map((beat, i) => {
    const expanded = expandedBeats.find(e => e.beatIndex === beat.index);
    const narrationPreview = expanded?.narration.substring(0, 200) || beat.contentSummary;
    const visualCallouts = expanded?.visualCallouts.map(v => v.assetId).join(', ') || 'none';
    
    return `BEAT ${beat.index} (${beat.timing.startSeconds}s - ${beat.timing.endSeconds}s):
Summary: ${beat.contentSummary}
Key Points: ${beat.keyPoints.slice(0, 3).join('; ')}
Narration Preview: "${narrationPreview}..."
Visual Assets: ${visualCallouts}`;
  }).join('\n\n');

  return `# VIDEO VISUAL PLANNING

## TOTAL DURATION
${spine.totalDurationSeconds} seconds (${spine.beatCount} beats)

## CHARACTER PROFILES (for visual consistency)
${characterProfiles || 'No characters defined'}

## LOCATION PROFILES (for visual consistency)  
${locationProfiles || 'No locations defined'}

## OBJECT PROFILES
${assetRegistry.objects.map(o => `${o.id} (${o.name})`).join(', ') || 'No objects defined'}

## BEAT-BY-BEAT BREAKDOWN
${beatSummaries}

## COMPLETE SCRIPT (for narrative context)
${finalScript.substring(0, 5000)}${finalScript.length > 5000 ? '...[truncated]' : ''}

---

Now plan the visual scenes. Group beats into logical scenes based on location and narrative flow.
For each scene, specify the shots needed with all required fields.
Remember: camera movements must be SUBTLE for AI video generation compatibility.

Return JSON with "scenes" array as specified in the system prompt.`;
}

// ============================================================================
// SCENE PROCESSING
// ============================================================================

interface RawSceneSpec {
  sceneIndex: number;
  sceneType: string;
  summary: string;
  primaryLocation: string | null;
  characters: string[];
  beatIndices: number[];
  continuityNotes: string;
  shots: RawShotSpec[];
}

interface RawShotSpec {
  shotIndex: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  durationSeconds: number;
  visualDescription: string;
  assetReferences: string[];
  visualElements: string[];
  lighting: { type: string; mood: string; direction?: string };
  atmosphere: string;
  generationStrategy: string;
  editSourceShotIndex?: number;
  motionPrompt: string;
}

/**
 * Process raw scene specs from LLM into validated Scene objects
 */
function processSceneSpecs(
  rawScenes: RawSceneSpec[],
  spine: ScenePlannerOptions['spine'],
  continuityState: VisualContinuityState
): Scene[] {
  let runningTime = 0;

  return rawScenes.map((rawScene, sceneIdx) => {
    // Process shots for this scene
    const shots: Shot[] = rawScene.shots.map((rawShot, shotIdx) => {
      const shot: Shot = {
        shotIndex: rawShot.shotIndex || shotIdx + 1,
        shotType: validateShotType(rawShot.shotType),
        cameraAngle: validateCameraAngle(rawShot.cameraAngle),
        cameraMovement: validateCameraMovement(rawShot.cameraMovement),
        durationSeconds: Math.min(Math.max(rawShot.durationSeconds || 3, 2), 8),
        timing: {
          startSeconds: runningTime,
          endSeconds: runningTime + (rawShot.durationSeconds || 3),
        },
        visualDescription: rawShot.visualDescription || '',
        assetReferences: rawShot.assetReferences || [],
        visualElements: rawShot.visualElements || [],
        lighting: {
          type: (rawShot.lighting?.type as 'natural' | 'artificial' | 'mixed') || 'natural',
          mood: rawShot.lighting?.mood || 'neutral',
          direction: rawShot.lighting?.direction,
        },
        atmosphere: rawShot.atmosphere || '',
        generationStrategy: rawShot.generationStrategy === 'edit_existing' ? 'edit_existing' : 'create_new',
        editSourceShotIndex: rawShot.editSourceShotIndex,
        motionPrompt: rawShot.motionPrompt || 'Camera remains static',
      };

      runningTime = shot.timing.endSeconds;
      return shot;
    });

    // Calculate scene timing
    const sceneStartTime = shots.length > 0 ? shots[0].timing.startSeconds : runningTime;
    const sceneEndTime = shots.length > 0 ? shots[shots.length - 1].timing.endSeconds : runningTime;

    // Get narration from beats
    const beatIndices = rawScene.beatIndices || [sceneIdx];
    const narrationParts = beatIndices.map(bi => {
      const beat = spine.beats.find(b => b.index === bi);
      return beat?.contentSummary || '';
    });

    const scene: Scene = {
      sceneIndex: rawScene.sceneIndex || sceneIdx + 1,
      sceneType: validateSceneType(rawScene.sceneType),
      timing: {
        startSeconds: sceneStartTime,
        endSeconds: sceneEndTime,
        durationSeconds: sceneEndTime - sceneStartTime,
      },
      beatIndices: beatIndices,
      primaryLocation: rawScene.primaryLocation,
      characters: rawScene.characters || [],
      summary: rawScene.summary || '',
      narrationText: narrationParts.join(' '),
      shots,
      continuityNotes: rawScene.continuityNotes || '',
    };

    // Update continuity state
    if (rawScene.primaryLocation) {
      continuityState.currentLocation = rawScene.primaryLocation;
    }
    if (rawScene.characters?.length) {
      continuityState.activeCharacters = rawScene.characters;
    }

    return scene;
  });
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateShotType(raw: string): ShotType {
  const valid: ShotType[] = ['extreme_wide', 'wide', 'medium_wide', 'medium', 'medium_close', 'close_up', 'extreme_close'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_') as ShotType;
  return valid.includes(normalized) ? normalized : 'medium';
}

function validateCameraAngle(raw: string): CameraAngle {
  const valid: CameraAngle[] = ['eye_level', 'low_angle', 'high_angle', 'birds_eye', 'worms_eye', 'dutch_angle'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_') as CameraAngle;
  return valid.includes(normalized) ? normalized : 'eye_level';
}

function validateCameraMovement(raw: string): CameraMovement {
  const valid: CameraMovement[] = [
    'static', 'slow_pan_left', 'slow_pan_right', 'slow_zoom_in', 
    'slow_zoom_out', 'slow_tilt_up', 'slow_tilt_down', 'slow_dolly_in', 'slow_dolly_out'
  ];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_') as CameraMovement;
  return valid.includes(normalized) ? normalized : 'static';
}

function validateSceneType(raw: string): SceneType {
  const valid: SceneType[] = ['establishing', 'action', 'dialogue', 'transition', 'montage', 'emotional_beat'];
  const normalized = raw?.toLowerCase().replace(/[- ]/g, '_') as SceneType;
  return valid.includes(normalized) ? normalized : 'dialogue';
}

// ============================================================================
// FALLBACK SCENE GENERATION
// ============================================================================

/**
 * Create basic fallback scenes if LLM planning fails
 */
function createFallbackScenes(
  spine: ScenePlannerOptions['spine'],
  expandedBeats: ScenePlannerOptions['expandedBeats']
): Scene[] {
  const scenes: Scene[] = [];
  let runningTime = 0;

  // Group every 3-4 beats into a scene
  const beatsPerScene = 3;
  
  for (let i = 0; i < spine.beats.length; i += beatsPerScene) {
    const sceneBeats = spine.beats.slice(i, i + beatsPerScene);
    const sceneIndex = scenes.length + 1;
    
    const sceneDuration = sceneBeats.reduce((acc, b) => acc + b.timing.durationSeconds, 0);
    const shotDuration = sceneDuration / sceneBeats.length;
    
    const shots: Shot[] = sceneBeats.map((beat, shotIdx) => {
      const shot: Shot = {
        shotIndex: shotIdx + 1,
        shotType: shotIdx === 0 ? 'wide' : 'medium',
        cameraAngle: 'eye_level',
        cameraMovement: 'static',
        durationSeconds: Math.min(shotDuration, 6),
        timing: {
          startSeconds: runningTime,
          endSeconds: runningTime + shotDuration,
        },
        visualDescription: `Visual representation of: ${beat.contentSummary.substring(0, 100)}`,
        assetReferences: [],
        visualElements: [],
        lighting: { type: 'natural', mood: 'neutral' },
        atmosphere: '',
        generationStrategy: 'create_new',
        motionPrompt: 'Camera remains static',
      };
      
      runningTime += shotDuration;
      return shot;
    });

    const narrations = sceneBeats.map(b => {
      const expanded = expandedBeats.find(e => e.beatIndex === b.index);
      return expanded?.narration.substring(0, 100) || b.contentSummary;
    });

    scenes.push({
      sceneIndex,
      sceneType: sceneIndex === 1 ? 'establishing' : 'dialogue',
      timing: {
        startSeconds: shots[0].timing.startSeconds,
        endSeconds: shots[shots.length - 1].timing.endSeconds,
        durationSeconds: sceneDuration,
      },
      beatIndices: sceneBeats.map(b => b.index),
      primaryLocation: null,
      characters: [],
      summary: `Scene covering beats ${sceneBeats[0].index}-${sceneBeats[sceneBeats.length - 1].index}`,
      narrationText: narrations.join(' '),
      shots,
      continuityNotes: '',
    });
  }

  return scenes;
}
