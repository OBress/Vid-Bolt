import {
  useCurrentFrame,
  OffthreadVideo,
} from "remotion";
import { ClipOverlay } from "../../../types";
import { animationTemplates, getAnimationKey } from "../../../adaptors/default-animation-adaptors";
import { toAbsoluteUrl } from "../../general/url-helper";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { useEditorContext } from "../../../contexts/editor-context";
import { FPS } from "../../../constants";
import { calculateObjectFitDimensions } from "../helpers/object-fit-calculator";
import { effectsToFilter, getVignetteEffect, vignetteToCSS, getGlowEffect, glowToCSS, needsCanvasProcessing, getCanvasEffects, colorGradingToFilter } from "../../effect-renderer";
import { generateMaskStyles, needsSvgMask, generateMaskSvgString, hasActiveMasks } from "../../mask-renderer";
import { MaskType, ShapeMask } from "../../../types/masks";
import { processCanvasEffects } from "../../canvas-effect-renderer";
import { SvgCurvesFilter, SvgFilterDefs, useCurvesFilter, CurvesFilterValues } from "../../svg-curves-filter";
import { useKeyframedMasks } from "../../../hooks/use-keyframed-value";

/**
 * Always use OffthreadVideo for both preview and render.
 *
 * OffthreadVideo avoids Chrome's simultaneous <video> element throttling,
 * which causes static frames when many video clips are on the timeline.
 * During preview it still uses a <video> tag internally but with better
 * throttle avoidance, and during rendering it uses an off-thread decoder
 * for frame-perfect output.
 *
 * Remotion explicitly recommends OffthreadVideo over Html5Video.
 * @see https://remotion.dev/docs/offthreadvideo
 */

/**
 * Interface defining the props for the VideoLayerContent component
 */
interface VideoLayerContentProps {
  /** The overlay configuration object containing video properties and styles */
  overlay: ClipOverlay;
  /** The base URL for the video */
  baseUrl?: string;
}

/**
 * Hook to safely use editor context only when available
 */
const useSafeEditorContext = () => {
  try {
    return useEditorContext();
  } catch {
    return { baseUrl: undefined };
  }
};

/**
 * VideoLayerContent component renders a video layer with animations and styling
 *
 * This component handles:
 * - Video playback using Remotion's OffthreadVideo
 * - Enter/exit animations based on the current frame
 * - Styling including transform, opacity, border radius, etc.
 * - Video timing and volume controls
 * - Optional greenscreen removal using canvas processing
 *
 * @param props.overlay - Configuration object for the video overlay including:
 *   - src: Video source URL
 *   - videoStartTime: Start time offset for the video
 *   - durationInFrames: Total duration of the overlay
 *   - styles: Object containing visual styling properties and animations
 *   - greenscreen: Optional greenscreen removal configuration
 */
