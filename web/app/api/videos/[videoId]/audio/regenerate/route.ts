
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// Helper to get authenticated user
async function getAuthenticatedUser() {
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
    return { user: null, error: "Unauthorized" };
  }

  return { user, error: null };
}

// Helper to get service role Supabase client
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    
    // Get authenticated user
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError || !user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await request.json();
    const { chunkIndex, text, voiceSettings } = body;

    if (chunkIndex === undefined || !text) {
      return NextResponse.json(
        { error: "Missing required fields: chunkIndex, text" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 1. Verify ownership and get current metadata
    const { data: video, error: fetchError } = await supabase
      .from("video_projects")
      .select("metadata, id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // 2. Generate Audio (Inworld TTS)
    // We import dynamically to avoid loading these in edge runtime if not needed (though this is a node route)
    const { generateSpeech } = await import("@/lib/services/inworld-tts");
    const ttsResult = await generateSpeech(user.id, text, {
        // Use provided settings or defaults from project? 
        // For now user passes settings or we use defaults in generateSpeech
        ...voiceSettings
    });

    // 3. Upload to R2
    const { uploadAudioBuffer, generateTtsKey, isR2Configured } = await import("@/lib/services/r2-storage");
    
    if (!isR2Configured()) {
       throw new Error("R2 storage is not configured.");
    }

    // Path: {userId}/{videoId}/audio/tts/chunk_XXX.mp3
    const key = generateTtsKey(user.id, videoId, chunkIndex);
    const uploadResult = await uploadAudioBuffer(ttsResult.audioBuffer, key, "audio/mpeg");

    // 4. Update Metadata
    const audioChunks = (video.metadata as any)?.audio_chunks || [];
    
    // Ensure array is large enough (it should be if we are regenerating)
    if (chunkIndex >= audioChunks.length) {
         // Should we error or grow? Assume error for now as we are regenerating existing
         // But maybe we added a chunk? For now strict regeneration.
         // Actually, let's just update safely.
    }

    const newChunk = {
        chunkIndex,
        url: uploadResult.url,
        durationSeconds: ttsResult.durationSeconds,
        wordTimestamps: ttsResult.wordTimestamps,
        text,
        lastUpdated: Date.now()
    };

    // Update specific index
    audioChunks[chunkIndex] = newChunk;

    // Save back to DB
    const { error: updateError } = await supabase.rpc("merge_video_metadata", {
        p_video_id: videoId,
        p_updates: { audio_chunks: audioChunks }
    });

    if (updateError) {
        throw new Error(`Failed to update metadata: ${updateError.message}`);
    }

    return NextResponse.json({ success: true, chunk: newChunk });

  } catch (error) {
    console.error("Regeneration failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
