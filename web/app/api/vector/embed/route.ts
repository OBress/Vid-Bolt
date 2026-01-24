
import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/ai/embedding';

export async function POST(req: Request) {
  try {
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
