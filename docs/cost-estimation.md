# Cost Estimation — Methodology & Pricing

> **Last updated**: February 2026  
> **Location**: Pipeline Debugger → Right Panel → Perf Tab  
> **Implementation**: `components/features/pipeline-debugger/utils/cost-calculator.ts`

This document details how Vid-Bolt calculates per-video cost estimates. Costs are computed dynamically by analyzing the `metadata` column on `video_projects` and extracting actual API usage wherever available.

---

## Table of Contents

1. [Overview](#overview)
2. [Estimation Modes](#estimation-modes)
3. [Per-Service Pricing](#per-service-pricing)
4. [Per-Step Breakdown](#per-step-breakdown)
5. [Estimation Heuristics](#estimation-heuristics)
6. [Worker Instrumentation Architecture](#worker-instrumentation-architecture)
7. [Updating Prices](#updating-prices)
8. [Pricing Source References](#pricing-source-references)

---

## Overview

Every video passes through an 8-step pipeline. Each step consumes one or more paid APIs. The cost calculator computes a `VideoCostBreakdown` by summing `StepCostBreakdown` objects across all 8 steps.

```
Total Video Cost = Σ (Step 1..8 cost)
Step N cost = Σ (service call costs within step N)
```

Each line item includes:

- **Service name** — which API was called
- **Usage description** — tokens, characters, seconds, or search count
- **Cost** — dollar amount
- **Exact vs Estimated flag** — whether this was computed from tracked data or heuristic

---

## Estimation Modes

### Exact (⚡)

When workers record structured `costData` into `video_projects.metadata`, the calculator uses the exact numbers:

```json
{
  "costData": {
    "step1": {
      "llmCalls": [
        {
          "model": "google/gemini-3-flash-preview",
          "promptTokens": 1245,
          "completionTokens": 892
        },
        {
          "model": "google/gemini-3-flash-preview",
          "promptTokens": 2100,
          "completionTokens": 1560
        }
      ],
      "valyuSearches": 3,
      "valyuDeepResearches": 1
    },
    "step6": {
      "gpuJobs": [
        { "type": "image", "generationTimeSeconds": 12.5 },
        { "type": "video", "generationTimeSeconds": 45.2 }
      ],
      "totalGpuTimeSeconds": 234.7
    }
  }
}
```

### Estimated (≈)

For videos created before worker instrumentation, costs are estimated using heuristics derived from available metadata (script length, media count, step completion status, etc.). Each estimated value is flagged in the UI so developers know it's approximate.

---

## Per-Service Pricing

### 1. OpenRouter LLM (via Gemini)

All LLM calls route through OpenRouter. Cost = `(inputTokens / 1M × inputPrice) + (outputTokens / 1M × outputPrice)`.

| Model                           | Input (per 1M tokens) | Output (per 1M tokens) | Used In                      |
| ------------------------------- | --------------------- | ---------------------- | ---------------------------- |
| `google/gemini-3-flash-preview` | **$0.50**             | **$3.00**              | Steps 1, 2, 3, 5, 7          |
| `google/gemini-3-pro-preview`   | **$2.00**             | **$12.00**             | Step 3 (quality review only) |

**Source**: [OpenRouter Pricing](https://openrouter.ai/models)  
**Note**: OpenRouter does not mark up provider prices. These match Google's direct pricing.

#### Token Count Estimation (when exact data unavailable)

When `costData` is not available, we estimate tokens from prompt/response text lengths:

| Step         | Est. Input Tokens | Est. Output Tokens | Model       | Notes                                                |
| ------------ | ----------------- | ------------------ | ----------- | ---------------------------------------------------- |
| 1: Outline   | ~3,000            | ~4,000             | Flash       | Multiple calls: spine, outline, characters, settings |
| 3: Script    | ~8,000            | ~12,000            | Flash + Pro | Beat expansion (Flash) + quality review (Pro)        |
| 5: Shot Plan | ~5,000            | ~6,000             | Flash       | AV script generation                                 |
| 7: Editor    | ~4,000            | ~3,000             | Flash       | EDL generation                                       |

These estimates assume a typical 3-5 minute video. Longer/shorter videos scale roughly linearly with beat count.

---

### 2. Valyu Research API

Used in **Step 1 (Outline)** for topic research and fact-finding.

| API                    | Cost                   | Typical Usage Per Video |
| ---------------------- | ---------------------- | ----------------------- |
| **Valyu Search**       | **$0.10** per search   | 2-4 searches            |
| **Valyu DeepResearch** | **$0.10** per research | 0-1 researches          |

**Source**: [Valyu Pricing](https://docs.valyu.ai)

#### Estimation Heuristic

When `costData.step1.valyuSearches` is unavailable:

- Default estimate: **3 searches × $0.10 = $0.30**
- If `metadata.research_results` exists and contains results, count distinct queries

---

### 3. Serper (Google Image Search)

Used in **Steps 2 and 5** for finding reference images and stock imagery.

| Metric                           | Cost       |
| -------------------------------- | ---------- |
| **Per search credit**            | **$0.001** |
| Credits per search (≤10 results) | 1          |
| Credits per search (>10 results) | 2          |

**Source**: [Serper Pricing](https://serper.dev/pricing) (Starter tier: $50/50K credits = $0.001/credit)

#### Estimation Heuristic

When `costData.step2.serperSearches` is unavailable:

- Step 2: Count distinct stock media queries in metadata. Default estimate: **5 searches**
- Step 5: Count shot plan items needing reference images. Default estimate: **3 searches**

---

### 4. Pixabay (Stock Video/Images)

Used in **Step 2** alongside Serper.

| Cost     | Notes                             |
| -------- | --------------------------------- |
| **Free** | Pixabay API has no per-query cost |

No cost tracking needed.

---

### 5. GPU VM (Image & Video Generation)

Used in **Step 6 (Scene Review)** for AI image generation (Z-Image Turbo), video generation (LTX-2), music (ACE-Step), and sound effects.

| Metric             | Cost                          |
| ------------------ | ----------------------------- |
| **VM hourly rate** | **$1.80/hr** ($0.0005/second) |

**Formula**: `totalGpuTimeSeconds / 3600 × $1.80`

The GPU API returns `generation_time` (in seconds) for every completed job. This is the actual GPU compute time, not wall-clock time.

**Source**: GCP g2-standard-8 with L4 GPU pricing (your `provision.ts` configuration)

#### Estimation Heuristic

When exact `generation_time` per job isn't aggregated:

- Count completed media items from `metadata.generatedMedia`
- Estimate: **~12s per image, ~45s per video, ~30s per music clip, ~8s per SFX**
- Fallback: **~200 seconds total** for a typical video with 10-15 images + 2-3 videos

---

### 6. Inworld TTS (Text-to-Speech)

Used in **Step 4 (Audio)** for narration generation.

| Model                      | Cost (per 1M chars) | Cost per minute | Notes                       |
| -------------------------- | ------------------- | --------------- | --------------------------- |
| `inworld-tts-1.5-max`      | **$10.00**          | ~$0.01/min      | Default model, best quality |
| `inworld-tts-1.5-max-mini` | **$5.00**           | ~$0.005/min     | Low-latency variant         |

**Formula**: `scriptCharCount / 1,000,000 × $10.00` (or $5.00 for Mini)

**Source**: [Inworld AI TTS Pricing](https://inworld.ai/pricing)

#### Estimation Heuristic

- Read `script_content` from `video_projects` → use `script_content.length`
- If `script_content` is null, estimate from beat count: **~150 chars per beat × beat count**
- Assumes Max model unless metadata indicates otherwise

---

### 7. Remotion Lambda (Video Rendering)

Used in **Step 8 (Export)** for final video composition and rendering.

| Metric                           | Est. Cost  |
| -------------------------------- | ---------- |
| **Per minute of rendered video** | **~$0.02** |

This is an approximation based on AWS Lambda pricing with Remotion's default config:

- 2048 MB RAM, 10 GB disk, `us-east-1`
- Typical 3-min video render ≈ $0.06

**Source**: [Remotion Lambda Pricing](https://remotion.dev/docs/lambda/estimatePrice)

#### Estimation Heuristic

When render duration isn't tracked:

- If `metadata.render_duration_seconds` exists → use it
- Otherwise, estimate from video duration: **render time ≈ 2× video duration** for typical complexity
- Default: **3 minutes rendered × $0.02 = $0.06**

---

## Per-Step Breakdown

| Step            | Services                  | Typical Cost Range | Primary Cost Driver                    |
| --------------- | ------------------------- | ------------------ | -------------------------------------- |
| 1: Outline      | OpenRouter Flash + Valyu  | $0.30 – $0.50      | Valyu research count                   |
| 2: Stock Media  | Serper + Pixabay (free)   | $0.005 – $0.015    | Number of search queries               |
| 3: Script       | OpenRouter Flash + Pro    | $0.03 – $0.10      | Token count (scales with video length) |
| 4: Audio        | Inworld TTS               | $0.01 – $0.05      | Script character count                 |
| 5: Shot Plan    | OpenRouter Flash + Serper | $0.01 – $0.05      | Shot count + reference image searches  |
| 6: Scene Review | GPU VM                    | $0.10 – $1.00+     | Number and type of generated media     |
| 7: Editor       | OpenRouter Flash          | $0.01 – $0.03      | EDL complexity                         |
| 8: Export       | Remotion Lambda           | $0.02 – $0.10      | Video duration and complexity          |
| **Total**       |                           | **$0.50 – $1.85**  |                                        |

> [!NOTE]
> GPU VM cost (Step 6) is by far the largest variable. A video with 20 images + 5 videos can cost 3-4× more than one with 8 images and 0 videos.

---

## Estimation Heuristics

For videos without exact `costData`, the calculator applies these ordered strategies:

1. **Check `costData`** in metadata → use exact values if present
2. **Derive from outputs** → count media items, measure script length, count search queries from metadata
3. **Use step-completion heuristics** → if a step is complete but no output data is available, use the median estimate for that step
4. **Mark as "Not reached"** → if step status is `pending` or `not-started`, cost = $0.00

Each line item in the UI is tagged:

- **⚡ Exact** — computed from tracked API usage data
- **≈ Estimated** — computed from heuristic based on available metadata
- **— N/A** — step not yet executed

---

## Worker Instrumentation Architecture

### CostTracker Utility

**File**: `lib/queues/cost-tracker.ts`

Each pipeline worker creates a `CostTracker` instance at the start of its processing. The tracker accumulates usage data throughout the worker's lifecycle and persists it via `merge_video_metadata` RPC at the end.

```typescript
const costTracker = new CostTracker(stepNumber); // e.g. new CostTracker(1) for outline

const result = await costTracker.run(async () => {
  // ... worker logic here ...
  // All LLM calls are auto-captured via AsyncLocalStorage
});

await costTracker.save(videoId); // Persists to metadata.costData.stepN
```

### Auto-LLM Tracking via AsyncLocalStorage

**File**: `lib/ai/openrouter.ts` (3-line hook at ~L247)

A hook in `callOpenRouter()` checks for an active `CostTracker` in the current async context. When found, it automatically records the model, prompt tokens, and completion tokens — **zero changes needed** in sub-modules like research, scoping, beat expansion, etc.

```
Worker                    CostTracker              callOpenRouter
  │                          │                          │
  ├── costTracker.run() ────►│ sets AsyncLocalStorage   │
  │                          │                          │
  ├── calls generateText() ──┼──────────────────────────►│
  │                          │                          │
  │                          │◄── auto-records usage ───┤
  │                          │   (model, tokens)        │
  ├── costTracker.save() ───►│                          │
  │                          │── merge_video_metadata ──►│ DB
```

### Per-Worker Tracking

| Worker               | Step | CostTracker Method           | What's Recorded                       |
| -------------------- | ---- | ---------------------------- | ------------------------------------- |
| `outline.ts`         | 1    | `run()` + `addValyuSearch()` | LLM tokens (auto), Valyu search count |
| `stock-media.ts`     | 2    | `addSerperSearch()`          | Serper image search count             |
| `writing.ts`         | 3    | `run()`                      | LLM tokens (auto)                     |
| `audio.ts`           | 4    | `setTtsUsage(chars, model)`  | TTS character count, voice model      |
| `av-script.ts`       | 5    | `run()`                      | LLM tokens (auto)                     |
| `visual-director.ts` | 6    | `run()` + `addGpuTime()`     | LLM tokens (auto), GPU seconds        |
| `edit-assembly.ts`   | 7    | `run()`                      | LLM tokens (auto)                     |
| `render.ts`          | 8    | `setRenderDuration(mins)`    | Render duration in minutes            |

### Data Storage Format

Cost data is deep-merged into `video_projects.metadata.costData` using the `merge_video_metadata` RPC:

```json
{
  "costData": {
    "step1": {
      "llmCalls": [
        { "model": "google/gemini-3-flash-preview", "promptTokens": 1245, "completionTokens": 892 }
      ],
      "valyuSearches": 3
    },
    "step3": {
      "llmCalls": [
        { "model": "google/gemini-3-flash-preview", "promptTokens": 8100, "completionTokens": 11200 }
      ]
    },
    "step4": {
      "ttsCharacters": 4500,
      "ttsModel": "inworld-tts-1.5-max"
    },
    "step6": {
      "llmCalls": [...],
      "totalGpuTimeSeconds": 234.7
    }
  }
}
```

### Fail-Safe Design

- All `costTracker.save()` calls are wrapped in try/catch — a save failure **never** breaks the pipeline
- Workers save partial cost data even on job failure (in the `catch` block)
- The `CostTracker.getActive()` static method returns `undefined` when no tracker is active, so the OpenRouter hook is a no-op when called outside a worker context

---

## Updating Prices

When API pricing changes, update the constants in `cost-calculator.ts`:

```typescript
// ---- PRICING CONSTANTS ----
// Last verified: February 2026

export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    "google/gemini-3-flash-preview": { input: 0.5, output: 3.0 },
    "google/gemini-3-pro-preview": { input: 2.0, output: 12.0 },
  };

export const VALYU_COST_PER_SEARCH = 0.1; // $/search
export const SERPER_COST_PER_CREDIT = 0.001; // $/credit
export const GPU_VM_COST_PER_HOUR = 1.8; // $/hr (GCP g2-standard-8 + L4)
export const INWORLD_TTS_MAX_PER_MILLION = 10.0; // $/1M chars
export const INWORLD_TTS_MINI_PER_MILLION = 5.0; // $/1M chars
export const REMOTION_COST_PER_MINUTE = 0.02; // $/min rendered
```

---

## Pricing Source References

| Service             | Pricing Page                                                                           | Last Verified |
| ------------------- | -------------------------------------------------------------------------------------- | ------------- |
| OpenRouter (Gemini) | [openrouter.ai/models](https://openrouter.ai/models)                                   | Feb 2026      |
| Valyu               | [docs.valyu.ai](https://docs.valyu.ai)                                                 | Feb 2026      |
| Serper              | [serper.dev/pricing](https://serper.dev/pricing)                                       | Feb 2026      |
| Inworld TTS         | [inworld.ai/pricing](https://inworld.ai/pricing)                                       | Feb 2026      |
| GCP g2-standard-8   | [cloud.google.com/compute/gpus-pricing](https://cloud.google.com/compute/gpus-pricing) | Feb 2026      |
| Remotion Lambda     | [remotion.dev/docs/lambda](https://remotion.dev/docs/lambda/estimatePrice)             | Feb 2026      |
| Pixabay             | [pixabay.com/api](https://pixabay.com/api/docs/)                                       | Free          |
