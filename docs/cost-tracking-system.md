# Cost Tracking System

> **Status:** Production — Introduced April 2026  
> **Scope:** All API costs, TTS, GCP VM uptime, AWS Lambda renders, Valyu/Serper search

---

## Overview

Vid-Bolt maintains a real-time, per-user cost ledger to provide accurate spending transparency. Every billable operation emits an auditable row to the `cost_events` table. This data powers:

1. **User Analytics → Costs page** — personal spend dashboard with pie chart, trend line, GCP VM live ticker, and per-video table.
2. **Admin → Platform Costs tab** — cumulative platform view with per-user breakdowns and Hetzner/R2 infrastructure costs.
3. **Payments page** — auto-import of monthly tracked costs into the monthly financial statement.

---

## Architecture

```
Pipeline Execution (BullMQ workers / API routes)
    │
    ▼
Cost event emitted (lib/costs/emit-cost-event.ts)
    │
    ▼
cost_events table (Supabase)  ◄──  RLS: user sees only their own rows
    │
    ├── GET /api/analytics/costs        → User Analytics page
    ├── GET /api/analytics/costs/monthly-summary  → Payments page import
    └── GET /api/admin/platform-costs   → Admin Platform Costs tab (admin-only)
```

---

## Cost Categories

| Category | Icon | Service(s) | Accuracy |
|---|---|---|---|
| `llm` | 🤖 | OpenRouter, Inworld Router | **Exact** (from `usage.cost` in API response) |
| `tts` | 🔊 | Inworld TTS | **Exact** (chars × $/char constant) |
| `gcp_vm` | 🖥️ | GCP Compute Engine | **Estimated** (SPOT pricing, $1.90/hr + $2/day flat) |
| `aws_lambda` | ⚡ | AWS Lambda / Remotion | **Exact** (from `estimatedCost` in Remotion SDK) |
| `search_valyu` | 🔍 | Valyu Search, DeepResearch | **Mixed** (estimated for search, exact for DeepResearch) |
| `search_serper` | 🔎 | Serper | **Exact** ($0.0003/query constant) |
| `r2_storage` | ☁️ | Cloudflare R2 | **Admin-estimated** (manually entered) |

---

## Pricing Constants (`lib/costs/pricing.ts`)

| Constant | Value |
|---|---|
| `VM_HOURLY_RATE_USD` | $1.90/hr (SPOT, single GPU node) |
| `VM_DAILY_FLAT_RATE_USD` | $2.00/day (ownership fee from provisioning date) |
| `TTS_PRICING_USD_PER_CHAR['inworld-tts-1.5-max']` | $0.000016/char |
| `TTS_PRICING_USD_PER_CHAR['inworld-tts-1.5-mini']` | $0.000008/char |
| `SERPER_PER_QUERY_USD` | $0.0003/query |
| `VALYU_SEARCH_CPM_USD['web']` | $1.50/1000 results |
| `VALYU_SEARCH_CPM_USD['financial']` | $8.00/1000 results |
| `VALYU_SEARCH_CPM_USD['proprietary']` | $1.00/1000 results |
| `R2_STORAGE_GB_MONTH_USD` | $0.015/GB-month |

---

## Database Schema

### `cost_events` table

```sql
cost_events (
  id           UUID PK,
  user_id      UUID FK → users.id,
  video_id     UUID FK → video_projects.id (nullable),
  category     TEXT,          -- 'llm' | 'tts' | 'gcp_vm' | 'aws_lambda' | ...
  service      TEXT,          -- 'openrouter' | 'inworld_tts' | 'gcp' | 'aws' | ...
  sub_label    TEXT,          -- model name, voice ID, search type, etc.
  amount_usd   NUMERIC(12,8), -- the cost in USD
  raw_units    JSONB,         -- { chars: 1688, tokens: 12500, ... }
  is_estimated BOOLEAN,       -- true for SPOT VM, Valyu search estimates
  note         TEXT,          -- human-readable note for UI display
  occurred_at  TIMESTAMPTZ
)
```

**RLS Policy**: Users can only `SELECT` their own rows (`auth.uid() = user_id`). All writes use the `service_role` key from workers and API routes — no user-initiated writes are permitted.

### `user_gcp_config` additions

```sql
vm_provisioned_at     TIMESTAMPTZ  -- when VM was first provisioned (triggers daily flat fee)
vm_session_started_at TIMESTAMPTZ  -- set on VM START, nulled on STOP
total_vm_hours_run    NUMERIC       -- cumulative hours accumulator
total_vm_days_owned   INTEGER       -- cumulative days accumulator
```

### `admin_platform_costs` table

```sql
admin_platform_costs (
  month_date  DATE,           -- e.g. 2026-04-01
  category    TEXT,           -- 'hetzner' | 'r2' | 'misc'
  label       TEXT,           -- "Monthly Invoice", etc.
  amount_usd  NUMERIC(10,2),
  notes       TEXT
)
```
Admin-manually entered via the Admin → Platform Costs → Cost Entry form. No RLS — accessed only via service_role.

---

## How Each Cost is Captured

### LLM (OpenRouter / Inworld Router)

The universal LLM client (`lib/ai/client.ts`) hooks into `parseResponse()` to extract `usage.cost` from the API response:

```typescript
// lib/ai/client.ts (parseResponse)
const exactCostUsd = typeof usage?.cost === 'number' && usage.cost > 0
  ? usage.cost : undefined;

tracker.addLlmCall(model, usage, exactCostUsd, provider);
```

