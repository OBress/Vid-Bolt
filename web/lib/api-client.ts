/**
 * API Client
 * 
 * Simple wrapper for authenticated API requests that handles
 * Supabase session token injection.
 */

import { createClient } from '@/lib/supabase/client';

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Make an authenticated API request
 * Automatically includes the Supabase session token in the Authorization header
 */
export async function apiRequest<T>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  
  // Get the session token for authentication
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  // Add authorization header if we have a session
  if (session?.access_token) {
    (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${session.access_token}`;
  }
  
  // Add body for non-GET requests
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, fetchOptions);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API request failed with status ${response.status}`);
  }
  
  return response.json();
}
