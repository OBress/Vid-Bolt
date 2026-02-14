/**
 * Consistency Injector
 * ============================================================================
 * Injects visual asset consistency markers into expanded beats.
 */

import type { 
  Beat, 
  ExpandedBeat,
  AssetRegistry,
  CharacterProfile,
  LocationProfile,
  ObjectProfile,
  ResearchDossier,
} from '../types';
import type { RelevantAssets } from './beat-writer';

// ============================================================================
// ASSET RETRIEVAL
// ============================================================================

/**
 * Get relevant assets for a specific beat
 */
export function getRelevantAssets(
  beat: Beat,
  registry: AssetRegistry,
  _dossier: ResearchDossier | null
): RelevantAssets {
  const contentToSearch = (beat.contentSummary || '').toLowerCase();
  
  // Find characters mentioned in beat
  const characters = registry.characters.filter(char => 
    contentToSearch.includes(char.name.toLowerCase()) ||
    char.beatVariants?.some(v => v.beatIndices.includes(beat.index))
  );

  // Find locations mentioned in beat
  const locations = registry.locations.filter(loc =>
    contentToSearch.includes(loc.name.toLowerCase()) ||
    loc.requiredVariants.some(v => v.beatIndices.includes(beat.index))
  );

  // Find objects mentioned in beat
  const objects = registry.objects.filter(obj =>
    contentToSearch.includes(obj.name.toLowerCase())
  );

  return { characters, locations, objects };
}

// ============================================================================
// CONSISTENCY INJECTION
// ============================================================================

/**
 * Inject asset consistency markers into an expanded beat
 */
export function injectAssetConsistency(
  expandedBeat: ExpandedBeat,
  relevantAssets: RelevantAssets,
  _registry: AssetRegistry
): ExpandedBeat {
  const narration = expandedBeat.narration;
  const additionalCallouts: ExpandedBeat['visualCallouts'] = [];

  // For each character, ensure they're properly referenced
  for (const char of relevantAssets.characters) {
    const nameLower = char.name.toLowerCase();
    const narrationLower = narration.toLowerCase();
    
    // Check if character is mentioned but not tagged
    if (narrationLower.includes(nameLower) && !narration.includes(`[${char.id}]`)) {
      // Find first mention and add a note for visual callout
      const firstMentionIndex = narrationLower.indexOf(nameLower);
      if (firstMentionIndex !== -1) {
        additionalCallouts.push({
          assetId: char.id,
          context: `First appearance of ${char.name}`,
        });
      }
    }
  }

  // For each location, ensure proper visual callout
  for (const loc of relevantAssets.locations) {
    const nameLower = loc.name.toLowerCase();
    const narrationLower = narration.toLowerCase();
    
    if (narrationLower.includes(nameLower) && !narration.includes(`[${loc.id}]`)) {
      additionalCallouts.push({
        assetId: loc.id,
        context: `Scene at ${loc.name}`,
      });
    }
  }

  // Merge callouts
  const allCallouts = [
    ...expandedBeat.visualCallouts,
    ...additionalCallouts,
  ];

  // Deduplicate callouts by assetId
  const uniqueCallouts = Array.from(
    new Map(allCallouts.map(c => [c.assetId, c])).values()
  );

  return {
    ...expandedBeat,
    narration,
    visualCallouts: uniqueCallouts,
  };
}

// ============================================================================
// DESCRIPTION GENERATION
// ============================================================================

/**
 * Generate a visual description for a character's first appearance
 */
export function generateCharacterIntroDescription(char: CharacterProfile): string {
  const phys = char.physicalCharacteristics;
  const parts: string[] = [];

  // Basic demographics
  if (phys.demographics.age) parts.push(phys.demographics.age);
  if (phys.bodyStructure.build) parts.push(`${phys.bodyStructure.build} build`);

  // Face features
  if (phys.faceFeatures.eyeColor) parts.push(`${phys.faceFeatures.eyeColor} eyes`);
  if (phys.hair.color && phys.hair.length) {
    parts.push(`${phys.hair.length} ${phys.hair.color} hair`);
  }

  // Distinguishing features
  if (phys.distinguishingFeatures && phys.distinguishingFeatures.length > 0) {
    parts.push(phys.distinguishingFeatures[0]);
  }

  return parts.join(', ');
}

/**
 * Generate a visual brief for a location
 */
export function generateLocationBrief(loc: LocationProfile): string {
  const parts: string[] = [loc.essence];
  
  if (loc.lighting.mood) {
    parts.push(`${loc.lighting.mood} lighting`);
  }
  
  if (loc.environmentalDetails.weatherAtmosphere) {
    parts.push(loc.environmentalDetails.weatherAtmosphere);
  }

  return parts.join('. ');
}

/**
 * Generate a consistency prompt for image generation
 */
export function generateImagePrompt(
  asset: CharacterProfile | LocationProfile | ObjectProfile,
  context: string
): string {
  const anchors = asset.visualInstructions.consistencyAnchors.join(', ');
  const prohibitions = asset.visualInstructions.prohibitions.join(', ');
  
  let baseDescription = '';
  
  if ('physicalCharacteristics' in asset) {
    // Character
    baseDescription = generateCharacterIntroDescription(asset);
  } else if ('essence' in asset) {
    // Location
    baseDescription = (asset as LocationProfile).essence;
  } else {
    // Object
    baseDescription = (asset as ObjectProfile).physicalDescription.detailedDescription;
  }

  return `${baseDescription}

Context: ${context}

MUST INCLUDE: ${anchors}
MUST NOT INCLUDE: ${prohibitions}
STYLE: ${asset.visualInstructions.styleNotes}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that all visual callouts have corresponding assets
 */
export function validateVisualCallouts(
  callouts: ExpandedBeat['visualCallouts'],
  registry: AssetRegistry
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const callout of callouts) {
    const found = 
      registry.characters.some(c => c.id === callout.assetId) ||
      registry.locations.some(l => l.id === callout.assetId) ||
      registry.objects.some(o => o.id === callout.assetId);

    if (!found) {
      missing.push(callout.assetId);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
