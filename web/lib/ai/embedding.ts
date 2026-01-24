
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_WORKER_API_TOKEN;
const EMBEDDING_MODEL_ID = '@cf/baai/bge-base-en-v1.5';

/**
 * Generate text embeddings using Cloudflare Workers AI.
 * Returns a 768-dimensional vector (for BGE-Base).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Text required for embedding');
  }

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Missing Cloudflare credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKER_API_TOKEN)');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${EMBEDDING_MODEL_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    }
  );

  const data = await response.json();

  if (!data.success) {
    console.error("Cloudflare AI Error:", data.errors);
    throw new Error(`AI Generation Failed: ${data.errors?.[0]?.message || 'Unknown error'}`);
  }

  // Cloudflare BGE response format: { result: { data: [ [0.1, 0.2, ...] ], shape: [1, 768] } }
  // Verify structure
  if (!data.result?.data?.[0]) {
      throw new Error('Invalid embedding response structure from Cloudflare');
  }

  return data.result.data[0];
}
