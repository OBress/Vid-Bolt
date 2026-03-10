"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Video,
  HardDrive,
  Activity,
  DollarSign,
  TrendingUp,
  Eye,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
} from "recharts";

interface AnalyticsData {
  total_users: number;
  active_users: number;
  pending_users: number;
  total_projects: number;
}

interface DailyAggregate {
  date: string;
  total_users: number;
  active_channels: number;
  total_views_today: number;
  total_subscribers: number;
  total_revenue_today: number;
  total_videos_published: number;
  platform_wide_engagement_rate: number;
  total_api_cost_today: number;
}

interface SyncStat {
  total: number;
  success: number;
  failed: number;
}

interface PlatformData {
  latestDay: DailyAggregate | null;
  dailyAggregates: DailyAggregate[];
  syncStats: Record<string, SyncStat>;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchAll() {
      try {
        // Existing admin RPC
        const { data: adminData, error } = await supabase.rpc("get_admin_analytics");
        if (error) throw error;
        setData(adminData as AnalyticsData);

        // Platform analytics
        const res = await fetch("/api/analytics/admin?days=30");
        if (res.ok) {
          const platformData = await res.json();
          setPlatform(platformData);
        }
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-red-400">
        Failed to load analytics
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Core Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-200">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.total_users}</div>
            <p className="text-xs text-neutral-400">{data.pending_users} pending</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-200">
              Active Users
            </CardTitle>
            <Activity className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.active_users}</div>
            <p className="text-xs text-neutral-400">
              {data.total_users > 0 ? ((data.active_users / data.total_users) * 100).toFixed(0) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-neutral-200">
              Total Projects
            </CardTitle>
            <Video className="h-4 w-4 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{data.total_projects}</div>
            <p className="text-xs text-neutral-400">Across all users</p>
          </CardContent>
        </Card>

        {platform?.latestDay && (
          <>
            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-200">
                  Active Channels
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {platform.latestDay.active_channels}
                </div>
                <p className="text-xs text-neutral-400">Linked channels</p>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-200">
                  Views Today
                </CardTitle>
                <Eye className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatNumber(platform.latestDay.total_views_today)}
                </div>
                <p className="text-xs text-neutral-400">All channels</p>
              </CardContent>
            </Card>

            <Card className="bg-neutral-900 border-neutral-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-200">
                  API Cost Today
                </CardTitle>
                <DollarSign className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  ${platform.latestDay.total_api_cost_today?.toFixed(2) || "0.00"}
                </div>
                <p className="text-xs text-neutral-400">Platform-wide</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      {platform?.dailyAggregates && platform.dailyAggregates.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Growth */}
          <Card className="bg-neutral-900 border-neutral-800 p-5">
            <h4 className="text-sm font-semibold text-neutral-200 mb-4">User Growth</h4>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={platform.dailyAggregates}>
                  <defs>
                    <linearGradient id="usersGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(220, 90%, 56%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(220, 90%, 56%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "0.5rem", fontSize: 12, color: "#fff" }} />
                  <Area type="monotone" dataKey="total_users" stroke="hsl(220, 90%, 56%)" fill="url(#usersGrad)" strokeWidth={2} dot={false} name="Total Users" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Daily Views */}
          <Card className="bg-neutral-900 border-neutral-800 p-5">
            <h4 className="text-sm font-semibold text-neutral-200 mb-4">Daily Views (All Channels)</h4>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platform.dailyAggregates}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={formatNumber} />
                  <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "0.5rem", fontSize: 12, color: "#fff" }} formatter={(value?: number | string) => [formatNumber(Number(value ?? 0)), ""]} />
                  <Legend />
                  <Bar dataKey="total_views_today" name="Views" fill="hsl(280, 100%, 65%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Sync Status */}
      {platform?.syncStats && Object.keys(platform.syncStats).length > 0 && (
        <Card className="bg-neutral-900 border-neutral-800 p-5">
          <h4 className="text-sm font-semibold text-neutral-200 mb-4">Sync Job Status (Last 30 Days)</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(platform.syncStats).map(([type, stats]) => (
              <div key={type} className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50">
                <p className="text-xs text-neutral-400 capitalize mb-1">{type.replace(/_/g, " ")}</p>
                <p className="text-lg font-bold text-white">{stats.total}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] text-green-500">{stats.success} ok</span>
                  {stats.failed > 0 && <span className="text-[10px] text-red-500">{stats.failed} err</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* System Status */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-neutral-200">
            System Status
          </CardTitle>
          <HardDrive className="h-4 w-4 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">Operational</div>
          <p className="text-xs text-neutral-400">All systems normal</p>
        </CardContent>
      </Card>
    </div>
  );
}
