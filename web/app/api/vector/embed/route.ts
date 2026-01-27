
import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/ai/embedding';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    // 1. Check Worker Secret
    const workerSecret = req.headers.get('X-Worker-Secret');
    const isWorker = workerSecret && process.env.INTERNAL_API_SECRET && workerSecret === process.env.INTERNAL_API_SECRET;

    // 2. Check User Session if not worker
    if (!isWorker) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
