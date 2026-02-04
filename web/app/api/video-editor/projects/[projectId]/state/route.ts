/**
 * Video Editor - Project State Route
 * 
 * Handles saving and loading project state for cross-device sync.
 * Stores timeline, research, script, voice, and export settings in Supabase.
 * 
 * GET: Load project state
 * PUT: Save/upsert project state  
 * DELETE: Clear project state
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

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/video-editor/projects/[projectId]/state
 * Load the full state for a project
 */
export async function GET(
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

    const { projectId } = await context.params;
    const serviceClient = getServiceClient();

    // 2. Verify the user owns this project
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

    // 3. Get the project state
    const { data: state, error: stateError } = await serviceClient
      .from("video_project_state")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (stateError && stateError.code !== "PGRST116") { // PGRST116 = not found
      throw stateError;
    }

    console.log(`[VideoEditorState] Loaded state for project: ${projectId}`);

    return NextResponse.json({
      success: true,
      state: state || null,
      exists: !!state,
    });
  } catch (error) {
    console.error("[VideoEditorState] Error getting state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/video-editor/projects/[projectId]/state
 * Save/upsert the full state for a project
 */
export async function PUT(
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

    const { projectId } = await context.params;
    const serviceClient = getServiceClient();

    // 2. Verify the user owns this project
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

    // 3. Parse request body
    const {
      research_data,
      script_data,
      voice_data,
      timeline_data,
      export_settings,
      editor_preferences,
    } = await request.json();

    // 4. Prepare the state data
    const stateData: Record<string, unknown> = {
      project_id: projectId,
    };

    // Only include fields that are provided
    if (research_data !== undefined) stateData.research_data = research_data;
    if (script_data !== undefined) stateData.script_data = script_data;
    if (voice_data !== undefined) stateData.voice_data = voice_data;
    if (timeline_data !== undefined) stateData.timeline_data = timeline_data;
    if (export_settings !== undefined) stateData.export_settings = export_settings;
    if (editor_preferences !== undefined) stateData.editor_preferences = editor_preferences;

    // 5. Upsert the state (insert or update)
    const { data: state, error: upsertError } = await serviceClient
      .from("video_project_state")
      .upsert(stateData, {
        onConflict: "project_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (upsertError) {
      throw upsertError;
    }

    console.log(`[VideoEditorState] Saved state for project: ${projectId}`);

    return NextResponse.json({
      success: true,
      state,
      updated_at: state.updated_at,
    });
  } catch (error) {
    console.error("[VideoEditorState] Error saving state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/video-editor/projects/[projectId]/state
 * Delete all state for a project (useful for "reset project")
 */
export async function DELETE(
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

    const { projectId } = await context.params;
    const serviceClient = getServiceClient();

    // 2. Verify the user owns this project
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

    // 3. Delete the state
    const { error: deleteError } = await serviceClient
      .from("video_project_state")
      .delete()
      .eq("project_id", projectId);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`[VideoEditorState] Deleted state for project: ${projectId}`);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("[VideoEditorState] Error deleting state:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