- **OpenRouter** returns an exact `usage.cost` field (in USD) — this is the most accurate path.
- **Inworld Router** does not return `usage.cost`, so `exactCostUsd` will be `undefined`. These calls are tracked for token counts but without a dollar amount until Inworld adds cost reporting to their API.

Cost events are emitted from `CostTracker.save()` after each pipeline step completes.

### TTS (Inworld TTS)

The audio worker (`lib/queues/workers/audio.ts`) emits a cost event directly after synthesis:

```typescript
const pricePerChar = getTtsPricePerChar(ttsModelKey);
const ttsAmountUsd = script.length * pricePerChar;
await emitCostEvent({ category: 'tts', service: 'inworld_tts', amountUsd: ttsAmountUsd, ... });
```

### GCP VM Uptime

Two separate cost lines are emitted per VM shutdown:

1. **Hourly compute**: `session_hours × $1.90/hr` — `isEstimated: true`
2. **Daily flat fee**: `new_days_since_provisioned × $2.00/day` — `isEstimated: false`

The session is opened (`openVmSession`) on `provision` and `start` actions, and closed (`closeVmSession`) on `stop` or auto-shutdown. The `closeVmSession` helper (`lib/costs/close-vm-session.ts`) computes the duration, emits both events, and updates the accumulators in `user_gcp_config`.

```
VM lifecycle:
  provision → openVmSession() → sets vm_provisioned_at + vm_session_started_at
  stop      → closeVmSession() → emits cost events, clears vm_session_started_at
  start     → openVmSession() → sets vm_session_started_at (provisioned_at unchanged)
  auto-shutdown → closeVmSession() called from gpu-shutdown-checker worker
```

### AWS Lambda (Remotion)

The render worker captures the exact cost from the Remotion Lambda SDK:

```typescript
const exactLambdaCostUsd = progress.costs?.accruedSoFar ?? 0;
await emitCostEvent({ category: 'aws_lambda', service: 'aws', amountUsd: exactLambdaCostUsd, ... });
```

### Valyu Search & DeepResearch

- **Search API**: `numResults / 1000 × CPM_RATE` per call type. Recorded via `tracker.addValyuSearch()` inside `valyuSearch()`.
- **DeepResearch API**: Exact `cost` from the API response, captured in `getDeepResearchStatus()` when status = `'completed'`. Recorded via `tracker.addValyuDeepResearch(exactCost)`.

### Serper

Recorded via `tracker.addSerperSearch()`. Cost = `count × $0.0003/query`.

---

## CostTracker Integration

Workers that use `CostTracker` (all main pipeline workers) automatically record all LLM, Valyu, and Serper costs within their `tracker.run()` context. On `tracker.save(videoId)`:

1. LLM, Valyu, Serper events are batch-emitted to `cost_events`.
2. Raw data is also persisted to `video_projects.metadata.costData.stepN` (backward compatibility).

TTS and Lambda events are emitted directly from their respective workers (not via `CostTracker`) because they occur outside the standard LLM call chain.

---

## API Routes

| Route | Auth | Description |
|---|---|---|
| `GET /api/analytics/costs` | User | Period-filtered cost summary, breakdown, trend, per-video table, GCP widget |
| `GET /api/analytics/costs/monthly-summary` | User | Month aggregate + line items for payments import |
| `GET /api/admin/platform-costs` | Admin only | All-user aggregate + Hetzner/R2 costs + 6-month trend |
| `POST /api/admin/platform-costs` | Admin only | Save Hetzner/R2 monthly cost entry |

---

## UI Surfaces

### User: Analytics → Costs

- **Period toggle**: 7d / 30d / 90d / All time
- **KPI cards**: Total spend, avg cost/video, LLM %, historical VM cost
- **Pie chart**: Spend by category with color-coded legend
- **Bar chart**: Top 10 services/models by cost
- **GCP VM card**: Live session ticker (updates every 15s client-side), historical totals, SPOT estimate disclaimer
- **Stacked area chart**: Cost trend over time by category
- **Per-video table**: Cost breakdown sorted by most expensive

### Admin: Admin Panel → Platform Costs

- **KPI cards**: User API costs, Hetzner, R2, Grand total
- **Pie chart**: Platform cost mix (user API vs. infra)
- **Stacked bar chart**: 6-month trend (user costs + platform infra)
- **User cost table**: Searchable, sortable, exportable CSV
- **Platform Cost Entry form**: Hetzner monthly invoice + R2 + misc entry

### Payments → Auto-Tracked Costs Import

An expandable panel in `FinancialForm.tsx` fetches the current month's summary and provides a one-click "Import as Cost Items" button that appends each category as editable line items in the statement form.

---

## Security

- Users can only read their own rows via RLS (`auth.uid() = user_id`).
- Admin API routes are protected by `requireAdmin()` from `lib/utils/admin-auth.ts`.
- Cost events are written only via the `service_role` key from workers — no user-initiated write path exists.
- `admin_platform_costs` has no RLS — it is inaccessible to authenticated users directly; only admin API routes (which call service_role) can read or write it.

---

## Adding a New Cost Category

1. Add the new category to `CostCategory` union in `lib/costs/pricing.ts`.
2. Add a `CATEGORY_LABELS`, `CATEGORY_COLORS`, and `CATEGORY_ICONS` entry.
3. Call `emitCostEvent({ category: 'new_category', ... })` at the appropriate callsite.
4. The analytics API and UI will automatically include the new category (it's derived dynamically from the ledger).
