"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generatePresignedPutUrl, generatePaymentProofKey, generateRevenueProofKey } from "@/lib/services/r2-storage";
import { randomUUID } from "crypto";

export type CostItem = {
  id: string;
  name: string;
  amount: number;
};

export type PaymentStatus = "draft" | "pending_verification" | "paid";

export type MonthlyStatement = {
  id: string;
  user_id: string;
  month_date: string;
  total_revenue: number;
  costs: CostItem[];
  commission_rate: number;
  status: PaymentStatus;
  payment_proof_url: string | null;
  revenue_proof_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch all monthly statements for the current user.
 */
export async function getMonthlyStatements() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("monthly_statements")
    .select("*")
    .order("month_date", { ascending: false });

  if (error) {
    console.error("Error fetching statements:", error);
    throw new Error("Failed to fetch statements");
  }

  return data as MonthlyStatement[];
}

/**
 * Create or update a monthly statement draft.
 */
export async function upsertStatement(
  id: string | undefined, // undefined for new (though we usually upsert by month_date)
  monthDate: string,
  revenue: number,
  costs: CostItem[],
  revenueProofUrl: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Sanitize costs to ensure they are valid JSON
  const sanitizedCosts = costs.map((c) => ({
    id: c.id || randomUUID(),
    name: c.name,
    amount: c.amount,
  }));

  // If ID is provided, update specific record. otherwise try to insert/update by unique constraint
  const { data, error } = await supabase
    .from("monthly_statements")
    .upsert(
      {
        id: id,
        user_id: user.id,
        month_date: monthDate,
        total_revenue: revenue,
        costs: sanitizedCosts,
        revenue_proof_url: revenueProofUrl,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,month_date",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Error upserting statement:", error);
    throw new Error("Failed to save statement");
  }

  revalidatePath("/command-center/payments");
  return data as MonthlyStatement;
}

/**
 * Generate a presigned URL for uploading proofs (revenue or payment).
 */
export async function getProofUploadUrl(
  statementId: string, 
  type: "payment" | "revenue", 
  extension: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Use centralized key generators from r2-storage
  const key = type === "payment" 
    ? generatePaymentProofKey(user.id, statementId, extension)
    : generateRevenueProofKey(user.id, statementId, extension);
  
  const { putUrl, publicUrl } = await generatePresignedPutUrl(
    key,
    `image/${extension === 'png' ? 'png' : 'jpeg'}`,
    300 // 5 minutes expiration
  );

  return { putUrl, publicUrl };
}

/**
 * Legacy wrapper for backward compatibility if needed, using confirmPayment logic directly now
 */
export async function getPaymentUploadUrl(statementId: string, extension: string) {
    return getProofUploadUrl(statementId, "payment", extension);
}

/**
 * Confirm payment and mark statement as paid (or pending verification).
 */
export async function confirmPayment(statementId: string, proofUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("monthly_statements")
    .update({
      status: "pending_verification",
      payment_proof_url: proofUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", statementId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("Failed to confirm payment");
  }

  revalidatePath("/command-center/payments");
}

/**
 * Fetch Stripe GPU purchase costs for a given month, including carry-over
 * from prior months that have no financial statement.
 *
 * Carry-over logic: For every month from Jan of the statement's year up to
 * and including the target month, if a month has Stripe purchases but NO
 * financial statement, its costs roll forward to the target month.
 */
export async function getStripeCostsForMonth(monthDate: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const targetDate = new Date(monthDate);
  const targetYear = targetDate.getFullYear();

  // Fetch all statements for this year to know which months are "covered"
  const { data: yearStatements } = await supabase
    .from("monthly_statements")
    .select("month_date")
    .gte("month_date", `${targetYear}-01-01`)
    .lte("month_date", monthDate)
    .order("month_date", { ascending: true });

  const coveredMonths = new Set(
    (yearStatements || []).map((s: { month_date: string }) => s.month_date)
  );

  // Fetch all Stripe purchase transactions from Jan of this year through end of target month
  const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
  const { data: transactions } = await supabase
    .from("gpu_hours_transactions")
    .select("amount_cents, hours, created_at")
    .eq("user_id", user.id)
    .eq("type", "purchase")
    .gte("created_at", `${targetYear}-01-01T00:00:00Z`)
    .lte("created_at", endOfMonth.toISOString())
    .order("created_at", { ascending: true });

  if (!transactions || transactions.length === 0) return 0;

  // Group transaction costs by month (YYYY-MM-DD format, first of month)
  const costsByMonth = new Map<string, number>();
  for (const txn of transactions) {
    const txnDate = new Date(txn.created_at);
    const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, "0")}-01`;
    const amountDollars = (txn.amount_cents ?? Math.abs(txn.hours) * 100) / 100;
    costsByMonth.set(monthKey, (costsByMonth.get(monthKey) ?? 0) + amountDollars);
  }

  // Accumulate: for each month up to target, if that month has no statement
  // (except the target month itself), carry its costs to the target month.
  let totalForTargetMonth = 0;
  for (const [month, amount] of costsByMonth) {
    if (month === monthDate) {
      // This month's own Stripe costs — always included
      totalForTargetMonth += amount;
    } else if (month < monthDate && !coveredMonths.has(month)) {
      // Prior month with no statement — carry forward
      totalForTargetMonth += amount;
    }
    // If the prior month HAS a statement, its costs are accounted for there
  }

  return Math.round(totalForTargetMonth * 100) / 100;
}

/**
 * Fetch all Stripe purchase costs for a year, grouped by month.
 * Returns a Map-like array of { monthDate, totalCents }.
 */
async function getStripeCostsForYear(userId: string, year: number) {
  const supabase = await createClient();

  const { data: transactions } = await supabase
    .from("gpu_hours_transactions")
    .select("amount_cents, hours, created_at")
    .eq("user_id", userId)
    .eq("type", "purchase")
    .gte("created_at", `${year}-01-01T00:00:00Z`)
    .lte("created_at", `${year}-12-31T23:59:59Z`)
    .order("created_at", { ascending: true });

  const costsByMonth = new Map<string, number>();
  for (const txn of transactions || []) {
    const txnDate = new Date(txn.created_at);
    const monthKey = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, "0")}-01`;
    const amountDollars = (txn.amount_cents ?? Math.abs(txn.hours) * 100) / 100;
    costsByMonth.set(monthKey, (costsByMonth.get(monthKey) ?? 0) + amountDollars);
  }

  return costsByMonth;
}

