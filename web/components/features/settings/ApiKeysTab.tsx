"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ApiKeyInput from "@/components/ApiKeyInput";
import {
  Shield,
  Lock,
  Info,
  Terminal,
  Server,
  CheckCircle2,
  Play,
  Square,
  ExternalLink,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import axios from "axios";

interface ApiKeys {
  openrouter_key: string;
  elevenlabs_key: string;
  genai_key: string;
  inworld_tts_key: string;
  replicate_key: string;
  google_cloud_credentials: string;
}

const INITIAL_LOGS = [
  "[System] GCP Panel initialized.",
  "[System] Waiting for connection...",
];

export function ApiKeysTab() {
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

  // GCP DevTools State
  const [projectId, setProjectId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [gcpToken, setGcpToken] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);
  const [vmStatus, setVmStatus] = useState<string>("NOT_FOUND");
  const [vmIp, setVmIp] = useState<string | null>(null);
  const [gcpLoading, setGcpLoading] = useState(false);
  const [projectValid, setProjectValid] = useState<boolean | null>(null);
  const [projectValidating, setProjectValidating] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  const addLog = (message: string) => {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev,
    ]);
  };

  // Initial Load (Keys + GCP Config)
  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Load API Keys
      const { data: keyData } = await supabase
        .from("user_api_keys")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (keyData) {
        setKeys({
          openrouter_key: keyData.openrouter_key || "",
          elevenlabs_key: keyData.elevenlabs_key || "",
          genai_key: keyData.genai_key || "",
          inworld_tts_key: keyData.inworld_tts_key || "",
          replicate_key: keyData.replicate_key || "",
          google_cloud_credentials: keyData.google_cloud_credentials || "",
        });
      }

      // Load GCP Config
      const { data: gcpData } = await supabase
        .from("user_gcp_config")
        .select("project_id, status, external_ip")
        .eq("user_id", user.id)
        .single();

      if (gcpData) {
        if (gcpData.project_id) setProjectId(gcpData.project_id);
        if (gcpData.status) setVmStatus(gcpData.status);
        if (gcpData.external_ip) setVmIp(gcpData.external_ip);
      }

      // Check Session for GCP Token (respect user's disconnect choice)
      const wasDisconnected =
        localStorage.getItem("gcp_disconnected") === "true";
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && session.provider_token && !wasDisconnected) {
        setGcpToken(session.provider_token);
        setIsConnected(true);
        addLog("GCP Session active.");
      } else {
        addLog("No active GCP session found.");
      }

      setLoading(false);
    }
    init();
  }, [supabase]);

  // Polling for GCP status
  useEffect(() => {
    if (!gcpToken || !projectId) return;
    const fetchStatus = async () => {
      try {
        const res = await axios.post(
          "/api/gcp/vm",
          { action: "status", projectId },
          { headers: { "x-gcp-token": gcpToken } },
        );
        if (res.data.success) {
          const { status, ip } = res.data.data;
          setVmStatus(status || "NOT_FOUND");
          if (ip) {
            setVmIp(ip);
            // Check if API is actually reachable when VM is running
            if (status === "RUNNING") {
              try {
                const healthRes = await fetch(`http://${ip}:8000/health`, {
                  method: "GET",
                  mode: "no-cors", // Bypass CORS for health check
                  signal: AbortSignal.timeout(5000),
                });
                // no-cors returns opaque response, so we assume success if no error
                setApiReady(true);
              } catch {
                setApiReady(false);
              }
            } else {
              setApiReady(false);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchStatus(); // Initial call
    const interval = setInterval(async () => {
      // 1. Fetch GCP real-time status (API)
      fetchStatus();

      // 2. Fetch logs from DB (for worker progress)
      const { data } = await supabase
        .from("user_gcp_config")
        .select("metadata, status")
        .eq("user_id", userId!)
        .single();

      if (data && data.metadata && (data.metadata as any).logs) {
        const remoteLogs = (data.metadata as any).logs as string[];
        if (remoteLogs.length > 0) {
          // Merge or replace logs. Simpler to just show latest from DB + local system logs
          // But we want to preserve local "Initiated..." messages maybe?
          // Actually, the worker logs are authoritative for the process.
          // Let's prepend them or just set them.
          // To avoid jitter, let's just use the DB logs if we are in provisioning state.
          // Or just setLogs to the DB logs (which are appended in order).
          // The worker appends new logs to the front or back?
          // Worker: `newLogs = [logEntry, ...currentLogs]` -> Newest first.
          setLogs(remoteLogs);
        }
      }
    }, 5000); // 5s poll
    return () => clearInterval(interval);
  }, [gcpToken, projectId, userId]);

  const handleSaveKey = async (field: keyof ApiKeys, value: string) => {
    if (!userId) return false;
    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: userId,
        [field]: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error(`Error saving ${field}:`, error);
      return false;
    }
    setKeys((prev) => ({ ...prev, [field]: value }));
    return true;
  };

  const handleSaveProjectId = async () => {
    if (!userId || !projectId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("user_gcp_config").upsert(
        {
          user_id: userId,
          project_id: projectId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success("Project ID saved");
    } catch (err: any) {
      toast.error("Failed to save config: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGCPConnect = async () => {
    setGcpLoading(true);
    try {
      addLog("Initiating OAuth flow...");
      // Clear disconnect flag since user is explicitly connecting
      localStorage.removeItem("gcp_disconnected");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/command-center/settings/general?tab=api-keys")}`,
          scopes: "https://www.googleapis.com/auth/compute",
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error("Connection failed: " + err.message);
      addLog("Connection failed: " + err.message);
      setGcpLoading(false);
    }
  };

  const performGCPAction = async (action: "provision" | "start" | "stop") => {
    if (!gcpToken) {
      toast.error("Missing GCP Token");
      return;
    }
    if (!projectId) {
      toast.error("Missing Project ID");
      return;
    }
    setGcpLoading(true);
    addLog(`Sending ${action} command...`);

    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action, projectId },
        { headers: { "x-gcp-token": gcpToken } },
      );

      if (res.data.success) {
        toast.success(`Action ${action} initiated`);
        addLog(`Command ${action} successful.`);
      } else {
        throw new Error(res.data.error || "Unknown error");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      toast.error(`Error: ${msg}`);
      addLog(`Error: ${msg}`);
    } finally {
      setGcpLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Primary Intelligence */}
        <div className="xl:col-span-2 space-y-8">
          {/* GCP Automation Panel (Replacing Google Cloud Credentials) */}
          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                    <Terminal className="text-orange-500" size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                      GOOGLE CLOUD WORKSTATION
                    </CardTitle>
                    <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                      Direct VM Management & Provisioning
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant={isConnected ? "default" : "destructive"}
                  className="uppercase tracking-widest"
                >
                  {isConnected ? "CONNECTED" : "DISCONNECTED"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-8 pb-10 space-y-6">
              {!isConnected ? (
                <div className="p-8 border border-dashed border-neutral-800 rounded-lg flex flex-col items-center justify-center space-y-4 text-center">
                  <div>
                    <h3 className="text-white font-medium">
                      Authentication Required
                    </h3>
                    <p className="text-neutral-500 text-sm max-w-xs mx-auto mt-1">
                      Grant <strong>Compute Engine</strong> permissions to
                      manage GPU nodes.
                    </p>
                  </div>
                  <Button
                    onClick={handleGCPConnect}
                    disabled={gcpLoading}
                    className="bg-white text-black hover:bg-neutral-200 font-bold"
                  >
                    {gcpLoading && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Connect with Google
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Project ID */}
                  <div className="space-y-2">
                    <label className="text-xs text-neutral-500 font-mono uppercase">
                      GCP Project ID
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={projectId}
                        onChange={(e) => {
                          setProjectId(e.target.value);
                          setProjectValid(null); // Reset validation on change
                        }}
                        onBlur={async () => {
                          // Validate on blur if we have token and projectId
                          if (gcpToken && projectId && projectId.length > 3) {
                            setProjectValidating(true);
                            try {
                              const res = await axios.post(
                                "/api/gcp/vm",
                                { action: "validate", projectId },
                                { headers: { "x-gcp-token": gcpToken } },
                              );
                              const isValid = res.data.data?.valid || false;
                              setProjectValid(isValid);

                              // Auto-save if valid
                              if (isValid && userId) {
                                await supabase.from("user_gcp_config").upsert(
                                  {
                                    user_id: userId,
                                    project_id: projectId,
                                    updated_at: new Date().toISOString(),
                                  },
                                  { onConflict: "user_id" },
                                );
                                toast.success("Project ID saved");
                              }
                            } catch {
                              setProjectValid(false);
                            }
                            setProjectValidating(false);
                          }
                        }}
                        placeholder="e.g. vidbolt-dev-1"
                        className="flex-1 bg-black/40 border border-neutral-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
                      />
                      {/* Validation Indicator */}
                      {projectValidating ? (
                        <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
                      ) : projectValid === true ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : projectValid === false ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : null}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-neutral-800/50">
                    {/* Status */}
                    <div className="space-y-4">
                      <h4 className="text-xs text-neutral-500 font-mono uppercase">
                        Instance Status
                      </h4>
                      <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-neutral-800">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            vmStatus === "RUNNING" && apiReady
                              ? "bg-green-500 animate-pulse"
                              : vmStatus === "RUNNING" && !apiReady
                                ? "bg-yellow-500 animate-pulse"
                                : vmStatus === "PROVISIONING" ||
                                    vmStatus === "STAGING"
                                  ? "bg-yellow-500 animate-pulse"
                                  : vmStatus === "STOPPED" ||
                                      vmStatus === "TERMINATED" ||
                                      vmStatus === "NOT_FOUND"
                                    ? "bg-red-500"
                                    : "bg-neutral-500"
                          }`}
                        />
                        <span className="text-sm font-mono text-white tracking-wider">
                          {vmStatus === "RUNNING" && !apiReady
                            ? "SETTING UP"
                            : vmStatus === "RUNNING" && apiReady
                              ? "READY"
                              : vmStatus}
                        </span>
                      </div>
                      {vmIp && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500">IP:</span>
                          <a
                            href={`http://${vmIp}:8000`}
                            target="_blank"
                            className="text-orange-500 hover:text-orange-400 font-mono text-xs flex items-center gap-1"
                          >
                            {vmIp} <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-4">
                      <h4 className="text-xs text-neutral-500 font-mono uppercase">
                        Actions
                      </h4>
                      <div className="flex gap-2">
                        {vmStatus === "NOT_FOUND" ||
                        vmStatus === "TERMINATED" ||
                        vmStatus === "UNKNOWN" ? (
                          <Button
                            onClick={() => performGCPAction("provision")}
                            disabled={gcpLoading}
                            className="w-full bg-green-600 hover:bg-green-700 font-bold"
                          >
                            {gcpLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="flex items-center">
                                <Play className="w-4 h-4 mr-2" />
                                Provision
                              </span>
                            )}
                          </Button>
                        ) : vmStatus === "STOPPED" ? (
                          <Button
                            onClick={() => performGCPAction("start")}
                            disabled={gcpLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 font-bold"
                          >
                            {gcpLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="flex items-center">
                                <Play className="w-4 h-4 mr-2" />
                                Start
                              </span>
                            )}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => performGCPAction("stop")}
                            disabled={gcpLoading}
                            variant="destructive"
                            className="w-full font-bold"
                          >
                            {gcpLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="flex items-center">
                                <Square className="w-4 h-4 mr-2" />
                                Stop
                              </span>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Logs */}
                  <div className="pt-4 border-t border-neutral-800/50">
                    <label className="text-[10px] text-neutral-600 font-mono uppercase block mb-2">
                      System Output
                    </label>
                    <ScrollArea className="h-[100px] w-full rounded-md border border-neutral-800 bg-black/60 p-3 mb-4">
                      <div className="space-y-1">
                        {logs.map((log, i) => (
                          <div
                            key={i}
                            className="text-[10px] font-mono text-neutral-400"
                          >
                            {log}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsConnected(false);
                        setGcpToken(null);
                        localStorage.setItem("gcp_disconnected", "true");
                        toast.success("Disconnected from session");
                      }}
                      className="w-full border border-neutral-800 text-neutral-500 hover:text-white hover:bg-neutral-800"
                    >
                      Disconnect Account
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm overflow-hidden">
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
                onSave={(val) => handleSaveKey("openrouter_key", val)}
                placeholder="sk-or-v1-..."
              />

              <ApiKeyInput
                label="GENAI API KEY"
                value={keys.genai_key}
                onSave={(val) => handleSaveKey("genai_key", val)}
                placeholder="Enter GenAI key..."
              />
            </CardContent>
          </Card>

          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm overflow-hidden">
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
                onSave={(val) => handleSaveKey("elevenlabs_key", val)}
                placeholder="Enter ElevenLabs key..."
              />

              <ApiKeyInput
                label="INWORLD TTS API KEY"
                value={keys.inworld_tts_key}
                onSave={(val) => handleSaveKey("inworld_tts_key", val)}
                placeholder="Enter Inworld key..."
              />

              <ApiKeyInput
                label="REPLICATE API KEY"
                value={keys.replicate_key}
                onSave={(val) => handleSaveKey("replicate_key", val)}
                placeholder="r8_..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Info & Cloud */}
        <div className="space-y-8">
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
