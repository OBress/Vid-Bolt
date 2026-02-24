# Pipeline Debugger — Developer Guide

> **Location**: Admin Panel → Dev Tools → Pipeline Debugger  
> **Access**: Click the red "Pipeline Debugger" hero card at the top of the Dev Tools tab.  
> **Storage**: 100% localStorage — **no Supabase migration needed**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Mode 1: Inspect](#mode-1-inspect)
5. [Mode 2: Compare (A/B)](#mode-2-compare-ab)
6. [Mode 3: Replay (Breakpoints)](#mode-3-replay-breakpoints)
7. [Mode 4: Snapshots](#mode-4-snapshots)
8. [Right Panel Tools](#right-panel-tools)
9. [Use Cases & Workflows](#use-cases--workflows)
10. [File Reference](#file-reference)

---

## Overview

The Pipeline Debugger is a developer tool for inspecting, comparing, and debugging the 8-step video creation pipeline. It reads the `metadata` JSONB column on `video_projects` and provides deep visibility into every step.

### The 8 Pipeline Steps

| Step | Name              | What It Does                                            |
| ---- | ----------------- | ------------------------------------------------------- |
| 1    | **Outline**       | Research, scoping, spine generation, and asset registry |
| 2    | **Stock Media**   | Stock media search (Pixabay, Serper)                    |
| 3    | **Script**        | Full script writing with beat expansion                 |
| 4    | **Audio**         | Text-to-speech generation                               |
| 5    | **Shot Planning** | AV script / visual director — shot plan + image prompts |
| 6    | **Scene Review**  | AI image/video generation (GPU API)                     |
| 7    | **Editor**        | Edit Decision List (EDL) generation + video editor      |
| 8    | **Export**        | Remotion Lambda render + final export                   |

### Key Capabilities

- **Post-mortem inspection** of any video project's pipeline data
- **A/B comparison** of two video runs (or snapshots!) with structural diffs + metric deltas
- **Breakpoint system** for future live debugging integration
- **Full pipeline snapshots** — save an entire video's pipeline state and load it back as a virtual video
- **Quality scoring** with 5-dimension star ratings
- **Performance profiling** with cost estimates and step waterfall
- **Annotations** with threaded notes on any step

---

## Architecture

```
components/features/pipeline-debugger/
├── types/
│   └── pipeline-debugger.ts          # All TypeScript interfaces
├── utils/
│   ├── step-config.ts                # Step definitions, icons, colors
│   ├── pipeline-data-extractor.ts    # Video → structured step data
│   └── diff-utils.ts                 # Object/prompt/metric diffing
├── stores/
│   └── pipeline-debugger-store.ts    # Zustand state management
├── hooks/
│   └── use-snapshots.ts              # Snapshot CRUD (localStorage)
├── components/
│   ├── shared/                       # Reusable UI primitives
│   │   ├── JsonTreeViewer.tsx
│   │   ├── PipelineStatusBadge.tsx
│   │   ├── StepIcon.tsx
│   │   └── VideoProjectSelector.tsx
│   ├── pipeline-inspector/           # Inspect mode components
│   │   ├── PipelineTimeline.tsx
│   │   ├── StepInspectorPanel.tsx
│   │   ├── DataFlowViewer.tsx
│   │   └── MediaPreviewPanel.tsx
│   ├── snapshot-manager/
│   │   └── SnapshotManager.tsx
│   ├── run-comparator/
│   │   └── RunComparator.tsx
│   ├── replay-mode/
│   │   └── ReplayMode.tsx
│   └── quality/
│       ├── QualityScorer.tsx
│       ├── PerformanceProfiler.tsx
│       └── AnnotationSystem.tsx
└── PipelineDebugger.tsx              # Three-panel shell (resizable)
```

### Data Flow

```
video_projects (Supabase)
  └──> /api/videos/:videoId   (GET)
        └──> extractPipelineRun()   (pipeline-data-extractor.ts)
              └──> PipelineRun { steps: StepData[] }
                    └──> Inspector / Comparator / Snapshot views
```

### Storage

All debugger-specific data is stored in **localStorage**:

| Key                                | Contains                | Approx Size             |
| ---------------------------------- | ----------------------- | ----------------------- |
| `pipeline-debugger-snapshots`      | Full pipeline snapshots | ~100-150KB per snapshot |
| `pipeline-debugger-quality-scores` | Quality ratings         | ~1KB per score          |
| `pipeline-debugger-annotations`    | Threaded notes          | ~0.5KB per note         |

**10 snapshots ≈ 1-1.5MB** — well within localStorage's 5-10MB limit.

---

## Getting Started

1. Navigate to **Admin Panel** (sidebar → Admin)
2. Click the **Dev Tools** tab
3. Click the red **Pipeline Debugger** hero card
4. The debugger opens as a full-screen overlay with 4 mode tabs

### UI Layout (Resizable Panels)

```
┌──────────────────────────────────────────────────────┐
│ ← Pipeline Debugger   [Inspect][Compare][Replay][Snap]  [Select video ▾] │
├────────┬─────────────────────────────────────┬────────┤
│ Steps  │          Center Content              │ Right  │
│ (left  │◄──drag──►(mode-specific view)◄──drag──►Panel  │
│  bar)  │                                      │ (tabs) │
└────────┴─────────────────────────────────────┴────────┘
```

- **Left sidebar** (120-400px, draggable): 8 pipeline steps with color-coded status dots
- **Center** (flex): Mode-specific content
- **Right panel** (200-500px, draggable): 5 tabs — JSON, Media, Quality, Perf, Notes
- Drag the **thin red dividers** between panels to resize

---

## Mode 1: Inspect

**Purpose**: Post-mortem inspection of a completed (or in-progress) video project's pipeline data.

### How to Use

1. Select a video from the **"Select video..."** dropdown (top right)
2. The horizontal **Pipeline Timeline** appears showing all 8 steps with status
3. Click any step (sidebar or timeline) to inspect it
4. The **Step Inspector** panel shows 6 tabs:

| Tab         | Shows                             |
| ----------- | --------------------------------- |
| **Inputs**  | Data fed into this step           |
| **Outputs** | Data produced by this step        |
| **Config**  | Configuration used                |
| **Prompts** | System/user prompts sent to LLMs  |
| **Logs**    | Step-level error messages         |
| **Timing**  | Duration, queue wait, retry count |

**Status dots**: 🟢 complete · 🔴 error · 🟡 in-progress · ⚪ not reached

---

## Mode 2: Compare (A/B)

**Purpose**: Side-by-side comparison of two pipeline runs to understand how changes affect outputs.

### How to Use

1. Switch to **Compare** mode
2. Select **Run A** (base) and **Run B** (compare) — each side can load from:
   - A **live video** via the dropdown selector
   - A **saved snapshot** via the "From Snapshot" button (appears when snapshots exist)
3. Click **"Generate Comparison"**

### What You Get

- **Metric Delta Cards**: Steps completed, error count, media count, script word count — with trend arrows
- **Step-by-Step Diff**: Colored badges (`Config: 3`, `Outputs: 5`) showing field changes
- **Side-by-Side JSON**: Click any step for tabbed Inputs/Outputs/Config comparison
- **Change Summary**: Added (+), removed (−), changed (~) field names

### Snapshot Labels

When a snapshot is loaded, it shows a **[Snapshot]** label in the run summary so you know you're comparing against saved data.

---

## Mode 3: Replay (Breakpoints)

**Purpose**: Configure breakpoints for future live debugging of the video creation wizard.

### How to Use

1. Switch to **Replay** mode
2. **Toggle breakpoints** by clicking the circles next to each step
3. **Add conditions** by right-clicking a breakpoint (e.g., `outputs.shots.length < 10`)

### Breakpoint Types

| Type              | How to Set                     | Behavior                         |
| ----------------- | ------------------------------ | -------------------------------- |
| **Unconditional** | Left-click the step circle     | Always pauses                    |
| **Conditional**   | Right-click → enter expression | Pauses only if condition is true |

### Controls (When Paused)

- **Resume**: Continue pipeline execution
- **Skip**: Skip the current step and continue
- **Captured State**: View the full state at the breakpoint as JSON

> **Note**: Full wizard integration (actually pausing the live wizard) requires wiring into `VideoCreationWizard`'s `advanceToStep` logic — planned for a future update.

---

## Mode 4: Snapshots

**Purpose**: Save, load, and manage full pipeline states for reproducibility and regression testing.

### Key Concept

**Snapshots capture the entire PipelineRun** (all 8 steps' inputs, outputs, config, media, errors, timing) and can be **loaded back as virtual videos** into Inspect or Compare modes.

### How to Use

1. **Inspect a video** first (select it in Inspect mode)
2. Switch to **Snapshots** mode
3. Click **"Save Full Pipeline"** to snapshot the entire video's pipeline state
4. Give it a name, description, and tags

### Features

| Feature                     | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Save Full Pipeline**      | Captures all 8 steps as a single snapshot                                      |
| **Save Step**               | Captures only the currently selected step                                      |
| **Load as Video**           | Click ▶ on any full pipeline snapshot to load it into Inspect mode             |
| **From Snapshot (Compare)** | In Compare mode, click "From Snapshot" to use as Run A or B                    |
| **Search/Filter**           | Filter by step, tag, or text search                                            |
| **Tags**                    | Add/remove tags; presets: `baseline`, `known-good`, `regression`, `experiment` |
| **Export/Import**           | Download as `.json`, upload to import (IDs regenerated)                        |
| **Clear All**               | Delete all snapshots with confirmation dialog                                  |

### Storage Details

- Stored in **localStorage** — no database migration needed
- Each full pipeline snapshot is ~100-150KB (metadata only, media is URLs)
- 10 snapshots ≈ 1-1.5MB — well within the 5-10MB localStorage limit
- Use Export/Import to transfer between machines

---

## Right Panel Tools

The right panel has 5 tabs available regardless of which mode you're in:

### JSON Tab

Collapsible JSON tree view of the selected step's inputs, outputs, and config.

### Media Tab

Grid view of all media generated by the selected step. Click for lightbox/player.

### Quality Tab

Rate any step across 5 quality dimensions:

| Dimension            | What to Assess                            |
| -------------------- | ----------------------------------------- |
| **Prompt Adherence** | Does the output match what was requested? |
| **Visual Quality**   | Are generated images/videos high quality? |
| **Pacing**           | Is the content flow and rhythm good?      |
| **Coherence**        | Does everything logically connect?        |
| **Overall**          | General impression (required to submit)   |

Scores persist in localStorage with history per step/video.

### Perf Tab (Performance Profiler)

- **Summary cards**: Progress (X/8 steps), errors, media count, estimated cost
- **Step waterfall**: Visual bars showing completion status with duration
- **Cost breakdown**: Per-step estimated costs

| Step            | Service         | Est. Cost   |
| --------------- | --------------- | ----------- |
| 1. Outline      | Gemini API      | $0.020      |
| 2. Stock        | Pixabay/Serper  | $0.005      |
| 3. Script       | Gemini API      | $0.030      |
| 4. Audio        | TTS API         | $0.050      |
| 5. Shot Plan    | Gemini API      | $0.040      |
| 6. Scene Review | GPU API         | $0.500      |
| 7. Editor       | Gemini API      | $0.020      |
| 8. Export       | Remotion Lambda | $0.150      |
| **Total**       |                 | **~$0.815** |

### Notes Tab (Annotations)

Threaded notes on any step. Persist in localStorage.

---

## Use Cases & Workflows

### 1. Debug a Failed Video

1. Inspect mode → select the video → click the red step
2. Check **Logs** tab for errors, **Inputs** tab for malformed data
3. Add a **Note** documenting the issue

### 2. Compare Two Approaches

1. Create two videos with different configs (e.g., genre, style)
2. Compare mode → select both → Generate Comparison
3. Check metric deltas and step-by-step diffs
4. Rate both with the **Quality** scorer

### 3. Save a Known-Good Baseline

1. Inspect a successful video → Snapshots → **Save Full Pipeline**
2. Tag as `baseline` and `known-good`
3. **Export** for backup

### 4. Regression Test After Code Changes

1. Before: save a snapshot tagged `before-change`
2. After: create a new video with same input
3. Compare mode → load the **snapshot** as Run A, the **new video** as Run B
4. Check for regressions in script, shot plan, or media quality

### 5. Track Cost Per Video

1. Inspect mode → select video → **Perf** tab in right panel
2. View per-step cost breakdown and total estimate

### 6. Load an Old Snapshot for Re-inspection

1. Snapshots mode → find the snapshot → click ▶ **Load as Video**
2. Automatically switches to Inspect mode with the snapshot's data
3. Browse all 8 steps as if inspecting a live video

---

## File Reference

### Core Types (`types/pipeline-debugger.ts`)

| Type                 | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `PipelineStep`       | `1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7 \| 8`                                 |
| `StepData`           | Full step: inputs, outputs, config, prompts, media, errors, timing     |
| `PipelineRun`        | Video info + array of StepData                                         |
| `PipelineSnapshot`   | Saved state with `fullRun: PipelineRun \| null` for loadable snapshots |
| `Breakpoint`         | Breakpoint config (unconditional or conditional)                       |
| `QualityScore`       | Rating with dimension scores                                           |
| `PipelineAnnotation` | Threaded note on a step                                                |
| `RunComparison`      | Comparison result with step diffs and metric deltas                    |

### Key Functions

| Function                        | File                         | Purpose                         |
| ------------------------------- | ---------------------------- | ------------------------------- |
| `extractPipelineRun(video)`     | `pipeline-data-extractor.ts` | Video → PipelineRun             |
| `generateRunComparison(a, b)`   | `diff-utils.ts`              | Full A/B comparison             |
| `loadSnapshotAsRun(snapshot)`   | `pipeline-debugger-store.ts` | Load snapshot into Inspect      |
| `saveFullPipelineSnapshot(run)` | `use-snapshots.ts`           | Save entire run to localStorage |
