"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Network,
  Loader2,
  Scan,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import NicheNetworkGraph from "@/components/features/analytics/NicheNetworkGraph";
import NicheNodePanel from "@/components/features/analytics/NicheNodePanel";
import type { NicheNode, NicheEdge } from "@/components/features/analytics/NicheNetworkGraph";

// Cluster color palette — matches NicheNetworkGraph
const CLUSTER_COLORS = [
  "#3b82f6", "#a855f7", "#22c55e", "#eab308",
  "#ef4444", "#f97316", "#06b6d4", "#ec4899",
];

// Niche discovery phase labels for loading screen
const PHASE_LABELS: Record<string, string> = {
  channel_profiling: "Analyzing your channel profile…",
  channel_crawling: "Crawling featured channels…",
  keyword_search: "Searching for related channels…",
  enrichment: "Enriching candidate channels…",
  snowball_expansion: "Expanding network via featured channels…",
  embedding_similarity: "Computing content similarity embeddings…",
  ai_analysis: "AI analyzing channel similarity…",
  scoring: "Computing multi-signal scores…",
  storing_results: "Storing results…",
};

export default function NicheNetworkPage() {
  const [nodes, setNodes] = useState<NicheNode[]>([]);
  const [edges, setEdges] = useState<NicheEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [selectedNode, setSelectedNode] = useState<NicheNode | null>(null);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [removingNode, setRemovingNode] = useState(false);
  const taskChannelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null>(null);

  // Filtering state
  const [similarityThreshold, setSimilarityThreshold] = useState(0);
  const [hiddenClusters, setHiddenClusters] = useState<Set<number>>(new Set());
  const [emergingOnly, setEmergingOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/niche");
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      console.error("Failed to fetch niche network:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to a specific task for real-time progress updates
  const subscribeToTask = useCallback(
    (taskId: string) => {
      // Clean up any existing subscription
      if (taskChannelRef.current) {
        supabase.removeChannel(taskChannelRef.current);
      }

      const channel = supabase
        .channel(`niche-task-${taskId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tasks",
            filter: `id=eq.${taskId}`,
          },
          (payload) => {
            const task = payload.new as {
              status: string;
              current_phase: string | null;
              current_step: string | null;
              progress_percent: number;
            };

            if (task.status === "running") {
              setScanning(true);
              setScanPhase(task.current_phase || "");
              setScanProgress(task.progress_percent);
              setScanMessage(
                PHASE_LABELS[task.current_phase || ""] ||
                  task.current_step ||
                  "Processing…"
              );
            } else if (
              task.status === "completed" ||
              task.status === "failed"
            ) {
              setScanning(false);
              setScanMessage(
                task.status === "completed"
                  ? "Scan complete!"
                  : "Scan failed. Please try again."
              );
              setScanProgress(task.status === "completed" ? 100 : 0);
              fetchGraph();
              setTimeout(() => {
                setScanMessage("");
                setScanProgress(0);
                setScanPhase("");
              }, 4000);
              // Unsubscribe
              supabase.removeChannel(channel);
              taskChannelRef.current = null;
            }
          }
        )
        .subscribe();

      taskChannelRef.current = channel;
    },
    [supabase, fetchGraph]
  );

  // On mount: check for running niche_discovery tasks (persists across refresh)
  useEffect(() => {
    async function checkRunningTask() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: runningTask } = await supabase
        .from("tasks")
        .select("id, status, current_phase, current_step, progress_percent")
        .eq("user_id", user.id)
        .eq("type", "niche_discovery")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (runningTask) {
        setScanning(true);
        setScanPhase(runningTask.current_phase || "");
        setScanProgress(runningTask.progress_percent);
        setScanMessage(
          PHASE_LABELS[runningTask.current_phase || ""] ||
            runningTask.current_step ||
            "Starting scan…"
        );
        subscribeToTask(runningTask.id);
      }
    }

    checkRunningTask();
    fetchGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (taskChannelRef.current) {
        supabase.removeChannel(taskChannelRef.current);
      }
    };
  }, [supabase]);

  const triggerScan = async () => {
    setScanning(true);
    setScanMessage("Starting scan…");
    setScanProgress(0);
    try {
      const res = await fetch("/api/analytics/niche", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.taskId) {
        // Subscribe to this task for real-time progress
        subscribeToTask(data.taskId);
      } else if (!res.ok) {
        setScanning(false);
        setScanMessage(data.error || "Failed to start scan");
        setTimeout(() => setScanMessage(""), 5000);
      }
    } catch (err) {
      console.error("Failed to trigger scan:", err);
      setScanning(false);
      setScanMessage("Failed to start scan");
      setTimeout(() => setScanMessage(""), 5000);
    }
  };

  const trackAsCompetitor = async (channelId: string) => {
    setAddingCompetitor(true);
    try {
      await fetch("/api/analytics/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
    } catch (err) {
      console.error("Failed to track competitor:", err);
    } finally {
      setAddingCompetitor(false);
    }
  };

  const removeFromNetwork = async (channelId: string) => {
    setRemovingNode(true);
    try {
      await fetch(`/api/analytics/niche?channelId=${channelId}`, {
        method: "DELETE",
      });
      setNodes((prev) => prev.filter((n) => n.channel_id !== channelId));
      setEdges((prev) =>
        prev.filter(
          (e) => e.source_channel !== channelId && e.target_channel !== channelId
        )
      );
      if (selectedNode?.channel_id === channelId) setSelectedNode(null);
    } catch (err) {
      console.error("Failed to remove node:", err);
    } finally {
      setRemovingNode(false);
    }
  };

  // Compute clusters from nodes
  const clusters = useMemo(() => {
    const clusterMap = new Map<number, { count: number; avgSim: number; color: string }>();
    for (const node of nodes) {
      const c = node.graph_cluster ?? 0;
      if (c === -1) continue;
      const existing = clusterMap.get(c) || { count: 0, avgSim: 0, color: CLUSTER_COLORS[Math.abs(c) % CLUSTER_COLORS.length] };
      existing.count += 1;
      existing.avgSim += node.similarity_score;
      clusterMap.set(c, existing);
    }
    for (const [, v] of clusterMap) {
      v.avgSim = v.count > 0 ? v.avgSim / v.count : 0;
    }
    return clusterMap;
  }, [nodes]);

  // Filter nodes and edges
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const isUserChannel = n.graph_cluster === -1 || n.similarity_score === 1.0;
      if (isUserChannel) return true;
      if (n.similarity_score < similarityThreshold / 100) return false;
      if (hiddenClusters.has(n.graph_cluster ?? 0)) return false;
      if (emergingOnly && !n.is_emerging) return false;
      return true;
    });
  }, [nodes, similarityThreshold, hiddenClusters, emergingOnly]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.channel_id));
    return edges.filter(
      (e) => nodeIds.has(e.source_channel) && nodeIds.has(e.target_channel)
    );
  }, [edges, filteredNodes]);

  const emergingCount = nodes.filter((n) => n.is_emerging).length;
  const clusterCount = clusters.size;
  const isFiltered = similarityThreshold > 0 || hiddenClusters.size > 0 || emergingOnly;

  const toggleCluster = (clusterId: number) => {
    setHiddenClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-4 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Network className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Niche Network</h2>
              <p className="text-sm text-muted-foreground">
                AI-powered discovery of channels in your content niche.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {nodes.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {isFiltered ? `${filteredNodes.length}/${nodes.length}` : nodes.length} channels
                </span>
                <span>·</span>
                <span>{clusterCount} clusters</span>
                {emergingCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {emergingCount} emerging
                    </span>
                  </>
                )}
              </div>
            )}
            {nodes.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  showFilters || isFiltered
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border/40 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {isFiltered && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            )}
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Scan className="w-4 h-4" />
              )}
              {scanning ? "Scanning..." : "Scan Now"}
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        {showFilters && nodes.length > 0 && (
          <div className="mt-3 p-4 rounded-xl bg-card/80 border border-border/30 space-y-3">
            {/* Similarity Threshold */}
            <div className="flex items-center gap-4">
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap w-28">
                Min Similarity
              </label>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                className="flex-1 h-1.5 accent-primary cursor-pointer"
              />
              <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                {similarityThreshold}%
              </span>
            </div>

            {/* Cluster Chips */}
            <div className="flex items-center gap-4">
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap w-28">
                Clusters
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(clusters.entries()).map(([clusterId, info]) => (
                  <button
                    key={clusterId}
                    onClick={() => toggleCluster(clusterId)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                      hiddenClusters.has(clusterId)
                        ? "opacity-40 bg-muted/30 text-muted-foreground"
                        : "bg-muted/50 text-foreground"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: info.color }}
                    />
                    {info.count} ch
                  </button>
                ))}
              </div>
            </div>

            {/* Emerging Toggle */}
            <div className="flex items-center gap-4">
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap w-28">
                Emerging Only
              </label>
              <button
                onClick={() => setEmergingOnly(!emergingOnly)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  emergingOnly ? "bg-amber-500" : "bg-muted/50"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    emergingOnly ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Scan progress banner */}
        {scanning && (
          <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <span className="text-sm text-primary font-medium">
                {scanMessage || "Scanning..."}
              </span>
              <span className="ml-auto text-xs text-primary/60 tabular-nums font-mono">
                {scanProgress}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Post-scan message (when not actively scanning) */}
        {!scanning && scanMessage && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
            <span className="text-primary">{scanMessage}</span>
          </div>
        )}

        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : scanning && nodes.length === 0 ? (
          /* Full loading screen when scanning with no existing data */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 max-w-md">
              <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Network className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <h3 className="text-xl font-semibold">Discovering Your Niche</h3>
              <p className="text-muted-foreground text-sm">
                {scanMessage || "Analyzing your channel and searching for related creators..."}
              </p>
              <div className="w-64 mx-auto">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    {PHASE_LABELS[scanPhase] || "Processing…"}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {scanProgress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Network className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">No Channels Discovered Yet</h3>
              <p className="text-muted-foreground max-w-md">
                Click &quot;Scan Now&quot; to discover channels in your niche. The AI
                analyzes your video content to find semantically similar creators.
              </p>
              <button
                onClick={triggerScan}
                disabled={scanning}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {scanning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Scan className="w-4 h-4" />
                )}
                {scanning ? "Scanning..." : "Start Discovery"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Graph */}
            <div className="flex-1 min-w-0 bg-background/50">
              <NicheNetworkGraph
                nodes={filteredNodes}
                edges={filteredEdges}
                onNodeClick={setSelectedNode}
                selectedNodeId={selectedNode?.channel_id}
              />
            </div>

            {/* Side Panel */}
            {selectedNode && (
              <NicheNodePanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                onTrackAsCompetitor={trackAsCompetitor}
                onRemove={removeFromNetwork}
                isAdding={addingCompetitor}
                isRemoving={removingNode}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
