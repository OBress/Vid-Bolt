/**
 * Admin Authentication Utility
 * ============================================================================
 * Authenticates a user via Supabase and verifies they have admin privileges.
 * Used by admin-only API routes.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface AdminAuthResult {
  user: { id: string; email?: string };
  isAdmin: boolean;
}

/**
 * Authenticate a user and check admin status.
 * Returns an AdminAuthResult on success, or a NextResponse error on failure.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check is_admin flag from the users table
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (userError || !userData?.is_admin) {
    return NextResponse.json(
      { error: "Forbidden: admin access required" },
      { status: 403 }
    );
  }

  return {
    user: { id: user.id, email: user.email },
    isAdmin: true,
  };
}

/**
 * Type guard to check if the result is an error response.
 */
export function isAuthError(
  result: AdminAuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
