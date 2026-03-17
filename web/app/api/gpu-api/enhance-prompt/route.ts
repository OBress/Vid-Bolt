import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';

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

    // 4. Call OpenRouter
    const openRouterKey = await getOpenRouterApiKey(user.id);

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!openRouterRes.ok) {
      const errBody = await openRouterRes.text();
      console.error('[gpu-enhance-prompt] OpenRouter error:', errBody);
      return NextResponse.json(
        { error: `AI enhancement failed (${openRouterRes.status})` },
        { status: 502 },
      );
    }

    const data = await openRouterRes.json();
    const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;

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
