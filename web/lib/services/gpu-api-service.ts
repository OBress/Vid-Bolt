/**
 * GPU API Service
 * ============================================================================
 * Service layer for communicating with the GPU backend API.
 * All requests are authenticated with X-API-Key header.
 *
 * API Base URL: http://localhost:8000 (configurable via GPU_API_URL env var)
 */

// ============================================================================
// TYPES - Matching the API Documentation
// ============================================================================

export type AspectRatio = "16:9" | "9:16";
export type FPS = 8 | 12 | 16 | 24 | 30;
export type VramMode =
  | "image_generation"
  | "image_editing"
  | "video_generation"
  | "audio_creation"
  | "segmentation"
  | "all";

// ============================================================================
// RESOLUTION UTILITIES
// ============================================================================

/**
 * Get standard image dimensions for a given aspect ratio (standalone images / motiongraphics).
 * Uses standard HD resolutions (not constrained to 32-divisible).
 */
export function getImageDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16': return { width: 1080, height: 1920 };
    case '16:9':
    default:     return { width: 1920, height: 1080 };
  }
}

/**
 * Get video-compatible dimensions for a given aspect ratio (keyframe images for LTX-2.3).
 * LTX-2.3 requires dimensions divisible by 32; standard 1080p height (1080) is NOT divisible
 * by 32, so we round up to 1088.
 */
export function getVideoDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16': return { width: 1088, height: 1920 };
    case '16:9':
    default:     return { width: 1920, height: 1088 };
  }
}

/** Request body for POST /api/v1/image/generate */
export interface ImageGenerateRequest {
  job_id: string;
  prompt: string;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  num_inference_steps?: number;
  lora_name?: string;
  save_url: string;
  /** REQUIRED: URL to POST when complete */
  webhook_url?: string;
  /** Optional: Client identifier returned in webhook */
  item_id?: string;
  /** Optional: HMAC signing secret */
  webhook_secret?: string;
}

/** Request body for POST /api/v1/image/edit */
export interface ImageEditRequest {
  job_id: string;
  input_image_url: string;
  prompt: string;
  aspect_ratio?: AspectRatio;
  mask_image_url?: string;
  seed?: number;
  save_url: string;
  /** REQUIRED: URL to POST when complete */
  webhook_url?: string;
  /** Optional: Client identifier returned in webhook */
  item_id?: string;
  /** Optional: HMAC signing secret */
  webhook_secret?: string;
  /** Optional: LoRA to apply (e.g., 'multiple-angles' for 96 camera positions) */
  lora_name?: string;
  /** LoRA strength (0.0-1.0), default 0.9 when LoRA is specified */
  lora_strength?: number;
}

/** Request body for POST /api/v1/video/generate */
export interface VideoGenerateRequest {
  job_id: string;
  input_image_url: string;
  prompt: string;
  duration_seconds?: number;
  fps?: FPS;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  end_image_url?: string;
  save_url: string;
  /** REQUIRED: URL to POST when complete */
  webhook_url?: string;
  /** Optional: Client identifier returned in webhook */
  item_id?: string;
  /** Optional: HMAC signing secret */
  webhook_secret?: string;
}

/** Request body for POST /api/v1/music/generate */
export interface MusicGenerateRequest {
  job_id: string;
  prompt: string;
  /** Optional lyrics for vocal generation. Omit entirely for instrumental background music. */
  lyrics?: string | string[];
  /** Duration in seconds (10-600), default 30 */
  duration_seconds?: number;
  seed?: number;
  /** Beats per minute (30-300). Omit for auto-detection via LM. */
  bpm?: number;
  /** Musical key (e.g. "C Major", "Am", "F# minor"). Omit for auto-detection. */
  key_scale?: string;
  /** Time signature: "2" (2/4), "3" (3/4), "4" (4/4), "6" (6/8). Omit for auto-detection. */
  time_signature?: string;
  /** Language code for vocals (ISO 639-1). Use "unknown" for auto-detection or instrumental. */
  vocal_language?: string;
  save_url: string;
  webhook_url?: string;
  item_id?: string;
  webhook_secret?: string;
}

/** Request body for POST /api/v1/sfx/generate */
export interface SoundEffectGenerateRequest {
  job_id: string;
  prompt: string;
  /** Duration in seconds (1-30), default 5 */
  duration_seconds?: number;
  seed?: number;
  save_url: string;
  webhook_url?: string;
  item_id?: string;
  webhook_secret?: string;
}

export interface SegmentPromptObject {
  label: string;
  text: string;
}

export interface SegmentAnimationConfig {
  mode?: "transition" | "draw" | "pulse" | "reveal" | "loop" | "stagger";
  start?: Record<string, number | number[]>;
  end?: Record<string, number | number[]>;
  easing?:
    | "linear"
    | "ease_in"
    | "ease_out"
    | "ease_in_out"
    | "ease_in_cubic"
    | "ease_out_cubic"
    | "ease_in_out_cubic"
    | "ease_out_back"
    | "ease_out_elastic"
    | "ease_out_bounce";
  delay?: number;
  duration?: number;
  cycles?: number;
  direction?: "left" | "right" | "top" | "bottom" | "radial";
  stagger_delay?: number;
}

