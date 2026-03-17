/**
 * Prompt Enhancement API Route
 * ============================================================================
 * POST /api/video-editor/enhance-prompt
 *
 * Enhances a user's raw generation prompt using LLM + project style context.
 * Pulls the project's creative direction (visual style, master creative prompt,
 * color palette, lighting mood, etc.) and instructs the LLM to produce a
 * more detailed, style-consistent prompt.
 *
 * Requires: OpenRouter API key (user or platform default).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';

// Service role client for DB reads
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration error');
  return createServiceClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await request.json();
    const { prompt, generationType, projectId } = body as {
      prompt: string;
      generationType: 'image' | 'image-edit' | 'video';
      projectId: string;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // 3. Fetch project creative direction
    const serviceClient = getServiceClient();
    const { data: project } = await serviceClient
      .from('video_projects')
      .select('settings')
      .eq('id', projectId)
      .single();

    const cd = project?.settings?.visuals?.creativeDirection || {};
    const visualStyle = cd.visualStyle || '';
    const masterCreativePrompt = cd.masterCreativePrompt || '';
    const lightingMood = cd.lightingMood || '';
    const colorPalette = (cd.colorPalette || []).join(', ');
    const qualityAnchors = (cd.qualityAnchors || []).join(', ');
    const imageConstraints = (cd.imageConstraints || []).join(', ');

    // 4. Get OpenRouter API key
    const openRouterKey = await getOpenRouterApiKey(user.id);

    // 5. Build system prompt
    const typeLabel =
      generationType === 'video'
        ? 'video generation'
        : generationType === 'image-edit'
          ? 'image editing'
          : 'image generation';

    const systemPrompt = `You are an expert prompt engineer for AI ${typeLabel}.
Enhance the user's prompt to be more detailed, specific, and optimized for ${typeLabel} while matching the project's established visual style.

PROJECT VISUAL STYLE: ${visualStyle || 'Not specified'}
LIGHTING/MOOD: ${lightingMood || 'Not specified'}
CREATIVE DIRECTION: ${masterCreativePrompt || 'Not specified'}
COLOR PALETTE: ${colorPalette || 'Not specified'}
QUALITY ANCHORS: ${qualityAnchors || 'Not specified'}
IMAGE CONSTRAINTS: ${imageConstraints || 'Not specified'}

Rules:
- Keep the user's original intent completely intact
- Add specific lighting, composition, color, and style details
- Match the project's established visual language and aesthetic
- Be concise but descriptive (2-3 sentences max)
- ${generationType === 'video' ? 'Include specific camera movement, action verbs for motion (who moves, what moves, how), spatial blocking (left/right, foreground/background), texture and material details, and audio descriptions. Write as a rich, detailed paragraph — LTX 2.3 rewards specificity over simplicity' : 'Focus on composition, color, and detail'}
- Do NOT include any explanation — output ONLY the enhanced prompt text`;

    // 6. Call OpenRouter
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
      console.error('[enhance-prompt] OpenRouter error:', errBody);
      return NextResponse.json(
        { error: `AI enhancement failed (${openRouterRes.status})` },
        { status: 502 }
      );
    }

    const openRouterData = await openRouterRes.json();
    const enhancedPrompt =
      openRouterData.choices?.[0]?.message?.content?.trim() || prompt;

    return NextResponse.json({ enhancedPrompt });
  } catch (error) {
    console.error('[enhance-prompt] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
