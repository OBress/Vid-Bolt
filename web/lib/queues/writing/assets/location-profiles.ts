/**
 * Location Profile Generation
 * ============================================================================
 * Generates detailed location profiles for visual consistency in AI image generation.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  LocationProfile, 
  Spine, 
  ResearchDossier,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { generateLocationId } from '../utils';

// ============================================================================
// TYPES
// ============================================================================

interface LocationInput {
  name: string;
  type: string;
  details: string;
  beatIndices: number[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate location profiles for all identified places
 */
export async function generateLocationProfiles(
  userId: string,
  locations: LocationInput[],
  spine: Spine,
  dossier: ResearchDossier | null
): Promise<LocationProfile[]> {
  if (locations.length === 0) return [];

  console.log(`[Assets/Locations] Generating profiles for ${locations.length} locations`);

  const profiles: LocationProfile[] = [];

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    
    try {
      const profile = await generateSingleLocationProfile(
        userId,
        location,
        spine,
        dossier,
        i
      );
      profiles.push(profile);
    } catch (error) {
      console.error(`[Assets/Locations] Error generating profile for ${location.name}:`, error);
      profiles.push(createFallbackLocationProfile(location, i));
    }
  }

  return profiles;
}

/**
 * Generate a single location profile
 */
async function generateSingleLocationProfile(
  userId: string,
  location: LocationInput,
  spine: Spine,
  dossier: ResearchDossier | null,
  index: number
): Promise<LocationProfile> {
  const beatContext = location.beatIndices.length > 0
    ? spine.beats
        .filter(b => location.beatIndices.includes(b.index))
        .map(b => `Beat ${b.index}: ${b.contentSummary}`)
        .slice(0, 3)
        .join('\n')
    : '';

  const userPrompt = `Create a detailed visual location profile for AI image generation consistency:

LOCATION: ${location.name}
TYPE: ${location.type}
KNOWN DETAILS: ${location.details}
${beatContext ? `APPEARS IN SCENES:\n${beatContext}` : ''}

Generate a comprehensive profile. Return as JSON:
{
  "name": "${location.name}",
  "type": "${location.type}",
  "era": "time period if relevant",
  "scale": "intimate/room/building/neighborhood/city/landscape",
  "essence": "one sentence capturing the feel",
  "structuralDetails": {
    "architectureStyle": "style if applicable",
    "materials": "primary materials visible",
    "shape": "overall form",
    "condition": "new/maintained/weathered/ruined",
    "dimensions": "sense of scale",
    "keyElements": ["notable architectural/natural features"]
  },
  "environmentalDetails": {
    "groundFloor": "floor/ground description",
    "walls": "wall surfaces if interior",
    "ceilingSky": "ceiling or sky description",
    "vegetation": "plants if any",
    "weatherAtmosphere": "weather/atmospheric conditions"
  },
  "lighting": {
    "natural": "natural light quality",
    "artificial": "artificial light sources",
    "mood": "lighting mood"
  },
  "ambientDetails": {
    "soundsImplied": "sounds you'd expect",
    "smellsImplied": "smells you'd expect",
    "objectsDebris": "scattered objects",
    "movementActivity": "movement in the scene"
  },
  "visualInstructions": {
    "consistencyAnchors": ["features that MUST appear"],
    "prohibitions": ["things that should NEVER appear"],
    "styleNotes": "overall visual style"
  },
  "requiredVariants": [
    {
      "viewDescription": "specific view needed",
      "framing": "wide/medium/close",
      "lighting": "lighting for this view",
      "beatIndices": [${location.beatIndices.join(', ')}]
    }
  ]
}`;

  const profile = await generateJSON<Omit<LocationProfile, 'id'>>(
    userId,
    UNIVERSAL_PROMPTS.locationProfile,
    userPrompt
  );

  return {
    id: generateLocationId(index),
    ...profile,
  };
}

/**
 * Create a basic fallback location profile
 */
function createFallbackLocationProfile(location: LocationInput, index: number): LocationProfile {
  return {
    id: generateLocationId(index),
    name: location.name,
    type: location.type,
    scale: 'room',
    essence: location.details || 'A location central to the story',
    structuralDetails: {
      materials: 'Various',
      condition: 'maintained',
      keyElements: [location.name],
    },
    environmentalDetails: {
      groundFloor: 'Standard floor',
      ceilingSky: 'Standard ceiling or sky',
    },
    lighting: {
      natural: 'Daylight',
      mood: 'Neutral',
    },
    ambientDetails: {},
    visualInstructions: {
      consistencyAnchors: [location.name, location.type],
      prohibitions: ['anachronistic elements'],
      styleNotes: 'Realistic style appropriate to the setting',
    },
    requiredVariants: [{
      viewDescription: 'Establishing shot',
      framing: 'wide',
      lighting: 'Natural daylight',
      beatIndices: location.beatIndices,
    }],
  };
}
