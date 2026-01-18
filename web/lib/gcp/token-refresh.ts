/**
 * GCP Token Refresh Utility
 * 
 * Handles server-side OAuth token refresh using stored refresh tokens.
 * This allows persistent GCP access without requiring user re-authentication.
 */

import { createServiceClient } from "@/lib/supabase/service";

interface TokenRefreshResult {
  accessToken: string;
  expiresAt: Date;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Refresh a Google OAuth access token using a stored refresh token.
 * 
 * @param refreshToken - The user's stored refresh token
 * @returns Fresh access token and expiry time
 * @throws Error if refresh fails
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables. " +
      "These are required for server-side token refresh."
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data: GoogleTokenResponse = await response.json();

  if (data.error) {
    console.error("[GCP Token Refresh] Error:", data.error, data.error_description);
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }

  if (!data.access_token) {
    throw new Error("Token refresh failed: No access token in response");
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

/**
 * Get a valid GCP access token for a user.
 * 
 * First tries to use the provided token (from session).
 * If not provided, attempts to refresh using stored refresh token.
 * 
 * @param userId - The user's ID
 * @param providedToken - Optional access token from session
 * @returns Valid access token
 * @throws Error if no valid token can be obtained
 */
export async function getValidGCPToken(
  userId: string,
  providedToken?: string | null
): Promise<string> {
  // If a token was provided from the session, use it
  if (providedToken) {
    return providedToken;
  }

  // Otherwise, try to refresh using stored refresh token
  const supabase = createServiceClient();
  
  const { data: config, error } = await supabase
    .from("user_gcp_config")
    .select("gcp_refresh_token, gcp_token_expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !config?.gcp_refresh_token) {
    throw new Error(
      "No GCP authentication found. Please connect your Google Cloud account."
    );
  }

  // Refresh the token
  const { accessToken, expiresAt } = await refreshGoogleAccessToken(
    config.gcp_refresh_token
  );

  // Store the new expiry time (optional optimization for future)
  await supabase
    .from("user_gcp_config")
    .update({ gcp_token_expires_at: expiresAt.toISOString() })
    .eq("user_id", userId);

  return accessToken;
}

/**
 * Check if a user has a stored GCP refresh token.
 * Used by frontend to determine connection status.
 * 
 * @param userId - The user's ID
 * @returns Whether the user has a stored refresh token
 */
export async function hasStoredGCPToken(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from("user_gcp_config")
    .select("gcp_refresh_token")
    .eq("user_id", userId)
    .single();

  return !error && !!data?.gcp_refresh_token;
}

/**
 * Store a refresh token for a user.
 * Called during OAuth callback.
 * 
 * @param userId - The user's ID
 * @param refreshToken - The refresh token to store
 */
export async function storeRefreshToken(
  userId: string,
  refreshToken: string
): Promise<void> {
  const supabase = createServiceClient();
  
  await supabase
    .from("user_gcp_config")
    .upsert(
      {
        user_id: userId,
        gcp_refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}

/**
 * Clear stored tokens for a user (disconnect).
 * 
 * @param userId - The user's ID
 */
export async function clearStoredTokens(userId: string): Promise<void> {
  const supabase = createServiceClient();
  
  await supabase
    .from("user_gcp_config")
    .update({
      gcp_refresh_token: null,
      gcp_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
