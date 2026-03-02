"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseGpuHoursReturn {
  balance: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Client hook to read the user's GPU hours balance with realtime updates.
 */
export function useGpuHours(): UseGpuHoursReturn {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchBalance = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("gpu_hours_balance")
        .eq("id", user.id)
        .single();

      if (data) {
        setBalance(data.gpu_hours_balance ?? 0);
      }
    } catch (error) {
      console.error("[useGpuHours] Error fetching balance:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Realtime subscription for balance changes
  useEffect(() => {
    let userId: string | null = null;

    const setupSubscription = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      const channel = supabase
        .channel("gpu-hours-balance")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            const newBalance = (payload.new as any)?.gpu_hours_balance;
            if (typeof newBalance === "number") {
              setBalance(newBalance);
            }
          }
        )
        .subscribe();

      return channel;
    };

    let channelRef: ReturnType<typeof supabase.channel> | undefined;
    setupSubscription().then((ch) => {
      channelRef = ch;
    });

    return () => {
      if (channelRef) {
        supabase.removeChannel(channelRef);
      }
    };
  }, [supabase]);

  return { balance, loading, refresh: fetchBalance };
}
