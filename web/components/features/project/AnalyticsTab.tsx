"use client";

import {
  DollarSign,
  Clock,
  BarChart3,
  Loader2,
  Youtube,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useEffect, useState } from "react";

interface CostEntry {
  service: string;
  model?: string;
  cost: number;
}

interface CostStep {
  totalCost: number;
  entries: CostEntry[];
}

interface CostData {
  totalCost?: number;
  steps?: Record<string, CostStep>;
  entries?: CostEntry[];
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
  metadata: { costData?: CostData } | null;
  created_at: string;
}

interface AnalyticsTabProps {
  projectId: string;
}

export default function AnalyticsTab({ projectId }: AnalyticsTabProps) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        }
      } catch (err) {
        console.error("Failed to fetch project:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const costData = project?.metadata?.costData;

  // Build step breakdown for chart
  const stepChart = costData?.steps
    ? Object.entries(costData.steps)
        .filter(([, step]) => step.totalCost > 0)
        .map(([name, step]) => ({
          name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          cost: parseFloat(step.totalCost.toFixed(4)),
        }))
        .sort((a, b) => b.cost - a.cost)
    : [];

  // Calculate total
  const totalCost = costData?.totalCost ?? 0;

  return (
    <div className="space-y-6">
      {/* Cost Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Production Cost
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pipeline Steps
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold">{stepChart.length}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status
            </span>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Youtube className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-2xl font-bold capitalize">
            {project?.status || "Unknown"}
          </div>
        </div>
      </div>

      {/* Cost Breakdown Chart */}
      {stepChart.length > 0 ? (
        <div className="rounded-xl border border-border/40 bg-card/50 p-5 backdrop-blur-sm">
          <h4 className="text-sm font-semibold mb-4">
            Cost by Pipeline Step
          </h4>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stepChart} layout="vertical">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.3}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `$${v.toFixed(3)}`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: 12,
                  }}
                  formatter={(value?: number | string) => [
                    `$${Number(value ?? 0).toFixed(4)}`,
                    "Cost",
                  ]}
                />
                <Bar
                  dataKey="cost"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No cost data available</p>
          <p className="text-xs mt-1">
            Cost tracking starts when the video pipeline runs.
          </p>
        </div>
      )}
    </div>
  );
}
