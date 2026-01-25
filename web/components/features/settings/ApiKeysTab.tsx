"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ApiKeyInput from "@/components/ApiKeyInput";
import {
  Shield,
  Terminal,
  Play,
  Square,
  ExternalLink,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";

interface ApiKeys {
  openrouter_key: string;
  elevenlabs_key: string;
  genai_key: string;
  inworld_tts_key: string;
  replicate_key: string;
  google_cloud_credentials: string;
  groq_key: string;
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
    groq_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // GCP DevTools State
  const [isAdmin, setIsAdmin] = useState(false);
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

  // State to track desired/transitioning status to prevent polling from reverting optimistic UI
  const [targetStatus, setTargetStatus] = useState<string | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev,
    ]);
  };

  // Initial Load (Keys + GCP Config)
  useEffect(() => {
    // ... (keep existing init logic, just referencing it here contextually if needed, but we start replacing from below)
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
          groq_key: keyData.groq_key || "",
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
        // Fresh session token available
        setGcpToken(session.provider_token);
        setIsConnected(true);
        addLog("GCP Session active.");
      } else if (!wasDisconnected && gcpData?.project_id) {
        // No session token, but check if we have a stored refresh token
        addLog("Checking for stored GCP credentials...");
        try {
          const res = await axios.post("/api/gcp/vm", {
            action: "check-connection",
            projectId: gcpData.project_id,
          });
          if (res.data.success && res.data.data?.connected) {
            setIsConnected(true);
            addLog("GCP connection restored via stored credentials.");
          } else {
            addLog("No active GCP session found.");
          }
        } catch {
          addLog("No active GCP session found.");
        }
      } else {
        addLog("No active GCP session found.");
      }

      // Load user profile to check admin status
      const { data: userData } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (userData) {
        setIsAdmin(userData.is_admin || false);
      }

      setLoading(false);
    }
    init();
  }, [supabase]);

  // Polling for GCP status
  // Dynamic interval: 5s during transitions, 60s when stable
  useEffect(() => {
    if (!isConnected || !projectId) return;

    const isTransitioning = ["PROVISIONING", "STAGING", "STOPPING"].includes(
      vmStatus,
    );
    const pollInterval = isTransitioning ? 5000 : 60000; // 5s or 60s

    const fetchStatus = async () => {
      try {
        const res = await axios.post(
          "/api/gcp/vm",
          { action: "status", projectId },
          { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} },
        );
        if (res.data.success) {
          const { status, ip } = res.data.data;

          // Logic to prevent stale poll data from overwriting optimistic transition state
          let shouldUpdate = true;
          if (targetStatus) {
            if (targetStatus === "STOPPED") {
              // Waiting for stop: Ignore RUNNING
              if (status === "RUNNING") shouldUpdate = false;
              // If we reached STOPPED or STOPPING (or TERMINATED), update and clear target if done
              if (status === "STOPPED" || status === "TERMINATED")
                setTargetStatus(null);
            } else if (targetStatus === "RUNNING") {
              // Waiting for start: Ignore STOPPED/TERMINATED
              if (status === "STOPPED" || status === "TERMINATED")
                shouldUpdate = false;
              if (status === "RUNNING") setTargetStatus(null);
            }
          }

          if (shouldUpdate) {
            setVmStatus(status || "NOT_FOUND");
          }

          if (ip) {
            setVmIp(ip);
            // Check if API is actually reachable when VM is running
            if (status === "RUNNING") {
              try {
                await fetch(`http://${ip}:8000/health`, {
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

    const fetchLogs = async () => {
      // Fetch logs from DB (for worker progress) - only during transitions
      if (!isTransitioning) return;

      const { data } = await supabase
        .from("user_gcp_config")
        .select("metadata, status")
        .eq("user_id", userId!)
        .single();

      if (data && data.metadata && (data.metadata as any).logs) {
        const remoteLogs = (data.metadata as any).logs as string[];
        if (remoteLogs.length > 0) {
          setLogs(remoteLogs);
        }
      }
    };

    fetchStatus(); // Initial call
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [
    isConnected,
    projectId,
    gcpToken,
    targetStatus,
    vmStatus,
    userId,
    supabase,
  ]);

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

        // Optimistic UI update & Target Status Lock
        if (action === "provision") {
          setVmStatus("PROVISIONING");
          setTargetStatus("RUNNING");
        } else if (action === "start") {
          setVmStatus("STAGING");
          setTargetStatus("RUNNING");
        } else if (action === "stop") {
          setVmStatus("STOPPING");
          setTargetStatus("STOPPED");
        }
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
      <div className="flex flex-col gap-8">
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
          <CardContent className="pt-4 pb-6 space-y-4 text-center sm:text-left">
            {!isConnected ? (
              <div className="p-6 border border-dashed border-neutral-800 rounded-lg flex flex-col items-center justify-center space-y-4 text-center">
                <div>
                  <h3 className="text-white font-medium text-sm">
                    Authentication Required
                  </h3>
                  <p className="text-neutral-500 text-[11px] max-w-xs mx-auto mt-1 uppercase tracking-tight font-medium">
                    Grant <strong>Compute Engine</strong> permissions to manage
                    GPU nodes.
                  </p>
                </div>
                <Button
                  onClick={handleGCPConnect}
                  disabled={gcpLoading}
                  className="bg-white text-black hover:bg-neutral-200 font-bold h-8 text-xs"
                >
                  {gcpLoading && (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  )}
                  Connect with Google
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Project ID */}
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-500 font-mono uppercase">
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
                      className="flex-1 bg-black/40 border border-neutral-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors font-mono"
                    />
                    {/* Validation Indicator */}
                    {projectValidating ? (
                      <Loader2 className="w-3 h-3 text-neutral-500 animate-spin" />
                    ) : projectValid === true ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : projectValid === false ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : null}
                  </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-neutral-800/20">
                  {/* Status */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] text-neutral-500 font-mono uppercase">
                      Instance Status
                    </h4>
                    <div className="flex items-center gap-3 p-2 bg-black/20 rounded-lg border border-neutral-800">
                      {(() => {
                        // Compute display status locally to match VMStatus logic
                        let displayStatus = "OFF";
                        let statusColor = "bg-red-500";

                        if (vmStatus === "NOT_FOUND") {
                          displayStatus = "SETUP";
                          statusColor = "bg-neutral-500";
                        } else if (
                          vmStatus === "PROVISIONING" ||
                          vmStatus === "STAGING"
                        ) {
                          displayStatus = "SETTING UP";
                          statusColor = "bg-yellow-500 animate-pulse";
                        } else if (vmStatus === "RUNNING") {
                          if (apiReady) {
                            displayStatus = "ON";
                            statusColor = "bg-green-500";
                          } else {
                            displayStatus = "SETTING UP";
                            statusColor = "bg-yellow-500 animate-pulse";
                          }
                        } else if (vmStatus === "STOPPING") {
                          displayStatus = "STOPPING";
                          statusColor = "bg-orange-500 animate-pulse";
                        } else if (
                          vmStatus === "STOPPED" ||
                          vmStatus === "TERMINATED"
                        ) {
                          displayStatus = "OFF";
                          statusColor = "bg-red-500";
                        }

                        return (
                          <>
                            <div
                              className={`w-2 h-2 rounded-full ${statusColor}`}
                            />
                            <span className="text-xs font-mono text-white tracking-wider">
                              {displayStatus}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                    {vmIp && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 font-mono">
                          IP:
                        </span>
                        <a
                          href={`http://${vmIp}:8000`}
                          target="_blank"
                          className="text-orange-500 hover:text-orange-400 font-mono text-[10px] flex items-center gap-1"
                        >
                          {vmIp} <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] text-neutral-500 font-mono uppercase">
                      Actions
                    </h4>
                    <div className="flex gap-2">
                      {vmStatus === "PROVISIONING" || vmStatus === "STAGING" ? (
                        <Button
                          disabled
                          className="w-full bg-neutral-800 text-neutral-400 border border-neutral-700 h-8 text-xs"
                        >
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Turning On...
                        </Button>
                      ) : vmStatus === "STOPPING" ? (
                        <Button
                          disabled
                          className="w-full bg-neutral-800 text-neutral-400 border border-neutral-700 h-8 text-xs"
                        >
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          Turning Off...
                        </Button>
                      ) : vmStatus === "RUNNING" ? (
                        <Button
                          onClick={() => performGCPAction("stop")}
                          disabled={gcpLoading}
                          variant="destructive"
                          className="w-full font-bold h-8 text-xs"
                        >
                          {gcpLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span className="flex items-center">
                              <Square className="w-3 h-3 mr-2" />
                              Turn Off
                            </span>
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            performGCPAction(
                              vmStatus === "NOT_FOUND" ||
                                vmStatus === "TERMINATED"
                                ? "provision"
                                : "start",
                            )
                          }
                          disabled={gcpLoading}
                          className="w-full bg-green-600 hover:bg-green-700 font-bold h-8 text-xs"
                        >
                          {gcpLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span className="flex items-center">
                              <Play className="w-3 h-3 mr-2" />
                              Turn On
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* System Output */}
                <div className="pt-2 border-t border-neutral-800/20">
                  <label className="text-[9px] text-neutral-600 font-mono uppercase block mb-1">
                    System Output
                  </label>
                  <ScrollArea className="h-[70px] w-full rounded-md border border-neutral-800 bg-black/60 p-2">
                    <div className="space-y-0.5">
                      {logs.map((log, i) => (
                        <div
                          key={i}
                          className="text-[9px] font-mono text-neutral-400"
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full border border-red-900/30 text-red-500/50 hover:text-red-400 hover:bg-red-950/20 hover:border-red-500/50 h-7 text-[9px] uppercase tracking-widest font-mono mt-2 transition-all duration-300 shadow-[0_0_8px_rgba(220,38,38,0.05)] hover:shadow-[0_0_12px_rgba(220,38,38,0.15)]"
                    >
                      Disconnect Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-neutral-900 border-neutral-800">
                    <DialogHeader>
                      <DialogTitle className="text-white">
                        Disconnect GCP Account?
                      </DialogTitle>
                      <DialogDescription className="text-neutral-400">
                        This will remove your Google Cloud connection. You will
                        need to reconnect to manage your VM.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                      <DialogClose asChild>
                        <Button
                          variant="ghost"
                          className="text-neutral-400 hover:text-white"
                        >
                          Cancel
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          variant="destructive"
                          onClick={async () => {
                            try {
                              await axios.post("/api/gcp/disconnect");
                              setIsConnected(false);
                              setGcpToken(null);
                              localStorage.setItem("gcp_disconnected", "true");
                              toast.success("GCP account disconnected");
                            } catch (err: any) {
                              toast.error(
                                "Failed to disconnect: " +
                                  (err.message || "Unknown error"),
                              );
                            }
                          }}
                        >
                          Disconnect
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Keys Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Required Keys */}
          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm overflow-hidden h-full">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <Shield className="text-orange-500" size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                    REQUIRED API KEYS
                  </CardTitle>
                  <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                    Essential credentials for core agent functionality and
                    speech
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
                tooltip="Required for the primary LLM intelligence that powers the agent's conversational abilities."
              />
              <ApiKeyInput
                label="INWORLD TTS API KEY"
                value={keys.inworld_tts_key}
                onSave={(val) => handleSaveKey("inworld_tts_key", val)}
                placeholder="Enter Inworld key..."
                tooltip="Required for generating realistic text-to-speech voices for the agent."
              />
            </CardContent>
          </Card>

          {/* Optional Keys */}
          <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm overflow-hidden h-full">
            <CardHeader className="border-b border-neutral-800/50 pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Shield className="text-blue-500" size={18} />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-neutral-200 tracking-widest uppercase font-mono">
                    OPTIONAL API KEYS
                  </CardTitle>
                  <CardDescription className="text-neutral-600 text-[11px] mt-0.5 font-medium uppercase tracking-tight">
                    Additional services for enhanced capabilities
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 pb-10 space-y-10">
              <ApiKeyInput
                label="GENAI API KEY"
                value={keys.genai_key}
                onSave={(val) => handleSaveKey("genai_key", val)}
                placeholder="Enter GenAI key..."
                tooltip="Optional. Used for additional generative capabilities if configured."
              />
              <ApiKeyInput
                label="ELEVENLABS API KEY"
                value={keys.elevenlabs_key}
                onSave={(val) => handleSaveKey("elevenlabs_key", val)}
                placeholder="Enter ElevenLabs key..."
                tooltip="Optional. Alternative high-quality text-to-speech provider."
              />
              <ApiKeyInput
                label="REPLICATE API KEY"
                value={keys.replicate_key}
                onSave={(val) => handleSaveKey("replicate_key", val)}
                placeholder="r8_..."
                tooltip="Optional. Used for image and video generation features."
              />
              <ApiKeyInput
                label="GROQ API KEY"
                value={keys.groq_key}
                onSave={(val) => handleSaveKey("groq_key", val)}
                placeholder="gsk_..."
                tooltip="Optional. Used for Whisper transcription with word-level timestamps in video segmentation."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
