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
  negative_prompt: string;
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
  camera_motion: 'slow_push' | 'static' | 'pan_left' | 'pan_right' | 'pull_back' | 'drift';
  motion_intensity: 'subtle' | 'moderate' | 'dynamic';
  loop_compatible: boolean;
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

const IMAGE_GENERATION_SYSTEM_PROMPT = `You are a cinematic still photographer creating KEYFRAME images for a documentary video.

## YOUR ROLE
Create a single, powerful image that captures the essence of this moment.
Think: iconic movie stills, Pulitzer-winning photos, National Geographic covers.

## CONTEXT AWARENESS
You have access to:
- Previous shots (for visual continuity)
- Upcoming shots (for transition planning)
- Entity references (characters, locations, objects)
- Video's overall visual style

## PROMPT REQUIREMENTS
Your prompt must include:
1. **Subject** - Who/what is the focus? Be specific.
2. **Composition** - Camera angle, framing, rule of thirds
3. **Lighting** - Natural, studio, dramatic shadows, golden hour
4. **Atmosphere** - Mood, color grading, film stock aesthetic
5. **Style anchors** - Consistency keywords (if entity appears elsewhere)

## CONSTRAINTS
- Maximum 150 words
- NO text on screen (will be added separately)
- NO motion descriptions (this is a still image)
- Reference @(EntityName) syntax for known characters/locations
- Maintain visual consistency with previous shots showing same entities

## OUTPUT FORMAT
Return valid JSON:
{
  "prompt": "A detailed image generation prompt...",
  "negative_prompt": "Things to avoid...",
  "seed_suggestion": null,
  "quality_anchors": ["photorealistic", "cinematic", ...]
}`;

const IMAGE_EDITING_SYSTEM_PROMPT = `You are a photo editor refining an existing image for a documentary video.

## YOUR ROLE
You're given an INPUT IMAGE and a description of what changes are needed.
Preserve the original composition while making targeted modifications.

## EDIT TYPES YOU HANDLE
1. **Style transfer** - Apply new color grading, film look
2. **Enhancement** - Improve lighting, sharpness, contrast
3. **Composition adjustment** - Extend canvas, reframe
4. **Element modification** - Change specific details

## CONTEXT AWARENESS
You have access to:
- The original image URL
- What the user wants changed
- The shot's role in the narrative
- Visual style of the entire video

## PROMPT REQUIREMENTS
Your edit prompt must:
1. Reference what to KEEP from the original
2. Specify what to CHANGE clearly
3. Maintain consistency with the video's style
4. NOT introduce new subjects unless requested

## OUTPUT FORMAT
Return valid JSON:
{
  "edit_prompt": "Keep the composition and lighting, but...",
  "preserve_elements": ["face", "background structure", ...],
  "change_elements": ["color grading to warmer tones", ...],
  "mask_description": null
}`;

const VIDEO_CREATION_SYSTEM_PROMPT = `You are a cinematographer directing AI-generated video sequences.

## YOUR ROLE
Create a SHORT MOTION CLIP (3-5 seconds) that brings a keyframe to life.
Think: B-roll that breathes, subtle motion that adds immersion.

## CONTEXT AWARENESS
You have access to:
- The input keyframe image
- Duration in seconds
- Previous shots (for motion continuity)
- Upcoming shots (for transition planning)
- The narration during this shot

## MOTION PHILOSOPHY
**Less is more.** Subtle, intentional motion beats chaotic movement.

Good motion:
- Camera slowly pushes in on subject
- Subject naturally breathes/shifts
- Environment has ambient motion (wind, light flicker)
- Smooth transition from still to motion

Bad motion:
- Sudden jerky movements
- Motion that doesn't match the mood
- Changing the subject during the clip
- Adding elements not in the keyframe

## PROMPT REQUIREMENTS
Your video prompt must include:
1. **Camera motion** - Push, pull, pan, static with subtle drift
2. **Subject motion** - How does the subject move?
3. **Environment motion** - Ambient details (wind, light, particles)
4. **Pacing** - Slow/rhythmic for emotional, faster for action

## CONSTRAINTS
- Input image is your starting frame - DON'T change the subject
- Match the energy of the narration
- Consider what comes before and after
- Maximum 100 words

## OUTPUT FORMAT
Return valid JSON:
{
  "motion_prompt": "Camera slowly pushes in while...",
  "camera_motion": "slow_push",
  "motion_intensity": "subtle",
  "loop_compatible": false
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

const REMOTION_CODE_SYSTEM_PROMPT = `You are a Remotion developer converting composition specs into React code.

## YOUR ROLE
Take a motion graphic composition description and generate the Remotion
component code that renders it.

## INPUT
You receive a JSON composition spec with:
- composition_type (determines which base template to use)
- elements array (images, text, lines, shapes)
- animation_notes (timing and motion direction)
- duration_seconds
- style_notes

## OUTPUT
Generate a self-contained Remotion component that:
1. Uses standard Remotion primitives (AbsoluteFill, Sequence, Img, etc.)
2. Applies animations using useCurrentFrame() and interpolate()
3. Handles element positioning based on the spec
4. Applies consistent styling

## CONSTRAINTS
- Use only standard Remotion APIs
- Keep component under 200 lines
- Use CSS-in-JS for styling
- Handle missing images gracefully with placeholders

## OUTPUT FORMAT
Return valid JSON:
{
  "component_name": "CrimeBoardComposition",
  "code": "import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';\\n\\nexport const CrimeBoardComposition = () => {\\n  ...\\n};",
  "dependencies": ["remotion"],
  "estimated_render_time_ms": 500
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
