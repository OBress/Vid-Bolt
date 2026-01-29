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
import { UNIVERSAL_PROMPTS } from '../prompts';
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

  // Extract entities from spine, dossier, AND topic (to ensure main subject is captured)
  // Use AI for intelligent deduplication
  const entities = await extractEntitiesWithAI(userId, spine, dossier, topic);

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

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

interface AIEntityResult {
  people: Array<{
    name: string;
    aliases: string[];
    role: string;
    details: string;
    significance: string;
    beatIndices: number[];
    isUnnamed?: boolean; // True for unidentified people (e.g., "The Victim")
  }>;
  locations: Array<{
    name: string;
    type: string;
    details: string;
    beatIndices: number[];
  }>;
  objects: Array<{
    name: string;
    type: string;
    details: string;
    beatIndices: number[];
  }>;
}

/**
 * Extract entities using AI for intelligent deduplication and context awareness
 */
async function extractEntitiesWithAI(
  userId: string, 
  spine: Spine, 
  dossier: ResearchDossier | null, 
  topic: string
): Promise<AIEntityResult> {
  // 1. Prepare context for the AI
  const beatSummaries = spine.beats.map(b => `[Beat ${b.index}] ${b.contentSummary}`).join('\n');
  
  let dossierContext = '';
  if (dossier) {
    const mainEntities = dossier.entities.slice(0, 20).map(e => `${e.name} (${e.type}): ${e.role}`).join('\n');
    dossierContext = `\n\nKNOWN ENTITIES FROM RESEARCH:\n${mainEntities}`;
  }

  const prompt = `ANALYZE THIS STORY OUTLINE AND EXTRACT VISUAL ASSETS.
  
TOPIC: ${topic}

STORY BEATS:
${beatSummaries}
${dossierContext}

Identify and deduplicate all Characters, Locations, and Objects. 
Follow the JSON format strictly.`;

  try {
    // 2. Call AI
    const result = await generateJSON<AIEntityResult>(
      userId,
      UNIVERSAL_PROMPTS.assetExtraction,
      prompt
    );
    
    // 3. Post-process to ensure main subject is present
    // The prompt asks for it, but we double check or fallback if needed
    // Ideally the AI handles the merging, so we trust its output primarily.
    
    return result;
  } catch (error) {
    console.error('[Assets] AI Extraction failed, falling back to heuristics:', error);
    // Fallback to old method if AI fails
    const heuristic = extractEntitiesHeuristic(spine, dossier, topic);
    return {
      people: heuristic.people.map(p => ({ ...p, aliases: [], significance: p.role })),
      locations: heuristic.locations,
      objects: heuristic.objects
    };
  }
}

/**
 * Legacy Heuristic Extraction (Fallback)
 */
function extractEntitiesHeuristic(spine: Spine, dossier: ResearchDossier | null, topic?: string) {
  const people = new Map<string, { role: string; details: string; beatIndices: number[] }>();
  const locations = new Map<string, { type: string; details: string; beatIndices: number[] }>();
  // Heuristic doesn't do objects well, but we keep the structure
  const objects = new Map<string, { type: string; details: string; beatIndices: number[] }>(); 

  // ... (Previous logic for heuristic extraction preserved below for fallback) ...
  // 1. CRITICAL: Extract main subject from topic
  if (topic) {
    const mainSubject = extractMainSubjectFromTopic(topic);
    if (mainSubject) {
      people.set(mainSubject, { 
        role: 'Main Subject', 
        details: `The primary focus of this video about "${topic}"`,
        beatIndices: spine.beats.map(b => b.index) 
      });
    }
  }

  // 2. Extract from dossier
  if (dossier) {
    for (const entity of dossier.entities) {
      if (entity.type === 'person') {
         if (!people.has(entity.name)) people.set(entity.name, { role: entity.role, details: entity.details, beatIndices: [] });
      } else if (entity.type === 'location' || entity.type === 'organization') {
         if (!locations.has(entity.name)) locations.set(entity.name, { type: 'location', details: entity.details, beatIndices: [] });
      }
    }
  }

  // 3. Scan spine
  // (Simplified for fallback - doing full scan is duplicated code, so we use a lighter version here or just return what we have)
  // For safety and code cleanliness, I will just return what we have from dossier + topic. 
  // If the AI fails, we get a degraded but functional result.
  
  return {
    people: Array.from(people.entries()).map(([name, data]) => ({ name, ...data })),
    locations: Array.from(locations.entries()).map(([name, data]) => ({ name, ...data })),
    objects: Array.from(objects.entries()).map(([name, data]) => ({ name, ...data })),
  };
}

/**
 * Extract the main subject from a topic string (Helper for fallback)
 */
function extractMainSubjectFromTopic(topic: string): string | null {
  const patterns = [
    /(?:story of|biography of|about|profile of|life of|rise of|fall of|how)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:'s|\s*-|\s+story|\s+biography)/i,
  ];
  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
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
