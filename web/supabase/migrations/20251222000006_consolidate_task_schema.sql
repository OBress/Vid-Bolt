-- ============================================================================
-- Task Schema Consolidation Migration
-- ============================================================================
-- This migration consolidates the task_steps table into a JSONB column on tasks.
-- Benefits:
--   - 1 row per task instead of 15+ rows
--   - Unified architecture for writing, audio, video, export workflows
--   - No JOINs required for full task data
--   - Easy to add new task types
-- ============================================================================

-- ============================================================================
-- STEP 1: Add new columns to tasks table
-- ============================================================================

-- Add steps JSONB column to store step progress
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.steps IS 'JSONB array of task steps: [{id, name, phase, order, status, started_at, completed_at, duration_ms, token_count, error}]';

-- ============================================================================
-- STEP 2: Create GIN indexes for efficient JSONB queries
-- ============================================================================

-- Index for querying steps array (useful for finding tasks with specific step statuses)
CREATE INDEX IF NOT EXISTS idx_tasks_steps ON public.tasks USING GIN (steps jsonb_path_ops);

-- Index for output_data queries (useful for finding tasks with specific outputs)
CREATE INDEX IF NOT EXISTS idx_tasks_output_data ON public.tasks USING GIN (output_data jsonb_path_ops);

-- Index for input_data queries
CREATE INDEX IF NOT EXISTS idx_tasks_input_data ON public.tasks USING GIN (input_data jsonb_path_ops);

-- Composite index for common query pattern: user's tasks of a specific type
CREATE INDEX IF NOT EXISTS idx_tasks_user_type ON public.tasks (user_id, type);

-- ============================================================================
-- STEP 3: Create SQL functions for atomic JSONB operations
-- ============================================================================

