import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getLlmProviderConfig } from '@/lib/services/api-keys';
import { callOpenRouterWithKey } from '@/lib/ai/openrouter';

/**
 * POST /api/gpu-api/enhance-prompt
 *
 * Standalone prompt enhancer for the GPU API tester.
 * Uses model-specific prompting best practices (LTX-2.3, Z-Image Turbo,
 * Qwen-Image) without requiring project context.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await request.json();
    const {
      prompt,
      generationType,
      durationSeconds,
      aspectRatio,
      hasStartFrame,
      hasEndFrame,
    } = body as {
      prompt: string;
      generationType: 'image' | 'image-edit' | 'video';
      durationSeconds?: number;
      aspectRatio?: '16:9' | '9:16';
      hasStartFrame?: boolean;
      hasEndFrame?: boolean;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 3. Build type-specific system prompt
    const systemPrompt = buildSystemPrompt(generationType, {
      durationSeconds,
      aspectRatio,
      hasStartFrame,
      hasEndFrame,
    });

    // 4. Call LLM (respects user's active provider)
    const { apiKey, provider } = await getLlmProviderConfig(user.id);

    const result = await callOpenRouterWithKey(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ], {
      model: 'google/gemini-3-flash-preview',
      maxTokens: 1024,
      temperature: 0.7,
      xTitle: 'Vid-Bolt GPU Enhance Prompt',
      trackingUserId: user.id,
    }, provider);

    const enhancedPrompt = result.content.trim() || prompt;

    return NextResponse.json({ enhancedPrompt });
  } catch (error) {
    console.error('[gpu-enhance-prompt] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

interface VideoContext {
  durationSeconds?: number;
  aspectRatio?: '16:9' | '9:16';
  hasStartFrame?: boolean;
  hasEndFrame?: boolean;
}

function buildSystemPrompt(
  generationType: 'image' | 'image-edit' | 'video',
  videoCtx: VideoContext,
): string {
  switch (generationType) {
    case 'video':
      return buildVideoEnhancePrompt(videoCtx);
    case 'image':
      return buildImageEnhancePrompt(videoCtx.aspectRatio);
    case 'image-edit':
      return buildImageEditEnhancePrompt();
    default:
      return 'Enhance the prompt to be more detailed and specific. Output ONLY the enhanced prompt text.';
  }
}

function buildVideoEnhancePrompt(ctx: VideoContext): string {
  const durationNote = ctx.durationSeconds
    ? `The video will be ${ctx.durationSeconds} seconds long. Pace the described action to fit naturally within this duration.`
    : '';
  const aspectNote = ctx.aspectRatio === '9:16'
    ? 'This is PORTRAIT (9:16) video — compose for vertical framing intentionally. Favor close-ups, vertical movement (tilts), and subjects stacked in foreground/background. Do NOT describe a scene that assumes wide horizontal framing.'
    : 'This is LANDSCAPE (16:9) video — compose for wide horizontal framing.';
  const frameNote = ctx.hasStartFrame && ctx.hasEndFrame
    ? 'This is a keyframe INTERPOLATION — the video must transition from the start frame to the end frame. Describe motion that naturally bridges between two keyframes.'
    : ctx.hasStartFrame
      ? 'This is IMAGE-TO-VIDEO — the video starts from a provided keyframe image. Describe motion that animates FROM the starting frame. Do not describe elements that contradict what would be in the start image.'
      : 'This is TEXT-TO-VIDEO — no starting image is provided. The model generates everything from text alone.';

  return `You are an expert prompt engineer for LTX-2.3 video generation.

GENERATION CONTEXT:
${durationNote}
${aspectNote}
${frameNote}

Transform the user's simple prompt into a rich, detailed video generation prompt optimized for LTX-2.3. Follow these rules:

PROMPT STRUCTURE:
1. Establish the shot type (close-up, medium, wide, etc.)
2. Set the scene with lighting, color palette, atmosphere
3. Block the scene with explicit spatial layout (left/right, foreground/background, facing directions)
4. Describe textures and materials (fabric types, hair texture, surface finish, environmental wear)
5. Use ACTION VERBS for all motion — specify WHO moves, WHAT moves, HOW they move
6. Specify camera movement explicitly (pushes in, tracks left, tilts up, etc.)
7. Include audio description (environmental sounds, tone, intensity)

CRITICAL RULES:
- Specificity wins — LTX-2.3 has a 4× larger text encoder and handles complex, layered prompts
- Write as a single flowing paragraph — longer prompts yield better results
- NEVER write a static, photo-like description — always include motion (even subtle: breathing, wind, particles)
- Keep the user's original creative intent completely intact
- Do NOT include any explanation — output ONLY the enhanced prompt text`;
}

function buildImageEnhancePrompt(aspectRatio?: string): string {
  const aspectNote = aspectRatio === '9:16'
    ? 'This is a PORTRAIT image — compose for vertical framing.'
    : 'This is a LANDSCAPE image — compose for wide horizontal framing.';

  return `You are an expert prompt engineer for Z-Image Turbo (AI image generation).

${aspectNote}

Transform the user's simple prompt into a detailed, structured image generation prompt. Follow this scaffold:

1. Shot & Subject — shot type (close-up, medium, wide) + who/what is the focus
2. Age & Appearance — specific physical traits if applicable
3. Clothing & Attire — what they're wearing, level of detail
4. Environment/Background — setting, keep it relevant
5. Lighting — be specific: "soft diffused daylight", "cinematic warm key light", "rim lighting"
6. Mood/Vibe — emotional tone: "calm professional", "tense cinematic", "hopeful"
7. Style/Medium — "realistic photograph", "cinematic film still", "documentary still"
8. Technical Notes — camera specs: "50mm lens, shallow depth of field, 4K"
9. Constraints — end with: "no text, no watermark, no logos, no extra limbs"

CRITICAL RULES:
- Z-Image uses positive-only prompting (no negative prompt support)
- Include quality anchors: cinematic depth of field, volumetric lighting, film grain
- Prefer compositions with DEPTH: foreground element + clear subject + contextual background
- Keep the user's original creative intent completely intact
- Keep prompt between 80-250 words
- Do NOT include any explanation — output ONLY the enhanced prompt text`;
}

function buildImageEditEnhancePrompt(): string {
  return `You are an expert prompt engineer for Qwen-Image (AI image editing).

Transform the user's simple edit instruction into a clear, specific edit prompt. Follow these rules:

TASK CLASSIFICATION:
- Add/Delete/Replace: supplement vague instructions with details (category, color, size, position)
  Example: "Add an animal" → "Add a light-gray cat in the bottom-right corner, sitting and facing the camera"
- Text editing: wrap text content in English double quotes
- Style conversion: describe style using key visual features at the end
- Human editing: maintain core visual consistency (ethnicity, gender, age, hairstyle)

CRITICAL RULES:
- Keep edit prompts direct and specific
- Keep core intention unchanged, only enhance clarity
- All modifications must align with the input image's scene logic
- When replacing, specify "Replace Y with X" with key visual features of X
- Expression/makeup changes must be natural and subtle
- Keep the user's original creative intent completely intact
- Do NOT include any explanation — output ONLY the enhanced edit prompt text`;
}

function buildSegmentImageEnhancePrompt(): string {
  return `You are an expert prompt engineer for SAM 3 (Segment Anything Model 3) image segmentation.

SAM 3 uses open-vocabulary object detection via text prompts to find and segment objects in images.
Your job is to transform the user's casual description into an optimized SAM 3 text prompt.

PROMPT RULES:
- Use simple, concrete NOUN PHRASES that name the objects to detect
- Be specific about the object category: "red sedan car" not just "car"
- For multiple objects, use a clear comma-separated list: "person, dog, bicycle"
- Add distinguishing visual attributes when helpful: color, size, position, material
- Use singular nouns for individual objects ("person") or plurals for groups ("all cars")
- Avoid verbs, sentences, or action descriptions — SAM 3 detects OBJECTS, not actions
- Avoid abstract concepts — only describe visually detectable things
- Keep it concise: 2-15 words is ideal

GOOD EXAMPLES:
- "person in red shirt" (specific attribute)
- "all cars and trucks" (category grouping)
- "black cat on the table" (object + location)
- "face" (simple, direct)
- "street sign, traffic light, crosswalk" (multi-object)

BAD EXAMPLES:
- "segment everything in the image" (too vague)
- "the thing moving on the left" (action-based, not object-based)
- "something interesting" (abstract)

CRITICAL: Output ONLY the enhanced prompt text. No explanation, no quotes, no formatting.`;
}

function buildSegmentVideoEnhancePrompt(): string {
  return `You are an expert prompt engineer for SAM 3 (Segment Anything Model 3) video object tracking.

SAM 3 uses open-vocabulary object detection via text prompts to find objects in a video frame and then TRACK them across all subsequent frames.
Your job is to transform the user's casual description into an optimized SAM 3 video tracking text prompt.

PROMPT RULES:
- Use simple, concrete NOUN PHRASES that name the objects to track
- Be specific about the target: "person wearing blue jacket" not just "person"
- For tracking, specificity is critical — distinguish your target from similar objects in the scene
- Add visual attributes: color, clothing, size, position, distinguishing features
- Use singular nouns when tracking one specific object
- Use plurals or lists when tracking multiple objects: "all pedestrians", "red car, blue truck"
- Avoid verbs and action descriptions — SAM 3 detects OBJECTS then tracks motion automatically
- Avoid abstract concepts — only describe visually detectable things
- Keep it concise: 2-15 words is ideal

GOOD EXAMPLES:
- "person in red jacket walking" → "person in red jacket" (remove the verb)
- "the ball" → "soccer ball" (add specificity)
- "yellow school bus" (specific + distinctive)
- "dancer in white dress, drummer" (multi-target)

BAD EXAMPLES:
- "track the moving object" (too vague, uses verb)
- "whatever is most interesting" (abstract)
- "the thing that appears at 0:15" (temporal reference, not visual)

CRITICAL: Output ONLY the enhanced prompt text. No explanation, no quotes, no formatting.`;
}
