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
  | "all";

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
  status: "pending" | "processing";
  status_url: string;
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

function getGpuApiUrl(): string {
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

async function callGpuApi<T>(
  endpoint: string,
  body: T
): Promise<{
  response: GPUApiResponse;
  rawRequest: T;
  rawResponse: unknown;
  statusCode: number;
}> {
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  const url = `${baseUrl}${endpoint}`;

  console.log(`[GPUApiService] Calling ${url}`);
  console.log(`[GPUApiService] Request body:`, JSON.stringify(body, null, 2));

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    console.log(
      `[GPUApiService] Response (${duration}ms):`,
      JSON.stringify(data, null, 2)
    );

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
  const baseUrl = getGpuApiUrl();
  try {
    const response = await fetch(`${baseUrl}/health`);
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
 * Check GPU API readiness (no auth required)
 */
export async function callGpuHealthReady(): Promise<{
  success: boolean;
  data?: ReadinessResponse;
  error?: string;
}> {
  const baseUrl = getGpuApiUrl();
  try {
    const response = await fetch(`${baseUrl}/health/ready`);
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
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/system/status`, {
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

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

export interface ModeStatusResponse {
  mode: string;
  is_busy: boolean;
  active_job_id: string | null;
  loaded_models: string[];
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
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  try {
    const response = await fetch(`${baseUrl}/api/v1/mode`, {
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
 * Switch between image and video modes
 */
export async function callGpuSwitchMode(
  targetMode: "image" | "video"
): Promise<{
  success: boolean;
  data?: ModeSwitchResponse;
  error?: string;
}> {
  const baseUrl = getGpuApiUrl();
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
  const baseUrl = getGpuApiUrl();
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
 * Get background job status
 */
export async function callGpuGetJobStatus(jobId: string): Promise<{
  success: boolean;
  job?: any;
  error?: string;
}> {
  const baseUrl = getGpuApiUrl();
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
// LTX-2 VIDEO GENERATION
// ============================================================================

/** Request body for POST /api/v1/ltx2/generate */
export interface LTX2GenerateRequest {
  job_id: string;
  input_image_url: string;
  prompt: string;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  end_image_url?: string;
  seed?: number;
  enhance_prompt?: boolean;
  save_url: string;
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

/**
 * Get current VRAM loading strategy
 */
export async function callGpuGetVramMode(): Promise<{
  success: boolean;
  data?: VramModeResponse;
  error?: string;
}> {
  const baseUrl = getGpuApiUrl();
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

/**
 * Set VRAM loading strategy
 */
export async function callGpuSetVramMode(mode: VramMode): Promise<{
  success: boolean;
  data?: VramModeResponse;
  error?: string;
}> {
  const baseUrl = getGpuApiUrl();
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

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/** Batch item for image generation (without job_id - auto-generated by backend) */
export interface BatchImageGenerateItem {
  prompt: string;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  num_inference_steps?: number;
  lora_name?: string;
  save_url: string;
}

/** Batch item for image editing */
export interface BatchImageEditItem {
  input_image_url: string;
  prompt: string;
  aspect_ratio?: AspectRatio;
  mask_image_url?: string;
  seed?: number;
  save_url: string;
}

/** Batch item for video generation (LTX-2) */
export interface BatchVideoGenerateItem {
  input_image_url: string;
  prompt: string;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  end_image_url?: string;
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
  status: "pending" | "processing" | "completed" | "failed" | "retrying";
  retry_count: number;
  result?: { save_url: string; generation_time: number };
  error_message?: string;
}

/** Full batch status response */
export interface BatchStatusResponse {
  batch_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  batch_type: "image_generation" | "image_editing" | "video_generation";
  total_items: number;
  completed_items: number;
  failed_items: number;
  pending_items: number;
  processing_items: number;
  retrying_items: number;
  created_at: number;
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
 */
export async function callGpuBatchImageGenerate(
  batchId: string,
  items: BatchImageGenerateItem[]
): Promise<BatchSubmitResult> {
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch image generation: ${batchId} (${items.length} items)`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        items,
      }),
    });

    const data = await response.json();
    
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
 */
export async function callGpuBatchImageEdit(
  batchId: string,
  items: BatchImageEditItem[]
): Promise<BatchSubmitResult> {
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch image edit: ${batchId} (${items.length} items)`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/image/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        items,
      }),
    });

    const data = await response.json();
    
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
 */
export async function callGpuBatchVideoGenerate(
  batchId: string,
  items: BatchVideoGenerateItem[]
): Promise<BatchSubmitResult> {
  const baseUrl = getGpuApiUrl();
  const apiKey = getGpuApiKey();
  
  console.log(`[GPUApiService] Submitting batch video generation: ${batchId} (${items.length} items)`);
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/batch/video/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        batch_id: batchId,
        items,
      }),
    });

    const data = await response.json();
    
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
  const baseUrl = getGpuApiUrl();
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
  const baseUrl = getGpuApiUrl();
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
