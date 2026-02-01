/**
 * AV Script Workflow Worker
 * ============================================================================
 * BullMQ worker for generating AV script shot lists.
 * 
 * Supports two modes:
 * - Part 1 (mode='part1'): Shot breakdown only - timing, content type, summary
 * - Full (default): Complete generation including visual prompts
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus, updateTaskOutput } from '@/lib/queues/shared';
import type { ShotForGpuGeneration } from '@/lib/av-script/gpu-batch-generation';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface AVScriptJobData {
  taskId?: string;
  userId: string;
  videoId: string;
  script: string;
  wordTimestamps: Array<{ word: string; start_seconds: number; end_seconds: number }>;
  totalDurationSeconds: number;
  outlineAssets?: {
    characters?: Array<{ id: string; name: string; role: string }>;
    locations?: Array<{ id: string; name: string; essence: string }>;
    objects?: Array<{ id: string; name: string; type: string }>;
  };
  mode?: 'part1' | 'part2' | 'full';
  /** Stock media level for intelligent matching - defaults to 'none' */
  stockMediaLevel?: 'none' | 'standard_images' | 'extensive_images' | 'standard_images_video' | 'extensive_images_video';
}

// ============================================================================
// SHOT OUTPUT INTERFACES
// ============================================================================

export interface ShotPart1 {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type: 'video' | 'motiongraphic';
  text: string;
  summary: string;  // Brief summary of what happens visually - may include @(StockMedia:id) references
  visual_prompt?: string;  // Prompt for AI image generation
  // Visual source for clear UI labeling (binary taxonomy)
  visual_source?: 'ai_video' | 'motiongraphic';
  // Stock-worthy flag: true if this shot depicts famous people/landmarks suitable for stock media
  stock_worthy?: boolean;
  // Number of images the AI wants for this shot (default: 1, for multi-image layouts)
  image_count?: number;
  // Entity name to reuse stock media for (e.g. "Donald Trump") - ensures visual consistency
  reuse_entity?: string;
  // Entity references detected in the text
  character_refs?: string[];  // Character IDs referenced
  location_refs?: string[];   // Location IDs referenced  
  object_refs?: string[];     // Object IDs referenced
  // Stock media reference (single image - for backwards compatibility)
  stock_media_ref?: {
    id: string;
    url: string;
    thumbnailUrl: string;
    description: string;
    similarity: number;
  };
  // Stock media references (multiple images when image_count > 1)
  stock_media_refs?: Array<{
    id: string;
    url: string;
    thumbnailUrl: string;
    description: string;
    similarity: number;
  }>;
  // Fallback type when no stock media matched (video = AI video generation)
  fallback_type?: 'motiongraphic' | 'video';
}

