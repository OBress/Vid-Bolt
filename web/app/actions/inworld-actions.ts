"use server";

import { listVoices, generateSpeech, TTSOptions } from "@/lib/services/inworld-tts";

/**
 * Server action to list Inworld voices.
 * Proxies the request to the service which runs on the server (with access to API keys).
 */
export async function listInworldVoicesAction(userId: string) {
  try {
    const voices = await listVoices(userId);
    return { voices };
  } catch (error) {
    console.error("Failed to list Inworld voices via server action:", error);
    return { 
      voices: [], 
      error: error instanceof Error ? error.message : "Failed to fetch voices" 
    };
  }
}

/**
 * Server action to generate Inworld speech.
 */
export async function generateInworldSpeechAction(
  userId: string, 
  text: string, 
  options: TTSOptions
) {
  try {
    const result = await generateSpeech(userId, text, options);
    // Convert Buffer to base64 string for client consumption
    const audioBase64 = result.audioBuffer.toString('base64');
    return { audioBase64, duration: result.durationSeconds };
  } catch (error) {
    console.error("Failed to generate Inworld speech via server action:", error);
    return { 
      audioBase64: null, 
      error: error instanceof Error ? error.message : "Failed to generate speech" 
    };
  }
}
