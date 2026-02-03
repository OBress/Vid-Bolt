# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [Broken Access Control in Video Listing]
**Vulnerability:** `GET /api/videos` trusted `userId` query param allowing access to any user's videos.
**Learning:** Service role clients bypass RLS, so manual scoping by authenticated user ID is mandatory in API routes.
**Prevention:** Always derive user ID from the session (`getAuthenticatedUser`), never from client input, when using service role clients.