export interface AVScriptPart1Output {
  shots: ShotPart1[];
  metadata: {
    total_segments: number;
    total_duration_seconds: number;
    average_segment_duration: number;
    content_type_breakdown: Record<string, number>;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute the visual_source label for a shot.
 * Binary taxonomy: ai_video or motiongraphic.
 * Stock imagery is ALWAYS wrapped in motiongraphic.
 */
function computeVisualSource(shot: ShotPart1): 'ai_video' | 'motiongraphic' {
  // Stock media is always wrapped in motiongraphic
  if (shot.stock_media_ref || shot.stock_media_refs?.length) {
    return 'motiongraphic';
  }
  // Respect the AI's media_type decision
  if (shot.media_type === 'motiongraphic' || shot.fallback_type === 'motiongraphic') {
    return 'motiongraphic';
  }
  // Default to AI video for video content
  return 'ai_video';
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const avScriptProcessor: Processor<AVScriptJobData> = async (job: Job<AVScriptJobData>) => {
  const { taskId, userId, videoId, script, wordTimestamps, mode = 'full', outlineAssets, stockMediaLevel = 'none' } = job.data;

  // Route to Part 2 processor if mode is 'part2'
  if (mode === 'part2') {
    console.log(`[AVScript] Routing to Part 2 processor for video ${videoId}`);
    return avScriptPart2Processor(job as any);
  }

  const isPart1 = mode === 'part1';
  const logPrefix = isPart1 ? '[AVScript-Part1]' : '[AVScript]';
  
  console.log(`${logPrefix} Starting job ${job.id} for video ${videoId} (mode: ${mode})`);

  try {
    const supabase = getSupabaseServiceClient();
    
    // Update task status if taskId provided
    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 10, 
        current_step: 'Analyzing content structure' 
      });
    }

    // Step 1: Analyze content structure
    console.log(`${logPrefix} Step 1: Analyzing content structure...`);
    const { analyzeContentStructure } = await import('@/lib/av-script/analyzer');
    const analysis = analyzeContentStructure(script, wordTimestamps);
    console.log(`${logPrefix} Found ${analysis.lists.length} lists, ${analysis.comparisons.length} comparisons, ${analysis.transitions.length} transitions`);

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 30, 
        current_step: 'Segmenting timeline' 
      });
    }

    // Step 2: Segment timeline
    console.log(`${logPrefix} Step 2: Segmenting timeline...`);
    const { segmentTimeline } = await import('@/lib/av-script/segmenter');
    const segments = segmentTimeline(wordTimestamps, analysis);
    console.log(`${logPrefix} Created ${segments.length} segments`);

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 50, 
        current_step: 'Generating shot summaries' 
      });
    }

    // Step 3: For Part 1, generate summaries instead of visual prompts
    let finalShots: ShotPart1[];
    
    if (isPart1) {
      // Generate shot summaries using chunked processing for scalability
      // This handles videos of any length by processing in sequential chunks
      // with sliding context windows for narrative coherence
      console.log(`${logPrefix} Step 3: Generating shot summaries with chunked processor...`);
      
      const { processInChunks } = await import('@/lib/av-script/chunked-processor');
      
      // Create progress callback that updates the task status
      const onProgress = taskId ? async (progress: number, currentStep: string) => {
        await updateTaskStatus(taskId, {
          status: 'running',
          progress_percent: progress,
          current_step: currentStep
        });
      } : undefined;
      
      // Process segments in chunks with context windows
      const chunkedShots = await processInChunks(
        userId,
        segments,
        outlineAssets,
        undefined, // Use default config
        onProgress
      );
      
      // Convert to ShotPart1 format
      finalShots = chunkedShots.map(shot => ({
        ...shot,
        media_type: shot.media_type as 'video' | 'motiongraphic',
      })) as ShotPart1[];
      
      console.log(`${logPrefix} Generated ${finalShots.length} shot summaries via chunked processor`);


      // Step 3b: Process with Stock Media Director if enabled
      if (stockMediaLevel !== 'none') {
        if (taskId) {
          await updateTaskStatus(taskId, { 
            status: 'running', 
            progress_percent: 60, 
            current_step: 'Matching stock media' 
          });
        }

        console.log(`${logPrefix} Step 3b: Processing with Stock Media Director (level: ${stockMediaLevel})...`);
        const { processWithStockMedia } = await import('@/lib/av-script/stock-media-director');
        
        // Fetch video name to use as topic context for stock media relevance decisions
        let videoTopic = '';
        try {
          const { data: video } = await supabase.from('videos').select('name, idea').eq('id', videoId).single();
          videoTopic = video?.name || video?.idea || '';
          console.log(`${logPrefix} Using video topic for stock context: "${videoTopic.substring(0, 50)}..."`);
        } catch (e) {
          console.warn(`${logPrefix} Could not fetch video name for stock context`);
        }
        
        // Extract main entity names from outline assets as spine beats
        const spineBeats: string[] = [];
        if (outlineAssets?.characters) {
          spineBeats.push(...outlineAssets.characters.map(c => c.name));
        }
        if (outlineAssets?.locations) {
          spineBeats.push(...outlineAssets.locations.map(l => l.name));
        }
        
        const shotsWithMedia = await processWithStockMedia(userId, videoId, finalShots, stockMediaLevel, {
          videoTopic,
          spineBeats,
        });
        
        // Update finalShots with stock media matches and compute visual_source
        finalShots = shotsWithMedia.map(shot => ({
          ...shot,
          // Ensure proper typing
          stock_media_ref: shot.stock_media_ref,
          fallback_type: shot.fallback_type,
          // Compute visual_source for clear UI labeling
          visual_source: computeVisualSource(shot),
        })) as ShotPart1[];

        const matchedCount = finalShots.filter(s => s.stock_media_ref).length;
        console.log(`${logPrefix} Stock Media Director: ${matchedCount}/${finalShots.length} shots matched`);
      } else {
        // Stock media disabled - set visual_source based on media_type
        finalShots = finalShots.map(shot => ({
          ...shot,
          visual_source: shot.media_type === 'video' ? 'ai_video' : 'ai_image',
        })) as ShotPart1[];
        console.log(`${logPrefix} Stock media disabled, skipping director`);
      }
    } else {
      // Full mode: Generate visual prompts
      console.log(`${logPrefix} Step 3: Generating visual prompts...`);
      const { generateVisualPrompts } = await import('@/lib/av-script/prompt-gen');
      const shotsWithPrompts = await generateVisualPrompts(userId, segments);
      console.log(`${logPrefix} Generated ${shotsWithPrompts.filter(s => s.visual_prompt).length} visual prompts`);
      
      // Convert to ShotPart1 format for storage
      finalShots = shotsWithPrompts.map(s => ({
        segment_index: s.segment_index,
        start_seconds: s.start_seconds,
        end_seconds: s.end_seconds,
        duration_seconds: s.duration_seconds,
        content_type: s.content_type,
        media_type: s.media_type || 'image',
        text: s.text,
        summary: s.visual_prompt || '',
        visual_prompt: s.visual_prompt,
      })) as ShotPart1[];
    }

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 80, 
        current_step: 'Storing results' 
      });
    }

    // Step 4: Store in video metadata
    console.log(`${logPrefix} Step 4: Storing shot list in video metadata...`);
    
    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    
    const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;
    
    // Calculate metadata statistics
    const contentTypeBreakdown: Record<string, number> = {};
    finalShots.forEach(s => {
      contentTypeBreakdown[s.content_type] = (contentTypeBreakdown[s.content_type] || 0) + 1;
    });

    const totalDuration = finalShots.reduce((sum, s) => sum + s.duration_seconds, 0);
    
    const avScriptPart1Output: AVScriptPart1Output = {
      shots: finalShots,
      metadata: {
        total_segments: finalShots.length,
        total_duration_seconds: totalDuration,
        average_segment_duration: finalShots.length > 0 ? totalDuration / finalShots.length : 0,
        content_type_breakdown: contentTypeBreakdown,
      },
    };
    
    const metadataKey = isPart1 ? 'av_script_part1' : 'shot_list';
    const completedKey = isPart1 ? 'av_script_part1_completed' : 'av_script_completed';
    
    const updatedMetadata = {
      ...existingMetadata,
      [metadataKey]: isPart1 ? avScriptPart1Output : finalShots,
      content_analysis: {
        lists_count: analysis.lists.length,
        comparisons_count: analysis.comparisons.length,
        transitions_count: analysis.transitions.length,
        emotional_beats_count: analysis.emotional_beats.length,
      },
      [completedKey]: true,
    };
    
    const { error } = await supabase
      .from('video_projects')
      .update({ 
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (error) {
      console.error(`${logPrefix} Failed to store shot list:`, error);
      throw error;
    }
    
    // Update task as completed
    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'completed', 
        progress_percent: 100, 
        current_step: 'Shot breakdown complete' 
      });
      console.log(`${logPrefix} Saving to task output_data: shots count=${avScriptPart1Output.shots.length}`);
      await updateTaskOutput(taskId, avScriptPart1Output as any);
    }
    
    console.log(`${logPrefix} Stored ${finalShots.length} shots in video ${videoId} metadata`);
    console.log(`${logPrefix} Complete for video ${videoId}`);

    return {
      success: true,
      videoId,
      segmentCount: finalShots.length,
      output: avScriptPart1Output,
    };

  } catch (error) {
    console.error(`${logPrefix} Failed for video ${videoId}:`, error);
    
    // Update task as failed
    if (taskId) {
      await updateTaskStatus(
        taskId, 
        { 
          status: 'failed', 
          progress_percent: 0, 
          error_message: error instanceof Error ? error.message : 'Unknown error' 
        }
      );
    }
    
    throw error;
  }
};

