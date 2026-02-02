/**
 * Multi-Agent Prompt Architecture
 * ============================================================================
 * Specialized AI agents for different media generation tasks.
 * Each agent receives comprehensive context and produces optimized prompts
 * for their specific media type.
 */

import { generateJSON } from '@/lib/ai/openrouter';

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
  referenceImageUrl?: string;
}

export interface LocationRef {
  id: string;
  name: string;
  essence: string;
  referenceImageUrl?: string;
}

export interface ObjectRef {
  id: string;
  name: string;
  type: string;
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
  audio_description?: string;  // LTX-2 supports audio description
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

## CONTEXT AWARENESS
You have access to:
- Previous shots (for visual continuity)
- Upcoming shots (for transition planning)  
- Entity references (characters, locations, objects)
- Video's overall visual style

## EXAMPLE PROMPT
"A medium-shot portrait of @(John Smith), a man in his 40s with short gray hair and weathered features, wearing a dark navy suit and white shirt, fully clothed, professional attire. Standing in a modern courtroom with soft blurred wooden panels in the background. Soft diffused daylight from tall windows, warm undertones. Calm but determined expression, slight tension in the jaw. Realistic cinematic photography, 85mm lens, shallow depth of field, film grain, 4K quality. Plain background, no text, no watermark, no logos, correct human anatomy."

## OUTPUT FORMAT
Return valid JSON:
{
  "prompt": "80-250 word structured prompt following the scaffold above...",
  "constraint_phrases": ["no text", "no watermark", "no logos", "no extra limbs"],
  "seed_suggestion": null,
  "quality_anchors": ["photorealistic", "cinematic", "4K", "film grain"]
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

const VIDEO_CREATION_SYSTEM_PROMPT = `You are a cinematographer directing AI-generated video sequences for LTX-2.

## MODEL CHARACTERISTICS (LTX-2)
- Story-driven prompts work best - describe action as a natural sequence
- Write 4-8 descriptive sentences in a single flowing paragraph
- Use present tense verbs for movement and action
- Include camera language, character details, and atmosphere

## KEY ASPECTS TO INCLUDE

1. **Establish the shot** - Use cinematography terms: close-up, medium shot, wide shot, over-the-shoulder
2. **Set the scene** - Lighting conditions, color palette, textures, atmosphere
3. **Describe the action** - Write as natural sequence from beginning to end
4. **Define characters** (if any) - Age, clothing, emotions through physical cues
5. **Specify camera movement** - When view shifts and how: "camera slowly pans right", "dolly back"
6. **Describe ambient audio** - "soft ambient noise", "distant traffic", "wind through trees"

## CAMERA LANGUAGE VOCABULARY
- Movement: follows, tracks, pans across, circles around, tilts upward, pushes in, pulls back, dollys, cranes
- Style: handheld movement, static frame, overhead view, over-the-shoulder
- Effects: slow motion, time-lapse, freeze-frame, lingering shot, continuous shot

## TECHNICAL STYLE MARKERS
- Film characteristics: film grain, lens flares, shallow depth of field
- Pacing: slow motion, lingering shot, dynamic movement
- Atmosphere: fog, rain, dust particles, smoke, bokeh

## WHAT WORKS WELL
- Single flowing paragraph describing entire motion sequence
- Clear beginning → middle → end structure
- Camera movement described relative to subject
- Ambient details that add immersion (wind, light shifts, particles)

## WHAT TO AVOID
- Changing the subject from the input keyframe
- Sudden jerky movements that break immersion
- Motion that doesn't match the mood/narration
- Adding new elements not in the starting frame

## EXAMPLE PROMPT
"The camera opens on a medium shot of the investigator standing at his desk, papers scattered before him. Soft golden afternoon light streams through venetian blinds, casting striped shadows across his weathered face. He slowly raises his head, eyes narrowing as realization dawns. The camera pushes in gently, framing his face in close-up as dust particles drift through the light beams. His hand reaches deliberately toward a photograph on the desk. Ambient office sounds—distant typing, a clock ticking—fill the silence."

## OUTPUT FORMAT
Return valid JSON:
{
  "motion_prompt": "4-8 sentences in a single flowing paragraph...",
  "camera_motion": "pushes" | "tracks" | "pans" | "static" | "follows" | "dollys" | "handheld",
  "motion_intensity": "subtle" | "moderate" | "dynamic",
  "loop_compatible": false,
  "audio_description": "soft ambient description of sound"
}`;

const MOTION_GRAPHIC_PROMPT_SYSTEM_PROMPT = `You are a motion graphics director designing COMPOSITIONS for documentary visuals.

## YOUR ROLE
Expand a brief shot description into a detailed composition plan.
Describe WHAT elements should appear and HOW they should be arranged.

## WHEN TO USE MOTION GRAPHICS
- Comparisons (side-by-side, before/after)
- Evidence displays (crime boards, document close-ups)
- Data visualization (timelines, maps with paths)
- Quote cards, title cards
- Photo montages with ken burns effect

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

const SFX_DIRECTOR_SYSTEM_PROMPT = `You enhance video experiences through thoughtful audio design.

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
Style: ${context.visualStyle}
Aspect Ratio: ${context.aspectRatio}`);
  
  // Current shot
  parts.push(`## CURRENT SHOT (${context.shotIndex + 1}/${context.totalShots})
Duration: ${context.currentShot.duration_seconds.toFixed(1)}s
Content Type: ${context.currentShot.content_type}
Script: "${context.currentShot.text}"
Summary: "${context.currentShot.summary || 'N/A'}"`);
  
  // Previous shots
  if (context.previousShots.length > 0) {
    parts.push(`## PREVIOUS SHOTS (for continuity)
${context.previousShots.map(s => 
  `Shot ${s.segment_index + 1} [${s.media_type}]: "${s.summary}"`
).join('\n')}`);
  }
  
  // Upcoming shots
  if (context.nextShots.length > 0) {
    parts.push(`## UPCOMING SHOTS (for transition planning)
${context.nextShots.map(s => 
  `Shot ${s.segment_index + 1} [${s.content_type}]: "${s.text}..."`
).join('\n')}`);
  }
  
  // Entities
  if (context.characters.length > 0 || context.locations.length > 0 || context.objects.length > 0) {
    const entityLines: string[] = [];
    if (context.characters.length > 0) {
      entityLines.push(`Characters: ${context.characters.map(c => `${c.name} (${c.role})`).join(', ')}`);
    }
    if (context.locations.length > 0) {
      entityLines.push(`Locations: ${context.locations.map(l => `${l.name}`).join(', ')}`);
    }
    if (context.objects.length > 0) {
      entityLines.push(`Objects: ${context.objects.map(o => `${o.name}`).join(', ')}`);
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
  compositionSpec?: MotionGraphicPromptOutput
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
    `Generate an image prompt for this shot:\n\n${formattedContext}`
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
    `Edit this image: ${inputImageUrl}\n\nContext:\n${formattedContext}`
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
    `Create motion for this keyframe: ${inputImageUrl}\n\nContext:\n${formattedContext}`
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
    `Design a motion graphic composition:\n\n${formattedContext}`
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
    `Convert this composition spec to Remotion code:\n\n${JSON.stringify(compositionSpec, null, 2)}`
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
