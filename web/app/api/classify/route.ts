/**
 * Media Classification API
 * ==========================================================================
 * POST /api/classify
 * Classifies a single media item (image, video, or audio) using Gemini 3 Flash.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  classifyMedia,
  detectMediaType,
} from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import type { ClassifyRequest } from '@/lib/classification/types';

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    console.log('[Classify] Starting classification request...');
    
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Classify] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Classify] User authenticated:', user.id.substring(0, 8) + '...');

    // 2. Parse request body
    const body: ClassifyRequest = await req.json();
    const { mediaUrl, mediaType: providedType, technicalMetadata } = body;

    if (!mediaUrl) {
      return NextResponse.json(
        { error: 'mediaUrl is required' },
        { status: 400 }
      );
    }

    // 3. Determine media type
    const mediaType = providedType || detectMediaType(mediaUrl);
    console.log(`[Classify] Media type: ${mediaType}, URL: ${mediaUrl.substring(0, 50)}...`);

    if (!mediaType) {
      return NextResponse.json(
        { error: 'Could not determine media type. Please provide mediaType explicitly.' },
        { status: 400 }
      );
    }

    // 4. Classify the media
    console.log(`[Classify] Starting ${mediaType} classification with Gemini 3 Flash...`);
    const classificationResult = await classifyMedia(mediaUrl, mediaType, user.id);
    console.log(`[Classify] Classification complete in ${classificationResult.processingTimeMs}ms`);

    // 5. Generate embedding from the description
    console.log('[Classify] Generating embedding...');
    const description = classificationResult.classification.description;
    const embedding = await generateEmbedding(description);
    console.log(`[Classify] Embedding generated (${embedding.length} dimensions)`);

    const totalTime = Date.now() - startTime;
    console.log(`[Classify] ✓ Request complete in ${totalTime}ms`);

    // 6. Return results
    return NextResponse.json({
      success: true,
      classification: classificationResult,
      embedding,
      technicalMetadata,
      totalProcessingTimeMs: totalTime,
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[Classify] ✗ Error after ${totalTime}ms:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
