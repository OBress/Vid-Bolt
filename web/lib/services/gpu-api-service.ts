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

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
export type FPS = 8 | 12 | 16 | 24 | 30;

/** Request body for POST /api/v1/image/generate */
export interface ImageGenerateRequest {
  job_id: string;
  prompt: string;
  aspect_ratio?: AspectRatio;
  seed?: number;
  num_inference_steps?: number;
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
  seed?: number;
  end_image_url?: string;
  save_url: string;
}

/** Successful response from GPU API */
export interface GPUApiSuccessResponse {
  status: "completed";
  generation_time: number;
  save_url: string;
}

/** Error response from GPU API */
export interface GPUApiErrorResponse {
  status: "failed";
  error_code: string;
  error_message: string;
}

export type GPUApiResponse = GPUApiSuccessResponse | GPUApiErrorResponse;

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
): Promise<{ response: GPUApiResponse; rawRequest: T; rawResponse: unknown; statusCode: number }> {
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

    console.log(`[GPUApiService] Response (${duration}ms):`, JSON.stringify(data, null, 2));

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
        error_message: error instanceof Error ? error.message : "Network request failed",
      },
      rawRequest: body,
      rawResponse: { error: error instanceof Error ? error.message : "Unknown error" },
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
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: ImageGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
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
      publicUrl: response.save_url,
      generationTime: response.generation_time,
      debug,
    };
  }

  return {
    success: false,
    errorCode: response.error_code,
    errorMessage: response.error_message,
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
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: ImageEditRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
}

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
      publicUrl: response.save_url,
      generationTime: response.generation_time,
      debug,
    };
  }

  return {
    success: false,
    errorCode: response.error_code,
    errorMessage: response.error_message,
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
  errorCode?: string;
  errorMessage?: string;
  debug: {
    request: VideoGenerateRequest;
    response: unknown;
    statusCode: number;
    gpuApiUrl: string;
  };
}

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
      publicUrl: response.save_url,
      generationTime: response.generation_time,
      debug,
    };
  }

  return {
    success: false,
    errorCode: response.error_code,
    errorMessage: response.error_message,
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
