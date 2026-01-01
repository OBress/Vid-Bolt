import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { 
  TaskStep, 
  TaskPhase, 
  WritingTaskOutput,
} from "@/types/task";

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase config missing");
  
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

// ============================================================================
// STEP MANAGEMENT FUNCTIONS (JSONB-based)
// ============================================================================

/**
 * Adds a new step to the task's steps array.
 * Returns the step ID for later updates.
 */
export async function addTaskStep(
  taskId: string,
  phase: TaskPhase,
  stepName: string,
  stepOrder: number
): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const stepId = crypto.randomUUID();
  
  const newStep: TaskStep = {
    id: stepId,
    name: stepName,
    phase,
    order: stepOrder,
    status: 'running',
    started_at: new Date().toISOString(),
  };
  
  // Use the SQL function to atomically append to steps array
  const { error } = await supabase.rpc('append_task_step', {
    p_task_id: taskId,
    p_step: newStep
  });
  
  if (error) {
    console.error('Failed to add step:', error);
    throw new Error(`Failed to add step: ${error.message}`);
  }
  
  return stepId;
}

/**
 * Updates a step in the task's steps array.
 */
export async function updateStepStatus(
  taskId: string,
  stepId: string,
  updates: Partial<TaskStep>
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  const { error } = await supabase.rpc('update_task_step', {
    p_task_id: taskId,
    p_step_id: stepId,
    p_updates: updates
  });
  
  if (error) {
    console.error('Failed to update step:', error);
    throw new Error(`Failed to update step: ${error.message}`);
  }
}

/**
 * Marks a step as completed with optional metrics.
 */
export async function completeStep(
  taskId: string,
  stepId: string,
  tokenCount?: number
): Promise<void> {
  await updateStepStatus(taskId, stepId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    token_count: tokenCount,
  });
}

/**
 * Marks a step as failed with error message.
 */
export async function failStep(
  taskId: string,
  stepId: string,
  errorMessage: string
): Promise<void> {
  await updateStepStatus(taskId, stepId, {
    status: 'failed',
    completed_at: new Date().toISOString(),
    error: errorMessage,
  });
}

// ============================================================================
// TASK UPDATE FUNCTIONS
// ============================================================================

/**
 * Updates task status and progress.
 */
export async function updateTaskStatus(
  taskId: string,
  updates: {
    status?: string;
    current_phase?: string;
    current_step?: string;
    progress_percent?: number;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
  }
): Promise<void> {
  console.log(`[shared:updateTaskStatus] Updating task ${taskId}:`, JSON.stringify(updates));
  
  const supabase = getSupabaseServiceClient();
  const { error, data } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select('id, status, progress_percent');
  
  if (error) {
    console.error(`[shared:updateTaskStatus] FAILED for task ${taskId}:`, error);
    throw new Error(`Failed to update task: ${error.message}`);
  }
  
  console.log(`[shared:updateTaskStatus] SUCCESS for task ${taskId}:`, JSON.stringify(data));
}

/**
 * Updates task output_data with type-specific content.
 * Merges with existing output_data rather than replacing.
 */
export async function updateTaskOutput(
  taskId: string,
  updates: Partial<WritingTaskOutput>
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  const { error } = await supabase.rpc('merge_task_output', {
    p_task_id: taskId,
    p_updates: updates
  });
  
  if (error) throw new Error(`Failed to update output: ${error.message}`);
}

/**
 * Appends a chapter to the chapters array in output_data.
 * Uses atomic SQL function to prevent race conditions.
 */
export async function appendChapter(
  taskId: string,
  chapter: { chapterNumber: number; title: string; content: string }
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  const { error } = await supabase.rpc('append_to_output_array', {
    p_task_id: taskId,
    p_key: 'chapters',
    p_item: chapter
  });
  
  if (error) throw new Error(`Failed to append chapter: ${error.message}`);
}

// ============================================================================
// CONTINUITY STATE FUNCTIONS
// ============================================================================

export async function updateContinuityState(
  taskId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("continuity_state")
    .upsert({ task_id: taskId, ...updates }, { onConflict: "task_id" });
  if (error) throw new Error(`Failed to update continuity: ${error.message}`);
}

export async function getContinuityState(taskId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("continuity_state")
    .select("*")
    .eq("task_id", taskId)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to get continuity: ${error.message}`);
  }
  return data;
}
