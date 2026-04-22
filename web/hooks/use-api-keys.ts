"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ApiKeyAvailability {
  openrouter_key: boolean;
  inworld_router_key: boolean;    // Inworld LLM Router key
  elevenlabs_key: boolean;
  genai_key: boolean;
  inworld_tts_key: boolean;
  replicate_key: boolean;
  groq_key: boolean;
  valyu_key: boolean;
  llm_provider: 'openrouter' | 'inworld'; // Active LLM provider
}

/**
 * Hook to check which API keys are configured for the current user.
 * Returns boolean availability for each provider.
 */
export function useApiKeys() {
  const [availability, setAvailability] = useState<ApiKeyAvailability>({
    openrouter_key: false,
    inworld_router_key: false,
    elevenlabs_key: false,
    genai_key: false,
    inworld_tts_key: false,
    replicate_key: false,
    groq_key: false,
    valyu_key: false,
    llm_provider: 'openrouter',
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
          .select("openrouter_key, inworld_router_key, llm_provider, elevenlabs_key, genai_key, inworld_tts_key, replicate_key, groq_key, valyu_key")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setAvailability({
            openrouter_key: !!data.openrouter_key,
            inworld_router_key: !!data.inworld_router_key,
            elevenlabs_key: !!data.elevenlabs_key,
            genai_key: !!data.genai_key,
            inworld_tts_key: !!data.inworld_tts_key,
            replicate_key: !!data.replicate_key,
            groq_key: !!data.groq_key,
            valyu_key: !!data.valyu_key,
            llm_provider: (data.llm_provider as 'openrouter' | 'inworld') || 'openrouter',
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
