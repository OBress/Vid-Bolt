/**
 * Media Classifier Service
 * ==========================================================================
 * AI-powered media classification using Gemini 3 Flash via OpenRouter.
 * Supports images, videos (including YouTube URLs), and audio.
 */

import { callOpenRouter, type OpenRouterMessage } from '@/lib/ai/openrouter';
import { getFileAsBase64 } from '@/lib/services/r2-storage';
import {
  type ImageClassification,
  type VideoClassification,
  type AudioClassification,
  type ClassificationResult,
  type MediaType,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('Classification');
const validationLog = createLogger('StockValidation');

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
  } catch (_error) {
    log.error('JSON parse error. Content preview:', cleaned.substring(0, 500));
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

// ==========================================================================
// Watermark & Quality Functions (for Serper integration)
// ==========================================================================

export interface WatermarkCheckResult {
  /** Whether a watermark/logo/copyright overlay was detected */
  hasWatermark: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  /** Description of what was detected */
  details?: string;
}

export interface RelevanceCheckResult {
  /** Whether the image is relevant to the query */
  isRelevant: boolean;
  /** Relevance score 0-10 */
  score: number;
  /** Explanation of the relevance assessment */
  reason?: string;
}

const WATERMARK_DETECTION_PROMPT = `You are an expert at detecting watermarks, logos, and copyright overlays in images.

Analyze this image and determine if it contains any of the following:
- Visible watermarks (text overlays like "Shutterstock", "Getty", "iStock", etc.)
- Stock photo agency logos
- Copyright symbols or text (© or "Copyright")
- Semi-transparent overlays with branding
- Diagonal or repeated pattern watermarks
- "Sample" or "Preview" text

Return a JSON object with these exact fields:
{
  "hasWatermark": true/false,
  "confidence": 0.0 to 1.0 (how confident you are in your assessment),
  "details": "Description of any watermarks found, or 'No watermarks detected'"
}

Be thorough - stock photo watermarks can be subtle. If unsure, err on the side of detecting a watermark (higher confidence for hasWatermark).

Respond with valid JSON only, no markdown.`;

const RELEVANCE_CHECK_PROMPT = `You are an expert at assessing image relevance to search queries.

The user searched for: "{QUERY}"

Analyze this image and determine how well it matches the search intent. Consider:
- Does the image depict the main subject(s) of the query?
- Is the image content directly related to the search terms?
- Would this image be useful for someone searching for "{QUERY}"?

Return a JSON object with these exact fields:
{
  "isRelevant": true/false (is this image a good match for the query?),
  "score": 0-10 (how relevant is this image? 10 = perfect match, 0 = completely unrelated),
  "reason": "Brief explanation of the relevance assessment"
}

Scoring guide:
- 9-10: Perfect or near-perfect match to search intent
- 7-8: Good match, clearly related to the query
- 5-6: Somewhat relevant, tangentially related
- 3-4: Weak relevance, only loosely connected
- 1-2: Poor match, mostly unrelated
- 0: Completely unrelated

Respond with valid JSON only, no markdown.`;

/**
 * Check if an image contains watermarks, logos, or copyright overlays.
 * Uses Gemini 3 Flash for vision analysis.
 */
export async function checkImageForWatermark(
  imageUrl: string,
  userId: string
): Promise<WatermarkCheckResult> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: WATERMARK_DETECTION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Check this image for watermarks:' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] as any,
    },
  ];

  try {
    const response = await callOpenRouter(userId, messages, {
      ...CLASSIFICATION_CONFIG,
      maxTokens: 1024, // Shorter response needed
    });

    const result = parseJsonResponse<WatermarkCheckResult>(response.content);
    
    return {
      hasWatermark: result.hasWatermark ?? false,
      confidence: result.confidence ?? 0,
      details: result.details,
    };
  } catch (error) {
    log.warn('Watermark check error:', error instanceof Error ? error.message : error);
    // On error, assume no watermark but log for debugging
    return {
      hasWatermark: false,
      confidence: 0,
      details: 'Check failed - error during analysis',
    };
  }
}

