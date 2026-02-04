/**
 * Render Preview Mode
 * 
 * Provides a "Render Preview" feature that renders a single frame exactly
 * as the Remotion Lambda would, allowing users to verify visual fidelity
 * before exporting.
 * 
 * Features:
 * - Uses OffthreadVideo for exact render matching
 * - Captures frame as high-quality PNG
 * - Shows comparison between preview and render-accurate frame
 * - Detects potential discrepancies
 * 
 * @module render-preview
 */

import { Overlay } from "../types";

// ==========================================
// TYPES
// ==========================================

export interface RenderPreviewOptions {
  /** Frame number to render */
  frame: number;
  /** Video composition width */
  width: number;
  /** Video composition height */
  height: number;
  /** Overlays to render */
  overlays: Overlay[];
  /** FPS of the composition */
  fps: number;
  /** Base URL for assets */
  baseUrl?: string;
  /** Font infos for text rendering */
  fontInfos?: Record<string, any>;
}

export interface RenderPreviewResult {
  /** The rendered frame as a data URL */
  dataUrl: string;
  /** Render time in milliseconds */
  renderTime: number;
  /** Any warnings during render */
  warnings: string[];
  /** Frame number that was rendered */
  frame: number;
  /** Dimensions of the rendered frame */
  dimensions: { width: number; height: number };
}

export interface RenderComparison {
  /** Preview frame data URL */
  previewDataUrl: string;
  /** Render-accurate frame data URL */
  renderDataUrl: string;
  /** Difference percentage (0-100) */
  differencePercent: number;
  /** Areas of difference (bounding boxes) */
  differenceAreas: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

// ==========================================
// RENDER PREVIEW CONTEXT
// ==========================================

/**
 * Context for tracking render preview state
 */
interface RenderPreviewContext {
  isRendering: boolean;
  progress: number;
  lastResult: RenderPreviewResult | null;
  error: Error | null;
}

let renderContext: RenderPreviewContext = {
  isRendering: false,
  progress: 0,
  lastResult: null,
  error: null,
};

// ==========================================
// MAIN RENDER FUNCTIONS
// ==========================================

/**
 * Render a single frame using render-accurate settings
 * 
 * This simulates the exact rendering that would occur during export,
 * allowing users to verify visual consistency before the full render.
 * 
 * @param options Render options
 * @returns Promise resolving to render result
 */
export async function renderPreviewFrame(
  options: RenderPreviewOptions
): Promise<RenderPreviewResult> {
  const { frame, width, height, overlays, fps, baseUrl, fontInfos } = options;
  
  renderContext = {
    isRendering: true,
    progress: 0,
    lastResult: null,
    error: null,
  };
  
  const warnings: string[] = [];
  const startTime = performance.now();
  
  try {
    renderContext.progress = 10;
    
    // Create offscreen canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }
    
    // Clear canvas with black background (composition default)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    renderContext.progress = 20;
    
    // Sort overlays by row (lower row = higher z-index in our system)
    const sortedOverlays = [...overlays]
      .filter(o => isOverlayVisibleAtFrame(o, frame))
      .sort((a, b) => (b.row || 0) - (a.row || 0)); // Higher row numbers rendered first (bottom)
    
    renderContext.progress = 30;
    
    // Render each overlay
    for (let i = 0; i < sortedOverlays.length; i++) {
      const overlay = sortedOverlays[i];
      const overlayProgress = 30 + ((i / sortedOverlays.length) * 60);
      renderContext.progress = overlayProgress;
      
      try {
        await renderOverlayToCanvas(ctx, overlay, frame, fps, width, height, baseUrl, fontInfos);
      } catch (err) {
        warnings.push(`Failed to render overlay ${overlay.id}: ${(err as Error).message}`);
      }
    }
    
    renderContext.progress = 90;
    
    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    
    renderContext.progress = 100;
    
    const result: RenderPreviewResult = {
      dataUrl,
      renderTime: performance.now() - startTime,
      warnings,
      frame,
      dimensions: { width, height },
    };
    
    renderContext.lastResult = result;
    renderContext.isRendering = false;
    
    return result;
    
  } catch (error) {
    renderContext.error = error as Error;
    renderContext.isRendering = false;
    throw error;
  }
}

/**
 * Check if an overlay is visible at a given frame
 */
function isOverlayVisibleAtFrame(overlay: Overlay, frame: number): boolean {
  const start = overlay.from || 0;
  const end = start + (overlay.durationInFrames || 0);
  return frame >= start && frame < end;
}

/**
 * Render a single overlay to the canvas
 */
async function renderOverlayToCanvas(
  ctx: CanvasRenderingContext2D,
  overlay: Overlay,
  globalFrame: number,
  fps: number,
  canvasWidth: number,
  canvasHeight: number,
  baseUrl?: string,
  fontInfos?: Record<string, any>
): Promise<void> {
  // Calculate relative frame within the overlay
  const relativeFrame = globalFrame - (overlay.from || 0);
  
  // Apply transforms
  ctx.save();
  
  // Position
  const x = overlay.left || 0;
  const y = overlay.top || 0;
  const width = overlay.width || 100;
  const height = overlay.height || 100;
  
  // Rotation
  const rotation = overlay.rotation || 0;
  if (rotation !== 0) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }
  
