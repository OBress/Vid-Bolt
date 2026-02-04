/**
 * WebGL-Accelerated Effect Processing
 * 
 * Provides GPU-accelerated implementations of CPU-intensive effects:
 * - Sharpen: 10-100x faster than canvas convolution
 * - Noise: Real-time grain generation
 * - Color grading: Real-time adjustments
 * 
 * Falls back to canvas-based processing for unsupported browsers.
 * 
 * @module webgl-effects
 */

import { SharpenEffect, NoiseEffect, Effect, EffectType } from "../types/effects";

// ==========================================
// TYPES
// ==========================================

interface WebGLEffectContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  programs: Map<string, WebGLProgram>;
  textures: Map<string, WebGLTexture>;
  framebuffers: Map<string, WebGLFramebuffer>;
}

interface ShaderSource {
  vertex: string;
  fragment: string;
}

// ==========================================
// SHADER SOURCES
// ==========================================

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const SHARPEN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_textureSize;
uniform float u_amount;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
  vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;
  
  // Sharpening kernel values based on amount
  float strength = u_amount * 2.0;
  float edge = -strength / 4.0;
  float center = 1.0 + strength;
  
  // Sample neighboring pixels
  vec4 colorSum = 
    texture(u_image, v_texCoord + onePixel * vec2(-1, 0)) * edge +
    texture(u_image, v_texCoord + onePixel * vec2(1, 0)) * edge +
    texture(u_image, v_texCoord + onePixel * vec2(0, -1)) * edge +
    texture(u_image, v_texCoord + onePixel * vec2(0, 1)) * edge +
    texture(u_image, v_texCoord) * center;
  
  outColor = vec4(clamp(colorSum.rgb, 0.0, 1.0), colorSum.a);
}
`;

const NOISE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_amount;
uniform float u_seed;
uniform bool u_monochrome;

in vec2 v_texCoord;
out vec4 outColor;

// Deterministic pseudo-random using position and seed
float random(vec2 st, float seed) {
  return fract(sin(dot(st.xy + vec2(seed, seed * 0.7), vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec4 color = texture(u_image, v_texCoord);
  
  float intensity = u_amount * 0.5; // Map 0-1 to 0-0.5 noise range
  
  if (u_monochrome) {
    // Same noise for all channels
    float noise = (random(v_texCoord, u_seed) - 0.5) * intensity * 2.0;
    outColor = vec4(clamp(color.rgb + vec3(noise), 0.0, 1.0), color.a);
  } else {
    // Different noise per channel
    float noiseR = (random(v_texCoord, u_seed) - 0.5) * intensity * 2.0;
    float noiseG = (random(v_texCoord, u_seed + 1.0) - 0.5) * intensity * 2.0;
    float noiseB = (random(v_texCoord, u_seed + 2.0) - 0.5) * intensity * 2.0;
    outColor = vec4(
      clamp(color.r + noiseR, 0.0, 1.0),
      clamp(color.g + noiseG, 0.0, 1.0),
      clamp(color.b + noiseB, 0.0, 1.0),
      color.a
    );
  }
}
`;

const COLOR_GRADING_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_exposure;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
  vec4 color = texture(u_image, v_texCoord);
  
  // Exposure
  color.rgb *= u_exposure;
  
  // Brightness
  color.rgb += u_brightness - 1.0;
  
  // Contrast
  color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;
  
  // Saturation
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, u_saturation);
  
  // Temperature (warm/cool adjustment)
  float temp = u_temperature;
  color.r *= 1.0 + temp * 0.1;
  color.b *= 1.0 - temp * 0.1;
  
  outColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`;

const PASSTHROUGH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;

in vec2 v_texCoord;
out vec4 outColor;

void main() {
  outColor = texture(u_image, v_texCoord);
}
`;

// ==========================================
// WEBGL CONTEXT MANAGEMENT
// ==========================================

let globalContext: WebGLEffectContext | null = null;
let webGLSupported: boolean | null = null;

/**
 * Check if WebGL2 is supported in the current browser
 */
export function isWebGLSupported(): boolean {
  if (webGLSupported !== null) return webGLSupported;
  
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webGLSupported = gl !== null;
    
    if (gl) {
      // Clean up test context
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();
    }
  } catch {
    webGLSupported = false;
  }
  
  return webGLSupported;
}

/**
 * Initialize or get the shared WebGL context
 */
