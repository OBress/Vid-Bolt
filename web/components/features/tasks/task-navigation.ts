/**
 * task-navigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves the in-app destination URL for any given task so that clicking a
 * task card in the Task Panel takes the user to the page where that task is
 * being performed.
 *
 * Resolution strategy per task type:
 *  - Video-linked types (closed_loop, outline, script_writing, av_script_part1,
 *    av_script_part2, edit_assembly, writing, writing_workflow, audio, video, export):
 *      → Extract videoId from input_data
 *      → Look up video_projects.project_id for that videoId
 *      → Navigate to /command-center/media/[projectId]?video=[videoId]
 *
 *  - niche_discovery  → /command-center/analytics/niche
 *  - universal_script → /command-center/systems
 *  - Fallback         → null (no navigable destination; card remains inert)
 */

import { createBrowserClient } from "@supabase/ssr";

/** Task types that are always tied to a video_projects row via input_data.videoId */
const VIDEO_LINKED_TYPES = new Set([
  "closed_loop",
  "outline",
  "script_writing",
  "av_script_part1",
  "av_script_part2",
  "edit_assembly",
  "writing",
  "writing_workflow",
  "audio",
  "video",
  "export",
]);

export interface TaskNavInput {
  type: string;
  input_data?: Record<string, unknown> | null;
  project_id?: string | null;
}

/**
 * Returns the destination URL for a task, or `null` if the task has no
 * navigable destination.
 *
 * This function performs at most one Supabase read (video_projects) and is
 * called only on user click, so latency is not a concern.
 */
export async function resolveTaskUrl(
  task: TaskNavInput,
  supabase: ReturnType<typeof createBrowserClient>
): Promise<string | null> {
  // ── Video-linked tasks ──────────────────────────────────────────────────────
  if (VIDEO_LINKED_TYPES.has(task.type)) {
    const videoId = task.input_data?.videoId as string | undefined;
    if (!videoId) return null;

    // Resolve the media project that owns this video
    const { data: video, error } = await supabase
      .from("video_projects")
      .select("project_id")
      .eq("id", videoId)
      .maybeSingle();

    if (error || !video?.project_id) return null;

    return `/command-center/media/${video.project_id}?video=${videoId}`;
  }

  // ── Standalone destinations ─────────────────────────────────────────────────
  if (task.type === "niche_discovery") {
    return "/command-center/analytics/niche";
  }

  if (task.type === "universal_script") {
    return "/command-center/systems";
  }

  return null;
}
