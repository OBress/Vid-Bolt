# Video Generation Effectiveness Report

Date: 2026-03-20

Scope: Review of Vid-Bolt's current video generation process across the main web workflow, the closed-loop orchestrator, manual/editor generation routes, the local GPU API, and supporting design docs.

Method: This report is based on code and documentation review, not on fresh end-to-end generation runs. The strongest evidence came from:

- `web/components/video-creation/VideoCreationWizard.tsx`
- `web/components/video-creation/steps/ProductionStep.tsx`
- `web/app/api/process/closed-loop/route.ts`
- `web/lib/queues/workers/orchestrator.ts`
- `web/lib/queues/workers/verifier.ts`
- `web/lib/services/scene-harmonizer.ts`
- `web/lib/services/pacing-editor.ts`
- `web/lib/services/frame-extraction.ts`
- `web/lib/services/manifest-builder.ts`
- `web/components/features/project/settings/VisualsTab.tsx`
- `web/components/features/project/settings/ScriptTab.tsx`
- `web/components/features/project/settings/VideoPreferencesPanel.tsx`
- `web/app/api/video-editor/generate/video/route.ts`
- `web/app/api/videos/[videoId]/generate/video/route.ts`
- `Vid-Bolt-GPU-API/app/routers/video_generation.py`
- `Vid-Bolt-GPU-API/app/routers/ltx2_generation.py`
- `Vid-Bolt-GPU-API/app/services/model_manager.py`
- `Vid-Bolt-GPU-API/app/services/job_manager.py`
- `Vid-Bolt-GPU-API/app/services/ltx2_generator.py`
- `docs/closed-loop-system-design.md`
- `docs/research-audit-report.md`

## Executive Summary

Vid-Bolt is effective at producing first-pass videos and keeping a long-running pipeline understandable. It is less effective at guaranteeing that the first-pass result is the right result, and it still gives users uneven control depending on which path they use.

The strongest path in the product is the closed-loop wizard pipeline:

- project-scoped creation flow
- layered `CreativeManifest`
- multi-phase orchestrator
- verification and retries
- clip trimming
- timeline assembly
- pacing review
- strong progress visibility and resume behavior

The weakest parts are the split generation surfaces around that pipeline:

- the "Video Studio" entry point is still a placeholder
- manual/editor generation uses different APIs and capabilities than the closed-loop path
- backend support for per-video overrides exists, but the main production UI does not appear to expose it
- some settings exist in UI/types but do not appear to affect the active workflow

The net result is a system with a strong technical core and above-average observability, but mixed user-facing coherence.

## Scorecard

These are qualitative scores from code inspection on a 1-5 scale.

| Dimension | Score | Assessment |
| --- | --- | --- |
| Output quality | 3.5/5 | Strong generation and orchestration foundation, but quality gates still fail open too often for video. |
| Customizability | 3.0/5 | Rich channel/project settings, but weak per-video pre-production control in the main flow. |
| Consistency | 3.0/5 | Manifest, GCM, harmonization, and FF2V help, but the system still relies heavily on prompting and lenient acceptance. |
| Reliability | 3.5/5 | Good tasking, retries, resume, cancel, and VRAM management; weaker on side routes and legacy API consistency. |
| Observability | 4.5/5 | One of the best parts of the system: progress, activity feed, pipeline graph, resumability, and task state are all strong. |
| UX coherence | 2.5/5 | The real workflow is good once entered, but entry points and control surfaces are fragmented. |
| Overall | 3.4/5 | Strong foundation, mixed productization. |

## What Exists Today

### 1. Main production flow

The real production workflow is not `web/app/command-center/media/video-studio/page.tsx`; that route is still a placeholder. The actual user journey lives under the project page and launches the five-step wizard in `web/components/video-creation/VideoCreationWizard.tsx`:

1. Outline
2. Script
3. Production
4. Editor
5. Export

This part of the product is thoughtfully built. The wizard has substantial resume logic, stage recovery, and editor rehydration, which makes long-running work much more resilient than a typical "fire and forget" media UI.

### 2. Closed-loop production path

The strongest implementation in the repo is the closed-loop route at `web/app/api/process/closed-loop/route.ts`.

That path:

- authenticates the user
- loads the video and project settings
- builds a three-layer `CreativeManifest` with `manifest-builder.ts`
- creates a task
- queues the orchestrator

