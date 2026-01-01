/**
 * Object Profile Generation
 * ============================================================================
 * Generates detailed object/prop profiles for visual consistency in AI image generation.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  ObjectProfile, 
  Spine, 
  ResearchDossier,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { generateObjectId } from '../utils';

// ============================================================================
// TYPES
// ============================================================================

interface ObjectInput {
  name: string;
  type: string;
  details: string;
  beatIndices: number[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate object profiles for all identified props/items
 */
export async function generateObjectProfiles(
  userId: string,
  objects: ObjectInput[],
  spine: Spine,
  dossier: ResearchDossier | null
): Promise<ObjectProfile[]> {
  if (objects.length === 0) return [];

  console.log(`[Assets/Objects] Generating profiles for ${objects.length} objects`);

  const profiles: ObjectProfile[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    
    try {
      const profile = await generateSingleObjectProfile(
        userId,
        obj,
        spine,
        dossier,
        i
      );
      profiles.push(profile);
    } catch (error) {
      console.error(`[Assets/Objects] Error generating profile for ${obj.name}:`, error);
      profiles.push(createFallbackObjectProfile(obj, i));
    }
  }

  return profiles;
}

/**
 * Generate a single object profile
 */
async function generateSingleObjectProfile(
  userId: string,
  obj: ObjectInput,
  spine: Spine,
  dossier: ResearchDossier | null,
  index: number
): Promise<ObjectProfile> {
  const beatContext = obj.beatIndices.length > 0
    ? spine.beats
        .filter(b => obj.beatIndices.includes(b.index))
        .map(b => `Beat ${b.index}: ${b.contentSummary}`)
        .slice(0, 3)
        .join('\n')
    : '';

  const userPrompt = `Create a detailed visual object profile for AI image generation consistency:

OBJECT: ${obj.name}
TYPE: ${obj.type}
KNOWN DETAILS: ${obj.details}
${beatContext ? `APPEARS IN SCENES:\n${beatContext}` : ''}

Generate a comprehensive profile. Return as JSON:
{
  "name": "${obj.name}",
  "type": "${obj.type}",
  "physicalDescription": {
    "dimensions": "exact or approximate dimensions",
    "relatableComparison": "size comparison to common object (e.g., 'about the size of a shoebox')",
    "weightImplied": "light/medium/heavy or specific",
    "shape": "geometric description",
    "materials": "what it's made of",
    "color": "primary color(s)",
    "condition": "new/worn/damaged/antique",
    "detailedDescription": "full paragraph description",
    "notableFeatures": ["unique markings", "labels", "damage", "special features"]
  },
  "interactionNotes": {
    "howHandled": "how people typically hold/use it",
    "howMovesOrBehaves": "if it moves or has behavior",
    "scaleReferences": "shown next to hands or common objects"
  },
  "visualInstructions": {
    "consistencyAnchors": ["features that MUST appear"],
    "prohibitions": ["things that should NEVER appear"],
    "requiredVariants": [
      {"context": "situation where object appears differently", "changes": "what changes"}
    ]
  }
}`;

  const profile = await generateJSON<Omit<ObjectProfile, 'id'>>(
    userId,
    UNIVERSAL_PROMPTS.objectProfile,
    userPrompt
  );

  return {
    id: generateObjectId(index),
    ...profile,
  };
}

/**
 * Create a basic fallback object profile
 */
function createFallbackObjectProfile(obj: ObjectInput, index: number): ObjectProfile {
  return {
    id: generateObjectId(index),
    name: obj.name,
    type: obj.type,
    physicalDescription: {
      dimensions: 'Standard size',
      relatableComparison: 'Appropriate size for its type',
      shape: 'Standard shape for its type',
      materials: 'Typical materials',
      color: 'Natural colors',
      condition: 'Good condition',
      detailedDescription: obj.details || `A ${obj.type} called ${obj.name}`,
    },
    interactionNotes: {},
    visualInstructions: {
      consistencyAnchors: [obj.name, obj.type],
      prohibitions: ['anachronistic elements'],
    },
  };
}
