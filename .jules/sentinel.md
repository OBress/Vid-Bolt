# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [Service Role Client Bypasses RLS]
**Vulnerability:** The `getServiceClient()` helper returns a Supabase client with the service role key, which bypasses Row Level Security (RLS). Using this client with user-supplied IDs (e.g., from query params) allows unauthorized access to data.
**Learning:** In this codebase, API routes using `getServiceClient()` must manually verify authentication and enforce ownership, as the database layer will not do it automatically.
**Prevention:** Always use `getAuthenticatedUser()` to retrieve the current user's ID and use that ID for database queries instead of trusting client input.