The orchestrator in `web/lib/queues/workers/orchestrator.ts` is the real heart of the system. It runs a phased production pipeline:

- Phase I: TTS foundation
- Phase II: shot planning
- Phase III: asset retrieval and music
- Phase IV: image, image-edit, video, and motion-graphics production with verification
- Phase IV-B: clip trimming
- Phase V: auto-assembly
- Phase V-B: holistic pacing review

This is materially more advanced than a simple "prompt in, video out" flow.

### 3. Alternate and legacy generation paths

Vid-Bolt also exposes other generation paths outside the main closed-loop flow:

- editor/manual routes under `web/app/api/video-editor/generate/*`
- project-shot generation routes under `web/app/api/videos/[videoId]/generate/*`
- simplified trigger routes like `web/app/api/videos/[videoId]/trigger-media-gen/route.ts`

These paths are not equivalent.

The editor routes can route by provider and model, including local and Replicate options. The project-shot routes are simpler and more local-queue-centric. On the GPU side, there is also a split between:

- `POST /api/v1/video/generate` in `Vid-Bolt-GPU-API/app/routers/video_generation.py`
- `POST /api/v1/ltx2/generate` and `/api/v1/ltx2/interpolate` in `Vid-Bolt-GPU-API/app/routers/ltx2_generation.py`

This fragmentation is one of the main reasons the overall process feels uneven even though the core pipeline is strong.

## Effectiveness By Dimension

### Output Quality

#### What is working well

- The closed-loop path does real orchestration rather than isolated asset generation. It verifies, retries, trims, assembles, and then reviews pacing.
- The `CreativeManifest` gives downstream workers consistent context for style, pacing, aspect ratio, LoRA use, and creative direction.
- The verifier in `web/lib/queues/workers/verifier.ts` is more sophisticated than a basic pass/fail wrapper. It uses structured scoring, failure types, and meta-review for borderline cases.
- The orchestrator includes non-trivial salvage and retry logic instead of crashing the whole pipeline on imperfect generations.
- There is a real post-generation trim phase in `orchestrator.ts` and a holistic timeline pacing review in `pacing-editor.ts`.
- On the GPU side, LTX-2 is wrapped seriously: valid frame-count handling, crop/trim behavior, FP8 configuration, shared components, and concurrent generation support are all present in `Vid-Bolt-GPU-API/app/services/ltx2_generator.py`.

#### What is limiting quality

- The video verifier is intentionally lenient. In practice, it only wants to hard-fail catastrophically broken outputs like frozen, black, corrupted, or zero-motion clips. That protects throughput, but it also means mediocre clips can survive the loop.
- The orchestrator retries up to `MAX_VERIFY_ATTEMPTS = 3` and then performs best-fit salvage. This keeps the pipeline moving, but it means some quality problems become "accepted with flags" rather than truly fixed.
- Clip trimming and pacing review are both non-blocking. If they fail, the pipeline continues. That is operationally sensible, but it means these passes improve quality without guaranteeing it.
- The system still lacks stronger programmatic video quality checks at the generation boundary, especially for static-shot detection and motion adequacy.
- The design docs and research audit still call out some missing features that are now partially implemented, but the remaining issue is not the total absence of trim/pacing passes. The real issue is that those passes are advisory and fail open.

#### Assessment

Vid-Bolt is effective at generating usable first drafts and better than average at post-processing them, but it is still optimized more for "always finish" than for "only accept strong results." That is the right choice for throughput, but it caps quality reliability.

### Customizability

#### What is working well

Channel and project level customization are strong.

`web/components/features/project/settings/VisualsTab.tsx` exposes:

- image, image-edit, and video model selection
- local and Replicate model routing
- aspect ratio
- visual style
- lighting mood
- color palette
- LoRAs
- media weighting
- pacing preset
- motion-graphics theme
- master creative prompt

`web/components/features/project/settings/ScriptTab.tsx` exposes:

- POV
- narrator gender
- genre
- tone
- audience
- research depth
- writing model
- quality review model

At the architecture level, the backend also supports per-video overrides through `videoCreativeOverrides` and the `CreativeManifest` merge in `web/app/api/process/closed-loop/route.ts` and `web/lib/services/manifest-builder.ts`.

