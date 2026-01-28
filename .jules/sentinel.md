# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2025-05-21 - [Middleware Bypass Requires Manual Auth]
**Vulnerability:** Routes bypassed in `middleware.ts` (like `/api/vector` and `/api/stock-media`) lacked manual authentication checks in their route handlers, allowing unauthorized access.
**Learning:** Bypassing middleware (to support worker secrets or performance) shifts the responsibility of authentication entirely to the route handler. Without a standard pattern, this is easily missed.
**Prevention:** Use `verifySessionOrSecret` helper in all bypassed routes to enforce dual-auth (Internal Secret or Supabase Session).
