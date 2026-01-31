# Sentinel's Journal

## 2024-05-22 - [Buffer Length Mismatch in HMAC Verification]
**Vulnerability:** `crypto.timingSafeEqual` throws an exception when comparing buffers of different lengths, causing a potential 500 error instead of a graceful 401 failure.
**Learning:** Even standard security functions like `timingSafeEqual` have preconditions (equal length buffers) that must be validated to prevent runtime errors.
**Prevention:** Always check buffer lengths are equal before calling `crypto.timingSafeEqual`.

## 2026-01-17 - [Broken Access Control in API Routes]
**Vulnerability:** A Next.js API route used a Service Role client to query data but failed to verify if the requested `userId` matched the authenticated user's ID, allowing potential data exposure.
**Learning:** Using a Service Role client bypasses RLS. When using it, you MUST manually verify that the authenticated user is authorized to access the requested resources.
**Prevention:** Always authenticate the user (e.g., `getAuthenticatedUser()`) and use the authenticated user's ID for database queries, or verify the request parameters against the authenticated user.
