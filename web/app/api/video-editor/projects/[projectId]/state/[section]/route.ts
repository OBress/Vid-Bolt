/**
 * Video Editor - Project State Section Route
 * 
 * PATCH: Update a specific section of the project state (partial update).
 * Available sections: research_data, script_data, voice_data, timeline_data, 
 *                     export_settings, editor_preferences
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Service role client for database operations
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Server configuration error");
  }

  return createServiceClient(supabaseUrl, supabaseKey);
}

const VALID_SECTIONS = [
  "research_data",
  "script_data", 
  "voice_data",
  "timeline_data",
  "export_settings",
  "editor_preferences",
] as const;

type Section = typeof VALID_SECTIONS[number];

interface RouteContext {
  params: Promise<{ projectId: string; section: string }>;
}

/**
 * PATCH /api/video-editor/projects/[projectId]/state/[section]
 * Update a specific section of the state
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, section } = await context.params;

    // 2. Validate section
    if (!VALID_SECTIONS.includes(section as Section)) {
      return NextResponse.json(
        { error: `Invalid section. Valid sections: ${VALID_SECTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const serviceClient = getServiceClient();

    // 3. Verify the user owns this project
    const { data: project, error: projectError } = await serviceClient
      .from("video_projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 4. Parse request body (the data to store in the section)
    const data = await request.json();

    // 5. Check if state exists
    const { data: existingState } = await serviceClient
      .from("video_project_state")
      .select("id")
      .eq("project_id", projectId)
      .single();

    let state;
    if (existingState) {
      // Update existing state
      const { data: updated, error: updateError } = await serviceClient
        .from("video_project_state")
        .update({ [section]: data })
        .eq("project_id", projectId)
        .select()
        .single();

      if (updateError) throw updateError;
      state = updated;
    } else {
      // Create new state with this section
      const { data: created, error: createError } = await serviceClient
        .from("video_project_state")
        .insert({
          project_id: projectId,
          [section]: data,
        })
        .select()
        .single();

      if (createError) throw createError;
      state = created;
    }

    console.log(`[VideoEditorState] Updated ${section} for project: ${projectId}`);

    return NextResponse.json({
      success: true,
      section,
      updated_at: state.updated_at,
    });
  } catch (error) {
    console.error("[VideoEditorState] Error updating section:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
