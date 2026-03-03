import { NextRequest, NextResponse } from "next/server";
import { universalScriptQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// POST /api/universal-script - Start a universal script generation task
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
    const { 
      topic, 
      genre, 
      researchToggle, 
      durationRange, 
      angle, 
      mustInclude, 
      mustAvoid,
      sourcePreferences,
      stockMediaLevel,
      researchProvider, // valyu or openrouter
      // Project settings
      pov,
      protagonistGender,
      openrouterModel,
      contentNiche,
      toneStyle,
      targetAudience,
      // Advanced script settings (from ScriptAdvancedSettings)
      scriptAdvanced,
    } = body;

    if (!topic || !genre || !durationRange) {
      return NextResponse.json(
        { error: "Missing required fields: topic, genre, durationRange" },
        { status: 400 }
      );
    }

    // Validate genre
    const validGenres = ['documentary', 'educational', 'narrative_fiction', 'historical_fiction', 'opinion_essay', 'tutorial', 'news'];
    if (!validGenres.includes(genre)) {
      return NextResponse.json(
        { error: `Invalid genre. Must be one of: ${validGenres.join(', ')}` },
        { status: 400 }
      );
    }

    // Create task in database using service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        type: "writing",
        name: `Script: ${topic.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: { 
          topic, 
          genre, 
          researchToggle: researchToggle || 'full', 
          durationRange,
          angle,
          mustInclude,
          mustAvoid,
          sourcePreferences,
          stockMediaLevel: stockMediaLevel || 'standard_images',
          researchProvider: researchProvider || 'valyu', // Default to valyu for v2
          // Project settings
          pov: pov || '1st',
          protagonistGender: protagonistGender || 'any',
          openrouterModel: openrouterModel || 'google/gemini-3-flash-preview',
          contentNiche,
          toneStyle,
          targetAudience,
        },
        output_data: {},
      })
      .select()
      .single();

    if (taskError) {
      console.error("Failed to create task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Add job to BullMQ queue
    const job = await universalScriptQueue.add(
      'universal-script',
      {
        taskId: task.id,
        userId: user.id,
        input: {
          topic,
          genre,
          researchToggle: researchToggle || 'full',
          durationRange,
          angle,
          mustInclude,
          mustAvoid,
          sourcePreferences,
          stockMediaLevel: stockMediaLevel || 'standard_images',
          researchProvider: researchProvider || 'valyu', // Default to valyu for v2
          // Project settings for AI generation
          pov: pov || '1st',
          protagonistGender: protagonistGender || 'any',
          openrouterModel: openrouterModel || 'google/gemini-3-flash-preview',
          contentNiche,
          toneStyle,
          targetAudience,
          // Advanced style customization (from ScriptAdvancedSettings)
          styleConfig: scriptAdvanced ? {
            customBannedPhrases: scriptAdvanced.bannedPhrases,
            customWordReplacements: scriptAdvanced.wordReplacements,
            systemPromptOverrides: scriptAdvanced.systemPrompts,
            engagementTiming: scriptAdvanced.engagementTiming,
          } : undefined,
        },
      },
      {
        jobId: task.id, // Use taskId as jobId for easy correlation
      }
    );

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id, task });
  } catch (error) {
    console.error("Failed to start universal script task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

