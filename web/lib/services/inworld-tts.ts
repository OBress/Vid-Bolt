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
const TTS_FETCH_TIMEOUT_MS = 30_000; // 30s per chunk — safety net

export interface TTSOptions {
  modelId?: string;
  voiceId?: string;
  speakingRate?: number;
  temperature?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  durationSeconds: number;
  mimeType: string;
  wordTimestamps?: WordTimestamp[];
}

const DEFAULT_OPTIONS: Required<TTSOptions> = {
  modelId: "inworld-tts-1.5-max",
  voiceId: "Hades",
  speakingRate: 1.0,
  temperature: 1.0,
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

  const requestBody = {
    text,
    voiceId: config.voiceId,
    modelId: config.modelId,
    // Inworld requires temperature > 0.0 and <= 2.0
    // We clamp to 0.1 minimum to be safe, and 2.0 maximum
    temperature: Math.max(0.1, Math.min(2.0, config.temperature || 1.0)),
    timestampType: "WORD",
    audioConfig: {
      audioEncoding: "MP3" as const,
      sampleRateHertz: 48000,
      speakingRate: config.speakingRate ?? 1.0,
    },
    applyTextNormalization: "ON" as const,
  };


  try {
    const bodyJson = JSON.stringify(requestBody);
    console.log(`[Inworld TTS] Sending request: ${text.length} chars, voice=${config.voiceId}, model=${config.modelId}, rate=${config.speakingRate}, temp=${requestBody.temperature}`);
    const fetchStart = Date.now();

    const response = await fetch(INWORLD_TTS_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: bodyJson,
      signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
    });

    console.log(`[Inworld TTS] Response: ${response.status} in ${Date.now() - fetchStart}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Inworld TTS] API error (${response.status}):`, errorText);
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
      if (Array.isArray(words) && words.length > 0) {
        wordTimestamps = words.map((word: string, i: number) => ({
          word,
          start_seconds: wordStartTimeSeconds[i],
          end_seconds: wordEndTimeSeconds[i],
        }));
        console.log(`[Inworld TTS] Parsed ${wordTimestamps.length} word timestamps`);
      } else {
        console.warn('[Inworld TTS] wordAlignment present but words array is empty or missing');
      }
    } else {
      console.warn('[Inworld TTS] No timestampInfo.wordAlignment in response. Response keys:', Object.keys(result).join(', '));
      if (result.timestampInfo) {
        console.warn('[Inworld TTS] timestampInfo keys:', Object.keys(result.timestampInfo).join(', '));
      }
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
  DENNIS: "Dennis",
  HADES: "Hades",
  ASHLEY: "Ashley",
  ALEX: "Alex",
  MICHAEL: "Michael",
  SARAH: "Sarah",
} as const;

export type InworldVoicePreset = typeof INWORLD_VOICES[keyof typeof INWORLD_VOICES];

/**
 * Voice shape returned by the Inworld v1/voices API.
 */
export interface InworldVoice {
  /** The voice ID used in TTS generation (e.g. "Alex", "Hades") */
  voiceId: string;
  /** Display name for the UI */
  displayName: string;
  /** Language codes (e.g. ["en"]) */
  languages: string[];
  /** Description of the voice */
  description?: string;
  /** Tags (e.g. ["male", "warm", "calm"]) */
  tags: string[];
  /** Whether this is a custom/cloned voice */
  isCustom: boolean;
  
  // Legacy compat — kept as alias so old references don't crash
  /** @deprecated Use voiceId instead */
  name: string;
}

export interface ListVoicesResponse {
  voices: Array<{
    voiceId: string;
    displayName: string;
    languages?: string[];
    description?: string;
    tags?: string[];
    isCustom?: boolean;
  }>;
}

/**
 * Fetch available voices from Inworld TTS API.
 * Uses the v1/voices endpoint (matching the v1/voice generation endpoint).
 */
export async function listVoices(userId: string): Promise<InworldVoice[]> {
  try {
    const apiKey = await getInworldApiKey(userId);
    if (!apiKey) {
      console.warn("No Inworld API key found for user", userId);
      return [];
    }

    // Use v1/voices to match the v1/voice generation endpoint
    const listUrl = "https://api.inworld.ai/tts/v1/voices";

    const response = await fetch(listUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Inworld TTS] ListVoices failed:", response.status, errorText);
      throw new Error(`Failed to list voices: ${response.statusText}`);
    }

    const data = (await response.json()) as ListVoicesResponse;
    const rawVoices = data.voices || [];
    
    // Normalize to InworldVoice shape
    const voices: InworldVoice[] = rawVoices.map(v => ({
      voiceId: v.voiceId,
      displayName: v.displayName || v.voiceId,
      languages: v.languages || [],
      description: v.description,
      tags: v.tags || [],
      isCustom: v.isCustom || false,
      // Legacy compat
      name: v.voiceId,
    }));

    return voices;
  } catch (error) {
    console.error("[Inworld TTS] Error listing voices:", error);
    return [];
  }
}

/**
 * Validate that a voice ID exists in the Inworld API.
 * Returns the voice ID if valid, otherwise returns the fallback.
 */
export async function validateVoice(
  userId: string,
  voiceId: string,
  fallback: string = DEFAULT_OPTIONS.voiceId
): Promise<string> {
  try {
    const voices = await listVoices(userId);
    if (voices.length === 0) {
      console.warn(`[Inworld TTS] No voices returned from API, using fallback: ${fallback}`);
      return fallback;
    }
    const exists = voices.some(v => v.voiceId === voiceId);
    if (!exists) {
      console.warn(`[Inworld TTS] Voice "${voiceId}" not found. Available: [${voices.slice(0, 10).map(v => v.voiceId).join(', ')}...]. Using fallback: ${fallback}`);
      return fallback;
    }
    return voiceId;
  } catch {
    console.warn(`[Inworld TTS] Voice validation failed, using fallback: ${fallback}`);
    return fallback;
  }
}

export const INWORLD_MODELS = {
  MINI: "inworld-tts-1.5-mini",
  MAX: "inworld-tts-1.5-max",
} as const;

export type InworldModel = typeof INWORLD_MODELS[keyof typeof INWORLD_MODELS];

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
