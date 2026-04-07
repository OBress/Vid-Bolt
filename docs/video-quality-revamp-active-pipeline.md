# Active Pipeline Quality Revamp

## Goal

Tighten the active closed-loop video pipeline so it makes better first choices and rejects obvious contract violations automatically, without turning the system into a hard-coded Julius Caesar fix.

## What Changed

### Prompt and style alignment

- Added shared style-signal helpers in `web/lib/services/style-signals.ts` to classify non-photorealistic and historical projects.
- Updated `web/lib/services/prompt-generator.ts` to:
  - inject style-guard guidance for stylized and historical projects
  - reframe media weighting and pacing as creative preferences instead of quotas
  - add camera-motion language and text-safety guidance
  - use style-aware default quality anchors instead of photoreal defaults
- Updated `web/lib/av-script/gpu-batch-generation.ts` so LTX prompt enrichment no longer forces photorealistic language onto clay, animated, illustrated, or historical projects.

### Routing and segmentation

- Updated `web/lib/av-script/scene-shot-planner.ts` to choose more intentional fallback camera motion instead of collapsing toward static.
- Updated `web/lib/services/production-lane-normalizer.ts` to auto-promote segmentation treatments for image shots that read like documentary detail, map, document, or evidence emphasis moments.

### Motion graphics safety

- Updated `web/lib/services/motion-graphics/template-lane.ts` so overlay-capable templates use transparent roots and contained panels in overlay mode, and resolve missing assets safely.
- Updated `web/lib/services/motion-graphics/pipeline-motion-graphics.ts` to:
  - apply overlay rules to any overlay-position shot
  - enforce copy safety for motion graphics
  - fail QC on opaque overlay roots and unresolved placeholder asset URLs
  - validate both template and freeform MG output through the same QC path

### Verifier and salvage

- Updated `web/lib/queues/workers/verifier.ts` with style-drift, historical-anachronism, overlay-opacity, and text-safety fail criteria.
- Updated `web/lib/queues/workers/orchestrator.ts` to pass `visualStyleTag` and richer creative context into verifier jobs.
- Updated `web/lib/services/best-fit-salvage.ts` so hard contract violations still force replacement even when one attempt has the “best” score.

### Edit assembly

- Updated `web/lib/services/edit-assembly/edit-assembly-prompts.ts` to:
  - promote duplicate prevention
  - expose an available-shot pool for self-checking
  - distinguish explicit `overlay_on_base` shots from standalone graphics
- Updated `web/lib/services/edit-assembly/edit-assembly-service.ts` to derive a minimal assembly placement decision:
  - `base_only`
  - `overlay_on_base`
  - `standalone_graphic`
- The fallback editor path now only creates overlay clips for explicit overlay-on-base shots.

## Operational Impact

- Stylized projects should stop drifting into photoreal output by default.
- Historical projects should fail faster on modern clothing, haircuts, maps, or UI leaking into the frame.
- Overlay motion graphics should stop blocking the entire screen when used as overlays.
- Broken placeholder assets and fake readable document paragraphs should now fail QC instead of silently shipping.
- Assembly should create fewer accidental duplicate overlays and same-shot reuse artifacts.

## Validation

- Typechecked successfully with:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --pretty false
```
