import { startOfMonth, format } from "date-fns";
import { getMonthlyStatements } from "./actions";
import { FinancialForm } from "./components/FinancialForm";
import { MonthSelector } from "./components/MonthSelector";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

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
    <div className="flex h-full flex-col space-y-8 p-8 max-w-[1600px] mx-auto overflow-hidden">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Payments & Financials
          </h2>
          <p className="text-muted-foreground">
            Track revenue, manage costs, and handle platform commissions.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start h-full">
        {/* Sidebar - Month Selection */}
        <aside className="w-full lg:w-64 shrink-0 h-full overflow-y-auto pb-4">
          <Suspense
            fallback={<div className="h-32 bg-muted rounded animate-pulse" />}
          >
            <MonthSelector
              statements={statements}
              currentMonthDate={currentMonthDate}
            />
          </Suspense>
        </aside>

        {/* Main Content - Form */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto pb-10 pr-2">
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
  );
}
