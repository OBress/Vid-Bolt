import { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectSettings } from '@/types/settings';
import { SettingsService } from '@/lib/services/settings-service';
import { SettingsCache } from '@/lib/cache/settings-cache';

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  basic_info: {
    projectName: '',
    pictureUrl: null,
    contentNiche: 'entertainment',
    aspectRatio: '9-16',
    videoDurationRange: [10, 30],
    autoIdeaVerification: true,
    autoScriptVerification: true,
    autoExportToMedia: false,
  },
  voice: {
    provider: 'elevenlabs',
    model: 'multilingual-v2',
    voiceName: 'adam',
    speakerBoost: true,
    stability: 50,
    similarityBoost: 75,
    speakingSpeed: 100,
    voiceStyle: 80,
  },
  visuals: {
    imageModel: 'flux',
    videoModel: 'luma',
  },
  editing: {},
  export: {
    defaultTargets: [],
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
