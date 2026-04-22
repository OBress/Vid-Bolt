"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Loader2,
  TrendingUp,
  Users,
  Server,
  HardDrive,
  AlertCircle,
  RefreshCw,
  Download,
  Search,
  ChevronRight,
  Plus,
  Save,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

// ============================================================================
// TYPES
// ============================================================================

interface UserCostRow {
  userId: string;
  email: string;
  displayName: string;
  totalCostUsd: number;
  breakdown: Record<string, number>;
}

interface PlatformTotals {
  allUsersCostUsd: number;
  hetznerCostUsd: number;
  r2StorageCostUsd: number;
  miscCostUsd: number;
  totalPlatformCostUsd: number;
}

interface MonthlyTrendPoint {
  month: string;
  userCostUsd: number;
  platformCostUsd: number;
}

interface PlatformRow {
  category: string;
  label: string;
  amount_usd: number;
  month_date: string;
  notes?: string;
}

interface AdminCostData {
  month: string;
  users: UserCostRow[];
  platformTotals: PlatformTotals;
  platformRows: PlatformRow[];
  monthlyTrend: MonthlyTrendPoint[];
}

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function getMonthOptions(): { label: string; value: string }[] {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      value: d.toISOString().slice(0, 10),
    });
  }
  return opts;
}

// ============================================================================
// PLATFORM COST ENTRY FORM
// ============================================================================

