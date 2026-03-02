import { createServiceClient } from "@/lib/supabase/service";

/**
 * Updates a video project using the service-role client.
 *
 * This function exists because the `video_projects` table has a BEFORE UPDATE
 * trigger that blocks client-side modifications to pipeline-managed columns
 * (status, current_stage, current_step, progress_percent, metadata, task FKs).
 *
 * API routes authenticate users with the anon-key client first, then call this
 * function to perform the actual update via service-role — bypassing the trigger.
 *
 * @param projectId - The video project ID
 * @param updates - The fields to update
 * @returns The Supabase response
 */
export async function updateVideoProject(
  projectId: string,
  updates: Record<string, any>
) {
  const supabase = createServiceClient();
  return supabase
    .from("video_projects")
    .update(updates)
    .eq("id", projectId);
}
