/**
 * Chunked LLM Utility
 * ============================================================================
 * Shared helper for processing large arrays in sequential LLM chunks.
 *
 * Pattern: Process items in small sequential batches so no single LLM call
 * exceeds the output token budget and quality stays high (focused attention
 * per item). Results are merged in order.
 *
 * Usage:
 *   const results = await processInLlmChunks(
 *     allShots,
 *     3,
 *     async (chunk, chunkIndex, totalChunks) => {
 *       const res = await callLLM(chunk);
 *       return res.items;
 *     },
 *     (done, total) => console.log(`${done}/${total} processed`)
 *   );
 */

/**
 * Process an array of items in sequential LLM chunks.
 *
 * @param items       - Full array of items to process
 * @param chunkSize   - Number of items per LLM call
 * @param processor   - Async function that processes one chunk and returns
 *                      an array of results (must be same length as chunk)
 * @param onProgress  - Optional progress callback (completedCount, totalCount)
 * @returns           - Flattened array of results in original item order
 */
export async function processInLlmChunks<TInput, TOutput>(
  items: TInput[],
  chunkSize: number,
  processor: (
    chunk: TInput[],
    chunkIndex: number,
    totalChunks: number,
  ) => Promise<TOutput[]>,
  onProgress?: (completed: number, total: number) => void,
): Promise<TOutput[]> {
  if (items.length === 0) return [];

  const results: TOutput[] = [];
  const totalChunks = Math.ceil(items.length / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = items.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunkResults = await processor(chunk, i, totalChunks);
    results.push(...chunkResults);
    onProgress?.(Math.min((i + 1) * chunkSize, items.length), items.length);
  }

  return results;
}

/**
 * Extract a "tail" of items from the end of an array for use as rolling
 * context in the next chunk (e.g. last 2 generated visual descriptions).
 *
 * @param arr  - Array to extract tail from
 * @param n    - Number of tail items to return
 * @returns    - Last n items (or fewer if array is smaller)
 */
export function rollingTail<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}
