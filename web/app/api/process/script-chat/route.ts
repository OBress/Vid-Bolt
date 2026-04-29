import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getLlmProviderConfig } from "@/lib/services/api-keys";
import { callOpenRouterWithKey } from "@/lib/ai/openrouter";

// POST /api/process/script-chat - AI-assisted script rewriting
export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, context, message, currentScript } = body;

    if (!projectId || !message) {
      return NextResponse.json(
        { error: "Missing required fields: projectId and message" },
        { status: 400 }
      );
    }

    // Create admin client to fetch project settings
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get the project's writing model from settings
    const { data: project } = await supabaseAdmin
      .from("video_projects")
      .select("settings")
      .eq("id", projectId)
      .single();

    // Get the model from project settings, fallback to default
    const writingModel = project?.settings?.script?.openrouterModel || "google/gemini-3-flash-preview";

    // Build the prompt for the AI - return JSON with rewritten text AND explanation
    const contextText = context && context.length > 0
      ? `The user has selected the following text to be rewritten:\n${context.map((c: string, _i: number) => `"${c}"`).join("\n\n")}\n\n`
      : "";

    const systemPrompt = `You are a professional script editor. Rewrite the selected text based on the user's instructions.

${contextText}Full script for context (do not rewrite all of this, only the selected text):
${currentScript?.substring(0, 3000) || "No script provided"}

You MUST respond with valid JSON in this exact format:
{
  "rewrittenText": "the rewritten text that will replace the selected text",
  "explanation": "brief explanation of what you changed and why (1-2 sentences)"
}

Rules:
- rewrittenText should be the exact text to insert, matching the tone/style of the script
- explanation should be concise and helpful
- Do NOT include anything outside the JSON`;

    // Get LLM provider config — respects user's active provider
    let llmConfig: { apiKey: string; provider: import('@/lib/ai/providers/types').LlmProvider };
    try {
      llmConfig = await getLlmProviderConfig(user.id);
    } catch (keyError) {
      return NextResponse.json(
        { error: keyError instanceof Error ? keyError.message : "Failed to get API key" },
        { status: 400 }
      );
    }

    const response = await callOpenRouterWithKey(llmConfig.apiKey, [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ], {
      model: writingModel,
      maxTokens: 2000,
      temperature: 0.7,
      xTitle: 'Vid-Bolt Script Chat',
      trackingUserId: user.id,
    }, llmConfig.provider);

    const aiResponse = response.content;

    // Parse the JSON response
    let rewrittenText = "";
    let explanation = "";
    try {
      // Try to extract JSON from the response (handle potential markdown code blocks)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        rewrittenText = parsed.rewrittenText || "";
        explanation = parsed.explanation || "Changes applied.";
      } else {
        // Fallback: treat entire response as rewritten text
        rewrittenText = aiResponse.trim();
        explanation = "Rewrite applied.";
      }
    } catch {
      // If JSON parsing fails, use the raw response
      rewrittenText = aiResponse.trim();
      explanation = "Rewrite applied.";
    }

    // Return both the rewritten text and explanation
    return NextResponse.json({
      success: true,
      rewrittenText,
      explanation,
      model: writingModel,
    });
  } catch (error) {
    console.error("Script chat error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage || "Unknown error occurred" },
      { status: 500 }
    );
  }
}
