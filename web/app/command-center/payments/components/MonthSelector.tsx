"use client";

import { cn } from "@/lib/utils";
import { format, parseISO, getYear } from "date-fns";
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  FolderOpen,
  Folder,
  CalendarDays,
  BarChart3,
  Download,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import { MonthlyStatement, exportYearCsv } from "../actions";
import { toast } from "sonner";

interface MonthSelectorProps {
  statements: MonthlyStatement[];
  currentMonthDate: string;
}

interface YearGroup {
  year: number;
  months: { dateStr: string; statement?: MonthlyStatement }[];
  paidCount: number;
  totalCount: number;
}

const STATUS_CONFIG = {
  paid: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    label: "Paid",
  },
  pending_verification: {
    icon: Clock,
    color: "text-amber-500",
    label: "Pending",
  },
  draft: {
    icon: Circle,
    color: "text-muted-foreground/40",
    label: "Draft",
  },
} as const;

export function MonthSelector({
  statements,
  currentMonthDate,
}: MonthSelectorProps) {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view");
  const isOverview = currentView === "overview" || (!searchParams.get("month") && !currentView);
  const selectedMonth = searchParams.get("month") || currentMonthDate;
  const selectedYear = getYear(parseISO(selectedMonth));

  // Build year groups from statements + current month
  const yearGroups = useMemo<YearGroup[]>(() => {
    const relevantMonths = new Set<string>();
    relevantMonths.add(currentMonthDate);
    statements.forEach((s) => relevantMonths.add(s.month_date));

    const sortedMonths = Array.from(relevantMonths).sort((a, b) =>
      b.localeCompare(a)
    );

    const groups = new Map<number, YearGroup>();

    for (const dateStr of sortedMonths) {
      const year = getYear(parseISO(dateStr));
      if (!groups.has(year)) {
        groups.set(year, { year, months: [], paidCount: 0, totalCount: 0 });
      }
      const group = groups.get(year)!;
      const statement = statements.find((s) => s.month_date === dateStr);
      group.months.push({ dateStr, statement });
      group.totalCount++;
      if (statement?.status === "paid") group.paidCount++;
    }

    return Array.from(groups.values()).sort((a, b) => b.year - a.year);
  }, [statements, currentMonthDate]);

  // Auto-expand the year containing the selected month
  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set([selectedYear])
  );

  const toggleYear = useCallback((year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }, []);

  const [exportingYear, setExportingYear] = useState<number | null>(null);

  const handleExportCsv = useCallback(async (year: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setExportingYear(year);
      const csv = await exportYearCsv(year);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financials_${year}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${year} financials to CSV`);
    } catch (err) {
      console.error("CSV export error:", err);
      toast.error("Failed to export CSV");
    } finally {
      setExportingYear(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Overview Tab */}
      <Link
        href="/command-center/payments?view=overview"
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mb-1",
          isOverview
            ? "bg-primary/10 text-primary border-l-2 border-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <BarChart3 className={cn("w-4 h-4", isOverview ? "text-primary" : "text-muted-foreground/60")} />
        Overview
      </Link>

      <div className="h-px bg-border mx-2 mb-2" />

      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-2">
        Billing Periods
      </h3>

      <div className="flex flex-col gap-0.5">
        {yearGroups.map((group) => {
          const isExpanded = expandedYears.has(group.year);

          return (
            <div key={group.year} className="flex flex-col">
              {/* Year folder header */}
              <button
                onClick={() => toggleYear(group.year)}
                className={cn(
                  "flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "hover:bg-muted/60 active:scale-[0.98]",
                  isExpanded
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-90"
                  )}
                />
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="w-4 h-4 shrink-0" />
                )}
                <span className="flex-1 text-left">{group.year}</span>
                <button
                  onClick={(e) => handleExportCsv(group.year, e)}
                  disabled={exportingYear === group.year}
                  className={cn(
                    "p-1 rounded-md transition-all duration-150 hover:bg-muted",
                    exportingYear === group.year && "opacity-50 cursor-wait"
                  )}
                  title={`Export ${group.year} as CSV`}
                >
                  {exportingYear === group.year ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                  )}
                </button>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                    group.paidCount === group.totalCount && group.paidCount > 0
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {group.paidCount}/{group.totalCount}
                </span>
              </button>

              {/* Month items (collapsible) */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  isExpanded
                    ? "max-h-[1000px] opacity-100"
                    : "max-h-0 opacity-0"
                )}
              >
                <div className="flex flex-col gap-0.5 pl-5 pr-1 pt-0.5 pb-1">
                  {group.months.map(({ dateStr, statement }) => {
                    const isSelected = selectedMonth === dateStr;
                    const status = statement?.status || "draft";
                    const StatusIcon = STATUS_CONFIG[status].icon;
                    const statusColor = STATUS_CONFIG[status].color;

                    return (
                      <Link
                        key={dateStr}
                        href={`/command-center/payments?month=${dateStr}`}
                        className={cn(
                          "group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium border-l-2 border-primary ml-[-2px]"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <CalendarDays
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            isSelected
                              ? "text-primary"
                              : "text-muted-foreground/50 group-hover:text-muted-foreground"
                          )}
                        />
                        <span className="flex-1 truncate">
                          {format(parseISO(dateStr), "MMMM")}
                        </span>
                        <StatusIcon
                          className={cn("w-3.5 h-3.5 shrink-0", statusColor)}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