function getWebGLContext(width: number, height: number): WebGLEffectContext | null {
  if (!isWebGLSupported()) return null;
  
  if (globalContext) {
    // Resize if needed
    if (globalContext.canvas.width !== width || globalContext.canvas.height !== height) {
      globalContext.canvas.width = width;
      globalContext.canvas.height = height;
      globalContext.gl.viewport(0, 0, width, height);
    }
    return globalContext;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  
  if (!gl) return null;
  
  globalContext = {
    gl,
    canvas,
    programs: new Map(),
    textures: new Map(),
    framebuffers: new Map(),
  };
  
  // Initialize programs
  initializePrograms(globalContext);
  
  return globalContext;
}

/**
 * Compile and link a shader program
 */
function createProgram(gl: WebGL2RenderingContext, shaderSource: ShaderSource): WebGLProgram | null {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  
  if (!vertexShader || !fragmentShader) return null;
  
  gl.shaderSource(vertexShader, shaderSource.vertex);
  gl.compileShader(vertexShader);
  
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.error('Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
    return null;
  }
  
  gl.shaderSource(fragmentShader, shaderSource.fragment);
  gl.compileShader(fragmentShader);
  
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error('Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
    return null;
  }
  
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking failed:', gl.getProgramInfoLog(program));
    return null;
  }
  
  // Clean up shaders
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  
  return program;
}

/**
 * Initialize all shader programs
 */
function initializePrograms(ctx: WebGLEffectContext): void {
  const { gl, programs } = ctx;
  
  const shaders: Record<string, ShaderSource> = {
    sharpen: { vertex: VERTEX_SHADER, fragment: SHARPEN_FRAGMENT_SHADER },
    noise: { vertex: VERTEX_SHADER, fragment: NOISE_FRAGMENT_SHADER },
    colorGrading: { vertex: VERTEX_SHADER, fragment: COLOR_GRADING_FRAGMENT_SHADER },
    passthrough: { vertex: VERTEX_SHADER, fragment: PASSTHROUGH_FRAGMENT_SHADER },
  };
  
  for (const [name, source] of Object.entries(shaders)) {
    const program = createProgram(gl, source);
    if (program) {
      programs.set(name, program);
    }
  }
  
  // Setup vertex buffer (shared by all programs)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  
  // Full-screen quad positions and texture coordinates
  const positions = new Float32Array([
    -1, -1,  0, 0,
     1, -1,  1, 0,
    -1,  1,  0, 1,
     1,  1,  1, 1,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  
  // Store position buffer reference
  (ctx as any).positionBuffer = positionBuffer;
}

/**
 * Upload image data to a WebGL texture
 */
function uploadTexture(ctx: WebGLEffectContext, name: string, source: ImageData | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): WebGLTexture | null {
  const { gl, textures } = ctx;
  
  let texture = textures.get(name);
  if (!texture) {
    texture = gl.createTexture();
    if (!texture) return null;
    textures.set(name, texture);
  }
  
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
  if (source instanceof ImageData) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  
  return texture;
}

/**
 * Setup program attributes and uniforms
 */
function useProgram(ctx: WebGLEffectContext, programName: string): WebGLProgram | null {
  const { gl, programs } = ctx;
  const program = programs.get(programName);
  
  if (!program) return null;
  
  gl.useProgram(program);
  
  // Setup vertex attributes
  const positionBuffer = (ctx as any).positionBuffer;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);
  
  return program;
}

/**
 * Render to canvas and return ImageData
 */
function renderToImageData(ctx: WebGLEffectContext): ImageData {
  const { gl, canvas } = ctx;
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  
  // WebGL reads from bottom-left, need to flip vertically
  const flipped = new Uint8ClampedArray(pixels.length);
  const rowSize = canvas.width * 4;
  for (let y = 0; y < canvas.height; y++) {
    const srcOffset = y * rowSize;
    const dstOffset = (canvas.height - 1 - y) * rowSize;
    flipped.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
  }
  
  return new ImageData(flipped, canvas.width, canvas.height);
}

// ==========================================
// EFFECT IMPLEMENTATIONS
// ==========================================

/**
 * Apply sharpen effect using WebGL
 */
export function applySharpenWebGL(
  imageData: ImageData,
  effect: SharpenEffect
): ImageData | null {
  if (effect.amount === 0) return imageData;
  
  const ctx = getWebGLContext(imageData.width, imageData.height);
  if (!ctx) return null;
  
  const { gl } = ctx;
  
  // Upload source texture
  uploadTexture(ctx, 'source', imageData);
  
  // Use sharpen program
  const program = useProgram(ctx, 'sharpen');
  if (!program) return null;
  
  // Set uniforms
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_textureSize'), imageData.width, imageData.height);
  gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), effect.amount / 100);
  
  // Render
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  return renderToImageData(ctx);
}

/**
 * Apply noise effect using WebGL
 */
