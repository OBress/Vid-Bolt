# Sentinel's Journal

## 2025-02-21 - Unauthenticated Critical Endpoints
**Vulnerability:** Found multiple sensitive API endpoints (`/api/stock-media/clear-storage`, `/api/stock-media/clear-vector-db`, `/api/stock-media/store-clip`, `/api/vector/embed`) that were explicitly excluded from authentication middleware to allow worker access, effectively making them public.
**Learning:** Hardcoding exclusions in middleware for "internal" or "worker" access without an alternative authentication mechanism (like a shared secret) creates critical security holes. Service-to-service communication must be authenticated.
**Prevention:** Implement a shared secret (e.g., `X-Worker-Secret`) for internal API calls. In middleware, require either a valid user session OR the valid shared secret. Never completely exclude sensitive routes from auth checks.
