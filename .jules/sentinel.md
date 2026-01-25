# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [IDOR in Service Role Usage]
**Vulnerability:** `GET /api/videos` used a Service Role client but filtered based on an unverified `userId` query parameter, allowing IDOR.
**Learning:** Service Role clients bypass RLS. When using them, input validation and authorization checks must be manual and strict. Prefer using authenticated clients or strict RLS where possible, or derive identity solely from secure sessions.
**Prevention:** Never use user-supplied IDs for authorization filters when using privileged clients. Always derive the user ID from the session.
