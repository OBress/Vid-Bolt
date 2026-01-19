import { NextRequest, NextResponse } from "next/server";
import { outlineQueue } from "@/lib/queues";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// POST /api/process/outline - Start an outline generation task
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
      videoId,
      topic, 
      genre, 
      researchToggle, 
      durationRange, 
      angle, 
      mustInclude, 
      mustAvoid,
      sourcePreferences,
      stockMediaLevel,
      // Project settings
      pov,
      protagonistGender,
      openrouterModel,
      contentNiche,
      toneStyle,
      targetAudience,
    } = body;

    if (!videoId || !topic || !genre || !durationRange) {
      return NextResponse.json(
        { error: "Missing required fields: videoId, topic, genre, durationRange" },
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
        type: "outline",
        name: `Outline: ${topic.substring(0, 50)}...`,
        status: "pending",
        steps: [],
        input_data: { 
          videoId,
          topic, 
          genre, 
          researchToggle: researchToggle || 'full', 
          durationRange,
          angle,
          mustInclude,
          mustAvoid,
          sourcePreferences,
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
      console.error("Failed to create outline task:", taskError);
      return NextResponse.json({ error: taskError.message }, { status: 500 });
    }

    // Add job to BullMQ queue
    const job = await outlineQueue.add(
      'outline',
      {
        taskId: task.id,
        userId: user.id,
        videoId,
        input: {
          topic,
          genre,
          researchToggle: researchToggle || 'full',
          durationRange,
          angle,
          mustInclude,
          mustAvoid,
          sourcePreferences,
          pov: pov || '1st',
          protagonistGender: protagonistGender || 'any',
          openrouterModel: openrouterModel || 'google/gemini-3-flash-preview',
          contentNiche,
          toneStyle,
          targetAudience,
        },
      },
      {
        jobId: task.id,
      }
    );

    return NextResponse.json({ success: true, taskId: task.id, jobId: job.id, task });
  } catch (error) {
    console.error("Failed to start outline task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
