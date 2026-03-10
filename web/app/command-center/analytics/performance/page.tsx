"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Eye,
  ThumbsUp,
  MessageCircle,
  Share2,
  Loader2,
  ArrowUpDown,
  ExternalLink,
  Clock,
} from "lucide-react";
import ChannelSelector from "@/components/features/analytics/ChannelSelector";

interface Video {
  id: string;
  video_id: string;
  title: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimated_minutes_watched: number;
  average_view_duration: number | null;
  estimated_revenue: number | null;
}

interface Channel {
  id: string;
  channel_title: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type SortField = "views" | "likes" | "comments" | "shares" | "published_at";

export default function PerformancePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("views");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    async function fetchChannels() {
      const res = await fetch("/api/analytics/channels");
      const data = await res.json();
      setChannels(data.channels || []);
      // Auto-select only when exactly 1 channel
      if (data.channels?.length === 1) setSelectedChannelId(data.channels[0].id);
    }
    fetchChannels();
  }, []);

  const fetchVideos = useCallback(async () => {
    const chId = selectedChannelId || 'all';
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/channels/${chId}/videos?sort=${sortBy}&order=${sortOrder}`
      );
      const data = await res.json();
      setVideos(data.videos || []);
    } catch (err) {
      console.error("Failed to fetch videos:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId, sortBy, sortOrder]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
      <ArrowUpDown className={`w-3 h-3 ${sortBy === field ? "text-primary" : ""}`} />
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Video Performance</h2>
              <p className="text-sm text-muted-foreground">
                Detailed analytics for individual videos.
              </p>
            </div>
          </div>
          <ChannelSelector
            channels={channels}
            selectedId={selectedChannelId}
            onSelect={setSelectedChannelId}
          />
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 max-w-[1600px] w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No video data yet</p>
            <p className="text-sm mt-1">Data will appear after the first sync.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground">Video</th>
                  <th className="p-4"><SortHeader field="views"><Eye className="w-3.5 h-3.5" /> Views</SortHeader></th>
                  <th className="p-4"><SortHeader field="likes"><ThumbsUp className="w-3.5 h-3.5" /> Likes</SortHeader></th>
                  <th className="p-4"><SortHeader field="comments"><MessageCircle className="w-3.5 h-3.5" /> Comments</SortHeader></th>
                  <th className="p-4"><SortHeader field="shares"><Share2 className="w-3.5 h-3.5" /> Shares</SortHeader></th>
                  <th className="p-4 text-xs font-medium text-muted-foreground"><Clock className="w-3.5 h-3.5 inline mr-1" />Duration</th>
                  <th className="p-4"><SortHeader field="published_at">Published</SortHeader></th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {video.thumbnail_url && (
                          <img
                            src={video.thumbnail_url}
                            alt=""
                            className="w-24 h-14 rounded-md object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <a
                            href={`https://www.youtube.com/watch?v=${video.video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm hover:text-primary transition-colors line-clamp-2 flex items-center gap-1"
                          >
                            {video.title || "Untitled"}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center font-medium">{formatNumber(video.views)}</td>
                    <td className="p-4 text-center">{formatNumber(video.likes)}</td>
                    <td className="p-4 text-center">{formatNumber(video.comments)}</td>
                    <td className="p-4 text-center">{formatNumber(video.shares)}</td>
                    <td className="p-4 text-center text-muted-foreground">{formatDuration(video.duration_seconds)}</td>
                    <td className="p-4 text-center text-muted-foreground text-xs">
                      {video.published_at
                        ? new Date(video.published_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
