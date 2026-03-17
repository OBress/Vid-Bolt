"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { forceCollide, forceX, forceY } from "d3-force";

// Dynamically import to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

// ============================================================================
// Types
// ============================================================================

export interface NicheNode {
  id: string;
  channel_id: string;
  channel_title: string;
  channel_handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  similarity_score: number;
  shared_topics: string[];
  discovery_keywords: string[];
  topic_categories: string[];
  graph_x: number | null;
  graph_y: number | null;
  graph_cluster: number | null;
  is_emerging: boolean;
  discovery_method: string;
  embedding_similarity: number | null;
  tag_overlap_score: number | null;
  similarity_reason: string | null;
  shared_audience: string | null;
}

export interface NicheEdge {
  source_channel: string;
  target_channel: string;
  weight: number;
  shared_keywords: string[];
}

interface GraphNode {
  id: string;
  label: string;
  val: number;
  cluster: number;
  isEmerging: boolean;
  isUserChannel: boolean;
  similarity: number;
  thumbnailUrl: string | null;
  clusterTargetX: number; // target X for cluster sector positioning
  clusterTargetY: number; // target Y for cluster sector positioning
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
  isStar?: boolean; // edge connecting to user's center channel
}

interface NicheNetworkGraphProps {
  nodes: NicheNode[];
  edges: NicheEdge[];
  onNodeClick: (node: NicheNode) => void;
  selectedNodeId?: string | null;
}

// Cluster color palette — hex for canvas compatibility
const CLUSTER_COLORS = [
  "#3b82f6", // Blue
  "#a855f7", // Purple
  "#22c55e", // Green
  "#eab308", // Gold
  "#ef4444", // Red
  "#f97316", // Orange
  "#06b6d4", // Cyan
  "#ec4899", // Pink
];

const USER_CHANNEL_COLOR = "#c084fc"; // Bright purple for user's channel

// ---------------------------------------------------------------------------
// Edge thinning: build a Maximum Spanning Tree per cluster using Kruskal's
// algorithm so that intra-cluster cliques become sparse trees.
// ---------------------------------------------------------------------------
function buildClusterMSTs(links: GraphLink[], nodeClusterMap: Map<string, number>): GraphLink[] {
  // Group edges by cluster (both endpoints must share a cluster)
  const clusterEdges = new Map<number, GraphLink[]>();
  const crossClusterEdges: GraphLink[] = [];

  for (const link of links) {
    const cA = nodeClusterMap.get(link.source);
    const cB = nodeClusterMap.get(link.target);
    if (cA !== undefined && cB !== undefined && cA === cB && cA !== -1) {
      const existing = clusterEdges.get(cA) || [];
      existing.push(link);
      clusterEdges.set(cA, existing);
    } else {
      crossClusterEdges.push(link);
    }
  }

  // Kruskal's MST per cluster (maximum spanning tree → sort descending by weight)
  const mstEdges: GraphLink[] = [];
  for (const [, edges] of clusterEdges) {
    const sorted = [...edges].sort((a, b) => b.weight - a.weight);
    // Union-Find
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: string, b: string): boolean => {
      const ra = find(a), rb = find(b);
      if (ra === rb) return false;
      parent.set(ra, rb);
      return true;
    };
    for (const edge of sorted) {
      if (union(edge.source, edge.target)) {
        mstEdges.push(edge);
      }
    }
  }

  return [...mstEdges, ...crossClusterEdges];
}

