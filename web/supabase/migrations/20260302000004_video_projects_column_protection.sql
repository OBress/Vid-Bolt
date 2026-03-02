-- ============================================================================
-- video_projects Column-Level Protection Trigger
-- ============================================================================
-- Protects pipeline-managed columns from client-side modification.
-- API routes use the service-role client via updateVideoProject() helper
-- to bypass this trigger for legitimate server-side updates.
-- ============================================================================

-- Allowlist: name, idea, notes (user-editable)
-- Protected: status, current_stage, current_step, progress_percent,
--            metadata, script_content, script_task_id, audio_task_id,
--            video_task_id, export_task_id, project_id

CREATE OR REPLACE FUNCTION public.protect_video_projects_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role full access
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to pipeline-managed columns
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.status';
  END IF;

  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.current_stage';
  END IF;

  IF NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.current_step';
  END IF;

  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.progress_percent';
  END IF;

  IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.metadata';
  END IF;

  IF NEW.script_content IS DISTINCT FROM OLD.script_content THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.script_content';
  END IF;

  IF NEW.script_task_id IS DISTINCT FROM OLD.script_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.script_task_id';
  END IF;

  IF NEW.audio_task_id IS DISTINCT FROM OLD.audio_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.audio_task_id';
  END IF;

  IF NEW.video_task_id IS DISTINCT FROM OLD.video_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.video_task_id';
  END IF;

  IF NEW.export_task_id IS DISTINCT FROM OLD.export_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.export_task_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_video_projects_sensitive_columns_trigger
  BEFORE UPDATE ON public.video_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_video_projects_sensitive_columns();

COMMENT ON FUNCTION public.protect_video_projects_sensitive_columns() IS
'Blocks non-service-role callers from modifying pipeline-managed video project columns. Users can only modify: name, idea, notes.';
