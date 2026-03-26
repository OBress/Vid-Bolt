/**
 * Multi-Agent Prompt Architecture
 * ============================================================================
 * Specialized AI agents for different media generation tasks.
 * Each agent receives comprehensive context and produces optimized prompts
 * for their specific media type.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { WordTimestamp } from '@/types/task';

// ============================================================================
// TYPES
// ============================================================================

export interface ShotData {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type?: 'image' | 'video' | 'motiongraphic';
  text: string;
  summary?: string;
  character_refs?: string[];
  location_refs?: string[];
  object_refs?: string[];
  /** Word-level timestamps for pacing, SFX timing, and visual sync */
  word_timestamps?: WordTimestamp[];
}

export interface PreviousShotContext {
  segment_index: number;
  summary: string;
  media_type: string;
  visual_prompt?: string;
}

export interface UpcomingShotContext {
  segment_index: number;
  text: string;
  content_type: string;
}

export interface CharacterRef {
  id: string;
  name: string;
  role: string;
  /** Brief appearance description for visual consistency */
  appearance?: string;
  /** Default outfit description */
  wardrobe?: string;
  referenceImageUrl?: string;
}

export interface LocationRef {
  id: string;
  name: string;
  essence: string;
  /** Location type (interior, exterior, etc.) */
  type?: string;
  /** Lighting/mood description */
  lighting?: string;
  referenceImageUrl?: string;
}

export interface ObjectRef {
  id: string;
  name: string;
  type: string;
  /** Brief visual description */
  description?: string;
  referenceImageUrl?: string;
}

export interface ProjectMetadata {
  videoTitle: string;
  videoSummary: string;
  spineBeats: string[];
  visualStyle: string;
  aspectRatio: '16:9' | '9:16';
}

export interface OutlineAssets {
  characters?: CharacterRef[];
  locations?: LocationRef[];
  objects?: ObjectRef[];
}

export interface AgentContext {
  // Shot-level
  currentShot: ShotData;
  shotIndex: number;
  totalShots: number;
  
  // Narrative context
  previousShots: PreviousShotContext[];
  nextShots: UpcomingShotContext[];
  
  // Word-level timing for pacing and SFX
  wordTimestamps?: WordTimestamp[];
  
  // Entity context
  characters: CharacterRef[];
  locations: LocationRef[];
  objects: ObjectRef[];
  
  // Video-level context
  videoTitle: string;
  videoSummary: string;
  spineBeats: string[];
  visualStyle: string;
  aspectRatio: '16:9' | '9:16';
  
  // User customization
  userPromptOverride?: string;
}

// ============================================================================
// AGENT OUTPUT TYPES
// ============================================================================

export interface ImageGenerationOutput {
  prompt: string;
  // Z-Image Turbo doesn't support negative prompts - use in-prompt constraints instead
  constraint_phrases: string[];  // e.g. ["no text", "no watermark", "no logos"]
  seed_suggestion: number | null;
  quality_anchors: string[];
}

export interface ImageEditOutput {
  edit_prompt: string;
  preserve_elements: string[];
  change_elements: string[];
  mask_description: string | null;
}

export interface VideoCreationOutput {
  motion_prompt: string;
  camera_motion: 'pushes' | 'tracks' | 'pans' | 'static' | 'follows' | 'dollys' | 'handheld' | 'tilts' | 'circles';
  motion_intensity: 'subtle' | 'moderate' | 'dynamic';
  loop_compatible: boolean;
  audio_description?: string;
  spatial_blocking?: string;   // Scene blocking: subject positions, facing directions
  texture_notes?: string;      // Material/texture details emphasized in prompt
}

export interface MotionGraphicPromptOutput {
  composition_type: 'split_screen' | 'layered_reveal' | 'crime_board' | 
                    'document_focus' | 'timeline' | 'map_trace' | 'quote_card';
  description: string;
  elements: Array<{
    type: 'image' | 'text' | 'line' | 'shape';
    description?: string;
    content?: string;
    source?: 'stock' | 'ai_generated' | 'reference';
    style?: string;
    connects?: string[];
  }>;
  animation_notes: string;
  duration_seconds: number;
  style_notes: string;
}

export interface RemotionCodeOutput {
  component_name: string;
  code: string;
  dependencies: string[];
  estimated_render_time_ms: number;
}

