"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generatePresignedPutUrl } from "@/lib/services/r2-storage";
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

  const timestamp = Date.now();
  // Store both in payment-proofs, distinguish by filename prefix
  const key = `payment-proofs/${user.id}/${statementId}/${type}-${timestamp}.${extension}`;
  
  // Use the existing R2 service
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
      status: "paid", // As per prompt: "mark that month as complete", assuming auto-verify for now
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
