"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ApiKeyAvailability {
  openrouter_key: boolean;
  elevenlabs_key: boolean;
  genai_key: boolean;
  inworld_tts_key: boolean;
  replicate_key: boolean;
  groq_key: boolean;
}

/**
 * Hook to check which API keys are configured for the current user.
 * Returns boolean availability for each provider.
 */
export function useApiKeys() {
  const [availability, setAvailability] = useState<ApiKeyAvailability>({
    openrouter_key: false,
    elevenlabs_key: false,
    genai_key: false,
    inworld_tts_key: false,
    replicate_key: false,
    groq_key: false,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchKeys() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("user_api_keys")
          .select("openrouter_key, elevenlabs_key, genai_key, inworld_tts_key, replicate_key, groq_key")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setAvailability({
            openrouter_key: !!data.openrouter_key,
            elevenlabs_key: !!data.elevenlabs_key,
            genai_key: !!data.genai_key,
            inworld_tts_key: !!data.inworld_tts_key,
            replicate_key: !!data.replicate_key,
            groq_key: !!data.groq_key,
          });
        }
      } catch (error) {
        console.error("Failed to fetch API key availability:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchKeys();
  }, [supabase]);

  return { availability, loading };
}
