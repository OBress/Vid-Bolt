"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  Loader2,
  TrendingUp,
  Cpu,
} from "lucide-react";
import {
  AreaChart,
  Area,
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
} from "recharts";

interface CostByService {
  service: string;
  cost: number;
}

interface CostByModel {
  model: string;
  cost: number;
}

interface CostTrend {
  date: string;
  cost: number;
}

interface ProjectCost {
  id: string;
  name: string;
  status: string;
  created_at: string;
  totalCost: number;
}

interface CostData {
  totalCost: number;
  projectCount: number;
  costByService: CostByService[];
  costByModel: CostByModel[];
  costTrend: CostTrend[];
  projects: ProjectCost[];
}

const COLORS = [
  "hsl(220, 90%, 56%)",
  "hsl(280, 100%, 65%)",
  "hsl(340, 82%, 52%)",
  "hsl(45, 93%, 47%)",
  "hsl(160, 84%, 39%)",
  "hsl(20, 90%, 48%)",
  "hsl(200, 98%, 39%)",
  "hsl(260, 67%, 49%)",
];

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const res = await fetch("/api/analytics/costs");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch costs:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">API & Cost Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Track AI service costs across all your video projects.
            </p>
          </div>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-8 max-w-[1600px] w-full mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.projectCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No cost data yet</p>
            <p className="text-sm mt-1">Costs are tracked automatically when you create videos.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spend</span>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold">${data.totalCost.toFixed(4)}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</span>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold">{data.projectCount}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Cost/Video</span>
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold">
                  ${data.projectCount > 0 ? (data.totalCost / data.projectCount).toFixed(4) : "0.00"}
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cost by Service Donut */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4">Cost by Service</h4>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.costByService}
                        dataKey="cost"
                        nameKey="service"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        label={({ name, value }: { name?: string; value?: number }) =>
                          `${name}: $${(value ?? 0).toFixed(4)}`
                        }
                      >
                        {data.costByService.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: 12,
                        }}
                        formatter={(value?: number | string) => [`$${Number(value ?? 0).toFixed(4)}`, "Cost"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cost by Model */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-4">Cost by Model</h4>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.costByModel.slice(0, 8)}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v.toFixed(3)}`} />
                      <YAxis type="category" dataKey="model" width={140} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: 12,
                        }}
                        formatter={(value?: number | string) => [`$${Number(value ?? 0).toFixed(4)}`, "Cost"]}
                      />
                      <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cost Trend */}
              {data.costTrend.length > 1 && (
                <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm lg:col-span-2">
                  <h4 className="text-sm font-semibold mb-4">Cost Trend</h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.costTrend}>
                        <defs>
                          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v.toFixed(2)}`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: 12,
                          }}
                          formatter={(value?: number | string) => [`$${Number(value ?? 0).toFixed(4)}`, "Cost"]}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                        />
                        <Area
                          type="monotone"
                          dataKey="cost"
                          stroke="hsl(var(--primary))"
                          fill="url(#costGradient)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Per-project cost table */}
            <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="p-4 border-b border-border/40">
                <h4 className="text-sm font-semibold">Cost Per Project</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground">Project</th>
                    <th className="p-4 text-xs font-medium text-muted-foreground text-right">Cost</th>
                    <th className="p-4 text-xs font-medium text-muted-foreground text-center">Status</th>
                    <th className="p-4 text-xs font-medium text-muted-foreground text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{p.name}</td>
                      <td className="p-4 text-right font-mono">${p.totalCost.toFixed(4)}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
                          p.status === "failed" ? "bg-red-500/10 text-red-500" :
                          "bg-yellow-500/10 text-yellow-500"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-right text-muted-foreground text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
