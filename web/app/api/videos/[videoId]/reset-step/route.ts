import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

/**
 * Step-specific reset logic
 * Each step has different data that needs to be cleaned up
 */
interface StepResetResult {
  success: boolean;
  resetFields: string[];
  r2FilesDeleted: number;
  errors: string[];
}

// Map of step number to video stage (5-step system)
const STEP_TO_STAGE: Record<number, string> = {
  1: 'outline',
  2: 'script',
  3: 'production',
  4: 'video',
  5: 'export',
};

/**
 * Reset data for a specific step
 */
async function resetStepData(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  videoId: string,
  fromStep: number,
  currentMetadata: Record<string, any>
): Promise<StepResetResult> {
  const result: StepResetResult = {
    success: true,
    resetFields: [],
    r2FilesDeleted: 0,
    errors: [],
  };

  // Build the updates based on which step we're resetting
  const dbUpdates: Record<string, any> = {};
  const metadataUpdates: Record<string, any> = { ...currentMetadata };

  try {
    switch (fromStep) {
      case 2: // Script
        dbUpdates.script_content = null;
        result.resetFields.push('script_content');
        
        if (metadataUpdates.scriptOutput) {
          delete metadataUpdates.scriptOutput;
          result.resetFields.push('metadata.scriptOutput');
        }
        if (metadataUpdates.scriptConfig) {
          delete metadataUpdates.scriptConfig;
          result.resetFields.push('metadata.scriptConfig');
        }
        break;

      case 3: // Production (Closed-Loop Pipeline)
        // Clear all production metadata outputs
        const step3MetadataKeysToDelete = [
          'closed_loop_state',
          'edl',
          'agentEdl',
          'word_timestamps',
          'audio_chunks',
          'av_script',
          'shot_plan',
          'av_script_part1',
          'asset_manifest',
          'generated_videos',
          'generated_images',
          'video_gen_stats',
          'edl_generated_at',
          'edl_version',
        ];

        for (const key of step3MetadataKeysToDelete) {
          if (metadataUpdates[key] !== undefined) {
            delete metadataUpdates[key];
            result.resetFields.push(`metadata.${key}`);
          }
        }

        // Clear DB columns written by the orchestrator
        dbUpdates.audio_url = null;
        dbUpdates.worker_prompts = null;
        dbUpdates.creative_manifest = null;
        result.resetFields.push('audio_url', 'worker_prompts', 'creative_manifest');

        // Cancel any running closed-loop tasks
        try {
          const { error: taskDeleteError } = await supabase
            .from('tasks')
            .update({ status: 'cancelled' })
            .eq('type', 'closed_loop')
            .eq('input_data->>videoId', videoId)
            .in('status', ['pending', 'running']);

          if (taskDeleteError) {
            console.warn('[Reset Step 3] Failed to cancel tasks:', taskDeleteError.message);
          } else {
            result.resetFields.push('tasks (closed_loop cancelled)');
          }
        } catch (taskError) {
          console.warn('[Reset Step 3] Task cleanup error:', taskError);
        }

        // Delete ALL R2 files created by Step 3 workers (audio, images, footage)
        try {
          const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");

          if (isR2Configured()) {
            const videoPrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}`;
            const r2Prefixes = [
              `${videoPrefix}/audio/`,      // TTS chunks, sound effects, background music
              `${videoPrefix}/images/`,     // Generated + stock images
              `${videoPrefix}/footage/`,    // Generated + stock footage
            ];

            for (const prefix of r2Prefixes) {
              try {
                const r2Result = await deleteFilesWithPrefix(prefix);
                result.r2FilesDeleted += r2Result.deleted;
                if (r2Result.errors.length > 0) {
                  result.errors.push(...r2Result.errors);
                }
              } catch (prefixErr) {
                const msg = prefixErr instanceof Error ? prefixErr.message : String(prefixErr);
                result.errors.push(`R2 cleanup failed for ${prefix}: ${msg}`);
              }
            }

            console.log(`[Reset Step 3] Deleted ${result.r2FilesDeleted} R2 files`);
          }
        } catch (r2Error) {
          const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
          result.errors.push(`R2 cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 3] R2 cleanup error:", r2Error);
        }
        break;

      case 4: // Editor - clear editor state, timeline, EDL, and agentEdl
        delete metadataUpdates.editor_state;
        delete metadataUpdates.timeline;
        delete metadataUpdates.edl;
        delete metadataUpdates.agentEdl;
        result.resetFields.push('metadata.editor_state', 'metadata.timeline', 'metadata.edl', 'metadata.agentEdl');

        // Delete persisted editor timeline state from separate table
        try {
          const { error: deleteStateError } = await supabase
            .from('video_project_state')
            .delete()
            .eq('project_id', videoId);
          if (deleteStateError) {
            result.errors.push(`Failed to delete video_project_state: ${deleteStateError.message}`);
            console.error('[Reset Step 4] Error deleting video_project_state:', deleteStateError);
          } else {
            result.resetFields.push('video_project_state');
            console.log('[Reset Step 4] Deleted video_project_state row');
          }
        } catch (stateDeleteError) {
          const errorMsg = stateDeleteError instanceof Error ? stateDeleteError.message : String(stateDeleteError);
          result.errors.push(`video_project_state cleanup failed: ${errorMsg}`);
          console.error('[Reset Step 4] video_project_state cleanup error:', stateDeleteError);
        }
        break;

      case 5: // Export
        dbUpdates.video_url = null;
        dbUpdates.export_task_id = null;
        result.resetFields.push('video_url', 'export_task_id');
        
        if (metadataUpdates.export_settings) {
          delete metadataUpdates.export_settings;
          result.resetFields.push('metadata.export_settings');
        }

        // Delete R2 export files
        try {
          const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
          
          if (isR2Configured()) {
            const prefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.EXPORTS}/`;
            const r2Result = await deleteFilesWithPrefix(prefix);
            result.r2FilesDeleted = r2Result.deleted;
            
            if (r2Result.errors.length > 0) {
              result.errors.push(...r2Result.errors);
            }
            console.log(`[Reset Step 5] Deleted ${r2Result.deleted} R2 export files`);
          }
        } catch (r2Error) {
          const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
          result.errors.push(`R2 cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 5] R2 cleanup error:", r2Error);
        }
        break;

      default:
        console.log(`[Reset Step] No reset logic for step ${fromStep}`);
    }

    // Apply database updates
    dbUpdates.metadata = metadataUpdates;
    dbUpdates.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("video_projects")
      .update(dbUpdates)
      .eq("id", videoId)
      .eq("user_id", userId);

    if (updateError) {
      result.success = false;
      result.errors.push(`Database update failed: ${updateError.message}`);
    }

  } catch (error) {
    result.success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Reset failed: ${errorMsg}`);
  }

  return result;
}

/**
 * POST /api/videos/[videoId]/reset-step
 * 
 * Reset data from a specific step when navigating backwards.
 * This clears both Supabase data and R2 storage files.
 * 
 * Body: { fromStep: number, toStep: number }
 */
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
    const { fromStep, toStep } = body;

    // Validate input
    if (typeof fromStep !== 'number' || typeof toStep !== 'number') {
      return NextResponse.json(
        { error: "fromStep and toStep are required and must be numbers" },
        { status: 400 }
      );
    }

    if (toStep >= fromStep) {
      return NextResponse.json(
        { error: "toStep must be less than fromStep (going backwards)" },
        { status: 400 }
      );
    }

    if (fromStep < 1 || fromStep > 5 || toStep < 1 || toStep > 5) {
      return NextResponse.json(
        { error: "Step numbers must be between 1 and 5" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Fetch the video to verify ownership and get current metadata
    const { data: video, error: fetchError } = await supabase
      .from("video_projects")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !video) {
      if (fetchError?.code === "PGRST116") {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      console.error("Failed to fetch video for reset:", fetchError);
      return NextResponse.json({ error: fetchError?.message || "Video not found" }, { status: 500 });
    }

    const currentMetadata = (video.metadata as Record<string, any>) || {};

    // Reset data for the step we're leaving (fromStep)
    console.log(`[Reset Step] Resetting step ${fromStep} for video ${videoId}`);
    const resetResult = await resetStepData(
      supabase,
      user.id,
      videoId,
      fromStep,
      currentMetadata
    );

    // Update the current stage to the target step
    const targetStage = STEP_TO_STAGE[toStep] || 'outline';
    const { error: stageError } = await supabase
      .from("video_projects")
      .update({
        current_stage: targetStage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId)
      .eq("user_id", user.id);

    if (stageError) {
      console.error("Failed to update stage:", stageError);
      resetResult.errors.push(`Stage update failed: ${stageError.message}`);
    }

    console.log(`[Reset Step] Complete:`, resetResult);

    return NextResponse.json({
      success: resetResult.success,
      fromStep,
      toStep,
      newStage: targetStage,
      resetFields: resetResult.resetFields,
      r2FilesDeleted: resetResult.r2FilesDeleted,
      errors: resetResult.errors.length > 0 ? resetResult.errors : undefined,
    });

  } catch (error) {
    console.error("Failed to reset step:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
