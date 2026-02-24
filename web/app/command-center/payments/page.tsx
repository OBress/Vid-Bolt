import { startOfMonth, format } from "date-fns";
import { getMonthlyStatements } from "./actions";
import { FinancialForm } from "./components/FinancialForm";
import { MonthSelector } from "./components/MonthSelector";
import { Suspense } from "react";
import { Loader2, Receipt } from "lucide-react";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const statements = await getMonthlyStatements();

  // Determine current "real" month
  const today = new Date();
  const currentMonthDate = format(startOfMonth(today), "yyyy-MM-dd");

  // Determine selected month from URL or default to current
  const resolvedSearchParams = await searchParams;
  const selectedMonth = resolvedSearchParams.month || currentMonthDate;

  // Find statement for selected month
  const initialStatement = statements.find(
    (s) => s.month_date === selectedMonth
  );

  // If no statement for this month, try to find the most recent previous statement to pre-fill cost items
  let defaultCosts: { name: string; amount: number; id: string }[] = [];
  if (!initialStatement) {
    // Sort desc by date, find first one
    const lastStatement = statements
      .filter((s) => s.month_date < selectedMonth)
      .sort((a, b) => b.month_date.localeCompare(a.month_date))[0];

    if (lastStatement) {
      defaultCosts = lastStatement.costs.map((c) => ({
        ...c,
        id: crypto.randomUUID(), // New IDs for new month
        amount: 0, // Reset amount
      }));
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-6 max-w-[1600px] w-full mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Payments & Financials
            </h2>
            <p className="text-sm text-muted-foreground">
              Track revenue, manage costs, and handle platform commissions.
            </p>
          </div>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 px-8 pb-8 max-w-[1600px] w-full mx-auto">
        <div className="flex gap-8 h-full items-start">
          {/* Sidebar - Year Folder Navigation */}
          <aside className="hidden lg:flex w-[260px] shrink-0 flex-col h-full overflow-y-auto pb-4 pr-2 scrollbar-thin">
            <Suspense
              fallback={
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-10 bg-muted rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              }
            >
              <MonthSelector
                statements={statements}
                currentMonthDate={currentMonthDate}
              />
            </Suspense>
          </aside>

          {/* Main Content - Form */}
          <main className="flex-1 min-w-0 h-full overflow-y-auto pb-10 pr-2 scrollbar-thin">
            <Suspense
              key={selectedMonth}
              fallback={
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <FinancialForm
                currentDate={selectedMonth}
                initialStatement={initialStatement}
                defaultCosts={defaultCosts}
              />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
