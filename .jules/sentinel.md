# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-27 - [Unauthenticated Service Endpoints]
**Vulnerability:** Endpoints `/api/stock-media/store-clip` and `/api/vector/embed` were excluded from middleware authentication but lacked internal authorization checks, allowing arbitrary data insertion and vector embedding usage.
**Learning:** Middleware exclusion lists (like `matcher` or specific path checks) creates "shadow" endpoints that look protected but aren't. Service-to-service endpoints often get missed in standard user-session auth audits.
**Prevention:** Any endpoint excluded from global middleware auth MUST have explicit, route-level authentication (e.g., shared secret or manual session check) as the first step in the handler.
