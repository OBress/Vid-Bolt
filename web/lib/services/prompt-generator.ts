/**
 * Dynamic Prompt Generator
 * ============================================================================
 * Generates tailored system prompts for each downstream worker by merging
 * the user's system prompt with the video's Creative Manifest.
 *
 * This is the "hiring optimized workers" concept from the design doc (§3).
 * The Orchestrator calls this once at the start of each video to produce
 * per-worker instructions that are injected as system prompts.
 *
 * Enhanced with:
 * - Creative Direction injection (channel + per-video prompts)
 * - LoRA context for image/video workers
 * - MG Channel Theme System (exact font, colors, border style)
 * - Intentionality rules for shot planning
 * - Per-worker prompt overrides from user settings
 */

import type { CreativeManifest, GCMEntity, WorkerPrompts } from '@/lib/types/closed-loop';
import {
  getDefaultQualityAnchorsForStyle,
  getStyleSignals,
} from '@/lib/services/style-signals';

// ============================================================================
// SHARED BUILDERS
// ============================================================================

/**
 * Build the creative direction block injected into all worker prompts.
 * Merges channel-level master prompt and video-specific prompt.
 */
function buildCreativeDirectionBlock(manifest: CreativeManifest): string {
  const parts: string[] = [];

  if (manifest.master_creative_prompt) {
    parts.push(`CHANNEL CREATIVE DIRECTION:\n${manifest.master_creative_prompt}`);
  }
  if (manifest.video_creative_prompt) {
    parts.push(`VIDEO-SPECIFIC DIRECTION:\n${manifest.video_creative_prompt}`);
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/**
 * Build the LoRA context block for image/video workers.
 */
function buildLoraBlock(manifest: CreativeManifest): string {
  if (!manifest.lora) return '';
  let block = `\nLORA ACTIVE: Apply "${manifest.lora.name}" at strength ${manifest.lora.weight}. This LoRA defines the visual style for all generated images.`;
  if (manifest.lora.trigger_words) {
    block += `\nLORA TRIGGER WORDS: You MUST include the following trigger words in every image prompt: "${manifest.lora.trigger_words}". Prepend them to the beginning of each image generation prompt.`;
  }
  return block;
}

/**
 * Build the script context block for content-aware prompt generation.
 * Injects genre, tone, audience, POV, and content niche when available.
 */
function buildScriptContextBlock(manifest: CreativeManifest): string {
  const ctx = manifest.script_context;
  if (!ctx) return '';

  const parts: string[] = [];
  if (ctx.genre) parts.push(`CONTENT GENRE: ${ctx.genre}`);
  if (ctx.tone_style) parts.push(`TONE/STYLE: ${ctx.tone_style}`);
  if (ctx.target_audience) parts.push(`TARGET AUDIENCE: ${ctx.target_audience}`);
  if (ctx.pov) parts.push(`NARRATION POV: ${ctx.pov} person`);
  if (ctx.content_niche) parts.push(`CONTENT NICHE: ${ctx.content_niche}`);

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

/**
 * Inject per-worker prompt override if configured.
 */
function getWorkerOverride(manifest: CreativeManifest, workerKey: string): string {
  const override = manifest.worker_prompt_overrides?.[workerKey];
  if (!override) return '';
  return `\n\nADDITIONAL USER INSTRUCTIONS:\n${override}`;
}

/**
 * Detect cinematic/dramatic intent from manifest signals.
 * Used to calibrate how aggressively MG use is discouraged.
 */
function detectCinematicIntent(manifest: CreativeManifest): 'cinematic' | 'explainer' | 'mixed' {
  const corpus = [
    manifest.style.visual_style,
    manifest.directing_intent,
    manifest.master_creative_prompt,
    manifest.video_creative_prompt,
    manifest.script_context?.genre,
    manifest.script_context?.tone_style,
    manifest.video_grammar_profile?.format_profile,
  ].filter(Boolean).join(' ').toLowerCase();

  const cinematicSignals = /\b(cinematic|documentary|dramatic|narrative|film|movie|thriller|historical|action|true crime|story|epic|drama|short film|trailer|3d render|blender|cgi)\b/i.test(corpus);
  const explainerSignals = /\b(explainer|tutorial|educational|how.?to|explainer video|lesson|course|training|infographic|presentation|breakdown|guide|overview)\b/i.test(corpus);

  if (cinematicSignals && !explainerSignals) return 'cinematic';
  if (explainerSignals && !cinematicSignals) return 'explainer';
  return 'mixed';
}

/**
 * Build context-sensitive motion graphics decision guidance.
 * Translates the user's creative manifest into actionable principles
 * for when MG is and isn't the right tool — without any hardcoded quotas.
 */
function buildMgDecisionFramework(manifest: CreativeManifest): string {
  const intent = detectCinematicIntent(manifest);
  const mgWeight = manifest.media_weighting.motion_graphics;

  const parts: string[] = [];
  parts.push(`\n═══ MOTION GRAPHIC DECISION FRAMEWORK ═══`);
  parts.push(`Before choosing motiongraphic for any shot, ask these questions in order:
  1. Could a compelling VIDEO communicate this moment better? → If yes: use video.
  2. Is this purely informational — a stat, a date, a key term, evidence, a map? → MG is valid.
  3. Does the narration describe ACTION, a PERSON, a LOCATION, or an EVENT? → Use video, not MG.
  4. Would a viewer watching a professional edit expect footage or a graphic here? → Match that expectation.
  5. Would a back-to-back MG shot make the edit feel like a slideshow? → If yes: use video.

MG is a TOOL for information design — not a substitute for cinematic footage.`);

  if (intent === 'cinematic') {
    parts.push(`
CINEMATIC PROJECT — STRICT MG DISCIPLINE:
This project has a cinematic/dramatic creative direction. In this context:
- Motion graphics ONLY belong as: lower-thirds, key statistics, timeline markers, evidence callouts, location cards, quote cards, map overlays
- Motion graphics DO NOT belong on: establishing shots, character scenes, action sequences, emotional beats, reveal moments, any beat where footage would be more impactful
- If you're considering MG for an establishing or dramatic moment, stop — use video or a segmentation-treated image instead
- One or two well-placed MG shots per minute is the right cadence; more than that starts to feel like an explainer video, not a film
- The ${mgWeight <= 0.15 ? 'low' : mgWeight <= 0.3 ? 'moderate' : 'high'} motion graphics preference signal for this project means: use MG ${mgWeight <= 0.15 ? 'sparingly — only when no visual alternative exists' : mgWeight <= 0.3 ? 'selectively — only when the information genuinely requires a designed callout' : 'when it clearly improves information clarity or emphasis'}`);
  } else if (intent === 'explainer') {
    parts.push(`
EXPLAINER PROJECT — MG AS PRIMARY TOOL:
This project has an educational/explainer creative direction. In this context:
- Motion graphics are appropriate whenever they make information clearer or more memorable
- Even in explainer videos: if a concept can be shown with real-world footage plus an MG overlay, that is stronger than MG alone
- Avoid making the video feel like a static presentation — vary between footage, MG overlays, and pure MG shots
- The ${mgWeight <= 0.15 ? 'low' : mgWeight <= 0.3 ? 'moderate' : 'high'} motion graphics preference signal means: aim for roughly ${mgWeight <= 0.15 ? '1 in 6' : mgWeight <= 0.3 ? '1 in 4' : '1 in 2'} shots being MG-led`);
  } else {
    parts.push(`
MIXED PROJECT — CONTEXTUAL MG USE:
This project blends cinematic and informational elements. Apply MG judgment shot-by-shot:
- For dramatic/narrative beats: prefer video, treat MG as an annotation layer
- For information-heavy beats: MG is appropriate, especially for stats, data, or key terms
- The media preference signal (motion_graphics: ${mgWeight.toFixed(1)}) is a taste guide — follow the narrative beat, not the number`);
  }

  return parts.join('\n');
}

function buildStyleGuardBlock(manifest: CreativeManifest): string {
  const signals = getStyleSignals(
    manifest.style.visual_style,
    manifest.master_creative_prompt,
    manifest.video_creative_prompt,
    manifest.script_context?.genre,
    manifest.directing_intent,
  );
  const parts: string[] = [];

  if (signals.nonPhotorealistic) {
    parts.push(`STYLE CONTEXT — NON-PHOTOREALISTIC PROJECT:
The declared visual style is an artistic world, not a photoreal world. Every image and video must stay inside that world.
Do NOT drift into realistic skin, generic live-action portraiture, or mismatched photographic aesthetics.
Favor stylized materials, handcrafted texture cues, and cohesive art direction over realism.`);
  }

  if (signals.historical) {
    parts.push(`HISTORICAL PERIOD CONTEXT:
The declared period defines the visual world. Props, architecture, clothing, hair, and graphic language must plausibly belong to that era.
Avoid anachronisms such as modern suits, modern haircuts, digital UI, contemporary signage, or modern maps unless the prompt explicitly calls for a contrast.`);
  }

  return parts.length > 0 ? `\n${parts.join('\n\n')}` : '';
}

function describePreferenceWeight(value: number): 'high' | 'moderate' | 'low' {
  if (value >= 0.4) return 'high';
  if (value >= 0.2) return 'moderate';
  return 'low';
}

function describeCadence(value: number): string {
  if (value >= 0.4) return 'frequently when the moment benefits from designed information';
  if (value >= 0.2) return 'selectively when clarity or emphasis improves';
  return 'sparingly and only when the beat truly calls for it';
}

function buildCreativePreferencesBlock(manifest: CreativeManifest): string {
  const grammar = manifest.video_grammar_profile;
  const intent = detectCinematicIntent(manifest);

  // Context-sensitive note that interprets what the MG weight MEANS for this specific style
  const mgInterpretation = intent === 'cinematic'
    ? `For this cinematic/dramatic project, "${describePreferenceWeight(manifest.media_weighting.motion_graphics)}" MG use means: reserve MG for designed callouts and data moments only — not for establishing, action, or emotional beats.`
    : intent === 'explainer'
    ? `For this educational/explainer project, "${describePreferenceWeight(manifest.media_weighting.motion_graphics)}" MG use means: MG is a primary tool — use it when it makes information clearer or more memorable.`
    : `For this mixed-format project, apply MG contextually — prefer footage for narrative beats, MG for information-dense beats.`;

  const documentaryMgException = (manifest.video_grammar_profile?.format_profile === 'documentary' || intent === 'explainer')
    ? `
\u2550\u2550\u2550 DOCUMENTARY EXCEPTION \u2014 HISTORICAL CONTEXT SCENES \u2550\u2550\u2550
The media preference above applies to ACTION, EMOTIONAL, and CINEMATIC scenes.
For scenes covering HISTORICAL BACKGROUND, BIOGRAPHICAL CONTEXT, POLITICAL ANALYSIS,
or any scene that explains "how/why this happened" \u2014 apply a HIGHER MG ratio.
Target 55-70% of shots in these scenes as motion graphics. This is NOT over-indexing.
In historical/analytical scenes, the MG IS the content:
  \u2713 Every named character's first analytical introduction \u2192 character_dossier
  \u2713 Every geographic event or military campaign \u2192 map_focus / territory_map
  \u2713 Every political claim or irony \u2192 slap_annotation or evidence_board
  \u2713 Every multi-year conflict \u2192 territory_map (not route_trace)
  \u2713 Every timeline of events \u2192 timeline board
Do NOT let narration carry what a well-designed graphic can prove more powerfully.`
    : '';

  return `CREATIVE PREFERENCES (signals from the user's style choices — not quotas to fill):
The user's media preference leans toward:
- AI video: ${describePreferenceWeight(manifest.media_weighting.ai_video)} — use dynamic motion when the moment needs action or world-building
- Motion graphics: ${describePreferenceWeight(manifest.media_weighting.motion_graphics)} — use overlays, maps, explainers, and callouts ${describeCadence(manifest.media_weighting.motion_graphics)}
- Stock footage: ${describePreferenceWeight(manifest.media_weighting.stock_footage)} — use real-world footage when it materially improves credibility or specificity
- AI image stills: ${describePreferenceWeight(manifest.media_weighting.ai_image_static)} — use as source material for segmentation, image edits, or editorial camera movement rather than dead final stills
These preferences describe taste. They do NOT prescribe quotas.
\u2192 ${mgInterpretation}
${documentaryMgException}

PACING PREFERENCES:
- Hook: open strong within roughly the first ${manifest.pacing_rules.hook_duration_seconds}s.
- Avoid extended static holds — if a beat starts from a still, plan motion or segmentation emphasis intentionally.
- Vary rhythm based on narrative beat instead of mechanically alternating shot types.

VIDEO GRAMMAR PROFILE:
- Format profile: ${grammar?.format_profile || 'auto'}
- Continuity bias: ${grammar?.continuity_bias || 'balanced'}
- Segmentation mode: ${grammar?.segmentation_mode || 'auto'}
- Annotation preference: ${grammar?.annotation_preference || 'selective'}
${manifest.directing_intent ? `- Directing intent: ${manifest.directing_intent}` : ''}
${buildSegmentationColorBlock(manifest.style.color_palette)}`;
}

// ============================================================================
// SEGMENTATION COLOR HELPERS
// ============================================================================

/**
 * Convert a hex color string to an [R, G, B] array (0–255).
 * Returns null if the hex is malformed.
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace(/^#/, '').trim();
  if (cleaned.length !== 6) return null;
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return null;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Calculate perceived luminance (0-1) of an RGB triple.
 * Uses ITU-R BT.601 weights.
 */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Build a CHANNEL SEGMENTATION COLORS block from the channel's color_palette.
 * Converts hex colors to pre-labeled RGB arrays the LLM can paste directly
 * into operations.color fields — making all segmentation effects channel-specific.
 */
function buildSegmentationColorBlock(palette: string[]): string {
  const valid = palette
    .map(hex => ({ hex, rgb: hexToRgb(hex) }))
    .filter((entry): entry is { hex: string; rgb: [number, number, number] } => entry.rgb !== null);

  if (valid.length === 0) return '';

  // Sort by luminance descending (brightest = most visible accent color first)
  const sorted = [...valid].sort((a, b) =>
    luminance(...b.rgb) - luminance(...a.rgb)
  );

  // Assign semantic labels based on luminance rank
  const LABELS = ['primary_accent', 'secondary_accent', 'dark_base', 'earth_tone', 'extra_1', 'extra_2'];
  const labeled = sorted.map((entry, i) => ({
    label: LABELS[i] ?? `color_${i + 1}`,
    hex: entry.hex,
    rgb: entry.rgb,
    lum: luminance(...entry.rgb),
  }));

  const lines = labeled.map(c =>
    `  ${c.label.padEnd(18)} ${c.hex}  →  [${c.rgb.join(', ')}]  (${c.lum < 0.3 ? 'dark — background/shadow' : c.lum > 0.6 ? 'bright — highlight/glow' : 'mid — overlay/grade'})`
  );

  return `\n
CHANNEL SEGMENTATION COLORS — USE THESE IN operations.color FIELDS (not generic colors):
These are derived from the channel's brand palette. Use them to keep segmentation effects
visually consistent with the channel's identity across all shot types and genres.
${lines.join('\n')}

SEGMENTATION EFFECT COLOR GUIDE:
- glow / outline / spotlight on subject  → use primary_accent RGB
- color_overlay or duotone on background → use dark_base RGB at low opacity
- color_grade to warm/cool a scene       → shift toward primary_accent or secondary_accent hue
- spotlight fill light color             → use primary_accent at 0.4–0.7 strength
- If primary_accent is dark (lum < 0.3), use secondary_accent for highlight operations instead
- NEVER use plain [255,255,255] white or [0,0,0] black unless the palette itself is monochrome`;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

/**
 * Build the Shot Planner's system prompt.
 */
function buildShotPlannerPrompt(
  userPrompt: string,
  manifest: CreativeManifest,
  entities: GCMEntity[]
): string {
  const entityList = entities.length > 0
    ? `\n\nKnown entities (reference for entity_refs tagging):\n${entities.map(e => `- ${e.name} (${e.entity_type}, ID: ${e.entity_id}): ${e.text_description}`).join('\n')}`
    : '';

  return `You are an expert shot planner for video production. Your job is to analyze a script with word-level TTS timestamps and produce a structured shot plan.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}
${manifest.style.color_palette.length > 0 ? `COLOR PALETTE: ${manifest.style.color_palette.join(', ')}` : ''}

${buildStyleGuardBlock(manifest)}
${buildCreativePreferencesBlock(manifest)}
${buildMgDecisionFramework(manifest)}

═══ DIRECTOR MINDSET ═══
Think from a director's point of view. Every shot serves a purpose in the viewer's journey.
The video must feel like a cohesive story, not a compilation of random clips.
Design a pacing rollercoaster — oscillate between high-energy (fast cuts, dynamic visuals)
and low-energy (breathing room, contemplation) moments.

═══ NARRATIVE BEAT CLASSIFICATION ═══
Every shot MUST be classified with a narrative beat — its purpose in the story:

| Beat | Purpose |
|------|---------|
| hook | Grab attention immediately |
| establishing | Set the scene, introduce the world |
| buildup | Increase tension, stack information |
| detail | Focus on specific evidence/element |
| reveal | Payoff moment — show the key thing |
| reaction | Emotional weight — let it land |
| transition | Bridge between topics or ideas |
| climax | Peak dramatic moment |
| resolution | Wrap up, debrief |

SHOT DURATION INTUITION:
Think in narration density, not in fixed seconds. At typical documentary pace (~2.5 wps):
- Every ~6 words ≈ 2.4s → tight insert or rapid montage clip
- Every ~12 words ≈ 4.8s → standard establishing or coverage shot
- Every ~20 words ≈ 8s → long deliberate hold (use sparingly, for high-weight moments)
- Every ~4-5 words ≈ 1.5-2s → climax montage — rapid cuts building urgency

Plan to the RHYTHM of the writing. Where does the narration naturally breathe?
Those pauses, topic pivots, and sentence breaks are your cuts.
A single sentence is usually 1-2 shots. A complex explanatory paragraph deserves 4-8 shots.


═══ SCENE CONTINUITY ═══
Use continuity_from_previous + angle_change when consecutive shots should feel like multiple
camera angles on the same location — like a multi-camera film set.
Use continuity_from_previous: false when the visual should change completely.
Not every shot needs continuity — use it purposefully.
For continuity shots: downstream, the last frame of the previous video will be image-edited
with your angle_change directive, then used as the starting frame for a new video.
Keep angle_change short and camera-oriented: reframe, push in, pull back, side view, overhead,
detail crop, reveal left/right.

═══ DIRECTING GRAMMAR ═══
Every shot should also think like a directed edit, not just a prompt:
- Declare shot_role, framing, camera_angle, and camera_motion when possible
- Use entry_transition_intent and exit_transition_intent to explain why the cut feels motivated
- Use bridge_subject and visual_motif when a recurring visual idea should carry across shots
- continuity_level should reflect how visually stable the shot must remain: fresh, soft, or strict
- render_strategy should distinguish between normal generation and segmentation-led editorial shots

═══ SEGMENTATION AS AN EDITORIAL TOOL ═══
Use segmentation_treatment only for shots that benefit from deliberate emphasis:
- tracked subject callouts
- spotlighting or isolating an important person/object
- documentary-style annotation and reveal shots
- guided push-ins on a specific face, object, or detail
Prefer object_prompts over a vague text prompt when multiple people or objects may appear.
object_prompts.label should be short snake_case. object_prompts.text should usually be 2-8 words.
Do NOT overuse it. It should feel like intentional editing, not effect spam.

NON-STATIC RULE:
- Do not plan normal final shots as stagnant still images.
- If a shot starts from a still, route it toward segment_animate, ai_video, or motiongraphic.

CAMERA MOTION AS LANGUAGE:
- push_in / zoom_in = intensify focus, move closer to a reveal or detail
- pull_out / zoom_out = reveal context, scale, aftermath, or reflection
- pan_left / pan_right = scan a scene, connect subjects, or shift attention
- tilt_up / tilt_down = reveal scale or descend toward a consequential detail
- orbit / tracking = examine or accompany a subject in a motivated way
- handheld = urgency or grounded documentary immediacy
- static = deliberate stillness only when the moment needs to land without distraction
- Avoid choosing static by default. Stillness should feel intentional, not lazy.

TEXT SAFETY:
- Do NOT plan AI imagery that depends on a readable paragraph, full-page article, or dense body copy.
- If the beat requires readable text, route toward motion graphics, callouts, labels, or short designed typography.
- A document/image shot may suggest texture, headlines, or key phrases, but not long readable prose.

═══ DOCUMENTARY SHOT CONVENTIONS — THE PROFESSIONAL VOCABULARY ═══
These shot patterns are the language of premium documentary video. Reach for them when the moment calls — don't force them, but don't ignore them either.

TITLE CARDS & DELIBERATE TEXT MOMENTS:
- A styled title card (dark background, glowing or bold typography) is a legitimate, powerful shot — use it for dramatic openings, chapter introductions, or a single devastating statement
- A title card followed by a hard cut to action is a classic hook technique
- Route these as media_type: "motiongraphic", mg_mode: "freeform" or template_type: "quote_card"
- These are NOT filler — a well-designed 2-3s title card creates cinematic gravity

CHARACTER INTRODUCTIONS (first time a named person appears):
Two patterns -- choose based on the moment's weight:

(A) CINEMATIC ENTRY (action-forward moments -- the character is already in the scene):
  - Tracking shot following the character as they enter or move through the environment
  - Followed immediately by a lower_third MG (2-3s) stating their name and role
  - Use when the character is actively doing something the narration describes

(B) CHARACTER DOSSIER CARD (analytical / historical context moments -- narration is introducing them):
  - A 2D card-style graphic: portrait of the character, their name, and a STATUS STAMP
  - The STATUS STAMP carries EDITORIAL VOICE -- it judges them, not just names them:
    Examples: "MILITARY GENIUS", "TOO POPULAR", "LOYAL ONLY TO CAESAR", "TRAITOR",
    "MAN OF THE PEOPLE*", "DICTATOR FOR LIFE"
  - Stamp colors: red = threat/danger/betrayal, gold = achievement/power, grey = neutral/defeated
  - The stamp HITS the card with physical kinetic energy -- it doesn't fade in
  - Route as: template_type: "character_dossier", mg_mode: "template"
  - The dossier card can SLIDE LEFT to make room for a companion panel (career timeline,
    relationship map, stat block) -- plan the companion panel as the very next shot if the
    narration includes biographical detail about the character
  - Use when narration introduces a character analytically: "Caesar had grown..." "Brutus was..."

NEVER introduce a major named figure with just a plain video shot and no MG label. Every
first appearance of a key person should be architecturally planned -- either cinematic entry
or dossier card. The viewer must know who they are looking at and why it matters.

GEOGRAPHY & LOCATION EXPLANATION (when narration explains WHERE something happened):
- The Map → Architecture → Detail sequence is the documentary gold standard:
  1. Map shot: 2D illustrated map showing the location in context [motiongraphic: map_focus or route_trace]
  2. Architectural overview: high-angle or isometric view of the specific building/site [video: overhead + freeze_orbit or push_in]
  3. Detail drill-down: push-in to the specific element being described [video: push_in or pan]
- Use animated route traces (dashed lines on maps) for journeys or paths
- Don't jump to footage without establishing WHERE the viewer is

SPATIAL ORIENTATION SHOTS (explaining the layout of a space):
- When narration describes the layout of a building, battlefield, or crime scene: use a freeze_orbit on a high-angle miniature model or CGI overhead to give the viewer a mental map
- Drill down: wide overhead → isometric view → medium interior → specific detail
- Annotated model shots with floating labels are one of the most effective information-delivery techniques in documentary
- Example visual_description: "Clay miniature diorama of the Roman Senate building. Camera orbits slowly at a high angle. Clay-style floating labels appear identifying the main entrance chamber and rear exit paths as the camera reveals them."

ABSENT / MISSING CHARACTER (when narration notes someone is NOT present -- a gap in a scene):
The professional documentary standard is the LABELED GHOST FIGURE:
  - Show the scene as normal, but render a semi-transparent, desaturated clay silhouette of the
    absent person in the position they WOULD occupy (the empty seat, the gap in the crowd)
  - The silhouette has a floating label: name + reason for absence
    (e.g., "MARK ANTONY -- kept outside", "POMPEY -- fled to Egypt")
  - The ghost fades or dissolves away, leaving the empty space visually prominent
  - Route as: template_type: "ghost_figure_reveal", mg_mode: "template"
  - OR: video shot with segmentation treatment reducing opacity of that figure + tracked annotation

Simpler alternative (use only if ghost figure is not appropriate):
  - Shot of the empty chair / empty position in the frame
  - Immediately followed by a lower_third or label MG: "CO-CONSUL: ABSENT"

NEVER just describe absence in narration without a visual counterpart.
The viewer must SEE the vacancy. Absence is one of the most powerful compositional tools
in documentary -- an empty frame centered on where someone should be is an editorial statement.

RAPID MONTAGE SEQUENCES (climax, title beats, revelation moments):
- At peak tension or dramatic climax, plan 3-6 very short shots (1.5-2.5s each) in rapid succession
- These can be: tight detail close-ups, dramatic title cards, partial reveals, dramatic stills
- 1.5-second shots are legitimate — fast cuts build urgency and emotional punch
- Mark these: trim_priority: "tight", narrative_beat: "climax" or "reveal"
- After a rapid montage, a single held shot (4-6s) lands with much more weight

INFORMATION DESIGN RHYTHM (the visual sentence structure of great documentary):
Professional documentary editing cycles between three registers:
- (A) WORLD shots: cinematic footage showing the physical world in motion
- (B) INFORMATION shots: maps, diagrams, labels, overlays, timelines, data
- (C) EMPHASIS shots: tight details, annotations, isolated subjects, close reveals
Good sequences cycle: A -> B -> A -> C -> A -- not A -> A -> A -> B -> A -> A.
Every 3-4 footage shots should be followed by an information or emphasis beat.

SLAP ANNOTATION -- EDITORIAL COMMENTARY PHYSICALLY OVERLAID ON SOURCE MATERIAL:
The most distinctive technique in modern documentary: a base visual (painting, 3D scene, map,
document) then has a COMMENTARY LAYER slam into the foreground with editorial judgment.

The visual logic: "Here is the official historical image -- here is what it ACTUALLY means."

How to plan:
  - Base shot: video or image showing the historical source material (3-6s)
  - 1-2s into the shot, an annotation element PHYSICALLY ENTERS from off-screen:
    torn paper, masking tape strip, rubber stamp, speech bubble, bold text card
  - The annotation carries the editorial voice -- it INTERRUPTS the official visual
  - Route as: template_type: "slap_annotation" or "stamp_reveal"
  - Describe both layers in visual_description: the base image AND the overlay content + entry
  - For simpler execution: image_edit_instruction specifying the overlay text and entry style

Classic slap annotation examples to reach for:
  - Historical painting of a key moment -> torn paper banner slaps over it: "DELIBERATELY IGNORING THE LAW"
  - Portrait bust of a political figure -> speech bubbles pop up: "*TOTALLY NOT A KING"
  - Document / decree -> red stamp hits it: "POWER GRAB"
  - Ally portrait card -> stamp transforms: "LOYAL" strikes through to "TRAITOR"
  - Coin portrait -> sword slices it: name changes from "THE GREAT" to "THE DEFEATED"

When to use: whenever narration editorializes ("but ironically...", "the mistake was...",
"despite claiming..."), when showing a status change, at tonal pivot points from
narration to analysis, and at any moment the video needs to take a clear position.

TERRITORY MAP -- GEOGRAPHIC CONTROL SPREAD OVER TIME:
Use when narration describes a war, conquest, civil war, or political expansion where
CONTROL OF TERRITORY changes over time. Fundamentally different from route_trace (which
shows a path) -- territory map shows SPREADING ZONES OF CONTROL.

Features:
  - Topological or illustrated map of the relevant region
  - Two or more colored zones representing factions (e.g., red = Caesar, blue = Pompey)
  - Zones animate dynamically -- spreading, retreating, or clashing as narration progresses
  - TIMELINE SCRUBBER along the bottom anchors visual changes to specific dates
  - Portrait cards or name labels identify each faction at the edge of their territory

Route as: template_type: "territory_map", mg_mode: "template"
In visual_description, specify: region covered, faction names + colors, what the spread
animation shows, and the date range.

Use territory_map when:
  - Narration covers a multi-year military campaign or civil war
  - The story involves competing power blocs across geography
  - A single route_trace undersells the scale of the conflict
  - You need to show "who controlled what and when" across multiple phases
EDITORIAL VOICE IN MOTION GRAPHICS:
MG shots are not neutral information containers. In premium documentary, MGs carry the
video's editorial opinion -- they judge, editorialize, and take positions.
When narration says "but ironically", "the mistake was", "despite claiming", or takes any
opinionated position, plan an MG shot that VISUALIZES that editorial stance:
  - Analytical / authoritative: clean dossier cards, clinical timelines, precise labels
  - Skeptical / investigative: warning stamps, red X marks, "ACTUALLY" overlays, strikethroughs
  - Dramatic / epic: bold high-contrast type, impact frames, territory maps with war colors
  - Self-aware: speech bubbles on historical busts, masking tape date stamps, "*" footnotes
This editorial MG voice is what separates premium YouTube documentary from textbook illustration.


INTENTIONALITY RULES:
- Every shot MUST have a clear purpose: inform, emotionally engage, or visually transition
- Avoid random or decorative visuals — each shot must logically flow from the previous
- Use visual motifs (recurring visual elements) to create thematic continuity
- Match visual intensity to narrative intensity (calm narration = slow/wide shots, tense = tight/fast)
- Vary shot types intentionally: establish → detail → reaction → establish
- Avoid back-to-back shots that lazily reuse the same base composition
- Each shot must declare its narrative purpose via narrative_beat
${entityList}

\u2550\u2550\u2550 VISUAL DECISION COUNTERMEASURES \u2550\u2550\u2550
These are the mistakes low-quality shot plans make. Avoid them:

\u274c GENERIC B-ROLL TRAP: Narration says "ancient Rome" \u2192 plan one wide shot held for 15 seconds.
\u2713 INSTEAD: 3 shots. (1) Wide aerial establishing context, (2) street-level movement through the described scene, (3) push-in to the specific detail the narration references.

\u274c MAP REFLEX: Instinctively cut to a map every time a place name is mentioned.
\u2713 INSTEAD: Use a map only when the GEOGRAPHY itself is the point \u2014 when the viewer needs to understand WHERE relative to WHERE. Otherwise show the place cinematically.

\u274c MOTION GRAPHIC EMOTIONAL SUBSTITUTION: Using motiongraphic for dramatic, emotional, or action beats because it's easier to plan.
\u2713 INSTEAD: Reserve MG for information design moments (maps, dates, labels, statistics, diagrams). Dramatic beats should be footage, segmentation treatment, or image with editorial motion.

\u274c SINGLE-ANGLE LOCK: Planning all shots in a long scene from the same distance and angle.
\u2713 INSTEAD: Vary camera relationship continuously \u2014 establish wide, push in to detail, cut away and return. Camera movement IS storytelling.

\u274c ONE-SHOT-PER-CONCEPT: Each narration idea gets one long shot.
\u2713 INSTEAD: Subdivide. The establishing shot introduces the concept, the detail shot proves it, the reaction shot lets it land.

\u274c STATIC STILL DEFAULT: Planning image shots that just sit inert.
\u2713 INSTEAD: Route every image shot toward segment_animate, ai_video, or camera motion. Still images are source material, not final viewer experiences.


AVAILABLE MOTION GRAPHIC TEMPLATE TYPES — USE THESE EXACT STRINGS in the template_type field:
- lower_third           → transparent name/location/role label overlaid on video
- quote_card            → full-screen typographic quote or single-statement card
- evidence_board        → cork/wall board with multiple pinned evidence items (conspiracies, crimes)
- document_callout      → document with scan line + side callout annotation panels
- timeline              → horizontal linear event progression board
- map_focus             → regional/world map with location chips and context labels
- route_trace           → dashed path drawn on a map showing a journey or route
- territory_map         → map with animated faction zones SPREADING over time → USE FOR WARS, CONQUESTS, CIVIL CONFLICTS
- comparison_board      → two-panel side-by-side comparison visual
- process_diagram       → boxes and arrows explaining a system, mechanism, or hierarchy
- photo_montage         → layered image composition using multiple stills
- character_dossier     → two-column portrait card with kinetic STATUS STAMP → USE FOR EVERY NAMED FIGURE'S FIRST ANALYTICAL INTRODUCTION
- slap_annotation       → annotation element (tape/stamp/paper) slamming in from off-screen → USE FOR EDITORIAL COMMENTARY ON SOURCE MATERIAL
- ghost_figure_reveal   → translucent silhouette + floating fading label → USE WHEN NARRATION NOTES SOMEONE IS NOT PRESENT

PERSISTENT GRAPHICS — plan to REUSE the same graphic across multiple shots when:
- The same board, map, or timeline evolves over 2+ consecutive shots (new pins added, territory expands)
- A recurring concept (a character's file, an ongoing investigation wall) appears in multiple scenes
- The viewer should feel they are watching ONE graphic grow, not separate graphics that look similar
DO NOT use persistent graphics when shots are non-adjacent, topics have changed completely, or a full reset is needed.

OUTPUT: A structured JSON ShotPlan with each shot aligned to narration segments, assigned media types, entity references, narrative beats, and synthesis modes.${getWorkerOverride(manifest, 'shot_planner')}`;
}

/**
 * Build the Asset Scout's system prompt.
 */
function buildAssetScoutPrompt(
  userPrompt: string,
  manifest: CreativeManifest,
  entities: GCMEntity[]
): string {
  const entityContext = entities.length > 0
    ? `\n\nEntity visual references (use these to enrich prompts):\n${entities.map(e => `- ${e.name}: ${e.text_description}${e.reference_url ? ` [ref: ${e.reference_url}]` : ''}`).join('\n')}`
    : '';

  return `You are an expert asset scout and visual prompt engineer. Your job is to find stock media and craft AI generation prompts for each shot in a video.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
COLOR PALETTE: ${manifest.style.color_palette.join(', ') || 'Not specified'}
${manifest.style.lighting_mood ? `LIGHTING: ${manifest.style.lighting_mood}` : ''}
${buildStyleGuardBlock(manifest)}
${entityContext}

PROMPT ENRICHMENT RULES:
- Always include the visual style keywords in AI generation prompts
- For shots referencing entities, embed the entity's text_description
- For stock searches, extract semantic keywords from the shot description
- For SFX, match sound effects to precise timeline positions
- Maintain thematic consistency across all prompts — every visual should feel like it belongs to the same video
- Never rely on AI imagery to render long readable paragraphs, dense document pages, or precise UI copy. Route those needs toward motion graphics or short overlay text instead${getWorkerOverride(manifest, 'asset_scout')}`;
}

/**
 * Build the Image Generation Agent's system prompt.
 */
function buildImageGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const qualityAnchors = manifest.visual?.quality_anchors?.join(', ') || getDefaultQualityAnchorsForStyle(
    manifest.style.visual_style,
    manifest.master_creative_prompt,
    manifest.video_creative_prompt,
  ).join(', ');
  const constraints = manifest.visual?.image_constraints?.join(', ') || 'no text, no watermark, no logos';

  return `You are an expert AI image generation specialist optimized for Z-Image Turbo.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildLoraBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}
QUALITY ANCHORS: ${qualityAnchors}
CONSTRAINTS: ${constraints}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.color_palette.length > 0 ? `COLOR PALETTE: ${manifest.style.color_palette.join(', ')}` : ''}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

GENERATION RULES:
- Z-Image does NOT support negative prompts — embed all constraints in the positive prompt
- Always include quality anchors in every prompt
- Maintain consistent lighting and color grading across all images
- Generate at the highest quality settings available
- Every image must serve a narrative purpose — no generic stock-like compositions
- Do NOT ask the image model to render long readable body text, document paragraphs, or dense UI copy. Use headlines, labels, and motion-graphics typography for readable text${getWorkerOverride(manifest, 'image_gen')}`;
}

/**
 * Build the Video Generation Agent's system prompt.
 */
function buildVideoGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert AI video generation specialist optimized for LTX-2.3.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

VIDEO GENERATION RULES (LTX-2.3):
- LTX-2.3 has a 4× larger text encoder — use specific, detailed prompts with multiple subjects, spatial relationships, and stylistic constraints
- Use T2V mode for first shots or isolated scenes
- Use FF2V mode for sequential shots continuing the same scene
- Always use ACTION VERBS for motion — specify who moves, what moves, how they move, and what the camera does
- Block the scene explicitly — describe spatial positions (left/right, foreground/background, facing toward/away)
- Describe textures and materials — fabric types, hair texture, surface finish, environmental wear (the rebuilt VAE produces sharper detail)
- Design audio intentionally — describe environmental sounds, tone, and intensity (the upgraded vocoder produces cleaner output)
- Match the lighting and color grading from the style guide
- Generated video MUST contain meaningful motion — if the prompt reads like a still photo, the output will freeze
- For portrait (9:16) content, compose for vertical intentionally — don't treat as cropped landscape
- Do NOT depend on in-world readable paragraphs or dense UI text. Reserve readable long-form text for motion graphics and designed overlays${getWorkerOverride(manifest, 'video_gen')}`;
}


/**
 * Build the Motion Graphics Agent's system prompt.
 * Includes the Channel Theme System for visual consistency across all MG compositions.
 */
function buildMotionGraphicsPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const mgTheme = manifest.motion_graphics?.theme || 'dark';
  const mgColors = manifest.motion_graphics?.color_palette?.join(', ') || '#0A0A0A, #3B82F6, #FFFFFF';
  const mgAnimation = manifest.motion_graphics?.animation_style || 'smooth';
  const mgFont = manifest.motion_graphics?.font_family || 'Inter';
  const mgBorderStyle = manifest.motion_graphics?.border_style || 'rounded';

  const borderRadius = mgBorderStyle === 'sharp' ? '0px'
    : mgBorderStyle === 'pill' ? '999px'
    : '12px';

  return `You are an expert Remotion composition designer for motion graphics.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}

═══ CHANNEL THEME SYSTEM ═══
These values MUST be used consistently across ALL motion graphics in this video:
- Theme Mode: ${mgTheme}
- Primary Font: ${mgFont}
- Border Radius: ${borderRadius}
- Primary Colors: ${mgColors}
- Animation Style: ${mgAnimation} (use ${mgAnimation === 'bouncy' ? 'spring({damping: 12})' : mgAnimation === 'snappy' ? 'spring({damping: 20, stiffness: 200})' : mgAnimation === 'gentle' ? 'spring({damping: 15, mass: 1.5})' : 'spring({damping: 15})'})

COMPOSITION RULES:
- Use React + Remotion APIs only
- ALL motion graphics MUST use the Channel Theme System values above
- Location cards, title cards, stat overlays, and quote cards MUST share the same visual DNA
- Never generate an MG component that looks visually different from others in the same video
- All animations should use spring physics for natural movement
- Typography should be clean and readable using "${mgFont}"
- Include smooth entrance and exit animations
- Use borderRadius: "${borderRadius}" on all card/container elements
- Base colors on the Primary Colors palette above
- All visible copy must be clean, legible English unless the prompt explicitly asks for another language
- Use short labels, callouts, and designed typography. Never fake long paragraphs of article or document text inside AI-rendered art

CONSISTENCY ENFORCEMENT:
- Every MG composition of the same type (e.g., all location cards) must be visually identical except for data
- If you've seen a previous composition of this type, match its exact layout and styling
- Background colors, text sizes, padding, and animation timing must be uniform${getWorkerOverride(manifest, 'motion_graphics')}`;
}

/**
 * Build the Music Agent's system prompt.
 */
function buildMusicPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert music prompt engineer for ACE-Step 1.5.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE (match music mood): ${manifest.style.visual_style}
${manifest.style.lighting_mood ? `MOOD: ${manifest.style.lighting_mood}` : ''}

MUSIC RULES:
- Generate 2-3 variants for selection
- For videos > 90s, generate in overlapping 90-120s segments
- Include ducking rules for narration sections
- Match the energy curve to the video pacing${getWorkerOverride(manifest, 'music')}`;
}

/**
 * Build the SFX Agent's system prompt.
 */
function buildSfxPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert sound effects curator using the Freesound API.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE (match SFX mood): ${manifest.style.visual_style}

SFX RULES:
- Search for CC0 licensed sound effects
- Prioritize high audio quality (44.1kHz+)
- Match SFX to precise timeline positions based on TTS timestamps
- Less is more — only add SFX where they genuinely enhance the experience
- Avoid distracting or overpowering sounds${getWorkerOverride(manifest, 'sfx')}`;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate tailored system prompts for all downstream workers.
 *
 * Called once by the Orchestrator at the start of each video.
 */
export function generateWorkerPrompts(
  userSystemPrompt: string | undefined,
  creativeManifest: CreativeManifest,
  entities: GCMEntity[]
): WorkerPrompts {
  const userPrompt = userSystemPrompt || '';

  return {
    shot_planner: buildShotPlannerPrompt(userPrompt, creativeManifest, entities),
    asset_scout: buildAssetScoutPrompt(userPrompt, creativeManifest, entities),
    image_gen: buildImageGenPrompt(userPrompt, creativeManifest),
    video_gen: buildVideoGenPrompt(userPrompt, creativeManifest),
    motion_graphics: buildMotionGraphicsPrompt(userPrompt, creativeManifest),
    music: buildMusicPrompt(userPrompt, creativeManifest),
    sfx: buildSfxPrompt(userPrompt, creativeManifest),
  };
}
