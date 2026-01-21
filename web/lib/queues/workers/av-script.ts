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
  mode?: 'part1' | 'full';
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
  media_type: 'image' | 'video';
  text: string;
  summary: string;  // Brief summary of what happens visually
  // Entity references detected in the text
  character_refs?: string[];  // Character IDs referenced
  location_refs?: string[];   // Location IDs referenced  
  object_refs?: string[];     // Object IDs referenced
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
// PROCESSOR
// ============================================================================

export const avScriptProcessor: Processor<AVScriptJobData> = async (job: Job<AVScriptJobData>) => {
  const { taskId, userId, videoId, script, wordTimestamps, mode = 'full', outlineAssets } = job.data;

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
      // Generate shot summaries and detect entity references
      console.log(`${logPrefix} Step 3: Generating shot summaries...`);
      finalShots = await generateShotSummaries(userId, segments, outlineAssets);
      console.log(`${logPrefix} Generated ${finalShots.length} shot summaries`);
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

// ============================================================================
// SHOT SUMMARY GENERATION (Part 1 only)
// ============================================================================

/**
 * Generate brief visual summaries for each shot segment.
 * Also detects references to characters, locations, and objects from the outline.
 */
async function generateShotSummaries(
  userId: string,
  segments: Array<{
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    content_type: string;
    text: string;
    media_type?: 'image' | 'video';
  }>,
  outlineAssets?: AVScriptJobData['outlineAssets']
): Promise<ShotPart1[]> {
  const { generateJSON } = await import('@/lib/ai/openrouter');
  
  // Build entity lookup for detecting references
  const characterNames = outlineAssets?.characters?.map(c => ({ id: c.id, name: c.name.toLowerCase() })) || [];
  const locationNames = outlineAssets?.locations?.map(l => ({ id: l.id, name: l.name.toLowerCase() })) || [];
  const objectNames = outlineAssets?.objects?.map(o => ({ id: o.id, name: o.name.toLowerCase() })) || [];

  try {
    // Generate summaries using AI
    const response = await generateJSON<{ 
      summaries: Array<{ 
        index: number; 
        summary: string; 
        media_type: 'image' | 'video';
      }> 
    }>(
      userId,
      `You are a visual director creating brief shot descriptions for a video.
For each segment, provide:
1. A 1-sentence summary of what should be shown visually
2. Whether it should be a static image or video clip

Guidelines:
- Keep summaries concise (under 20 words)
- Focus on the key visual element
- Use "video" for action sequences, transitions, emotional moments
- Use "image" for static concepts, portraits, objects
- Match the visual style to the content type`,
      `Generate visual summaries for these ${segments.length} video segments:

${JSON.stringify(segments.map((s, i) => ({
  index: i,
  type: s.content_type,
  text: s.text.substring(0, 200),
  duration: s.duration_seconds,
})), null, 2)}

Return JSON:
{
  "summaries": [
    { "index": 0, "summary": "Brief visual description...", "media_type": "image" }
  ]
}`
    );

    // Merge AI summaries with segment data
    const shots: ShotPart1[] = segments.map((segment, i) => {
      const aiSummary = response.summaries?.find(s => s.index === i);
      const textLower = segment.text.toLowerCase();
      
      // Detect entity references
      const characterRefs = characterNames.filter(c => textLower.includes(c.name)).map(c => c.id);
      const locationRefs = locationNames.filter(l => textLower.includes(l.name)).map(l => l.id);
      const objectRefs = objectNames.filter(o => textLower.includes(o.name)).map(o => o.id);
      
      return {
        segment_index: segment.segment_index,
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        duration_seconds: segment.duration_seconds,
        content_type: segment.content_type,
        media_type: aiSummary?.media_type || segment.media_type || 'image',
        text: segment.text,
        summary: aiSummary?.summary || generateFallbackSummary(segment),
        character_refs: characterRefs.length > 0 ? characterRefs : undefined,
        location_refs: locationRefs.length > 0 ? locationRefs : undefined,
        object_refs: objectRefs.length > 0 ? objectRefs : undefined,
      };
    });

    return shots;
  } catch (error) {
    console.error('[AVScript-Part1] AI summary generation failed, using fallbacks:', error);
    
    // Fallback: Generate basic summaries without AI
    return segments.map(segment => {
      const textLower = segment.text.toLowerCase();
      const characterRefs = characterNames.filter(c => textLower.includes(c.name)).map(c => c.id);
      const locationRefs = locationNames.filter(l => textLower.includes(l.name)).map(l => l.id);
      const objectRefs = objectNames.filter(o => textLower.includes(o.name)).map(o => o.id);
      
      return {
        segment_index: segment.segment_index,
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        duration_seconds: segment.duration_seconds,
        content_type: segment.content_type,
        media_type: segment.media_type || 'image',
        text: segment.text,
        summary: generateFallbackSummary(segment),
        character_refs: characterRefs.length > 0 ? characterRefs : undefined,
        location_refs: locationRefs.length > 0 ? locationRefs : undefined,
        object_refs: objectRefs.length > 0 ? objectRefs : undefined,
      };
    });
  }
}

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
