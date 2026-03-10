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
} from "lucide-react";
import type { NicheNode } from "./NicheNetworkGraph";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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
            {node.is_emerging && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-full text-[10px] bg-amber-500/10 text-amber-500 font-medium">
                <Sparkles className="w-3 h-3" />
                Emerging
              </span>
            )}
          </div>
        </div>

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
        <div className="p-3 rounded-lg bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Similarity</span>
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
        </div>

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
