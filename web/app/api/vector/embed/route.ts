
import { NextResponse } from 'next/server';

// This is a proxy to call Cloudflare Workers AI for embeddings
// In a real deployed Worker environment, you'd use the `env.AI` binding directly.
// Here in Next.js (likely Vercel or Node), we perform a fetch to CLOUDFLARE_WORKERS_AI_API endpoint.
// Or if the user has a specific Worker deployed for this, we call that.
// For this implementation, I will assume we call the Cloudflare REST API for Workers AI.

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_WORKER_API_TOKEN;
const MODEL_ID = '@cf/baai/bge-base-en-v1.5';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
        console.error("Missing Cloudflare credentials");
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text }),
      }
    );

    const data = await response.json();

    if (!data.success) {
        console.error("Cloudflare AI Error:", data.errors);
        return NextResponse.json({ error: 'AI Generation Failed' }, { status: 500 });
    }

    // Cloudflare BGE response format: { result: { data: [ [0.1, 0.2, ...] ], shape: [1, 768] } }
    // Or sometimes just { result: { data: [ [vector] ] } } depending on version.
    const embedding = data.result.data[0];

    return NextResponse.json({ embedding });

  } catch (error) {
    console.error('Embedding API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
