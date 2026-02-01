/**
 * Regenerate Shot API
 * ============================================================================
 * Regenerates a single shot's visual prompt using the specialized agent system.
 * Called from MediaEditModal when user wants to regenerate media for a shot.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildAgentContext, routeToAgent, type AgentContext } from '@/lib/av-script/agent-prompts';

interface RegenerateRequest {
  videoId: string;
  shotIndex: number;
  mediaType?: 'image' | 'video' | 'motiongraphic' | 'edit';
  customPrompt?: string;
  inputImageUrl?: string;  // Required for edit/video types
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: RegenerateRequest = await request.json();
    const { videoId, shotIndex, mediaType = 'image', customPrompt, inputImageUrl } = body;

    if (!videoId || shotIndex === undefined) {
      return NextResponse.json(
        { error: 'videoId and shotIndex are required' }, 
        { status: 400 }
      );
    }

    // Fetch video project with AV script data
    const { data: video, error: videoError } = await supabase
      .from('video_projects')
      .select('metadata, title, summary')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json(
        { error: 'Video not found' }, 
        { status: 404 }
      );
    }

    const metadata = video.metadata as Record<string, unknown>;
    const avScriptOutput = metadata?.av_script_output as { shots: any[] } | undefined;
    
    if (!avScriptOutput?.shots) {
      return NextResponse.json(
        { error: 'No AV script data found for this video' }, 
        { status: 400 }
      );
    }

    const shots = avScriptOutput.shots;
    const currentShot = shots.find((s: any) => s.segment_index === shotIndex);
    
    if (!currentShot) {
      return NextResponse.json(
        { error: `Shot ${shotIndex} not found` }, 
        { status: 404 }
      );
    }

    // Build project metadata
    const projectMetadata = {
      videoTitle: video.title || 'Video Project',
      videoSummary: video.summary || '',
      spineBeats: (metadata?.spine as any)?.beats || [],
      visualStyle: 'cinematic, documentary',
      aspectRatio: '16:9' as const,
    };

    // Get outline assets if available
    const outlineAssets = metadata?.outline_assets as {
      characters?: Array<{ id: string; name: string; role: string }>;
      locations?: Array<{ id: string; name: string; essence: string }>;
      objects?: Array<{ id: string; name: string; type: string }>;
    } || {};

    // Build context for the agent
    const context = buildAgentContext(
      currentShot,
      shots,
      projectMetadata,
      outlineAssets,
      undefined,
      customPrompt
    );

    console.log(`[RegenerateShot] Regenerating shot ${shotIndex} with ${mediaType} agent`);

    // Route to appropriate agent
    let result;
    try {
      if (mediaType === 'edit') {
        if (!inputImageUrl) {
          return NextResponse.json(
            { error: 'inputImageUrl required for edit type' }, 
            { status: 400 }
          );
        }
        result = await routeToAgent(user.id, 'edit', context, inputImageUrl);
      } else if (mediaType === 'video') {
        if (!inputImageUrl) {
          return NextResponse.json(
            { error: 'inputImageUrl required for video type (keyframe)' }, 
            { status: 400 }
          );
        }
        result = await routeToAgent(user.id, 'video', context, inputImageUrl);
      } else if (mediaType === 'motiongraphic') {
        result = await routeToAgent(user.id, 'motiongraphic', context);
      } else {
        result = await routeToAgent(user.id, 'image', context);
      }
    } catch (agentError) {
      console.error(`[RegenerateShot] Agent error:`, agentError);
      return NextResponse.json(
        { error: 'Failed to generate prompt', details: String(agentError) }, 
        { status: 500 }
      );
    }

    // Extract the prompt from the result (varies by agent type)
    let generatedPrompt: string;
    if ('prompt' in result) {
      generatedPrompt = (result as { prompt: string }).prompt;
    } else if ('edit_prompt' in result) {
      generatedPrompt = (result as { edit_prompt: string }).edit_prompt;
    } else if ('motion_prompt' in result) {
      generatedPrompt = (result as { motion_prompt: string }).motion_prompt;
    } else if ('description' in result) {
      // Motion graphic prompt agent
      const mgResult = result as { description: string; elements: any[]; style_notes: string };
      generatedPrompt = `${mgResult.description}\n\nElements: ${mgResult.elements?.map((e: any) => e.description || e.content).join(', ')}\n\nStyle: ${mgResult.style_notes}`;
    } else {
      generatedPrompt = JSON.stringify(result);
    }

    console.log(`[RegenerateShot] Generated prompt (${generatedPrompt.length} chars)`);

    return NextResponse.json({
      success: true,
      shotIndex,
      mediaType,
      generatedPrompt,
      agentResult: result,
    });

  } catch (error) {
    console.error('[RegenerateShot] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) }, 
      { status: 500 }
    );
  }
}
