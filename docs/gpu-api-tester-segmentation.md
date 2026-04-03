# GPU API Tester Segmentation Notes

The DevTools GPU API tester now follows the segmentation contract described in [`GPU-API.md`](../GPU-API.md).

## Key Rules

- Segmentation prompts are deterministic.
- The tester does not run prompt enhancement for image, video, or animated segmentation.
- Video segmentation exposes three mutually exclusive prompt modes:
  - `text_prompt`
  - `text_prompts`
  - `object_prompts`
- `point_prompts` and `box_prompts` are only available in the legacy single-`text_prompt` video mode.
- `include_tracking_metadata` is available for video `masks_json` output.
- Animated segmentation uses its own queue/worker path and supports `object_prompts`.
- The tester now exposes a segmentation capability directory in the UI so prompt modes, selectors, outputs, and operation categories are discoverable without reading raw payload docs.
- Point prompts, box prompts, and labeled-box prompts are editable with structured form controls instead of requiring raw JSON array entry.
- Animation-capable operations expose structured start/end controls for the documented numeric parameters, including custom zoom targets and pan offsets.

## Result Metadata Surfaced In The Tester

The segmentation result panel now shows available metadata returned by the GPU API, including:

- `model_version`
- `labels`
- `prompt_to_obj_ids`
- `object_id_to_prompt_label`
- `tracked_ids`
- `frame_count`
- `duration_seconds`
- `fps`
- `object_count`
- `boxes`
- `scores`
