/**
 * Writing Workflow - Inngest Functions
 * ============================================================================
 * Implements the 3-phase writing process:
 * 1. Preprocessing: Research, Outline, Characters, Settings
 * 2. Writing: Chapter-by-chapter with continuity management
 * 3. Post-Processing: AI cleanup, normalization, formatting
 * 
 * Uses consolidated task schema with JSONB steps array.
 */

import { inngest } from "./client";
import { generateText, generateJSON } from "@/lib/ai/openrouter";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { 
  TaskStep, 
  TaskPhase, 
  MasterOutline, 
  ChapterOutline, 
  Character, 
  Setting,
  WritingTaskOutput,
} from "@/types/task";

// ============================================================================
// TYPES
// ============================================================================

interface WritingWorkflowInput {
  taskId: string;
  userId: string;
  projectId?: string;
  videoId?: string;  // NEW: Optional video project ID for tracking
  scriptType: "top_10" | "long_form" | "kitcon";
  idea: string;
  researchEnabled?: boolean;
  numberOfChapters?: number;
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

let supabaseClient: SupabaseClient | null = null;

function getSupabaseServiceClient(): SupabaseClient {
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
async function addTaskStep(
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
async function updateStepStatus(
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
async function completeStep(
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
async function failStep(
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
async function updateTaskStatus(
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
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId);
  
  if (error) throw new Error(`Failed to update task: ${error.message}`);
}

/**
 * Updates task output_data with type-specific content.
 * Merges with existing output_data rather than replacing.
 */
async function updateTaskOutput(
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
async function appendChapter(
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

async function updateContinuityState(
  taskId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("continuity_state")
    .upsert({ task_id: taskId, ...updates }, { onConflict: "task_id" });
  if (error) throw new Error(`Failed to update continuity: ${error.message}`);
}

async function getContinuityState(taskId: string) {
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

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const PROMPTS = {
  research: `You are a research assistant gathering information for a story.
Provide factual, relevant information that could enhance the narrative.
Be thorough but concise. Focus on interesting details that can make the story more engaging.`,

  masterOutline: `You are a professional story architect.
Create a compelling master outline that hooks readers from the start.
Structure the narrative for maximum engagement and emotional impact.
Ensure each chapter has a clear purpose and contributes to the overall arc.`,

  characters: `You are a character development specialist.
Create memorable, distinct characters with clear motivations.
Give them unique voices, interesting flaws, and compelling backstories.
Ensure character names are distinct and easy to remember.`,

  settings: `You are a world-building expert.
Create vivid, immersive settings that enhance the story.
Include sensory details and atmospheric elements.
Ensure settings serve the narrative and character development.`,

  chapterOutline: `You are a story structure expert.
Break down each chapter with specific beats and moments.
Ensure proper pacing with tension and release.
Include hooks at the end of each chapter section.`,

  writing: `You are a bestselling author writing in a captivating style.
Write engaging prose that keeps readers turning pages.
Show don't tell. Use vivid descriptions and sharp dialogue.
Maintain consistent voice and pacing throughout.`,

  qualityCheck: `You are an editor reviewing content for quality.
Check for: engaging narrative, consistent tone, logical flow, and reader engagement.
Identify any issues that would make readers lose interest.
Be specific about problems and suggest improvements.`,

  aiCleanup: `You are an editor removing AI-like patterns from text.
Remove: overused phrases, repetitive structures, obvious AI tells.
Common AI-isms to remove: "delve", "tapestry", "intricate", "journey", "nestled".
Maintain the author's voice while making the prose more natural.`,

  phoneticNormalization: `You are a TTS optimization specialist.
Adjust words that have ambiguous pronunciation.
For example: "read" (present) vs "read" (past) - clarify context.
Spell out numbers and abbreviations for better TTS output.`,
};

// ============================================================================
// STEP ORDER CONSTANTS
// ============================================================================

const STEP_ORDER = {
  // Preprocessing (1-99)
  RESEARCH: 1,
  MASTER_OUTLINE: 2,
  CHARACTERS: 3,
  SETTINGS: 4,
  DETAILED_OUTLINE: 5,
  
  // Writing (100-199) - chapters use 100 + chapterNumber
  CHAPTER_BASE: 100,
  
  // Quality checks (200-299) - use 200 + chapterNumber
  QUALITY_CHECK_BASE: 200,
  
  // Postprocessing (300+)
  AI_CLEANUP: 300,
  CONTINUITY_CHECK: 301,
  PHONETIC_NORMALIZATION: 302,
} as const;

// ============================================================================
// MAIN WORKFLOW FUNCTION
// ============================================================================

export const writingWorkflow = inngest.createFunction(
  {
    id: "writing-workflow",
    retries: 3,
    concurrency: {
      limit: 5, // Limit concurrent workflows per user for scaling
      key: "event.data.userId",
    },
  },
  { event: "writing/workflow.start" },
  async ({ event, step }) => {
    const input = event.data as WritingWorkflowInput;
    const { taskId, userId, videoId, scriptType, idea, researchEnabled, numberOfChapters = 5 } = input;

    // Link task to video project if videoId provided
    if (videoId) {
      await step.run("link-task-to-video", async () => {
        const { linkTaskToVideo, updateVideoProgress } = await import("@/lib/services/video-service");
        await linkTaskToVideo(videoId, taskId, "script");
        await updateVideoProgress(videoId, "script", "Starting script generation", 5);
      });
    }

    // ========================================================================
    // PHASE 1: PREPROCESSING
    // ========================================================================

    await step.run("start-preprocessing", async () => {
      await updateTaskStatus(taskId, {
        status: "running",
        current_phase: "preprocessing",
        current_step: "Starting preprocessing...",
        progress_percent: 0,
        started_at: new Date().toISOString(),
      });
    });

    // Step 1.1: Research (Optional)
    let researchData = "";
    if (researchEnabled) {
      researchData = await step.run("research-topic", async () => {
        const stepId = await addTaskStep(taskId, "preprocessing", "Research Topic", STEP_ORDER.RESEARCH);
        await updateTaskStatus(taskId, { current_step: "Researching topic...", progress_percent: 5 });

        try {
          const response = await generateText(
            userId,
            PROMPTS.research,
            `Research the following topic for a ${scriptType} story:\n\n${idea}\n\nProvide relevant facts, interesting angles, and potential plot hooks.`
          );

          await updateTaskOutput(taskId, { research: response.content });
          await completeStep(taskId, stepId, response.usage.totalTokens);
          return response.content;
        } catch (error) {
          await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      });
    }

    // Step 1.2: Master Outline
    const masterOutline = await step.run("generate-master-outline", async () => {
      const stepId = await addTaskStep(taskId, "preprocessing", "Master Outline", STEP_ORDER.MASTER_OUTLINE);
      await updateTaskStatus(taskId, { current_step: "Generating master outline...", progress_percent: 15 });

      const scriptTypePrompts = {
        top_10: "This is a Top 10 list format. Create 10 distinct items with engaging introductions for each.",
        long_form: "This is a long-form narrative. Create a compelling story arc with rising action, climax, and resolution.",
        kitcon: "This is a Kitcon-style video. Create an engaging hook, build curiosity, and deliver satisfying payoffs.",
      };

      try {
        const response = await generateJSON<MasterOutline>(
          userId,
          PROMPTS.masterOutline,
          `Create a master outline for a ${scriptType} story with ${numberOfChapters} chapters.

${scriptTypePrompts[scriptType]}

Idea: ${idea}
${researchData ? `Research: ${researchData}` : ""}

Return JSON format:
{
  "title": "Story Title",
  "synopsis": "Overall story synopsis",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Title",
      "summary": "What happens in this chapter",
      "keyEvents": ["Event 1", "Event 2"]
    }
  ]
}`
        );

        await updateTaskOutput(taskId, { master_outline: response });
        await completeStep(taskId, stepId);
        return response;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 1.3: Characters
    const characters = await step.run("generate-characters", async () => {
      const stepId = await addTaskStep(taskId, "preprocessing", "Character Development", STEP_ORDER.CHARACTERS);
      await updateTaskStatus(taskId, { current_step: "Developing characters...", progress_percent: 25 });

      try {
        const response = await generateJSON<Character[]>(
          userId,
          PROMPTS.characters,
          `Create characters for this story:

Title: ${masterOutline.title}
Synopsis: ${masterOutline.synopsis}

Create 3-5 main characters with distinct personalities. Return JSON array:
[
  {
    "name": "Character Name",
    "description": "Physical and personality description",
    "role": "protagonist/antagonist/supporting",
    "traits": ["trait1", "trait2"]
  }
]`
        );

        await updateTaskOutput(taskId, { characters: response });
        await completeStep(taskId, stepId);
        return response;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 1.4: Settings
    const settings = await step.run("generate-settings", async () => {
      const stepId = await addTaskStep(taskId, "preprocessing", "Setting Development", STEP_ORDER.SETTINGS);
      await updateTaskStatus(taskId, { current_step: "Creating settings...", progress_percent: 35 });

      try {
        const response = await generateJSON<Setting[]>(
          userId,
          PROMPTS.settings,
          `Create settings/locations for this story:

Title: ${masterOutline.title}
Synopsis: ${masterOutline.synopsis}

Create 2-4 key locations. Return JSON array:
[
  {
    "name": "Location Name",
    "description": "Vivid sensory description",
    "significance": "Why this place matters to the story"
  }
]`
        );

        await updateTaskOutput(taskId, { settings: response });
        await completeStep(taskId, stepId);
        return response;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 1.5: Detailed Chapter Outline
    const detailedOutline = await step.run("detailed-chapter-outline", async () => {
      const stepId = await addTaskStep(taskId, "preprocessing", "Detailed Chapter Outline", STEP_ORDER.DETAILED_OUTLINE);
      await updateTaskStatus(taskId, { current_step: "Creating detailed chapter outline...", progress_percent: 45 });

      try {
        const response = await generateJSON<ChapterOutline[] | MasterOutline>(
          userId,
          PROMPTS.chapterOutline,
          `Expand the master outline into detailed chapter breakdowns.

Master Outline: ${JSON.stringify(masterOutline)}
Characters: ${JSON.stringify(characters)}
Settings: ${JSON.stringify(settings)}

For each chapter, provide detailed beats with 5-8 keyEvents per chapter.

Return ONLY a JSON array of chapters in this exact format:
[
  {
    "chapterNumber": 1,
    "title": "Chapter Title",
    "summary": "What happens in this chapter",
    "keyEvents": ["Event 1", "Event 2", "Event 3", "Event 4", "Event 5"]
  }
]`
        );

        // Handle both array and object responses
        let chapters: ChapterOutline[];
        if (Array.isArray(response)) {
          chapters = response;
        } else if (response && typeof response === 'object' && 'chapters' in response) {
          chapters = (response as MasterOutline).chapters;
        } else {
          throw new Error(`Unexpected response format: ${JSON.stringify(response).substring(0, 200)}`);
        }

        if (!chapters || chapters.length === 0) {
          throw new Error(`No chapters found in response`);
        }

        console.log(`Generated detailed outline with ${chapters.length} chapters`);
        
        await updateTaskOutput(taskId, { detailed_outline: chapters });
        await completeStep(taskId, stepId);

        // Initialize continuity state
        await updateContinuityState(taskId, {
          total_chapters: chapters.length,
          current_chapter: 0,
          story_synopsis: masterOutline.synopsis,
          characters: characters,
          settings: settings,
        });

        return chapters;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // ========================================================================
    // PHASE 2: WRITING
    // ========================================================================

    await step.run("start-writing-phase", async () => {
      await updateTaskStatus(taskId, {
        current_phase: "writing",
        current_step: "Beginning writing phase...",
        progress_percent: 50,
      });
      
      // Update video progress if tracking
      if (videoId) {
        const { updateVideoProgress } = await import("@/lib/services/video-service");
        await updateVideoProgress(videoId, "script", "Writing chapters", 50);
      }
    });

    // Validate detailedOutline before writing phase
    if (!detailedOutline || !Array.isArray(detailedOutline) || detailedOutline.length === 0) {
      throw new Error(`Cannot start writing phase: detailedOutline is invalid (${JSON.stringify(detailedOutline)})`);
    }

    console.log(`Starting writing phase with ${detailedOutline.length} chapters to write`);

    const chapters: string[] = [];
    const progressPerChapter = 40 / detailedOutline.length;

    for (let i = 0; i < detailedOutline.length; i++) {
      const chapterOutline = detailedOutline[i];
      const chapterNum = i + 1;
      
      console.log(`Processing chapter ${chapterNum}/${detailedOutline.length}: ${chapterOutline?.title || 'untitled'}`);

      const chapterContent = await step.run(`write-chapter-${chapterNum}`, async () => {
        const stepId = await addTaskStep(taskId, "writing", `Write Chapter ${chapterNum}`, STEP_ORDER.CHAPTER_BASE + chapterNum);
        await updateTaskStatus(taskId, {
          current_step: `Writing chapter ${chapterNum} of ${detailedOutline.length}...`,
          progress_percent: Math.round(50 + i * progressPerChapter),
        });

        try {
          // Get continuity state
          const continuity = await getContinuityState(taskId);
          const previousChapters = chapters.slice(-2).join("\n\n---\n\n"); // Last 2 chapters for context

          const response = await generateText(
            userId,
            PROMPTS.writing,
            `Write chapter ${chapterNum}: "${chapterOutline.title}"

STORY CONTEXT:
- Synopsis: ${continuity?.story_synopsis || masterOutline.synopsis}
- Previous chapter summary: ${continuity?.previous_chapter_summary || "This is the first chapter."}

CHAPTER OUTLINE:
${chapterOutline.summary}

KEY EVENTS TO COVER:
${chapterOutline.keyEvents.map((e, i) => `${i + 1}. ${e}`).join("\n")}

CHARACTERS:
${JSON.stringify(characters.slice(0, 3))}

${previousChapters ? `PREVIOUS CONTEXT (for continuity):\n${previousChapters.substring(0, 1000)}...` : ""}

Write the full chapter with engaging prose, vivid descriptions, and sharp dialogue.
End with a hook to keep readers interested in the next chapter.`
          );

          // Append chapter to the chapters array in output_data
          await appendChapter(taskId, {
            chapterNumber: chapterNum,
            title: chapterOutline.title,
            content: response.content,
          });

          // Update continuity for next chapter
          await updateContinuityState(taskId, {
            current_chapter: chapterNum,
            previous_chapter_summary: `Chapter ${chapterNum}: ${chapterOutline.summary}`,
          });

          await completeStep(taskId, stepId, response.usage.totalTokens);
          return response.content;
        } catch (error) {
          await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      });

      chapters.push(chapterContent);

      // Quality check every few chapters
      if (chapterNum % 3 === 0 || chapterNum === detailedOutline.length) {
        await step.run(`quality-check-${chapterNum}`, async () => {
          const stepId = await addTaskStep(taskId, "writing", `Quality Check (Chapter ${chapterNum})`, STEP_ORDER.QUALITY_CHECK_BASE + chapterNum);
          
          try {
            const response = await generateText(
              userId,
              PROMPTS.qualityCheck,
              `Review the following chapter for quality:

${chapterContent.substring(0, 3000)}...

Is this engaging? Are there any issues with pacing, tone, or logic?
Provide a brief assessment (1-2 sentences).`
            );

            await completeStep(taskId, stepId, response.usage.totalTokens);
          } catch (error) {
            // Quality check failures are non-fatal
            await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
          }
        });
      }
    }

    // ========================================================================
    // PHASE 3: POST-PROCESSING
    // ========================================================================

    await step.run("start-postprocessing", async () => {
      await updateTaskStatus(taskId, {
        current_phase: "postprocessing",
        current_step: "Beginning post-processing...",
        progress_percent: 90,
      });
    });

    // Step 3.1: Fetch all chapters from tasks table (in case memory was lost)
    const allChapters = await step.run("fetch-chapters", async () => {
      // If we have chapters in memory from the writing phase, use those
      if (chapters.length > 0) {
        console.log(`Using ${chapters.length} in-memory chapters`);
        return chapters;
      }

      // Otherwise, fetch from database (workflow was likely interrupted)
      console.log("Fetching chapters from database");
      const supabase = getSupabaseServiceClient();
      const { data: task, error } = await supabase
        .from("tasks")
        .select("output_data")
        .eq("id", taskId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch task: ${error.message}`);
      }

      // Extract chapters from output_data
      const outputData = task?.output_data as WritingTaskOutput | null;
      const chaptersData = outputData?.chapters;
      
      if (!chaptersData || !Array.isArray(chaptersData) || chaptersData.length === 0) {
        console.error("Output data:", JSON.stringify(outputData));
        throw new Error(`No chapters found in task. The workflow may have been interrupted before any chapters were written.`);
      }

      // Sort by chapter number and return content
      return chaptersData
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((c) => c.content);
    });

    // Step 3.2: AI Cleanup (process each chapter individually)
    const cleanedChapters = await step.run("ai-cleanup", async () => {
      const stepId = await addTaskStep(taskId, "postprocessing", "AI Phrase Cleanup", STEP_ORDER.AI_CLEANUP);
      await updateTaskStatus(taskId, { current_step: "Removing AI-isms...", progress_percent: 92 });

      try {
        const cleaned: string[] = [];
        
        for (let i = 0; i < allChapters.length; i++) {
          const chapter = allChapters[i];
          
          // Skip if chapter is empty
          if (!chapter || chapter.trim().length === 0) {
            cleaned.push("");
            continue;
          }

          // Process chapter in chunks if too long (to avoid context window issues)
          const maxChunkSize = 6000;
          if (chapter.length > maxChunkSize) {
            const chunkCount = Math.ceil(chapter.length / maxChunkSize);
            const chapterChunks: string[] = [];
            
            for (let j = 0; j < chunkCount; j++) {
              const chunkStart = j * maxChunkSize;
              const chunk = chapter.substring(chunkStart, chunkStart + maxChunkSize);
              
              const response = await generateText(
                userId,
                PROMPTS.aiCleanup,
                `Clean up the following text section, removing AI-like patterns while preserving the content exactly. 
DO NOT summarize or shorten - return the full cleaned text.

TEXT TO CLEAN:
${chunk}`
              );
              chapterChunks.push(response.content);
            }
            
            cleaned.push(chapterChunks.join(""));
          } else {
            const response = await generateText(
              userId,
              PROMPTS.aiCleanup,
              `Clean up the following text, removing AI-like patterns while preserving the content exactly.
DO NOT summarize or shorten - return the full cleaned text.

TEXT TO CLEAN:
${chapter}`
            );
            cleaned.push(response.content);
          }
        }

        await completeStep(taskId, stepId);
        return cleaned;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 3.3: Final Continuity Check (just verify, don't modify)
    await step.run("final-continuity-check", async () => {
      const stepId = await addTaskStep(taskId, "postprocessing", "Continuity Check", STEP_ORDER.CONTINUITY_CHECK);
      await updateTaskStatus(taskId, { current_step: "Checking continuity...", progress_percent: 95 });

      try {
        // Take a sample from cleaned chapters for continuity check
        const sampleText = cleanedChapters.slice(0, 2).join("\n\n---\n\n").substring(0, 5000);

        await generateText(
          userId,
          "You are a continuity editor. Briefly identify any major plot holes or inconsistencies. Be concise.",
          `Review this story excerpt for continuity issues:\n\n${sampleText}\n\nList any issues found (or state 'No major issues found').`
        );

        await completeStep(taskId, stepId);
      } catch (error) {
        // Continuity check failures are non-fatal
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
      }
    });

    // Step 3.4: Phonetic Normalization (process each chapter individually)
    const normalizedScript = await step.run("phonetic-normalization", async () => {
      const stepId = await addTaskStep(taskId, "postprocessing", "Phonetic Normalization", STEP_ORDER.PHONETIC_NORMALIZATION);
      await updateTaskStatus(taskId, { current_step: "Optimizing for TTS...", progress_percent: 97 });

      try {
        const normalized: string[] = [];
        
        for (let i = 0; i < cleanedChapters.length; i++) {
          const chapter = cleanedChapters[i];
          
          // Skip if chapter is empty
          if (!chapter || chapter.trim().length === 0) {
            normalized.push("");
            continue;
          }

          // Process in chunks if too long
          const maxChunkSize = 6000;
          if (chapter.length > maxChunkSize) {
            const chunkCount = Math.ceil(chapter.length / maxChunkSize);
            const chapterChunks: string[] = [];
            
            for (let j = 0; j < chunkCount; j++) {
              const chunkStart = j * maxChunkSize;
              const chunk = chapter.substring(chunkStart, chunkStart + maxChunkSize);
              
              const response = await generateText(
                userId,
                PROMPTS.phoneticNormalization,
                `Optimize this text section for text-to-speech. Return the complete optimized text:

${chunk}`
              );
              chapterChunks.push(response.content);
            }
            
            normalized.push(chapterChunks.join(""));
          } else {
            const response = await generateText(
              userId,
              PROMPTS.phoneticNormalization,
              `Optimize this text for text-to-speech. Return the complete optimized text:

${chapter}`
            );
            normalized.push(response.content);
          }
        }

        // Combine all chapters into final script
        const finalScript = normalized.join("\n\n---\n\n");
        
        // Save the final script to output_data
        await updateTaskOutput(taskId, { final_script: finalScript });
        await completeStep(taskId, stepId);
        
        return finalScript;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // ========================================================================
    // COMPLETION
    // ========================================================================

    await step.run("complete-workflow", async () => {
      await updateTaskStatus(taskId, {
        status: "completed",
        current_step: "Workflow completed!",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      });
      
      // Update video project if tracking
      if (videoId) {
        const { updateVideoContent, updateVideoProgress } = await import("@/lib/services/video-service");
        await updateVideoContent(videoId, { script_content: normalizedScript });
        await updateVideoProgress(videoId, "audio", "Script completed, ready for audio", 100);
      }
    });

    return {
      success: true,
      taskId,
      chaptersWritten: allChapters.length,
      finalScriptLength: normalizedScript.length,
    };
  }
);

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

// ============================================================================
// AUDIO GENERATION WORKFLOW
// ============================================================================

interface AudioWorkflowInput {
  taskId: string;
  userId: string;
  videoId: string;
  script: string;
  voiceProvider: 'elevenlabs' | 'genai' | 'inworld';
  voiceModel?: string;
  voiceSettings?: {
    speakingRate?: number;
    stability?: number;
    similarityBoost?: number;
  };
}

const AUDIO_STEP_ORDER = {
  SPLIT_TEXT: 1,
  TTS_BASE: 10, // Chunk generation uses 10 + chunkIndex
  UPLOAD_BASE: 100, // Uploads use 100 + chunkIndex
  FINALIZE: 200,
} as const;

export const audioWorkflow = inngest.createFunction(
  {
    id: "audio-workflow",
    retries: 3,
    concurrency: {
      limit: 5,
      key: "event.data.userId",
    },
  },
  { event: "audio/generate.start" },
  async ({ event, step }) => {
    const input = event.data as AudioWorkflowInput;
    const { taskId, userId, videoId, script, voiceProvider, voiceModel, voiceSettings } = input;

    // Link task to video project
    await step.run("link-task-to-video", async () => {
      const { linkTaskToVideo, updateVideoProgress } = await import("@/lib/services/video-service");
      await linkTaskToVideo(videoId, taskId, "audio");
      await updateVideoProgress(videoId, "audio", "Starting audio generation", 5);
    });

    // Start audio generation
    await step.run("start-audio-generation", async () => {
      await updateTaskStatus(taskId, {
        status: "running",
        current_phase: "audio_generation",
        current_step: "Preparing script for audio...",
        progress_percent: 5,
        started_at: new Date().toISOString(),
      });
    });

    // Step 1: Split script into chunks
    const chunks = await step.run("split-script-into-chunks", async () => {
      const stepId = await addTaskStep(taskId, "audio_generation", "Split Script", AUDIO_STEP_ORDER.SPLIT_TEXT);
      await updateTaskStatus(taskId, { current_step: "Splitting script into chunks...", progress_percent: 10 });

      try {
        const { splitTextIntoChunks, getChunkStats } = await import("@/lib/utils/text-chunking");
        const textChunks = splitTextIntoChunks(script, 200);
        const stats = getChunkStats(textChunks);

        console.log(`Split script into ${stats.totalChunks} chunks, estimated duration: ${stats.estimatedTotalDuration}s`);

        await completeStep(taskId, stepId);
        return textChunks;
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Step 2: Generate TTS and upload each chunk immediately
    // IMPORTANT: We do NOT store base64 data in step results to avoid Inngest's 32MB state limit
    // Each step generates audio and uploads it to R2 in one operation, only returning the URL
    const uploadedChunks: Array<{
      chunkIndex: number;
      url: string;
      durationSeconds: number;
      wordTimestamps?: import("@/types/task").WordTimestamp[];
      text?: string;
    }> = [];

    // Track failed chunks for logging
    const failedChunkIndices: number[] = [];

    const progressPerChunk = 80 / chunks.length; // 80% of progress for TTS generation + upload

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Combined generate + upload step to avoid storing base64 in state
      const chunkResult = await step.run(`process-chunk-${i}`, async () => {
        const stepId = await addTaskStep(taskId, "audio_generation", `Process Chunk ${i + 1}`, AUDIO_STEP_ORDER.TTS_BASE + i);
        await updateTaskStatus(taskId, {
          current_step: `Processing chunk ${i + 1} of ${chunks.length} (generating + uploading)...`,
          progress_percent: Math.round(15 + i * progressPerChunk),
        });

        try {
          // Only Inworld is implemented currently
          if (voiceProvider !== 'inworld') {
            throw new Error(`Voice provider '${voiceProvider}' is not yet implemented. Currently only 'inworld' is supported.`);
          }

          // Step 2a: Generate TTS
          const { generateSpeech } = await import("@/lib/services/inworld-tts");
          const ttsResult = await generateSpeech(userId, chunk.text, {
            voiceId: voiceModel,
            speakingRate: voiceSettings?.speakingRate,
          });

          // Step 2b: Upload to R2 immediately (don't store base64 in state!)
          const { uploadAudioBuffer, generateAudioKey, isR2Configured } = await import("@/lib/services/r2-storage");

          if (!isR2Configured()) {
            throw new Error("R2 storage is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL environment variables.");
          }

          const key = generateAudioKey(userId, videoId, chunk.index, "mp3");
          const uploadResult = await uploadAudioBuffer(ttsResult.audioBuffer, key, "audio/mpeg");

          await completeStep(taskId, stepId);

          // Return only URL and duration - NO base64 data in state!
          return {
            success: true,
            chunkIndex: chunk.index,
            url: uploadResult.url,
            durationSeconds: ttsResult.durationSeconds,
            wordTimestamps: ttsResult.wordTimestamps,
            text: chunk.text,
          };
        } catch (error) {
          // Mark step as failed but DON'T throw - allows workflow to continue
          await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
          console.error(`Chunk ${i} failed, continuing:`, error);
          
          return {
            success: false,
            chunkIndex: chunk.index,
            url: null,
            durationSeconds: 0,
            wordTimestamps: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      if (chunkResult.success && chunkResult.url) {
        uploadedChunks.push({
          chunkIndex: chunkResult.chunkIndex,
          url: chunkResult.url,
          durationSeconds: chunkResult.durationSeconds,
          wordTimestamps: chunkResult.wordTimestamps,
          text: chunk.text,
        });
      } else {
        failedChunkIndices.push(chunkResult.chunkIndex);
      }
    }

    if (failedChunkIndices.length > 0) {
      console.warn(`${failedChunkIndices.length} chunks failed: ${failedChunkIndices.join(', ')}`);
    }

    // Step 4: Finalize and update video project
    const finalResult = await step.run("finalize-audio", async () => {
      const stepId = await addTaskStep(taskId, "audio_processing", "Finalize Audio", AUDIO_STEP_ORDER.FINALIZE);
      await updateTaskStatus(taskId, { current_step: "Finalizing audio...", progress_percent: 95 });

      try {
        // Calculate total duration
        const totalDuration = uploadedChunks.reduce((sum, chunk) => sum + chunk.durationSeconds, 0);

        // For now, use the first chunk as the main audio URL
        // In a full implementation, we would merge all chunks
        const primaryAudioUrl = uploadedChunks.length > 0 ? uploadedChunks[0].url : null;

        // Update task output with audio data
        const supabase = getSupabaseServiceClient();
        await supabase.rpc('merge_task_output', {
          p_task_id: taskId,
          p_updates: {
            tts_chunks: uploadedChunks.map(c => ({
              chapterNumber: c.chunkIndex,
              url: c.url,
              duration_seconds: c.durationSeconds,
              word_timestamps: c.wordTimestamps,
              text: c.text,
            })),
            total_duration_seconds: totalDuration,
            final_audio: primaryAudioUrl,
          },
        });

        await completeStep(taskId, stepId);

        // Consolidate all word timestamps with absolute offsets
        const allWordTimestamps: import("@/types/task").WordTimestamp[] = [];
        let timeOffset = 0;
        for (const chunk of uploadedChunks.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0))) {
          if (chunk.wordTimestamps) {
            for (const wt of chunk.wordTimestamps) {
              allWordTimestamps.push({
                ...wt,
                start_seconds: wt.start_seconds + timeOffset,
                end_seconds: wt.end_seconds + timeOffset,
              });
            }
          }
          timeOffset += chunk.durationSeconds;
        }

        return {
          totalDuration,
          chunkCount: uploadedChunks.length,
          primaryAudioUrl,
          allWordTimestamps,
        };
      } catch (error) {
        await failStep(taskId, stepId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    });

    // Complete workflow
    await step.run("complete-workflow", async () => {
      await updateTaskStatus(taskId, {
        status: "completed",
        current_step: "Audio generation complete!",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      });

      // Update video project with audio URL and word timestamps
      const { updateVideoContent, updateVideoProgress } = await import("@/lib/services/video-service");
      const updates: any = {};
      
      if (finalResult.primaryAudioUrl) {
        updates.audio_url = finalResult.primaryAudioUrl;
      }
      
      if (finalResult.allWordTimestamps && finalResult.allWordTimestamps.length > 0) {
        updates.metadata = {
          word_timestamps: finalResult.allWordTimestamps
        };
      }
      
      if (Object.keys(updates).length > 0) {
        await updateVideoContent(videoId, updates);
      }
      
      await updateVideoProgress(videoId, "video", "Audio completed, generating shot list...", 100);
    });

    // Trigger AV Script generation asynchronously
    // The wizard will poll for av_script_completed flag before advancing to editor
    if (finalResult.allWordTimestamps && finalResult.allWordTimestamps.length > 0) {
      await step.sendEvent("trigger-av-script", {
        name: "av-script/generate.start",
        data: {
          userId,
          videoId,
          script,
          wordTimestamps: finalResult.allWordTimestamps,
          totalDurationSeconds: finalResult.totalDuration,
        },
      });
      console.log(`[AudioWorkflow] Triggered AV Script generation for video ${videoId} with ${finalResult.allWordTimestamps.length} words`);
    }

    return {
      success: true,
      taskId,
      videoId,
      totalDuration: finalResult.totalDuration,
      chunkCount: finalResult.chunkCount,
      audioUrl: finalResult.primaryAudioUrl,
    };
  }
);

// ============================================================================
// AV SCRIPT GENERATION WORKFLOW
// ============================================================================

interface AVScriptWorkflowInput {
  taskId: string;
  userId: string;
  videoId: string;
  script: string;
  wordTimestamps: Array<{ word: string; start_seconds: number; end_seconds: number }>;
  totalDurationSeconds: number;
}

const AV_SCRIPT_STEP_ORDER = {
  ANALYZE: 1,
  SEGMENT: 2,
  GENERATE_PROMPTS: 3,
  FINALIZE: 4,
} as const;

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

// Export all functions for the Inngest serve handler
export const functions = [writingWorkflow, ideaExpansion, audioWorkflow, avScriptWorkflow];