/** Composable visual operation for the segmentation effects pipeline. */
export interface SegmentOperation {
  type:
    | "select"
    | "blur"
    | "pixelate"
    | "redact"
    | "color_overlay"
    | "color_grade"
    | "opacity"
    | "replace_color"
    | "remove_background"
    | "replace_background"
    | "greenscreen"
    | "outline"
    | "bounding_box"
    | "spotlight"
    | "bokeh"
    | "glow"
    | "shadow"
    | "vignette"
    | "grayscale"
    | "invert"
    | "sharpen"
    | "sepia"
    | "posterize"
    | "edge_detect"
    | "emboss"
    | "noise"
    | "sketch"
    | "duotone"
    | "halftone"
    | "glitch"
    | "motion_blur"
    | "glass"
    | "feather"
    | "zoom"
    | "pan";
  animation?: SegmentAnimationConfig;
  target?: "mask" | "background" | "all" | "center" | number[];
  object_index?: number;
  object_label?: string;
  object_labels?: string[];
  object_id?: number;
  object_ids?: number[];
  strength?: number;
  block_size?: number;
  color?: number[];
  brightness?: number;
  contrast?: number;
  saturation?: number;
  value?: number;
  hue_shift?: number;
  saturation_scale?: number;
  image_url?: string;
  thickness?: number;
  progress?: number;
  darkness?: number;
  radius?: number;
  intensity?: number;
  offset?: number[];
  amount?: number;
  levels?: number;
  noise_type?: "gaussian" | "grain";
  detail?: number;
  color_dark?: number[];
  color_light?: number[];
  dot_size?: number;
  rgb_shift?: number;
  seed?: number;
  angle?: number;
  scale?: number;
}

export interface SegmentMetadata {
  object_count?: number;
  width?: number;
  height?: number;
  boxes?: number[][];
  scores?: number[];
  output_type?: "masks_json" | "image";
  output_format?: "masks_json" | "video";
  tracked_ids?: number[];
  frame_count?: number;
  duration_seconds?: number;
  fps?: number;
  model_version?: string;
  labels?: string[];
  prompt_to_obj_ids?: Record<string, number[]>;
  object_id_to_prompt_label?: Record<string, string>;
}

/** Request body for POST /api/v1/segment/image (v0.9.1) */
export interface ImageSegmentRequest {
  job_id: string;
  input_image_url: string;
  text_prompt?: string;
  point_prompts?: number[][];
  box_prompts?: number[][];
  box_prompts_labeled?: { box: number[]; label: boolean }[];
  object_prompts?: SegmentPromptObject[];
  confidence_threshold?: number;
  max_objects?: number;
  output_type?: "masks_json" | "image";
  operations?: SegmentOperation[];
  save_url: string;
  webhook_url?: string;
  item_id?: string;
  webhook_secret?: string;
}

/** Request body for POST /api/v1/segment/video (v0.9.1) */
export interface VideoSegmentRequest {
  job_id: string;
  input_video_url: string;
  text_prompt?: string;
  text_prompts?: string[];
  point_prompts?: number[][];
  point_labels?: number[];
  box_prompts?: number[][];
  box_labels?: number[];
  object_prompts?: SegmentPromptObject[];
  prompt_frame_index?: number;
  propagation_direction?: "forward" | "backward" | "both";
  confidence_threshold?: number;
  include_tracking_metadata?: boolean;
  output_format?: "masks_json" | "video";
  operations?: SegmentOperation[];
  max_frames?: number;
  save_url: string;
  webhook_url?: string;
  item_id?: string;
  webhook_secret?: string;
}

export interface AnimateSegmentRequest {
  job_id: string;
  input_image_url: string;
  text_prompt?: string;
  point_prompts?: number[][];
  box_prompts?: number[][];
  box_prompts_labeled?: { box: number[]; label: boolean }[];
  object_prompts?: SegmentPromptObject[];
  confidence_threshold?: number;
  max_objects?: number;
  duration_seconds?: number;
  fps?: number;
  operations: SegmentOperation[];
  save_url: string;
  webhook_url?: string;
  item_id?: string;
  webhook_secret?: string;
}

/** Successful response from GPU API (legacy sync response) */
export interface GPUApiSuccessResponse {
  status: "completed";
  generation_time: number;
  save_url: string;
}

/** Async job accepted response (202 Accepted) */
export interface GPUApiAsyncJobResponse {
  job_id: string;
  status: "pending" | "processing" | "queued";
  status_url?: string;
  message: string;
}

/** Error response from GPU API */
export interface GPUApiErrorResponse {
  status: "failed";
  error_code: string;
  error_message: string;
}

export interface JobInfo {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error_message?: string;
  error_code?: string;
  result?: any;
  progress_percent?: number;
  progress_stage?: string;
  queue_position?: number;
}

export type GPUApiResponse =
  | GPUApiSuccessResponse
  | GPUApiAsyncJobResponse
  | GPUApiErrorResponse
  | JobInfo;

// ============================================================================
// CONFIGURATION
// ============================================================================

import { createClient } from "@supabase/supabase-js";

// Cache for the GPU API URL to avoid repeated DB calls
let cachedGpuApiUrl: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30000; // 30 second cache

/**
 * Get the GPU API URL from Supabase user_gcp_config (for dynamic cloud VMs)
 * Falls back to GPU_API_URL env var if no config found
 */
export async function fetchDynamicGpuApiUrl(_userId?: string): Promise<string> {
  // Return cached value if still valid
  if (cachedGpuApiUrl && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedGpuApiUrl;
  }

  // Check env var first as fallback
  const envUrl = process.env.GPU_API_URL;

  // If no Supabase connection details, use env var
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[GPUApiService] No Supabase env vars, using fallback: ${envUrl || 'http://localhost:8000'}`);
    return envUrl || "http://localhost:8000";
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get the first active GCP config with an external IP
    const { data, error } = await supabase
      .from("user_gcp_config")
      .select("external_ip, status")
      .eq("status", "RUNNING")
      .not("external_ip", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log(`[GPUApiService] DB query failed: ${error.message} (code: ${error.code}). Falling back to env: ${envUrl || 'http://localhost:8000'}`);
    } else if (!data?.external_ip) {
      // No RUNNING VM with IP found — log what IS in the table for debugging
      const { data: debugRow } = await supabase
        .from("user_gcp_config")
        .select("external_ip, status")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      console.log(`[GPUApiService] No RUNNING VM with external_ip found. Actual DB row: status=${debugRow?.status || 'NONE'}, ip=${debugRow?.external_ip || 'null'}. Falling back to env: ${envUrl || 'http://localhost:8000'}`);
    } else {
      cachedGpuApiUrl = `http://${data.external_ip}:8000`;
      cacheTimestamp = Date.now();
      console.log(`[GPUApiService] Using dynamic GPU URL: ${cachedGpuApiUrl} (status: ${data.status})`);
      return cachedGpuApiUrl;
    }
  } catch (_err) {
    console.log(`[GPUApiService] Exception in fetchDynamicGpuApiUrl: ${_err instanceof Error ? _err.message : _err}`);
  }

  // Fallback to env var
  return envUrl || "http://localhost:8000";
}

