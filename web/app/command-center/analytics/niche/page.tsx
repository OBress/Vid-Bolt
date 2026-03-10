"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Network,
  Loader2,
  Scan,
  Sparkles,
} from "lucide-react";
import NicheNetworkGraph from "@/components/features/analytics/NicheNetworkGraph";
import NicheNodePanel from "@/components/features/analytics/NicheNodePanel";
import type { NicheNode, NicheEdge } from "@/components/features/analytics/NicheNetworkGraph";

export default function NicheNetworkPage() {
  const [nodes, setNodes] = useState<NicheNode[]>([]);
  const [edges, setEdges] = useState<NicheEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [selectedNode, setSelectedNode] = useState<NicheNode | null>(null);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [removingNode, setRemovingNode] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollForCompletion = useCallback(() => {
    // Clear any existing poll
    if (pollRef.current) clearInterval(pollRef.current);

    const messages = [
      "Searching for related channels...",
      "Analyzing channel content with AI...",
      "Computing similarity scores...",
      "Building network graph...",
    ];
    let msgIdx = 0;
    setScanMessage(messages[0]);

    pollRef.current = setInterval(async () => {
      // Cycle through progress messages
      msgIdx = Math.min(msgIdx + 1, messages.length - 1);
      setScanMessage(messages[msgIdx]);

      try {
        const res = await fetch("/api/analytics/niche/status");
        const data = await res.json();

        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setScanning(false);
          setScanMessage(
            data.status === "completed"
              ? `Found ${data.records_synced} related channels!`
              : "Scan failed. Please try again."
          );
          // Refresh graph data
          await fetchGraph();
          // Clear message after a few seconds
          setTimeout(() => setScanMessage(""), 5000);
        }
      } catch {
        // Keep polling
      }
    }, 4000);
  }, [fetchGraph]);

  const triggerScan = async () => {
    setScanning(true);
    setScanMessage("Starting scan...");
    try {
      const res = await fetch("/api/analytics/niche", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        // Start polling for completion
        pollForCompletion();
      } else {
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

  const emergingCount = nodes.filter((n) => n.is_emerging).length;
  const clusterCount = new Set(nodes.map((n) => n.graph_cluster)).size;

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
                <span>{nodes.length} channels</span>
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

        {/* Scan progress banner */}
        {scanMessage && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
            {scanning && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
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
                nodes={nodes}
                edges={edges}
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
