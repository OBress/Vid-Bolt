
const EMBEDDING_MODEL_ID = '@cf/baai/bge-base-en-v1.5';
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate text embeddings using Cloudflare Workers AI.
 * Returns a 768-dimensional vector (for BGE-Base).
 * 
 * Includes retry logic for transient failures with exponential backoff.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Text required for embedding');
  }

  // Read env vars at runtime (not module load) so dotenv has time to load them
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_WORKER_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Missing Cloudflare credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKER_API_TOKEN)');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
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
        const errorMessage = data.errors?.[0]?.message || 'Unknown error';
        
        // Check if this is a transient error (model temporarily unavailable)
        if (errorMessage.includes('temporarily unavailable') && attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[Embedding] Cloudflare AI temporarily unavailable, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }
        
        console.error("Cloudflare AI Error:", data.errors);
        throw new Error(`AI Generation Failed: ${errorMessage}`);
      }

      // Cloudflare BGE response format: { result: { data: [ [0.1, 0.2, ...] ], shape: [1, 768] } }
      if (!data.result?.data?.[0]) {
        throw new Error('Invalid embedding response structure from Cloudflare');
      }

      return data.result.data[0];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Only retry on transient errors
      if (lastError.message.includes('temporarily unavailable') && attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Embedding] Retrying after error: ${lastError.message} (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      
      throw lastError;
    }
  }

  throw lastError || new Error('Embedding generation failed after retries');
}

