import { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectSettings } from '@/types/settings';
import { SettingsService } from '@/lib/services/settings-service';
import { SettingsCache } from '@/lib/cache/settings-cache';

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
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
  voice: {
    provider: 'inworld',
    model: 'inworld-tts-1-max',
    voiceName: 'Hades',
    speakerBoost: false,
    stability: 100,
    similarityBoost: 0,
    speakingSpeed: 100,
    voiceStyle: 0,
  },
  visuals: {
    imageModel: 'local-z-image',
    videoModel: 'local-ltx2',
    imageEditModel: 'local-qwen-edit',
    creativeDirection: {
      visualStyle: 'cinematic, documentary, clean composition',
      colorPalette: [],
      lightingMood: 'natural',
      qualityAnchors: [],
      imageConstraints: [],
      loras: [],
      mgTheme: {
        theme: 'dark' as const,
        colorPalette: ['#f97316', '#ffffff', '#333333'],
        animationStyle: 'smooth' as const,
        fontFamily: 'Inter',
        borderStyle: 'rounded' as const,
      },
      pacingPreset: 'documentary' as const,
      mediaWeighting: {
        stockFootage: 0.3,
        aiVideo: 0.4,
        motionGraphics: 0.2,
        aiImageStatic: 0.1,
      },
      masterCreativePrompt:
        'Produce polished, cinematic content with smooth pacing and professional composition. Use natural lighting with subtle color grading. Ensure every visual serves the narrative — no filler shots. Maintain visual consistency across cuts with matched color temperatures and coherent framing.',
    },
  },
  editing: {},
  export: {
    defaultTargets: [],
  },
  script: {
    pov: '1st',
    protagonistGender: 'any',
    genre: 'documentary',
    researchDepth: 'full',
    openrouterModel: 'google/gemini-3-flash-preview',
    qualityReviewModel: 'google/gemini-3-pro-preview',
    contentNiche: 'entertainment',
    favoriteModels: [],
    toneStyle: undefined,
    targetAudience: undefined,
    advanced: {
      systemPrompts: {},
      bannedPhrases: undefined,
      wordReplacements: undefined,
      engagementTiming: undefined,
    },
  },
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useProjectSettings(projectId: string | undefined) {
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  
  const cacheKey = `project_${projectId}`;
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadSettings = useCallback(async () => {
    if (!projectId) return;

    // 1. Try Cache first
    const cached = SettingsCache.get<ProjectSettings>(cacheKey);
    if (cached) {
      setSettings(cached.data);
      setLoading(false);
      
      // If not stale, we're done for now
      if (!cached.stale) return;
    }

    try {
      // 2. Fetch from Supabase
      const remoteSettings = await SettingsService.getProjectSettings(projectId);
      if (remoteSettings) {
        setSettings(remoteSettings);
        SettingsCache.set(cacheKey, remoteSettings);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, cacheKey]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = useCallback(async (partial: Partial<ProjectSettings>) => {
    if (!projectId) return;

    // Clear any existing status timeout
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);

    // Optimistic Update
    setSettings((prev) => {
      const next = { ...prev };
      // Shallow merge the top level objects
      (Object.keys(partial) as Array<keyof ProjectSettings>).forEach((key) => {
        if (typeof partial[key] === 'object' && partial[key] !== null) {
          next[key] = { ...(next[key] as any), ...(partial[key] as any) };
        } else {
          (next as any)[key] = partial[key];
        }
      });
      
      // Update cache immediately
      SettingsCache.set(cacheKey, next);
      return next;
    });

    // Show saving status
    setSaveStatus('saving');

    // Debounced Sync to Supabase
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      setSyncing(true);
      try {
        await SettingsService.updateProjectSettings(projectId, partial);
        setSyncing(false);
        setSaveStatus('saved');
        
        // Reset to idle after 2 seconds
        statusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (err) {
        console.error('Failed to sync settings:', err);
        setSyncing(false);
        setSaveStatus('error');
        
        // Reset to idle after 3 seconds
        statusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      }
    }, 1000);
  }, [projectId, cacheKey]);

  return {
    settings,
    loading,
    syncing,
    saveStatus,
    error,
    updateSettings,
    refresh: loadSettings,
  };
}
