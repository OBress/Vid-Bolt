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

  // Extract entities from spine, dossier, AND topic (to ensure main subject is captured)
  const entities = extractEntities(spine, dossier, topic);

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
 * Extract entities from spine, dossier, and topic
 * CRITICAL: Must capture ALL characters including the main subject
 */
function extractEntities(spine: Spine, dossier: ResearchDossier | null, topic?: string): ExtractedEntities {
  const people = new Map<string, { role: string; details: string; beatIndices: number[] }>();
  const locations = new Map<string, { type: string; details: string; beatIndices: number[] }>();
  const objects = new Map<string, { type: string; details: string; beatIndices: number[] }>();

  // 1. CRITICAL: Extract main subject from topic (e.g., "Jamie Dimon" from "The story of Jamie Dimon")
  if (topic) {
    const mainSubject = extractMainSubjectFromTopic(topic);
    if (mainSubject) {
      people.set(mainSubject, { 
        role: 'Main Subject', 
        details: `The primary focus of this video about "${topic}"`,
        beatIndices: spine.beats.map(b => b.index) // Appears in all beats
      });
      console.log(`[Assets] Extracted main subject: "${mainSubject}"`);
    }
  }

  // 2. Extract from dossier entities
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
        if (!locations.has(entity.name)) {
          locations.set(entity.name, { type: 'organization', details: entity.details, beatIndices: [] });
        }
      }
    }

    // 3. Extract people from quotes (quote speakers are always characters)
    for (const quote of dossier.quotes) {
      if (quote.speaker && !people.has(quote.speaker)) {
        people.set(quote.speaker, { 
          role: quote.speakerTitle || 'Quoted in video', 
          details: `Speaker of quote: "${quote.quote.substring(0, 50)}..."`,
          beatIndices: [] 
        });
      }
    }
  }

  // 4. Scan spine content summaries for proper names (capitalized words that might be people)
  for (const beat of spine.beats) {
    const content = beat.contentSummary;
    
    // Find potential proper names (capitalized words, excluding common words)
    const potentialNames = extractProperNames(content);
    for (const name of potentialNames) {
      if (!people.has(name) && name.length > 2) {
        // Only add if it looks like a person's name (has space or is a single capitalized word)
        if (name.includes(' ') || /^[A-Z][a-z]+$/.test(name)) {
          people.set(name, { 
            role: 'Mentioned in story', 
            details: `Appears in: "${content.substring(0, 100)}..."`,
            beatIndices: [beat.index] 
          });
        }
      }
    }
    
    // Track beat appearances for existing entities
    for (const [name, data] of people) {
      if (content.toLowerCase().includes(name.toLowerCase()) && !data.beatIndices.includes(beat.index)) {
        data.beatIndices.push(beat.index);
      }
    }
    
    for (const [name, data] of locations) {
      if (content.toLowerCase().includes(name.toLowerCase()) && !data.beatIndices.includes(beat.index)) {
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

/**
 * Extract the main subject from a topic string
 * Examples: "Jamie Dimon" from "The story of Jamie Dimon", "Elon Musk" from "How Elon Musk became..."
 */
function extractMainSubjectFromTopic(topic: string): string | null {
  // Common patterns for extracting the main subject
  const patterns = [
    /(?:story of|biography of|about|profile of|life of|rise of|fall of|how)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:'s|\s*:|\s*-|\s+story|\s+biography)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:documentary|story|biography|profile)/i,
  ];

  for (const pattern of patterns) {
    const match = topic.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: find the first proper name (two or more capitalized words together)
  const properNameMatch = topic.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  if (properNameMatch) {
    return properNameMatch[1];
  }

  return null;
}

/**
 * Extract potential proper names from text
 */
function extractProperNames(text: string): string[] {
  const names: string[] = [];
  
  // Match full names (First Last) or (First Middle Last)
  const fullNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  let match;
  while ((match = fullNamePattern.exec(text)) !== null) {
    const name = match[1];
    // Exclude common phrases that look like names
    const excluded = ['The', 'In The', 'At The', 'By The', 'For The', 'This Is', 'Here Is'];
    if (!excluded.some(e => name.startsWith(e))) {
      names.push(name);
    }
  }
  
  return [...new Set(names)];
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