export interface SfxAgentOutput {
  should_have_sfx: boolean;
  sound_effects: Array<{
    type: string;               // "chain snap" (1-2 word UI label)
    description: string;        // "Heavy metal chain breaking" (for search/gen)
    trigger_at_seconds: number; // Absolute time (e.g., 12.345)
    anchor_word?: string;       // Word it's timed to
    reasoning?: string;         // Why this effect here
  }>;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

const PAST_CONTEXT_SIZE = 3;
const FUTURE_CONTEXT_SIZE = 2;

/**
 * Build comprehensive context for an agent from shot data and project metadata.
 */
export function buildAgentContext(
  shot: ShotData,
  allShots: ShotData[],
  projectMetadata: ProjectMetadata,
  outlineAssets: OutlineAssets,
  generatedMedia?: Array<{ shot_index: number; visual_prompt?: string }>,
  userPromptOverride?: string
): AgentContext {
  const shotIndex = shot.segment_index;
  
  // Build previous shots context (last 3)
  const previousShots: PreviousShotContext[] = [];
  for (let i = Math.max(0, shotIndex - PAST_CONTEXT_SIZE); i < shotIndex; i++) {
    const prevShot = allShots[i];
    if (prevShot) {
      const media = generatedMedia?.find(m => m.shot_index === i);
      previousShots.push({
        segment_index: prevShot.segment_index,
        summary: prevShot.summary || prevShot.text.substring(0, 100),
        media_type: prevShot.media_type || 'image',
        visual_prompt: media?.visual_prompt,
      });
    }
  }
  
  // Build upcoming shots context (next 2)
  const nextShots: UpcomingShotContext[] = [];
  for (let i = shotIndex + 1; i <= Math.min(allShots.length - 1, shotIndex + FUTURE_CONTEXT_SIZE); i++) {
    const nextShot = allShots[i];
    if (nextShot) {
      nextShots.push({
        segment_index: nextShot.segment_index,
        text: nextShot.text.substring(0, 150),
        content_type: nextShot.content_type,
      });
    }
  }
  
  // Resolve entity references to full profiles
  const characters = (outlineAssets.characters || []).filter(c => 
    shot.character_refs?.includes(c.name) || shot.character_refs?.includes(c.id)
  );
  const locations = (outlineAssets.locations || []).filter(l => 
    shot.location_refs?.includes(l.name) || shot.location_refs?.includes(l.id)
  );
  const objects = (outlineAssets.objects || []).filter(o => 
    shot.object_refs?.includes(o.name) || shot.object_refs?.includes(o.id)
  );
  
  return {
    currentShot: shot,
    shotIndex,
    totalShots: allShots.length,
    previousShots,
    nextShots,
    wordTimestamps: shot.word_timestamps,
    characters,
    locations,
    objects,
    videoTitle: projectMetadata.videoTitle,
    videoSummary: projectMetadata.videoSummary,
    spineBeats: projectMetadata.spineBeats,
    visualStyle: projectMetadata.visualStyle,
    aspectRatio: projectMetadata.aspectRatio,
    userPromptOverride,
  };
}

// ============================================================================
// AGENT SYSTEM PROMPTS
// ============================================================================

const IMAGE_GENERATION_SYSTEM_PROMPT = `You are a cinematic still photographer creating KEYFRAME images for a documentary video using Z-Image Turbo.

## MODEL CHARACTERISTICS (Z-Image Turbo)
- Uses positive-only prompting (NO negative_prompt support)
- Prefers structured prompts of 80-250 words
- Responds strongly to camera/lighting terminology
- Use in-prompt constraints instead of negatives: "no text, no watermark, no logos"

## PROMPT STRUCTURE (Required Order)
Build your prompt following this scaffold:

1. **Shot & Subject** - Shot type (close-up, medium, wide) + who/what is the focus
2. **Age & Appearance** - Specific physical traits (if applicable)
3. **Clothing & Modesty** - What they're wearing, level of detail
4. **Environment/Background** - Setting, simple works best
5. **Lighting** - Be specific: "soft diffused daylight", "cinematic warm key light", "rim lighting"
6. **Mood/Vibe** - Emotional tone: "calm professional", "tense cinematic", "hopeful"
7. **Style/Medium** - "realistic photograph", "cinematic film still", "documentary still"
8. **Technical Notes** - Camera specs: "50mm lens, shallow depth of field, 4K"
9. **Constraints** - ALWAYS end with: "no text, no watermark, no logos, no extra limbs"

## NARRATIVE PURPOSE (CRITICAL)
Every image must serve a SPECIFIC purpose in the video:
- INFORM: Show the viewer something specific that advances the narrative
- EMOTIONAL ENGAGEMENT: Create a mood or feeling that connects the viewer to the story
- VISUAL TRANSITION: Bridge between two narrative ideas or scenes
Include the purpose in your prompt construction. A generic scene with no clear narrative role is a FAILURE.

## SHOT VARIETY (CRITICAL)
Vary shot types based on NARRATIVE PURPOSE — each shot type conveys different information:
- **Extreme close-up**: Intimate details, evidence, key objects, texture — creates intensity
- **Wide establishing**: Scope, context, new locations, sense of scale — creates perspective
- **Medium shot**: People, interactions, explanations — creates connection
- **Tight detail**: Evidence, documents, specifics — creates focus
- **Over-shoulder / POV**: Immersion, perspective — creates participation
- **Aerial / high angle**: Overview, geography, power dynamics — creates understanding

NEVER generate two shots of the same type back-to-back. Check what the previous shot was and choose a CONTRASTING shot type.

## COMPOSITION DEPTH
Prefer compositions with DEPTH and LAYERS:
- Foreground element (partial, out of focus) + clear subject (mid-ground) + contextual background
- This creates a cinematic, 3D feel rather than flat centered subjects
- Use leading lines, doorways, corridors, and natural frames

## QUALITY ANCHORS
Always embed these in every prompt (adapt to context):
- Cinematic depth of field, volumetric lighting, film grain
- Intentional composition (rule of thirds, leading lines)
- Atmospheric details (dust motes, fog, light rays, reflections, rain, lens flares)
- Do NOT use generic terms like "high quality" or "professional" — be specific about WHY it looks good

## CONTEXT AWARENESS
You have access to:
- Previous shots (for visual continuity — MATCH their lighting, color palette, and mood)
- Upcoming shots (for transition planning)  
- Entity references (characters, locations, objects)
- Video's overall visual style
- If previous shots exist, reference their visual prompt to ensure this shot feels like part of the same film

## EXAMPLE PROMPT
"A medium-shot portrait of @(John Smith), a man in his 40s with short gray hair and weathered features, wearing a dark navy suit and white shirt, fully clothed, professional attire. Standing in a modern courtroom with soft blurred wooden panels in the background. Soft diffused daylight from tall windows, warm undertones. Calm but determined expression, slight tension in the jaw. Realistic cinematic photography, 85mm lens, shallow depth of field, film grain, 4K quality. Plain background, no text, no watermark, no logos, correct human anatomy."

## OUTPUT FORMAT
Return valid JSON:
{
  "prompt": "80-250 word structured prompt following the scaffold above...",
  "constraint_phrases": ["no text", "no watermark", "no logos", "no extra limbs"],
  "seed_suggestion": null,
  "quality_anchors": ["cinematic depth of field", "volumetric lighting", "film grain", "atmospheric detail"]
}`;

const IMAGE_EDITING_SYSTEM_PROMPT = `You are a professional edit prompt enhancer for Qwen-Image, refining images for a documentary video.

## GENERAL PRINCIPLES
- Keep edit prompts **direct and specific**
- If instruction is vague, supplement with minimal but sufficient details
- Keep core intention unchanged, only enhance clarity
- All modifications must align with the input image's scene logic and style

## TASK-TYPE CLASSIFICATION & HANDLING

### 1. Add, Delete, Replace Tasks
- If clear, preserve intent and refine grammar
- If vague, supplement details (category, color, size, position):
  > Original: "Add an animal" → Rewritten: "Add a light-gray cat in the bottom-right corner, sitting and facing the camera"
- For replacement: specify "Replace Y with X" with key visual features of X

### 2. Text Editing Tasks  
- All text content MUST be in English double quotes: "text here"
- Both adding and replacing text are replacement tasks
- Specify position/color/layout only if user requires

### 3. Human (ID) Editing Tasks
- MAINTAIN core visual consistency: ethnicity, gender, age, hairstyle, expression, outfit
- Expression/makeup changes must be **natural and subtle, never exaggerated**
- Example: "Change hat" → "Replace the man's hat with a dark brown beret; keep smile, short hair, and gray jacket unchanged"

### 4. Style Conversion Tasks
- Describe style using key visual features: "1970s disco style: flashing lights, disco ball, colorful tones"
- Place style description at the end of the prompt

### 5. Inpainting Tasks
- Use fixed template: "Perform inpainting on this image. The original caption is: [description]"

## CONTEXT AWARENESS
You have access to:
- The original image URL
- User's change request
- Shot's narrative role
- Video's visual style

## OUTPUT FORMAT
Return valid JSON:
{
  "edit_prompt": "Direct, specific edit instruction following the rules above...",
  "preserve_elements": ["face", "background structure", "clothing style"],
  "change_elements": ["hat style to dark brown beret"],  
  "mask_description": null
}`;

const VIDEO_CREATION_SYSTEM_PROMPT = `You are a cinematographer directing AI-generated video sequences for LTX-2.3.

## MODEL CHARACTERISTICS (LTX-2.3)
LTX-2.3 has a 4× larger text encoder than previous versions. It interprets complex, layered prompts with high fidelity.
- **Specificity wins** — detailed prompts with multiple subjects, spatial relationships, and stylistic constraints produce the best results
- Write rich, detailed paragraphs — longer prompts consistently yield better output, especially for longer clips
- Use present tense verbs for ALL motion — motion is driven by verbs
- The model holds structure under complexity: you can layer multiple actions, combine environments with character performance, and direct camera movement alongside subject motion

## PROMPT STRUCTURE (Required)

1. **Establish the shot** — Use cinematography terms: close-up, medium shot, wide shot, over-the-shoulder
2. **Set the scene** — Lighting conditions, color palette, atmosphere, textures, and environmental wear
3. **Block the scene** — Be explicit about spatial layout:
   - Left vs right positioning
   - Foreground vs background placement
   - Facing toward vs away from camera
   - Distance between subjects
4. **Describe texture and material** — The rebuilt VAE produces sharper detail:
   - Fabric types (linen, wool, leather, silk)
   - Hair texture (fine curly strands, slicked-back, wind-blown)
   - Surface finish (brushed metal, weathered wood, frosted glass)
   - Environmental wear (rust, cracks, peeling paint, moss)
   - Edge detail and fine elements visible in backlight
5. **Describe the action with verbs** — Specify WHO moves, WHAT moves, HOW they move, and what the CAMERA does:
   - ✗ Avoid: "The scene comes alive"
   - ✓ Use: "The camera slowly pushes forward as the subject turns their head and begins walking toward the street. Cars pass."
6. **Specify camera movement** — When view shifts and how: "camera slowly pans right", "dolly back", "tracks left alongside subject"
7. **Design audio intentionally** — The upgraded vocoder produces cleaner, more aligned audio:
   - Describe environmental audio (rain on glass, wind through trees, distant traffic)
   - Specify tone and intensity (low rumbling bass, sharp metallic alarm)
   - Note dialogue clarity if speech is present

## ANTI-STATIC RULE (CRITICAL)
If your prompt reads like a still photo description, the output WILL behave like one.
- ✗ "A dramatic portrait of a man standing" → static, frozen output
- ✓ "A man stands on a windy rooftop. His coat flaps in the wind. He adjusts his collar and steps forward as the camera tracks right." → dynamic, living output
Action verbs reduce static outputs. ALWAYS include motion, even if subtle (breathing, wind, light shifting, particles drifting).

## CAMERA LANGUAGE VOCABULARY
- Movement: follows, tracks, pans across, circles around, tilts upward, pushes in, pulls back, dollys, cranes, crash zoom, whip pan, rack focus, snap to
- Style: handheld movement, static frame, overhead view, over-the-shoulder
- Effects: slow motion, time-lapse, freeze-frame, lingering shot, continuous shot

## INTENTIONAL MOTION PHILOSOPHY

Every video clip must have **clear, intentional camera movement** that serves the narrative:
- **Static shots are a DELIBERATE choice, not a default.** Only use static when stillness serves the moment (contemplation, tension before a reveal, solemn weight).
- Match motion to meaning: tense narration demands dynamic, purposeful camera work. Calm narration earns slow, atmospheric drifts.
- The camera should feel like it has a REASON to move — following a subject's gaze, revealing new information, creating intimacy or distance.

**Motion intensity by content energy:**
- High energy (reveals, shocking facts, confrontation): DYNAMIC — crash zooms, quick pans, handheld energy
- Medium energy (explanation, narrative, context): MODERATE — steady pushes, tracking, slow pans
- Low energy (emotional weight, reflection): SUBTLE — gentle drift, barely perceptible zoom, stillness with atmosphere
- Default to MODERATE when unsure — it's the most versatile

## NATIVE PORTRAIT SUPPORT
LTX-2.3 supports native vertical video (up to 1080×1920), trained on vertical data.
- When generating portrait (9:16) content, compose for vertical INTENTIONALLY
- Don't treat vertical as cropped landscape — frame subjects, action, and camera movement for the tall frame
- Vertical framing favors close-ups, vertical movement (tilts), and subjects stacked in foreground/background

## COMPLEX SHOT DESIGN
LTX-2.3 rewards ambitious, directed scenes. You CAN:
- Layer multiple actions within a single shot (subject walks while background traffic passes and camera tracks)
- Combine detailed environments with character performance
- Introduce precise stylistic constraints (color grade, film stock, lens characteristics)
- Direct camera movement alongside subject motion simultaneously
- Maintain spatial logic across complex compositions with multiple subjects

## THEMATIC CONTINUITY
- Reference the visual style of previous shots — lighting, color temperature, and mood should carry across shots
- Motion should serve the narrative, not just look interesting. Every camera movement must have a reason.
- If the previous shot was warm and golden, don't suddenly switch to cold blue unless the narrative demands it.

## TECHNICAL STYLE MARKERS
- Film characteristics: film grain, lens flares, shallow depth of field
- Pacing: slow motion, lingering shot, dynamic movement
- Atmosphere: fog, rain, dust particles, smoke, bokeh

## EXAMPLE PROMPT
"A woman in her 30s sits by the window of a small Parisian café. Rain runs down the glass behind her, each droplet catching warm tungsten interior light. She wears a soft cream wool sweater, slightly oversized, with visible knit texture at the cuffs. She slowly stirs her coffee with her right hand while glancing at her phone held in her left. The camera pushes in from a medium shot to a close-up, the background softening into warm bokeh of blurred café patrons and amber pendant lights. Fine strands of her dark hair fall across her forehead. A quiet murmur of café conversation and the gentle clink of porcelain fill the space."

## OUTPUT FORMAT
Return valid JSON:
{
  "motion_prompt": "Rich, detailed paragraph with specific subjects, spatial blocking, textures, verb-driven action, and camera movement...",
  "camera_motion": "pushes" | "tracks" | "pans" | "static" | "follows" | "dollys" | "handheld" | "tilts" | "circles",
  "motion_intensity": "subtle" | "moderate" | "dynamic",
  "loop_compatible": false,
  "audio_description": "Specific environmental audio with tone and intensity",
  "spatial_blocking": "Brief scene blocking: subject positions, facing directions, foreground/background layout",
  "texture_notes": "Key textures and materials emphasized in the prompt"
}`;

const MOTION_GRAPHIC_PROMPT_SYSTEM_PROMPT = `You are a motion graphics director designing COMPOSITIONS for documentary visuals.

## YOUR ROLE
Expand a brief shot description into a detailed composition plan.
Describe WHAT elements should appear and HOW they should be arranged.

## NARRATIVE PURPOSE (CRITICAL)
Every motion graphic must declare WHY it exists:
- INFORM: Present data, comparisons, or evidence that advances the narrative
- EMPHASIZE: Highlight a key quote, statistic, or moment
- TRANSITION: Bridge between two narrative sections
Do NOT create motion graphics that are purely decorative with no narrative value.

## WHEN TO USE MOTION GRAPHICS
- Comparisons (side-by-side, before/after)
- Evidence displays (crime boards, document close-ups)
- Data visualization (timelines, maps with paths)
- Quote cards, title cards
- Photo montages with ken burns effect

## CONSISTENCY MANDATE
- ALL motion graphics of the same type in this video MUST look like they belong together
- If this is a quote_card, it must match every other quote_card in the video: same layout, fonts, colors, animations
- Track your style decisions: background color, text size, padding, animation timing
- Reference the video's visual style and adapt your compositions to match

## CONTEXT AWARENESS
You have access to:
- The narrative text during this shot
- Available stock images (with descriptions)
- Available AI reference images for entities
- Visual style guidelines

## OUTPUT FORMAT
Return valid JSON:
{
  "composition_type": "split_screen" | "layered_reveal" | "crime_board" | 
                      "document_focus" | "timeline" | "map_trace" | "quote_card",
  "description": "Detailed prose description of the composition...",
  "elements": [
    { "type": "image", "description": "Photo of Donald Trump at podium", "source": "stock" },
    { "type": "text", "content": "January 6, 2021", "style": "date_overlay" },
    { "type": "line", "connects": ["element_0", "element_1"] }
  ],
  "animation_notes": "Elements fade in sequentially from left to right",
  "duration_seconds": 5,
  "style_notes": "Dark, moody aesthetic with subtle glow effects"
}`;

const REMOTION_CODE_SYSTEM_PROMPT = `You are a Remotion developer converting composition specs into React/TypeScript code.

## REMOTION FUNDAMENTALS
- Remotion creates videos programmatically using React.js
- All output must be valid TypeScript/React code
- Default resolution: 1920x1080, frame rate: 30fps
- Code must be deterministic (no Math.random())

## CORE COMPONENTS & IMPORTS

### Basic Structure
\`\`\`tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Sequence, Img } from 'remotion';
import { Video, Audio } from '@remotion/media';
\`\`\`

### Media Tags (REQUIRED for media)
- \`<Video src="url" />\` - For video (has trimBefore, trimAfter, volume props)
- \`<Audio src="url" />\` - For audio (has trimBefore, trimAfter, volume props)
- \`<Img src="url" />\` - For static images
- \`<Gif src="url" />\` - For animated GIFs (from @remotion/gif)

### Layout & Timing
- \`<AbsoluteFill>\` - Layers elements on top of each other
- \`<Sequence from={10} durationInFrames={20}>\` - Shows element from specific frame
- \`<Series>\` - Sequential elements without specifying "from"
- \`<TransitionSeries>\` - Sequential with transitions (from @remotion/transitions)

## ANIMATION PATTERNS

### interpolate() - Linear animation
\`\`\`tsx
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
\`\`\`

### spring() - Physics-based animation
\`\`\`tsx
const scale = spring({
  fps,
  frame,
  config: { damping: 200 },
});
\`\`\`

### Deterministic randomness
\`\`\`tsx
import { random } from 'remotion';
const value = random('my-seed'); // Returns 0-1
\`\`\`

## COMPOSITION TYPES TO HANDLE
1. **split_screen** - Side-by-side comparison with divider
2. **layered_reveal** - Elements fading in with stagger
3. **crime_board** - Connected elements with lines
4. **document_focus** - Document with highlight effects
5. **timeline** - Horizontal timeline with markers
6. **map_trace** - Map with animated path
7. **quote_card** - Quote with attribution

## CODE REQUIREMENTS
1. Use \`useCurrentFrame()\` and \`useVideoConfig()\` hooks
2. Add \`extrapolateLeft: 'clamp'\` and \`extrapolateRight: 'clamp'\` to interpolate
3. Keep component under 200 lines
4. Use CSS-in-JS for all styling
5. Handle missing images with placeholder div

## OUTPUT FORMAT
Return valid JSON:
{
  "component_name": "CrimeBoardComposition",
  "code": "import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence } from 'remotion';\\n\\nexport const CrimeBoardComposition: React.FC = () => {\\n  const frame = useCurrentFrame();\\n  const { fps, durationInFrames } = useVideoConfig();\\n  // ... component code\\n};",
  "dependencies": ["remotion", "@remotion/media"],
  "estimated_render_time_ms": 500
}`;

const _SFX_DIRECTOR_SYSTEM_PROMPT = `You enhance video experiences through thoughtful audio design.

## YOUR ROLE
Sound effects should **enhance** the viewer experience—not distract from it.
You have complete creative freedom. Use your judgment to determine:
- Whether a shot needs SFX at all (many won't, and that's fine)
- What effect fits the moment (use descriptive names!)
- Exactly when it should trigger (millisecond precision via word timestamps)

## PHILOSOPHY
- **Less is more**: A well-placed effect has more impact than many
- **Serve the story**: Audio supports narration, never competes with it
- **Trust silence**: Some moments are stronger without sound design
- **Natural rhythm**: Effects should feel inevitable, not forced

## EFFECT NAMING
Use **descriptive 1-2 word names** for the \`type\` field (UI display):

✓ Good: "chain snap", "page flip", "door slam", "glass shatter", "crowd gasp"
✗ Bad: "impact", "whoosh", "hit", "sfx", "sound"

## EFFECT DESCRIPTION
For each effect, include a **single sentence description** for audio search/generation:
- Describe what the sound actually IS
- Include texture, intensity, and context
- Example: "Heavy metal chain links breaking sharply under tension"

## INPUT
You receive:
- Shot context (text, summary, duration, content_type)
- Word timestamps for the shot (word, start_seconds, end_seconds)
- Previous shots and whether they had SFX

## TIMING
Use word_timestamps to place effects with precision.
Effects can trigger ON a word, BEFORE it (0.1s), or AFTER it.
Timing is in absolute seconds (e.g., 12.345).

## OUTPUT
Return empty array if no SFX needed—that's a valid creative choice.
{
  "should_have_sfx": false,
  "sound_effects": []
}

Or with effects:
{
  "should_have_sfx": true,
  "sound_effects": [
    { 
      "type": "tension rise", 
      "description": "Low rumbling bass that builds in intensity, creating suspense",
      "trigger_at_seconds": 12.300, 
      "anchor_word": "until" 
    },
    { 
      "type": "chain snap", 
      "description": "Heavy metal chain links breaking sharply under tension",
      "trigger_at_seconds": 14.125, 
      "anchor_word": "chain" 
    }
  ]
}`;


// ============================================================================
// CONTEXT FORMATTERS
// ============================================================================

function formatContextForAgent(context: AgentContext): string {
  const parts: string[] = [];
  
  // Video context
  parts.push(`## VIDEO CONTEXT
Title: "${context.videoTitle}"
Summary: ${context.videoSummary || 'N/A'}
Style: ${context.visualStyle}
Aspect Ratio: ${context.aspectRatio}`);
  
  // Current shot
  parts.push(`## CURRENT SHOT (${context.shotIndex + 1}/${context.totalShots})
Duration: ${context.currentShot.duration_seconds.toFixed(1)}s
Content Type: ${context.currentShot.content_type}
Script: "${context.currentShot.text}"
Summary: "${context.currentShot.summary || 'N/A'}"`);
  
  // Word-level timing — RELATIVE to shot start (0s = shot begins)
  // Agents need timing within their shot, not absolute video position
  if (context.wordTimestamps && context.wordTimestamps.length > 0) {
    const shotStart = context.currentShot.start_seconds;
    const timingPairs = context.wordTimestamps.map(w => 
      `"${w.word}" @${(w.start_seconds - shotStart).toFixed(2)}s`
    );
    parts.push(`## WORD TIMING (relative to shot start, 0s = shot begins)
${timingPairs.join(', ')}`);
  }
  
  // Previous shots
  if (context.previousShots.length > 0) {
    parts.push(`## PREVIOUS SHOTS (for continuity)
${context.previousShots.map(s => {
  let line = `Shot ${s.segment_index + 1} [${s.media_type}]: "${s.summary}"`;
  if (s.visual_prompt) {
    line += `\n  → Visual prompt used: "${s.visual_prompt.substring(0, 200)}..."`;
  }
  return line;
}).join('\n')}`);
  }
  
  // Upcoming shots
  if (context.nextShots.length > 0) {
    parts.push(`## UPCOMING SHOTS (for transition planning)
${context.nextShots.map(s => 
  `Shot ${s.segment_index + 1} [${s.content_type}]: "${s.text}..."`
).join('\n')}`);
  }
  
  // Entities (Fix 7: include descriptions for visual consistency)
  if (context.characters.length > 0 || context.locations.length > 0 || context.objects.length > 0) {
    const entityLines: string[] = [];
    if (context.characters.length > 0) {
      entityLines.push(`Characters:\n${context.characters.map(c => {
        let desc = `  - ${c.name} (${c.role})`;
        if (c.appearance) desc += `\n    Appearance: ${c.appearance}`;
        if (c.wardrobe) desc += `\n    Wardrobe: ${c.wardrobe}`;
        return desc;
      }).join('\n')}`);
    }
    if (context.locations.length > 0) {
      entityLines.push(`Locations:\n${context.locations.map(l => {
        let desc = `  - ${l.name}: ${l.essence}`;
        if (l.type) desc += ` (${l.type})`;
        if (l.lighting) desc += `\n    Lighting: ${l.lighting}`;
        return desc;
      }).join('\n')}`);
    }
    if (context.objects.length > 0) {
      entityLines.push(`Objects:\n${context.objects.map(o => {
        let desc = `  - ${o.name} (${o.type})`;
        if (o.description) desc += `: ${o.description}`;
        return desc;
      }).join('\n')}`);
    }
    parts.push(`## ENTITIES IN THIS SHOT
${entityLines.join('\n')}`);
  }
  
  // User override
  if (context.userPromptOverride) {
    parts.push(`## USER CUSTOMIZATION
The user has provided specific instructions: "${context.userPromptOverride}"`);
  }
  
  return parts.join('\n\n');
}

// ============================================================================
// AGENT INVOCATION FUNCTIONS
// ============================================================================

/**
 * Route a shot to the appropriate agent based on media type.
 */
export async function routeToAgent(
  userId: string,
  mediaType: 'image' | 'video' | 'motiongraphic' | 'edit',
  context: AgentContext,
  inputImageUrl?: string,
  _compositionSpec?: MotionGraphicPromptOutput
): Promise<ImageGenerationOutput | ImageEditOutput | VideoCreationOutput | MotionGraphicPromptOutput | RemotionCodeOutput> {
  const formattedContext = formatContextForAgent(context);
  
  switch (mediaType) {
    case 'image':
      return invokeImageGenerationAgent(userId, formattedContext);
    
    case 'edit':
      if (!inputImageUrl) {
        throw new Error('inputImageUrl required for edit agent');
      }
      return invokeImageEditingAgent(userId, formattedContext, inputImageUrl);
    
    case 'video':
      if (!inputImageUrl) {
        throw new Error('inputImageUrl required for video agent');
      }
      return invokeVideoCreationAgent(userId, formattedContext, inputImageUrl);
    
    case 'motiongraphic':
      // 2-step pipeline
      const promptOutput = await invokeMotionGraphicPromptAgent(userId, formattedContext);
      const codeOutput = await invokeRemotionCodeAgent(userId, promptOutput);
      // For now, return the prompt output - Remotion code is logged but not executed
      console.log(`[AgentPrompts] Remotion code generated (placeholder):`, codeOutput.component_name);
      return promptOutput;
    
    default:
      throw new Error(`Unknown media type: ${mediaType}`);
  }
}

async function invokeImageGenerationAgent(
  userId: string,
  formattedContext: string
): Promise<ImageGenerationOutput> {
  console.log(`[AgentPrompts] Invoking Image Generation Agent`);
  
  const result = await generateJSON<ImageGenerationOutput>(
    userId,
    IMAGE_GENERATION_SYSTEM_PROMPT,
    `Generate an image prompt for this shot:\n\n${formattedContext}`,
    { maxTokens: 65536 }
  );
  
  return result;
}

async function invokeImageEditingAgent(
  userId: string,
  formattedContext: string,
  inputImageUrl: string
): Promise<ImageEditOutput> {
  console.log(`[AgentPrompts] Invoking Image Editing Agent`);
  
  const result = await generateJSON<ImageEditOutput>(
    userId,
    IMAGE_EDITING_SYSTEM_PROMPT,
    `Edit this image: ${inputImageUrl}\n\nContext:\n${formattedContext}`,
    { maxTokens: 65536 }
  );
  
  return result;
}

async function invokeVideoCreationAgent(
  userId: string,
  formattedContext: string,
  inputImageUrl: string
): Promise<VideoCreationOutput> {
  console.log(`[AgentPrompts] Invoking Video Creation Agent`);
  
  const result = await generateJSON<VideoCreationOutput>(
    userId,
    VIDEO_CREATION_SYSTEM_PROMPT,
    `Create motion for this keyframe: ${inputImageUrl}\n\nContext:\n${formattedContext}`,
    { maxTokens: 65536 }
  );
  
  return result;
}

async function invokeMotionGraphicPromptAgent(
  userId: string,
  formattedContext: string
): Promise<MotionGraphicPromptOutput> {
  console.log(`[AgentPrompts] Invoking Motion Graphic Prompt Agent (Step 1/2)`);
  
  const result = await generateJSON<MotionGraphicPromptOutput>(
    userId,
    MOTION_GRAPHIC_PROMPT_SYSTEM_PROMPT,
    `Design a motion graphic composition:\n\n${formattedContext}`,
    { maxTokens: 65536 }
  );
  
  return result;
}

async function invokeRemotionCodeAgent(
  userId: string,
  compositionSpec: MotionGraphicPromptOutput
): Promise<RemotionCodeOutput> {
  console.log(`[AgentPrompts] Invoking Remotion Code Agent (Step 2/2) [PLACEHOLDER]`);
  
  // PLACEHOLDER: In the future, this will generate actual Remotion code
  // For now, we log and return a stub
  const result = await generateJSON<RemotionCodeOutput>(
    userId,
    REMOTION_CODE_SYSTEM_PROMPT,
    `Convert this composition spec to Remotion code:\n\n${JSON.stringify(compositionSpec, null, 2)}`,
    { maxTokens: 65536 }
  );
  
  // Log the generated code for debugging
  console.log(`[AgentPrompts] Generated Remotion component: ${result.component_name}`);
  console.log(`[AgentPrompts] Code preview (first 200 chars): ${result.code.substring(0, 200)}...`);
  
  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  IMAGE_GENERATION_SYSTEM_PROMPT,
  IMAGE_EDITING_SYSTEM_PROMPT,
  VIDEO_CREATION_SYSTEM_PROMPT,
  MOTION_GRAPHIC_PROMPT_SYSTEM_PROMPT,
  REMOTION_CODE_SYSTEM_PROMPT,
};
