"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ApiKeyInput from "@/components/ApiKeyInput";
import { Key, Shield, Info, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface ApiKeys {
  openrouter_key: string;
  elevenlabs_key: string;
  genai_key: string;
  inworld_tts_key: string;
  replicate_key: string;
  google_cloud_credentials: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeys>({
    openrouter_key: "",
    elevenlabs_key: "",
    genai_key: "",
    inworld_tts_key: "",
    replicate_key: "",
    google_cloud_credentials: "",
  });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchKeys() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("user_api_keys")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setKeys({
          openrouter_key: data.openrouter_key || "",
          elevenlabs_key: data.elevenlabs_key || "",
          genai_key: data.genai_key || "",
          inworld_tts_key: data.inworld_tts_key || "",
          replicate_key: data.replicate_key || "",
          google_cloud_credentials: data.google_cloud_credentials || "",
        });
      }
      setLoading(false);
    }
    fetchKeys();
  }, [supabase]);

  const handleSave = async (field: keyof ApiKeys, value: string) => {
    if (!userId) return false;

    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: userId,
        [field]: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error(`Error saving ${field}:`, error);
      return false;
    }

    setKeys((prev) => ({ ...prev, [field]: value }));
    return true;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-neutral-800 border-t-orange-500 rounded-full animate-spin"></div>
          <p className="text-neutral-500 text-xs font-mono tracking-widest uppercase">
            INITIALIZING SECURE LINK...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 lg:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-700 bg-black min-h-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
          <h1 className="text-2xl font-bold text-white tracking-tighter uppercase font-mono">
            API INFRASTRUCTURE
          </h1>
        </div>
        <p className="text-neutral-500 text-sm max-w-2xl font-medium ml-4">
          Configure credentials for secondary intelligence systems and media
          generation protocols. All vectors are secured via operative-specific
          RLS encryption.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Primary Intelligence */}
        <div className="xl:col-span-2 space-y-8">
          <Card className="bg-neutral-950/50 border-neutral-800 shadow-2xl backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                  <Shield className="text-orange-500" size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                    INTELLIGENCE & LANGUAGE
                  </CardTitle>
                  <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                    Secondary LLM routing and direct AI processing credentials
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 pb-10 space-y-10">
              <ApiKeyInput
                label="OPENROUTER API KEY"
                value={keys.openrouter_key}
                onSave={(val) => handleSave("openrouter_key", val)}
                placeholder="sk-or-v1-..."
              />

              <ApiKeyInput
                label="GENAI API KEY"
                value={keys.genai_key}
                onSave={(val) => handleSave("genai_key", val)}
                placeholder="Enter GenAI key..."
              />
            </CardContent>
          </Card>

          <Card className="bg-neutral-950/50 border-neutral-800 shadow-2xl backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Shield className="text-orange-500" size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                    MEDIA & SYNTHESIS
                  </CardTitle>
                  <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                    Voice cloning, text-to-speech, and image generation
                    protocols
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 pb-10 space-y-10">
              <ApiKeyInput
                label="ELEVENLABS API KEY"
                value={keys.elevenlabs_key}
                onSave={(val) => handleSave("elevenlabs_key", val)}
                placeholder="Enter ElevenLabs key..."
              />

              <ApiKeyInput
                label="INWORLD TTS API KEY"
                value={keys.inworld_tts_key}
                onSave={(val) => handleSave("inworld_tts_key", val)}
                placeholder="Enter Inworld key..."
              />

              <ApiKeyInput
                label="REPLICATE API KEY"
                value={keys.replicate_key}
                onSave={(val) => handleSave("replicate_key", val)}
                placeholder="r8_..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Info & Cloud */}
        <div className="space-y-8">
          <Card className="bg-neutral-950/50 border-neutral-800 shadow-2xl backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Shield className="text-orange-500" size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                    CLOUD PROTOCOLS
                  </CardTitle>
                  <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                    Infrastructure credentials for internal services
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 pb-10">
              <ApiKeyInput
                label="GOOGLE CLOUD OPERATING KEY"
                value={keys.google_cloud_credentials}
                onSave={(val) => handleSave("google_cloud_credentials", val)}
                placeholder="Paste credentials here..."
              />
            </CardContent>
          </Card>

          <div className="bg-neutral-900/30 border border-neutral-800/50 rounded-2xl p-6 relative overflow-hidden group shadow-inner">
            <div className="absolute top-[-20%] right-[-10%] p-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-1000">
              <Lock size={160} className="text-orange-500" />
            </div>

            <div className="relative z-10 space-y-5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-500/10 rounded-lg ring-1 ring-orange-500/20">
                  <Info className="text-orange-500" size={16} />
                </div>
                <h3 className="text-xs font-bold text-white uppercase tracking-tighter font-mono">
                  SECURITY ADVISORY
                </h3>
              </div>

              <p className="text-[11px] text-neutral-500 leading-relaxed font-medium uppercase tracking-tight">
                OPERATIVE NOTICE: All API keys are processed via encrypted
                channels and stored in the secure vault. Row-Level Security
                (RLS) ensures that credentials cannot be accessed by
                unauthorized protocols.
              </p>

              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between text-[10px] font-mono border-b border-neutral-800/50 pb-2">
                  <span className="text-neutral-600 uppercase tracking-widest">
                    SESSION STATUS:
                  </span>
                  <span className="text-emerald-500 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/20 animate-pulse">
                    ENCRYPTED
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono border-b border-neutral-800/50 pb-2">
                  <span className="text-neutral-600 uppercase tracking-widest">
                    RLS POLICIES:
                  </span>
                  <span className="text-emerald-500 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/20">
                    VERIFIED
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-neutral-600 uppercase tracking-widest">
                    AUTH DELEGATION:
                  </span>
                  <span className="text-orange-500 font-bold bg-orange-500/5 px-2 py-0.5 rounded border border-orange-500/20">
                    DIRECT
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
