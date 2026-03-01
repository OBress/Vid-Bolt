/**
 * Global Project Presets
 * ============================================================================
 * Pre-configured ProjectSettings templates available to all users when creating
 * a new media project. Each preset provides sensible defaults for a specific
 * content type / production style.
 *
 * To add a new preset, append an entry to PROJECT_PRESETS. The `id` must be
 * unique and is prefixed with "preset:" in the UI to distinguish from real
 * project UUIDs.
 */

import type { ProjectSettings } from '@/types/settings';

// ============================================================================
// BASE (Standard) — shared baseline; other presets extend this
// ============================================================================

const BASE_SETTINGS: Omit<ProjectSettings, 'basic_info'> = {
  voice: {
    provider: 'elevenlabs' as const,
    model: 'eleven_multilingual_v2',
    voiceName: 'Rachel',
    speakerBoost: true,
    stability: 0.5,
    similarityBoost: 0.75,
    speakingSpeed: 1.0,
    voiceStyle: 0,
  },
  visuals: {
    imageModel: 'local-z-image',
    videoModel: 'local-ltx2',
    imageEditModel: 'local-qwen-edit',
  },
  editing: {},
  export: {
    defaultTargets: [],
  },
  script: {
    pov: '1st' as const,
    protagonistGender: 'any' as const,
    genre: 'documentary' as const,
    researchDepth: 'full' as const,
    openrouterModel: 'google/gemini-3-flash-preview',
    qualityReviewModel: 'google/gemini-3-pro-preview',
    contentNiche: 'entertainment',
    favoriteModels: [],
  },
};

// ============================================================================
// PRESET TYPE
// ============================================================================

