import { inngest } from "../../client";
import { generateText, generateJSON } from "@/lib/ai/openrouter";
import type { 
  MasterOutline, 
  ChapterOutline, 
  Character, 
  Setting,
  WritingTaskOutput,
} from "@/types/task";
import { 
  getSupabaseServiceClient,
  addTaskStep, 
  completeStep, 
  failStep, 
  updateTaskStatus, 
  updateTaskOutput,
  appendChapter,
  updateContinuityState,
  getContinuityState
} from "../shared";
import { PROMPTS } from "./prompts";
import { STEP_ORDER } from "./constants";

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
