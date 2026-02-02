# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [IDOR in Video Listing]
**Vulnerability:** The video listing API used a service role client (bypassing RLS) and filtered results based solely on a user-provided `userId` query parameter without verifying authentication.
**Learning:** Using service role clients in API routes bypasses Supabase RLS policies, making explicit application-level authorization checks mandatory.
**Prevention:** Always derive the `user_id` from the trusted session (`getAuthenticatedUser()`) rather than user input when fetching private data, or ensure the input matches the session.