export const VideoLayerContent: React.FC<VideoLayerContentProps> = ({
  overlay,
  baseUrl,
}) => {
  const frame = useCurrentFrame();
  const { baseUrl: contextBaseUrl } = useSafeEditorContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastProcessedFrameRef = useRef<CanvasImageSource | null>(null);

  // Use prop baseUrl first, then context baseUrl
  const resolvedBaseUrl = baseUrl || contextBaseUrl;




  // Shared fallback UI for invalid/missing video sources
  const renderFallback = (message: string) => (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#888',
        fontSize: '13px',
        fontFamily: 'monospace',
      }}
    >
      {message}
    </div>
  );

  // Safety check - don't render if src is missing
  if (!overlay.src || overlay.src.trim() === '') {
    console.warn('VideoLayerContent: No src provided for video overlay', overlay);
    return renderFallback('Video source missing');
  }

  // Safety check - data:image/ URIs cannot be played as video by OffthreadVideo.
  // This happens when the wizard import falls back to a transparent PNG placeholder
  // because the generated media URL is not available yet.
  if (overlay.src.startsWith('data:image/')) {
    console.warn(`VideoLayerContent: src is an image data URI, cannot render as video (id=${overlay.id})`);
    return renderFallback('Media pending…');
  }

  // Safety check - reject stringified objects / obviously invalid sources.
  // Remotion's VideoForPreview unconditionally fires console.error("Error occurred in video", {})
  // on any native <video> error, so we must prevent mounting with bad URLs.
  if (
    overlay.src === '[object Object]' ||
    overlay.src.startsWith('blob:') ||
    overlay.src === 'undefined' ||
    overlay.src === 'null'
  ) {
    console.warn(`VideoLayerContent: Invalid src "${overlay.src}" for video (id=${overlay.id})`);
    return renderFallback('Media pending…');
  }

  // Determine the video source URL first
  let videoSrc = overlay.src;
  
  // If it's an API route, use toAbsoluteUrl to ensure proper domain
  if (overlay.src.startsWith("/api/")) {
    videoSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  }
  // If it's a relative URL and baseUrl is provided, use baseUrl
  else if (overlay.src.startsWith("/") && resolvedBaseUrl) {
    videoSrc = `${resolvedBaseUrl}${overlay.src}`;
  }
  // Otherwise use the toAbsoluteUrl helper for relative URLs
  else if (overlay.src.startsWith("/")) {
    videoSrc = toAbsoluteUrl(overlay.src, resolvedBaseUrl);
  } else {
  }

  // NOTE: Removed manual delayRender + document.createElement('video') preloading.
  // OffthreadVideo handles its own loading/buffering internally.
  // The old approach created phantom <video> elements on every mount, which
  // compounded Chrome's simultaneous video element throttling in stress tests.  

  // Process video frame with greenscreen removal
  const processVideoFrame = useCallback(
    (videoFrame: CanvasImageSource) => {
      if (!canvasRef.current || !overlay.greenscreen?.enabled) {
        return;
      }

      const context = canvasRef.current.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }

      // Store the last processed frame for reprocessing on resize
      lastProcessedFrameRef.current = videoFrame;

      // Get dimensions
      const canvasWidth = canvasRef.current.width;
      const canvasHeight = canvasRef.current.height;
      const videoWidth = (videoFrame as HTMLVideoElement).videoWidth || canvasWidth;
      const videoHeight = (videoFrame as HTMLVideoElement).videoHeight || canvasHeight;

      // Clear canvas
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      // Calculate objectFit positioning using helper
      const objectFit = overlay.styles.objectFit || "cover";
      const { drawX, drawY, drawWidth, drawHeight } = calculateObjectFitDimensions(
        videoWidth,
        videoHeight,
        canvasWidth,
        canvasHeight,
        objectFit
      );

      // Draw the video frame to canvas
      context.drawImage(videoFrame, drawX, drawY, drawWidth, drawHeight);

      // Get image data for pixel manipulation
      const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
      const { data } = imageData;

      // Get greenscreen configuration with defaults
      const config = overlay.greenscreen;
      const sensitivity = config.sensitivity ?? 100;
      const redThreshold = config.threshold?.red ?? 100;
      const greenMin = config.threshold?.green ?? 100;
      const blueThreshold = config.threshold?.blue ?? 100;
      const smoothing = config.smoothing ?? 0;
      const spill = config.spill ?? 0;

      // Process each pixel
      for (let i = 0; i < data.length; i += 4) {
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];
        const alpha = data[i + 3];

        // Check if pixel is green (greenscreen)
        if (green > greenMin && red < redThreshold && blue < blueThreshold) {
          // Calculate how "green" this pixel is for smooth transition
          const greenness = (green - Math.max(red, blue)) / 255;
          const alphaReduction = Math.min(1, greenness * (sensitivity / 100));
          
          // Apply transparency based on greenness and sensitivity
          data[i + 3] = alpha * (1 - alphaReduction);
        } else if (spill > 0) {
          // Remove green spill from non-green pixels
          const greenSpill = Math.max(0, green - Math.max(red, blue));
          if (greenSpill > 0) {
            data[i + 1] = Math.max(0, green - greenSpill * spill);
          }
        }
      }

      // Apply smoothing if enabled (simple box blur on alpha channel)
      if (smoothing > 0) {
        const smoothedData = new Uint8ClampedArray(data);
        const radius = Math.min(10, smoothing);
        
        for (let y = radius; y < canvasHeight - radius; y++) {
          for (let x = radius; x < canvasWidth - radius; x++) {
            let alphaSum = 0;
            let count = 0;

            // Average alpha values in neighborhood
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const idx = ((y + dy) * canvasWidth + (x + dx)) * 4;
                alphaSum += data[idx + 3];
                count++;
              }
            }

            const idx = (y * canvasWidth + x) * 4;
            smoothedData[idx + 3] = alphaSum / count;
          }
        }

        // Copy smoothed alpha back
        for (let i = 3; i < data.length; i += 4) {
          data[i] = smoothedData[i];
        }
      }

      // Put processed image data back to canvas
      context.putImageData(imageData, 0, 0);
    },
    [overlay.greenscreen, overlay.styles.objectFit]
  );

  // Reprocess last frame when dimensions change (handles resize while paused)
  useEffect(() => {
    if (overlay.greenscreen?.enabled && lastProcessedFrameRef.current) {
      processVideoFrame(lastProcessedFrameRef.current);
    }
  }, [overlay.width, overlay.height, processVideoFrame, overlay.greenscreen?.enabled]);

  // Greenscreen removal callback for video frame processing
  const onVideoFrame = useCallback(
    (videoFrame: CanvasImageSource) => {
      processVideoFrame(videoFrame);
    },
    [processVideoFrame]
  );

  // Calculate if we're in the exit phase (last 30 frames)
  const isExitPhase = frame >= overlay.durationInFrames - 30;
  
  // Apply enter animation only during entry phase
  const enterAnimation =
    !isExitPhase && overlay.styles.animation?.enter
      ? animationTemplates[getAnimationKey(overlay.styles.animation.enter)]?.enter(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply exit animation only during exit phase

  const exitAnimation =
    isExitPhase && overlay.styles.animation?.exit
      ? animationTemplates[getAnimationKey(overlay.styles.animation.exit)]?.exit(
          frame,
          overlay.durationInFrames
        )
      : {};

  // Apply effects and masks
  // Use keyframed masks for animation support - interpolates mask properties over time
  const animatedMasks = useKeyframedMasks(overlay as any, FPS, true);
  const effectsFilter = effectsToFilter(overlay.effects);
  const maskStyles = generateMaskStyles(animatedMasks);
  const vignetteEffect = getVignetteEffect(overlay.effects);
  
  // Check if we need SVG masks (for feathering support)
  const needsSvgMaskForFeather = needsSvgMask(animatedMasks);
  const svgMaskId = `mask-${overlay.id}`;
  
  // Get video dimensions from context for fallback
  const { videoWidth, videoHeight } = useEditorContext();
  // Overlay dimensions are already in composition pixels (e.g., 1920x1080), not percentages
  // Use them directly, with fallback to video dimensions if not set
  const maskWidthPx = overlay.width || videoWidth;
  const maskHeightPx = overlay.height || videoHeight;
  
  const svgMaskString = needsSvgMaskForFeather 
    ? generateMaskSvgString({ 
        masks: animatedMasks || [], 
        id: svgMaskId, 
        width: maskWidthPx, 
        height: maskHeightPx 
      })
    : '';
  const glowEffect = getGlowEffect(overlay.effects);
  
  // Check if canvas processing is needed for advanced effects
  const requiresCanvasEffects = needsCanvasProcessing(overlay.effects);
  const canvasEffects = getCanvasEffects(overlay.effects);
  
  // Color grading CSS filter (for basic adjustments like temperature, exposure, etc.)
  const colorGradingFilter = colorGradingToFilter(overlay.styles?.colorGrading);
  
  // SVG curves filter (for accurate per-channel tone curves)
  const curvesValues: CurvesFilterValues | undefined = overlay.styles?.colorGrading ? {
    rgbCurve: overlay.styles.colorGrading.rgbCurve,
    redCurve: overlay.styles.colorGrading.redCurve,
    greenCurve: overlay.styles.colorGrading.greenCurve,
    blueCurve: overlay.styles.colorGrading.blueCurve,
  } : undefined;
  const { filterId: curvesFilterId, hasActiveCurves } = useCurvesFilter(overlay.id, curvesValues);
  
  // Combine all filters: base + effects + color grading + curves (SVG)
  const filterParts: string[] = [];
  if (overlay.styles.filter && overlay.styles.filter !== "none") {
    filterParts.push(overlay.styles.filter);
  }
  if (effectsFilter) {
    filterParts.push(effectsFilter);
  }
  if (colorGradingFilter) {
    filterParts.push(colorGradingFilter);
  }
  // Add SVG curves filter reference
  if (hasActiveCurves) {
    filterParts.push(`url(#${curvesFilterId})`);
  }
  const combinedFilter = filterParts.length > 0 ? filterParts.join(' ') : "none";

  const videoStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: overlay.styles.objectFit || "cover",
    opacity: overlay.styles.opacity,
    transform: overlay.styles.transform || "none",
    filter: combinedFilter,
    // Apply SVG mask for feathered masks, otherwise use clip-path
    ...(needsSvgMaskForFeather 
      ? { mask: `url(#${svgMaskId})`, WebkitMask: `url(#${svgMaskId})` }
      : maskStyles
    ),
    ...(isExitPhase ? exitAnimation : enterAnimation),
  };

  // Create a container style that includes padding and background color
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    padding: overlay.styles.padding || "0px",
    backgroundColor: overlay.styles.paddingBackgroundColor || "transparent",
    display: "flex", // Use flexbox for centering
    alignItems: "center",
    justifyContent: "center",
    // Padding should be part of the total size
    boxSizing: "border-box",
    // Radius/border/shadow should wrap the padded container
    borderRadius: overlay.styles.borderRadius || "0px",
    border: overlay.styles.border || "none",
    boxShadow: overlay.styles.boxShadow || "none",
    // Only use overflow:hidden when not using SVG masks (feathering needs visible overflow)
    overflow: needsSvgMaskForFeather ? "visible" : "hidden",
    // Don't apply clipPath when using SVG masks - they handle masking
    clipPath: needsSvgMaskForFeather ? "none" : (overlay.styles.clipPath || "none"),
  };

  // Convert videoStartTime from seconds to frames for OffthreadVideo
  const startFromFrames = Math.round((overlay.videoStartTime || 0) * FPS);

  // Handle video playback errors gracefully
  // Prevents Remotion's internal "Error occurred in video" console error
  // and handles MEDIA_ELEMENT_ERROR format errors
  const handleVideoError = useCallback((error: Error) => {
    console.warn(`[VideoLayerContent] Video playback error for "${overlay.src}":`, error.message);
  }, [overlay.src]);
  
  // If greenscreen removal is enabled, use canvas-based rendering
  if (overlay.greenscreen?.enabled) {
    return (
      <div style={containerStyle}>
        {/* SVG filter definitions for curves */}
        {hasActiveCurves && curvesValues && (
          <SvgFilterDefs>
            <SvgCurvesFilter id={curvesFilterId} curves={curvesValues} />
          </SvgFilterDefs>
        )}
        {/* SVG mask definitions for feathered masks */}
        {needsSvgMaskForFeather && svgMaskString && (
          <div dangerouslySetInnerHTML={{ __html: svgMaskString }} />
        )}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Hidden video that feeds frames to canvas */}
          <OffthreadVideo
            src={videoSrc}
            startFrom={startFromFrames}
            pauseWhenBuffering
            onError={handleVideoError}
            style={{ 
              ...videoStyle,
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: 0,
            }}
            volume={() => overlay.styles.volume ?? 1}
            playbackRate={overlay.speed ?? 1}
          />
          {/* Canvas that displays processed video with greenscreen removed */}
          <canvas
            ref={canvasRef}
            width={overlay.width}
            height={overlay.height}
            style={{
              ...videoStyle,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />
          {/* Vignette overlay if present */}
          {vignetteEffect && <div style={vignetteToCSS(vignetteEffect)} />}
          {/* Glow overlay if present */}
          {glowEffect && <div style={{ ...glowToCSS(glowEffect), position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
        </div>
      </div>
    );
  }

  // Normal rendering without greenscreen removal
  return (
    <div style={containerStyle}>
      {/* SVG filter definitions for curves */}
      {hasActiveCurves && curvesValues && (
        <SvgFilterDefs>
          <SvgCurvesFilter id={curvesFilterId} curves={curvesValues} />
        </SvgFilterDefs>
      )}
      {/* SVG mask definitions for feathered masks */}
      {needsSvgMaskForFeather && svgMaskString && (
        <div dangerouslySetInnerHTML={{ __html: svgMaskString }} />
      )}
      <OffthreadVideo
        src={videoSrc}
        startFrom={startFromFrames}
        pauseWhenBuffering
        onError={handleVideoError}
        style={videoStyle}
        volume={() => overlay.styles.volume ?? 1}
        playbackRate={overlay.speed ?? 1}
      />
      {/* Vignette overlay if present */}
      {vignetteEffect && <div style={vignetteToCSS(vignetteEffect)} />}
      {/* Glow overlay if present */}
      {glowEffect && <div style={{ ...glowToCSS(glowEffect), position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
    </div>
  );
}; 