/**
 * Asset Prompt Builder
 * ============================================================================
 * Utility functions to transform asset profiles (characters, locations, objects)
 * into detailed image generation prompts for the GPU API.
 *
 * These prompts are designed to produce consistent, high-quality reference images
 * that maintain visual consistency across all generated content.
 */

import type {
  CharacterProfile,
  LocationProfile,
  ObjectProfile,
} from '@/lib/queues/writing/types';

/** Default base style suffix when no style override is provided */
const DEFAULT_IMAGE_STYLE = 'photorealistic, high detail, professional lighting, cinematic color grading';

// ============================================================================
// CHARACTER PROMPT BUILDING
// ============================================================================

/**
 * Build a comprehensive image generation prompt from a CharacterProfile.
 *
 * @param profile - The character profile with visual descriptors
 * @param options - Optional settings for prompt generation
 * @returns A detailed prompt string for AI image generation
 */
export function buildCharacterPrompt(
  profile: CharacterProfile,
  options: { aspectRatio?: '16:9' | '9:16'; expression?: string; styleOverride?: string } = {}
): string {
  const parts: string[] = [];

  const pc = profile.physicalCharacteristics;
  const expression = options.expression || 'neutral';
  const expressionDesc = profile.expressions[expression as keyof typeof profile.expressions] || profile.expressions.neutral;

  // Base descriptor
  parts.push(`Portrait of ${profile.name}`);

  // Demographics
  const demo = pc.demographics;
  parts.push(`${demo.age} year old ${demo.gender}`);
  if (demo.ethnicity) parts.push(`${demo.ethnicity}`);
  if (demo.nationality) parts.push(`${demo.nationality}`);

  // Body Structure
  const body = pc.bodyStructure;
  parts.push(`${body.height}, ${body.build} build`);
  if (body.posture) parts.push(`${body.posture} posture`);

  // Face Structure
  const face = pc.faceStructure;
  parts.push(`${face.faceShape} face shape`);
  if (face.forehead) parts.push(`${face.forehead} forehead`);
  if (face.cheekbones) parts.push(`${face.cheekbones} cheekbones`);
  if (face.jaw) parts.push(`${face.jaw} jaw`);
  parts.push(`${face.nose} nose`);

  // Face Features
  const features = pc.faceFeatures;
  parts.push(`${features.eyeColor} ${features.eyeShape} eyes`);
  parts.push(`${features.eyebrows} eyebrows`);
  parts.push(`${features.mouthDescription}`);
  parts.push(`${features.skinTone} skin`);
  if (features.skinTexture) parts.push(`${features.skinTexture} skin texture`);
  if (features.notableFeatures) parts.push(features.notableFeatures);

  // Hair
  const hair = pc.hair;
  parts.push(`${hair.color} ${hair.texture} ${hair.length} hair in ${hair.style} style`);
  if (hair.facialHair) parts.push(hair.facialHair);

  // Distinguishing Features
  if (pc.distinguishingFeatures?.length) {
    parts.push(...pc.distinguishingFeatures);
  }

  // Expression
  parts.push(`${expressionDesc} expression`);

  // Wardrobe
  parts.push(`wearing ${profile.wardrobe.defaultOutfit}`);

  // Consistency Anchors (MUST include)
  if (profile.visualInstructions?.consistencyAnchors?.length) {
    parts.push(...profile.visualInstructions.consistencyAnchors);
  }

  // Style Notes
  if (profile.visualInstructions?.styleNotes) {
    parts.push(profile.visualInstructions.styleNotes);
  }

  // Base style — uses Creative Manifest override or default
  parts.push(options.styleOverride || DEFAULT_IMAGE_STYLE);

  // Filter out empty parts and join
  return parts.filter((p) => p && p.trim()).join(', ');
}

/**
 * Build a negative prompt from character prohibitions.
 */
export function buildCharacterNegativePrompt(profile: CharacterProfile): string {
  const negatives: string[] = [];

  if (profile.visualInstructions?.prohibitions?.length) {
    negatives.push(...profile.visualInstructions.prohibitions);
  }

  // Standard negatives for quality
  negatives.push(
    'blurry',
    'low quality',
    'distorted',
    'deformed',
    'bad anatomy',
    'watermark',
    'text',
    'signature'
  );

  return negatives.filter((n) => n && n.trim()).join(', ');
}

// ============================================================================
// LOCATION PROMPT BUILDING
// ============================================================================

/**
 * Build a comprehensive image generation prompt from a LocationProfile.
 *
 * @param profile - The location profile with visual descriptors
 * @param options - Optional settings for prompt generation
 * @returns A detailed prompt string for AI image generation
 */
