/**
 * Image Edit API Route
 * ============================================================================
 * POST /api/video-editor/generate/image-edit
 *
 * Proxies image editing to either the local GPU API or Replicate
 * based on the selected model's provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getModelById } from '@/lib/constants/model-registry';
import { callGpuImageEdit } from '@/lib/services/gpu-api-service';
import { editImageViaReplicate, getReplicateApiKey } from '@/lib/services/replicate-client';
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
      inputImageUrl,
      maskImageUrl,
      loraName,
      loraStrength,
      seed,
    } = body as {
      prompt: string;
      model: string;
      inputImageUrl: string;
      maskImageUrl?: string;
      loraName?: string;
      loraStrength?: number;
      seed?: number;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    if (!inputImageUrl?.trim()) {
      return NextResponse.json({ error: 'Input image URL is required' }, { status: 400 });
    }

    // 3. Look up model
    const modelDef = getModelById(modelId);
    if (!modelDef) {
      return NextResponse.json({ error: `Unknown model: ${modelId}` }, { status: 400 });
    }

    // 4. Route to provider
    if (modelDef.provider === 'local') {
      // GPU API
      const jobId = `editor-edit-${uuidv4().slice(0, 8)}`;
      const outputKey = generateVideoEditorMediaKey(user.id, null, `${jobId}.png`);
      const { putUrl, publicUrl } = await generatePresignedPutUrl(outputKey, 'image/png');

      const result = await callGpuImageEdit({
        job_id: jobId,
        input_image_url: inputImageUrl,
        prompt,
        mask_image_url: maskImageUrl || undefined,
        seed: seed ?? undefined,
        lora_name: loraName ?? undefined,
        lora_strength: loraStrength ?? undefined,
        save_url: putUrl,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.errorMessage || 'GPU image edit failed' },
          { status: 502 }
        );
      }

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

      const url = await editImageViaReplicate(
        modelDef.replicateModelId,
        prompt,
        inputImageUrl,
        apiKey
      );

      return NextResponse.json({ url });
    }
  } catch (error) {
    console.error('[generate/image-edit] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
