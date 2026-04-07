/**
 * Image Generation API Route
 * ============================================================================
 * POST /api/video-editor/generate/image
 *
 * Proxies image generation to either the local GPU API or Replicate
 * based on the selected model's provider (looked up from model-registry).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getModelById } from '@/lib/constants/model-registry';
import { callGpuImageGenerate, getImageDimensions } from '@/lib/services/gpu-api-service';
import { generateImageViaReplicate, getReplicateApiKey } from '@/lib/services/replicate-client';
import { generatePresignedPutUrl, generateVideoEditorMediaKey } from '@/lib/services/r2-storage';
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
      aspectRatio,
      loraName,
      loraStrength: _loraStrength,
      seed,
      steps,
    } = body as {
      prompt: string;
      model: string;
      aspectRatio?: string;
      loraName?: string;
      loraStrength?: number;
      seed?: number;
      steps?: number;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 3. Look up model in registry
    const modelDef = getModelById(modelId);
    if (!modelDef) {
      return NextResponse.json({ error: `Unknown model: ${modelId}` }, { status: 400 });
    }

    // 4. Route to provider
    if (modelDef.provider === 'local') {
      // GPU API
      const ar = aspectRatio === '9-16' ? '9:16' : '16:9';
      const dims = getImageDimensions(ar as any);
      const jobId = `editor-img-${uuidv4().slice(0, 8)}`;
      const outputKey = generateVideoEditorMediaKey(user.id, null, `${jobId}.png`);
      const { putUrl, publicUrl } = await generatePresignedPutUrl(outputKey, 'image/png');

      const result = await callGpuImageGenerate({
        job_id: jobId,
        prompt,
        aspect_ratio: ar as any,
        width: dims.width,
        height: dims.height,
        seed: seed ?? undefined,
        num_inference_steps: steps ?? 4,
        lora_name: loraName ?? undefined,
        save_url: putUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.errorMessage || 'GPU image generation failed' },
          { status: 502 }
        );
      }

      // For async jobs, return the save URL (will be populated when GPU finishes)
      return NextResponse.json({
        url: result.publicUrl || publicUrl,
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

      const url = await generateImageViaReplicate(
        modelDef.replicateModelId,
        prompt,
        apiKey,
        { aspectRatio: ar }
      );

      return NextResponse.json({ url });
    }
  } catch (error) {
    console.error('[generate/image] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
