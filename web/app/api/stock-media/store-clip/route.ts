import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Use service role client since this is called from workers without cookies
const getServiceClient = () => createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/stock-media/store-clip
 * Stores a video clip in the vector database for semantic search.
 */
export async function POST(request: Request) {
  try {
    const clip = await request.json();
    
    // Validate required fields
    if (!clip.id || !clip.description || !clip.r2Key) {
      return NextResponse.json(
        { error: 'Missing required fields: id, description, r2Key' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Check if clip already exists (prevents duplicates on job retry)
    const { data: existing } = await supabase
      .from('stock_media')
      .select('id')
      .eq('external_id', clip.id)
      .single();

    if (existing) {
      console.log(`[store-clip] Clip ${clip.id} already exists, skipping`);
      return NextResponse.json({ success: true, clipId: clip.id, skipped: true });
    }

    // Build searchable text from clip metadata
    const searchableText = [
      clip.description,
      clip.subjects?.length ? `Subjects: ${clip.subjects.join(', ')}` : '',
      clip.mood ? `Mood: ${clip.mood}` : '',
      clip.sceneType ? `Scene type: ${clip.sceneType}` : '',
      clip.suggestedUses?.length ? `Uses: ${clip.suggestedUses.join(', ')}` : '',
    ].filter(Boolean).join('. ');

    // Generate embedding via the embed API
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_API_SECRET) {
      headers['X-Worker-Secret'] = process.env.INTERNAL_API_SECRET;
    }

    const embedResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/vector/embed`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: searchableText }),
      }
    );

    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      console.error('[store-clip] Embedding failed:', errText);
      return NextResponse.json({ error: 'Failed to generate embedding' }, { status: 500 });
    }

    const { embedding } = await embedResponse.json();

    // Build metadata object
    const metadata = {
      title: clip.description.substring(0, 100),
      description: clip.description,
      tags: clip.subjects || [],
      mediaType: 'video',
      qualityRating: clip.qualityRating || 7,
      mood: clip.mood || '',
      subjects: clip.subjects || [],
      sceneTypes: clip.sceneType ? [clip.sceneType] : [],
      clipId: clip.id,
      parentVideoId: clip.parentVideoId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: (clip.endTime || 0) - (clip.startTime || 0),
      hasAudio: clip.hasAudio || false,
      suggestedUses: clip.suggestedUses || [],
      thumbnailUrl: clip.thumbnailUrl,
      url: clip.videoUrl,
    };

    // Insert into stock_media table
    const { error } = await supabase
      .from('stock_media')
      .insert({
        source: 'youtube',
        external_id: clip.id,
        r2_key: clip.r2Key,
        metadata,
        embedding,
      });

    if (error) {
      console.error('[store-clip] DB insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[store-clip] Stored clip ${clip.id} in vector DB`);
    return NextResponse.json({ success: true, clipId: clip.id });

  } catch (error) {
    console.error('[store-clip] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