/**
 * Generate a simple fallback summary based on content type.
 */
function generateFallbackSummary(segment: { content_type: string; text: string }): string {
  const firstWords = segment.text.split(' ').slice(0, 6).join(' ');
  
  switch (segment.content_type) {
    case 'list-item':
      return `Focused shot: ${firstWords}...`;
    case 'comparison':
      return `Contrasting visual for: ${firstWords}...`;
    case 'concept':
      return `Detailed scene illustrating: ${firstWords}...`;
    case 'transition':
      return `Transitional imagery with movement`;
    case 'emotional-beat':
      return `Atmospheric scene: ${firstWords}...`;
    default:
      return `Visual representing: ${firstWords}...`;
  }
}

// ============================================================================
// PART 2 PROCESSOR - Visual Prompts + Placeholder Media Generation
// ============================================================================

export interface AVScriptPart2JobData {
  taskId?: string;
  userId: string;
  videoId: string;
  shots: ShotPart1[];
  outlineAssets?: {
    characters?: Array<{ id: string; name: string; role: string }>;
    locations?: Array<{ id: string; name: string; essence: string }>;
    objects?: Array<{ id: string; name: string; type: string }>;
  };
  mode?: 'part2';
  /** Enable GPU generation (when true, calls GPU API after prompt generation) */
  gpuEnabled?: boolean;
  /** Aspect ratio for generated media */
  aspectRatio?: '16:9' | '9:16';
}