/**
 * Generate CSV content for a given tax year.
 * Columns: Month, Revenue, [Each unique cost category], Stripe (GPU Hours), Total Costs, Commission, Net Profit
 */
export async function exportYearCsv(year: number): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Fetch all statements for this year
  const { data: statements } = await supabase
    .from("monthly_statements")
    .select("*")
    .eq("user_id", user.id)
    .gte("month_date", `${year}-01-01`)
    .lte("month_date", `${year}-12-31`)
    .order("month_date", { ascending: true });

  const stmts = (statements || []) as MonthlyStatement[];

  // Fetch Stripe costs for the year
  const stripeCostsByMonth = await getStripeCostsForYear(user.id, year);

  // Build set of months covered by statements
  const coveredMonths = new Set(stmts.map((s) => s.month_date));

  // Compute carry-over: for each month with Stripe costs but no statement,
  // roll forward to the next month that has a statement
  const stripeForStatement = new Map<string, number>();

  // Sort all relevant month keys
  const allMonthKeys = new Set([
    ...Array.from(stripeCostsByMonth.keys()),
    ...coveredMonths,
  ]);
  const sortedMonths = Array.from(allMonthKeys).sort();

  let pendingCarryOver = 0;
  for (const month of sortedMonths) {
    const stripeCost = stripeCostsByMonth.get(month) ?? 0;

    if (coveredMonths.has(month)) {
      // This month has a statement — absorb its own Stripe costs + any carry-over
      stripeForStatement.set(month, stripeCost + pendingCarryOver);
      pendingCarryOver = 0;
    } else {
      // No statement for this month — accumulate carry-over
      pendingCarryOver += stripeCost;
    }
  }

  // If there's remaining carry-over after all months, add to the last statement
  if (pendingCarryOver > 0 && stmts.length > 0) {
    const lastMonth = stmts[stmts.length - 1].month_date;
    stripeForStatement.set(
      lastMonth,
      (stripeForStatement.get(lastMonth) ?? 0) + pendingCarryOver
    );
  }

  // Collect all unique cost category names across all statements
  const costCategories = new Set<string>();
  for (const s of stmts) {
    for (const c of s.costs || []) {
      if (c.name) costCategories.add(c.name);
    }
  }
  const sortedCategories = Array.from(costCategories).sort();

  // Build CSV header
  const headers = [
    "Month",
    "Revenue",
    ...sortedCategories,
    "Stripe (GPU Hours)",
    "Total Costs",
    "Commission",
    "Net Profit",
  ];

  const escapeCell = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const rows: string[] = [headers.map(escapeCell).join(",")];

  // Totals accumulators
  let totalRevenue = 0;
  let totalCosts = 0;
  let totalCommission = 0;
  let totalProfit = 0;
  const totalsByCategory = new Map<string, number>();
  let totalStripe = 0;

  for (const s of stmts) {
    const monthLabel = new Date(s.month_date + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });

    const revenue = s.total_revenue || 0;
    const costMap = new Map<string, number>();
    let userCosts = 0;
    for (const c of s.costs || []) {
      costMap.set(c.name, (costMap.get(c.name) ?? 0) + (c.amount || 0));
      userCosts += c.amount || 0;
    }

    const stripeCost = stripeForStatement.get(s.month_date) ?? 0;
    const monthTotalCosts = userCosts + stripeCost;
    const profit = Math.max(0, revenue - monthTotalCosts);
    const commission = profit * (s.commission_rate || 0.1);

    const row = [
      monthLabel,
      revenue.toFixed(2),
      ...sortedCategories.map((cat) => (costMap.get(cat) ?? 0).toFixed(2)),
      stripeCost.toFixed(2),
      monthTotalCosts.toFixed(2),
      commission.toFixed(2),
      profit.toFixed(2),
    ];

    rows.push(row.map(escapeCell).join(","));

    totalRevenue += revenue;
    totalCosts += monthTotalCosts;
    totalCommission += commission;
    totalProfit += profit;
    totalStripe += stripeCost;
    for (const cat of sortedCategories) {
      totalsByCategory.set(cat, (totalsByCategory.get(cat) ?? 0) + (costMap.get(cat) ?? 0));
    }
  }

  // Totals row
  const totalsRow = [
    "TOTAL",
    totalRevenue.toFixed(2),
    ...sortedCategories.map((cat) => (totalsByCategory.get(cat) ?? 0).toFixed(2)),
    totalStripe.toFixed(2),
    totalCosts.toFixed(2),
    totalCommission.toFixed(2),
    totalProfit.toFixed(2),
  ];
  rows.push(totalsRow.map(escapeCell).join(","));

  return rows.join("\n");
}