/**
 * Check if an image is relevant to a search query.
 * Uses Gemini 3 Flash for vision analysis.
 */
export async function checkImageRelevance(
  imageUrl: string,
  searchQuery: string,
  userId: string
): Promise<RelevanceCheckResult> {
  const prompt = RELEVANCE_CHECK_PROMPT.replace(/\{QUERY\}/g, searchQuery);

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Is this image relevant to the search query "${searchQuery}"?` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] as any,
    },
  ];

  try {
    const response = await callOpenRouter(userId, messages, {
      ...CLASSIFICATION_CONFIG,
      maxTokens: 1024, // Shorter response needed
    });

    const result = parseJsonResponse<RelevanceCheckResult>(response.content);
    
    return {
      isRelevant: result.isRelevant ?? (result.score >= 5),
      score: result.score ?? 5,
      reason: result.reason,
    };
  } catch (error) {
    log.warn('Relevance check error:', error instanceof Error ? error.message : error);
    // On error, assume relevant to avoid false rejections
    return {
      isRelevant: true,
      score: 5,
      reason: 'Check failed - error during analysis',
    };
  }
}

// ==========================================================================
// NSFW Detection (for Stock Media Director validation)
// ==========================================================================

export interface NSFWCheckResult {
  /** Whether the image contains NSFW content */
  isNSFW: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  /** Category of NSFW content if detected */
  category?: 'adult' | 'violence' | 'drugs' | 'other';
  /** Description of what was detected */
  details?: string;
}

export interface StockImageValidation {
  /** Whether the image is valid for use (no watermarks, no NSFW, relevant to shot) */
  isValid: boolean;
  /** Whether a watermark was detected */
  hasWatermark: boolean;
  /** Whether NSFW content was detected */
  isNSFW: boolean;
  /** Whether the image is relevant to the shot description */
  isRelevant: boolean;
  /** Relevance score 0-10 */
  relevanceScore?: number;
  /** Reason for invalidity if applicable */
  failureReason?: 'watermark' | 'nsfw' | 'irrelevant' | 'error';
  /** Details about the failure */
  details?: string;
}

// Prompt for comprehensive stock image validation
const COMPREHENSIVE_VALIDATION_PROMPT = `You are a visual quality expert validating stock images for documentary video production.

Analyze this image for THREE criteria:

1. **WATERMARKS**: Check for any watermarks, logos, or stock photo agency stamps (like Shutterstock, Getty, iStock, Adobe Stock, etc.)

2. **NSFW CONTENT**: Check for inappropriate content:
   - Adult/sexual content (nudity, explicit imagery)
   - Graphic violence (gore, injuries, violent acts)
   - Drug-related content
   - Other harmful content (hate symbols, disturbing imagery)

3. **RELEVANCE**: Does this image show the CORRECT SUBJECT?
{VIDEO_CONTEXT}
   
   Looking for: "{SHOT_DESCRIPTION}"
   
   IMPORTANT: For stock footage, the key question is SUBJECT IDENTITY:
   - Does this image show the correct person, place, thing, or concept?
   - Camera angle, composition, lighting, and artistic style are IRRELEVANT
     (post-production handles those — we just need the right subject)
   - Historical depictions are valid: paintings, sculptures, engravings, and
     artistic interpretations of historical figures/places all count as relevant
   - Be GENEROUS: if the image is reasonably connected to the subject, accept it
   - Only reject if the image is clearly about something completely different

Return a JSON object with these exact fields:
{
  "hasWatermark": true/false,
  "watermarkConfidence": 0.0 to 1.0,
  "watermarkDetails": "Description of watermark if found",
  
  "isNSFW": true/false,
  "nsfwCategory": "adult" | "violence" | "drugs" | "other" | null,
  "nsfwDetails": "Description of NSFW content if found",
  
  "isRelevant": true/false,
  "relevanceScore": 0 to 10 (10 = exact subject match, 7+ = clearly the right subject, 5-6 = related but not ideal, below 5 = wrong subject),
  "whatImageShows": "Brief description of what the image actually shows",
  "relevanceReason": "Why it matches or doesn't match the requested subject"
}

Respond with valid JSON only, no markdown.`;

const NSFW_DETECTION_PROMPT = `You are a content safety expert. Analyze this image for inappropriate content.

Determine if the image contains any of the following:
- Adult/sexual content (nudity, explicit imagery, suggestive content)
- Graphic violence (gore, injuries, violent acts)
- Drug-related content (drug use, paraphernalia)
- Other harmful content (hate symbols, self-harm, disturbing imagery)

Return a JSON object with these exact fields:
{
  "isNSFW": true/false,
  "confidence": 0.0 to 1.0 (how confident you are),
  "category": "adult" | "violence" | "drugs" | "other" | null,
  "details": "Brief description of what was found, or 'Image is safe'"
}

Be thorough but reasonable - professional stock photography in business/educational contexts is acceptable.
Err on the side of caution for clearly inappropriate content.

Respond with valid JSON only, no markdown.`;

/**
 * Check if an image contains NSFW content.
 * Uses Gemini 3 Flash for vision analysis.
 */
export async function checkImageForNSFW(
  imageUrl: string,
  userId: string
): Promise<NSFWCheckResult> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: NSFW_DETECTION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Check this image for inappropriate content:' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] as any,
    },
  ];

  try {
    const response = await callOpenRouter(userId, messages, {
      ...CLASSIFICATION_CONFIG,
      maxTokens: 1024,
    });

    const result = parseJsonResponse<NSFWCheckResult>(response.content);
    
    return {
      isNSFW: result.isNSFW ?? false,
      confidence: result.confidence ?? 0,
      category: result.category,
      details: result.details,
    };
  } catch (error) {
    log.warn('NSFW check error:', error instanceof Error ? error.message : error);
    // On error, assume safe to avoid false rejections
    return {
      isNSFW: false,
      confidence: 0,
      details: 'Check failed - error during analysis',
    };
  }
}

// ==========================================================================
// Pre-Storage Classification (Combined Classification + Validation)
// ==========================================================================

/**
 * Configuration for pre-storage classification.
 * Set ENABLE_STOCK_CLASSIFICATION=false in env to disable AI classification.
 */
export const STOCK_CLASSIFICATION_CONFIG = {
  /** Whether classification is enabled (default: true) */
  enabled: process.env.ENABLE_STOCK_CLASSIFICATION !== 'false',
  
  /** Minimum quality score to accept an image (1-10) */
  minQualityScore: 5,
  
  /** Minimum resolution quality score (1-10) based on dimensions */
  minResolutionScore: 4,
  
  /** Reject generic stock photos (posed actors, obviously staged) */
  rejectGenericStockPhotos: true,
};

/**
 * Result of pre-storage classification.
 * Contains validation, classification, and embedding data in one response.
 */
export interface PreStorageClassification {
  // ===== Validation =====
  /** Whether the image passed all validation checks */
  isValid: boolean;
  /** Reason for rejection if not valid */
  rejectionReason?: 'watermark' | 'nsfw' | 'low_quality' | 'generic_stock' | 'error';
  /** Human-readable rejection details */
  rejectionDetails?: string;
  
  // ===== Content Flags =====
  /** Whether watermark was detected */
  hasWatermark: boolean;
  watermarkDetails?: string;
  
  /** Whether NSFW content was detected */
  isNSFW: boolean;
  nsfwDetails?: string;
  
  /** Whether this is a generic posed stock photo */
  isGenericStockPhoto: boolean;
  
  // ===== Quality Scores =====
  /** Overall content quality (composition, lighting, focus) - 1-10 */
  qualityScore: number;
  /** Resolution quality based on image dimensions - 1-10 */
  resolutionScore: number;
  
  // ===== Classification Data =====
  /** Detailed visual description for search */
  description: string;
  /** General subject categories */
  subjects: string[];
  /** Specific named entities (people, places, events) */
  namedEntities: string[];
  
  // ===== Embedding =====
  /** Pre-built text for embedding generation (entities + description) */
  embeddingText: string;
}

const PRE_STORAGE_CLASSIFICATION_PROMPT = `You are an expert stock media analyst. Analyze this image for documentary/video production.

Your job is to:
1. VALIDATE the image (check for problems)
2. CLASSIFY the image (describe what's in it)
3. EXTRACT named entities (specific people, places, events)

Return a JSON object with these exact fields:
{
  "description": "Detailed visual description (2-3 sentences). BE SPECIFIC about who/what/where is shown.",
  
  "namedEntities": ["List specific people by name, specific places, buildings, events, organizations. Example: ['Martin Luther King Jr.', 'Lincoln Memorial', 'March on Washington']"],
  
  "subjects": ["General categories like 'civil rights speech', 'historical photograph', 'business meeting'"],
  
  "hasWatermark": true/false,
  "watermarkDetails": "Description of watermark if found (Getty, Shutterstock, iStock, etc.), or null",
  
  "isNSFW": true/false,
  "nsfwDetails": "Description of NSFW content if found, or null",
  
  "qualityScore": 1-10 (based on sharpness, composition, lighting, professional quality),
  
  "isGenericStockPhoto": true/false
}

CRITICAL - Named Entities:
- If you recognize a specific person (politician, celebrity, historical figure), name them
- If you see a specific landmark or building, name it
- If this is a specific historical event, name it
- These are CRUCIAL for search matching

Quality Score Guide:
- 9-10: Professional quality, excellent composition
- 7-8: High quality, minor imperfections
- 5-6: Decent quality, usable
- 3-4: Low quality, blurry or poor composition  
- 1-2: Very poor quality, not usable

isGenericStockPhoto = TRUE if:
- Obviously posed business people in a studio
- Stock photo actors with fake smiles
- Staged scenes with models
- NOT real people, events, or documentary content

isGenericStockPhoto = FALSE if:
- Real archival/historical photographs
- Documentary footage screenshots
- News photography
- Real people at real events

Respond with valid JSON only, no markdown.`;

/**
 * Classify and validate an image BEFORE storing it.
 * Combines watermark/NSFW detection with semantic classification in ONE API call.
 * 
 * This should be called before storing any Serper image to:
 * 1. Reject watermarked/NSFW/low-quality images
 * 2. Generate rich classification data for embedding
 * 
 * @param imageUrl - URL or base64 data URL of the image
 * @param userId - User ID for API calls
 * @param width - Optional image width for resolution scoring
 * @param height - Optional image height for resolution scoring
 * @returns Classification result with validation status
 */
export async function classifyAndValidateImage(
  imageUrl: string,
  userId: string,
  width?: number,
  height?: number
): Promise<PreStorageClassification> {
  // Check if classification is disabled
  if (!STOCK_CLASSIFICATION_CONFIG.enabled) {
    log.debug('Skipped - classification disabled');
    return {
      isValid: true,
      hasWatermark: false,
      isNSFW: false,
      isGenericStockPhoto: false,
      qualityScore: 7,
      resolutionScore: 7,
      description: 'Classification disabled',
      subjects: [],
      namedEntities: [],
      embeddingText: '',
    };
  }

  // Calculate resolution score based on dimensions
  let resolutionScore = 7; // Default if dimensions not provided
  if (width && height) {
    const pixels = width * height;
    if (pixels >= 4000000) resolutionScore = 10;      // 4MP+
    else if (pixels >= 2000000) resolutionScore = 9;  // 2MP+
    else if (pixels >= 1000000) resolutionScore = 8;  // 1MP+
    else if (pixels >= 500000) resolutionScore = 6;   // 0.5MP+
    else if (pixels >= 250000) resolutionScore = 5;   // 0.25MP+
    else resolutionScore = 3;                          // Low res
  }

  // Reject immediately if resolution is too low
  if (resolutionScore < STOCK_CLASSIFICATION_CONFIG.minResolutionScore) {
    log.debug(`Rejected - low resolution (score: ${resolutionScore})`);
    return {
      isValid: false,
      rejectionReason: 'low_quality',
      rejectionDetails: `Image resolution too low (${width}x${height})`,
      hasWatermark: false,
      isNSFW: false,
      isGenericStockPhoto: false,
      qualityScore: 0,
      resolutionScore,
      description: '',
      subjects: [],
      namedEntities: [],
      embeddingText: '',
    };
  }

  try {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: PRE_STORAGE_CLASSIFICATION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this image:' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ] as any,
      },
    ];

    const response = await callOpenRouter(userId, messages, {
      ...CLASSIFICATION_CONFIG,
      maxTokens: 65536,
    });

    const result = parseJsonResponse<{
      description: string;
      namedEntities: string[];
      subjects: string[];
      hasWatermark: boolean;
      watermarkDetails?: string;
      isNSFW: boolean;
      nsfwDetails?: string;
      qualityScore: number;
      isGenericStockPhoto: boolean;
    }>(response.content);

    const qualityScore = result.qualityScore || 5;

    // Build embedding text: entities first, then description
    const embeddingParts: string[] = [];
    if (result.namedEntities && result.namedEntities.length > 0) {
      embeddingParts.push(result.namedEntities.join(', '));
    }
    if (result.subjects && result.subjects.length > 0) {
      embeddingParts.push(result.subjects.join(', '));
    }
    if (result.description) {
      embeddingParts.push(result.description);
    }
    const embeddingText = embeddingParts.join('. ');

    // Check for rejection reasons
    if (result.hasWatermark) {
      log.debug(`Rejected - watermark detected: ${result.watermarkDetails}`);
      return {
        isValid: false,
        rejectionReason: 'watermark',
        rejectionDetails: result.watermarkDetails || 'Watermark detected',
        hasWatermark: true,
        watermarkDetails: result.watermarkDetails,
        isNSFW: result.isNSFW,
        nsfwDetails: result.nsfwDetails,
        isGenericStockPhoto: result.isGenericStockPhoto,
        qualityScore,
        resolutionScore,
        description: result.description || '',
        subjects: result.subjects || [],
        namedEntities: result.namedEntities || [],
        embeddingText,
      };
    }

    if (result.isNSFW) {
      log.debug(`Rejected - NSFW content: ${result.nsfwDetails}`);
      return {
        isValid: false,
        rejectionReason: 'nsfw',
        rejectionDetails: result.nsfwDetails || 'NSFW content detected',
        hasWatermark: result.hasWatermark,
        watermarkDetails: result.watermarkDetails,
        isNSFW: true,
        nsfwDetails: result.nsfwDetails,
        isGenericStockPhoto: result.isGenericStockPhoto,
        qualityScore,
        resolutionScore,
        description: result.description || '',
        subjects: result.subjects || [],
        namedEntities: result.namedEntities || [],
        embeddingText,
      };
    }

    if (qualityScore < STOCK_CLASSIFICATION_CONFIG.minQualityScore) {
      log.debug(`Rejected - low quality (score: ${qualityScore})`);
      return {
        isValid: false,
        rejectionReason: 'low_quality',
        rejectionDetails: `Quality score ${qualityScore}/10 below threshold`,
        hasWatermark: result.hasWatermark,
        watermarkDetails: result.watermarkDetails,
        isNSFW: result.isNSFW,
        nsfwDetails: result.nsfwDetails,
        isGenericStockPhoto: result.isGenericStockPhoto,
        qualityScore,
        resolutionScore,
        description: result.description || '',
        subjects: result.subjects || [],
        namedEntities: result.namedEntities || [],
        embeddingText,
      };
    }

    if (STOCK_CLASSIFICATION_CONFIG.rejectGenericStockPhotos && result.isGenericStockPhoto) {
      log.debug('Rejected - generic stock photo');
      return {
        isValid: false,
        rejectionReason: 'generic_stock',
        rejectionDetails: 'Generic posed stock photo, not documentary content',
        hasWatermark: result.hasWatermark,
        watermarkDetails: result.watermarkDetails,
        isNSFW: result.isNSFW,
        nsfwDetails: result.nsfwDetails,
        isGenericStockPhoto: true,
        qualityScore,
        resolutionScore,
        description: result.description || '',
        subjects: result.subjects || [],
        namedEntities: result.namedEntities || [],
        embeddingText,
      };
    }

    // All checks passed
    log.debug(`Accepted - ${result.namedEntities?.length || 0} entities, quality: ${qualityScore}/10`);
    return {
      isValid: true,
      hasWatermark: false,
      watermarkDetails: undefined,
      isNSFW: false,
      nsfwDetails: undefined,
      isGenericStockPhoto: result.isGenericStockPhoto,
      qualityScore,
      resolutionScore,
      description: result.description || '',
      subjects: result.subjects || [],
      namedEntities: result.namedEntities || [],
      embeddingText,
    };

  } catch (error) {
    log.error('Classification error:', error instanceof Error ? error.message : error);
    // On error, reject to be safe
    return {
      isValid: false,
      rejectionReason: 'error',
      rejectionDetails: error instanceof Error ? error.message : 'Classification failed',
      hasWatermark: false,
      isNSFW: false,
      isGenericStockPhoto: false,
      qualityScore: 0,
      resolutionScore,
      description: '',
      subjects: [],
      namedEntities: [],
      embeddingText: '',
    };
  }
}

/**
 * Validate a stock image for use in video production.
 * Checks for watermarks, NSFW content, AND relevance to the shot.
 * Used by StockMediaDirector for lazy validation before returning matches.
 * 
 * @param imageUrl - URL of the image to validate (fallback if r2Key not provided)
 * @param userId - User ID for API calls  
 * @param shotDescription - Description of what the shot needs (for relevance check)
 * @param r2Key - Optional R2 storage key - if provided, fetches directly from R2 (bypasses CDN delays)
 * @param videoContext - Optional video context for holistic relevance decisions
 * @returns Validation result with details
 */
export async function validateStockImage(
  imageUrl: string,
  userId: string,
  shotDescription?: string,
  r2Key?: string,
  videoContext?: {
    /** Overall video topic/title */
    videoTopic?: string;
    /** Main spine beats/sections */
    spineBeats?: string[];
  }
): Promise<StockImageValidation> {
  // Determine the image URL to use for validation
  // If r2Key is provided, fetch directly from R2 as base64 to bypass CDN propagation delays
  let validationImageUrl = imageUrl;
  
  if (r2Key) {
    try {
      validationImageUrl = await getFileAsBase64(r2Key);
      // Log diagnostic info for debugging image validation issues
      const base64SizeKB = Math.round(validationImageUrl.length / 1024);
      const mimeMatch = validationImageUrl.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
      validationLog.debug(`Image loaded: ${r2Key} (${mimeType}, ${base64SizeKB}KB base64)`);
      
      // Reject corrupted/blocked images that are too small
      // Real images should be at least 5KB base64 (about 3.75KB actual data)
      if (base64SizeKB < 5) {
        validationLog.debug(`Rejecting corrupted image ${r2Key} - only ${base64SizeKB}KB (blocked download)`);
        return {
          isValid: false,
          hasWatermark: false,
          isNSFW: false,
          isRelevant: false,
          failureReason: 'error',
          details: `Corrupted image (${base64SizeKB}KB) - likely a blocked download`,
        };
      }
      
      // Warn about very large images
      if (base64SizeKB > 4000) {
        validationLog.warn(`Very large image ${base64SizeKB}KB - may cause issues`);
      }
    } catch (fetchError) {
      // R2 fetch failed - file was likely deleted by another parallel shot's validation
      // Do NOT fall back to CDN URL as this causes 404 errors in OpenRouter
      // Log one-liner only, not the full AWS SDK stack trace
      const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      const shortErr = errMsg.includes('NoSuchKey') ? 'NoSuchKey' : errMsg.substring(0, 80);
      validationLog.warn(`R2 fetch failed for ${r2Key} (${shortErr})`);
      return {
        isValid: false,
        hasWatermark: false,
        isNSFW: false,
        isRelevant: false,
        failureReason: 'error' as const,
        details: 'Image no longer exists in storage (deleted by parallel validation)',
      };
    }
  }

  // If no shot description provided, fall back to basic validation
  if (!shotDescription) {
    // Run basic checks in parallel
    const [watermarkResult, nsfwResult] = await Promise.all([
      checkImageForWatermark(validationImageUrl, userId),
      checkImageForNSFW(validationImageUrl, userId),
    ]);

    const hasWatermark = watermarkResult.hasWatermark && watermarkResult.confidence > 0.7;
    const isNSFW = nsfwResult.isNSFW;

    if (hasWatermark) {
      return {
        isValid: false,
        hasWatermark: true,
        isNSFW,
        isRelevant: true, // Assume relevant if no description
        failureReason: 'watermark',
        details: watermarkResult.details,
      };
    }

    if (isNSFW) {
      return {
        isValid: false,
        hasWatermark,
        isNSFW: true,
        isRelevant: true,
        failureReason: 'nsfw',
        details: nsfwResult.details,
      };
    }

    return {
      isValid: true,
      hasWatermark: false,
      isNSFW: false,
      isRelevant: true,
    };
  }

  // COMPREHENSIVE VALIDATION with relevance check
  // Build video context section if provided
  let videoContextSection = '';
  if (videoContext?.videoTopic || (videoContext?.spineBeats && videoContext.spineBeats.length > 0)) {
    videoContextSection = '   **VIDEO CONTEXT** (use this to understand overall story relevance):\n';
    if (videoContext.videoTopic) {
      videoContextSection += `   - Video Topic: "${videoContext.videoTopic}"\n`;
    }
    if (videoContext.spineBeats && videoContext.spineBeats.length > 0) {
      videoContextSection += `   - Story Beats: ${videoContext.spineBeats.slice(0, 5).join(', ')}\n`;
    }
  }
  
  const prompt = COMPREHENSIVE_VALIDATION_PROMPT
    .replace('{VIDEO_CONTEXT}', videoContextSection)
    .replace('{SHOT_DESCRIPTION}', shotDescription);


  const messages: OpenRouterMessage[] = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Validate this image for use in the shot: "${shotDescription}"` },
        { type: 'image_url', image_url: { url: validationImageUrl } },
      ] as any,
    },
  ];

  try {
    const response = await callOpenRouter(userId, messages, {
      ...CLASSIFICATION_CONFIG,
      maxTokens: 1024,
    });

    const result = parseJsonResponse<{
      hasWatermark: boolean;
      watermarkConfidence: number;
      watermarkDetails?: string;
      isNSFW: boolean;
      nsfwCategory?: string;
      nsfwDetails?: string;
      isRelevant: boolean;
      relevanceScore: number;
      whatImageShows?: string;
      relevanceReason?: string;
    }>(response.content);

    // Check watermark (reject if confidence > 0.7)
    const hasWatermark = result.hasWatermark && result.watermarkConfidence > 0.7;
    const isNSFW = result.isNSFW;
    const isRelevant = result.isRelevant && result.relevanceScore >= 5; // Require 5+ (subject identity, not cinematic match)

    validationLog.debug(`Image analysis: watermark=${hasWatermark}, nsfw=${isNSFW}, relevant=${isRelevant} (${result.relevanceScore}/10)`);
    validationLog.debug(`What image shows: ${result.whatImageShows}`);
    validationLog.debug(`Relevance reason: ${result.relevanceReason}`);

    // Priority: watermark > nsfw > relevance
    if (hasWatermark) {
      return {
        isValid: false,
        hasWatermark: true,
        isNSFW,
        isRelevant,
        relevanceScore: result.relevanceScore,
        failureReason: 'watermark',
        details: result.watermarkDetails || 'Watermark detected',
      };
    }

    if (isNSFW) {
      return {
        isValid: false,
        hasWatermark,
        isNSFW: true,
        isRelevant,
        relevanceScore: result.relevanceScore,
        failureReason: 'nsfw',
        details: result.nsfwDetails || 'NSFW content detected',
      };
    }

    if (!isRelevant) {
      return {
        isValid: false,
        hasWatermark,
        isNSFW,
        isRelevant: false,
        relevanceScore: result.relevanceScore,
        failureReason: 'irrelevant',
        details: `Image shows "${result.whatImageShows}" but shot needs "${shotDescription}". ${result.relevanceReason}`,
      };
    }

    return {
      isValid: true,
      hasWatermark: false,
      isNSFW: false,
      isRelevant: true,
      relevanceScore: result.relevanceScore,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    validationLog.warn('Validation error:', errorMessage);
    
    // Check if this is an "invalid image" error from Google - try CDN URL fallback
    const isInvalidImageError = errorMessage.includes('image is not valid') || 
      errorMessage.includes('Unable to process input image') ||
      errorMessage.includes('INVALID_ARGUMENT');
    
    // If we used base64 and got invalid image error, try CDN URL as fallback
    if (isInvalidImageError && r2Key && validationImageUrl !== imageUrl) {
      validationLog.debug(`Base64 failed, retrying with CDN URL: ${imageUrl}`);
      try {
        // Retry with CDN URL
        const cdnMessages: OpenRouterMessage[] = [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Validate this image for use in the shot: "${shotDescription}"` },
              { type: 'image_url', image_url: { url: imageUrl } },
            ] as any,
          },
        ];
        
        const cdnResponse = await callOpenRouter(userId, cdnMessages, {
          ...CLASSIFICATION_CONFIG,
          maxTokens: 1024,
        });
        
        const cdnResult = parseJsonResponse<{
          hasWatermark: boolean;
          watermarkConfidence: number;
          watermarkDetails?: string;
          isNSFW: boolean;
          nsfwCategory?: string;
          nsfwDetails?: string;
          isRelevant: boolean;
          relevanceScore: number;
          whatImageShows?: string;
          relevanceReason?: string;
        }>(cdnResponse.content);
        
        if (!cdnResult) {
          throw new Error('Failed to parse CDN validation response');
        }
        
        // Log the CDN result
        validationLog.debug(`CDN fallback success: watermark=${cdnResult.hasWatermark}, nsfw=${cdnResult.isNSFW}, relevant=${cdnResult.isRelevant} (${cdnResult.relevanceScore}/10)`);
        
        const hasWatermark = cdnResult.hasWatermark && cdnResult.watermarkConfidence > 0.7;
        const isNSFW = cdnResult.isNSFW;
        const isRelevant = cdnResult.isRelevant && cdnResult.relevanceScore >= 7;

        if (hasWatermark) {
          return {
            isValid: false,
            hasWatermark: true,
            isNSFW,
            isRelevant,
            relevanceScore: cdnResult.relevanceScore,
            failureReason: 'watermark',
            details: cdnResult.watermarkDetails || 'Watermark detected',
          };
        }

        if (isNSFW) {
          return {
            isValid: false,
            hasWatermark,
            isNSFW: true,
            isRelevant,
            relevanceScore: cdnResult.relevanceScore,
            failureReason: 'nsfw',
            details: cdnResult.nsfwDetails || 'NSFW content detected',
          };
        }

        if (!isRelevant) {
          return {
            isValid: false,
            hasWatermark,
            isNSFW,
            isRelevant: false,
            relevanceScore: cdnResult.relevanceScore,
            failureReason: 'irrelevant',
            details: `Image shows "${cdnResult.whatImageShows}" but shot needs "${shotDescription}". ${cdnResult.relevanceReason}`,
          };
        }

        return {
          isValid: true,
          hasWatermark: false,
          isNSFW: false,
          isRelevant: true,
          relevanceScore: cdnResult.relevanceScore,
        };
      } catch (cdnError) {
        validationLog.warn('CDN fallback also failed:', cdnError instanceof Error ? cdnError.message : cdnError);
        // Fall through to error return below
      }
    }
    
    // On error, mark as error (not irrelevant) so the image is NOT deleted
    // This prevents race conditions where parallel validations delete images
    return {
      isValid: false,
      hasWatermark: false,
      isNSFW: false,
      isRelevant: false,
      failureReason: 'error',
      details: 'Validation failed - error during analysis',
    };
  }
}

