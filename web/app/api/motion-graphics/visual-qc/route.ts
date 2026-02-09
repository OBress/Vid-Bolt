/**
 * POST /api/motion-graphics/visual-qc
 * 
 * Visual Quality Check endpoint for motion graphics.
 * Receives base64 screenshots + original prompt, sends to a vision-capable AI model
 * for quality analysis. Returns a quality assessment with score, issues, and suggestions.
 * 
 * Auth: Supabase session (same pattern as /api/motion-graphics/generate)
 * API Key: x-openrouter-key header OR fetched from user_api_keys table
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ============================================================
// VISION QC PROMPT
// ============================================================

const VISUAL_QC_PROMPT = `You are a motion graphics quality inspector for Remotion animations.

Given screenshots of a generated animation at key frames, determine if the output PASSES or FAILS against the user's original request.

A result PASSES if ALL of the following are true:
1. **INTENT MATCH**: The animation matches what the user asked for — all requested elements are present.
2. **NO VISUAL BUGS**: No text overflow, misalignment, blank/empty frames, broken layouts, overlapping elements, cut-off text, or invisible elements (e.g. white text on white background).
3. **ANIMATION EXISTS**: The frames show different visual states — if all frames look identical, there is no animation.

A result FAILS if ANY of the above are not met.

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "passed": true,
  "issues": [],
  "suggestions": [],
  "summary": "Animation matches the request with no visual issues"
}

Rules:
- "passed": true if the output is acceptable, false if it needs to be regenerated
- "issues": list of specific problems found (empty array if passed)
- "suggestions": actionable code-level fixes the AI could implement (empty array if passed)
- "summary": single concise sentence explaining the verdict`;

// ============================================================
// HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via Supabase session
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore - can happen during SSR
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get OpenRouter API key
    let apiKey = request.headers.get('x-openrouter-key');
    
    if (!apiKey) {
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: apiKeyData } = await serviceClient
        .from('user_api_keys')
        .select('openrouter_key')
        .eq('user_id', user.id)
        .single();

      apiKey = apiKeyData?.openrouter_key;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured.' },
        { status: 400 }
      );
    }

    // 3. Parse request body
    const body = await request.json();
    const { screenshots, prompt, model } = body as {
      screenshots: string[];
      prompt: string;
      model: string;
    };

    if (!screenshots?.length || !prompt || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: screenshots, prompt, model' },
        { status: 400 }
      );
    }

    // 4. Build vision message with images
    // Use a vision-capable model — fallback to a known one if the selected model doesn't support vision
    const visionModel = getVisionCapableModel(model);

    const imageContent = screenshots.map((screenshot, i) => ({
      type: 'image_url' as const,
      image_url: {
        url: screenshot, // base64 data URL
        detail: 'low' as const, // Low detail to save tokens
      },
    }));

    const messages = [
      {
        role: 'system',
        content: VISUAL_QC_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text' as const,
            text: `Original user request: "${prompt}"\n\nHere are ${screenshots.length} screenshots from the generated animation (frames: start, middle, end). Evaluate the quality:`,
          },
          ...imageContent,
        ],
      },
    ];

    // 5. Call OpenRouter with vision model
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Vid-Bolt Visual QC',
      },
      body: JSON.stringify({
        model: visionModel,
        messages,
        temperature: 0.3, // Low temperature for consistent evaluation
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VisualQC API] OpenRouter error:', errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Vision analysis failed: HTTP ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from vision model' },
        { status: 502 }
      );
    }

    // 6. Parse and validate the QC result
    let qcResult;
    try {
      qcResult = JSON.parse(content);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          qcResult = JSON.parse(jsonMatch[0]);
        } catch {
          qcResult = {
            passed: false,
            score: 5,
            issues: ['Could not parse vision model response'],
            suggestions: [],
            summary: content.substring(0, 100),
          };
        }
      }
    }

    // Ensure required fields exist
    const result = {
      passed: qcResult?.passed === true,
      issues: Array.isArray(qcResult?.issues) ? qcResult.issues : [],
      suggestions: Array.isArray(qcResult?.suggestions) ? qcResult.suggestions : [],
      summary: qcResult?.summary || 'Analysis complete',
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('[VisualQC API] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Ensure we're using a vision-capable model.
 * If the user's selected model doesn't support vision, fall back to a known one.
 */
function getVisionCapableModel(requestedModel: string): string {
  // Models known to support vision via OpenRouter
  const visionModels = [
    'google/gemini-3-flash-preview',
    'google/gemini-2.0-flash',
    'google/gemini-pro-vision',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-haiku',
    'anthropic/claude-3-sonnet',
  ];

  // If the requested model supports vision, use it
  if (visionModels.some(m => requestedModel.includes(m.split('/')[1]))) {
    return requestedModel;
  }

  // Default to Gemini Flash for vision (fast + cheap + good at vision)
  return 'google/gemini-3-flash-preview';
}