function getGpuApiUrl(): string {
  // Sync version for backwards compatibility - returns cached or env
  if (cachedGpuApiUrl && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedGpuApiUrl;
  }
  return process.env.GPU_API_URL || "http://localhost:8000";
}

function getGpuApiKey(): string {
  const key = process.env.GPU_API_KEY;
  if (!key) {
    throw new Error("GPU_API_KEY environment variable is not set");
  }
  return key;
}

// ============================================================================
// API CALL HELPER
// ============================================================================

// Throttle activity updates to avoid excessive DB writes (max once per 30 seconds)
let lastActivityUpdateTime = 0;
const ACTIVITY_UPDATE_THROTTLE_MS = 30000; // 30 seconds

/**
 * Updates the last_gpu_activity_at timestamp in user_gcp_config
 * Throttled to prevent excessive DB writes
 */
async function updateGpuActivity(): Promise<void> {
  const now = Date.now();
  if (now - lastActivityUpdateTime < ACTIVITY_UPDATE_THROTTLE_MS) {
    return; // Skip if we updated recently
  }
  
  lastActivityUpdateTime = now;
  
  try {
    // Use internal API endpoint to update activity
    // This is called from workers which don't have direct Supabase auth context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    // Get the first running GCP config and update its activity
    const { error } = await supabase
      .from("user_gcp_config")
      .update({ last_gpu_activity_at: new Date().toISOString() })
      .eq("status", "RUNNING");
    
    if (error) {
      console.log(`[GPUApiService] Failed to update activity: ${error.message}`);
    }
  } catch (_err) {
    // Don't fail the GPU call if activity tracking fails
    console.log(`[GPUApiService] Activity tracking error (non-fatal)`);
  }
}

/**
 * Force update the GPU activity timestamp (bypasses throttle).
 * Use this for significant user actions like VRAM mode changes that should
 * always reset the auto-shutdown timer.
 */
export async function forceUpdateGpuActivity(): Promise<void> {
  lastActivityUpdateTime = Date.now();
  
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    const { error } = await supabase
      .from("user_gcp_config")
      .update({ last_gpu_activity_at: new Date().toISOString() })
      .eq("status", "RUNNING");
    
    if (error) {
      console.log(`[GPUApiService] Failed to force update activity: ${error.message}`);
    } else {
      console.log(`[GPUApiService] Force updated GPU activity timestamp`);
    }
  } catch (_err) {
    console.log(`[GPUApiService] Force activity tracking error (non-fatal)`);
  }
}

