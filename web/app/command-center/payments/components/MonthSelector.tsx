"use client";

import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MonthlyStatement } from "../actions";

interface MonthSelectorProps {
  statements: MonthlyStatement[];
  currentMonthDate: string; // The "current" real-world month to ensure it's always available options
}

export function MonthSelector({
  statements,
  currentMonthDate,
}: MonthSelectorProps) {
  const searchParams = useSearchParams();
  const selectedMonth = searchParams.get("month") || currentMonthDate;

  // Generate a list of recent months (e.g., last 12 months + next month potentially)
  // For simplicity, we'll take the existing statements and ensure the current month is also in the list.

  const relevantMonths = new Set<string>();
  relevantMonths.add(currentMonthDate);
  statements.forEach((s) => relevantMonths.add(s.month_date));

  const sortedMonths = Array.from(relevantMonths).sort((a, b) =>
    b.localeCompare(a)
  );

  return (
    <div className="flex flex-col gap-2 w-full max-w-[250px] shrink-0">
      <h3 className="text-sm font-medium text-muted-foreground mb-2 px-2">
        Billing Periods
      </h3>
      <div className="flex flex-col gap-1">
        {sortedMonths.map((dateStr) => {
          const statement = statements.find((s) => s.month_date === dateStr);
          const isSelected = selectedMonth === dateStr;
          const status = statement?.status || "draft";

          return (
            <Link
              key={dateStr}
              href={`/command-center/payments?month=${dateStr}`}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                isSelected
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{format(parseISO(dateStr), "MMMM yyyy")}</span>

              {status === "paid" && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {status === "pending_verification" && (
                <Clock className="w-4 h-4 text-amber-500" />
              )}
              {status === "draft" && statement && (
                <Circle className="w-4 h-4 text-muted-foreground/30" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
