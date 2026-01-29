# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-29 - [Broken Access Control in Video Listing]
**Vulnerability:** The `GET /api/videos` endpoint trusted a `userId` query parameter without verifying it against the authenticated session, allowing unauthorized access to any user's videos.
**Learning:** Service role clients bypass RLS, shifting the responsibility of access control entirely to the application logic. Trusting client input for ownership checks is a critical flaw.
**Prevention:** Derive user identity solely from the authenticated session (e.g., `getAuthenticatedUser().user.id`) for user-scoped data access.
