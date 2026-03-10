"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Target,
  Plus,
  Search,
  Trash2,
  Loader2,
  Users,
  Eye,
  Video,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Competitor {
  id: string;
  channel_id: string;
  channel_title: string;
  channel_handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  avg_views_per_video: number | null;
  upload_frequency: number | null;
  niche: string | null;
  last_synced_at: string | null;
}

interface SearchResult {
  channelId: string;
  title: string;
  thumbnailUrl: string;
  description: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function StatBadge({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5" />
      <span>{label}: <span className="font-medium text-foreground">{value}</span></span>
    </div>
  );
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/competitors");
      const data = await res.json();
      setCompetitors(data.competitors || []);
    } catch (err) {
      console.error("Failed to fetch competitors:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/analytics/competitors/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const addCompetitor = async (channelId: string) => {
    setAdding(channelId);
    try {
      const res = await fetch("/api/analytics/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      if (res.ok) {
        await fetchCompetitors();
        setSearchResults((prev) => prev.filter((r) => r.channelId !== channelId));
      }
    } catch (err) {
      console.error("Failed to add competitor:", err);
    } finally {
      setAdding(null);
    }
  };

  const removeCompetitor = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/analytics/competitors?id=${id}`, { method: "DELETE" });
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to remove competitor:", err);
    } finally {
      setDeleting(null);
    }
  };

  // Comparison chart data
  const comparisonData = competitors.map((c) => ({
    name: c.channel_title.length > 20 ? c.channel_title.slice(0, 20) + "…" : c.channel_title,
    subscribers: c.subscriber_count,
    views: c.view_count,
    videos: c.video_count,
    avgViews: c.avg_views_per_video || 0,
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Competitor Tracking</h2>
              <p className="text-sm text-muted-foreground">
                Track and compare competitor YouTube channels.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Competitor
          </button>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 max-w-[1600px] w-full mx-auto">
        {/* Search Panel */}
        {showSearch && (
          <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm mb-6">
            <h4 className="text-sm font-semibold mb-3">Search YouTube Channels</h4>
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by channel name or @handle..."
                  className="w-full h-9 pl-10 pr-3 rounded-lg border border-border/40 bg-background text-sm"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || searchQuery.length < 2}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <div key={result.channelId} className="flex items-center gap-3 p-3 rounded-lg border border-border/20 hover:bg-muted/30 transition-colors">
                    {result.thumbnailUrl && (
                      <img src={result.thumbnailUrl} alt="" className="w-10 h-10 rounded-full" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{result.description}</p>
                    </div>
                    <button
                      onClick={() => addCompetitor(result.channelId)}
                      disabled={adding === result.channelId}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/40 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      {adding === result.channelId ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      Track
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : competitors.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No competitors tracked yet</p>
            <p className="text-sm mt-1">
              Click &quot;Add Competitor&quot; to search and track YouTube channels.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Comparison Chart */}
            {competitors.length >= 2 && (
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4">Subscriber Comparison</h4>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={formatNumber} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: 12,
                        }}
                        formatter={(value?: number | string) => [formatNumber(Number(value ?? 0)), ""]}
                      />
                      <Legend />
                      <Bar dataKey="subscribers" name="Subscribers" fill="hsl(220, 90%, 56%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgViews" name="Avg Views/Video" fill="hsl(280, 100%, 65%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Competitor Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {competitors.map((comp) => (
                <div key={comp.id} className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-4">
                    {comp.thumbnail_url && (
                      <img src={comp.thumbnail_url} alt="" className="w-12 h-12 rounded-full" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h5 className="font-semibold text-sm truncate">{comp.channel_title}</h5>
                      {comp.channel_handle && (
                        <p className="text-xs text-muted-foreground">@{comp.channel_handle}</p>
                      )}
                      {comp.niche && (
                        <span className="inline-flex px-2 py-0.5 mt-1 rounded-full text-[10px] bg-primary/10 text-primary">
                          {comp.niche}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeCompetitor(comp.id)}
                      disabled={deleting === comp.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      {deleting === comp.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <StatBadge icon={Users} label="Subscribers" value={formatNumber(comp.subscriber_count)} />
                    <StatBadge icon={Eye} label="Total Views" value={formatNumber(comp.view_count)} />
                    <StatBadge icon={Video} label="Videos" value={formatNumber(comp.video_count)} />
                    {comp.avg_views_per_video && (
                      <StatBadge icon={Eye} label="Avg Views" value={formatNumber(comp.avg_views_per_video)} />
                    )}
                    {comp.upload_frequency && (
                      <StatBadge icon={Video} label="Videos/Week" value={comp.upload_frequency.toFixed(1)} />
                    )}
                  </div>
                  {comp.last_synced_at && (
                    <p className="text-[10px] text-muted-foreground mt-3">
                      Synced: {new Date(comp.last_synced_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
