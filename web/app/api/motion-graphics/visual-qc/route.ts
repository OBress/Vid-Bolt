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

const VISUAL_QC_PROMPT = `You are a strict motion graphics quality inspector for Remotion animations.

Given screenshots of a generated animation at key frames AND the source code that produced them, determine if the output PASSES or FAILS against the user's original request.

You MUST cross-reference what you SEE in the screenshots with the ACTUAL CODE to identify exactly which code elements are causing issues.

Note: The source code may be truncated for length — do NOT treat truncated code as a render failure. Judge by what you see in the screenshots.

## EVALUATION CHECKLIST

### 1. ELEMENT COMPLETENESS (Critical)
Cross-reference the user's prompt against the screenshots. Every element, visual feature, or data point requested MUST be visually present. Examples:
- If user asked for a "world map with country outlines" → country shapes must be visible, not just dots
- If user asked for "chart with 5 bars" → all 5 bars must appear
- If user asked for "text that says X" → that exact text must be readable
- Missing any requested element = FAIL

### 2. COMPILATION / RENDER FAILURE (Critical)
- If ALL frames are completely blank, solid color, or show only a background with no content → FAIL (likely a compilation error)
- If frames show error messages or raw code → FAIL
- A single frame being blank is acceptable (may be a transition), but most frames should have content

### 3. VISUAL BUGS (Important)
- Text overflow, cut-off text, or text extending beyond boundaries
- Elements overlapping incorrectly (e.g., labels hidden behind shapes, text behind images)
- Elements positioned outside the visible canvas (partially or fully)
- Invisible elements (white on white, black on black, zero opacity)
- Misaligned or broken layouts

### 4. LAYERING & Z-ORDER (Important)
- Labels and text should appear ABOVE backgrounds and shapes, never hidden behind them
- Interactive elements (markers, dots, icons) should be visible above map/chart backgrounds
- If elements appear to be "underneath" other elements when they shouldn't be → FAIL

### 5. ANIMATION EXISTS
- The frames should show different visual states across time
- If all frames look completely identical with no motion or transitions → FAIL (no animation)

## ELEMENT IDENTIFICATION (CRITICAL)

When reporting issues, you MUST identify the SPECIFIC code element causing each problem:
- Reference elements by their variable name, constant name, or JSX component name from the source code
- For example: "TITLE_TEXT", "mapGroup", "barChart", "particles array", "<Circle /> at index 3"
- Look at the code's constants, variable names, and JSX structure to find the exact element
- If you can't identify the exact variable, describe the element precisely (e.g., "the blue circle in the top-right")

## VERDICT
- PASS only if ALL above criteria are met
- FAIL if ANY criterion is violated

## THOROUGHNESS (CRITICAL)
- List EVERY issue you can find, not just the most obvious one. The developer needs to fix ALL problems in a single pass.
- For each issue, identify the EXACT code element (by variable/constant/component name) and describe what's wrong.
- For each suggestion, give a concrete code-level fix referencing the specific variable or JSX element.
- If the animation is mostly blank, diagnose WHY: is it a runtime error? Wrong projection? Elements positioned off-screen? Zero opacity?

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "passed": true,
  "elementIssues": [
    {
      "elementId": "variable/constant/component name from the code",
      "elementDescription": "What this element represents visually",
      "issue": "What is wrong with this element",
      "severity": "critical|major|minor",
      "suggestedFix": "Specific code change to fix this element"
    }
  ],
  "generalIssues": ["Non-element-specific problems like missing animation"],
  "summary": "Single concise sentence explaining the verdict"
}

Rules:
- "passed": true if the output is acceptable, false if it needs to be regenerated
- "elementIssues": array of objects, each identifying a specific code element and what's wrong. Be exhaustive.
- "generalIssues": problems that don't map to a specific element (e.g., "no animation detected")
- "summary": single concise sentence explaining the verdict
- If passed is true, both issue arrays should be empty`;

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
    const { screenshots, prompt, model, code } = body as {
      screenshots: string[];
      prompt: string;
      model: string;
      code?: string;
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

    const imageContent = screenshots.map((screenshot, _i) => ({
      type: 'image_url' as const,
      image_url: {
        url: screenshot, // base64 data URL
        detail: 'high' as const, // High detail for thorough visual analysis
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
            text: `Original user request: "${prompt}"\n\n${code ? `Source code that generated this animation:\n\`\`\`tsx\n${code.substring(0, 6000)}\n\`\`\`\n\nCross-reference the screenshots below with the source code above. Identify issues by referencing specific variable names, constants, or JSX elements from the code.\n\n` : ''}Here are ${screenshots.length} screenshots from the generated animation (frames at 0.5s intervals). Evaluate the quality:`,
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
        max_tokens: 2000, // Increased for element-specific detail
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

    // Ensure required fields exist — normalize both new and legacy formats
    const elementIssues = Array.isArray(qcResult?.elementIssues) ? qcResult.elementIssues : [];
    const generalIssues = Array.isArray(qcResult?.generalIssues) ? qcResult.generalIssues : [];

    // Legacy fallback: if model returned old-format issues/suggestions, convert them
    const legacyIssues = Array.isArray(qcResult?.issues) ? qcResult.issues : [];
    const legacySuggestions = Array.isArray(qcResult?.suggestions) ? qcResult.suggestions : [];

    // If no elementIssues but has legacy issues, keep them as generalIssues
    const mergedGeneralIssues = generalIssues.length > 0 ? generalIssues
      : (elementIssues.length === 0 && legacyIssues.length > 0) ? legacyIssues
      : generalIssues;

    const result = {
      passed: qcResult?.passed === true,
      issues: legacyIssues,       // Keep for backward compat
      suggestions: legacySuggestions, // Keep for backward compat
      elementIssues,
      generalIssues: mergedGeneralIssues,
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
