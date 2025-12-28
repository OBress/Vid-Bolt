/**
 * Inworld TTS Service
 * ============================================================================
 * Text-to-Speech generation using Inworld AI's REST API.
 * 
 * API Endpoint: https://api.inworld.ai/tts/v1/voice
 * Returns base64-encoded audio content.
 */

import { getInworldApiKey } from "./api-keys";
import { WordTimestamp } from "@/types/task";

const INWORLD_TTS_API_URL = "https://api.inworld.ai/tts/v1/voice";

export interface TTSOptions {
  modelId?: string;
  voiceId?: string;
  speakingRate?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  durationSeconds: number;
  mimeType: string;
  wordTimestamps?: WordTimestamp[];
}

const DEFAULT_OPTIONS: Required<TTSOptions> = {
  modelId: "inworld-tts-1-max", // Enforce robust model
  voiceId: "Hades", // Enforce Hades voice
  speakingRate: 1.0,
};

/**
 * Generate speech audio from text using Inworld TTS REST API.
 * 
 * @param userId - User ID for API key lookup
 * @param text - Text to convert to speech
 * @param options - TTS configuration options
 * @returns Audio buffer with metadata
 */
export async function generateSpeech(
  userId: string,
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  // Get API key from Supabase (already Base64 encoded)
  const apiKey = await getInworldApiKey(userId);
  const config = { ...DEFAULT_OPTIONS, ...options };

  try {
    const response = await fetch(INWORLD_TTS_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId: config.voiceId,
        modelId: config.modelId,
        timestampType: "WORD",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Inworld API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.audioContent) {
      throw new Error("No audio content in Inworld API response");
    }

    // Decode base64 audio content
    const audioBuffer = Buffer.from(result.audioContent, "base64");

    // Parse timestamps if available
    let wordTimestamps: WordTimestamp[] | undefined;
    if (result.timestampInfo?.wordAlignment) {
      const { words, wordStartTimeSeconds, wordEndTimeSeconds } = result.timestampInfo.wordAlignment;
      wordTimestamps = words.map((word: string, i: number) => ({
        word,
        start_seconds: wordStartTimeSeconds[i],
        end_seconds: wordEndTimeSeconds[i],
      }));
    }

    // Estimate duration: MP3 at ~128kbps = ~16KB per second
    const estimatedDuration = audioBuffer.length / 16000;

    return {
      audioBuffer,
      durationSeconds: estimatedDuration,
      mimeType: "audio/mpeg",
      wordTimestamps,
    };
  } catch (error) {
    console.error("Inworld TTS error:", error);
    throw new Error(
      `Failed to generate speech: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Available voice presets for Inworld TTS.
 */
export const INWORLD_VOICES = {
  ASHLEY: "Ashley",
  ALEX: "Alex",
  MICHAEL: "Michael",
  SARAH: "Sarah",
} as const;

export type InworldVoice = typeof INWORLD_VOICES[keyof typeof INWORLD_VOICES];

/**
 * Check if Inworld TTS is configured for a user.
 */
export async function isInworldConfigured(userId: string): Promise<boolean> {
  try {
    await getInworldApiKey(userId);
    return true;
  } catch {
    return false;
  }
}
