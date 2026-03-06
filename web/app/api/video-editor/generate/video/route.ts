/**
 * Video Generation API Route
 * ============================================================================
 * POST /api/video-editor/generate/video
 *
 * Proxies video generation to either the local GPU API or Replicate
 * based on the selected model's provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getModelById } from '@/lib/constants/model-registry';
import { callGpuVideoGenerate, getVideoDimensions } from '@/lib/services/gpu-api-service';
import { generateVideoViaReplicate, getReplicateApiKey } from '@/lib/services/replicate-client';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await request.json();
    const {
      prompt,
      model: modelId,
      startFrameUrl,
      endFrameUrl,
      durationSeconds,
      aspectRatio,
      fps,
      seed,
    } = body as {
      prompt: string;
      model: string;
      startFrameUrl?: string;
      endFrameUrl?: string;
      durationSeconds?: number;
      aspectRatio?: string;
      fps?: number;
      seed?: number;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 3. Look up model
    const modelDef = getModelById(modelId);
    if (!modelDef) {
      return NextResponse.json({ error: `Unknown model: ${modelId}` }, { status: 400 });
    }

    // 4. Route to provider
    if (modelDef.provider === 'local') {
      // GPU API — requires an input image (start frame)
      if (!startFrameUrl?.trim()) {
        return NextResponse.json(
          { error: 'Start frame URL is required for local GPU video generation' },
          { status: 400 }
        );
      }

      const ar = aspectRatio === '9-16' ? '9:16' : '16:9';
      const dims = getVideoDimensions(ar as any);
      const jobId = `editor-vid-${uuidv4().slice(0, 8)}`;
      const saveUrl = `${process.env.R2_PUBLIC_URL || ''}/editor-gen/${user.id}/${jobId}.mp4`;

      const result = await callGpuVideoGenerate({
        job_id: jobId,
        input_image_url: startFrameUrl,
        prompt,
        duration_seconds: durationSeconds ?? 5,
        fps: (fps ?? 24) as any,
        aspect_ratio: ar as any,
        width: dims.width,
        height: dims.height,
        seed: seed ?? undefined,
        end_image_url: endFrameUrl || undefined,
        save_url: saveUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.errorMessage || 'GPU video generation failed' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        url: result.publicUrl || saveUrl,
        jobId: result.jobId,
        isAsync: result.isAsync,
        generationTime: result.generationTime,
      });
    } else {
      // Replicate
      if (!modelDef.replicateModelId) {
        return NextResponse.json({ error: 'Model has no Replicate ID' }, { status: 400 });
      }

      const apiKey = await getReplicateApiKey(user.id);
      const ar = aspectRatio?.replace('-', ':') || '16:9';

      const url = await generateVideoViaReplicate(
        modelDef.replicateModelId,
        prompt,
        apiKey,
        {
          aspectRatio: ar,
          duration: durationSeconds,
          imageUrl: startFrameUrl || undefined,
        }
      );

      return NextResponse.json({ url });
    }
  } catch (error) {
    console.error('[generate/video] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
