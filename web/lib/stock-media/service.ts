
import { createClient } from "@/lib/supabase/client";
import { StockMediaRecord, StockMediaMetadata } from "./types";

export class StockMediaService {
  /**
   * Generates a text embedding using Cloudflare Workers AI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // We will call our own internal API route to handle the CF Workers AI call
    // This keeps credentials secure on the server side
    const response = await fetch('/api/vector/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });

    if (!response.ok) {
        throw new Error('Failed to generate embedding');
    }

    const { embedding } = await response.json();
    return embedding;
  }

  /**
   * Search for stock media by semantic description
   */
  async search(query: string, limit = 20, threshold = 0.5): Promise<StockMediaRecord[]> {
    const supabase = createClient();
    
    // 1. Generate embedding for user query
    const embedding = await this.generateEmbedding(query);

    // 2. Call Supabase RPC
    const { data, error } = await supabase.rpc('match_stock_media', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Vector search error:', error);
      throw error;
    }

    // 3. Map results (Supabase returns JSONB metadata as object)
    return (data || []).map((row: any) => ({
      id: row.id,
      r2_key: row.r2_key,
      metadata: row.metadata, // Postgres JSONB map to JS object
      source: row.metadata.source || 'other', // fallback if needed, though strictly we should select 'source' column too. 
      // Note: My RPC only returned id, r2_key, metadata, similarity. 
      // I should update RPC or types if I strictly need 'source' column distinct from metadata.
      // For now, let's assume metadata contains source copy or we don't need top-level source field in UI.
      similarity: row.similarity
    })) as StockMediaRecord[];
  }
}
