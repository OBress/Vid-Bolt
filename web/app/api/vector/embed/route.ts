
import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/ai/embedding';
import { verifySessionOrSecret } from '@/lib/auth-checks';

export async function POST(req: Request) {
  try {
    if (!(await verifySessionOrSecret(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
