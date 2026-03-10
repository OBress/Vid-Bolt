"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  Eye,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  LinkIcon,
  Youtube,
  Loader2,
  Zap,
} from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
import { type LucideIcon } from "lucide-react";
import ChannelSelector from "@/components/features/analytics/ChannelSelector";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

// ============================================================================
// Types
// ============================================================================

interface Channel {
  id: string;
  channel_id: string;
  channel_title: string;
  channel_handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  is_primary: boolean;
  sync_status: string;
  last_synced_at: string | null;
}

interface KPI {
  currentSubscribers: number;
  totalViews: number;
  totalVideos: number;
  periodViews: number;
  periodSubsGained: number;
  periodSubsLost: number;
  periodNetSubs: number;
  periodMinutesWatched: number;
  periodAvgViewDuration: number;
  periodRevenue: number;
  subscriberGrowthPct: number;
  viewsGrowthPct: number;
  watchTimeGrowthPct: number;
}

interface Snapshot {
  snapshot_date: string;
  views_day: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  estimated_minutes_watched: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  net_subs?: number;
  has_video?: boolean;
  video_titles?: string[];
}

interface VideoPublishInfo {
  title: string;
  video_id: string;
  thumbnail_url: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatMinutes(mins: number): string {
  if (mins >= 1440) return `${(mins / 1440).toFixed(1)}d`;
  if (mins >= 60) return `${(mins / 60).toFixed(1)}h`;
  return `${mins}m`;
}

// ============================================================================
// Components
// ============================================================================

function KPICard({
  label,
  value,
  change,
  icon: Icon,
  prefix = "",
}: {
  label: string;
  value: string;
  change?: number;
  icon: LucideIcon;
  prefix?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight">
        {prefix}
        {value}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {change >= 0 ? (
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-500" />
          )}
          <span
            className={`text-xs font-medium ${
              change >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">vs prior period</span>
        </div>
      )}
    </div>
  );
}

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
];

// ============================================================================
// Main Page
// ============================================================================

export default function AnalyticsOverviewPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [forceSyncing, setForceSyncing] = useState(false);
  const { profile } = useUserProfile();

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/channels");
      const data = await res.json();
      setChannels(data.channels || []);
      // Auto-select only when there's exactly 1 channel
      if (data.channels?.length === 1 && !selectedChannelId) {
        setSelectedChannelId(data.channels[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    }
  }, [selectedChannelId]);

  // Link channels
  const linkChannels = async () => {
    setLinking(true);
    try {
      const res = await fetch("/api/analytics/channels", { method: "POST" });
      const data = await res.json();
      if (data.channels) {
        setChannels(data.channels);
        if (data.channels.length > 0) setSelectedChannelId(data.channels[0].id);
      }
    } catch (err) {
      console.error("Failed to link channels:", err);
    } finally {
      setLinking(false);
    }
  };

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    const chId = selectedChannelId || 'all';
    try {
      const res = await fetch(
        `/api/analytics/channels/${chId}/overview?days=${days}`
      );
      const data = await res.json();
      setKpi(data.kpi);

      // Merge video publish dates into snapshots
      const publishDates: Record<string, VideoPublishInfo[]> = data.videoPublishDates || {};
      const enrichedSnapshots: Snapshot[] = (data.snapshots || []).map((snap: Snapshot) => {
        const vids = publishDates[snap.snapshot_date];
        return {
          ...snap,
          net_subs: (snap.subscribers_gained || 0) - (snap.subscribers_lost || 0),
          has_video: !!vids,
          video_titles: vids?.map((v: VideoPublishInfo) => v.title) || [],
        };
      });
      setSnapshots(enrichedSnapshots);
    } catch (err) {
      console.error("Failed to fetch overview:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId, days]);

  // Refresh channel
  const refreshChannel = async () => {
    if (!selectedChannelId) return;
    setRefreshing(true);
    try {
      await fetch(`/api/analytics/channels/${selectedChannelId}/refresh`, {
        method: "POST",
      });
      await fetchOverview();
      await fetchChannels();
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    fetchOverview();
  }, [selectedChannelId, days, fetchOverview]);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  // No channels linked state
  if (!loading && channels.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Analytics Overview
              </h2>
              <p className="text-sm text-muted-foreground">
                Connect your YouTube channel to get started.
              </p>
            </div>
          </div>
          <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Youtube className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Link Your YouTube Channel</h3>
            <p className="text-muted-foreground max-w-md">
              Connect your Google account to automatically discover and link your
              YouTube channels. Your data stays private and syncs using your own
              API quota.
            </p>
            <button
              onClick={linkChannels}
              disabled={linking}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {linking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LinkIcon className="w-4 h-4" />
              )}
              {linking ? "Discovering Channels..." : "Link Channels"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                Analytics Overview
              </h2>
              <p className="text-sm text-muted-foreground">
                YouTube channel performance at a glance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Channel selector */}
            <ChannelSelector
              channels={channels}
              selectedId={selectedChannelId}
              onSelect={setSelectedChannelId}
            />
            {/* Date range */}
            <div className="flex rounded-lg border border-border/40 overflow-hidden">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === r.days
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {/* Refresh */}
            <button
              onClick={refreshChannel}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {/* Admin-only Force Re-sync */}
            {profile?.is_admin && (
              <button
                onClick={async () => {
                  setForceSyncing(true);
                  try {
                    const res = await fetch('/api/analytics/force-sync', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      // Wait 10s for workers to complete, then refresh data once
                      setTimeout(async () => {
                        await fetchOverview();
                        await fetchChannels();
                        setForceSyncing(false);
                      }, 10000);
                    } else {
                      setForceSyncing(false);
                    }
                  } catch (err) {
                    console.error('Force sync failed:', err);
                    setForceSyncing(false);
                  }
                }}
                disabled={forceSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                title="Admin: Force all analytics workers to sync now"
              >
                <Zap className={`w-3.5 h-3.5 ${forceSyncing ? 'animate-pulse' : ''}`} />
                {forceSyncing ? 'Syncing...' : 'Force Re-sync'}
              </button>
            )}
          </div>
        </div>
        {/* Force sync progress banner */}
        {forceSyncing && (
          <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400 shrink-0" />
            <p className="text-xs text-orange-300">
              <span className="font-medium">Syncing all analytics workers...</span>{' '}
              Data will refresh automatically when complete.
            </p>
          </div>
        )}
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 max-w-[1600px] w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Channel info */}
            {selectedChannel ? (
              <div className="flex items-center gap-3 mb-2">
                {selectedChannel.thumbnail_url && (
                  <img
                    src={selectedChannel.thumbnail_url}
                    alt={selectedChannel.channel_title}
                    className="w-10 h-10 rounded-full"
                  />
                )}
                <div>
                  <h3 className="font-semibold">{selectedChannel.channel_title}</h3>
                  {selectedChannel.channel_handle && (
                    <p className="text-xs text-muted-foreground">
                      @{selectedChannel.channel_handle}
                    </p>
                  )}
                </div>
                {selectedChannel.last_synced_at && (
                  <p className="text-xs text-muted-foreground ml-auto">
                    Last synced:{" "}
                    {new Date(selectedChannel.last_synced_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : channels.length > 0 && (
              <div className="flex items-center gap-3 mb-2">
                <div>
                  <h3 className="font-semibold">All Channels</h3>
                  <p className="text-xs text-muted-foreground">
                    Aggregate across {channels.length} channels
                  </p>
                </div>
              </div>
            )}

            {/* KPI Cards */}
            {kpi && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Subscribers"
                  value={formatNumber(kpi.currentSubscribers)}
                  change={kpi.subscriberGrowthPct}
                  icon={Users}
                />
                <KPICard
                  label={`Views (${days}d)`}
                  value={formatNumber(kpi.periodViews)}
                  change={kpi.viewsGrowthPct}
                  icon={Eye}
                />
                <KPICard
                  label={`Watch Time (${days}d)`}
                  value={formatMinutes(kpi.periodMinutesWatched)}
                  change={kpi.watchTimeGrowthPct}
                  icon={Clock}
                />
                <KPICard
                  label={`Net Subs (${days}d)`}
                  value={`${kpi.periodNetSubs >= 0 ? "+" : ""}${formatNumber(kpi.periodNetSubs)}`}
                  change={kpi.subscriberGrowthPct}
                  icon={TrendingUp}
                />
              </div>
            )}

            {/* Charts */}
            {snapshots.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Views Chart */}
                <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold">Daily Views</h4>
                    {snapshots.some(s => s.has_video) && (
                      <span className="text-[10px] text-orange-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                        Video published
                      </span>
                    )}
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={snapshots}>
                        <defs>
                          <linearGradient
                            id="viewsGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#3b82f6"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#3b82f6"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="snapshot_date"
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          interval={days <= 30 ? 'preserveStartEnd' : Math.floor(snapshots.length / 8)}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          tickFormatter={formatNumber}
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1c1c1c',
                            border: '1px solid #444',
                            borderRadius: '0.5rem',
                            fontSize: 12,
                            color: '#fafafa',
                          }}
                          labelStyle={{ color: '#a3a3a3' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const snap = payload[0]?.payload as Snapshot;
                            return (
                              <div style={{ backgroundColor: '#1c1c1c', border: '1px solid #444', borderRadius: '0.5rem', padding: '8px 12px', fontSize: 12 }}>
                                <p style={{ color: '#a3a3a3', marginBottom: 4 }}>{new Date(String(label)).toLocaleDateString()}</p>
                                <p style={{ color: '#fafafa' }}>Views: {formatNumber(Number(snap?.views_day ?? 0))}</p>
                                {snap?.has_video && snap.video_titles && snap.video_titles.length > 0 && (
                                  <div style={{ borderTop: '1px solid #444', marginTop: 6, paddingTop: 6 }}>
                                    <p style={{ color: '#f97316', fontSize: 11, fontWeight: 600 }}>📹 Video Published:</p>
                                    {snap.video_titles.map((t, i) => (
                                      <p key={i} style={{ color: '#fafafa', fontSize: 11, marginTop: 2 }}>{t}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                        {/* Video publish reference lines */}
                        {snapshots.filter(s => s.has_video).map((s) => (
                          <ReferenceLine
                            key={s.snapshot_date}
                            x={s.snapshot_date}
                            stroke="#f97316"
                            strokeDasharray="4 4"
                            strokeOpacity={0.6}
                          />
                        ))}
                        <Area
                          type="monotone"
                          dataKey="views_day"
                          stroke="#3b82f6"
                          fill="url(#viewsGradient)"
                          strokeWidth={2}
                          dot={(props: Record<string, unknown>) => {
                            const snap = props.payload as Snapshot;
                            if (!snap?.has_video) return <circle key={String(props.key)} cx={0} cy={0} r={0} fill="none" />;
                            return (
                              <circle
                                key={String(props.key)}
                                cx={Number(props.cx)}
                                cy={Number(props.cy)}
                                r={5}
                                fill="#f97316"
                                stroke="#1c1c1c"
                                strokeWidth={2}
                              />
                            );
                          }}
                          name="Views"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Subscribers Chart */}
                <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                  <h4 className="text-sm font-semibold mb-4">
                    Net Subscriber Growth
                  </h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={snapshots}>
                        <defs>
                          <linearGradient id="subsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="snapshot_date"
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          interval={days <= 30 ? 'preserveStartEnd' : Math.floor(snapshots.length / 8)}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1c1c1c',
                            border: '1px solid #444',
                            borderRadius: '0.5rem',
                            fontSize: 12,
                            color: '#fafafa',
                          }}
                          labelStyle={{ color: '#a3a3a3' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const snap = payload[0]?.payload as Snapshot;
                            return (
                              <div style={{ backgroundColor: '#1c1c1c', border: '1px solid #444', borderRadius: '0.5rem', padding: '8px 12px', fontSize: 12 }}>
                                <p style={{ color: '#a3a3a3', marginBottom: 4 }}>{new Date(String(label)).toLocaleDateString()}</p>
                                <p style={{ color: '#22c55e' }}>Gained: +{snap?.subscribers_gained ?? 0}</p>
                                <p style={{ color: '#ef4444' }}>Lost: -{snap?.subscribers_lost ?? 0}</p>
                                <p style={{ color: '#fafafa', fontWeight: 600, borderTop: '1px solid #444', marginTop: 4, paddingTop: 4 }}>
                                  Net: {(snap?.net_subs ?? 0) >= 0 ? '+' : ''}{snap?.net_subs ?? 0}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="net_subs"
                          stroke="#22c55e"
                          fill="url(#subsGradient)"
                          strokeWidth={2}
                          dot={false}
                          name="Net Subscribers"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Watch Time Chart */}
                <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                  <h4 className="text-sm font-semibold mb-4">
                    Watch Time (Minutes)
                  </h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={snapshots}>
                        <defs>
                          <linearGradient
                            id="watchGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#a855f7"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#a855f7"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="snapshot_date"
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          interval={days <= 30 ? 'preserveStartEnd' : Math.floor(snapshots.length / 8)}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          tickFormatter={formatNumber}
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1c1c1c',
                            border: '1px solid #444',
                            borderRadius: '0.5rem',
                            fontSize: 12,
                            color: '#fafafa',
                          }}
                          labelStyle={{ color: '#a3a3a3' }}
                          formatter={(value?: number | string) => [
                            formatMinutes(Number(value ?? 0)),
                            "Watch Time",
                          ]}
                          labelFormatter={(label) =>
                            new Date(label).toLocaleDateString()
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="estimated_minutes_watched"
                          stroke="#a855f7"
                          fill="url(#watchGradient)"
                          strokeWidth={2}
                          dot={false}
                          name="Watch Time"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Engagement Chart */}
                <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                  <h4 className="text-sm font-semibold mb-4">
                    Daily Engagement
                  </h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={snapshots}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#333"
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="snapshot_date"
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          interval={days <= 30 ? 'preserveStartEnd' : Math.floor(snapshots.length / 8)}
                          tickFormatter={(v) =>
                            new Date(v).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#a3a3a3' }}
                          stroke="#444"
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1c1c1c',
                            border: '1px solid #444',
                            borderRadius: '0.5rem',
                            fontSize: 12,
                            color: '#fafafa',
                          }}
                          labelStyle={{ color: '#a3a3a3' }}
                          labelFormatter={(label) =>
                            new Date(label).toLocaleDateString()
                          }
                        />
                        <Legend wrapperStyle={{ color: '#a3a3a3' }} />
                        <Bar
                          dataKey="likes"
                          name="Likes"
                          fill="#3b82f6"
                          radius={[2, 2, 0, 0]}
                          stackId="engagement"
                        />
                        <Bar
                          dataKey="comments"
                          name="Comments"
                          fill="#eab308"
                          radius={[2, 2, 0, 0]}
                          stackId="engagement"
                        />
                        <Bar
                          dataKey="shares"
                          name="Shares"
                          fill="#22c55e"
                          radius={[2, 2, 0, 0]}
                          stackId="engagement"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state when no snapshots */}
            {snapshots.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No analytics data yet</p>
                <p className="text-sm mt-1">
                  Data will appear after the first scheduled sync runs (every 6
                  hours).
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
