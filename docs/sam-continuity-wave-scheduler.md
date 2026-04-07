# SAM 3.1 + Continuity Wave Scheduler

## Purpose

This document captures the production rules for segmentation-aware shot routing
and long-form continuity batching in Phase IV.

The goals are:

- keep long videos out of per-shot `video -> image_edit -> video` mode ping-pong
- standardize SAM 3.1 on named `object_prompts`
- prevent non-MG still shots from shipping as stagnant final outputs
- use `last frame -> image edit -> next start frame` as the default continuity path

## Final Lanes

The planner/normalizer now rewrites shots into one of these practical final
lanes:

- `motiongraphic`
  Use for charts, maps, timelines, quote cards, documents, UI, persistent
  boards, and text-led explainers.
- `segment_animate`
  Use for still-led reveal, isolation, spotlight, annotation, or guided zoom.
- `ai_video`
  Use for normal cinematic scene motion.
- `segment_video_fx`
  Use after base video generation for tracked editorial effects.

`segment_mask_prep` is treated as an auxiliary prep stage, not a final viewer
lane. It may run before creative image editing or later compositing when masks
are useful.

## Segmentation Prompt Rules

- Prefer `object_prompts` over a generic `text_prompt` whenever more than one
  subject could plausibly match.
- `label` must be short, stable, unique, and `snake_case`.
- `text` should be concise, typically 2-8 words.
- For multiple people, describe only in this order as needed:
  role/name, left/right or foreground/background, distinctive clothing/color,
  action.

The shared TypeScript contract now preserves the broader SAM 3.1 request
surface, including:

- object labels and ids on operations
- prompt frame index and propagation direction
- confidence thresholds and frame/object limits
- richer animation config
- tracking metadata flags

## Continuity Strategy

Normal continuity no longer relies on interpolation planning.

The standard path is:

1. Generate wave N videos.
2. Extract parent last frames on CPU.
3. Batch continuity angle-change edits in one image-edit pass.
4. Generate wave N+1 videos using the edited start frames.

Continuity outputs are cached in metadata under `continuity_outputs` with:

- `parent_shot_index`
- `source_video_url`
- `extracted_frame_url`
- `edit_instruction`
- `edited_frame_url`
- `continuity_applied`
- `status` / `failure_reason`

If extraction or image editing fails, the shot falls back cleanly to fresh
video generation rather than pretending a video URL is a usable frame.

## Scheduler Behavior

Wave 0 uses the existing streaming verification path for the initial unlocked
video set.

Follow-up waves:

- batch continuity preparation per wave
- persist edited start frames back into `generated_images`
- generate only the wave’s shot subset via the selective `video-gen` path
- verify the resulting clips after that selective batch completes

This keeps dedicated VRAM modes as the default. `all` mode is not the
recommended long-form scheduler.

## Backend Capability Contract

The checked-in GPU backend now exposes `/api/v1/settings/capabilities` so the
web layer can explicitly treat dedicated-wave scheduling as the safe default.

Current checked-in capability assumptions:

- `segmentation_routes_enabled = false`
- `frame_extraction_route_enabled = false`
- `mixed_video_segmentation = false`
- `recommended_scheduler = "dedicated_waves"`
- `all_mode_recommended = false`

These flags should only change after the corresponding backend routes and
mixed-mode execution guarantees are actually implemented.