Shot-level manual editing also exists later in the flow through `KeyframeEditPopup.tsx` and `MediaEditModal.tsx`, including prompt, LoRA, seed, and aspect ratio controls.

#### What is limiting customizability

- The main production step in `web/components/video-creation/steps/ProductionStep.tsx` currently posts only `videoId` and `shutdownWhenDone`. It does not appear to send per-video creative overrides.
- `VideoPreferencesPanel.tsx` exists, but there are no usage references for it in the active web flow. That strongly suggests the per-video override architecture is only partially wired into the product.
- The main wizard's production step is intentionally one-button, which is great for speed but weak for advanced users who want to tune a single video before an expensive run.
- The manual shot controls are useful but still relatively shallow. They do not expose a rich set of video-specific controls like retry mode, verification strictness, motion strength, or conditioning strategy.
- Some settings appear to exist only in the settings layer. `autoIdeaVerification`, `autoScriptVerification`, and `autoExportToMedia` show up in UI and types, but I did not find active pipeline consumers for them in the web app.
- On the GPU side, there is a capability gap between the richer `ltx2` route and the simpler legacy `video/generate` route. The richer path supports `negative_prompt` and `enhance_prompt`; the simpler path does not.

#### Assessment

Customizability is strong at the channel-default level, moderate at the shot-edit level, and weaker than it should be at the single-video pre-production level. The architecture is ahead of the active UI here.

### Consistency

#### What is working well

- The three-layer `CreativeManifest` is exactly the right pattern for maintaining style continuity.
- The system has a real GCM and entity-aware prompting strategy.
- `scene-harmonizer.ts` exists to normalize scene/keyframe consistency before downstream video work.
- `frame-extraction.ts` implements `T2V` and `FF2V` logic, and the orchestrator uses extracted last frames when continuity should carry forward.
- The prompt layer is clearly designed to keep style and thematic continuity stable across shots.

#### What is limiting consistency

- Consistency is still enforced mostly through prompt context, verifier judgment, and occasional frame conditioning. There is no stronger persistent model-side memory or iterative learned state update after good shots.
- The system does not appear to implement adaptive retry escalation in the way the research audit recommends. It can select `FF2V`, but it does not fully treat retry strategy itself as a consistency tool.
- Because the video verifier is lenient, consistency failures that are not catastrophic can pass into the editor stage.
- Best-fit salvage is useful operationally, but it formalizes "acceptable drift with warning" as a normal pipeline outcome.
- The split between closed-loop generation, editor generation, and project-shot generation means users can get different behavior and capability depending on where they regenerate.

#### Assessment

Vid-Bolt has the right consistency architecture, but it is not yet strict enough to make consistency feel dependable in all paths. Intra-clip consistency is decent. Cross-shot consistency is still only moderate.

### Reliability, Observability, And Operational Maturity

#### What is working well

- The web workflow has strong task state, progress polling, resume logic, and cancellation behavior.
- `ProductionStep.tsx`, `PipelineGraph`, `ActivityFeed`, and `use-task-progress.ts` make the pipeline observable instead of opaque.
- Progress is monotonic, which prevents confusing regressions in the UI.
- The GPU API has a serious operational layer: VRAM modes, job bucketing, concurrency limits, timeouts, webhook delivery, and OOM cleanup all exist in `model_manager.py` and `job_manager.py`.
- LTX-2 video generation in dedicated mode can run multiple concurrent jobs, and the GPU service is clearly designed around realistic single-GPU constraints rather than idealized cloud assumptions.

#### What is limiting reliability

- The split routing model creates avoidable correctness and maintenance risk.
- The legacy `POST /api/v1/video/generate` route in the GPU API appears to call `JobManager.try_submit_job(...)` without the required `webhook_url` argument. If that path is still active, it is a likely bug, not just a design limitation.
- The editor route at `web/app/api/video-editor/generate/video/route.ts` still uses the simpler local video surface rather than the richer `ltx2` surface.
- Model mode switching is expensive. The code explicitly describes switching into video mode as taking around 2-3 minutes, which can hurt responsiveness if workloads bounce between media types.
- `web/app/api/videos/[videoId]/trigger-media-gen/route.ts` uses a service-role client and does not perform normal user authentication and ownership checks before acting. That is more of a correctness and product trust issue than a pure quality issue, but it is a real weakness in the surrounding process.

