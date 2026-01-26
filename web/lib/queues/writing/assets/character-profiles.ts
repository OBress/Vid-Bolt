/**
 * Character Profile Generation
 * ============================================================================
 * Generates detailed character profiles for visual consistency in AI image generation.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  CharacterProfile, 
  Spine, 
  ResearchDossier,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { generateCharacterId } from '../utils';

// ============================================================================
// TYPES
// ============================================================================

interface CharacterInput {
  name: string;
  role: string;
  details: string;
  beatIndices: number[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate character profiles for all identified people
 */
export async function generateCharacterProfiles(
  userId: string,
  people: CharacterInput[],
  spine: Spine,
  dossier: ResearchDossier | null
): Promise<CharacterProfile[]> {
  if (people.length === 0) return [];

  console.log(`[Assets/Characters] Generating profiles for ${people.length} characters`);

  const profiles: CharacterProfile[] = [];

  // Process in batches of 3 to avoid token limits
  const batchSize = 3;
  for (let i = 0; i < people.length; i += batchSize) {
    const batch = people.slice(i, i + batchSize);
    
    for (const person of batch) {
      try {
        const profile = await generateSingleCharacterProfile(
          userId,
          person,
          spine,
          dossier,
          profiles.length
        );
        profiles.push(profile);
      } catch (error) {
        console.error(`[Assets/Characters] Error generating profile for ${person.name}:`, error);
        // Add a basic fallback profile
        profiles.push(createFallbackProfile(person, profiles.length));
      }
    }
  }

  return profiles;
}

/**
 * Generate a single character profile
 */
async function generateSingleCharacterProfile(
  userId: string,
  person: CharacterInput,
  spine: Spine,
  dossier: ResearchDossier | null,
  index: number
): Promise<CharacterProfile> {
  // Build context from dossier
  const dossierContext = dossier 
    ? findPersonInDossier(person.name, dossier)
    : null;

  const beatContext = person.beatIndices.length > 0
    ? spine.beats
        .filter(b => person.beatIndices.includes(b.index))
        .map(b => b.contentSummary)
        .slice(0, 3)
        .join('\n')
    : '';

  const userPrompt = `Create a detailed visual character profile for AI image generation consistency:

CHARACTER: ${person.name}
ROLE: ${person.role}
KNOWN DETAILS: ${person.details}
${dossierContext ? `RESEARCH CONTEXT: ${dossierContext}` : ''}
${beatContext ? `APPEARS IN SCENES:\n${beatContext}` : ''}

Generate a comprehensive profile. Return as JSON:
{
  "name": "${person.name}",
  "role": "${person.role}",
  "physicalCharacteristics": {
    "demographics": {
      "age": "apparent age range",
      "gender": "gender",
      "ethnicity": "if known or relevant",
      "nationality": "if known"
    },
    "bodyStructure": {
      "height": "tall/average/short or specific",
      "build": "athletic/slim/stocky/etc",
      "posture": "confident/slouched/military/etc",
      "gait": "how they walk"
    },
    "faceStructure": {
      "faceShape": "oval/square/round/etc",
      "forehead": "description",
      "cheekbones": "description",
      "jaw": "description",
      "nose": "shape and size",
      "ears": "if notable"
    },
    "faceFeatures": {
      "eyeColor": "color",
      "eyeShape": "shape description",
      "eyebrows": "description",
      "mouthDescription": "description",
      "skinTone": "tone",
      "skinTexture": "smooth/weathered/etc",
      "notableFeatures": "scars, moles, etc"
    },
    "hair": {
      "color": "color",
      "texture": "straight/curly/wavy",
      "length": "length",
      "style": "how styled",
      "facialHair": "if applicable"
    },
    "distinguishingFeatures": ["list of unique features"]
  },
  "expressions": {
    "neutral": "default expression description",
    "happy": "happy expression",
    "concerned": "worried expression",
    "angry": "angry expression",
    "afraid": "fearful expression",
    "thinking": "contemplative expression"
  },
  "wardrobe": {
    "defaultOutfit": "typical clothing description",
    "variants": [{"context": "situation", "outfit": "alternative clothing"}]
  },
  "visualInstructions": {
    "consistencyAnchors": ["features that MUST appear in every image"],
    "prohibitions": ["things that should NEVER appear"],
    "styleNotes": "overall visual style guidance"
  }
}`;

  const profile = await generateJSON<Omit<CharacterProfile, 'id' | 'beatVariants'>>(
    userId,
    UNIVERSAL_PROMPTS.characterProfile,
    userPrompt,
    { maxTokens: 4096 } // Explicit token limit to ensure complete JSON response
  );

  return {
    id: generateCharacterId(index),
    ...profile,
    beatVariants: person.beatIndices.length > 0 ? [{
      beatIndices: person.beatIndices,
      changesFromDefault: 'Standard appearance',
      notes: 'Default presentation',
    }] : undefined,
  };
}

/**
 * Find person context in dossier
 */
function findPersonInDossier(name: string, dossier: ResearchDossier): string | null {
  const nameLower = name.toLowerCase();
  
  // Check entities
  const entity = dossier.entities.find(e => 
    e.type === 'person' && e.name.toLowerCase().includes(nameLower)
  );
  if (entity) {
    return `${entity.role}: ${entity.details}`;
  }

  // Check quotes
  const quote = dossier.quotes.find(q => 
    q.speaker.toLowerCase().includes(nameLower)
  );
  if (quote) {
    return `Speaker: ${quote.speakerTitle || 'Unknown title'}. Said: "${quote.quote.substring(0, 100)}..."`;
  }

  return null;
}

/**
 * Create a basic fallback profile when AI generation fails
 */
function createFallbackProfile(person: CharacterInput, index: number): CharacterProfile {
  return {
    id: generateCharacterId(index),
    name: person.name,
    role: person.role,
    physicalCharacteristics: {
      demographics: {
        age: 'adult',
        gender: 'unspecified',
      },
      bodyStructure: {
        height: 'average',
        build: 'average',
        posture: 'neutral',
      },
      faceStructure: {
        faceShape: 'oval',
        nose: 'average',
      },
      faceFeatures: {
        eyeColor: 'brown',
        eyeShape: 'almond',
        eyebrows: 'natural',
        mouthDescription: 'neutral',
        skinTone: 'medium',
      },
      hair: {
        color: 'dark',
        texture: 'straight',
        length: 'short',
        style: 'neat',
      },
    },
    expressions: {
      neutral: 'Calm, composed expression',
    },
    wardrobe: {
      defaultOutfit: 'Professional attire appropriate to role',
    },
    visualInstructions: {
      consistencyAnchors: [person.name, person.role],
      prohibitions: ['inconsistent features'],
      styleNotes: 'Realistic style, professional presentation',
    },
  };
}
