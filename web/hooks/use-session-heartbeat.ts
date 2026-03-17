"use client";

/**
 * useSessionHeartbeat Hook
 *
 * Periodically validates the Supabase auth session against the server.
 * Detects cross-origin logouts (e.g., user signs out on production while
 * local dev is still open) and redirects to /login when the session is invalid.
 *
 * Optimisations:
 * - Pauses when the tab is hidden (Page Visibility API)
 * - Runs an immediate check when the tab becomes visible again
 * - Default interval: 30 seconds (configurable)
 */

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SessionHeartbeatOptions {
  /** Polling interval in milliseconds. Default: 30_000 (30s) */
  intervalMs?: number;
}

export function useSessionHeartbeat({
  intervalMs = 30_000,
}: SessionHeartbeatOptions = {}) {
  const router = useRouter();
  const supabase = createClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validateSession = useCallback(async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        console.warn("[SessionHeartbeat] Session invalid, redirecting to login");

        // Clear local auth state
        await supabase.auth.signOut({ scope: "local" });

        // Clear the is_logged_in cookie
        document.cookie =
          "is_logged_in=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";

        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      // Network errors shouldn't log the user out — only auth failures should
      console.error("[SessionHeartbeat] Validation error (non-fatal):", err);
    }
  }, [supabase, router]);

  useEffect(() => {
    // Start the polling interval
    const startPolling = () => {
      if (intervalRef.current) return; // Already running
      intervalRef.current = setInterval(validateSession, intervalMs);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became visible — run an immediate check, then resume polling
        validateSession();
        startPolling();
      } else {
        // Tab hidden — stop polling to save resources
        stopPolling();
      }
    };

    // Initial setup
    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [validateSession, intervalMs]);
}