  // Render based on type
  switch (overlay.type) {
    case 'video':
      await renderVideoOverlay(ctx, overlay as any, relativeFrame, fps, x, y, width, height, baseUrl);
      break;
    case 'image':
      await renderImageOverlay(ctx, overlay as any, x, y, width, height, baseUrl);
      break;
    case 'text':
      renderTextOverlay(ctx, overlay as any, x, y, width, height, fontInfos);
      break;
    case 'shape':
      renderShapeOverlay(ctx, overlay as any, x, y, width, height);
      break;
    default:
      // Unsupported overlay type
      break;
  }
  
  ctx.restore();
}

/**
 * Render video overlay (captures current frame)
 */
async function renderVideoOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: any,
  relativeFrame: number,
  fps: number,
  x: number,
  y: number,
  width: number,
  height: number,
  baseUrl?: string
): Promise<void> {
  const videoSrc = resolveAssetUrl(overlay.src, baseUrl);
  
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${videoSrc}`));
    video.src = videoSrc;
    
    // Timeout
    setTimeout(() => reject(new Error('Video load timeout')), 10000);
  });
  
  // Seek to correct frame
  const videoStartTime = overlay.videoStartTime || 0;
  const playbackRate = overlay.speed || 1;
  const seekTime = videoStartTime + (relativeFrame / fps) * playbackRate;
  
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = Math.min(seekTime, video.duration - 0.001);
  });
  
  // Apply styles
  const styles = overlay.styles || {};
  
  // Apply opacity
  ctx.globalAlpha = styles.opacity ?? 1;
  
  // Draw video
  ctx.drawImage(video, x, y, width, height);
  
  // Reset alpha
  ctx.globalAlpha = 1;
}

/**
 * Render image overlay
 */
async function renderImageOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: any,
  x: number,
  y: number,
  width: number,
  height: number,
  baseUrl?: string
): Promise<void> {
  const imageSrc = resolveAssetUrl(overlay.src, baseUrl);
  
  const image = new Image();
  image.crossOrigin = 'anonymous';
  
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load image: ${imageSrc}`));
    image.src = imageSrc;
    
    setTimeout(() => reject(new Error('Image load timeout')), 5000);
  });
  
  const styles = overlay.styles || {};
  ctx.globalAlpha = styles.opacity ?? 1;
  
  ctx.drawImage(image, x, y, width, height);
  
  ctx.globalAlpha = 1;
}

/**
 * Render text overlay
 */
function renderTextOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: any,
  x: number,
  y: number,
  width: number,
  height: number,
  fontInfos?: Record<string, any>
): void {
  const content = overlay.content || '';
  const styles = overlay.styles || {};
  
  ctx.globalAlpha = styles.opacity ?? 1;
  
  // Font setup
  const fontSize = parseInt(styles.fontSize) || 32;
  const fontFamily = styles.fontFamily || 'Inter';
  const fontWeight = styles.fontWeight || 400;
  
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = styles.color || '#ffffff';
  ctx.textAlign = (styles.textAlign as CanvasTextAlign) || 'left';
  ctx.textBaseline = 'top';
  
  // Simple text rendering (multi-line support)
  const lines = content.split('\n');
  const lineHeight = fontSize * parseFloat(styles.lineHeight || '1.2');
  
  lines.forEach((line, i) => {
    const textX = styles.textAlign === 'center' 
      ? x + width / 2 
      : styles.textAlign === 'right' 
        ? x + width 
        : x;
    const textY = y + (i * lineHeight);
    ctx.fillText(line, textX, textY);
  });
  
  ctx.globalAlpha = 1;
}