async function callGpuApi<T>(
  endpoint: string,
  body: T
): Promise<{
  response: GPUApiResponse;
  rawRequest: T;
  rawResponse: unknown;
  statusCode: number;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  const url = `${baseUrl}${endpoint}`;

  console.log(`[GPUApiService] Calling ${url}`);
  // console.log(`[GPUApiService] Request body:`, JSON.stringify(body, null, 2));

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    console.log(`[GPUApiService] ${endpoint} returned ${response.status}`);

    const data = await response.json();
    const duration = Date.now() - startTime;

    console.log(
      `[GPUApiService] Response (${duration}ms):`,
      JSON.stringify(data, null, 2)
    );

    // Track GPU activity for auto-shutdown timer (throttled, non-blocking)
    updateGpuActivity().catch(() => {});

    return {
      response: data as GPUApiResponse,
      rawRequest: body,
      rawResponse: data,
      statusCode: response.status,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[GPUApiService] Request failed after ${duration}ms:`, error);

    return {
      response: {
        status: "failed",
        error_code: "NETWORK_ERROR",
        error_message:
          error instanceof Error ? error.message : "Network request failed",
      },
      rawRequest: body,
      rawResponse: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      statusCode: 0,
    };
  }
}

// ============================================================================
// IMAGE GENERATION
// ============================================================================

export interface ImageGenerateResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: ImageGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Generate an image via the GPU API.
 *
 * @param request - Image generation request matching API spec
 * @returns Result with success status, URL, and debug info
 */
export async function callGpuImageGenerate(
  request: ImageGenerateRequest
): Promise<ImageGenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/image/generate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    return {
      success: true,
      publicUrl: (response as GPUApiSuccessResponse).save_url,
      generationTime: (response as GPUApiSuccessResponse).generation_time,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted) - treat as success with async flag
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      generationTime: undefined,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// IMAGE EDITING
// ============================================================================

export interface ImageEditResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: ImageEditRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Edit an image via the GPU API.
 *
 * @param request - Image edit request matching API spec
 * @returns Result with success status, URL, and debug info
 */
/**
 * Edit an image via the GPU API.
 *
 * @param request - Image edit request matching API spec
 * @returns Result with success status, URL, and debug info
 */
export async function callGpuImageEdit(
  request: ImageEditRequest
): Promise<ImageEditResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/image/edit",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    return {
      success: true,
      publicUrl: (response as GPUApiSuccessResponse).save_url,
      generationTime: (response as GPUApiSuccessResponse).generation_time,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted) - treat as success with async flag
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      generationTime: undefined,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// VIDEO GENERATION
// ============================================================================

export interface VideoGenerateResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: VideoGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Generate a video via the GPU API.
 *
 * @param request - Video generation request matching API spec
 * @returns Result with success status, URL, and debug info
 */
/**
 * Generate a video via the GPU API.
 *
 * @param request - Video generation request matching API spec
 * @returns Result with success status, URL, and debug info
 */
export async function callGpuVideoGenerate(
  request: VideoGenerateRequest
): Promise<VideoGenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/video/generate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    return {
      success: true,
      publicUrl: (response as GPUApiSuccessResponse).save_url,
      generationTime: (response as GPUApiSuccessResponse).generation_time,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted) - treat as success with async flag
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      generationTime: undefined,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// MUSIC GENERATION
// ============================================================================

export interface MusicGenerateResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: MusicGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Generate music via the GPU API using ACE-Step 1.5.
 *
 * @param request - Music generation request matching API spec
 * @returns Result with success status, URL, and debug info
 */
export async function callGpuMusicGenerate(
  request: MusicGenerateRequest
): Promise<MusicGenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/music/generate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    return {
      success: true,
      publicUrl: (response as GPUApiSuccessResponse).save_url,
      generationTime: (response as GPUApiSuccessResponse).generation_time,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted) - treat as success with async flag
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing" || response.status === "queued")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      generationTime: undefined,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// SOUND EFFECT GENERATION
// ============================================================================

export interface SoundEffectGenerateResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: SoundEffectGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Generate a sound effect via the GPU API using AudioGen.
 *
 * @param request - Sound effect generation request matching API spec
 * @returns Result with success status, URL, and debug info
 */
export async function callGpuSoundEffectGenerate(
  request: SoundEffectGenerateRequest
): Promise<SoundEffectGenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/sfx/generate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    return {
      success: true,
      publicUrl: (response as GPUApiSuccessResponse).save_url,
      generationTime: (response as GPUApiSuccessResponse).generation_time,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted) - treat as success with async flag
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing" || response.status === "queued")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      generationTime: undefined,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// IMAGE SEGMENTATION
// ============================================================================

export interface ImageSegmentResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  objectCount?: number;
  width?: number;
  height?: number;
  boxes?: number[][];
  scores?: number[];
  outputType?: "masks_json" | "image";
  modelVersion?: string;
  labels?: string[];
  promptToObjectIds?: Record<string, number[]>;
  objectIdToPromptLabel?: Record<string, string>;
  metadata?: SegmentMetadata;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: ImageSegmentRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Segment objects in an image via the GPU API using SAM 3.
 */
export async function callGpuImageSegment(
  request: ImageSegmentRequest
): Promise<ImageSegmentResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/segment/image",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    const successResp = response as GPUApiSuccessResponse;
    const metadata = getSegmentMetadata(rawResponse);
    return {
      success: true,
      publicUrl: successResp.save_url,
      generationTime: successResp.generation_time,
      objectCount: metadata?.object_count,
      width: metadata?.width,
      height: metadata?.height,
      boxes: metadata?.boxes,
      scores: metadata?.scores,
      outputType: metadata?.output_type,
      modelVersion: metadata?.model_version,
      labels: metadata?.labels,
      promptToObjectIds: metadata?.prompt_to_obj_ids,
      objectIdToPromptLabel: metadata?.object_id_to_prompt_label,
      metadata,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted)
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing" || response.status === "queued")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// VIDEO SEGMENTATION / OBJECT TRACKING
// ============================================================================

export interface VideoSegmentResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  frameCount?: number;
  objectCount?: number;
  durationSeconds?: number;
  fps?: number;
  trackedIds?: number[];
  modelVersion?: string;
  labels?: string[];
  promptToObjectIds?: Record<string, number[]>;
  objectIdToPromptLabel?: Record<string, string>;
  metadata?: SegmentMetadata;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: VideoSegmentRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

export interface AnimateSegmentResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  isAsync?: boolean;
  jobId?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fps?: number;
  frameCount?: number;
  objectCount?: number;
  modelVersion?: string;
  labels?: string[];
  promptToObjectIds?: Record<string, number[]>;
  objectIdToPromptLabel?: Record<string, string>;
  metadata?: SegmentMetadata;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: AnimateSegmentRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

function getSegmentMetadata(rawResponse: unknown): SegmentMetadata | undefined {
  if (!rawResponse || typeof rawResponse !== "object") return undefined;

  const metadata = (rawResponse as { metadata?: SegmentMetadata }).metadata;
  if (!metadata || typeof metadata !== "object") return undefined;

  return metadata;
}

/**
 * Track and segment objects across video frames via the GPU API using SAM 3.
 */
export async function callGpuVideoSegment(
  request: VideoSegmentRequest
): Promise<VideoSegmentResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/segment/video",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    const successResp = response as GPUApiSuccessResponse;
    const metadata = getSegmentMetadata(rawResponse);
    return {
      success: true,
      publicUrl: successResp.save_url,
      generationTime: successResp.generation_time,
      frameCount: metadata?.frame_count,
      objectCount: metadata?.object_count,
      durationSeconds: metadata?.duration_seconds,
      fps: metadata?.fps,
      trackedIds: metadata?.tracked_ids,
      modelVersion: metadata?.model_version,
      labels: metadata?.labels,
      promptToObjectIds: metadata?.prompt_to_obj_ids,
      objectIdToPromptLabel: metadata?.object_id_to_prompt_label,
      metadata,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted)
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing" || response.status === "queued")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      debug,
    };
  }

  // Error response
  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// ANIMATED SEGMENTATION
// ============================================================================

export async function callGpuAnimateSegment(
  request: AnimateSegmentRequest
): Promise<AnimateSegmentResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/segment/animate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    const successResp = response as GPUApiSuccessResponse;
    const metadata = getSegmentMetadata(rawResponse);
    return {
      success: true,
      publicUrl: successResp.save_url,
      generationTime: successResp.generation_time,
      width: metadata?.width,
      height: metadata?.height,
      durationSeconds: metadata?.duration_seconds,
      fps: metadata?.fps,
      frameCount: metadata?.frame_count,
      objectCount: metadata?.object_count,
      modelVersion: metadata?.model_version,
      labels: metadata?.labels,
      promptToObjectIds: metadata?.prompt_to_obj_ids,
      objectIdToPromptLabel: metadata?.object_id_to_prompt_label,
      metadata,
      debug,
    };
  }

  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing" || response.status === "queued")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      debug,
    };
  }

  const errorResponse = response as GPUApiErrorResponse;
  return {
    success: false,
    errorCode: errorResponse.error_code,
    errorMessage: errorResponse.error_message,
    debug,
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

export interface GPUApiHealthStatus {
  available: boolean;
  gpuApiUrl: string;
  hasApiKey: boolean;
  message: string;
}

/**
 * Check if the GPU API is configured and potentially reachable.
 */
export function getGpuApiStatus(): GPUApiHealthStatus {
  const gpuApiUrl = getGpuApiUrl();
  const hasApiKey = !!process.env.GPU_API_KEY;

  if (!hasApiKey) {
    return {
      available: false,
      gpuApiUrl,
      hasApiKey: false,
      message: "GPU_API_KEY environment variable is not set",
    };
  }

  return {
    available: true,
    gpuApiUrl,
    hasApiKey: true,
    message: `GPU API configured at ${gpuApiUrl}`,
  };
}

// ============================================================================
// HEALTH ENDPOINTS
// ============================================================================

export interface HealthResponse {
  status: string;
  version: string;
  mock_mode: boolean;
}

export interface ReadinessResponse {
  ready: boolean;
  status: string;
  version: string;
  mock_mode: boolean;
  current_mode: string | null;
  models_loaded: boolean;
}

/**
 * Check GPU API health (no auth required)
 */
export async function callGpuHealth(): Promise<{
  success: boolean;
  data?: HealthResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  console.log(`[GPUApiService] Health Check URL: ${baseUrl}/health`);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} from ${baseUrl}/health` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GPUApiService] Health Check FAILED for ${baseUrl}/health: ${msg}`);
    return {
      success: false,
      error: `${msg} (URL: ${baseUrl}/health)`,
    };
  }
}

/**
 * Check GPU API readiness (no auth required)
 */
export async function callGpuHealthReady(): Promise<{
  success: boolean;
  data?: ReadinessResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  try {
    const response = await fetch(`${baseUrl}/health/ready`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} from ${baseUrl}/health/ready` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GPUApiService] Readiness Check FAILED for ${baseUrl}/health/ready: ${msg}`);
    return {
      success: false,
      error: `${msg} (URL: ${baseUrl}/health/ready)`,
    };
  }
}

// ============================================================================
// VM READINESS CHECK
// ============================================================================

export interface VmReadinessResult {
  ready: boolean;
  ip?: string;
  reason?: string;
  currentMode?: VramMode;
  isModeSwitching?: boolean;
}

/**
 * Check if GPU VM is ready for operations.
 * Ready = RUNNING status + health endpoint responds + not switching modes
 * 
 * @param userId - Optional user ID to check specific user's VM config
 * @returns VmReadinessResult indicating readiness state
 */
export async function checkGpuVmReady(
  userId?: string,
): Promise<VmReadinessResult> {
  try {
    // 1. Get dynamic URL (checks user_gcp_config for RUNNING + IP)
    const baseUrl = await fetchDynamicGpuApiUrl(userId);
    
    // Extract IP from URL for logging
    const extractedIp = baseUrl.replace("http://", "").replace(":8000", "");

    if (baseUrl === "http://localhost:8000") {
      // No dynamic VM found, check if localhost is available
      const health = await callGpuHealth();
      if (!health.success) {
        return { ready: false, reason: "No GPU VM available (localhost not responding)" };
      }
      return { ready: true, ip: "localhost" };
    }

    // 2. Health check
    const health = await callGpuHealth();
    if (!health.success) {
      return {
        ready: false,
        ip: extractedIp,
        reason: `Health check failed: ${health.error}`,
      };
    }

    // 3. Check if mode is switching (for optimization)
    const mode = await callGpuGetMode();
    if (mode.success && mode.data?.is_switching) {
      return {
        ready: false,
        ip: extractedIp,
        reason: `Mode switching to ${mode.data.switching_target}`,
        isModeSwitching: true,
      };
    }

    return {
      ready: true,
      ip: extractedIp,
      currentMode: mode.data?.mode as VramMode,
    };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : "Unknown error checking VM readiness",
    };
  }
}

// ============================================================================
// SYSTEM STATUS
// ============================================================================

export interface GPUInfo {
  name: string;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_free_gb: number;
  memory_usage_percent: number;
  temperature_celsius?: number;
  gpu_utilization_percent?: number;
  cuda_version?: string;
  driver_version?: string;
}

export interface SystemInfo {
  os: string;
  os_version: string;
  python_version: string;
  cpu_count: number;
  hostname: string;
}

export interface ModeInfo {
  mode: string;
  is_busy: boolean;
  active_job_id: string | null;
  loaded_models: string[];
}

export interface ConcurrencyLimits {
  max_concurrent_image_generations: number;
  max_concurrent_video_generations: number;
}

export interface SystemStatusResponse {
  system: SystemInfo;
  gpu: GPUInfo | null;
  mode: ModeInfo | null;
  concurrency_limits: ConcurrencyLimits;
  mock_mode: boolean;
}

/**
 * Get detailed system status (auth required)
 */
export async function callGpuSystemStatus(): Promise<{
  success: boolean;
  data?: SystemStatusResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  console.log(`[GPUApiService] System Status URL: ${baseUrl}/api/v1/system/status`);
  try {
    const response = await fetch(`${baseUrl}/api/v1/system/status`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[GPUApiService] System Status returned ${response.status}`);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} from ${baseUrl}/api/v1/system/status` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GPUApiService] System Status FAILED for ${baseUrl}/api/v1/system/status: ${msg}`);
    return {
      success: false,
      error: `${msg} (URL: ${baseUrl}/api/v1/system/status)`,
    };
  }
}

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

