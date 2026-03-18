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
import { callOpenRouterWithKey } from '@/lib/ai/openrouter';



// ============================================================
// VISION QC PROMPT
// ============================================================

const VISUAL_QC_PROMPT = `You are a pragmatic motion graphics quality inspector for Remotion animations.

Given screenshots of a generated animation at key frames AND the source code that produced them, determine if the output is ACCEPTABLE against the user's original request.

You MUST cross-reference what you SEE in the screenshots with the ACTUAL CODE to identify exactly which code elements are causing issues.

Note: The source code may be truncated for length — do NOT treat truncated code as a render failure. Judge by what you see in the screenshots.

## EVALUATION PHILOSOPHY

Think like a creative director doing a quick review — NOT a pixel-perfect QA tester. The goal is to catch genuinely broken animations, not nitpick cosmetic imperfections. Motion graphics are inherently imprecise — slight position offsets, minor overlaps, and approximate geographic placement are NORMAL and ACCEPTABLE.

## VERDICT TIERS (CRITICAL — READ CAREFULLY)

### FAIL — Only for genuinely broken output:
- ALL frames are completely blank, solid color, or show only a background with no content
- A requested element is COMPLETELY MISSING (user asked for a chart with 5 bars, only 3 appear)
- Elements are FULLY off-screen or invisible (zero opacity, white-on-white, completely behind other elements)
- Text is COMPLETELY unreadable (not just slightly overlapping — actually impossible to read)
- No animation exists at all (every frame is identical)
- Content is fundamentally wrong (asked for a bar chart, got a pie chart)

### PASS WITH NOTES — Usable but has minor cosmetic issues:
- Elements are slightly offset from ideal positions (e.g., city marker 20-50px from expected location)
- Minor overlaps that don't prevent readability
- Text partially extends beyond boundaries but is still readable
- Colors or fonts don't perfectly match expectations but look reasonable
- Geographic markers are in the approximate correct region (on or near the correct landmass)
- Layering is slightly off but content is still visible and readable
- Animation timing is slightly fast/slow but functional
- Minor visual artifacts that don't affect comprehension

### PASS — Meets all requirements with no notable issues

## MAP-SPECIFIC LENIENCY (IMPORTANT)

For map/geography animations, be ESPECIALLY lenient:
- City markers that are on or near the correct landmass = ACCEPTABLE (don't fail for being 30px off)
- Map projections that show the correct region even if not perfectly centered = ACCEPTABLE
- Slight clipping of map edges = ACCEPTABLE as long as key content is visible
- Flight paths that follow the approximate correct direction = ACCEPTABLE

## ELEMENT IDENTIFICATION

When reporting issues, reference elements by their variable name, constant name, or JSX component name from the source code.

## THOROUGHNESS

List issues you find, but ONLY flag them as FAIL-worthy if they meet the FAIL criteria above. Everything else goes in pass_with_notes.

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "verdict": "pass" | "pass_with_notes" | "fail",
  "confidence": 85,
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
  "generalIssues": ["Non-element-specific problems"],
  "summary": "Single concise sentence explaining the verdict"
}

Rules:
- "verdict": "pass" if output is good, "pass_with_notes" if usable with minor cosmetic issues, "fail" ONLY if genuinely broken
- "confidence": 0-100 how confident you are in your verdict. If unsure whether something is a real problem, lower your confidence.
- "passed": true if verdict is "pass" or "pass_with_notes", false only if verdict is "fail"
- "elementIssues": array of objects identifying specific code elements. Only use severity "critical" or "major" for FAIL-worthy issues.
- "generalIssues": problems that don't map to a specific element
- "summary": single concise sentence
- For "pass" verdict: both issue arrays should be empty
- For "pass_with_notes": elementIssues may contain "minor" severity items only
- For "fail": must contain at least one "critical" or "major" severity item`;


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
    const { screenshots, frameMetadata, totalDurationSeconds, prompt, model, code } = body as {
      screenshots: string[];
      frameMetadata?: Array<{ frame: number; timeSeconds: number; percentThrough: number }>;
      totalDurationSeconds?: number;
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

    // Build labeled image content — interleave text labels before each screenshot
    // so the vision AI knows exactly which point in the animation each frame represents
    const imageContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [];

    screenshots.forEach((screenshot, i) => {
      // Add a text label before each image identifying its position
      if (frameMetadata && frameMetadata[i]) {
        const meta = frameMetadata[i];
        const durationLabel = totalDurationSeconds ? ` of ${totalDurationSeconds}s` : '';
        imageContent.push({
          type: 'text' as const,
          text: `Screenshot ${i + 1}/${screenshots.length} — Frame ${meta.frame} at ${meta.timeSeconds}s${durationLabel} (${meta.percentThrough}% through animation):`,
        });
      }
      imageContent.push({
        type: 'image_url' as const,
        image_url: {
          url: screenshot,
          detail: 'high' as const,
        },
      });
    });

    const durationContext = totalDurationSeconds ? ` The total animation is ${totalDurationSeconds}s long.` : '';

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
            text: `Original user request: "${prompt}"\n\n${code ? `Source code that generated this animation:\n\`\`\`tsx\n${code.substring(0, 6000)}\n\`\`\`\n\nCross-reference the screenshots below with the source code above. Identify issues by referencing specific variable names, constants, or JSX elements from the code.\n\n` : ''}The following ${screenshots.length} labeled screenshots show the animation at specific points in time.${durationContext} Evaluate the quality:`,
          },
          ...imageContent,
        ],
      },
    ];

    // 5. Call OpenRouter with vision model
    const qcResponse = await callOpenRouterWithKey(apiKey, [
      {
        role: 'system',
        content: VISUAL_QC_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text' as const,
            text: `Original user request: "${prompt}"\n\n${code ? `Source code that generated this animation:\n\`\`\`tsx\n${code.substring(0, 6000)}\n\`\`\`\n\nCross-reference the screenshots below with the source code above. Identify issues by referencing specific variable names, constants, or JSX elements from the code.\n\n` : ''}The following ${screenshots.length} labeled screenshots show the animation at specific points in time.${durationContext} Evaluate the quality:`,
          },
          ...imageContent,
        ],
      },
    ], {
      model: visionModel,
      temperature: 0.3,
      maxTokens: 2000,
      xTitle: 'Vid-Bolt Visual QC',
      responseFormat: { type: 'json_object' },
    });

    const content = qcResponse.content;

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

    // Derive verdict — use AI's verdict if provided, fall back to passed boolean
    const rawVerdict = qcResult?.verdict;
    const validVerdicts = ['pass', 'pass_with_notes', 'fail'];
    const verdict = validVerdicts.includes(rawVerdict) ? rawVerdict : (qcResult?.passed === true ? 'pass' : 'fail');

    // Derive passed from verdict (pass and pass_with_notes both count as passed)
    const passed = verdict === 'pass' || verdict === 'pass_with_notes';

    // Confidence score (0-100), default to 80 if not provided
    const confidence = typeof qcResult?.confidence === 'number' 
      ? Math.max(0, Math.min(100, qcResult.confidence)) 
      : 80;

    const result = {
      passed,
      verdict,
      confidence,
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
