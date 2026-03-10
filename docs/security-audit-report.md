# VidBolt Full Security Audit & SAPUS Report

**Date:** 2026-03-08  
**Last Updated:** 2026-03-08 (post-remediation)  
**Scope:** Entire codebase — Next.js web app, GPU API, Supabase database, Docker/deployment infrastructure, CI/CD  
**Auditor:** Antigravity AI  
**Classification:** Internal — Confidential

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [SAPUS Audit Framework](#sapus-audit-framework)
3. [Detailed Findings](#detailed-findings)
4. [Current Security Measures In Place](#current-security-measures-in-place)
5. [Recommendations & Roadmap](#recommendations--roadmap)

---

## Executive Summary

VidBolt's security posture is **Strong** after remediation. The platform has comprehensive foundational security: RLS on all 18 tables, admin functions verify `auth.uid()`, Dockerfile non-root user, HTTPS with HSTS, and Redis hardened with authentication. The initial audit identified **18 findings** — **11 have been remediated**, **3 are deferred**, and **4 remain as future improvements**.

### Risk Summary

| Severity               | Found | Fixed | Remaining    |
| ---------------------- | ----- | ----- | ------------ |
| 🔴 Critical            | 3     | 3     | 0            |
| 🟠 High                | 4     | 3     | 1 (deferred) |
| 🟡 Medium              | 5     | 2     | 3            |
| 🔵 Low / Informational | 6     | 3     | 3            |

---

## SAPUS Audit Framework

**SAPUS** = **S**ecrets · **A**uthentication · **P**ermissions · **U**pload/Input · **S**ervice

### S — Secrets Management

| Check                                     | Status     | Notes                                                                                     |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| No hardcoded production secrets in source | ✅ Pass    | `example-env.env` has placeholder values only                                             |
| `.env.local` in `.gitignore`              | ✅ Pass    | Confirmed in `.gitignore`                                                                 |
| Service role key server-only              | ✅ Pass    | `SUPABASE_SERVICE_ROLE_KEY` never prefixed with `NEXT_PUBLIC_`                            |
| Admin basic auth password hashed          | ⚠️ Partial | `middlewares.yml` uses `$apr1$` hash — acceptable but should rotate                       |
| GitHub token in example env               | ⚠️ Partial | `example-env.env` line 27 contains `ghp_your_secure_token...` placeholder — could mislead |
| Webhook secrets required in production    | ✅ Fixed   | `GPU_WEBHOOK_SECRET` now fails **closed** in production (Finding #1 ✅)                   |

### A — Authentication

| Check                                 | Status   | Notes                                                                           |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| Supabase JWT validation on API routes | ✅ Pass  | `getAuthenticatedUser()` uses `supabase.auth.getUser()`                         |
| Middleware session refresh            | ✅ Pass  | `updateSession()` refreshes Supabase tokens                                     |
| Cookie-based redirect gate            | ✅ Fixed | Spoofable `is_logged_in` cookie removed; uses Supabase JWT only (Finding #3 ✅) |
| Admin routes protected                | ✅ Pass  | All use `requireAdmin()` which checks `is_admin` flag                           |
| Admin column mutations protected      | ✅ Pass  | Trigger `protect_admin_column` blocks non-service-role changes                  |
| Stripe webhook signature verification | ✅ Pass  | `stripe.webhooks.constructEvent()` + fail-closed on missing secret              |
| Internal API secret validation        | ✅ Pass  | `verifyInternalSecret()` — fails closed if `INTERNAL_API_SECRET` is missing     |

### P — Permissions / Authorization

| Check                                        | Status   | Notes                                                         |
| -------------------------------------------- | -------- | ------------------------------------------------------------- |
| RLS enabled on all tables                    | ✅ Pass  | 18 tables confirmed with `ENABLE ROW LEVEL SECURITY`          |
| SECURITY DEFINER functions set `search_path` | ✅ Pass  | All fixed in migration `20260124000002_security_fixes.sql`    |
| Admin RPC functions check `auth.uid()`       | ✅ Pass  | All admin RPCs verify admin role                              |
| Videos GET IDOR                              | ✅ Fixed | Server-side auth used; `userId` param ignored (Finding #2 ✅) |
| GCP routes auth check                        | ✅ Pass  | All GCP routes use `getUser()`                                |
| Video editor routes auth check               | ✅ Pass  | All video-editor routes use `getUser()`                       |
| dev/ routes admin-gated                      | ✅ Pass  | `requireAdmin()` used on all dev endpoints                    |

### U — Upload / Input Validation

| Check                                     | Status   | Notes                                                             |
| ----------------------------------------- | -------- | ----------------------------------------------------------------- |
| Body size limits configured               | ✅ Fixed | Reduced from 500MB to 100MB (Finding #10 ✅)                      |
| No `eval()` with user input               | ✅ Fixed | `eval()` replaced with safe regex parser (Finding #5 ✅)          |
| `dangerouslySetInnerHTML` usage           | ⚠️ Open  | 5 locations — deferred to separate PR with DOMPurify (Finding #6) |
| Motion graphics code injection prevention | ✅ Pass  | `code-validator.ts` blocks 21 dangerous patterns                  |
| SQL injection prevention                  | ✅ Pass  | Supabase client uses parameterized queries                        |
| CORS headers                              | ✅ Pass  | No explicit `Access-Control-Allow-*` headers — same-origin policy |

### S — Service / Infrastructure

| Check                                         | Status   | Notes                                                       |
| --------------------------------------------- | -------- | ----------------------------------------------------------- |
| HTTPS enforced                                | ✅ Pass  | Traefik redirects `:80` → `:443`, Let's Encrypt auto-SSL    |
| HSTS enabled                                  | ✅ Pass  | `stsSeconds: 31536000`, preload, includeSubdomains          |
| Security headers (X-Frame, nosniff, Referrer) | ✅ Pass  | Traefik middleware + Next.js `headers()`                    |
| Content Security Policy                       | ✅ Fixed | CSP header added in `next.config.ts` (Finding #7 ✅)        |
| Docker non-root user                          | ✅ Pass  | `USER nextjs` (UID 1001) in `Dockerfile.prod`               |
| Docker socket read-only                       | ✅ Pass  | `:ro` mount for Traefik                                     |
| Redis hardened                                | ✅ Pass  | Dangerous commands disabled, memory limits, AOF persistence |
| Redis on internal network                     | ✅ Pass  | Not exposed to public `web` network                         |
| Resource limits set                           | ✅ Pass  | CPU/memory limits on all containers                         |
| CI/CD least-privilege                         | ✅ Pass  | `contents: read` for CI, `packages: write` only for deploy  |
| Deployment health checks & rollback           | ✅ Pass  | Post-deploy verification + automatic rollback on failure    |
| Admin dashboard protected                     | ✅ Pass  | `admin-auth@file` basic auth on `admin.vidbolt.app`         |
| Rate limiting infrastructure                  | ✅ Fixed | `rate-limit@file` now applied to app router (Finding #4 ✅) |

---

## Detailed Findings

### ✅ Finding #1 · CRITICAL — GPU Webhook Signature Verification Fails Open — FIXED

**Location:** [signature-verification.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/lib/utils/signature-verification.ts#L11-L20)

**Issue:** When `GPU_WEBHOOK_SECRET` was not configured, `verifySignature()` returned `true` — effectively disabling signature verification.

**Fix Applied:** `verifySignature` now returns `false` (fail closed) in production when no secret is configured. Dev mode (`NODE_ENV=development`) still skips verification for local development.

---

### ✅ Finding #2 · CRITICAL — IDOR in Video Projects Listing — FIXED

**Location:** [videos/route.ts GET handler](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/app/api/videos/route.ts#L126-L150)

**Issue:** The GET handler accepted a `userId` query parameter and queried the database with a service role client without verifying ownership.

**Fix Applied:** The GET handler now calls `getAuthenticatedUser()` and uses `user.id` server-side. The `userId` query parameter is silently ignored. Frontend callers are unaffected.

---

### ✅ Finding #3 · CRITICAL — Middleware Auth Bypass via Spoofable Cookie — FIXED

**Location:** [middleware.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/middleware.ts#L4-L31)

**Issue:** The middleware used a plain-text `is_logged_in` cookie for redirect decisions, which could be spoofed.

**Fix Applied:** The `is_logged_in` cookie check has been removed entirely. All auth decisions now go through `updateSession()` which validates the Supabase JWT. The landing page (`/`) was added to the public paths list.

---

### ✅ Finding #4 · HIGH — Rate Limiting Not Applied to Application Routes — FIXED

**Location:** [docker-compose.prod.yml](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/docker-compose.prod.yml#L94)

**Issue:** Traefik rate-limit middleware was defined but not applied to the app router.

**Fix Applied:** Added `rate-limit@file` to the app router's middleware chain. The rate limit is 100 req/s average with 200 burst.

---

### ✅ Finding #5 · HIGH — `eval()` Used in JSX Layer Parser — FIXED

**Location:** [jsx-layer-parser.ts:190-204](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/jsx-layer-parser.ts#L190-L204)

**Issue:** The spring config parsing used `eval()` to parse a JavaScript object literal.

**Fix Applied:** Replaced `eval()` with safe regex-based property extraction. Only known Remotion spring config properties (`damping`, `mass`, `stiffness`, `overshootClamping`) are extracted via regex patterns.

---

### 🟠 Finding #6 · HIGH — `dangerouslySetInnerHTML` with SVG Content

**Locations:**

- [image-layer-content.tsx:519](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/components/image-layer-content.tsx#L519)
- [video-layer-content.tsx:418, 469](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/components/video-layer-content.tsx#L418)
- [sticker-components.tsx:71](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/overlay/stickers/sticker-components.tsx#L71)
- [VideoCard.tsx:180](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/components/features/project/VideoCard.tsx#L180)

**Issue:** SVG content is rendered using `dangerouslySetInnerHTML` in 5 locations. SVG is an XSS risk vector because it can contain `<script>`, `onload`, and other event handlers.

**Impact:** If any of these SVG strings originate from user input, AI-generated content, or external sources without sanitization, it enables stored XSS attacks.

**Remediation:**

- Sanitize all SVG strings with DOMPurify before rendering: `DOMPurify.sanitize(svgString, { USE_PROFILES: { svg: true } })`
- Alternatively, use a React SVG parser that strips dangerous elements

---

### ✅ Finding #7 · HIGH — Missing Content Security Policy — FIXED

**Location:** [next.config.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/next.config.ts#L40-L55)

**Issue:** No Content-Security-Policy header was configured.

**Fix Applied:** Added CSP header with: `default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, whitelisted domains for img/media/connect/font sources, `frame-ancestors 'none'`. Also added `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

---

### 🟡 Finding #8 · MEDIUM — SSRF Potential in GPU API

**Location:** `Vid-Bolt-GPU-API/app/services/storage.py` (referenced from previous audit)

**Issue:** The GPU API downloads files from arbitrary URLs without validating against private IP ranges (RFC 1918, link-local `169.254.x.x`).

**Impact:** An attacker could force the GPU server to fetch cloud metadata endpoints (e.g., `http://169.254.169.254/`) or scan internal networks.

**Remediation:**

- Validate URLs against a blocklist of private/internal IP ranges before making requests
- Restrict downloads to known allowed domains (R2, S3, etc.)

---

### 🟡 Finding #9 · MEDIUM — Admin Basic Auth on Traefik

**Location:** [middlewares.yml](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/traefik/dynamic/middlewares.yml#L8-L11)

**Issue:** The admin subdomain (`admin.vidbolt.app`) is protected by HTTP Basic Auth with a single hardcoded hash:

```yaml
admin-auth:
  basicAuth:
    users:
      - "admin:$apr1$PCLR3JR/$imavJ9UR/GRa82vDAqRFH."
```

**Impact:** Basic Auth credentials are transmitted in Base64 (though over HTTPS). Single-user static credentials are hard to audit and rotate. The hash is committed to version control.

**Remediation:**

- Move the hash to an environment variable or Docker secret
- Consider upgrading to OAuth2/OIDC for admin access (e.g., Traefik ForwardAuth with a Supabase session check)
- Add a second factor or IP allowlisting for the admin subdomain

---

### ✅ Finding #10 · MEDIUM — Excessive Body Size Limits — FIXED

**Location:** [next.config.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/next.config.ts#L15-L20)

**Issue:** Body size limits were set to 500MB.

**Fix Applied:** Reduced both `serverActions.bodySizeLimit` and `middlewareClientMaxBodySize` from 500MB to 100MB.

---

### 🟡 Finding #11 · MEDIUM — ESLint and TypeScript Errors Ignored During Build

**Location:** [next.config.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/next.config.ts#L5-L14)

**Issue:** Both ESLint and TypeScript errors are silenced during production builds:

```typescript
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

**Impact:** Security-relevant type errors and lint warnings (e.g., unsafe casts, unused error handling) will not block deployment. This weakens code quality as a security layer.

**Remediation:**

- Enable both in CI (at least as non-blocking warnings)
- Run `tsc --noEmit` and `eslint` as separate CI checks before the Docker build

---

### ✅ Finding #12 · MEDIUM — Redis Without Authentication — FIXED

**Location:** [redis.conf](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/redis/redis.conf), [docker-compose.prod.yml](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/docker-compose.prod.yml)

**Issue:** Redis was configured without a password.

**Fix Applied:** Added `requirepass` to `redis.conf` and updated `REDIS_URL` in `docker-compose.prod.yml` (both app and workers) to include the password. A `REDIS_PASSWORD` env var was added to `example-env.env`.

---

### ✅ Finding #13 · LOW — Docker Image Uses `latest` Tag — FIXED

**Fix Applied:** Pinned to `traefik:v3.3.4`, `redis:7.4-alpine`, `nginx:1.27-alpine`.

---

### 🔵 Finding #14 · LOW — No Container Image Scanning — OPEN

**Issue:** The CI/CD pipeline builds and pushes Docker images without scanning for known CVEs.

**Remediation:** Add `docker/scout-action@v1` or Trivy scanning step to the build workflow.

---

### 🔵 Finding #15 · LOW — Verbose Error Messages in Production — OPEN

**Issue:** Several API routes return `error.message` directly to clients, which may leak internal details.

**Remediation:** Return generic error messages to clients; log details server-side only.

---

### 🔵 Finding #16 · LOW — No Audit Logging — OPEN

**Issue:** No centralized audit log for security-relevant events.

**Remediation:** Log security events to a dedicated table or external service.

---

### ✅ Finding #17 · LOW — Missing `Permissions-Policy` Header — FIXED

**Fix Applied:** Added `Permissions-Policy: camera=(), microphone=(), geolocation=()` in `next.config.ts`.

---

### ✅ Finding #18 · LOW — Traefik `latest` Image Without Pinning — FIXED

**Fix Applied:** Pinned to `traefik:v3.3.4` (see Finding #13).

---

## Current Security Measures In Place

### ✅ Authentication & Authorization

- **Supabase JWT validation** via `getUser()` on all sensitive API routes
- **Admin guard** (`requireAdmin()`) on all admin/dev endpoints with DB-level `is_admin` check
- **Admin column protection** via PostgreSQL trigger (`protect_admin_column`)
- **Internal API secret** for worker-to-API communication with fail-closed behavior
- **SECURITY DEFINER functions** all have `SET search_path = ''` for SQL injection prevention

### ✅ Database Security

- **Row Level Security** enabled on all 18 tables
- **Service role usage** appropriately scoped to server-side operations only
- **Parameterized queries** throughout (via Supabase JS SDK)
- **admin_delete_user** and **admin_wipe_user_data** validate `auth.uid()` and prevent self-deletion

### ✅ Infrastructure & Deployment

- **HTTPS enforced** with automatic Let's Encrypt certificates via Traefik
- **HSTS** with preload and includeSubdomains (31,536,000 seconds)
- **Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `browserXssFilter: true`
- **Content Security Policy** with whitelisted domains and `frame-ancestors 'none'`
- **Permissions-Policy** restricts camera, microphone, geolocation
- **Non-root Docker user** (UID 1001)
- **Multi-stage Docker build** minimizing attack surface (~200MB image)
- **Redis hardened**: `FLUSHDB`, `FLUSHALL`, `DEBUG` commands disabled; memory limits enforced; password authentication enabled
- **Internal Docker network** isolates Redis and workers from public traffic
- **Resource limits** on all containers (CPU + memory caps)
- **Rate limiting** applied to app router (100 req/s avg, 200 burst)
- **Pinned Docker images** for Traefik, Redis, Nginx

### ✅ CI/CD Security

- **Least-privilege permissions** on GitHub Actions workflows
- **SSH key-based deployment** to Hetzner
- **Health checks** post-deployment with automatic rollback on failure
- **Concurrency control** prevents parallel deployments
- **Docker build cache** (GitHub Actions cache, not storing secrets)

### ✅ Application Security

- **Motion graphics code validator** blocks 21 dangerous patterns (`eval`, `fetch`, `document.cookie`, `process.env`, etc.)
- **Stripe webhook signature verification** with fail-closed behavior
- **GPU webhook signature verification** with fail-closed behavior (production)
- **No `eval()` usage** — replaced with safe regex parsing
- **Server-side authentication** on all API routes (no client-supplied user IDs)
- **No CORS headers** — same-origin policy enforced
- **R2 proxy rewrite** for same-origin canvas rendering (avoids CORS tainting)
- **Timing-safe HMAC comparison** for GPU webhook signatures
- **Reduced body size limits** (100MB) to prevent upload abuse

---

## Remaining Recommendations

The following items were **not** fixed in this remediation pass and remain as future work:

### Open Items

| #   | Finding                       | Severity  | Status   | Notes                                                             |
| --- | ----------------------------- | --------- | -------- | ----------------------------------------------------------------- |
| 6   | SVG `dangerouslySetInnerHTML` | 🟠 High   | Deferred | Requires DOMPurify dependency + 5 component changes — separate PR |
| 8   | SSRF in GPU API               | 🟡 Medium | Open     | GPU API is in a separate repository                               |
| 9   | Admin basic auth hash in VCS  | 🟡 Medium | Open     | Move to Docker secret when convenient                             |
| 11  | ESLint/TS in CI               | 🟡 Medium | Open     | Add as separate CI check step                                     |
| 14  | Container image scanning      | 🔵 Low    | Open     | Add Trivy or Docker Scout to CI                                   |
| 15  | Verbose error messages        | 🔵 Low    | Open     | Return generic errors to clients                                  |
| 16  | Audit logging                 | 🔵 Low    | Open     | Structured security event logging                                 |

### Long-Term (Quarterly Review)

- **Upgrade admin auth** to OAuth2/OIDC with Supabase ForwardAuth
- **Implement dependency scanning** (Dependabot, Snyk, or npm audit in CI)
- **Add integration security tests** (OWASP ZAP or custom API auth tests)
- **Conduct penetration testing** before public launch

---

## Remediation Log

| Date       | Finding                | Change                                                  |
| ---------- | ---------------------- | ------------------------------------------------------- |
| 2026-03-08 | #1 GPU webhook         | `signature-verification.ts` — fail closed in production |
| 2026-03-08 | #2 Videos IDOR         | `videos/route.ts` — server-side auth, param ignored     |
| 2026-03-08 | #3 Middleware bypass   | `middleware.ts` — removed `is_logged_in` cookie         |
| 2026-03-08 | #4 Rate limiting       | `docker-compose.prod.yml` — applied `rate-limit@file`   |
| 2026-03-08 | #5 eval()              | `jsx-layer-parser.ts` — regex-based safe parser         |
| 2026-03-08 | #7 CSP                 | `next.config.ts` — CSP + Permissions-Policy headers     |
| 2026-03-08 | #10 Body size          | `next.config.ts` — 500MB → 100MB                        |
| 2026-03-08 | #12 Redis auth         | `redis.conf` + `docker-compose.prod.yml` — requirepass  |
| 2026-03-08 | #13/#18 Image pinning  | `docker-compose.prod.yml` — pinned versions             |
| 2026-03-08 | #17 Permissions-Policy | `next.config.ts` — header added                         |

---

_Report generated by Antigravity AI on 2026-03-08. Updated post-remediation on 2026-03-08._
