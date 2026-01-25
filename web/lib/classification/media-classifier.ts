/**
 * Media Classifier Service
 * ==========================================================================
 * AI-powered media classification using Gemini 3 Flash via OpenRouter.
 * Supports images, videos (including YouTube URLs), and audio.
 */

import { callOpenRouter, type OpenRouterMessage } from '@/lib/ai/openrouter';
import {
  type ImageClassification,
  type VideoClassification,
  type AudioClassification,
  type ClassificationResult,
  type MediaType,
} from './types';

// ==========================================================================
// Configuration
// ==========================================================================

const CLASSIFICATION_MODEL = 'google/gemini-3-flash-preview';

const CLASSIFICATION_CONFIG = {
  model: CLASSIFICATION_MODEL,
  temperature: 0.2, // Low temp for consistent structured output
  maxTokens: 65536, // Gemini 3 Flash maximum output tokens
};

// ==========================================================================
// Prompt Templates
// ==========================================================================

const IMAGE_CLASSIFICATION_PROMPT = `You are an expert stock media analyst. Analyze this image and provide a detailed classification.

Return a JSON object with these exact fields:
{
  "description": "Detailed visual description for search (2-3 sentences)",
  "subjects": ["main", "subjects", "visible"],
  "mood": "emotional tone (e.g., calm, energetic, dramatic, playful)",
  "style": "visual style (e.g., cinematic, documentary, artistic, corporate)",
  "dominantColors": ["color1", "color2", "color3"],
  "qualityRating": 1-10 score based on sharpness, composition, lighting, and professional quality,
  "technicalNotes": "observations about lighting, composition, focus (optional)"
}

Rate quality based on:
- 9-10: Professional stock quality, perfect composition, excellent lighting
- 7-8: High quality, minor imperfections
- 5-6: Decent quality, usable but not premium
- 3-4: Low quality, noticeable issues
- 1-2: Poor quality, not suitable for professional use

Respond with valid JSON only, no markdown.`;

const VIDEO_CLASSIFICATION_PROMPT = `You are an expert stock video analyst. Analyze this video frame by frame and provide a detailed classification.

Return a JSON object with these exact fields:
{
  "description": "Overall video description for search (2-3 sentences)",
  "contentSummary": "Detailed summary of what the video covers, key topics discussed, visual content shown, and narrative arc (4-6 sentences). Include specific details about scenes, people, locations, and events shown.",
  "sceneTypes": ["types of scenes, e.g., interview, b-roll, establishing, action"],
  "subjects": ["main", "subjects", "visible"],
  "actions": ["key", "actions", "happening"],
  "mood": "emotional tone",
  "pacing": "slow, moderate, fast, or dynamic",
  "shotTypes": ["wide", "medium", "close-up", "aerial", etc.],
  "qualityRating": 1-10 score based on stability, focus, lighting, production value
}

For contentSummary:
- Provide a comprehensive overview of the video's content
- Describe key scenes, topics, and visual elements in detail
- Note what types of footage are shown (interviews, b-roll, historical, modern, etc.)
- This helps users understand what clips can be extracted from this video

Rate quality based on:
- 9-10: Broadcast quality, stable, professional lighting and color
- 7-8: High quality, minor issues
- 5-6: Decent quality, some shakiness or lighting issues
- 3-4: Low quality, significant issues
- 1-2: Poor quality, unusable

Respond with valid JSON only, no markdown.`;

const AUDIO_CLASSIFICATION_PROMPT = `You are an expert audio analyst. Analyze this audio and provide a detailed classification.

Return a JSON object with these exact fields:
{
  "description": "Audio content description for search (2-3 sentences)",
  "transcription": "Full transcription of any speech, or null if no speech",
  "contentType": "speech", "music", "ambient", or "mixed",
  "mood": "emotional quality (e.g., calm, upbeat, tense, peaceful)",
  "clarity": "clear", "moderate", or "noisy",
  "qualityRating": 1-10 score based on clarity, consistency, professional mixing,
  "hasBackgroundNoise": true or false,
  "estimatedLoudness": "quiet", "moderate", or "loud"
}

For transcription:
- Include spoken words if there is speech (limit to first 2000 characters if very long)
- Use null if there is no speech (music only, ambient sounds)

Rate quality based on:
- 9-10: Studio quality, clean, professional
- 7-8: High quality, minimal issues
- 5-6: Decent quality, some noise or inconsistency
- 3-4: Low quality, significant issues
- 1-2: Poor quality, hard to use

Respond with valid JSON only, no markdown.`;

