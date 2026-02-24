"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, parseISO, getYear } from "date-fns";
import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  CalendarDays,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { MonthlyStatement, PaymentStatus } from "../actions";

interface FinancialOverviewProps {
  statements: MonthlyStatement[];
}

/* ─── Stat Card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "emerald" | "red" | "blue" | "primary";
}) {
  const colorMap = {
    emerald: {
      bg: "bg-emerald-500/10",
      icon: "text-emerald-500",
      value: "text-emerald-600 dark:text-emerald-400",
    },
    red: {
      bg: "bg-red-500/10",
      icon: "text-red-500",
      value: "text-red-600 dark:text-red-400",
    },
    blue: {
      bg: "bg-blue-500/10",
      icon: "text-blue-500",
      value: "text-blue-600 dark:text-blue-400",
    },
    primary: {
      bg: "bg-primary/10",
      icon: "text-primary",
      value: "text-primary",
    },
  };

  const c = colorMap[color];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center justify-center w-11 h-11 rounded-xl shrink-0",
              c.bg
            )}
          >
            <Icon className={cn("w-5 h-5", c.icon)} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums tracking-tight",
                c.value
              )}
            >
              ${value.toFixed(2)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Status badge helper ─── */
function StatusDot({ status }: { status: PaymentStatus }) {
  if (status === "paid")
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === "pending_verification")
    return <Clock className="w-3.5 h-3.5 text-amber-500" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />;
}

function StatusLabel({ status }: { status: PaymentStatus }) {
  if (status === "paid")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5 py-0">
        Paid
      </Badge>
    );
  if (status === "pending_verification")
    return (
      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5 py-0">
        Pending
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground text-[10px] px-1.5 py-0"
    >
      Draft
    </Badge>
  );
}

/* Custom tooltip for charts */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: ${entry.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

export function FinancialOverview({ statements }: FinancialOverviewProps) {
  // Aggregate stats
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCosts = 0;

    for (const s of statements) {
      totalRevenue += s.total_revenue || 0;
      const sCosts = (s.costs || []).reduce((sum, c) => sum + (c.amount || 0), 0);
      totalCosts += sCosts;
    }

    const totalProfit = Math.max(0, totalRevenue - totalCosts);
    // Sum commission due across all statements
    const totalCommission = statements.reduce((sum, s) => {
      const rev = s.total_revenue || 0;
      const costs = (s.costs || []).reduce((acc, c) => acc + (c.amount || 0), 0);
      const profit = Math.max(0, rev - costs);
      return sum + profit * (s.commission_rate || 0.1);
    }, 0);

    return { totalRevenue, totalCosts, totalProfit, totalCommission };
  }, [statements]);

  // Chart data — monthly breakdown sorted chronologically
  const chartData = useMemo(() => {
    return [...statements]
      .sort((a, b) => a.month_date.localeCompare(b.month_date))
      .map((s) => {
        const costs = (s.costs || []).reduce(
          (sum, c) => sum + (c.amount || 0),
          0
        );
        const profit = Math.max(0, (s.total_revenue || 0) - costs);
        return {
          month: format(parseISO(s.month_date), "MMM yy"),
          revenue: s.total_revenue || 0,
          costs,
          profit,
        };
      });
  }, [statements]);

  // Recent statements for the table — last 6, most recent first
  const recentStatements = useMemo(() => {
    return [...statements]
      .sort((a, b) => b.month_date.localeCompare(a.month_date))
      .slice(0, 6);
  }, [statements]);

  // Year breakdown
  const yearBreakdown = useMemo(() => {
    const years = new Map<
      number,
      { revenue: number; costs: number; profit: number }
    >();
    for (const s of statements) {
      const year = getYear(parseISO(s.month_date));
      if (!years.has(year))
        years.set(year, { revenue: 0, costs: 0, profit: 0 });
      const entry = years.get(year)!;
      entry.revenue += s.total_revenue || 0;
      const sCosts = (s.costs || []).reduce(
        (sum, c) => sum + (c.amount || 0),
        0
      );
      entry.costs += sCosts;
      entry.profit += Math.max(0, (s.total_revenue || 0) - sCosts);
    }
    return Array.from(years.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, data]) => ({ year, ...data }));
  }, [statements]);

  return (
    <div className="w-full max-w-4xl space-y-6 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Financial Overview
        </h2>
        <p className="text-sm text-muted-foreground">
          Aggregate revenue, costs, and profit across all billing periods.
        </p>
      </div>

      {/* ─── Summary Stats ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={ArrowUpRight}
          label="Total Revenue"
          value={stats.totalRevenue}
          color="emerald"
        />
        <StatCard
          icon={ArrowDownRight}
          label="Total Costs"
          value={stats.totalCosts}
          color="red"
        />
        <StatCard
          icon={TrendingUp}
          label="Net Profit"
          value={stats.totalProfit}
          color="blue"
        />
        <StatCard
          icon={Wallet}
          label="Total Commission"
          value={stats.totalCommission}
          color="primary"
        />
      </div>

      {/* ─── Charts Row ─── */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue vs Costs Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Revenue vs Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="hsl(var(--chart-1, 142 71% 45%))"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                    <Bar
                      dataKey="costs"
                      name="Costs"
                      fill="hsl(var(--chart-2, 0 84% 60%))"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Profit Trend Area Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Profit Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient
                        id="profitGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="hsl(var(--chart-3, 217 91% 60%))"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(var(--chart-3, 217 91% 60%))"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Profit"
                      stroke="hsl(var(--chart-3, 217 91% 60%))"
                      fill="url(#profitGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Year Breakdown ─── */}
      {yearBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Yearly Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {yearBreakdown.map((yb) => (
                <div
                  key={yb.year}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">{yb.year}</span>
                  </div>
                  <div className="flex items-center gap-6 text-xs tabular-nums">
                    <span className="text-emerald-500 font-medium">
                      +${yb.revenue.toFixed(2)}
                    </span>
                    <span className="text-red-500 font-medium">
                      -${yb.costs.toFixed(2)}
                    </span>
                    <span className="text-blue-500 font-bold">
                      ${yb.profit.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Recent Statements Table ─── */}
      {recentStatements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Recent Statements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-right py-2 font-medium">Revenue</th>
                    <th className="text-right py-2 font-medium">Costs</th>
                    <th className="text-right py-2 font-medium">Profit</th>
                    <th className="text-right py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentStatements.map((s) => {
                    const sCosts = (s.costs || []).reduce(
                      (sum, c) => sum + (c.amount || 0),
                      0
                    );
                    const sProfit = Math.max(
                      0,
                      (s.total_revenue || 0) - sCosts
                    );
                    return (
                      <tr
                        key={s.id}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 font-medium">
                          {format(parseISO(s.month_date), "MMMM yyyy")}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-emerald-500">
                          ${(s.total_revenue || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-red-500">
                          ${sCosts.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-blue-500 font-medium">
                          ${sProfit.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusLabel status={s.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {statements.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              No financial data yet
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Select a billing period from the sidebar to start tracking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
