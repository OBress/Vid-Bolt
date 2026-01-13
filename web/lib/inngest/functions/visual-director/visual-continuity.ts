/**
 * Visual Continuity Manager
 * ============================================================================
 * Manages visual consistency across scenes by tracking generated images,
 * determining when to create new images vs. edit existing ones,
 * and ensuring character/location consistency.
 */

import type {
  Scene,
  Shot,
  VisualContinuityState,
  TransitionAnalysis,
  ImageGenerationTask,
  ImageEditingTask,
} from './types';
import { generateJSON } from '@/lib/ai/openrouter';
import { VISUAL_DIRECTOR_PROMPTS } from './prompts';

// ============================================================================
// CONTINUITY STATE MANAGEMENT
// ============================================================================

/**
 * Create initial continuity state
 */
export function createInitialContinuityState(): VisualContinuityState {
  return {
    generatedImages: {},
    currentLocation: null,
    timeOfDay: 'unspecified',
    atmosphere: '',
    activeCharacters: [],
    colorPalette: [],
    styleNotes: 'Documentary realism, cinematic lighting',
  };
}

/**
 * Update continuity state after a scene is processed
 */
export function updateContinuityState(
  state: VisualContinuityState,
  scene: Scene,
  generatedImageUrl?: string
): VisualContinuityState {
  const updated = { ...state };

  // Update location if changed
  if (scene.primaryLocation) {
    updated.currentLocation = scene.primaryLocation;
  }

  // Update active characters
  if (scene.characters.length > 0) {
    updated.activeCharacters = scene.characters;
  }

  // Store generated image reference
  if (generatedImageUrl && scene.shots.length > 0) {
    const lastShot = scene.shots[scene.shots.length - 1];
    const key = `scene-${scene.sceneIndex}-shot-${lastShot.shotIndex}`;
    updated.generatedImages[key] = {
      url: generatedImageUrl,
      sceneIndex: scene.sceneIndex,
      shotIndex: lastShot.shotIndex,
      visualDescription: lastShot.visualDescription,
    };
  }

  return updated;
}

// ============================================================================
// TRANSITION ANALYSIS
// ============================================================================

/**
 * Analyze the transition between two scenes to determine generation strategy
 */
export async function analyzeSceneTransition(
  userId: string,
  previousScene: Scene | null,
  currentScene: Scene,
  state: VisualContinuityState
): Promise<TransitionAnalysis> {
  // First scene - always create new
  if (!previousScene) {
    return {
      canReuseImages: false,
      requiredChanges: ['First scene - all new'],
      mustPreserve: [],
      strategy: 'create_all_new',
    };
  }

  // Same location - likely can edit existing
  const sameLocation = previousScene.primaryLocation === currentScene.primaryLocation;
  
  // Same characters
  const sameCharacters = arraysEqual(
    previousScene.characters.sort(),
    currentScene.characters.sort()
  );

  // Quick heuristic check
  if (sameLocation && sameCharacters) {
    return {
      canReuseImages: true,
      requiredChanges: determineChanges(previousScene, currentScene),
      mustPreserve: determinePreservation(previousScene, currentScene, state),
      strategy: 'edit_existing',
    };
  }

  // Different location - need new images
  if (!sameLocation) {
    return {
      canReuseImages: false,
      requiredChanges: ['Location change', 'New establishing shot needed'],
      mustPreserve: state.activeCharacters.map(c => `Character consistency: ${c}`),
      strategy: 'create_all_new',
    };
  }

  // Mixed - some can be edited, some need new
  return {
    canReuseImages: true,
    requiredChanges: determineChanges(previousScene, currentScene),
    mustPreserve: determinePreservation(previousScene, currentScene, state),
    strategy: 'mix',
  };
}

/**
 * Determine what needs to change between scenes
 */
function determineChanges(prev: Scene, curr: Scene): string[] {
  const changes: string[] = [];

  // Check character changes
  const newChars = curr.characters.filter(c => !prev.characters.includes(c));
  const removedChars = prev.characters.filter(c => !curr.characters.includes(c));

  if (newChars.length > 0) {
    changes.push(`Add characters: ${newChars.join(', ')}`);
  }
  if (removedChars.length > 0) {
    changes.push(`Remove characters: ${removedChars.join(', ')}`);
  }

  // Check scene type changes
  if (prev.sceneType !== curr.sceneType) {
    changes.push(`Scene type change: ${prev.sceneType} → ${curr.sceneType}`);
  }

  // If nothing specific, note general continuity
  if (changes.length === 0) {
    changes.push('Minor adjustments for new content');
  }

  return changes;
}

/**
 * Determine what must be preserved between scenes
 */
function determinePreservation(
  prev: Scene,
  curr: Scene,
  state: VisualContinuityState
): string[] {
  const preserve: string[] = [];

  // Same location - preserve location details
  if (prev.primaryLocation === curr.primaryLocation && prev.primaryLocation) {
    preserve.push(`Location: ${prev.primaryLocation}`);
  }

  // Preserve consistent characters
  const consistentChars = prev.characters.filter(c => curr.characters.includes(c));
  consistentChars.forEach(c => {
    preserve.push(`Character appearance: ${c}`);
  });

  // Preserve established atmosphere if similar scene type
  if (prev.sceneType === curr.sceneType && state.atmosphere) {
    preserve.push(`Atmosphere: ${state.atmosphere}`);
  }

  // Preserve time of day
  if (state.timeOfDay !== 'unspecified') {
    preserve.push(`Time of day: ${state.timeOfDay}`);
  }

  return preserve;
}

