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

// Map of step number to video stage
const STEP_TO_STAGE: Record<number, string> = {
  1: 'outline',
  2: 'stock',
  3: 'script',
  4: 'audio',
  5: 'shot_planning',
  6: 'shot_creation',
  7: 'video',
  8: 'export',
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
  let dbUpdates: Record<string, any> = {};
  let metadataUpdates: Record<string, any> = { ...currentMetadata };

  try {
    switch (fromStep) {
      case 2: // Stock Media - Clear all scraped/stored stock media
        // Clear metadata fields
        if (metadataUpdates.selectedStockMedia) {
          delete metadataUpdates.selectedStockMedia;
          result.resetFields.push('selectedStockMedia');
        }
        if (metadataUpdates.stockMediaResults) {
          delete metadataUpdates.stockMediaResults;
          result.resetFields.push('stockMediaResults');
        }

        // Delete stock_media database entries for this video
        try {
          // First, get all stock_media entries for this video
          // NOTE: Records are inserted with video_id column, NOT metadata.videoId
          const { data: stockEntries, error: fetchError } = await supabase
            .from('stock_media')
            .select('id, r2_key')
            .eq('video_id', videoId);

          if (fetchError) {
            console.error('[Reset Step 2] Error fetching stock_media:', fetchError);
            result.errors.push(`Failed to fetch stock_media: ${fetchError.message}`);
          } else if (stockEntries && stockEntries.length > 0) {
            // Delete R2 files first
            try {
              const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
              
              if (isR2Configured()) {
                // Delete stock images at users/{userId}/videos/{videoId}/images/stock/
                const stockImagesPrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.IMAGES.STOCK}/`;
                console.log(`[Reset Step 2] Deleting R2 files with prefix: ${stockImagesPrefix}`);
                const r2Result = await deleteFilesWithPrefix(stockImagesPrefix);
                result.r2FilesDeleted = r2Result.deleted;
                
                // Also try to delete individual r2_keys if stored differently
                for (const entry of stockEntries) {
                  if (entry.r2_key && !entry.r2_key.startsWith(stockImagesPrefix)) {
                    try {
                      const { deleteFile } = await import("@/lib/services/r2-storage");
                      await deleteFile(entry.r2_key);
                      result.r2FilesDeleted++;
                    } catch (e) {
                      // Ignore individual delete errors
                    }
                  }
                }
                
                if (r2Result.errors.length > 0) {
                  result.errors.push(...r2Result.errors);
                }
                console.log(`[Reset Step 2] Deleted ${result.r2FilesDeleted} R2 stock media files`);
              }
            } catch (r2Error) {
              const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
              result.errors.push(`R2 cleanup failed: ${errorMsg}`);
              console.error("[Reset Step 2] R2 cleanup error:", r2Error);
            }

            // Delete database entries (use video_id column, not metadata)
            const { error: deleteError } = await supabase
              .from('stock_media')
              .delete()
              .eq('video_id', videoId);

            if (deleteError) {
              result.errors.push(`Failed to delete stock_media entries: ${deleteError.message}`);
              console.error('[Reset Step 2] Error deleting stock_media:', deleteError);
            } else {
              result.resetFields.push(`stock_media (${stockEntries.length} entries)`);
              console.log(`[Reset Step 2] Deleted ${stockEntries.length} stock_media entries`);
            }
          }
        } catch (dbError) {
          const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
          result.errors.push(`Stock media DB cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 2] DB cleanup error:", dbError);
        }

        // Also delete any stock media scraping tasks
        try {
          const { error: taskDeleteError } = await supabase
            .from('tasks')
            .delete()
            .eq('type', 'video')
            .eq('input_data->>videoId', videoId)
            .like('name', 'Stock Media Scrape%');

          if (taskDeleteError) {
            console.warn('[Reset Step 2] Failed to delete tasks:', taskDeleteError.message);
          } else {
            result.resetFields.push('tasks (stock media scrape)');
          }
        } catch (taskError) {
          console.warn('[Reset Step 2] Task cleanup error:', taskError);
        }
        break;

      case 3: // Script
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

      case 4: // Audio - Also need to delete R2 files
        dbUpdates.audio_url = null;
        dbUpdates.audio_task_id = null;
        result.resetFields.push('audio_url', 'audio_task_id');
        
        if (metadataUpdates.audio_chunks) {
          delete metadataUpdates.audio_chunks;
          result.resetFields.push('metadata.audio_chunks');
        }

        // Delete R2 TTS audio files
        try {
          const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
          
          if (isR2Configured()) {
            // Path: users/{userId}/videos/{videoId}/audio/tts/
            const prefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.AUDIO.TTS}/`;
            const r2Result = await deleteFilesWithPrefix(prefix);
            result.r2FilesDeleted = r2Result.deleted;
            
            if (r2Result.errors.length > 0) {
              result.errors.push(...r2Result.errors);
            }
            console.log(`[Reset Step 4] Deleted ${r2Result.deleted} R2 TTS files`);
          }
        } catch (r2Error) {
          const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
          result.errors.push(`R2 cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 4] R2 cleanup error:", r2Error);
        }
        break;

      case 5: // Shot Creation - Clear AV script data AND on-demand stock media
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  🧹 [Reset Step 5] CLEANUP TRIGGERED - Clearing stock media  ║');
        console.log(`║  Video ID: ${videoId.padEnd(47)}║`);
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
        
        if (metadataUpdates.shot_list) {
          delete metadataUpdates.shot_list;
          result.resetFields.push('metadata.shot_list');
        }
        if (metadataUpdates.av_script_part1) {
          delete metadataUpdates.av_script_part1;
          result.resetFields.push('metadata.av_script_part1');
        }
        if (metadataUpdates.av_script_completed) {
          delete metadataUpdates.av_script_completed;
          result.resetFields.push('metadata.av_script_completed');
        }
        if (metadataUpdates.av_script_part1_completed) {
          delete metadataUpdates.av_script_part1_completed;
          result.resetFields.push('metadata.av_script_part1_completed');
        }
        
        // IMPORTANT: Step 5 does on-demand Serper scraping via StockMediaDirector
        // These images are stored in R2 + stock_media table and MUST be cleaned up
        try {
          // Get all stock_media entries for this video
          const { data: stockEntries, error: fetchError } = await supabase
            .from('stock_media')
            .select('id, r2_key')
            .eq('video_id', videoId);

          if (fetchError) {
            console.error('[Reset Step 5] Error fetching stock_media:', fetchError);
            result.errors.push(`Failed to fetch stock_media: ${fetchError.message}`);
          } else if (stockEntries && stockEntries.length > 0) {
            console.log(`[Reset Step 5] Found ${stockEntries.length} stock_media entries to delete`);
            
            // Delete R2 files first
            try {
              const { deleteFilesWithPrefix, deleteFile, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
              
              if (isR2Configured()) {
                // CORRECT PATH: Stock images are at users/{userId}/videos/{videoId}/images/stock/
                const stockImagesPrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.IMAGES.STOCK}/`;
                console.log(`[Reset Step 5] Deleting R2 files with prefix: ${stockImagesPrefix}`);
                const imagesResult = await deleteFilesWithPrefix(stockImagesPrefix);
                result.r2FilesDeleted = imagesResult.deleted;
                
                // Also delete stock footage at users/{userId}/videos/{videoId}/footage/stock/
                const stockFootagePrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.FOOTAGE.STOCK}/`;
                console.log(`[Reset Step 5] Deleting R2 footage with prefix: ${stockFootagePrefix}`);
                const footageResult = await deleteFilesWithPrefix(stockFootagePrefix);
                result.r2FilesDeleted += footageResult.deleted;
                
                // Delete individual r2_keys if stored differently
                for (const entry of stockEntries) {
                  if (entry.r2_key) {
                    try {
                      await deleteFile(entry.r2_key);
                      result.r2FilesDeleted++;
                    } catch (e) {
                      // Ignore individual delete errors (may already be deleted)
                    }
                  }
                }
                
                if (imagesResult.errors.length > 0) {
                  result.errors.push(...imagesResult.errors);
                }
                if (footageResult.errors.length > 0) {
                  result.errors.push(...footageResult.errors);
                }
                console.log(`[Reset Step 5] Deleted ${result.r2FilesDeleted} R2 stock media files`);
              }
            } catch (r2Error) {
              const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
              result.errors.push(`R2 cleanup failed: ${errorMsg}`);
              console.error("[Reset Step 5] R2 cleanup error:", r2Error);
            }

            // Delete database entries
            const { error: deleteError } = await supabase
              .from('stock_media')
              .delete()
              .eq('video_id', videoId);

            if (deleteError) {
              result.errors.push(`Failed to delete stock_media entries: ${deleteError.message}`);
              console.error('[Reset Step 5] Error deleting stock_media:', deleteError);
            } else {
              result.resetFields.push(`stock_media (${stockEntries.length} entries)`);
              console.log(`[Reset Step 5] Deleted ${stockEntries.length} stock_media entries`);
            }
          } else {
            console.log('[Reset Step 5] No stock_media entries found for this video');
          }
        } catch (dbError) {
          const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
          result.errors.push(`Stock media DB cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 5] DB cleanup error:", dbError);
        }
        
        console.log('');
        console.log(`✅ [Reset Step 5] CLEANUP COMPLETE - R2 files: ${result.r2FilesDeleted || 0}, DB entries: ${result.resetFields.filter(f => f.includes('stock_media')).length > 0 ? 'cleared' : 'none'}`);
        console.log('');
        break;

      case 6: // Scene Review - Delete generated images/videos from R2
        if (metadataUpdates.generated_scenes) {
          delete metadataUpdates.generated_scenes;
          result.resetFields.push('metadata.generated_scenes');
        }

        // Delete R2 generated images and footage
        try {
          const { deleteFilesWithPrefix, isR2Configured, STORAGE_PATHS } = await import("@/lib/services/r2-storage");
          
          if (isR2Configured()) {
            // Delete generated images
            const imagesPrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.IMAGES.GENERATED}/`;
            const imagesResult = await deleteFilesWithPrefix(imagesPrefix);
            result.r2FilesDeleted += imagesResult.deleted;
            
            // Delete generated footage
            const footagePrefix = `${STORAGE_PATHS.USERS}/${userId}/${STORAGE_PATHS.VIDEOS}/${videoId}/${STORAGE_PATHS.FOOTAGE.GENERATED}/`;
            const footageResult = await deleteFilesWithPrefix(footagePrefix);
            result.r2FilesDeleted += footageResult.deleted;
            
            if (imagesResult.errors.length > 0 || footageResult.errors.length > 0) {
              result.errors.push(...imagesResult.errors, ...footageResult.errors);
            }
            console.log(`[Reset Step 6] Deleted ${result.r2FilesDeleted} R2 generated files`);
          }
        } catch (r2Error) {
          const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
          result.errors.push(`R2 cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 6] R2 cleanup error:", r2Error);
        }
        break;

      case 7: // Editor
        if (metadataUpdates.editor_state) {
          delete metadataUpdates.editor_state;
          result.resetFields.push('metadata.editor_state');
        }
        if (metadataUpdates.timeline) {
          delete metadataUpdates.timeline;
          result.resetFields.push('metadata.timeline');
        }
        break;

      case 8: // Export
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
            console.log(`[Reset Step 8] Deleted ${r2Result.deleted} R2 export files`);
          }
        } catch (r2Error) {
          const errorMsg = r2Error instanceof Error ? r2Error.message : String(r2Error);
          result.errors.push(`R2 cleanup failed: ${errorMsg}`);
          console.error("[Reset Step 8] R2 cleanup error:", r2Error);
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

    if (fromStep < 1 || fromStep > 8 || toStep < 1 || toStep > 8) {
      return NextResponse.json(
        { error: "Step numbers must be between 1 and 8" },
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