export interface GeneratedMediaItem {
  shot_index: number;
  media_type: 'image' | 'video' | 'motiongraphic' | 'ai_generated';
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  media_url?: string;
  thumbnail_url?: string;
  visual_prompt: string;
  /** Error message if generation failed */
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AVScriptPart2Output {
  generatedMedia: GeneratedMediaItem[];
  metadata: {
    total_shots: number;
    images_count: number;
    videos_count: number;
    motiongraphics_count: number;
  };
}

/**
 * Process AV Script Part 2 - Generate visual prompts and placeholder media
 */
export const avScriptPart2Processor: Processor<AVScriptPart2JobData> = async (job: Job<AVScriptPart2JobData>) => {
  const { taskId, userId, videoId, shots, outlineAssets, gpuEnabled = false, aspectRatio = '16:9' } = job.data;
  const logPrefix = '[AVScript-Part2]';
  
  console.log(`${logPrefix} Starting job ${job.id} for video ${videoId} with ${shots.length} shots (GPU: ${gpuEnabled})`);

  try {
    const supabase = getSupabaseServiceClient();
    
    // Update task status if taskId provided
    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 10, 
        current_step: 'Generating visual prompts' 
      });
    }

    // Step 1: Generate detailed visual prompts using specialized agents
    console.log(`${logPrefix} Step 1: Generating visual prompts via Multi-Agent system...`);
    
    // Import the multi-agent architecture
    const { buildAgentContext, routeToAgent } = await import('@/lib/av-script/agent-prompts');
    const { generateJSON } = await import('@/lib/ai/openrouter');
    
    // Build project metadata for context
    const projectMetadata = {
      videoTitle: 'Video Project', // Could be enhanced with actual video title from DB
      videoSummary: '', // Could be enhanced
      spineBeats: [],
      visualStyle: 'cinematic, documentary',
      aspectRatio: '16:9' as const,
    };
    
    // Process each shot through its specialized agent
    let detailedPrompts: Array<{ index: number; prompt: string; agentUsed: string }> = [];
    
    // Process in parallel batches of 3 to avoid rate limits
    const BATCH_SIZE = 3;
    for (let batchStart = 0; batchStart < shots.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, shots.length);
      const batchShots = shots.slice(batchStart, batchEnd);
      
      const batchPromises = batchShots.map(async (shot, batchIdx) => {
        const globalIdx = batchStart + batchIdx;
        const context = buildAgentContext(
          shot,
          shots,
          projectMetadata,
          outlineAssets || {}
        );
        
        try {
          // Route to appropriate agent based on media type
          const mediaType = shot.media_type || 'image';
          console.log(`${logPrefix} Shot ${globalIdx}: Routing to ${mediaType} agent`);
          
          let prompt: string;
          let agentUsed: string;
          
          if (mediaType === 'motiongraphic') {
            // Motion graphics use the 2-step pipeline
            const result = await routeToAgent(userId, 'motiongraphic', context);
            // For motiongraphics, combine description and elements into a prompt
            const mgResult = result as { description: string; elements: any[]; style_notes: string };
            prompt = `${mgResult.description}\n\nElements: ${mgResult.elements?.map((e: any) => e.description || e.content).join(', ')}\n\nStyle: ${mgResult.style_notes}`;
            agentUsed = 'MotionGraphicPromptAgent + RemotionCodeAgent';
          } else if (mediaType === 'video') {
            // For video, we need a keyframe first, but for now generate as image
            const result = await routeToAgent(userId, 'image', context);
            const imgResult = result as { prompt: string };
            prompt = imgResult.prompt;
            agentUsed = 'ImageGenerationAgent';
          } else {
            // Image generation
            const result = await routeToAgent(userId, 'image', context);
            const imgResult = result as { prompt: string };
            prompt = imgResult.prompt;
            agentUsed = 'ImageGenerationAgent';
          }
          
          return { index: globalIdx, prompt, agentUsed };
        } catch (agentError) {
          console.error(`${logPrefix} Shot ${globalIdx} agent failed, using summary:`, agentError);
          return { index: globalIdx, prompt: shot.summary, agentUsed: 'fallback' };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      detailedPrompts.push(...batchResults);
      
      // Progress update for UI
      const progress = Math.round(10 + (batchEnd / shots.length) * 30);
      if (taskId) {
        await updateTaskStatus(taskId, { 
          status: 'running', 
          progress_percent: progress, 
          current_step: `Generating prompts (${batchEnd}/${shots.length})` 
        });
      }
    }
    
    console.log(`${logPrefix} Generated ${detailedPrompts.length} prompts via agents:`, 
      detailedPrompts.reduce((acc, p) => {
        acc[p.agentUsed] = (acc[p.agentUsed] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    );

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 40, 
        current_step: gpuEnabled ? 'Generating media via GPU...' : 'Creating placeholder media' 
      });
    }

    // Step 2: Create GeneratedMedia entries
    // If GPU enabled, use batch generation with VRAM mode switching
    // Otherwise, use placeholder URLs
    let generatedMedia: GeneratedMediaItem[];

    if (gpuEnabled) {
      console.log(`${logPrefix} Step 2: Generating media via GPU batch processing...`);
      
      // Import GPU batch generation module
      const { processGpuBatchGeneration } = await import('@/lib/av-script/gpu-batch-generation');
      
      // Prepare shots for GPU generation
      const shotsForGpu: ShotForGpuGeneration[] = shots.map((shot, i) => ({
        segment_index: shot.segment_index,
        media_type: shot.media_type, // 'video' | 'motiongraphic' from ShotPart1
        visual_prompt: detailedPrompts.find(p => p.index === i)?.prompt || shot.summary,
        duration_seconds: shot.duration_seconds || 5,
        // For video shots, they'll need a keyframe image first
        // For now, video shots without input_image_url will fallback to placeholder
        input_image_url: undefined, // Will be set after image generation if needed
      }));
      
      // Progress callback for UI updates
      const onProgress = async (message: string, percent: number) => {
        if (taskId) {
          await updateTaskStatus(taskId, { 
            status: 'running', 
            progress_percent: 40 + Math.round(percent * 0.4), // Scale 0-100 to 40-80
            current_step: message 
          });
        }
      };
      
      // Run batch GPU generation
      const gpuResult = await processGpuBatchGeneration(
        userId,
        videoId,
        shotsForGpu,
        aspectRatio as '16:9' | '9:16',
        onProgress
      );
      
      // Convert GPU results to GeneratedMediaItem format
      generatedMedia = shots.map((shot, i) => {
        const gpuItem = gpuResult.results.find(r => r.shot_index === shot.segment_index);
        const detailedPrompt = detailedPrompts.find(p => p.index === i)?.prompt || shot.summary;
        
        if (gpuItem) {
          return {
            shot_index: shot.segment_index,
            media_type: shot.media_type || 'image',
            generation_status: gpuItem.generation_status,
            media_url: gpuItem.media_url,
            visual_prompt: detailedPrompt,
            error_message: gpuItem.error_message,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }
        
        // Fallback for any missing results
        return {
          shot_index: shot.segment_index,
          media_type: shot.media_type || 'image',
          generation_status: 'failed' as const,
          media_url: getPlaceholderUrl(shot.media_type || 'image', i, Date.now()),
          visual_prompt: detailedPrompt,
          error_message: 'No GPU result received',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
      
      console.log(`${logPrefix} GPU generation complete: ${gpuResult.stats.imagesGenerated} images, ${gpuResult.stats.videosGenerated} videos`);
      
    } else {
      // GPU disabled - use placeholder URLs
      console.log(`${logPrefix} Step 2: Creating placeholder media entries (GPU disabled)...`);
      
      generatedMedia = shots.map((shot, i) => {
        const detailedPrompt = detailedPrompts.find(p => p.index === i)?.prompt || shot.summary;
        const timestamp = Date.now();
        
        // Generate placeholder URL based on media type
        const placeholderUrl = getPlaceholderUrl(shot.media_type || 'image', i, timestamp);
        
        return {
          shot_index: shot.segment_index,
          media_type: shot.media_type || 'image',
          generation_status: 'completed' as const,
          media_url: placeholderUrl,
          visual_prompt: detailedPrompt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });
    }

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 80, 
        current_step: 'Storing results' 
      });
    }

    // Step 3: Store in video metadata
    console.log(`${logPrefix} Step 3: Storing generated media in video metadata...`);
    
    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    
    const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;
    
    // Calculate stats
    const imagesCount = generatedMedia.filter(m => m.media_type === 'image').length;
    const videosCount = generatedMedia.filter(m => m.media_type === 'video').length;
    const motiongraphicsCount = generatedMedia.filter(m => m.media_type === 'motiongraphic').length;

    const part2Output: AVScriptPart2Output = {
      generatedMedia,
      metadata: {
        total_shots: generatedMedia.length,
        images_count: imagesCount,
        videos_count: videosCount,
        motiongraphics_count: motiongraphicsCount,
      },
    };
    
    const updatedMetadata = {
      ...existingMetadata,
      generatedMedia,
      av_script_part2_completed: true,
    };
    
    const { error } = await supabase
      .from('video_projects')
      .update({ 
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (error) {
      console.error(`${logPrefix} Failed to store generated media:`, error);
      throw error;
    }
    
    // Update task as completed
    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'completed', 
        progress_percent: 100, 
        current_step: 'Media generation complete' 
      });
      await updateTaskOutput(taskId, part2Output as any);
    }
    
    console.log(`${logPrefix} Stored ${generatedMedia.length} media items for video ${videoId}`);
    console.log(`${logPrefix} Complete: ${imagesCount} images, ${videosCount} videos, ${motiongraphicsCount} motion graphics`);

    return {
      success: true,
      videoId,
      mediaCount: generatedMedia.length,
      output: part2Output,
    };

  } catch (error) {
    console.error(`${logPrefix} Failed for video ${videoId}:`, error);
    
    // Update task as failed
    if (taskId) {
      await updateTaskStatus(
        taskId, 
        { 
          status: 'failed', 
          progress_percent: 0, 
          error_message: error instanceof Error ? error.message : 'Unknown error' 
        }
      );
    }
    
    throw error;
  }
};

/**
 * Build entity context string for AI prompts
 */
function buildEntityContext(outlineAssets?: AVScriptPart2JobData['outlineAssets']): string {
  const characters = outlineAssets?.characters || [];
  const locations = outlineAssets?.locations || [];
  const objects = outlineAssets?.objects || [];

  if (characters.length === 0 && locations.length === 0 && objects.length === 0) {
    return '';
  }

  let context = '\nRelevant entities for visual consistency:';
  
  if (characters.length > 0) {
    context += `\n- Characters: ${characters.map(c => `${c.name} (${c.role})`).join(', ')}`;
  }
  if (locations.length > 0) {
    context += `\n- Locations: ${locations.map(l => `${l.name} (${l.essence})`).join(', ')}`;
  }
  if (objects.length > 0) {
    context += `\n- Objects: ${objects.map(o => `${o.name} (${o.type})`).join(', ')}`;
  }

  return context;
}

/**
 * Generate placeholder URL based on media type
 * In production, this would be replaced with actual generation
 */
function getPlaceholderUrl(mediaType: string, index: number, timestamp: number): string {
  // Use Unsplash for placeholder images with different seeds
  const colors = [
    '4f46e5', // indigo
    '0ea5e9', // sky
    '10b981', // emerald
    'f59e0b', // amber
    'ef4444', // red
    '8b5cf6', // violet
  ];
  
  const color = colors[index % colors.length];
  
  // Return a placeholder gradient image
  // In production, this would be real generated content
  return `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop&sat=-100&hue=${color}&t=${timestamp}_${index}`;
}

