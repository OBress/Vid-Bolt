/**
 * Batch Media Classification API
 * ==========================================================================
 * POST /api/classify/batch
 * Classifies multiple media items in a single request.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  classifyMedia,
  detectMediaType,
} from '@/lib/classification/media-classifier';
import { generateEmbedding } from '@/lib/ai/embedding';
import type { BatchClassifyRequest, ClassifyRequest, ClassificationResult } from '@/lib/classification/types';

const MAX_BATCH_SIZE = 10;

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body: BatchClassifyRequest = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'items array is required' },
        { status: 400 }
      );
    }

    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum batch size is ${MAX_BATCH_SIZE} items` },
        { status: 400 }
      );
    }

    // 3. Process each item
    const results: Array<{
      request: ClassifyRequest;
      result?: ClassificationResult & { embedding: number[] };
      error?: string;
    }> = [];

    for (const item of items) {
      try {
        const mediaType = item.mediaType || detectMediaType(item.mediaUrl);

        if (!mediaType) {
          results.push({
            request: item,
            error: 'Could not determine media type',
          });
          continue;
        }

        // Classify
        const classificationResult = await classifyMedia(
          item.mediaUrl,
          mediaType,
          user.id
        );

        // Generate embedding
        const embedding = await generateEmbedding(
          classificationResult.classification.description
        );

        results.push({
          request: item,
          result: {
            ...classificationResult,
            embedding,
          },
        });
      } catch (error) {
        results.push({
          request: item,
          error: error instanceof Error ? error.message : 'Classification failed',
        });
      }
    }

    // 4. Return results
    return NextResponse.json({
      success: true,
      results,
      totalProcessingTimeMs: Date.now() - startTime,
      successCount: results.filter(r => r.result).length,
      errorCount: results.filter(r => r.error).length,
    });

  } catch (error) {
    console.error('Batch Classification API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
