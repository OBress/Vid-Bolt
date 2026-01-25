import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Use service role client to read all stock_media entries
const getServiceClient = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/stock-media/debug
 * Returns all entries in stock_media table for debugging
 */
export async function GET() {
  try {
    const supabase = getServiceClient();
    
    // Get all stock_media entries
    const { data: allMedia, error: allError } = await supabase
      .from('stock_media')
      .select('id, source, external_id, r2_key, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (allError) {
      console.error('[debug] Error fetching stock_media:', allError);
      return NextResponse.json({ error: allError.message }, { status: 500 });
    }

    // Get count by source
    const { data: countData, error: countError } = await supabase
      .from('stock_media')
      .select('source')
      .limit(1000);
    
    const sourceCounts: Record<string, number> = {};
    if (countData) {
      countData.forEach((row: any) => {
        sourceCounts[row.source] = (sourceCounts[row.source] || 0) + 1;
      });
    }

    // Count entries with embeddings
    const { data: embeddingData, error: embeddingError } = await supabase
      .from('stock_media')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(1000);
    
    const entriesWithEmbedding = embeddingData?.length || 0;

    return NextResponse.json({
      totalCount: allMedia?.length || 0,
      sourceCounts,
      entriesWithEmbedding,
      entries: (allMedia || []).map((entry: any) => ({
        id: entry.id,
        source: entry.source,
        external_id: entry.external_id,
        r2_key: entry.r2_key,
        created_at: entry.created_at,
        metadata: {
          title: entry.metadata?.title,
          description: entry.metadata?.description?.substring(0, 200),
          mediaType: entry.metadata?.mediaType,
          subjects: entry.metadata?.subjects,
          clipId: entry.metadata?.clipId,
          thumbnailUrl: entry.metadata?.thumbnailUrl,
          url: entry.metadata?.url,
        },
      })),
    });
  } catch (error) {
    console.error('[debug] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