// ============================================================================
// GENERATION TASK CREATION
// ============================================================================

/**
 * Create generation tasks for a scene based on transition analysis
 */
export function createGenerationTasks(
  scene: Scene,
  analysis: TransitionAnalysis,
  state: VisualContinuityState,
  assetProfiles: Array<{
    assetId: string;
    consistencyAnchors: string[];
  }>
): {
  imageTasks: ImageGenerationTask[];
  editTasks: ImageEditingTask[];
} {
  const imageTasks: ImageGenerationTask[] = [];
  const editTasks: ImageEditingTask[] = [];

  scene.shots.forEach((shot) => {
    const taskId = `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`;

    if (shot.generationStrategy === 'create_new' || analysis.strategy === 'create_all_new') {
      // Create new image
      imageTasks.push({
        taskId,
        sceneIndex: scene.sceneIndex,
        shotIndex: shot.shotIndex,
        prompt: buildImagePrompt(shot, scene, assetProfiles),
        negativePrompt: 'blurry, distorted, bad anatomy, text, watermark, low quality, noise, artifacts',
        aspectRatio: (scene as any).aspectRatio || '16:9',
        style: state.styleNotes,
        referenceImages: findReferenceImages(shot, state),
        assetProfiles: assetProfiles.filter(a => shot.assetReferences.includes(a.assetId)),
        status: 'pending',
      });
    } else if (shot.generationStrategy === 'edit_existing') {
      // Edit existing image
      const sourceImage = findSourceImage(shot, scene, state);
      if (sourceImage) {
        editTasks.push({
          taskId,
          sceneIndex: scene.sceneIndex,
          shotIndex: shot.shotIndex,
          sourceImageUrl: sourceImage,
          editPrompt: buildEditPrompt(shot, analysis),
          preserveElements: analysis.mustPreserve,
          changeElements: analysis.requiredChanges,
          status: 'pending',
        });
      } else {
        // Fallback to new image if no source found
        imageTasks.push({
          taskId,
          sceneIndex: scene.sceneIndex,
          shotIndex: shot.shotIndex,
          prompt: buildImagePrompt(shot, scene, assetProfiles),
          negativePrompt: 'blurry, distorted, bad anatomy, text, watermark, low quality, noise, artifacts',
          aspectRatio: (scene as any).aspectRatio || '16:9',
          style: state.styleNotes,
          referenceImages: [],
          assetProfiles: assetProfiles.filter(a => shot.assetReferences.includes(a.assetId)),
          status: 'pending',
        });
      }
    }
  });

  return { imageTasks, editTasks };
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build detailed image generation prompt from shot details
 */
function buildImagePrompt(
  shot: Shot,
  scene: Scene,
  assetProfiles: Array<{ assetId: string; consistencyAnchors: string[] }>
): string {
  const parts: string[] = [];

  // Shot composition
  parts.push(`${shot.shotType.replace(/_/g, ' ')} shot`);
  parts.push(`${shot.cameraAngle.replace(/_/g, ' ')} angle`);

  // Visual description
  if (shot.visualDescription) {
    parts.push(shot.visualDescription);
  }

  // Lighting
  parts.push(`${shot.lighting.mood} lighting`);
  if (shot.lighting.direction) {
    parts.push(shot.lighting.direction);
  }

  // Atmosphere
  if (shot.atmosphere) {
    parts.push(shot.atmosphere);
  }

  // Asset consistency anchors
  shot.assetReferences.forEach(assetId => {
    const profile = assetProfiles.find(a => a.assetId === assetId);
    if (profile && profile.consistencyAnchors.length > 0) {
      parts.push(profile.consistencyAnchors.join(', '));
    }
  });

  // Visual elements
  if (shot.visualElements.length > 0) {
    parts.push(shot.visualElements.join(', '));
  }

  return parts.join('. ');
}

/**
 * Build edit prompt for image editing
 */
function buildEditPrompt(shot: Shot, analysis: TransitionAnalysis): string {
  const changes = analysis.requiredChanges.join('. ');
  return `Modify the image while maintaining visual consistency. Changes needed: ${changes}. New composition: ${shot.visualDescription}`;
}

/**
 * Find reference images for consistency
 */
function findReferenceImages(shot: Shot, state: VisualContinuityState): string[] {
  const refs: string[] = [];

  // Look for previous images of same assets
  shot.assetReferences.forEach(assetId => {
    Object.values(state.generatedImages).forEach(img => {
      if (img.visualDescription.includes(assetId)) {
        refs.push(img.url);
      }
    });
  });

  return refs.slice(0, 3); // Limit to 3 references
}

/**
 * Find source image for editing
 */
function findSourceImage(
  shot: Shot,
  scene: Scene,
  state: VisualContinuityState
): string | null {
  // Try to find from explicitly specified source
  if (shot.editSourceShotIndex !== undefined) {
    const key = `scene-${scene.sceneIndex - 1}-shot-${shot.editSourceShotIndex}`;
    const source = state.generatedImages[key];
    if (source) return source.url;
  }

  // Try to find most recent image from same location
  const candidates = Object.values(state.generatedImages)
    .filter(img => img.sceneIndex < scene.sceneIndex)
    .sort((a, b) => b.sceneIndex - a.sceneIndex);

  return candidates[0]?.url || null;
}

// ============================================================================
// UTILITIES
// ============================================================================

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}