export interface ModeStatusResponse {
  mode: string;
  is_busy: boolean;
  active_job_id: string | null;
  loaded_models: string[];
  // Mode switching fields - present when switching between modes
  is_switching?: boolean;
  switching_target?: string | null;
  switching_step?: string | null;
  switching_progress?: number | null;
}

export interface ModeSwitchResponse {
  status: string;
  previous_mode: string;
  current_mode: string;
  message: string;
}

/**
 * Get current mode status
 */
export async function callGpuGetMode(): Promise<{
  success: boolean;
  data?: ModeStatusResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/mode`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} from ${baseUrl}/api/v1/mode` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GPUApiService] Get Mode FAILED for ${baseUrl}/api/v1/mode: ${msg}`);
    return {
      success: false,
      error: `${msg} (URL: ${baseUrl}/api/v1/mode)`,
    };
  }
}

/**
 * Switch between image and video modes
 */
export async function callGpuSwitchMode(
  targetMode: "image" | "video" | "audio"
): Promise<{
  success: boolean;
  data?: ModeSwitchResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/mode/switch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ target_mode: targetMode }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}`,
      };
    }
    const data = await response.json();
    // Force-update activity on mode switch (significant action)
    forceUpdateGpuActivity().catch(() => {});
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// LORA MANAGEMENT
// ============================================================================

