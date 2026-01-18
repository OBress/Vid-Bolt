import { OAuth2Client } from 'google-auth-library';

/**
 * Creates an authenticated Google OAuth2 Client using the Supabase provider token.
 * Note: This requires the Supabase session to contain the provider_token.
 */
export async function getGCPAuthClient(accessToken: string) {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}