function PlatformCostEntryForm({
  month,
  existingRows,
  onSaved,
}: {
  month: string;
  existingRows: PlatformRow[];
  onSaved: () => void;
}) {
  const categories = [
    { value: "hetzner", label: "Hetzner Hosting" },
    { value: "r2", label: "Cloudflare R2" },
    { value: "misc", label: "Miscellaneous" },
  ];

  const [rows, setRows] = useState<
    { category: string; label: string; amountUsd: string; notes: string }[]
  >(() =>
    existingRows.length > 0
      ? existingRows.map((r) => ({
          category: r.category,
          label: r.label,
          amountUsd: r.amount_usd.toString(),
          notes: r.notes ?? "",
        }))
      : [{ category: "hetzner", label: "Monthly Invoice", amountUsd: "", notes: "" }]
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { category: "misc", label: "", amountUsd: "", notes: "" },
    ]);

  const updateRow = (i: number, field: string, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        rows
          .filter((r) => r.label && r.amountUsd)
          .map((r) =>
            fetch("/api/admin/platform-costs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                monthDate: month,
                category: r.category,
                label: r.label,
                amountUsd: parseFloat(r.amountUsd),
                notes: r.notes || null,
              }),
            })
          )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-200">Platform Cost Entry</h3>
        <span className="text-xs text-neutral-500">For: {month.slice(0, 7)}</span>
      </div>
      <div className="space-y-2 mb-3">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={row.category}
              onChange={(e) => updateRow(i, "category", e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-200 focus:outline-none"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Label"
              value={row.label}
              onChange={(e) => updateRow(i, "label", e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500"
            />
            <input
              type="number"
              placeholder="Amount ($)"
              value={row.amountUsd}
              onChange={(e) => updateRow(i, "amountUsd", e.target.value)}
              className="w-28 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-neutral-500"
            />
            <button
              onClick={() => removeRow(i)}
              className="text-neutral-600 hover:text-red-400 text-xs px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-xs text-white transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN TAB
// ============================================================================

export function PlatformCostsTab() {
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [data, setData] = useState<AdminCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/platform-costs?month=${selectedMonth}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = (data?.users ?? []).filter(
    (u) =>
      !userSearch ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.displayName.toLowerCase().includes(userSearch.toLowerCase())
  );

  const pieData = data
    ? [
        { name: "User API Costs", value: data.platformTotals.allUsersCostUsd, color: "hsl(220,90%,56%)" },
        { name: "Hetzner Hosting", value: data.platformTotals.hetznerCostUsd, color: "hsl(0,85%,55%)" },
        { name: "Cloudflare R2", value: data.platformTotals.r2StorageCostUsd, color: "hsl(200,98%,39%)" },
        { name: "Misc", value: data.platformTotals.miscCostUsd, color: "hsl(40,90%,50%)" },
      ].filter((d) => d.value > 0)
    : [];

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["User", "Email", "Total ($)", ...Object.keys(data.users[0]?.breakdown ?? {})],
      ...data.users.map((u) => [
        u.displayName || u.userId,
        u.email,
        u.totalCostUsd.toFixed(4),
        ...Object.values(u.breakdown).map((v) => v.toFixed(4)),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `platform-costs-${data.month}.csv`;
    a.click();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Platform Cost Overview
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              All users combined + Hetzner, Cloudflare R2 infrastructure
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-neutral-500" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-950/30 border border-red-800/50 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  icon: Users,
                  color: "text-blue-400",
                  bg: "bg-blue-950/30",
                  label: "User API Costs",
                  value: fmt(data.platformTotals.allUsersCostUsd),
                  sub: `${data.users.length} users`,
                },
                {
                  icon: Server,
                  color: "text-red-400",
                  bg: "bg-red-950/30",
                  label: "Hetzner Hosting",
                  value: fmt(data.platformTotals.hetznerCostUsd),
                  sub: "This month",
                },
                {
                  icon: HardDrive,
                  color: "text-sky-400",
                  bg: "bg-sky-950/30",
                  label: "Cloudflare R2",
                  value: fmt(data.platformTotals.r2StorageCostUsd),
                  sub: "Storage + ops",
                },
                {
                  icon: DollarSign,
                  color: "text-emerald-400",
                  bg: "bg-emerald-950/30",
                  label: "Grand Total",
                  value: fmt(data.platformTotals.totalPlatformCostUsd),
                  sub: "All costs combined",
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                >
                  <div className={`w-7 h-7 rounded-lg ${kpi.bg} flex items-center justify-center mb-2.5`}>
                    <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                  </div>
                  <div className="text-xl font-bold text-white">{kpi.value}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{kpi.label}</div>
                  <div className="text-xs text-neutral-600 mt-1">{kpi.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Platform cost mix pie */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <h3 className="text-sm font-semibold text-neutral-200 mb-3">Platform Cost Mix</h3>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-52 text-neutral-500 text-sm">
                    No cost data for this month
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={85}
                        innerRadius={45}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(v: any) => [fmt(Number(v))]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="space-y-1.5 mt-1">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                        <span className="text-neutral-300">{item.name}</span>
                      </div>
                      <span className="text-neutral-200 font-mono">{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6-month trend */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <h3 className="text-sm font-semibold text-neutral-200 mb-3">6-Month Trend</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.monthlyTrend} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: "8px", fontSize: "11px" }}
                      formatter={(v: any) => [fmt(Number(v))]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                    <Bar dataKey="userCostUsd" name="User API" stackId="a" fill="hsl(220,90%,56%)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="platformCostUsd" name="Platform Infra" stackId="a" fill="hsl(0,85%,55%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* User cost table */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-200">
                  User Cost Breakdown ({data.users.length} users)
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Search users…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 focus:outline-none w-44"
                    />
                  </div>
                  <button
                    onClick={exportCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left px-5 py-2.5 font-medium">User</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total</th>
                    {["LLM", "Audio / TTS", "GCP VM", "AWS Lambda"].map((h) => (
                      <th key={h} className="text-right px-4 py-2.5 font-medium hidden lg:table-cell">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.slice(0, 50).map((u) => (
                    <tr
                      key={u.userId}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="text-neutral-200 text-xs">{u.displayName || "—"}</div>
                        <div className="text-neutral-500 text-xs">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-200">
                        {fmt(u.totalCostUsd)}
                      </td>
                      {["LLM", "Audio / TTS", "GCP VM", "AWS Lambda"].map((cat) => (
                        <td key={cat} className="px-4 py-3 text-right font-mono text-neutral-500 text-xs hidden lg:table-cell">
                          {fmt(u.breakdown[cat] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-neutral-500 text-sm">
                        No users match your search
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Platform cost entry */}
            <PlatformCostEntryForm
              month={selectedMonth}
              existingRows={data.platformRows}
              onSaved={fetchData}
            />
          </>
        )}
      </div>
    </div>
  );
}