#### Assessment

The primary closed-loop workflow is fairly robust. The surrounding manual and legacy paths are where reliability becomes less convincing.

### UX Coherence And Product Fit

#### What is working well

- The guided wizard is a strong product surface once a user is in it.
- Resumability is much better than average for a long-running media workflow.
- The editor handoff makes sense and gives humans a final correction layer.

#### What is limiting UX coherence

- The nominal "Video Studio" page is still a placeholder, while the real workflow lives elsewhere.
- Users face different capability sets depending on whether they generate through the wizard, the editor, or per-shot routes.
- Per-video override architecture exists in backend code, but does not appear to be an active part of the main creation experience.
- Some settings likely do nothing from the user's perspective, which erodes trust.

#### Assessment

Vid-Bolt feels strongest as an internal, operator-friendly production pipeline. It feels less finished as a clean, unified product surface.

## Important Design And Implementation Gaps

### 1. The strongest path is not the only path

The closed-loop orchestrator is the best implementation in the repo, but the product still exposes weaker alternate paths. This lowers the perceived effectiveness of the system even if the core pipeline is strong.

### 2. UI, backend, and docs are not fully aligned

There are three recurring mismatches:

- Docs sometimes describe target-state capabilities rather than only shipped behavior.
- Backend capabilities exist that are not clearly exposed in the main UX.
- Some schemas imply more flexibility than the implementation actually supports.

The clearest example is keyframe interpolation: `Vid-Bolt-GPU-API/app/models/ltx2_generation.py` accepts up to 10 keyframes, while `app/services/ltx2_generator.py` only supports up to 2.

### 3. Quality control still fails open

Vid-Bolt does have verification, trim, pacing review, and salvage. The main issue is not that those systems are missing. The issue is that most of them are intentionally fail-open, which protects completion rate at the cost of stricter output quality.

## What Could Be Better

### Highest priority

1. Unify all video generation onto the strongest path.
   Move editor/manual/local video generation to the richer LTX-2 surface and reduce dependence on legacy routes.

2. Fully wire per-video overrides into the main wizard.
   The backend merge model is already there. The user should be able to customize one video without changing channel defaults and without waiting until the editor stage.

3. Tighten video quality enforcement.
   Add stronger motion/static detection, clearer thresholds for soft-fail vs hard-fail, and more visible handling of flagged salvage shots.

4. Make retry strategy smarter.
   Treat retry mode as a first-class tool for consistency, not just prompt revision. Adaptive escalation for entity and temporal failures would help materially.

5. Reduce split behavior across wizard, editor, and shot regeneration.
   Users should not get materially different model capability and quality behavior depending on entry point.

### Medium priority

6. Clean up dead or partially wired settings.
   Either connect them to live behavior or hide them.

7. Close the keyframe schema/implementation gap.
   Either support more than two keyframes for real or cap the public contract at two.

8. Improve explicit user control over video-specific generation.
   Useful controls would include negative prompt, prompt enhancement, motion intensity, conditioning preference, and consistency mode.

9. Refresh the docs to clearly distinguish "implemented now" from "target architecture".
   The current docs are valuable, but they mix current-state review with future-state design enough to confuse evaluation.

### Lower priority but worthwhile

10. Reduce VRAM mode-switch pain with smarter batching and workload grouping.

11. Normalize auth and ownership checks across all manual and trigger routes.

12. Consider stricter final-review gates for higher-value production modes.
   For example, offer a slower "quality-first" mode where trim and pacing review become blocking instead of advisory.

## Final Verdict

Vid-Bolt's video generation process is genuinely capable. The repo already contains the hard parts that many systems never get right:

- a real orchestrator
- a layered creative manifest
- entity-aware prompting
- verification and retries
- clip trimming
- pacing review
- strong task visibility
- realistic GPU resource management

That said, the process is more effective as a robust internal production engine than as a perfectly unified product experience.

The biggest truth about the current system is this:

Vid-Bolt is very good at getting a video pipeline to completion, but still only moderately good at guaranteeing consistently high-quality, precisely steered output across every path a user can take.

If the highest-priority issues are addressed, especially path unification, per-video override wiring, and stricter video quality enforcement, the system could move from "strong foundation with visible weak spots" to "serious production-grade AI video pipeline."
