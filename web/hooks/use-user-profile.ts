"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  hashid: string | null;
  date_joined: string;
  account_tier: string;
  credits: number;
  is_admin: boolean;
  onboarding_completed: boolean;
  status: 'pending' | 'active' | 'paused' | 'banned';
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  
  const supabase = createClient();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(async (updates: Partial<Pick<UserProfile, 'name'>>) => {
    if (!profile) return;

    // Clear any existing status timeout
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);

    // Optimistic update
    setProfile((prev) => prev ? { ...prev, ...updates } : prev);
    setSaveStatus('saving');

    // Debounced save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', profile.id);

        if (error) throw error;
        
        setSaveStatus('saved');
        statusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (err) {
        console.error('Failed to update profile:', err);
        setSaveStatus('error');
        statusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      }
    }, 1000);
  }, [profile, supabase]);

  return {
    profile,
    loading,
    saveStatus,
    updateProfile,
    refresh: loadProfile,
  };
}