export interface LoraInfo {
  name: string;
  size_bytes: number;
  modified_time: number;
}

/**
 * List available Z-Image LoRAs
 */
export async function callGpuListLoras(): Promise<{
  success: boolean;
  data?: LoraInfo[];
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/loras/z-image`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Upload a Z-Image LoRA file to the GPU API.
 * Uses POST /api/v1/loras/z-image/upload (multipart form upload).
 *
 * @param loraBuffer - The .safetensors file contents as a Buffer
 * @param filename - Original filename (e.g., "my_style.safetensors")
 */
export async function callGpuUploadLora(
  loraBuffer: Buffer,
  filename: string,
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    // Build multipart form data
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(loraBuffer)], { type: 'application/octet-stream' });
    formData.append('file', blob, filename);

    const response = await fetch(`${baseUrl}/api/v1/loras/z-image/upload`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.detail || errorData.error || `HTTP ${response.status}`;
      return { success: false, error: detail };
    }

    const data = await response.json();
    return { success: true, message: data.message || 'Uploaded successfully' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a Z-Image LoRA from the GPU API.
 * Uses DELETE /api/v1/loras/z-image/{lora_name}.
 *
 * @param loraName - Name of the LoRA to delete (without extension)
 */
export async function callGpuDeleteLora(loraName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/loras/z-image/${encodeURIComponent(loraName)}`,
      {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey },
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.detail || `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get background job status
 */
export async function callGpuGetJobStatus(jobId: string): Promise<{
  success: boolean;
  job?: any;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}`,
      };
    }
    const data = await response.json();
    return { success: true, job: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// LTX-2.3 VIDEO GENERATION
// ============================================================================

/** Request body for POST /api/v1/ltx2/generate */
export interface LTX2GenerateRequest {
  job_id: string;
  start_frame_url: string;
  prompt: string;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  end_frame_url?: string;
  seed?: number;
  enhance_prompt?: boolean;
  save_url: string;
  /** REQUIRED: URL to POST when complete */
  webhook_url: string;
  /** Optional: Client identifier returned in webhook */
  item_id?: string;
  /** Optional: HMAC signing secret */
  webhook_secret?: string;
}

/** Keyframe for interpolation */
export interface KeyframeImage {
  image_url: string;
  frame_index: number;
  strength?: number;
}

/** Request body for POST /api/v1/ltx2/interpolate */
export interface LTX2InterpolateRequest {
  job_id: string;
  prompt: string;
  negative_prompt?: string;
  keyframes: KeyframeImage[];
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  enhance_prompt?: boolean;
  save_url: string;
  /** REQUIRED: URL to POST when complete */
  webhook_url: string;
  /** Optional: Client identifier returned in webhook */
  item_id?: string;
  /** Optional: HMAC signing secret */
  webhook_secret?: string;
}

export interface LTX2GenerateResult {
  success: boolean;
  publicUrl?: string;
  generationTime?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
  upscaleInfo?: Record<string, unknown>;
  isAsync?: boolean;
  jobId?: string;
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: LTX2GenerateRequest | LTX2InterpolateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
  finalJob?: JobInfo;
}

/**
 * Generate video via LTX-2 API (I2V)
 */
export async function callGpuLtx2Generate(
  request: LTX2GenerateRequest
): Promise<LTX2GenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/ltx2/generate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    const successResponse = response as GPUApiSuccessResponse & {
      duration_seconds?: number;
      has_audio?: boolean;
      upscale_info?: Record<string, unknown>;
    };
    return {
      success: true,
      publicUrl: successResponse.save_url,
      generationTime: successResponse.generation_time,
      durationSeconds: successResponse.duration_seconds,
      hasAudio: successResponse.has_audio,
      upscaleInfo: successResponse.upscale_info,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted)
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      debug,
    };
  }

  return {
    success: false,
    errorCode: (response as GPUApiErrorResponse).error_code,
    errorMessage: (response as GPUApiErrorResponse).error_message,
    debug,
  };
}

