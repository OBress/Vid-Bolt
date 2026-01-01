/**
 * Asset Registry Module - Main Orchestrator
 * ============================================================================
 * Creates and manages visual asset profiles for characters, locations, and objects.
 * Ensures visual consistency across AI image generation.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  AssetRegistry, 
  CharacterProfile, 
  LocationProfile, 
  ObjectProfile,
  Spine,
  ResearchDossier,
  ScriptGenre,
} from '../types';
import { GENRE_CONFIG } from '../config';
import { generateCharacterProfiles } from './character-profiles';
import { generateLocationProfiles } from './location-profiles';
import { generateObjectProfiles } from './object-profiles';

// ============================================================================
// TYPES
// ============================================================================

export interface AssetRegistryOptions {
  userId: string;
  topic: string;
  genre: ScriptGenre;
  spine: Spine;
  dossier: ResearchDossier | null;
}

export interface AssetRegistryResult {
  registry: AssetRegistry;
  stats: {
    characterCount: number;
    locationCount: number;
    objectCount: number;
    totalAssets: number;
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Generate the complete asset registry for visual consistency.
 */
export async function generateAssetRegistry(
  options: AssetRegistryOptions
): Promise<AssetRegistryResult> {
  const { userId, topic, genre, spine, dossier } = options;

  console.log(`[Assets] Generating asset registry for "${topic.substring(0, 50)}..."`);

  const genreConfig = GENRE_CONFIG[genre];

  // Extract entities from spine and dossier
  const entities = extractEntities(spine, dossier);

  console.log(`[Assets] Found ${entities.people.length} people, ${entities.locations.length} locations, ${entities.objects.length} objects`);

  // Generate profiles in parallel where possible
  const [characters, locations, objects] = await Promise.all([
    genreConfig.requiresCharacterProfiles || entities.people.length > 0
      ? generateCharacterProfiles(userId, entities.people, spine, dossier)
      : Promise.resolve([]),
    entities.locations.length > 0
      ? generateLocationProfiles(userId, entities.locations, spine, dossier)
      : Promise.resolve([]),
    entities.objects.length > 0
      ? generateObjectProfiles(userId, entities.objects, spine, dossier)
      : Promise.resolve([]),
  ]);

  const registry: AssetRegistry = {
    characters,
    locations,
    objects,
  };

  const stats = {
    characterCount: characters.length,
    locationCount: locations.length,
    objectCount: objects.length,
    totalAssets: characters.length + locations.length + objects.length,
  };

  console.log(`[Assets] Registry complete: ${stats.totalAssets} total assets`);

  return { registry, stats };
}

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

interface ExtractedEntities {
  people: Array<{ name: string; role: string; details: string; beatIndices: number[] }>;
  locations: Array<{ name: string; type: string; details: string; beatIndices: number[] }>;
  objects: Array<{ name: string; type: string; details: string; beatIndices: number[] }>;
}

/**
 * Extract entities from spine and dossier
 */
function extractEntities(spine: Spine, dossier: ResearchDossier | null): ExtractedEntities {
  const people = new Map<string, { role: string; details: string; beatIndices: number[] }>();
  const locations = new Map<string, { type: string; details: string; beatIndices: number[] }>();
  const objects = new Map<string, { type: string; details: string; beatIndices: number[] }>();

  // Extract from dossier entities
  if (dossier) {
    for (const entity of dossier.entities) {
      if (entity.type === 'person') {
        if (!people.has(entity.name)) {
          people.set(entity.name, { role: entity.role, details: entity.details, beatIndices: [] });
        }
      } else if (entity.type === 'location') {
        if (!locations.has(entity.name)) {
          locations.set(entity.name, { type: 'location', details: entity.details, beatIndices: [] });
        }
      } else if (entity.type === 'organization') {
        // Organizations might have locations
        if (!locations.has(entity.name)) {
          locations.set(entity.name, { type: 'organization', details: entity.details, beatIndices: [] });
        }
      }
    }
  }

  // Scan spine for entity mentions and determine beat appearances
  for (const beat of spine.beats) {
    const content = beat.contentSummary.toLowerCase();
    
    // Check which entities appear in this beat
    for (const [name, data] of people) {
      if (content.includes(name.toLowerCase())) {
        data.beatIndices.push(beat.index);
      }
    }
    
    for (const [name, data] of locations) {
      if (content.includes(name.toLowerCase())) {
        data.beatIndices.push(beat.index);
      }
    }
  }

  return {
    people: Array.from(people.entries()).map(([name, data]) => ({
      name,
      role: data.role,
      details: data.details,
      beatIndices: data.beatIndices,
    })),
    locations: Array.from(locations.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      details: data.details,
      beatIndices: data.beatIndices,
    })),
    objects: Array.from(objects.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      details: data.details,
      beatIndices: data.beatIndices,
    })),
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get asset by ID from registry
 */
export function getAssetById(
  registry: AssetRegistry,
  id: string
): CharacterProfile | LocationProfile | ObjectProfile | null {
  if (id.startsWith('CHAR-')) {
    return registry.characters.find(c => c.id === id) || null;
  }
  if (id.startsWith('LOC-')) {
    return registry.locations.find(l => l.id === id) || null;
  }
  if (id.startsWith('OBJ-')) {
    return registry.objects.find(o => o.id === id) || null;
  }
  return null;
}

/**
 * Get assets appearing in a specific beat
 */
export function getAssetsForBeat(
  registry: AssetRegistry,
  beatIndex: number
): Array<CharacterProfile | LocationProfile | ObjectProfile> {
  const assets: Array<CharacterProfile | LocationProfile | ObjectProfile> = [];

  for (const char of registry.characters) {
    if (char.beatVariants?.some(v => v.beatIndices.includes(beatIndex))) {
      assets.push(char);
    }
  }

  for (const loc of registry.locations) {
    if (loc.requiredVariants.some(v => v.beatIndices.includes(beatIndex))) {
      assets.push(loc);
    }
  }

  return assets;
}

/**
 * Generate consistency prompt for an asset
 */
export function generateConsistencyPrompt(
  asset: CharacterProfile | LocationProfile | ObjectProfile
): string {
  const anchors = asset.visualInstructions.consistencyAnchors.join(', ');
  const prohibitions = asset.visualInstructions.prohibitions.join(', ');
  
  return `CONSISTENCY ANCHORS (must include): ${anchors}
PROHIBITIONS (never include): ${prohibitions}
STYLE: ${asset.visualInstructions.styleNotes}`;
}