export default function NicheNetworkGraph({
  nodes,
  edges,
  onNodeClick,
  selectedNodeId,
}: NicheNetworkGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [layoutStable, setLayoutStable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  // Use ref instead of state for hover — avoids full React re-render on every
  // mouse move, which was causing the graph to rebuild and "glitch".
  const hoveredNodeRef = useRef<string | null>(null);

  // Resize handler
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Preload thumbnail images
  useEffect(() => {
    for (const node of nodes) {
      if (node.thumbnail_url && !imageCache.current.has(node.channel_id)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = node.thumbnail_url;
        imageCache.current.set(node.channel_id, img);
      }
    }
  }, [nodes]);

  // Build graph data — memoized to prevent re-creating on every render.
  // Previously called inline as graphData(), which caused re-render on every
  // hover because setHoveredNode triggered a new graphData object reference,
  // resetting the force simulation.
  const memoizedGraphData = useMemo(() => {
    const nodeIdSet = new Set(nodes.map((n) => n.channel_id));
    let userChannelId: string | null = null;

    // Step 1: Assign each cluster a base angle so same-cluster nodes
    // are angularly grouped, but distance is purely by similarity
    const clusterIds = new Set<number>();
    for (const n of nodes) {
      const isUser = n.graph_cluster === -1 || n.similarity_score === 1.0;
      if (!isUser) clusterIds.add(n.graph_cluster ?? 0);
    }
    const clusterArray = Array.from(clusterIds).sort((a, b) => a - b);
    const clusterAngleMap = new Map<number, number>();
    clusterArray.forEach((cId, i) => {
      clusterAngleMap.set(cId, (i / clusterArray.length) * 2 * Math.PI);
    });

    // Track how many nodes per cluster to spread them within the sector
    const clusterNodeIndex = new Map<number, number>();

    const graphNodes: GraphNode[] = nodes.map((n) => {
      const isUserChannel = n.graph_cluster === -1 || n.similarity_score === 1.0;
      if (isUserChannel) userChannelId = n.channel_id;

      // Size: user's channel = largest, others scaled by similarity
      const baseSize = isUserChannel
        ? 12
        : Math.max(4, n.similarity_score * 10);

      // Radial distance: higher similarity → closer to center
      // Range: ~80 (sim=1.0) to ~350 (sim=0.0)
      const distance = isUserChannel
        ? 0
        : 80 + (1 - n.similarity_score) * 270;

      // Angular position: base cluster angle + small offset per node
      // so nodes within a cluster fan out slightly
      const cId = n.graph_cluster ?? 0;
      const baseAngle = clusterAngleMap.get(cId) ?? 0;
      const nodeIdx = clusterNodeIndex.get(cId) ?? 0;
      clusterNodeIndex.set(cId, nodeIdx + 1);
      // Spread within sector: ±0.3 radians per node
      const sectorSpread = (nodeIdx - 3) * 0.15;
      const angle = baseAngle + sectorSpread;

      const targetX = isUserChannel ? 0 : Math.cos(angle) * distance;
      const targetY = isUserChannel ? 0 : Math.sin(angle) * distance;

      // Initial position: near target with small scatter
      const scatter = 30;
      const initX = targetX + (Math.random() - 0.5) * scatter;
      const initY = targetY + (Math.random() - 0.5) * scatter;

      return {
        id: n.channel_id,
        label: n.channel_title,
        val: baseSize,
        cluster: cId,
        isEmerging: n.is_emerging,
        isUserChannel,
        similarity: n.similarity_score,
        thumbnailUrl: n.thumbnail_url,
        clusterTargetX: targetX,
        clusterTargetY: targetY,
        // Pin the user's channel at center
        ...(isUserChannel
          ? { x: 0, y: 0, fx: 0, fy: 0 }
          : { x: initX, y: initY }),
      };
    });

    // Step 2: Include ALL edges — forceX/forceY prevents layout collapse
    // so we can safely show every relationship
    const allLinks: GraphLink[] = edges
      .filter(
        (e) => nodeIdSet.has(e.source_channel) && nodeIdSet.has(e.target_channel)
      )
      .map((e) => {
        const isStar = userChannelId
          ? e.source_channel === userChannelId || e.target_channel === userChannelId
          : false;
        return {
          source: e.source_channel,
          target: e.target_channel,
          weight: e.weight,
          isStar,
        };
      });

    return { nodes: graphNodes, links: allLinks };
  }, [nodes, edges]);

  // Custom node rendering
  const drawNode = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Guard: skip rendering until force layout assigns valid positions
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      const size = (node.val as number) * 2;
      const isSelected = node.id === selectedNodeId;
      // Read from ref (no re-render needed for hover changes)
      const isHovered = node.id === hoveredNodeRef.current;
      const isUserChannel = node.isUserChannel as boolean;

      const clusterColor = isUserChannel
        ? USER_CHANNEL_COLOR
        : CLUSTER_COLORS[Math.abs(node.cluster) % CLUSTER_COLORS.length];

      // Outer glow for user's channel
      if (isUserChannel) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 6, 0, 2 * Math.PI);
        const gradient = ctx.createRadialGradient(
          node.x, node.y, size - 2,
          node.x, node.y, size + 8
        );
        gradient.addColorStop(0, "rgba(192, 132, 252, 0.4)");
        gradient.addColorStop(1, "rgba(192, 132, 252, 0)");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Glow for emerging channels
      if (node.isEmerging && !isUserChannel) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255, 200, 0, 0.15)";
        ctx.fill();
      }

      // Selection / hover ring
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, size + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? "white" : "rgba(255,255,255,0.6)";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = clusterColor;
      ctx.fill();

      // Border
      ctx.strokeStyle = isUserChannel
        ? "rgba(255,255,255,0.6)"
        : "rgba(255,255,255,0.2)";
      ctx.lineWidth = isUserChannel ? 2 : 1;
      ctx.stroke();

      // Thumbnail image
      const img = imageCache.current.get(node.id);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, size - 1, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(
          img,
          node.x - size + 1,
          node.y - size + 1,
          (size - 1) * 2,
          (size - 1) * 2
        );
        ctx.restore();
      }

      // Level-of-detail labels: hide all when very zoomed out,
      // show only key nodes at medium zoom, show all at close zoom
      let showLabel = false;
      if (globalScale < 0.4) {
        // Very zoomed out: only user channel
        showLabel = isUserChannel;
      } else if (globalScale < 0.8) {
        // Medium zoom: user + selected + hovered + high similarity
        showLabel = isUserChannel || isSelected || isHovered || (node.similarity as number) > 0.5;
      } else {
        // Close zoom: all labels
        showLabel = isUserChannel || isSelected || isHovered || (node.similarity as number) > 0.3 || globalScale > 1.0;
      }

      if (showLabel) {
        const label = node.label as string;
        const fontSize = isUserChannel
          ? Math.max(14 / globalScale, 5)
          : Math.max(11 / globalScale, 3);
        ctx.font = `${isUserChannel ? "bold " : ""}${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const displayLabel = label.length > 22 ? label.slice(0, 22) + "…" : label;
        const textWidth = ctx.measureText(displayLabel).width;

        // Background behind label
        const padding = 2;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(
          node.x - textWidth / 2 - padding,
          node.y + size + 2,
          textWidth + padding * 2,
          fontSize + padding * 2
        );

        ctx.fillStyle = isUserChannel
          ? "rgba(192, 132, 252, 1)"
          : "rgba(255,255,255,0.85)";
        ctx.fillText(displayLabel, node.x, node.y + size + 4);

        // Similarity badge (not for user's channel)
        if (!isUserChannel && (isSelected || isHovered || globalScale > 1.2)) {
          const simText = `${Math.round((node.similarity as number) * 100)}%`;
          const simFontSize = Math.max(9 / globalScale, 2.5);
          ctx.font = `${simFontSize}px Inter, sans-serif`;
          const simWidth = ctx.measureText(simText).width;

          ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
          ctx.fillRect(
            node.x - simWidth / 2 - 2,
            node.y + size + fontSize + 6,
            simWidth + 4,
            simFontSize + 3
          );
          ctx.fillStyle = "white";
          ctx.fillText(simText, node.x, node.y + size + fontSize + 7);
        }
      }
    },
    // Only depends on selectedNodeId — hoveredNodeRef is a ref, not state
    [selectedNodeId]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graphNode: any) => {
      const nicheNode = nodes.find((n) => n.channel_id === graphNode.id);
      if (nicheNode) onNodeClick(nicheNode);
    },
    [nodes, onNodeClick]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeHover = useCallback((graphNode: any) => {
    hoveredNodeRef.current = graphNode?.id || null;
    // No explicit refresh needed — nodeCanvasObject's drawNode reads
    // hoveredNodeRef.current on each canvas frame automatically.
    // The force-graph rerenders the canvas every animation frame.
  }, []);

  // Configure d3 forces via ref after mount
  useEffect(() => {
    if (!graphRef.current) return;
    const fg = graphRef.current;

    // 1. Similarity-based positioning forces — PRIMARY layout mechanism
    // Pulls each node to its target (distance from center = similarity)
    fg.d3Force('clusterX',
      forceX()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .x((node: any) => node.clusterTargetX ?? 0)
        .strength(0.2)
    );
    fg.d3Force('clusterY',
      forceY()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .y((node: any) => node.clusterTargetY ?? 0)
        .strength(0.2)
    );

    // 2. Charge repulsion — pushes all nodes apart globally
    fg.d3Force('charge')?.strength(-200).distanceMax(400);

    // 3. Link force — VERY weak, only for visual structure
    // All ~170 edges shown, so must be weak to not override positioning
    fg.d3Force('link')
      ?.distance((link: any) => {
        const w = link.weight ?? 0.3;
        if (link.isStar) return 80 + (1 - w) * 120;
        return 50 + (1 - w) * 100;
      })
      .strength((link: any) => {
        const w = link.weight ?? 0.3;
        if (link.isStar) return Math.max(0.005, w * 0.02); // star: minimal
        return Math.max(0.01, w * 0.05);                   // peer: very light
      });

    // 4. Collision force — prevents node/label overlap
    fg.d3Force('collide', forceCollide()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .radius((node: any) => (node.val as number) * 2 + 10)
      .strength(0.8)
      .iterations(3)
    );

    // Remove the default center force — our cluster positioning handles this
    fg.d3Force('center', null);

    // Reheat to apply new forces
    fg.d3ReheatSimulation();
  }, [nodes.length, edges.length]);

  // Fit to screen once layout stabilizes
  useEffect(() => {
    if (graphRef.current && nodes.length > 0 && layoutStable) {
      graphRef.current?.zoomToFit(400, 80);
    }
  }, [nodes.length, layoutStable]);

  // Also fit on initial load
  useEffect(() => {
    if (graphRef.current && nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80);
      }, 1200);
    }
  }, [nodes.length]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <ForceGraph2D
        ref={graphRef}
        graphData={memoizedGraphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        nodePointerAreaPaint={(node, color, ctx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const n = node as any;
          const size = (n.val as number) * 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, size + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(link) => {
          const l = link as unknown as GraphLink;
          // Brighter, more visible edges
          const alpha = l.isStar
            ? Math.max(0.2, Math.min(0.5, l.weight * 0.8))
            : Math.max(0.25, Math.min(0.7, l.weight));
          return l.isStar
            ? `rgba(192, 132, 252, ${alpha})`  // purple for center connections
            : `rgba(100, 180, 255, ${alpha})`; // blue for peer connections
        }}
        linkWidth={(link) => {
          const l = link as unknown as GraphLink;
          return l.isStar
            ? Math.max(0.5, l.weight * 2)   // thinner for star edges
            : Math.max(1, l.weight * 3);    // thicker for peer edges
        }}
        linkDirectionalParticles={(link) => {
          const l = link as unknown as GraphLink;
          return l.weight > 0.4 ? 2 : 0;
        }}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        cooldownTicks={150}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={80}
        onEngineStop={() => setLayoutStable(true)}
      />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-card/80 border border-border/40 rounded-lg p-3 backdrop-blur-sm text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: USER_CHANNEL_COLOR }} />
          <span className="text-muted-foreground">Your Channel</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-0.5 rounded" style={{ backgroundColor: "rgba(100, 180, 255, 0.5)", width: 16 }} />
          <span className="text-muted-foreground">Similarity Link</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-amber-500/50" style={{ backgroundColor: "rgba(255, 200, 0, 0.3)" }} />
          <span className="text-muted-foreground">Emerging Channel</span>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={() => graphRef.current?.zoomToFit(400, 80)}
          className="w-8 h-8 rounded-lg bg-card/80 border border-border/40 text-xs font-bold text-muted-foreground hover:bg-card transition-colors backdrop-blur-sm flex items-center justify-center"
          title="Fit to screen"
        >
          ⊞
        </button>
        <button
          onClick={() => {
            const current = graphRef.current?.zoom();
            graphRef.current?.zoom(current * 1.3, 300);
          }}
          className="w-8 h-8 rounded-lg bg-card/80 border border-border/40 text-xs font-bold text-muted-foreground hover:bg-card transition-colors backdrop-blur-sm flex items-center justify-center"
        >
          +
        </button>
        <button
          onClick={() => {
            const current = graphRef.current?.zoom();
            graphRef.current?.zoom(current * 0.7, 300);
          }}
          className="w-8 h-8 rounded-lg bg-card/80 border border-border/40 text-xs font-bold text-muted-foreground hover:bg-card transition-colors backdrop-blur-sm flex items-center justify-center"
        >
          −
        </button>
      </div>
    </div>
  );
}