export function buildLocationPrompt(
  profile: LocationProfile,
  options: { timeOfDay?: string; weather?: string; styleOverride?: string } = {}
): string {
  const parts: string[] = [];

  // Base descriptor
  parts.push(`${profile.name}, ${profile.type}`);

  // Era if specified
  if (profile.era) {
    parts.push(`${profile.era} era`);
  }

  // Scale
  parts.push(`${profile.scale} scale`);

  // Essence (one-sentence description)
  parts.push(profile.essence);

  // Structural Details
  const structure = profile.structuralDetails;
  if (structure.architectureStyle) parts.push(`${structure.architectureStyle} architecture`);
  parts.push(`made of ${structure.materials}`);
  if (structure.shape) parts.push(`${structure.shape} shape`);
  parts.push(`in ${structure.condition} condition`);
  if (structure.keyElements?.length) {
    parts.push(`featuring ${structure.keyElements.join(', ')}`);
  }

  // Environmental Details
  const env = profile.environmentalDetails;
  parts.push(`${env.groundFloor} ground`);
  if (env.walls) parts.push(`${env.walls} walls`);
  parts.push(`${env.ceilingSky} ceiling/sky`);
  if (env.vegetation) parts.push(`${env.vegetation} vegetation`);
  if (options.weather || env.weatherAtmosphere) {
    parts.push(`${options.weather || env.weatherAtmosphere} weather`);
  }

  // Lighting
  const lighting = profile.lighting;
  parts.push(`${lighting.natural} natural lighting`);
  if (lighting.artificial) parts.push(`${lighting.artificial} artificial lighting`);
  parts.push(`${lighting.mood} mood`);

  // Ambient Details
  const ambient = profile.ambientDetails;
  if (ambient.objectsDebris) parts.push(ambient.objectsDebris);
  if (ambient.movementActivity) parts.push(ambient.movementActivity);

  // Consistency Anchors
  if (profile.visualInstructions?.consistencyAnchors?.length) {
    parts.push(...profile.visualInstructions.consistencyAnchors);
  }

  // Style Notes
  if (profile.visualInstructions?.styleNotes) {
    parts.push(profile.visualInstructions.styleNotes);
  }

  // Base style — uses Creative Manifest override or default
  parts.push(options.styleOverride || 'photorealistic, cinematic composition, high detail, professional photography');

  return parts.filter((p) => p && p.trim()).join(', ');
}

/**
 * Build a negative prompt from location prohibitions.
 */
export function buildLocationNegativePrompt(profile: LocationProfile): string {
  const negatives: string[] = [];

  if (profile.visualInstructions?.prohibitions?.length) {
    negatives.push(...profile.visualInstructions.prohibitions);
  }

  // Standard negatives
  negatives.push(
    'blurry',
    'low quality',
    'distorted',
    'watermark',
    'text',
    'people',
    'humans',
    'cartoon'
  );

  return negatives.filter((n) => n && n.trim()).join(', ');
}

// ============================================================================
// OBJECT PROMPT BUILDING
// ============================================================================

/**
 * Build a comprehensive image generation prompt from an ObjectProfile.
 *
 * @param profile - The object profile with visual descriptors
 * @returns A detailed prompt string for AI image generation
 */
export function buildObjectPrompt(
  profile: ObjectProfile,
  options: { styleOverride?: string } = {}
): string {
  const parts: string[] = [];

  // Base descriptor
  parts.push(`${profile.name}, ${profile.type}`);

  // Physical Description
  const phys = profile.physicalDescription;
  parts.push(phys.detailedDescription);
  parts.push(`${phys.dimensions}`);
  parts.push(`${phys.shape} shape`);
  parts.push(`made of ${phys.materials}`);
  parts.push(`${phys.color} color`);
  parts.push(`in ${phys.condition} condition`);

  // Notable Features
  if (phys.notableFeatures?.length) {
    parts.push(...phys.notableFeatures);
  }

  // Relatable Comparison
  if (phys.relatableComparison) {
    parts.push(`(${phys.relatableComparison})`);
  }

  // Consistency Anchors
  if (profile.visualInstructions?.consistencyAnchors?.length) {
    parts.push(...profile.visualInstructions.consistencyAnchors);
  }

  // Style Notes
  if (profile.visualInstructions?.styleNotes) {
    parts.push(profile.visualInstructions.styleNotes);
  }

  // Base style — uses Creative Manifest override or default
  parts.push(
    options?.styleOverride || 'product photography, studio lighting, white background, high detail, photorealistic'
  );

  return parts.filter((p) => p && p.trim()).join(', ');
}

/**
 * Build a negative prompt from object prohibitions.
 */
export function buildObjectNegativePrompt(profile: ObjectProfile): string {
  const negatives: string[] = [];

  if (profile.visualInstructions?.prohibitions?.length) {
    negatives.push(...profile.visualInstructions.prohibitions);
  }

  // Standard negatives
  negatives.push(
    'blurry',
    'low quality',
    'distorted',
    'watermark',
    'text',
    'hands',
    'people',
    'cartoon'
  );

  return negatives.filter((n) => n && n.trim()).join(', ');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Build prompts for all assets in a registry.
 */
export function buildAllAssetPrompts(assetRegistry: {
  characters?: CharacterProfile[];
  locations?: LocationProfile[];
  objects?: ObjectProfile[];
}): Array<{
  assetId: string;
  assetType: 'character' | 'location' | 'object';
  name: string;
  prompt: string;
  negativePrompt: string;
}> {
  const prompts: Array<{
    assetId: string;
    assetType: 'character' | 'location' | 'object';
    name: string;
    prompt: string;
    negativePrompt: string;
  }> = [];

  // Characters
  for (const char of assetRegistry.characters || []) {
    prompts.push({
      assetId: char.id,
      assetType: 'character',
      name: char.name,
      prompt: buildCharacterPrompt(char),
      negativePrompt: buildCharacterNegativePrompt(char),
    });
  }

  // Locations
  for (const loc of assetRegistry.locations || []) {
    prompts.push({
      assetId: loc.id,
      assetType: 'location',
      name: loc.name,
      prompt: buildLocationPrompt(loc),
      negativePrompt: buildLocationNegativePrompt(loc),
    });
  }

  // Objects
  for (const obj of assetRegistry.objects || []) {
    prompts.push({
      assetId: obj.id,
      assetType: 'object',
      name: obj.name,
      prompt: buildObjectPrompt(obj),
      negativePrompt: buildObjectNegativePrompt(obj),
    });
  }

  return prompts;
}
