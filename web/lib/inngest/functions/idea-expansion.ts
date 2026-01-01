import { inngest } from "../client";
import { generateText } from "@/lib/ai/openrouter";
import { 
  getSupabaseServiceClient,
  addTaskStep, 
  updateStepStatus, 
  completeStep, 
  failStep, 
  updateTaskStatus, 
  updateTaskOutput 
} from "./shared";

// ============================================================================
// IDEA EXPANSION WORKFLOW
// ============================================================================

interface IdeaExpansionInput {
  taskId: string;
  userId: string;
  videoId: string;
  idea: string;
}

const IDEA_EXPANSION_PROMPT = `You are a creative content strategist specializing in video content.
Your job is to take a simple idea and expand it into a compelling, detailed video concept.

Create an expansion that includes:
1. A refined, attention-grabbing title
2. A compelling hook that will immediately capture viewer attention
3. Key points to cover (3-5 main topics)
4. Potential visual elements or B-roll suggestions
5. Target audience identification
6. Estimated video length recommendation

Be creative, engaging, and specific. Make the concept feel professional and well-thought-out.`;

export const ideaExpansion = inngest.createFunction(
  {
    id: "idea-expansion",
    retries: 3,
    concurrency: {
      limit: 10,
      key: "event.data.userId",
    },
  },
  { event: "idea/expand.start" },
  async ({ event, step }) => {
    const input = event.data as IdeaExpansionInput;
    const { taskId, userId, videoId, idea } = input;

    // Update video progress
    await step.run("start-expansion", async () => {
      const { updateVideoProgress } = await import("@/lib/services/video-service");
      await updateVideoProgress(videoId, "idea", "Expanding your idea", 10);
      
      await updateTaskStatus(taskId, {
        status: "running",
        current_phase: "preprocessing",
        current_step: "Analyzing idea...",
        progress_percent: 10,
        started_at: new Date().toISOString(),
      });
    });

    // Step 1: Analyze the idea
    const stepId1 = await step.run("analyze-idea-step", async () => {
      return await addTaskStep(taskId, "preprocessing", "Analyze Idea", 1);
    });

    await step.run("update-analyzing", async () => {
      await updateTaskStatus(taskId, {
        current_step: "Analyzing idea structure...",
        progress_percent: 25,
      });
    });

    // Step 2: Expand the idea
    const expandedIdea = await step.run("expand-idea", async () => {
      await completeStep(taskId, stepId1);
      
      const stepId2 = await addTaskStep(taskId, "preprocessing", "Expand Concept", 2);
      await updateTaskStatus(taskId, {
        current_step: "Generating expanded concept...",
        progress_percent: 50,
      });

      try {
        const response = await generateText(
          userId,
          IDEA_EXPANSION_PROMPT,
          `Expand this video idea into a complete concept:\n\n"${idea}"\n\nProvide a detailed, engaging expansion that would excite a content creator.`
        );

        await completeStep(taskId, stepId2, response.usage.totalTokens);
        return response.content;
      } catch (error) {
        await failStep(taskId, stepId2, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 3: Finalize and save
    await step.run("finalize-expansion", async () => {
      const stepId3 = await addTaskStep(taskId, "preprocessing", "Finalize Expansion", 3);
      await updateTaskStatus(taskId, {
        current_step: "Finalizing expansion...",
        progress_percent: 80,
      });

      // Update task with expanded idea
      await updateTaskOutput(taskId, { expanded_idea: expandedIdea });
      
      // Update video project
      const supabase = getSupabaseServiceClient();
      await supabase
        .from("video_projects")
        .update({
          metadata: { expanded_idea: expandedIdea },
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId);

      await completeStep(taskId, stepId3);
    });

    // Complete workflow
    await step.run("complete-expansion", async () => {
      const { updateVideoProgress } = await import("@/lib/services/video-service");
      await updateVideoProgress(videoId, "idea", "Idea expanded", 100);
      
      await updateTaskStatus(taskId, {
        status: "completed",
        current_step: "Idea expansion complete!",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      });
    });

    return {
      success: true,
      taskId,
      videoId,
      expandedIdea,
    };
  }
);