-- Function: Append a step to the steps array
-- Usage: SELECT append_task_step('task-uuid', '{"id": "...", "name": "...", ...}'::jsonb);
CREATE OR REPLACE FUNCTION public.append_task_step(p_task_id UUID, p_step JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tasks 
  SET 
    steps = COALESCE(steps, '[]'::jsonb) || p_step,
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Function: Update a specific step within the steps array by step ID
-- Usage: SELECT update_task_step('task-uuid', 'step-uuid', '{"status": "completed", ...}'::jsonb);
CREATE OR REPLACE FUNCTION public.update_task_step(p_task_id UUID, p_step_id TEXT, p_updates JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_steps JSONB;
BEGIN
  -- Build updated steps array
  SELECT jsonb_agg(
    CASE 
      WHEN step->>'id' = p_step_id 
      THEN step || p_updates
      ELSE step
    END
    ORDER BY (step->>'order')::int
  )
  INTO updated_steps
  FROM jsonb_array_elements(
    (SELECT COALESCE(steps, '[]'::jsonb) FROM public.tasks WHERE id = p_task_id)
  ) AS step;
  
  -- Update the task
  UPDATE public.tasks
  SET 
    steps = COALESCE(updated_steps, '[]'::jsonb),
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Function: Merge updates into output_data (deep merge)
-- Usage: SELECT merge_task_output('task-uuid', '{"chapters": [...], "final_script": "..."}'::jsonb);
CREATE OR REPLACE FUNCTION public.merge_task_output(p_task_id UUID, p_updates JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tasks
  SET 
    output_data = COALESCE(output_data, '{}'::jsonb) || p_updates,
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Function: Append an item to a JSONB array within output_data
-- Usage: SELECT append_to_output_array('task-uuid', 'chapters', '{"chapterNumber": 1, ...}'::jsonb);
CREATE OR REPLACE FUNCTION public.append_to_output_array(p_task_id UUID, p_key TEXT, p_item JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tasks
  SET 
    output_data = jsonb_set(
      COALESCE(output_data, '{}'::jsonb),
      ARRAY[p_key],
      COALESCE(output_data->p_key, '[]'::jsonb) || p_item
    ),
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Function: Get step statistics for a task
-- Returns: {total, pending, running, completed, failed}
CREATE OR REPLACE FUNCTION public.get_task_step_stats(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE step->>'status' = 'pending'),
    'running', COUNT(*) FILTER (WHERE step->>'status' = 'running'),
    'completed', COUNT(*) FILTER (WHERE step->>'status' = 'completed'),
    'failed', COUNT(*) FILTER (WHERE step->>'status' = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE step->>'status' = 'skipped')
  )
  INTO result
  FROM jsonb_array_elements(
    (SELECT COALESCE(steps, '[]'::jsonb) FROM public.tasks WHERE id = p_task_id)
  ) AS step;
  
  RETURN COALESCE(result, '{"total": 0, "pending": 0, "running": 0, "completed": 0, "failed": 0, "skipped": 0}'::jsonb);
END;
$$;

-- ============================================================================
-- STEP 4: Grant permissions on new functions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.append_task_step(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_task_step(UUID, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_task_step(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_step(UUID, TEXT, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.merge_task_output(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_task_output(UUID, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.append_to_output_array(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_to_output_array(UUID, TEXT, JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_task_step_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_step_stats(UUID) TO service_role;

-- ============================================================================
-- STEP 5: Migrate existing data from task_steps to tasks.steps
-- ============================================================================

-- Migrate task_steps data into the steps JSONB array
UPDATE public.tasks t
SET steps = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ts.id::text,
      'name', ts.step_name,
      'phase', ts.phase,
      'order', ts.step_order,
      'status', ts.status,
      'started_at', ts.started_at,
      'completed_at', ts.completed_at,
      'duration_ms', ts.duration_ms,
      'token_count', ts.token_count,
      'error', ts.error_message
    ) ORDER BY ts.step_order
  ), '[]'::jsonb)
  FROM public.task_steps ts
  WHERE ts.task_id = t.id
)
WHERE EXISTS (SELECT 1 FROM public.task_steps ts WHERE ts.task_id = t.id);

-- ============================================================================
-- STEP 6: Migrate type-specific columns into output_data for writing tasks
-- ============================================================================

UPDATE public.tasks
SET output_data = jsonb_strip_nulls(jsonb_build_object(
  'research', research,
  'master_outline', master_outline,
  'detailed_outline', detailed_outline,
  'characters', characters,
  'settings', settings,
  'chapters', chapters,
  'final_script', final_script
))
WHERE type = 'writing_workflow'
  AND output_data = '{}'::jsonb
  AND (
    research IS NOT NULL 
    OR master_outline IS NOT NULL 
    OR detailed_outline IS NOT NULL
    OR characters IS NOT NULL 
    OR settings IS NOT NULL
    OR chapters IS NOT NULL 
    OR final_script IS NOT NULL
  );

-- ============================================================================
-- STEP 7: Update type column to use simpler names
-- ============================================================================

UPDATE public.tasks 
SET type = 'writing' 
WHERE type = 'writing_workflow';

-- Update constraint to include all task types
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type = ANY (ARRAY['writing', 'audio', 'video', 'export']));

-- ============================================================================
-- STEP 8: Add constraint for phases (now supports all workflow phases)
-- ============================================================================

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_current_phase_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_current_phase_check 
  CHECK (current_phase IS NULL OR current_phase = ANY (ARRAY[
    'preprocessing', 
    'writing', 
    'postprocessing',
    'audio_generation',
    'audio_processing',
    'image_generation',
    'video_generation',
    'compositing',
    'encoding',
    'uploading'
  ]));

-- ============================================================================
-- NOTES:
-- ============================================================================
-- The old type-specific columns (research, master_outline, etc.) are kept
-- for backward compatibility. They can be dropped in a future migration
-- once all code is updated to use output_data.
--
-- The task_steps table is also kept for now. It will be dropped in a
-- separate migration after confirming the new system works correctly.
-- ============================================================================