/**
 * Generate video via LTX-2 keyframe interpolation
 */
export async function callGpuLtx2Interpolate(
  request: LTX2InterpolateRequest
): Promise<LTX2GenerateResult> {
  const { response, rawRequest, rawResponse, statusCode } = await callGpuApi(
    "/api/v1/ltx2/interpolate",
    request
  );

  const debug = {
    request: rawRequest,
    response: rawResponse,
    statusCode,
    gpuApiUrl: getGpuApiUrl(),
  };

  if (response.status === "completed") {
    const successResponse = response as GPUApiSuccessResponse & {
      duration_seconds?: number;
      has_audio?: boolean;
      upscale_info?: Record<string, unknown>;
    };
    return {
      success: true,
      publicUrl: successResponse.save_url,
      generationTime: successResponse.generation_time,
      durationSeconds: successResponse.duration_seconds,
      hasAudio: successResponse.has_audio,
      upscaleInfo: successResponse.upscale_info,
      debug,
    };
  }

  // Handle 202 Accepted (async job accepted)
  if (
    statusCode === 202 &&
    (response.status === "pending" || response.status === "processing")
  ) {
    const asyncResponse = response as GPUApiAsyncJobResponse;
    return {
      success: true,
      isAsync: true,
      jobId: asyncResponse.job_id,
      debug,
    };
  }

  return {
    success: false,
    errorCode: (response as GPUApiErrorResponse).error_code,
    errorMessage: (response as GPUApiErrorResponse).error_message,
    debug,
  };
}

// ============================================================================
// SYSTEM SETTINGS (VRAM MODE)
// ============================================================================

export interface VramModeResponse {
  mode: VramMode;
  description: string;
}

export interface GPUCapabilityResponse {
  segmentation_routes_enabled: boolean;
  frame_extraction_route_enabled: boolean;
  mixed_video_segmentation: boolean;
  recommended_scheduler: "dedicated_waves";
  all_mode_recommended: boolean;
}

/**
 * Get current VRAM loading strategy
 */
export async function callGpuGetVramMode(): Promise<{
  success: boolean;
  data?: VramModeResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/settings/vram-mode`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function callGpuGetCapabilities(): Promise<{
  success: boolean;
  data?: GPUCapabilityResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/settings/capabilities`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Set VRAM loading strategy
 */
export async function callGpuSetVramMode(mode: VramMode): Promise<{
  success: boolean;
  data?: VramModeResponse;
  error?: string;
}> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/settings/vram-mode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ mode }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData.detail || errorData.error || errorData.message || JSON.stringify(errorData);
      console.error(`[GPUApiService] setVramMode failed: HTTP ${response.status} - ${detail}`);
      return { success: false, error: `HTTP ${response.status}: ${detail}` };
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`[GPUApiService] setVramMode error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/** Webhook payload sent by GPU API on job completion */
export interface WebhookPayload {
  event: 'generation.completed' | 'generation.failed' | 'generation.cancelled';
  job_id: string;
  item_id: string;
  batch_id: string | null;
  status: 'completed' | 'failed' | 'cancelled';
  completed_at: number;
  generation_type:
    | 'image_generation'
    | 'image_editing'
    | 'video_generation'
    | 'audio_creation'
    | 'segmentation'
    | 'image_segmentation'
    | 'video_segmentation'
    | 'animated_segmentation'
    | string;
  result?: {
    save_url: string;
    generation_time: number;
    metadata?: SegmentMetadata;
  };
  error_message?: string;
  error_code?: string;
  retry_count?: number;
}

/** Batch item for image generation (item_id required for webhook correlation) */
export interface BatchImageGenerateItem {
  item_id: string;  // Required for webhook correlation
  prompt: string;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  num_inference_steps?: number;
  lora_name?: string;
  save_url: string;
}

/** Batch item for image editing (item_id required for webhook correlation) */
export interface BatchImageEditItem {
  item_id: string;  // Required for webhook correlation
  input_image_url: string;
  prompt: string;
  aspect_ratio?: AspectRatio;
  mask_image_url?: string;
  seed?: number;
  save_url: string;
}

/** Batch item for video generation (LTX-2, item_id required for webhook correlation) */
export interface BatchVideoGenerateItem {
  item_id: string;  // Required for webhook correlation
  start_frame_url: string;
  prompt: string;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  end_frame_url?: string;
  seed?: number;
  enhance_prompt?: boolean;
  save_url: string;
}

/** Response when submitting a batch (202 Accepted) */
export interface BatchSubmitResponse {
  batch_id: string;
  status: "pending";
  total_items: number;
  status_url: string;
  message: string;
}

/** Status of an individual item within a batch */
export interface BatchItemStatus {
  item_index: number;
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "retrying" | "cancelled";
  retry_count: number;
  result?: { save_url: string; generation_time: number };
  error_message?: string;
}

/** Full batch status response */
export interface BatchStatusResponse {
  batch_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelling" | "cancelled";
  batch_type: "image_generation" | "image_editing" | "video_generation";
  total_items: number;
  completed_items: number;
  failed_items: number;
  pending_items: number;
  processing_items: number;
  retrying_items: number;
  cancelled_items?: number;
  created_at: number;
  cancelled_at?: number;
  items: BatchItemStatus[];
}

/** Result type for batch submission functions */
export interface BatchSubmitResult {
  success: boolean;
  batchId?: string;
  totalItems?: number;
  statusUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Result type for batch status functions */
export interface BatchStatusResult {
  success: boolean;
  batch?: BatchStatusResponse;
  error?: string;
}

/**
 * Submit a batch of image generation requests (max 500 items)
 * @param batchId - Unique batch identifier
 * @param items - Array of image generation items (each must have item_id for webhook correlation)
 * @param webhookUrl - URL to POST when each item completes (required by new API)
 * @param webhookSecret - Optional HMAC signing secret for webhook verification
 */
export async function callGpuBatchImageGenerate(
  batchId: string,
  items: BatchImageGenerateItem[],
  webhookUrl: string,
  webhookSecret?: string
): Promise<BatchSubmitResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch image generation: ${batchId} (${items.length} items) with webhook: ${webhookUrl}`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        items,
      }),
    });

    const data = await response.json();
    
    // Track GPU activity for auto-shutdown timer (batch calls bypass callGpuApi)
    updateGpuActivity().catch(() => {});
    
    if (response.status === 202) {
      const submitResponse = data as BatchSubmitResponse;
      return {
        success: true,
        batchId: submitResponse.batch_id,
        totalItems: submitResponse.total_items,
        statusUrl: submitResponse.status_url,
      };
    }

    return {
      success: false,
      errorCode: data.error_code || "SUBMISSION_FAILED",
      errorMessage: data.error_message || data.detail || `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[GPUApiService] Batch image generation failed:`, error);
    return {
      success: false,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : "Network request failed",
    };
  }
}

