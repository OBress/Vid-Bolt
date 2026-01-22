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
  mode?: 'part1' | 'part2' | 'full';
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
  media_type: 'image' | 'video' | 'motiongraphic';
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
 * Build a prompt section instructing the AI to use @(EntityName) syntax.
 */
function buildEntityPromptSection(outlineAssets?: AVScriptJobData['outlineAssets']): string {
  const characters = outlineAssets?.characters?.map(c => c.name) || [];
  const locations = outlineAssets?.locations?.map(l => l.name) || [];
  const objects = outlineAssets?.objects?.map(o => o.name) || [];

  if (characters.length === 0 && locations.length === 0 && objects.length === 0) {
    return '';
  }

  let section = `
IMPORTANT: When your summary references any of the following entities, wrap their name in @() syntax.
This helps the UI render rich entity badges.`;

  if (characters.length > 0) {
    section += `
- Characters: ${characters.join(', ')}`;
  }
  if (locations.length > 0) {
    section += `
- Locations: ${locations.join(', ')}`;
  }
  if (objects.length > 0) {
    section += `
- Objects: ${objects.join(', ')}`;
  }

  section += `

Example: "@(Isabella Moretti) gazes at the @(Vintage Watch) on the @(Villa Table)"`;

  return section;
}

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
    media_type?: 'image' | 'video' | 'motiongraphic';
  }>,
  outlineAssets?: AVScriptJobData['outlineAssets']
): Promise<ShotPart1[]> {
  const { generateJSON } = await import('@/lib/ai/openrouter');
  
  // Build entity lookup for detecting references
  const characterNames = outlineAssets?.characters?.map(c => ({ id: c.id, name: c.name.toLowerCase() })) || [];
  const locationNames = outlineAssets?.locations?.map(l => ({ id: l.id, name: l.name.toLowerCase() })) || [];
  const objectNames = outlineAssets?.objects?.map(o => ({ id: o.id, name: o.name.toLowerCase() })) || [];

  // Build entity lists for the prompt
  const entityPromptSection = buildEntityPromptSection(outlineAssets);

  try {
    // Generate summaries using AI
    const response = await generateJSON<{ 
      summaries: Array<{ 
        index: number; 
        summary: string; 
        media_type: 'image' | 'video' | 'motiongraphic';
      }> 
    }>(
      userId,
      `You are a visual director creating brief shot descriptions for a video.
For each segment, provide:
1. A 1-sentence summary of what should be shown visually
2. Whether it should be a static image, video clip, or motion graphic

Guidelines:
- Keep summaries concise (under 25 words)
- Focus on the key visual element
- Use "video" for action sequences, transitions, emotional moments
- Use "image" for static concepts, portraits, objects
- Use "motiongraphic" for:
  - Abstract concepts or metaphors
  - Data visualization (charts, graphs)
  - Text-heavy segments or lists
  - Kinetic typography
  - "Transition" content types where a graphical element bridges scenes
- Match the visual style to the content type
${entityPromptSection}`,
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
    { "index": 0, "summary": "Brief visual description with @(EntityName) references...", "media_type": "image" }
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
}

export interface GeneratedMediaItem {
  shot_index: number;
  media_type: 'image' | 'video' | 'motiongraphic';
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  media_url?: string;
  thumbnail_url?: string;
  visual_prompt: string;
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
  const { taskId, userId, videoId, shots, outlineAssets } = job.data;
  const logPrefix = '[AVScript-Part2]';
  
  console.log(`${logPrefix} Starting job ${job.id} for video ${videoId} with ${shots.length} shots`);

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

    // Step 1: Generate detailed visual prompts using AI
    console.log(`${logPrefix} Step 1: Generating detailed visual prompts...`);
    const { generateJSON } = await import('@/lib/ai/openrouter');
    
    // Build entity context for prompts
    const entityContext = buildEntityContext(outlineAssets);
    
    let detailedPrompts: Array<{ index: number; prompt: string }> = [];
    
    try {
      const response = await generateJSON<{ prompts: Array<{ index: number; prompt: string }> }>(
        userId,
        `You are a visual director creating detailed image/video generation prompts.
For each shot, create a rich, descriptive prompt suitable for AI image/video generation.

Guidelines:
- Be specific about composition, lighting, colors, mood
- Describe camera angle and framing
- Include relevant stylistic details
- Keep prompts under 150 words
- Match the tone to the content type
${entityContext}`,
        `Generate detailed visual prompts for these ${shots.length} shots:

${JSON.stringify(shots.map((s, i) => ({
  index: i,
  type: s.content_type,
  media: s.media_type,
  summary: s.summary,
  text: s.text.substring(0, 200),
})), null, 2)}

Return JSON:
{
  "prompts": [
    { "index": 0, "prompt": "Detailed visual prompt..." }
  ]
}`
      );
      
      detailedPrompts = response.prompts || [];
      console.log(`${logPrefix} Generated ${detailedPrompts.length} detailed prompts`);
    } catch (aiError) {
      console.error(`${logPrefix} AI prompt generation failed, using summaries:`, aiError);
      // Fall back to using existing summaries
      detailedPrompts = shots.map((s, i) => ({ index: i, prompt: s.summary }));
    }

    if (taskId) {
      await updateTaskStatus(taskId, { 
        status: 'running', 
        progress_percent: 40, 
        current_step: 'Creating placeholder media' 
      });
    }

    // Step 2: Create GeneratedMedia entries with placeholder URLs
    console.log(`${logPrefix} Step 2: Creating placeholder media entries...`);
    
    const generatedMedia: GeneratedMediaItem[] = shots.map((shot, i) => {
      const detailedPrompt = detailedPrompts.find(p => p.index === i)?.prompt || shot.summary;
      const timestamp = Date.now();
      
      // Generate placeholder URL based on media type
      // These are mock URLs - in production, real generation would happen here
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

