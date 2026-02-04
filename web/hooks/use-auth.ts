"use client";

/**
 * useAuth Hook
 * 
 * Simple authentication hook that provides the current user from Supabase.
 * Used by the Video Editor V2 and other client components that need user ID.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const supabase = createClient();

  const loadUser = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        throw error;
      }
      
      setState({ user, loading: false, error: null });
    } catch (err) {
      console.error("[useAuth] Failed to load user:", err);
      setState({
        user: null,
        loading: false,
        error: err instanceof Error ? err : new Error("Unknown error"),
      });
    }
  }, [supabase]);

  useEffect(() => {
    loadUser();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState(prev => ({
          ...prev,
          user: session?.user ?? null,
        }));
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [loadUser, supabase]);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    refresh: loadUser,
  };
}
