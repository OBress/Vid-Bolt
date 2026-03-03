
import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/ai/embedding';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/vector/embed
 * 
 * Generates a text embedding using AI.
 * 
 * SECURITY: Accepts either:
 * - Supabase user authentication (browser calls)
 * - X-Internal-Secret header (worker calls)
 */
export async function POST(req: NextRequest) {
  try {
    // Dual auth: internal secret OR user auth
    const internalSecret = req.headers.get("X-Internal-Secret");
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    const isInternalCall = expectedSecret && internalSecret === expectedSecret;

    if (!isInternalCall) {
      // Fall back to user auth
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    const embedding = await generateEmbedding(text);
    return NextResponse.json({ embedding });

  } catch (error) {
    console.error('Embedding API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
