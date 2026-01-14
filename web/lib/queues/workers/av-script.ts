/**
 * AV Script Workflow Worker
 * ============================================================================
 * BullMQ worker for generating AV script shot lists.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient } from '@/lib/queues/shared';

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
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const avScriptProcessor: Processor<AVScriptJobData> = async (job: Job<AVScriptJobData>) => {
  const { userId, videoId, script, wordTimestamps } = job.data;

  console.log(`[AVScript] Starting job ${job.id} for video ${videoId} with ${wordTimestamps.length} words`);

  try {
    // Step 1: Analyze content structure
    console.log('[AVScript] Step 1: Analyzing content structure...');
    const { analyzeContentStructure } = await import('@/lib/av-script/analyzer');
    const analysis = analyzeContentStructure(script, wordTimestamps);
    console.log(`[AVScript] Found ${analysis.lists.length} lists, ${analysis.comparisons.length} comparisons, ${analysis.transitions.length} transitions`);

    // Step 2: Segment timeline
    console.log('[AVScript] Step 2: Segmenting timeline...');
    const { segmentTimeline } = await import('@/lib/av-script/segmenter');
    const segments = segmentTimeline(wordTimestamps, analysis);
    console.log(`[AVScript] Created ${segments.length} segments`);

    // Step 3: Generate visual prompts
    console.log('[AVScript] Step 3: Generating visual prompts...');
    const { generateVisualPrompts } = await import('@/lib/av-script/prompt-gen');
    const shotsWithPrompts = await generateVisualPrompts(userId, segments);
    console.log(`[AVScript] Generated ${shotsWithPrompts.filter(s => s.visual_prompt).length} visual prompts`);

    // Step 4: Store in video metadata
    console.log('[AVScript] Step 4: Storing shot list in video metadata...');
    const supabase = getSupabaseServiceClient();
    
    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    
    const existingMetadata = (video?.metadata || {}) as Record<string, unknown>;
    
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
      .from('video_projects')
      .update({ 
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (error) {
      console.error('[AVScript] Failed to store shot list:', error);
      throw error;
    }
    
    console.log(`[AVScript] Stored ${shotsWithPrompts.length} shots in video ${videoId} metadata`);
    console.log(`[AVScript] Complete for video ${videoId}`);

    return {
      success: true,
      videoId,
      segmentCount: shotsWithPrompts.length,
    };

  } catch (error) {
    console.error(`[AVScript] Failed for video ${videoId}:`, error);
    throw error;
  }
};
