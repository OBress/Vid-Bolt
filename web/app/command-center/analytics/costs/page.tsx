"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Loader2,
  TrendingUp,
  Cpu,
  Server,
  Mic,
  Search,
  Zap,
  Bot,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";

// ============================================================================
// TYPES
// ============================================================================

interface BreakdownItem {
  category: string;
  label: string;
  color: string;
  icon: string;
  amountUsd: number;
  pct: number;
}

interface ModelItem {
  label: string;
  service: string;
  amountUsd: number;
}

interface TrendPoint {
  date: string;
  llm?: number;
  tts?: number;
  gcp_vm?: number;
  aws_lambda?: number;
  search_valyu?: number;
  search_serper?: number;
}

interface VideoItem {
  videoId: string;
  name: string;
  status: string;
  createdAt: string;
  amountUsd: number;
}

interface GcpVmData {
  sessionStartedAt: string | null;
  vmProvisionedAt: string | null;
  vmStatus: string | null;
  totalHistoricalHours: number;
  totalHistoricalDaysOwned: number;
  totalHistoricalCostUsd: number;
  liveEstimateUsd: number;
}

interface CostData {
  totalCostUsd: number;
  periodStart: string | null;
  periodEnd: string | null;
  eventCount: number;
  breakdown: BreakdownItem[];
  byModel: ModelItem[];
  trend: TrendPoint[];
  byVideo: VideoItem[];
  gcpVm: GcpVmData;
}

const PERIOD_OPTIONS = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "All time", value: "all" },
];

// ============================================================================
// HELPERS
// ============================================================================

function fmt(amount: number) {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function fmtHours(h: number) {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function useLiveVmTicker(sessionStartedAt: string | null, serverEstimate: number) {
  const [liveUsd, setLiveUsd] = useState(serverEstimate);

  useEffect(() => {
    if (!sessionStartedAt) {
      setLiveUsd(serverEstimate);
      return;
    }
    const start = new Date(sessionStartedAt).getTime();
    const rate = 1.9 / 3600; // $/second

    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      setLiveUsd(elapsed * rate);
    };

    tick();
    const id = setInterval(tick, 15000); // update every 15s
    return () => clearInterval(id);
  }, [sessionStartedAt, serverEstimate]);

  return liveUsd;
}

// ============================================================================
// CUSTOM PIE LABEL
// ============================================================================

const renderPieLabel = ({ cx, cy, midAngle, outerRadius, pct, label }: any) => {
  if (pct < 4) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 32;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="hsla(0,0%,85%,1)"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {label} ({pct.toFixed(0)}%)
    </text>
  );
};

// ============================================================================
// GCP LIVE WIDGET
// ============================================================================

