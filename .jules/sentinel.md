# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [Service Role Client Bypasses RLS in API Routes]
**Vulnerability:** API routes using `getServiceClient()` bypass Supabase Row Level Security (RLS), leading to potential IDOR vulnerabilities if manual auth checks are missing.
**Learning:** `getServiceClient()` grants full database access. Reliance on it without explicit `getAuthenticatedUser()` checks negates the security benefits of Supabase RLS.
**Prevention:** Always pair `getServiceClient()` with `getAuthenticatedUser()` and manual ownership verification in API routes, or switch to an authenticated client where possible.
