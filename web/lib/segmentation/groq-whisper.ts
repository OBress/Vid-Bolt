/**
 * Groq Whisper Integration
 * ==========================================================================
 * Transcription with word-level timestamps using Groq Whisper Large v3 Turbo.
 * Returns null if no Groq API key is configured.
 */

import { getUserApiKeys } from '@/lib/services/api-keys';
import type { TranscriptionResult, TranscriptWord } from './types';

// ==========================================================================
// Configuration
// ==========================================================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3-turbo';

// ==========================================================================
// Public Functions
// ==========================================================================

/**
 * Check if a user has Groq API key configured.
 */
export async function hasGroqApiKey(userId: string): Promise<boolean> {
  const keys = await getUserApiKeys(userId);
  return !!keys?.groq_key;
}

/**
 * Get Groq API key for a user (returns null if not configured).
 */
export async function getGroqApiKey(userId: string): Promise<string | null> {
  const keys = await getUserApiKeys(userId);
  return keys?.groq_key ?? null;
}

/**
 * Transcribe audio with word-level timestamps using Groq Whisper.
 * Returns null if no Groq API key is configured.
 * 
 * @param audioFilePath - Path to the audio file (or video with audio track)
 * @param userId - User ID to fetch API key
 * @returns Transcription with word timestamps, or null if no API key
 */
export async function transcribeWithGroq(
  audioBuffer: Buffer,
  fileName: string,
  userId: string
): Promise<TranscriptionResult | null> {
  const apiKey = await getGroqApiKey(userId);
  
  if (!apiKey) {
    console.log('[Groq] No API key configured - skipping transcription');
    return null;
  }

  console.log(`[Groq] Starting transcription with ${WHISPER_MODEL}...`);
  const startTime = Date.now();

  try {
    // Create form data with audio file
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mp4' });
    formData.append('file', blob, fileName);
    formData.append('model', WHISPER_MODEL);
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Groq] API error:', response.status, errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const processingTime = Date.now() - startTime;
    console.log(`[Groq] Transcription complete in ${processingTime}ms`);

    // Parse the response into our format
    const result = parseGroqResponse(data);
    return result;

  } catch (error) {
    console.error('[Groq] Transcription failed:', error);
    throw error;
  }
}

// ==========================================================================
// Response Parsing
// ==========================================================================

interface GroqWord {
  word: string;
  start: number;
  end: number;
}

interface GroqResponse {
  text: string;
  language: string;
  duration: number;
  words?: GroqWord[];
}

/**
 * Parse Groq verbose JSON response into our format.
 */
function parseGroqResponse(data: GroqResponse): TranscriptionResult {
  const words: TranscriptWord[] = (data.words || []).map(w => ({
    word: w.word.trim(),
    start: w.start,
    end: w.end,
  }));

  return {
    text: data.text,
    words,
    language: data.language,
    duration: data.duration,
  };
}

/**
 * Find the word boundaries around a specific time.
 * Useful for finding optimal clip cut points.
 */
export function findWordBoundary(
  words: TranscriptWord[],
  targetTime: number,
  preference: 'before' | 'after' = 'after'
): number {
  if (words.length === 0) return targetTime;

  // Find words near the target time
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    if (word.start <= targetTime && word.end >= targetTime) {
      // We're in the middle of a word - cut at the end
      return word.end;
    }
    
    if (word.start > targetTime) {
      // We're in a gap before this word
      if (preference === 'before' && i > 0) {
        return words[i - 1].end;
      }
      return word.start;
    }
  }

  // Past all words - return last word end
  return words[words.length - 1].end;
}

/**
 * Find sentence boundaries in word timestamps.
 * Returns timestamps where sentences end (. ? !).
 */
export function findSentenceEnds(words: TranscriptWord[]): number[] {
  const sentenceEnds: number[] = [];
  
  for (const word of words) {
    const lastChar = word.word.trim().slice(-1);
    if (['.', '?', '!'].includes(lastChar)) {
      sentenceEnds.push(word.end);
    }
  }
  
  return sentenceEnds;
}