function GcpVmCard({ gcpVm }: { gcpVm: GcpVmData }) {
  const liveUsd = useLiveVmTicker(gcpVm.sessionStartedAt, gcpVm.liveEstimateUsd);
  const isRunning = gcpVm.vmStatus === "RUNNING";
  const elapsedH =
    gcpVm.sessionStartedAt && isRunning
      ? (Date.now() - new Date(gcpVm.sessionStartedAt).getTime()) / 3600000
      : 0;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-neutral-200">GCP VM Uptime</span>
        </div>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs bg-green-950/50 border border-green-800/50 text-green-400 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            RUNNING
          </span>
        )}
      </div>

      {isRunning && gcpVm.sessionStartedAt ? (
        <div className="space-y-1 mb-3">
          <div className="text-2xl font-bold text-green-400 font-mono">{fmt(liveUsd)}</div>
          <div className="text-xs text-neutral-400">
            Session: {fmtHours(elapsedH)} × $1.90/hr
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-500 mb-3">VM not currently running</div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-800 text-xs">
        <div>
          <div className="text-neutral-500 mb-0.5">Historical compute</div>
          <div className="text-neutral-200 font-medium">
            {fmtHours(gcpVm.totalHistoricalHours)} · {fmt(gcpVm.totalHistoricalHours * 1.9)}
          </div>
        </div>
        <div>
          <div className="text-neutral-500 mb-0.5">Ownership flat fee</div>
          <div className="text-neutral-200 font-medium">
            {gcpVm.totalHistoricalDaysOwned}d · {fmt(gcpVm.totalHistoricalDaysOwned * 2)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-1.5 text-xs text-amber-500/80">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>SPOT pricing estimate — actual GCP invoice may differ</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CostsPage() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/costs?period=${period}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // KPI derived values
  const avgCostPerVideo =
    data && data.byVideo.length > 0 ? data.totalCostUsd / data.byVideo.length : 0;
  const llmBreakdown = data?.breakdown.find((b) => b.category === "llm");
  const llmPct = llmBreakdown?.pct ?? 0;

  const trendCategories = [
    { key: "llm", color: "hsl(220,90%,56%)", label: "LLM" },
    { key: "tts", color: "hsl(280,100%,65%)", label: "TTS" },
    { key: "gcp_vm", color: "hsl(160,84%,39%)", label: "GCP VM" },
    { key: "aws_lambda", color: "hsl(45,93%,47%)", label: "Lambda" },
    { key: "search_valyu", color: "hsl(20,90%,48%)", label: "Valyu" },
    { key: "search_serper", color: "hsl(10,85%,55%)", label: "Serper" },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-black text-white">
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">API & Cost Analytics</h1>
            <p className="text-sm text-neutral-400 mt-0.5">
              Track your real-time spending across all Vid-Bolt services
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    period === opt.value
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-950/30 border border-red-800/50 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI Row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  icon: DollarSign,
                  color: "text-emerald-400",
                  bg: "bg-emerald-950/30",
                  label: "Total Spend",
                  value: fmt(data.totalCostUsd),
                  sub: `${data.eventCount} tracked events`,
                },
                {
                  icon: TrendingUp,
                  color: "text-blue-400",
                  bg: "bg-blue-950/30",
                  label: "Avg Cost / Video",
                  value: fmt(avgCostPerVideo),
                  sub: `${data.byVideo.length} videos tracked`,
                },
                {
                  icon: Bot,
                  color: "text-purple-400",
                  bg: "bg-purple-950/30",
                  label: "LLM Share",
                  value: `${llmPct.toFixed(0)}%`,
                  sub: fmt(llmBreakdown?.amountUsd ?? 0),
                },
                {
                  icon: Cpu,
                  color: "text-green-400",
                  bg: "bg-green-950/30",
                  label: "VM Cost (historical)",
                  value: fmt(data.gcpVm.totalHistoricalCostUsd),
                  sub: `${fmtHours(data.gcpVm.totalHistoricalHours)} runtime`,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                >
                  <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-white">{kpi.value}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{kpi.label}</div>
                  <div className="text-xs text-neutral-600 mt-1">{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Main charts row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Pie chart */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <h2 className="text-sm font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-neutral-400" />
                  Spend by Category
                </h2>
                {data.breakdown.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-neutral-500 text-sm">
                    No cost data yet. Run a video pipeline to start tracking.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={data.breakdown}
                        dataKey="amountUsd"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={50}
                        labelLine={false}
                        label={renderPieLabel}
                      >
                        {data.breakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#111",
                          border: "1px solid #333",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(v: any) => [fmt(Number(v)), "Cost"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {/* Legend */}
                <div className="space-y-1.5 mt-2">
                  {data.breakdown.map((item) => (
                    <div key={item.category} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: item.color }}
                        />
                        <span className="text-neutral-300">
                          {item.icon} {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-500">{item.pct.toFixed(1)}%</span>
                        <span className="text-neutral-200 font-mono w-16 text-right">
                          {fmt(item.amountUsd)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar chart: Top models */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <h2 className="text-sm font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-neutral-400" />
                  Top Services by Cost
                </h2>
                {data.byModel.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-neutral-500 text-sm">
                    No data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.byModel.slice(0, 10)}
                      layout="vertical"
                      margin={{ left: 0, right: 20, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                        tick={{ fill: "#666", fontSize: 10 }}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={130}
                        tick={{ fill: "#999", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#111",
                          border: "1px solid #333",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(v: any) => [fmt(Number(v)), "Cost"]}
                      />
                      <Bar
                        dataKey="amountUsd"
                        radius={[0, 4, 4, 0]}
                        fill="hsl(220,90%,56%)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── GCP VM Card ── */}
            <GcpVmCard gcpVm={data.gcpVm} />

            {/* ── Stacked area trend ── */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-neutral-400" />
                Cost Trend
              </h2>
              {data.trend.length < 2 ? (
                <div className="flex items-center justify-center h-40 text-neutral-500 text-sm">
                  Not enough data for a trend chart yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.trend} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#666", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                      tick={{ fill: "#666", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      formatter={(v: any) => [fmt(Number(v))]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                    {trendCategories.map((tc) => (
                      <Area
                        key={tc.key}
                        type="monotone"
                        dataKey={tc.key}
                        name={tc.label}
                        stackId="1"
                        stroke={tc.color}
                        fill={tc.color}
                        fillOpacity={0.3}
                        strokeWidth={1.5}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Per-video table ── */}
            {data.byVideo.length > 0 && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
                <div className="px-5 py-4 border-b border-neutral-800">
                  <h2 className="text-sm font-semibold text-neutral-200">Cost per Video Project</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                        <th className="text-left px-5 py-2.5 font-medium">Project</th>
                        <th className="text-left px-3 py-2.5 font-medium">Status</th>
                        <th className="text-left px-3 py-2.5 font-medium">Date</th>
                        <th className="text-right px-5 py-2.5 font-medium">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byVideo.map((v) => (
                        <tr
                          key={v.videoId}
                          className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors"
                        >
                          <td className="px-5 py-3 text-neutral-200 max-w-xs truncate">{v.name}</td>
                          <td className="px-3 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                              {v.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-neutral-500 text-xs">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-neutral-200">
                            {fmt(v.amountUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
