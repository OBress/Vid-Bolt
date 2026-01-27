
import { createClient } from "@/lib/supabase/client";
import { StockMediaRecord, StockMediaMetadata } from "./types";
import type {
  ImageClassification,
  VideoClassification,
  AudioClassification,
  MediaType,
} from "@/lib/classification/types";

export class StockMediaService {
  /**
   * Generates a text embedding using Cloudflare Workers AI (client-side via API route)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_API_SECRET) {
      headers['X-Worker-Secret'] = process.env.INTERNAL_API_SECRET;
    }

    const response = await fetch('/api/vector/embed', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error('Failed to generate embedding');
    }

    const { embedding } = await response.json();
    return embedding;
  }

  /**
   * Store a video clip in the vector database.
   * Used after segmentation to make clips searchable.
   * Calls API route to handle server-side storage.
   */
  async storeClip(clip: {
    id: string;
    parentVideoId: string;
    description: string;
    subjects: string[];
    mood: string;
    sceneType: string;
    r2Key: string;
    thumbnailR2Key?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    startTime: number;
    endTime: number;
    hasAudio?: boolean;
    qualityRating?: number;
    suggestedUses?: string[];
  }): Promise<void> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_API_SECRET) {
      headers['X-Worker-Secret'] = process.env.INTERNAL_API_SECRET;
    }

    const response = await fetch(`${baseUrl}/api/stock-media/store-clip`, {
      method: 'POST',
      headers,
      body: JSON.stringify(clip),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[StockMediaService] Failed to store clip:', error);
      throw new Error(`Failed to store clip: ${error}`);
    }

    console.log(`[StockMediaService] Stored clip ${clip.id} in vector DB`);
  }

  /**
   * Classify media using AI and return classification + embedding
   */
  async classifyMedia(
    mediaUrl: string,
    mediaType: MediaType
  ): Promise<{
    classification: ImageClassification | VideoClassification | AudioClassification;
    embedding: number[];
  }> {
    const response = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaUrl, mediaType })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Classification failed');
    }

    const result = await response.json();
    return {
      classification: result.classification.classification,
      embedding: result.embedding,
    };
  }

  /**
   * Classify media and store in the vector database.
   * This is the main method to use when ingesting new stock media.
   */
  async classifyAndStore(params: {
    mediaUrl: string;
    mediaType: MediaType;
    source: StockMediaRecord['source'];
    r2Key: string;
    externalId?: string;
    baseMetadata?: Partial<StockMediaMetadata>;
  }): Promise<StockMediaRecord> {
    const supabase = createClient();

    // 1. Classify the media
    const { classification, embedding } = await this.classifyMedia(
      params.mediaUrl,
      params.mediaType
    );

    // 2. Merge classification into metadata
    const metadata = this.mergeClassificationIntoMetadata(
      params.baseMetadata || {},
      classification,
      params.mediaType
    );

    // 3. Insert into database with embedding
    const { data, error } = await supabase
      .from('stock_media')
      .insert({
        source: params.source,
        external_id: params.externalId,
        r2_key: params.r2Key,
        metadata,
        embedding,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to store stock media:', error);
      throw error;
    }

    return {
      id: data.id,
      source: data.source,
      external_id: data.external_id,
      r2_key: data.r2_key,
      metadata: data.metadata,
    };
  }

  /**
   * Search for stock media by semantic description
   */
  async search(query: string, limit = 20, threshold = 0.3): Promise<StockMediaRecord[]> {
    const supabase = createClient();
    
    console.log(`[StockMediaService] Searching for: "${query}" (threshold: ${threshold}, limit: ${limit})`);
    
    const embedding = await this.generateEmbedding(query);
    console.log(`[StockMediaService] Generated embedding with ${embedding.length} dimensions`);

    const { data, error } = await supabase.rpc('match_stock_media', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('[StockMediaService] Vector search error:', error);
      throw error;
    }
    
    console.log(`[StockMediaService] RPC returned ${data?.length || 0} results`);

    return (data || []).map((row: any) => {
      const m = row.metadata || {};
      return {
        id: row.id,
        r2_key: row.r2_key,
        source: row.source || m.source || 'other',
        similarity: row.similarity,
        // Flatten metadata for UI access
        mediaType: m.mediaType || 'video',
        description: m.description || m.title || '',
        url: m.url || '',
        thumbnailUrl: m.thumbnailUrl || '',
        subjects: m.subjects || [],
        mood: m.mood || '',
        duration: m.duration || 0,
        metadata: m,
      };
    }) as StockMediaRecord[];
  }

  /**
   * Merge AI classification results into stock media metadata.
   */
  private mergeClassificationIntoMetadata(
    base: Partial<StockMediaMetadata>,
    classification: ImageClassification | VideoClassification | AudioClassification,
    mediaType: MediaType
  ): StockMediaMetadata {
    const metadata: StockMediaMetadata = {
      title: base.title || '',
      description: classification.description,
      tags: base.tags || [],
      ...base,
      mediaType,
      qualityRating: classification.qualityRating,
      mood: classification.mood,
    };

    // Add type-specific fields
    if (mediaType === 'image') {
      const img = classification as ImageClassification;
      metadata.subjects = img.subjects;
      metadata.style = img.style;
      metadata.dominantColors = img.dominantColors;
    } else if (mediaType === 'video') {
      const vid = classification as VideoClassification;
      metadata.subjects = vid.subjects;
      metadata.transcription = vid.transcription;
      metadata.sceneTypes = vid.sceneTypes;
      metadata.actions = vid.actions;
      metadata.pacing = vid.pacing;
      metadata.shotTypes = vid.shotTypes;
    } else if (mediaType === 'audio') {
      const aud = classification as AudioClassification;
      metadata.transcription = aud.transcription;
      metadata.contentType = aud.contentType;
      metadata.clarity = aud.clarity;
      metadata.hasBackgroundNoise = aud.hasBackgroundNoise;
    }

    return metadata;
  }
}
