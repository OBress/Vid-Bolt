"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Terminal,
  Server,
  Shield,
  CheckCircle2,
  Play,
  Square,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import axios from "axios";

// Mock data for initial UI build
const INITIAL_LOGS = [
  "[System] DevTools initialized.",
  "[System] Waiting for GCP connection...",
];

export default function DevToolsPage() {
  const [supabase] = useState(() => createClient());
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [gcpToken, setGcpToken] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);

  // Project ID State
  const [projectId, setProjectId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Load project ID from DB
  useEffect(() => {
    const loadConfig = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("user_gcp_config")
        .select("project_id")
        .eq("user_id", user.id)
        .single();

      if (data?.project_id) {
        setProjectId(data.project_id);
      }
    };
    loadConfig();
  }, [supabase]);

  // Save project ID manual handler (to avoid too many upserts on type)
  const handleSaveProjectId = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !projectId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from("user_gcp_config").upsert(
        {
          user_id: user.id,
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

  // VM State
  const [vmStatus, setVmStatus] = useState<string>("UNKNOWN");
  const [vmIp, setVmIp] = useState<string | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev,
    ]);
  };

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && session.provider_token) {
        setGcpToken(session.provider_token);
        setIsConnected(true);
        addLog("GCP Session active.");
        // Initial status check
        fetchStatus(session.provider_token);
      } else {
        addLog("No active GCP session found. Please connect.");
      }
    };
    checkSession();
  }, [supabase]);

  // Polling for status
  useEffect(() => {
    if (!gcpToken) return;
    const interval = setInterval(() => fetchStatus(gcpToken), 10000); // 10s poll
    return () => clearInterval(interval);
  }, [gcpToken]);

  const fetchStatus = async (token: string) => {
    // Must have projectId to check status (if not yet loaded, wait)
    if (!projectId) return;

    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action: "status", projectId },
        {
          headers: { "x-gcp-token": token },
        },
      );
      if (res.data.success) {
        const { status, ip } = res.data.data;
        setVmStatus(status || "NOT_FOUND");
        if (ip) setVmIp(ip);
      }
    } catch (err) {
      // Silent fail on polls
      console.error(err);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      addLog("Initiating OAuth flow...");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "https://www.googleapis.com/auth/compute",
          queryParams: {
            access_type: "offline", // Important for refresh tokens
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      // Redirect happens automatically
    } catch (err: any) {
      toast.error("Connection failed: " + err.message);
      addLog("Connection failed: " + err.message);
      setLoading(false);
    }
  };

  const performAction = async (action: "provision" | "start" | "stop") => {
    if (!gcpToken) {
      toast.error("Missing GCP Token");
      return;
    }
    if (!projectId) {
      toast.error("Missing Project ID");
      return;
    }
    setLoading(true);
    addLog(`Sending ${action} command...`);

    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action, projectId },
        {
          headers: { "x-gcp-token": gcpToken },
        },
      );

      if (res.data.success) {
        toast.success(`Action ${action} initiated`);
        addLog(
          `Command ${action} successful. Operation ID: ${res.data.data.name || "N/A"}`,
        );
        // Trigger immediate status refresh
        fetchStatus(gcpToken);
      } else {
        throw new Error(res.data.error || "Unknown error");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      toast.error(`Error: ${msg}`);
      addLog(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wider flex items-center gap-3">
            <Terminal className="w-8 h-8 text-orange-500" />
            DEV TOOLS
          </h1>
          <p className="text-sm text-neutral-400">
            Google Cloud Platform Integration & Node Management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isConnected ? "default" : "destructive"}
            className="uppercase tracking-widest"
          >
            {isConnected ? "GCP Connected" : "GCP Disconnected"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Card */}
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-500" />
              GCP Connection
            </CardTitle>
            <CardDescription>
              Connect your Google Cloud account to enable automation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConnected ? (
              <div className="p-4 border border-dashed border-neutral-800 rounded-lg flex flex-col items-center justify-center space-y-4 py-8">
                <div className="text-center space-y-2">
                  <h3 className="text-white font-medium">
                    Authentication Required
                  </h3>
                  <p className="text-neutral-500 text-sm max-w-xs mx-auto">
                    You need to grant <strong>Compute Engine</strong>{" "}
                    permissions to allow Vid-Bolt to manage GPU nodes.
                  </p>
                </div>
                <Button
                  onClick={handleConnect}
                  disabled={loading}
                  className="bg-white text-black hover:bg-neutral-200 font-bold"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Connect with Google
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert className="bg-green-500/10 border-green-500/20 text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertTitle>Connected</AlertTitle>
                  <AlertDescription>
                    Your account is authorized and session is active.
                  </AlertDescription>
                </Alert>

                {/* Project ID Input */}
                <div className="space-y-2">
                  <label className="text-xs text-neutral-500 block mb-1">
                    GCP Project ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder="e.g. vidbolt-dev-1"
                      className="flex-1 bg-black/40 border border-neutral-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    <Button
                      onClick={handleSaveProjectId}
                      disabled={!projectId || isSaving}
                      variant="secondary"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-neutral-600">
                    The project ID where resources will be provisioned.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-black/40 rounded-lg border border-neutral-800">
                    <label className="text-xs text-neutral-500 block mb-1">
                      Default Zone
                    </label>
                    <code className="text-sm text-white font-mono">
                      us-east4-c
                    </code>
                  </div>
                  <div className="p-3 bg-black/40 rounded-lg border border-neutral-800">
                    <label className="text-xs text-neutral-500 block mb-1">
                      Region
                    </label>
                    <code className="text-sm text-white font-mono">
                      us-east4
                    </code>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsConnected(false);
                    setGcpToken(null);
                  }}
                  className="w-full border-neutral-800 hover:bg-neutral-800 text-neutral-400"
                >
                  Disconnect Account
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VM Control Card */}
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-orange-500" />
                  Node Management
                </CardTitle>
                <CardDescription>
                  Control your GPU infrastructure.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => gcpToken && fetchStatus(gcpToken)}
                disabled={!gcpToken}
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-black/40 rounded-lg border border-neutral-800">
              <div className="space-y-1">
                <h4 className="text-white font-bold text-sm">
                  Target Specification
                </h4>
                <p className="text-xs text-neutral-500 font-mono">
                  g4-standard-48 (RTX 6000)
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-orange-500 text-orange-500 bg-orange-500/10"
              >
                SPOT INSTANCE
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Status</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      vmStatus === "RUNNING"
                        ? "bg-green-500 animate-pulse"
                        : vmStatus === "PROVISIONING" || vmStatus === "STAGING"
                          ? "bg-yellow-500 animate-pulse"
                          : vmStatus === "STOPPED" ||
                              vmStatus === "TERMINATED" ||
                              vmStatus === "NOT_FOUND"
                            ? "bg-red-500"
                            : "bg-neutral-500"
                    }`}
                  />
                  <span className="text-sm font-mono text-white">
                    {vmStatus}
                  </span>
                </div>
              </div>
              {vmIp ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">External IP</span>
                  <a
                    href={`http://${vmIp}:8000`}
                    target="_blank"
                    className="flex items-center gap-1 text-sm font-mono text-orange-500 hover:underline"
                  >
                    {vmIp}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">External IP</span>
                  <span className="text-sm text-neutral-600 font-mono">--</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {vmStatus === "NOT_FOUND" || vmStatus === "TERMINATED" ? (
                <Button
                  onClick={() => performAction("provision")}
                  disabled={loading || !isConnected}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Play className="w-4 h-4 mr-2" />
                  Provision Node
                </Button>
              ) : vmStatus === "STOPPED" ? (
                <Button
                  onClick={() => performAction("start")}
                  disabled={loading || !isConnected}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Play className="w-4 h-4 mr-2" />
                  Start Node
                </Button>
              ) : (
                <Button
                  onClick={() => performAction("stop")}
                  disabled={loading || vmStatus.includes("STOPPING")}
                  variant="destructive"
                  className="w-full font-bold"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Square className="w-4 h-4 mr-2 fill-current" />
                  {vmStatus === "RUNNING" ? "Stop Node" : "Delete/Stop Node"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Logs Console */}
        <Card className="bg-neutral-900 border-neutral-700 lg:col-span-2">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-mono text-neutral-400 uppercase tracking-widest">
              System Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] w-full rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-neutral-300 border-b border-neutral-900/50 last:border-0 pb-1 mb-1"
                  >
                    {log}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