export interface ProjectPreset {
  /** Unique ID — used as value in SELECT, prefixed with "preset:" */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Short description shown in the dropdown */
  description: string;
  /** Full settings (basic_info.projectName left empty — filled by user) */
  settings: ProjectSettings;
}

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced defaults for general content',
    settings: {
      basic_info: {
        projectName: '',
        pictureUrl: null,
        contentNiche: 'entertainment',
        aspectRatio: '16-9',
        videoDurationRange: [5, 15],
        autoIdeaVerification: false,
        autoScriptVerification: false,
        autoExportToMedia: false,
      },
      ...BASE_SETTINGS,
    },
  },
  {
    id: 'cinematic-documentary',
    name: 'Cinematic Documentary',
    description: 'Dark, moody docs with slow pacing & warm lighting',
    settings: {
      basic_info: {
        projectName: '',
        pictureUrl: null,
        contentNiche: 'entertainment',
        aspectRatio: '16-9',
        videoDurationRange: [10, 30],
        autoIdeaVerification: false,
        autoScriptVerification: false,
        autoExportToMedia: false,
      },
      ...BASE_SETTINGS,
      visuals: {
        ...BASE_SETTINGS.visuals,
        creativeDirection: {
          visualStyle: 'cinematic, dark, moody, warm golden highlights, shallow depth of field',
          colorPalette: ['#1a1a2e', '#e2b714', '#0f3460', '#533e2d'],
          lightingMood: 'warm',
          qualityAnchors: [
            'cinematic depth of field',
            'volumetric lighting',
            'film grain',
            'atmospheric detail',
          ],
          imageConstraints: [],
          loras: [],
          mgTheme: {
            theme: 'dark',
            colorPalette: ['#e2b714', '#f5f5f5', '#333333'],
            animationStyle: 'smooth',
            fontFamily: 'Inter',
            borderStyle: 'rounded',
          },
          pacingPreset: 'cinematic',
          mediaWeighting: {
            stockFootage: 0.2,
            aiVideo: 0.5,
            motionGraphics: 0.2,
            aiImageStatic: 0.1,
          },
          masterCreativePrompt: '',
        },
      },
      script: {
        ...BASE_SETTINGS.script,
        genre: 'documentary' as const,
      },
    },
  },
  {
    id: 'fast-paced-explainer',
    name: 'Fast-Paced Explainer',
    description: 'Punchy tech / science explainers with rapid cuts',
    settings: {
      basic_info: {
        projectName: '',
        pictureUrl: null,
        contentNiche: 'technology',
        aspectRatio: '16-9',
        videoDurationRange: [5, 12],
        autoIdeaVerification: false,
        autoScriptVerification: false,
        autoExportToMedia: false,
      },
      ...BASE_SETTINGS,
      visuals: {
        ...BASE_SETTINGS.visuals,
        creativeDirection: {
          visualStyle: 'modern, vibrant, clean tech aesthetic with bold accents',
          colorPalette: ['#0a0a0a', '#00d4ff', '#ff6b35', '#ffffff'],
          lightingMood: 'natural',
          qualityAnchors: [],
          imageConstraints: [],
          loras: [],
          mgTheme: {
            theme: 'colorful',
            colorPalette: ['#00d4ff', '#ff6b35', '#ffffff'],
            animationStyle: 'bouncy',
            fontFamily: 'Space Grotesk',
            borderStyle: 'rounded',
          },
          pacingPreset: 'fast-paced',
          mediaWeighting: {
            stockFootage: 0.1,
            aiVideo: 0.25,
            motionGraphics: 0.5,
            aiImageStatic: 0.15,
          },
          masterCreativePrompt: '',
        },
      },
      script: {
        ...BASE_SETTINGS.script,
        genre: 'educational' as const,
        contentNiche: 'technology',
      },
    },
  },
  {
    id: 'educational-tutorial',
    name: 'Educational Tutorial',
    description: 'Calm walkthroughs with heavy MG & clear visuals',
    settings: {
      basic_info: {
        projectName: '',
        pictureUrl: null,
        contentNiche: 'education',
        aspectRatio: '16-9',
        videoDurationRange: [8, 20],
        autoIdeaVerification: false,
        autoScriptVerification: false,
        autoExportToMedia: false,
      },
      ...BASE_SETTINGS,
      visuals: {
        ...BASE_SETTINGS.visuals,
        creativeDirection: {
          visualStyle: 'clean, bright, professional with soft lighting',
          colorPalette: ['#f8f9fa', '#228be6', '#495057', '#212529'],
          lightingMood: 'natural',
          qualityAnchors: [],
          imageConstraints: [],
          loras: [],
          mgTheme: {
            theme: 'light',
            colorPalette: ['#228be6', '#495057', '#f8f9fa'],
            animationStyle: 'smooth',
            fontFamily: 'Inter',
            borderStyle: 'rounded',
          },
          pacingPreset: 'educational',
          mediaWeighting: {
            stockFootage: 0.1,
            aiVideo: 0.1,
            motionGraphics: 0.6,
            aiImageStatic: 0.2,
          },
          masterCreativePrompt: '',
        },
      },
      script: {
        ...BASE_SETTINGS.script,
        genre: 'tutorial' as const,
        contentNiche: 'education',
      },
    },
  },
  {
    id: 'social-media-short',
    name: 'Social Media Short',
    description: 'Vertical 9:16 shorts with fast pacing',
    settings: {
      basic_info: {
        projectName: '',
        pictureUrl: null,
        contentNiche: 'entertainment',
        aspectRatio: '9-16',
        videoDurationRange: [0.5, 2],
        autoIdeaVerification: false,
        autoScriptVerification: false,
        autoExportToMedia: false,
      },
      ...BASE_SETTINGS,
      visuals: {
        ...BASE_SETTINGS.visuals,
        creativeDirection: {
          visualStyle: 'bold, eye-catching, high contrast, social-media optimized',
          colorPalette: ['#000000', '#ff0050', '#00f2ea', '#ffffff'],
          lightingMood: 'dramatic',
          qualityAnchors: [],
          imageConstraints: [],
          loras: [],
          mgTheme: {
            theme: 'dark',
            colorPalette: ['#ff0050', '#00f2ea', '#ffffff'],
            animationStyle: 'snappy',
            fontFamily: 'Outfit',
            borderStyle: 'pill',
          },
          pacingPreset: 'fast-paced',
          mediaWeighting: {
            stockFootage: 0.15,
            aiVideo: 0.45,
            motionGraphics: 0.25,
            aiImageStatic: 0.15,
          },
          masterCreativePrompt: '',
        },
      },
      script: {
        ...BASE_SETTINGS.script,
        genre: 'narrative_fiction' as const,
      },
    },
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Look up a preset by its ID. Returns undefined if not found.
 */
export function getPresetById(id: string): ProjectPreset | undefined {
  return PROJECT_PRESETS.find((p) => p.id === id);
}

/**
 * Given a source identifier (either "preset:{id}" or a project UUID),
 * returns the preset settings if it's a preset, otherwise null.
 */
export function resolvePresetSettings(
  sourceId: string,
  projectName: string,
): ProjectSettings | null {
  if (!sourceId.startsWith('preset:')) return null;

  const presetId = sourceId.replace('preset:', '');
  const preset = getPresetById(presetId);
  if (!preset) return null;

  return {
    ...preset.settings,
    basic_info: {
      ...preset.settings.basic_info,
      projectName,
    },
  };
}
