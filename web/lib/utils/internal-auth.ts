/**
 * Internal API Authentication Utility
 * ============================================================================
 * Verifies that a request originates from a trusted internal source
 * (e.g. BullMQ workers) by checking the X-Internal-Secret header
 * against the INTERNAL_API_SECRET environment variable.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Verify that a request carries a valid internal API secret.
 * Returns null if valid, or a NextResponse with 401/500 if invalid.
 */
export function verifyInternalSecret(
  request: NextRequest | Request
): NextResponse | null {
  const secret =
    request instanceof NextRequest
      ? request.headers.get("X-Internal-Secret")
      : (request as Request).headers.get("X-Internal-Secret");

  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (!expectedSecret) {
    console.error("[InternalAuth] INTERNAL_API_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (
    !secret ||
    secret.length !== expectedSecret.length ||
    !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expectedSecret))
  ) {
    console.warn("[InternalAuth] Unauthorized request - invalid or missing secret");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null; // Valid
}

/**
 * Get the internal secret value for outgoing requests from workers.
 */
export function getInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET environment variable is not set");
  }
  return secret;
}
