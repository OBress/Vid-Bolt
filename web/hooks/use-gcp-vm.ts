"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import axios from "axios";
import { toast } from "sonner";

interface UseGCPVMReturn {
  status: string;
  ip: string | null;
  isLoading: boolean;
  isConnected: boolean;
  apiReady: boolean;
  projectId: string;
  provisionVM: () => Promise<void>;
  startVM: () => Promise<void>;
  stopVM: () => Promise<void>;
  gcpToken: string | null;
  displayStatus: "SETUP" | "SETTING UP" | "ON" | "STOPPING" | "OFF";
  statusColor: string;
  checkConnection: () => Promise<void>;
}

export function useGCPVM(): UseGCPVMReturn {
  const [status, setStatus] = useState<string>("NOT_FOUND");
  const [ip, setIp] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [gcpToken, setGcpToken] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);

  const supabase = createClient();

  // Check connection status (handles both session tokens and stored refresh tokens)
  const checkConnection = useCallback(async () => {
    if (!userId || !projectId) return;
    
    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action: "check-connection", projectId },
        { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} }
      );
      
      if (res.data.success && res.data.data?.connected) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    }
    setConnectionChecked(true);
  }, [userId, projectId, gcpToken]);

  // Initial setup
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      // Load GCP Config from DB
      const { data: gcpData } = await supabase
        .from("user_gcp_config")
        .select("project_id, status, external_ip")
        .eq("user_id", user.id)
        .single();

      if (gcpData) {
        if (gcpData.project_id) setProjectId(gcpData.project_id);
        if (gcpData.status) setStatus(gcpData.status);
        if (gcpData.external_ip) setIp(gcpData.external_ip);
      }

      // Check for session token (will be available right after OAuth)
      const wasDisconnected = localStorage.getItem("gcp_disconnected") === "true";
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.provider_token && !wasDisconnected) {
        // Fresh session token available - use it
        setGcpToken(session.provider_token);
        setIsConnected(true);
        setConnectionChecked(true);
      } else if (!wasDisconnected && gcpData?.project_id) {
        // No session token, but user hasn't explicitly disconnected
        // Check if we have a stored refresh token that can be used
        // Don't set connectionChecked yet - let the checkConnection effect handle it
      }
    }
    init();
  }, [supabase]);

  // Check connection after initial load (for persistent auth via refresh token)
  useEffect(() => {
    // If we have userId and projectId but haven't confirmed connection yet,
    // check with the server if we can authenticate via stored refresh token
    if (userId && projectId && !connectionChecked) {
      const wasDisconnected = localStorage.getItem("gcp_disconnected") === "true";
      if (!wasDisconnected) {
        checkConnection();
      } else {
        setConnectionChecked(true);
      }
    }
  }, [userId, projectId, connectionChecked, checkConnection]);

  // Polling for status (only when connected)
  // Dynamic interval: 5s during transitions, 60s when stable
  useEffect(() => {
    if (!isConnected || !projectId) return;

    const isTransitioning = ["PROVISIONING", "STAGING", "STOPPING"].includes(status);
    const pollInterval = isTransitioning ? 5000 : 60000; // 5s or 60s

    const fetchStatus = async () => {
      try {
        const res = await axios.post(
          "/api/gcp/vm",
          { action: "status", projectId },
          { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} }
        );

        if (res.data.success) {
          const { status: newStatus, ip: newIp } = res.data.data;

          // Optimistic UI logic
          let shouldUpdate = true;
          if (targetStatus) {
            if (targetStatus === "STOPPED") {
              if (newStatus === "RUNNING") shouldUpdate = false;
              if (newStatus === "STOPPED" || newStatus === "TERMINATED") setTargetStatus(null);
            } else if (targetStatus === "RUNNING") {
              if (newStatus === "STOPPED" || newStatus === "TERMINATED") shouldUpdate = false;
              if (newStatus === "RUNNING") setTargetStatus(null);
            }
          }

          if (shouldUpdate) {
            setStatus(newStatus || "NOT_FOUND");
          }

          if (newIp) {
            setIp(newIp);
            if (newStatus === "RUNNING") {
              try {
                await fetch(`http://${newIp}:8000/health`, {
                  method: "GET",
                  mode: "no-cors",
                  signal: AbortSignal.timeout(5000),
                });
                setApiReady(true);
              } catch {
                setApiReady(false);
              }
            } else {
              setApiReady(false);
            }
          }
        }
      } catch (e: any) {
        // If we get a 401, connection may have expired
        if (e.response?.status === 401) {
          setIsConnected(false);
        }
        console.error("[useGCPVM] Status fetch error:", e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [isConnected, projectId, gcpToken, targetStatus, status]);

  // Perform GCP action
  const performAction = async (action: "provision" | "start" | "stop") => {
    if (!projectId) {
      toast.error("Missing Project ID");
      return;
    }

    setIsLoading(true);

    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action, projectId },
        { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} }
      );

      if (res.data.success) {
        toast.success(`Action ${action} initiated`);

        // Optimistic UI
        if (action === "provision") {
          setStatus("PROVISIONING");
          setTargetStatus("RUNNING");
        } else if (action === "start") {
          setStatus("STAGING");
          setTargetStatus("RUNNING");
        } else if (action === "stop") {
          setStatus("STOPPING");
          setTargetStatus("STOPPED");
        }
      } else {
        throw new Error(res.data.error || "Unknown error");
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      toast.error(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine display status and color
  let displayStatus: "SETUP" | "SETTING UP" | "ON" | "STOPPING" | "OFF" = "OFF";
  let statusColor = "bg-red-500";

  if (status === "NOT_FOUND") {
    displayStatus = "SETUP";
    statusColor = "bg-neutral-500";
  } else if (status === "PROVISIONING" || status === "STAGING") {
    displayStatus = "SETTING UP";
    statusColor = "bg-yellow-500 animate-pulse";
  } else if (status === "RUNNING") {
    if (apiReady) {
      displayStatus = "ON";
      statusColor = "bg-green-500";
    } else {
      displayStatus = "SETTING UP";
      statusColor = "bg-yellow-500 animate-pulse";
    }
  } else if (status === "STOPPING") {
    displayStatus = "STOPPING";
    statusColor = "bg-orange-500 animate-pulse";
  } else if (status === "STOPPED" || status === "TERMINATED") {
    displayStatus = "OFF";
    statusColor = "bg-red-500";
  }

  return {
    status,
    ip,
    isLoading,
    isConnected,
    apiReady,
    projectId,
    provisionVM: () => performAction("provision"),
    startVM: () => performAction("start"),
    stopVM: () => performAction("stop"),
    gcpToken,
    displayStatus,
    statusColor,
    checkConnection,
  };
}