export function applyNoiseWebGL(
  imageData: ImageData,
  effect: NoiseEffect,
  frame: number,
  effectId?: string
): ImageData | null {
  if (effect.amount === 0) return imageData;
  
  const ctx = getWebGLContext(imageData.width, imageData.height);
  if (!ctx) return null;
  
  const { gl } = ctx;
  
  // Upload source texture
  uploadTexture(ctx, 'source', imageData);
  
  // Use noise program
  const program = useProgram(ctx, 'noise');
  if (!program) return null;
  
  // Generate deterministic seed from frame and effect ID
  const idHash = effectId ? effectId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 0;
  const seed = (frame * 100000 + idHash) % 100000;
  
  // Set uniforms
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), effect.amount / 100);
  gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), seed / 100000);
  gl.uniform1i(gl.getUniformLocation(program, 'u_monochrome'), effect.monochrome ? 1 : 0);
  
  // Render
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  return renderToImageData(ctx);
}

/**
 * Apply color grading adjustments using WebGL
 */
export function applyColorGradingWebGL(
  imageData: ImageData,
  options: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    temperature?: number;
    exposure?: number;
  }
): ImageData | null {
  const ctx = getWebGLContext(imageData.width, imageData.height);
  if (!ctx) return null;
  
  const { gl } = ctx;
  
  // Upload source texture
  uploadTexture(ctx, 'source', imageData);
  
  // Use color grading program
  const program = useProgram(ctx, 'colorGrading');
  if (!program) return null;
  
  // Set uniforms (default to neutral values)
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), options.brightness ?? 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), options.contrast ?? 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), options.saturation ?? 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), options.temperature ?? 0.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_exposure'), options.exposure ?? 1.0);
  
  // Render
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  return renderToImageData(ctx);
}

// ==========================================
// MAIN PROCESSING FUNCTION
// ==========================================

/**
 * Process effects using WebGL acceleration
 * Falls back to canvas processing if WebGL is unavailable
 * 
 * @param canvas Target canvas with source image
 * @param effects Effects to apply
 * @param frame Current frame number
 * @returns True if WebGL was used, false if fallback is needed
 */
export function processEffectsWebGL(
  canvas: HTMLCanvasElement,
  effects: Effect[],
  frame: number
): boolean {
  if (!isWebGLSupported()) return false;
  
  const canvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!canvasCtx) return false;
  
  let imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Filter for WebGL-compatible effects
  const sortedEffects = [...effects]
    .filter(e => e.enabled)
    .sort((a, b) => a.order - b.order);
  
  let processedAny = false;
  
  for (const effect of sortedEffects) {
    let result: ImageData | null = null;
    
    switch (effect.type) {
      case EffectType.SHARPEN:
        result = applySharpenWebGL(imageData, effect as SharpenEffect);
        break;
      case EffectType.NOISE:
        result = applyNoiseWebGL(imageData, effect as NoiseEffect, frame, effect.id);
        break;
    }
    
    if (result) {
      imageData = result;
      processedAny = true;
    }
  }
  
  if (processedAny) {
    canvasCtx.putImageData(imageData, 0, 0);
  }
  
  return processedAny;
}

/**
 * Clean up WebGL resources
 */
export function disposeWebGLContext(): void {
  if (!globalContext) return;
  
  const { gl, programs, textures, framebuffers } = globalContext;
  
  programs.forEach(program => gl.deleteProgram(program));
  textures.forEach(texture => gl.deleteTexture(texture));
  framebuffers.forEach(fb => gl.deleteFramebuffer(fb));
  
  const loseContext = gl.getExtension('WEBGL_lose_context');
  if (loseContext) loseContext.loseContext();
  
  globalContext = null;
}

// ==========================================
// PERFORMANCE METRICS
// ==========================================

interface PerformanceMetrics {
  webGLTime: number;
  canvasTime: number;
  effectType: string;
  pixelCount: number;
}

const metrics: PerformanceMetrics[] = [];
const MAX_METRICS = 50;

/**
 * Record performance metrics for comparison
 */
export function recordWebGLPerformance(metrics: PerformanceMetrics): void {
  metrics.push(metrics);
  if (metrics.length > MAX_METRICS) {
    metrics.shift();
  }
}

/**
 * Get average speedup ratio for WebGL vs Canvas
 */
export function getWebGLSpeedupRatio(): number {
  if (metrics.length === 0) return 1;
  
  const totalWebGL = metrics.reduce((sum, m) => sum + m.webGLTime, 0);
  const totalCanvas = metrics.reduce((sum, m) => sum + m.canvasTime, 0);
  
  if (totalWebGL === 0) return 1;
  return totalCanvas / totalWebGL;
}
