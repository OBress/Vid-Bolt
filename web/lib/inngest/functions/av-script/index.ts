import { inngest } from "../../client";
import { getSupabaseServiceClient } from "../shared";

interface AVScriptWorkflowInput {
  taskId: string;
  userId: string;
  videoId: string;
  script: string;
  wordTimestamps: Array<{ word: string; start_seconds: number; end_seconds: number }>;
  totalDurationSeconds: number;
}

export const avScriptWorkflow = inngest.createFunction(
  {
    id: "av-script-workflow",
    retries: 3,
    concurrency: {
      limit: 10,
      key: "event.data.userId",
    },
  },
  { event: "av-script/generate.start" },
  async ({ event, step }) => {
    const input = event.data as AVScriptWorkflowInput;
    const { userId, videoId, script, wordTimestamps, totalDurationSeconds } = input;

    console.log(`[AVScript] Starting for video ${videoId} with ${wordTimestamps.length} words`);

    // Step 1: Analyze content structure
    const analysis = await step.run("analyze-content", async () => {
      console.log("[AVScript] Step 1: Analyzing content structure...");
      const { analyzeContentStructure } = await import("@/lib/av-script/analyzer");
      const result = analyzeContentStructure(script, wordTimestamps);
      console.log(`[AVScript] Found ${result.lists.length} lists, ${result.comparisons.length} comparisons, ${result.transitions.length} transitions`);
      return result;
    });

    // Step 2: Segment timeline
    const segments = await step.run("segment-timeline", async () => {
      console.log("[AVScript] Step 2: Segmenting timeline...");
      const { segmentTimeline } = await import("@/lib/av-script/segmenter");
      const result = segmentTimeline(wordTimestamps, analysis);
      console.log(`[AVScript] Created ${result.length} segments`);
      return result;
    });

    // Step 3: Generate visual prompts
    const shotsWithPrompts = await step.run("generate-visual-prompts", async () => {
      console.log("[AVScript] Step 3: Generating visual prompts...");
      const { generateVisualPrompts } = await import("@/lib/av-script/prompt-gen");
      const result = await generateVisualPrompts(userId, segments);
      console.log(`[AVScript] Generated ${result.filter(s => s.visual_prompt).length} visual prompts`);
      return result;
    });

    // Step 4: Store in video metadata
    await step.run("store-shot-list", async () => {
      console.log("[AVScript] Step 4: Storing shot list in video metadata...");
      const supabase = getSupabaseServiceClient();
      
      // Get existing metadata
      const { data: video } = await supabase
        .from("video_projects")
        .select("metadata")
        .eq("id", videoId)
        .single();
      
      const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;
      
      // Merge shot list into metadata
      const updatedMetadata = {
        ...existingMetadata,
        shot_list: shotsWithPrompts.map(s => ({
          segment_index: s.segment_index,
          start_seconds: s.start_seconds,
          end_seconds: s.end_seconds,
          duration_seconds: s.duration_seconds,
          content_type: s.content_type,
          text: s.text,
          visual_prompt: s.visual_prompt,
          media_type: s.media_type,
        })),
        content_analysis: {
          lists_count: analysis.lists.length,
          comparisons_count: analysis.comparisons.length,
          transitions_count: analysis.transitions.length,
          emotional_beats_count: analysis.emotional_beats.length,
        },
        av_script_completed: true,
      };
      
      const { error } = await supabase
        .from("video_projects")
        .update({ 
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      if (error) {
        console.error("[AVScript] Failed to store shot list:", error);
        throw error;
      }
      
      console.log(`[AVScript] Stored ${shotsWithPrompts.length} shots in video ${videoId} metadata`);
    });

    console.log(`[AVScript] Complete for video ${videoId}`);

    return {
      success: true,
      videoId,
      segmentCount: shotsWithPrompts.length,
    };
  }
);
