import { useState, useEffect, useCallback, useRef } from 'react';
import { UserSettings } from '@/types/settings';
import { SettingsService } from '@/lib/services/settings-service';
import { SettingsCache } from '@/lib/cache/settings-cache';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'en',
  theme: 'system',
};

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  const supabase = createClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);

    const cacheKey = `user_${user.id}`;

    // 1. Try Cache
    const cached = SettingsCache.get<UserSettings>(cacheKey);
    if (cached) {
      setSettings(cached.data);
      setLoading(false);
      if (!cached.stale) return;
    }

    try {
      // 2. Supabase
      const remote = await SettingsService.getUserSettings(user.id);
      if (remote) {
        setSettings(remote);
        SettingsCache.set(cacheKey, remote);
      }
    } catch (err) {
      console.error('Failed to load user settings:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = useCallback(async (partial: Partial<UserSettings>) => {
    if (!userId) return;

    setSettings((prev) => {
      const next = { ...prev, ...partial };
      SettingsCache.set(`user_${userId}`, next);
      return next;
    });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      setSyncing(true);
      try {
        await SettingsService.updateUserSettings(userId, partial);
      } catch (err) {
        console.error('Failed to sync user settings:', err);
        toast.error('Failed to save settings.');
      } finally {
        setSyncing(false);
      }
    }, 1000);
  }, [userId]);

  return {
    settings,
    loading,
    syncing,
    updateSettings,
    refresh: loadSettings,
  };
}