// ==========================================================================
// Classification Functions
// ==========================================================================

/**
 * Classify an image from a URL.
 */
export async function classifyImage(
  imageUrl: string,
  userId: string
): Promise<ClassificationResult> {
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: IMAGE_CLASSIFICATION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this image:' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] as any,
    },
  ];

  const response = await callOpenRouter(userId, messages, CLASSIFICATION_CONFIG);

  const classification = parseJsonResponse<ImageClassification>(response.content);

  return {
    mediaType: 'image',
    classification,
    processingTimeMs: Date.now() - startTime,
    model: response.model,
    usage: response.usage,
  };
}

/**
 * Classify a video from a URL.
 * Supports YouTube URLs directly, or any public video URL.
 */
export async function classifyVideo(
  videoUrl: string,
  userId: string
): Promise<ClassificationResult> {
  const startTime = Date.now();

  // For YouTube URLs, we can pass directly
  // For other URLs, Gemini will attempt to fetch and analyze
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: VIDEO_CLASSIFICATION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this video:' },
        { type: 'video_url', video_url: { url: videoUrl } },
      ] as any,
    },
  ];

  const response = await callOpenRouter(userId, messages, CLASSIFICATION_CONFIG);

  const classification = parseJsonResponse<VideoClassification>(response.content);

  return {
    mediaType: 'video',
    classification,
    processingTimeMs: Date.now() - startTime,
    model: response.model,
    usage: response.usage,
  };
}

/**
 * Classify audio from a URL.
 */
export async function classifyAudio(
  audioUrl: string,
  userId: string
): Promise<ClassificationResult> {
  const startTime = Date.now();

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: AUDIO_CLASSIFICATION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Analyze this audio:' },
        { type: 'audio_url', audio_url: { url: audioUrl } },
      ] as any,
    },
  ];

  const response = await callOpenRouter(userId, messages, CLASSIFICATION_CONFIG);

  const classification = parseJsonResponse<AudioClassification>(response.content);

  // Normalize transcription
  if (classification.transcription === 'N/A' || classification.transcription === 'n/a') {
    classification.transcription = null;
  }

  return {
    mediaType: 'audio',
    classification,
    processingTimeMs: Date.now() - startTime,
    model: response.model,
    usage: response.usage,
  };
}

/**
 * Classify any media type based on the provided type.
 */
export async function classifyMedia(
  mediaUrl: string,
  mediaType: MediaType,
  userId: string
): Promise<ClassificationResult> {
  switch (mediaType) {
    case 'image':
      return classifyImage(mediaUrl, userId);
    case 'video':
      return classifyVideo(mediaUrl, userId);
    case 'audio':
      return classifyAudio(mediaUrl, userId);
    default:
      throw new Error(`Unsupported media type: ${mediaType}`);
  }
}

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Parse JSON response from Gemini, handling potential markdown wrapping.
 */
function parseJsonResponse<T>(content: string): T {
  let cleaned = content.trim();

  // Remove markdown code blocks using regex (handles ```json\n...\n```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // Fallback: manual removal if regex doesn't match
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.error('[Classify] JSON parse error. Content preview:', cleaned.substring(0, 500));
    throw new Error(`Failed to parse classification response: ${cleaned.substring(0, 200)}`);
  }
}

/**
 * Check if a URL is a YouTube URL.
 */
export function isYouTubeUrl(url: string): boolean {
  return (
    url.includes('youtube.com/watch') ||
    url.includes('youtu.be/') ||
    url.includes('youtube.com/embed/')
  );
}

/**
 * Detect media type from URL or content-type header.
 */
export function detectMediaType(url: string, contentType?: string): MediaType | null {
  const urlLower = url.toLowerCase();

  // Check by extension
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(urlLower)) {
    return 'image';
  }
  if (/\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(urlLower)) {
    return 'video';
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(urlLower)) {
    return 'audio';
  }

  // YouTube is always video
  if (isYouTubeUrl(url)) {
    return 'video';
  }

  // Check by content-type header if provided
  if (contentType) {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
  }

  return null;
}