/**
 * Submit a batch of image editing requests (max 500 items)
 * @param batchId - Unique batch identifier
 * @param items - Array of image edit items (each must have item_id for webhook correlation)
 * @param webhookUrl - URL to POST when each item completes (required by new API)
 * @param webhookSecret - Optional HMAC signing secret for webhook verification
 */
export async function callGpuBatchImageEdit(
  batchId: string,
  items: BatchImageEditItem[],
  webhookUrl: string,
  webhookSecret?: string
): Promise<BatchSubmitResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch image edit: ${batchId} (${items.length} items) with webhook: ${webhookUrl}`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/image/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        items,
      }),
    });

    const data = await response.json();
    
    // Track GPU activity for auto-shutdown timer (batch calls bypass callGpuApi)
    updateGpuActivity().catch(() => {});
    
    if (response.status === 202) {
      const submitResponse = data as BatchSubmitResponse;
      return {
        success: true,
        batchId: submitResponse.batch_id,
        totalItems: submitResponse.total_items,
        statusUrl: submitResponse.status_url,
      };
    }

    return {
      success: false,
      errorCode: data.error_code || "SUBMISSION_FAILED",
      errorMessage: data.error_message || data.detail || `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[GPUApiService] Batch image edit failed:`, error);
    return {
      success: false,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : "Network request failed",
    };
  }
}

/**
 * Submit a batch of video generation requests (max 100 items)
 * @param batchId - Unique batch identifier
 * @param items - Array of video generation items (each must have item_id for webhook correlation)
 * @param webhookUrl - URL to POST when each item completes (required by new API)
 * @param webhookSecret - Optional HMAC signing secret for webhook verification
 */
export async function callGpuBatchVideoGenerate(
  batchId: string,
  items: BatchVideoGenerateItem[],
  webhookUrl: string,
  webhookSecret?: string
): Promise<BatchSubmitResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch video generation: ${batchId} (${items.length} items) with webhook: ${webhookUrl}`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/video/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        items,
      }),
    });

    const data = await response.json();
    
    // Track GPU activity for auto-shutdown timer (batch calls bypass callGpuApi)
    updateGpuActivity().catch(() => {});
    
    if (response.status === 202) {
      const submitResponse = data as BatchSubmitResponse;
      return {
        success: true,
        batchId: submitResponse.batch_id,
        totalItems: submitResponse.total_items,
        statusUrl: submitResponse.status_url,
      };
    }

    return {
      success: false,
      errorCode: data.error_code || "SUBMISSION_FAILED",
      errorMessage: data.error_message || data.detail || `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[GPUApiService] Batch video generation failed:`, error);
    return {
      success: false,
      errorCode: "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : "Network request failed",
    };
  }
}

/**
 * Get batch status (non-destructive)
 */
export async function callGpuGetBatchStatus(batchId: string): Promise<BatchStatusResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/${batchId}`, {
      headers: { "X-API-Key": apiKey },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return { success: true, batch: data as BatchStatusResponse };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Collect batch results and delete (destructive - use for final retrieval)
 */
export async function callGpuDeleteBatch(batchId: string): Promise<BatchStatusResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/${batchId}`, {
      method: "DELETE",
      headers: { "X-API-Key": apiKey },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return { success: true, batch: data as BatchStatusResponse };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Cancel a batch — pending items are removed from the GPU queue,
 * currently-processing items finish normally.
 * Uses POST /api/v1/batch/{batch_id}/cancel (GPU API v0.7.0+)
 */
export async function callGpuCancelBatch(batchId: string): Promise<BatchStatusResult> {
  const baseUrl = await fetchDynamicGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Cancelling batch ${batchId}`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/${batchId}/cancel`, {
      method: "POST",
      headers: { "X-API-Key": apiKey },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    console.log(`[GPUApiService] Batch ${batchId} cancel response: ${data.cancelled_items || 0} items cancelled`);
    return { success: true, batch: data as BatchStatusResponse };
  } catch (error) {
    console.error(`[GPUApiService] Batch cancel failed for ${batchId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
