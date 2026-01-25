/**
 * Query Generator API Route
 * ============================================================================
 * POST /api/query-generator/generate
 * 
 * Accepts Universal Script output and generates media search queries 
 * for building a per-video stock library.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  generateQueries,
  convertToSceneInputs,
  QueryGenerationInput,
} from '@/lib/query-generator';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, spine, expandedBeats, assetRegistry, researchEntities } = body;

    if (!videoId || !spine?.beats) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, spine.beats' },
        { status: 400 }
      );
    }

    // Convert spine beats to scene inputs
    const scenes = convertToSceneInputs(spine, expandedBeats);

    if (scenes.length === 0) {
      return NextResponse.json(
        { error: 'No scenes to process' },
        { status: 400 }
      );
    }

    // Build input
    const input: QueryGenerationInput = {
      videoId,
      userId: user.id,
      scenes,
      assetRegistry,
      researchEntities,
    };

    // Generate queries
    const result = await generateQueries(input);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error) {
    console.error('[QueryGenerator] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/query-generator/generate
 * 
 * Health check / info endpoint
 */
export async function GET() {
  return NextResponse.json({
    service: 'Query Generator',
    version: '1.0.0',
    description: 'Generates media search queries from video scenes',
    sources: {
      images: ['serper', 'wikimedia'],
      videos: ['pexels', 'youtube'],
    },
  });
}
