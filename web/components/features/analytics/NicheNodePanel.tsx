"use client";

import {
  X,
  Users,
  Eye,
  Video,
  TrendingUp,
  ExternalLink,
  Target,
  Trash2,
  Loader2,
  Sparkles,
  Search,
  GitBranch,
  Network,
  Info,
} from "lucide-react";
import type { NicheNode } from "./NicheNetworkGraph";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// Cluster color palette — matches NicheNetworkGraph
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

function getDiscoveryMethodLabel(method: string): { label: string; icon: React.ReactNode; color: string } {
  switch (method) {
    case 'featured_channel':
      return { label: 'Featured Channel', icon: <Target className="w-3 h-3" />, color: 'text-emerald-500 bg-emerald-500/10' };
    case 'expansion':
      return { label: 'Network Expansion', icon: <GitBranch className="w-3 h-3" />, color: 'text-blue-500 bg-blue-500/10' };
    case 'keyword_search':
      return { label: 'Keyword Search', icon: <Search className="w-3 h-3" />, color: 'text-amber-500 bg-amber-500/10' };
    case 'topic_match':
      return { label: 'Topic Match', icon: <Network className="w-3 h-3" />, color: 'text-purple-500 bg-purple-500/10' };
    default:
      return { label: method, icon: <Info className="w-3 h-3" />, color: 'text-muted-foreground bg-muted/50' };
  }
}

interface NicheNodePanelProps {
  node: NicheNode;
  onClose: () => void;
  onTrackAsCompetitor: (channelId: string) => void;
  onRemove: (channelId: string) => void;
  isAdding?: boolean;
  isRemoving?: boolean;
}

export default function NicheNodePanel({
  node,
  onClose,
  onTrackAsCompetitor,
  onRemove,
  isAdding,
  isRemoving,
}: NicheNodePanelProps) {
  const discoveryInfo = getDiscoveryMethodLabel(node.discovery_method || 'keyword_search');
  const clusterColor = node.graph_cluster != null && node.graph_cluster >= 0
    ? CLUSTER_COLORS[Math.abs(node.graph_cluster) % CLUSTER_COLORS.length]
    : '#c084fc';
  const isUserChannel = node.graph_cluster === -1 || node.similarity_score === 1.0;

  return (
    <div className="w-80 h-full border-l border-border/40 bg-card/95 backdrop-blur-md flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/30">
        <h3 className="text-sm font-semibold">Channel Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Channel Info */}
        <div className="flex items-center gap-3">
          {node.thumbnail_url && (
            <img
              src={node.thumbnail_url}
              alt=""
              className="w-14 h-14 rounded-full border-2 border-border/30"
            />
          )}
          <div className="min-w-0">
            <h4 className="font-semibold text-sm truncate">{node.channel_title}</h4>
            {node.channel_handle && (
              <p className="text-xs text-muted-foreground">@{node.channel_handle}</p>
            )}
            <div className="flex items-center gap-1.5 mt-1">
              {node.is_emerging && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-500 font-medium">
                  <Sparkles className="w-3 h-3" />
                  Emerging
                </span>
              )}
              {!isUserChannel && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: `${clusterColor}15`, color: clusterColor }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: clusterColor }} />
                  Cluster {(node.graph_cluster ?? 0) + 1}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Discovery Method */}
        {!isUserChannel && (
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${discoveryInfo.color}`}>
            {discoveryInfo.icon}
            {discoveryInfo.label}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-lg bg-muted/30 text-center">
            <Users className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{formatNumber(node.subscriber_count)}</p>
            <p className="text-[10px] text-muted-foreground">Subs</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 text-center">
            <Eye className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{formatNumber(node.view_count)}</p>
            <p className="text-[10px] text-muted-foreground">Views</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 text-center">
            <Video className="w-3.5 h-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{formatNumber(node.video_count)}</p>
            <p className="text-[10px] text-muted-foreground">Videos</p>
          </div>
        </div>

        {/* Similarity Score */}
        {!isUserChannel && (
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Overall Similarity</span>
              <span className="text-sm font-bold text-primary">
                {(node.similarity_score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(node.similarity_score * 100, 100)}%` }}
              />
            </div>

            {/* Signal breakdown */}
            {(node.embedding_similarity != null || node.tag_overlap_score != null) && (
              <div className="mt-3 space-y-1.5">
                {node.embedding_similarity != null && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Content Embedding</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1 rounded-full bg-muted/50">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${Math.min(node.embedding_similarity * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-7 text-right">
                        {(node.embedding_similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
                {node.tag_overlap_score != null && node.tag_overlap_score > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Tag Overlap</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1 rounded-full bg-muted/50">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(node.tag_overlap_score * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-7 text-right">
                        {(node.tag_overlap_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Why Similar */}
        {!isUserChannel && node.similarity_reason && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Why Similar
            </h5>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {node.similarity_reason}
            </p>
          </div>
        )}

        {/* Shared Audience */}
        {!isUserChannel && node.shared_audience && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Shared Audience
            </h5>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {node.shared_audience}
            </p>
          </div>
        )}

        {/* Shared Topics */}
        {node.shared_topics.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Shared Topics
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {node.shared_topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Discovery Keywords */}
        {node.discovery_keywords.length > 0 && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-2">
              Discovery Keywords
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {node.discovery_keywords.slice(0, 10).map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-muted/50 text-muted-foreground"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 px-4 py-3 border-t border-border/30 space-y-2">
        <a
          href={`https://youtube.com/channel/${node.channel_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-border/40 text-xs font-medium hover:bg-muted/50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View on YouTube
        </a>
        <button
          onClick={() => onTrackAsCompetitor(node.channel_id)}
          disabled={isAdding}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isAdding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Target className="w-3.5 h-3.5" />
          )}
          Track as Competitor
        </button>
        <button
          onClick={() => onRemove(node.channel_id)}
          disabled={isRemoving}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-red-500 border border-red-500/20 text-xs font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {isRemoving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Remove from Network
        </button>
      </div>
    </div>
  );
}
