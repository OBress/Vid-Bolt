"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import axios from "axios";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

export type VMDisplayStatus = "SETUP" | "STARTING" | "BUILDING" | "LOADING" | "ON" | "STOPPING" | "OFF";

export interface GCPVMState {
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
  displayStatus: VMDisplayStatus;
  statusDetail: string | null;
  statusColor: string;
  checkConnection: () => Promise<void>;
  // Extended fields used by the settings page
  logs: string[];
  addLog: (message: string) => void;
  setIsConnected: (connected: boolean) => void;
  setGcpToken: (token: string | null) => void;
  setProjectId: (id: string) => void;
  performAction: (action: "provision" | "start" | "stop") => Promise<void>;
}

const INITIAL_LOGS = [
  "[System] GCP Panel initialized.",
  "[System] Waiting for connection...",
];

const GCPVMContext = createContext<GCPVMState | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

export function GCPVMProvider({ children }: { children: React.ReactNode }) {
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
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);

  // Refs so the polling effect can read latest values without restarting
  const statusRef = useRef(status);
  statusRef.current = status;
  const targetStatusRef = useRef(targetStatus);
  targetStatusRef.current = targetStatus;

  const supabase = createClient();

  // ── Logs ─────────────────────────────────────────────────────────────────

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev,
    ]);
  }, []);

  // ── Connection Check ────────────────────────────────────────────────────

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

  // ── Initial Setup ───────────────────────────────────────────────────────

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
        addLog("GCP Session active.");
      } else if (!wasDisconnected && gcpData?.project_id) {
        // No session token, but user hasn't explicitly disconnected
        // Check if we have a stored refresh token that can be used
        addLog("Checking for stored GCP credentials...");
      } else {
        addLog("No active GCP session found.");
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connection Check (for persistent auth via refresh token) ────────────

  useEffect(() => {
    if (userId && projectId && !connectionChecked) {
      const wasDisconnected = localStorage.getItem("gcp_disconnected") === "true";
      if (!wasDisconnected) {
        checkConnection().then(() => {
          // Log result after check completes (isConnected state will have updated)
        });
      } else {
        setConnectionChecked(true);
      }
    }
  }, [userId, projectId, connectionChecked, checkConnection]);

  // ── Real-Time Subscription ──────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("vm-status-shared")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_gcp_config",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newData = payload.new as { status?: string; external_ip?: string; metadata?: any };
          if (newData.status) setStatus(newData.status);
          if (newData.external_ip) setIp(newData.external_ip);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  // ── Polling ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isConnected || !projectId) return;

    const fetchStatus = async () => {
      try {
        const res = await axios.post(
          "/api/gcp/vm",
          { action: "status", projectId },
          { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} }
        );

        if (res.data.success) {
          const { status: newStatus, ip: newIp } = res.data.data;

          // Optimistic UI logic — read from refs for latest values
          const currentTarget = targetStatusRef.current;
          let shouldUpdate = true;
          if (currentTarget) {
            if (currentTarget === "STOPPED") {
              if (newStatus === "RUNNING") shouldUpdate = false;
              if (newStatus === "STOPPED" || newStatus === "TERMINATED") setTargetStatus(null);
            } else if (currentTarget === "RUNNING") {
              if (newStatus === "STOPPED" || newStatus === "TERMINATED" || newStatus === "NOT_FOUND") shouldUpdate = false;
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
                const healthRes = await fetch("/api/gpu-api/health", {
                  signal: AbortSignal.timeout(8000),
                });
                const healthData = await healthRes.json();
                setApiReady(healthRes.ok && healthData.success === true);
              } catch {
                setApiReady(false);
              }
            } else {
              setApiReady(false);
            }
          }
        }
      } catch (e: any) {
        if (e.response?.status === 401) {
          setIsConnected(false);
        }
        if (![429, 500, 502].includes(e.response?.status)) {
          console.error("[GCPVMProvider] Status fetch error:", e.message || e);
        }
      }
    };

    // Also fetch logs from DB during transitions
    const fetchLogs = async () => {
      const isTransitioning = ["PROVISIONING", "STAGING", "STOPPING", "BOOTING", "INSTALLING_DRIVERS", "INSTALLING_DOCKER", "CLONING_REPO", "CHECKING_UPDATES", "UPDATING_REPO", "CLEANING_DOCKER", "BUILDING_DOCKER", "STARTING_APP", "REBOOTING"].includes(statusRef.current);
      if (!isTransitioning || !userId) return;

      const { data } = await supabase
        .from("user_gcp_config")
        .select("metadata, status")
        .eq("user_id", userId)
        .single();

      if (data && data.metadata && (data.metadata as any).logs) {
        const remoteLogs = (data.metadata as any).logs as string[];
        if (remoteLogs.length > 0) {
          setLogs(remoteLogs);
        }
      }
    };

    fetchStatus();

    // Smart interval: 10s tick, poll every tick during transitions, every 6th tick when stable
    let tickCount = 0;
    const interval = setInterval(() => {
      tickCount++;
      const isTransitioning = ["PROVISIONING", "STAGING", "STOPPING", "BOOTING", "INSTALLING_DRIVERS", "INSTALLING_DOCKER", "CLONING_REPO", "CHECKING_UPDATES", "UPDATING_REPO", "CLEANING_DOCKER", "BUILDING_DOCKER", "STARTING_APP", "REBOOTING"].includes(statusRef.current);
      if (isTransitioning || tickCount % 6 === 0) {
        fetchStatus();
        fetchLogs();
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [isConnected, projectId, gcpToken, userId, supabase]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const performAction = useCallback(async (action: "provision" | "start" | "stop") => {
    if (!projectId) {
      toast.error("Missing Project ID");
      return;
    }

    setIsLoading(true);
    addLog(`Sending ${action} command...`);

    try {
      const res = await axios.post(
        "/api/gcp/vm",
        { action, projectId },
        { headers: gcpToken ? { "x-gcp-token": gcpToken } : {} }
      );

      if (res.data.success) {
        toast.success(`Action ${action} initiated`);
        addLog(`Command ${action} successful.`);

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
      addLog(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, gcpToken, addLog]);

  // ── Derived Display State ───────────────────────────────────────────────

  // Statuses reported by the VM startup script (uppercased by the webhook):
  // BOOTING, INSTALLING_DRIVERS, INSTALLING_DOCKER, CLONING_REPO,
  // CHECKING_UPDATES, UPDATING_REPO, CLEANING_DOCKER, BUILDING_DOCKER,
  // STARTING_APP, REBOOTING, READY (→ mapped to RUNNING by webhook)
  const BUILDING_STATUSES = [
    "BUILDING_DOCKER", "CLEANING_DOCKER", "UPDATING_REPO",
    "CLONING_REPO", "INSTALLING_DRIVERS", "INSTALLING_DOCKER", "REBOOTING",
  ];
  const STARTING_STATUSES = [
    "PROVISIONING", "STAGING", "BOOTING", "CHECKING_UPDATES", "STARTING_APP",
  ];

  let displayStatus: VMDisplayStatus = "OFF";
  let statusColor = "bg-red-500";
  let statusDetail: string | null = null;

  if (status === "NOT_FOUND") {
    displayStatus = "SETUP";
    statusColor = "bg-neutral-500";
  } else if (BUILDING_STATUSES.includes(status)) {
    displayStatus = "BUILDING";
    statusColor = "bg-orange-500 animate-pulse";
    // Provide context-specific detail
    if (status === "BUILDING_DOCKER") statusDetail = "Building containers (~10-20 min)";
    else if (status === "CLEANING_DOCKER") statusDetail = "Cleaning old containers...";
    else if (status === "UPDATING_REPO" || status === "CLONING_REPO") statusDetail = "Pulling latest code...";
    else if (status === "INSTALLING_DRIVERS") statusDetail = "Installing GPU drivers (first boot)";
    else if (status === "INSTALLING_DOCKER") statusDetail = "Installing Docker (first boot)";
    else if (status === "REBOOTING") statusDetail = "Rebooting after driver install...";
  } else if (STARTING_STATUSES.includes(status)) {
    displayStatus = "STARTING";
    statusColor = "bg-yellow-500 animate-pulse";
    if (status === "STARTING_APP") statusDetail = "Starting containers...";
    else if (status === "CHECKING_UPDATES") statusDetail = "Checking for updates...";
    else statusDetail = "Booting VM...";
  } else if (status === "RUNNING") {
    if (apiReady) {
      displayStatus = "ON";
      statusColor = "bg-green-500";
    } else {
      displayStatus = "LOADING";
      statusColor = "bg-blue-500 animate-pulse";
      statusDetail = "Loading AI models...";
    }
  } else if (status === "STOPPING") {
    displayStatus = "STOPPING";
    statusColor = "bg-orange-500 animate-pulse";
  } else if (status === "STOPPED" || status === "TERMINATED") {
    displayStatus = "OFF";
    statusColor = "bg-red-500";
  }

  // ── Context Value ───────────────────────────────────────────────────────

  const value: GCPVMState = {
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
    statusDetail,
    statusColor,
    checkConnection,
    // Extended
    logs,
    addLog,
    setIsConnected,
    setGcpToken,
    setProjectId,
    performAction,
  };

  return (
    <GCPVMContext.Provider value={value}>
      {children}
    </GCPVMContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGCPVM(): GCPVMState {
  const context = useContext(GCPVMContext);
  if (!context) {
    throw new Error("useGCPVM must be used within a <GCPVMProvider>");
  }
  return context;
}
