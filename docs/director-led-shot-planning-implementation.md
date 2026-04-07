# Director-Led Shot Planning Implementation

## Purpose

This document describes the implementation that upgrades Vid-Bolt from prompt-led clip generation toward a more director-led pipeline. The goal is to make generated videos feel intentional, visually coherent, and format-flexible without hard-coding the system to a single channel style.

The implementation focuses on four areas:

1. richer planning contracts
2. continuity-aware orchestration
3. segmentation as a selective editorial tool
4. optional sequence preview before expensive downstream work

## Core Planning Contracts

The shared closed-loop types now support a sequence-first planning model in [`web/lib/types/closed-loop.ts`](../web/lib/types/closed-loop.ts).

Key additions:

- `VideoCreativeOverrides`
  - `formatProfile`
  - `continuityBias`
  - `segmentationMode`
  - `directingIntent`
- `ProductionControls`
  - `reviewMode: 'off' | 'sequence_preview'`
- `CreativeManifest`
  - `directing_intent`
  - `video_grammar_profile`
- `PlannedShot`
  - shot grammar fields such as `shot_role`, `framing`, `camera_angle`, `camera_motion`
  - continuity fields such as `continuity_level`, `anchor_strategy`, `bridge_subject`
  - editorial fields such as `entry_transition_intent`, `exit_transition_intent`, `visual_motif`, `trim_priority`
  - segmentation execution contract via `segmentation_treatment`
- `ShotPlan.metadata`
  - `sequence_plan`
  - `continuity_anchors`
  - `transition_palette`
  - `planner_scores`
  - `review_state`
  - `assembly_contract`

These additions are metadata-level contracts only. No new Supabase tables or columns were required for this iteration.

## Manifest And Prompting

The manifest builder in [`web/lib/services/manifest-builder.ts`](../web/lib/services/manifest-builder.ts) now resolves a `video_grammar_profile` from either:

- explicit per-video overrides
- channel defaults
- script context inference

That profile drives:

- transition palette
- shot vocabulary
- continuity bias
- segmentation preference

Scene decomposition and per-scene shot planning now consume this richer context through:

- [`web/lib/av-script/scene-decomposer.ts`](../web/lib/av-script/scene-decomposer.ts)
- [`web/lib/av-script/scene-shot-planner.ts`](../web/lib/av-script/scene-shot-planner.ts)
- [`web/lib/services/prompt-generator.ts`](../web/lib/services/prompt-generator.ts)

The shot planner can now explicitly request:

- still-image-led shots
- continuity-driven shots
- segmentation-led emphasis shots
- motivated transitions and bridge subjects

## Shot Plan Enrichment And Persistence

Shot enrichment in [`web/lib/services/shot-plan-enrichment.ts`](../web/lib/services/shot-plan-enrichment.ts) now emits planning artifacts that are persisted into `shot_plan.metadata`.

This includes:

- per-scene `sequence_plan`
- `continuity_anchors`
- `transition_palette`
- planner quality scores
- an `assembly_contract` used downstream by editorial assembly

The shot planner worker in [`web/lib/queues/workers/shot-planner.ts`](../web/lib/queues/workers/shot-planner.ts):

- normalizes new planning fields into strict shared types
- preserves backward-compatible `av_script_part1`
- uses `merge_video_metadata` for atomic JSONB persistence
- assigns safe defaults in all fallback paths

## Asset Retrieval And Continuity Handoff

The asset scout in [`web/lib/queues/workers/asset-scout.ts`](../web/lib/queues/workers/asset-scout.ts) now carries directing and segmentation hints into the resolved prompt and stored asset manifest.

The scene harmonizer in [`web/lib/services/scene-harmonizer.ts`](../web/lib/services/scene-harmonizer.ts) now prefers planner-emitted grouping over heuristic grouping when `scene_cluster_id` data exists.

Shot neighbor context in [`web/lib/services/shot-context.ts`](../web/lib/services/shot-context.ts) now carries motif, subject focus, and transition intent instead of only keyword continuity.

## Segmentation As An Editorial Lane

Segmentation is implemented as a selective execution path, not a blanket effect pass.

Execution lives in:

- [`web/lib/services/segmentation-shot-executor.ts`](../web/lib/services/segmentation-shot-executor.ts)
- [`web/lib/queues/workers/orchestrator.ts`](../web/lib/queues/workers/orchestrator.ts)

Supported editorial modes:

- `segment_animate`
  - turns a still image or stock photo into a designed emphasis shot
- `segment_video_fx`
  - applies tracked emphasis to an existing generated video

Current presets include:

- `focus_reveal`
- `detail_callout`
- `subject_isolation`
- `progressive_reveal`
- `tracked_annotation`
- `danger_emphasis`

These support documentary-style treatments such as:

- isolating a person while desaturating the background
- highlighting a character with outline, spotlight, glow, or bokeh
- guided push-ins on a subject or detail
- tracked annotations in motion

## GPU API Compliance

The segmentation executor follows the documented GPU API contract in [`GPU-API.md`](../GPU-API.md) and the tester behavior documented in [`docs/gpu-api-tester-segmentation.md`](./gpu-api-tester-segmentation.md).

Implementation notes:

- uses `callGpuAnimateSegment` for image-to-video segmentation animation
- uses `callGpuVideoSegment` for tracked video segmentation
- uses `waitForWebhookResult` for async completion, matching existing GPU API job patterns
- writes outputs through R2 presigned URLs generated by the existing storage helpers
- keeps segmentation prompt handling deterministic rather than running prompt enhancement

## Sequence Preview Review Gate

An optional review gate is now supported through `productionControls.reviewMode`.

Behavior:

1. `reviewMode = 'sequence_preview'`
2. orchestrator completes shot planning and any plan reflection
3. task stops before asset retrieval
4. `shot_plan.metadata.review_state` is marked pending
5. starting production again resumes from asset retrieval instead of rebuilding TTS and shot planning

Resume behavior is handled by:

- [`web/app/api/process/closed-loop/route.ts`](../web/app/api/process/closed-loop/route.ts)
- [`web/lib/queues/workers/orchestrator.ts`](../web/lib/queues/workers/orchestrator.ts)

The route detects a pending sequence preview and dispatches a resume job with `resumeFromPhase: 'asset_retrieval'`.

## UI And Debug Visibility

The production wizard now forwards per-video creative overrides and review controls through:

- [`web/components/video-creation/VideoCreationWizard.tsx`](../web/components/video-creation/VideoCreationWizard.tsx)
- [`web/components/video-creation/steps/ProductionStep.tsx`](../web/components/video-creation/steps/ProductionStep.tsx)

The pipeline debugger extractor now surfaces additional planning and production metadata such as:

- review state
- sequence plan counts
- continuity anchor counts
- transition palette
- assembly contract
- segmentation output counts

## Migration Notes

No Supabase migration was required for this implementation pass because:

- new data is stored in existing JSONB metadata
- `closed_loop_state` already exists
- `merge_video_metadata` already supports deep merge semantics

If future work adds first-class relational review queues, segmentation job history, or planner benchmarks, that should be handled through a dedicated migration.
