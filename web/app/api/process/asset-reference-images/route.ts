/**
 * Asset Reference Images API Endpoint
 * ============================================================================
 * Triggers AI reference image generation for all assets in a video's
 * asset registry (characters, locations, objects).
 *
 * POST /api/process/asset-reference-images
 * Body: { videoId: string, outlineAssets: AssetRegistry }
 * Response: { success: boolean, taskId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assetReferenceImagesQueue } from '@/lib/queues/queues';
import type { AssetReferenceImageJobData } from '@/lib/queues/workers/asset-reference-images';
import type { AspectRatio } from '@/lib/services/gpu-api-service';

export async function POST(request: NextRequest) {
  const logPrefix = '[API/AssetReferenceImages]';

  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { videoId, outlineAssets } = body;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing required field: videoId' },
        { status: 400 }
      );
    }

    if (!outlineAssets) {
      return NextResponse.json(
        { error: 'Missing required field: outlineAssets' },
        { status: 400 }
      );
    }

    // Count assets
    const assetCount =
      (outlineAssets.characters?.length || 0) +
      (outlineAssets.locations?.length || 0) +
      (outlineAssets.objects?.length || 0);

    if (assetCount === 0) {
      return NextResponse.json(
        { error: 'No assets found in outlineAssets' },
        { status: 400 }
      );
    }

    console.log(`${logPrefix} Processing request for video ${videoId} with ${assetCount} assets`);

    // Fetch video to verify ownership and get project settings
    const { data: video, error: videoError } = await supabase
      .from('video_projects')
      .select('id, project_id, user_id')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      console.error(`${logPrefix} Video not found:`, videoError);
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Verify user owns this video
    if (video.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch project settings for aspect ratio and LORA
    let aspectRatio: AspectRatio = '16:9';
    let loraName: string | undefined;

    if (video.project_id) {
      const { data: project } = await supabase
        .from('media_projects')
        .select('settings')
        .eq('id', video.project_id)
        .single();

      if (project?.settings) {
        const settings = project.settings as Record<string, any>;
        aspectRatio = settings?.basic_info?.aspectRatio || '16:9';
        loraName = settings?.visuals?.loraName;
      }
    }

    console.log(`${logPrefix} Using aspect ratio: ${aspectRatio}, LORA: ${loraName || 'none'}`);

    // Create task record
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        type: 'video',
        name: `Asset Reference Images (${assetCount} assets)`,
        status: 'pending',
        progress_percent: 0,
        current_step: 'Queued',
        input_data: {
          videoId,
          assetCount,
          aspectRatio,
          loraName,
        },
      })
      .select('id')
      .single();

    if (taskError || !task) {
      console.error(`${logPrefix} Failed to create task:`, taskError);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    console.log(`${logPrefix} Created task ${task.id}`);

    // Queue the job
    const jobData: AssetReferenceImageJobData = {
      taskId: task.id,
      userId: user.id,
      videoId,
      assetRegistry: outlineAssets,
      aspectRatio,
      loraName,
    };

    await assetReferenceImagesQueue.add('generate', jobData, {
      jobId: `asset-ref-${videoId}-${Date.now()}`,
    });

    console.log(`${logPrefix} Queued job for task ${task.id}`);

    return NextResponse.json({
      success: true,
      taskId: task.id,
      assetCount,
    });
  } catch (error) {
    console.error(`${logPrefix} Unexpected error:`, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