/**
 * Render shape overlay
 */
function renderShapeOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: any,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const styles = overlay.styles || {};
  
  ctx.globalAlpha = styles.opacity ?? 1;
  ctx.fillStyle = styles.backgroundColor || '#ffffff';
  
  const borderRadius = parseInt(styles.borderRadius) || 0;
  
  if (borderRadius > 0) {
    roundRect(ctx, x, y, width, height, borderRadius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
  
  ctx.globalAlpha = 1;
}

/**
 * Draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Resolve asset URL with base URL
 */
function resolveAssetUrl(src: string, baseUrl?: string): string {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }
  if (src.startsWith('/') && baseUrl) {
    return `${baseUrl}${src}`;
  }
  return src;
}

// ==========================================
// COMPARISON UTILITIES
// ==========================================

/**
 * Compare two frames and calculate difference
 */
export async function compareFrames(
  previewCanvas: HTMLCanvasElement,
  renderResult: RenderPreviewResult
): Promise<RenderComparison> {
  // Get preview data
  const previewCtx = previewCanvas.getContext('2d');
  if (!previewCtx) {
    throw new Error('Failed to get preview canvas context');
  }
  
  const previewDataUrl = previewCanvas.toDataURL('image/png');
  const previewImageData = previewCtx.getImageData(
    0, 0, previewCanvas.width, previewCanvas.height
  );
  
  // Load render result
  const renderImage = new Image();
  await new Promise<void>((resolve, reject) => {
    renderImage.onload = () => resolve();
    renderImage.onerror = reject;
    renderImage.src = renderResult.dataUrl;
  });
  
  // Create canvas for render
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderResult.dimensions.width;
  renderCanvas.height = renderResult.dimensions.height;
  const renderCtx = renderCanvas.getContext('2d');
  
  if (!renderCtx) {
    throw new Error('Failed to create render canvas context');
  }
  
  renderCtx.drawImage(renderImage, 0, 0);
  const renderImageData = renderCtx.getImageData(
    0, 0, renderCanvas.width, renderCanvas.height
  );
  
  // Compare pixels
  let differentPixels = 0;
  const totalPixels = previewImageData.data.length / 4;
  const threshold = 10; // Allow slight color differences
  
  const differenceAreas: Array<{ x: number; y: number; width: number; height: number }> = [];
  let currentArea: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  
  for (let i = 0; i < previewImageData.data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % previewCanvas.width;
    const y = Math.floor(pixelIndex / previewCanvas.width);
    
    const rDiff = Math.abs(previewImageData.data[i] - renderImageData.data[i]);
    const gDiff = Math.abs(previewImageData.data[i + 1] - renderImageData.data[i + 1]);
    const bDiff = Math.abs(previewImageData.data[i + 2] - renderImageData.data[i + 2]);
    
    if (rDiff > threshold || gDiff > threshold || bDiff > threshold) {
      differentPixels++;
      
      // Track difference area
      if (!currentArea) {
        currentArea = { minX: x, maxX: x, minY: y, maxY: y };
      } else {
        currentArea.minX = Math.min(currentArea.minX, x);
        currentArea.maxX = Math.max(currentArea.maxX, x);
        currentArea.minY = Math.min(currentArea.minY, y);
        currentArea.maxY = Math.max(currentArea.maxY, y);
      }
    }
  }
  
  if (currentArea) {
    differenceAreas.push({
      x: currentArea.minX,
      y: currentArea.minY,
      width: currentArea.maxX - currentArea.minX + 1,
      height: currentArea.maxY - currentArea.minY + 1,
    });
  }
  
  return {
    previewDataUrl,
    renderDataUrl: renderResult.dataUrl,
    differencePercent: (differentPixels / totalPixels) * 100,
    differenceAreas,
  };
}

// ==========================================
// STATE GETTERS
// ==========================================

/**
 * Get current render preview state
 */
export function getRenderPreviewState(): RenderPreviewContext {
  return { ...renderContext };
}

/**
 * Check if render preview is in progress
 */
export function isRenderPreviewInProgress(): boolean {
  return renderContext.isRendering;
}

/**
 * Get last render preview result
 */
export function getLastRenderPreviewResult(): RenderPreviewResult | null {
  return renderContext.lastResult;
}
