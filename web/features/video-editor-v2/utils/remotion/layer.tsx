import React, { useMemo, memo } from "react";
import { Sequence, interpolate, useCurrentFrame, Easing, useVideoConfig } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";

import { Overlay, EasingPreset, EASING_BEZIER_CURVES, TransitionEasing, OverlayType } from "../../types";
import type { PropertyKeyframes } from "../../types/keyframes";
import { LayerContent } from "./layer-content";
import { useKeyframedTransform, useKeyframedNumber } from "../../hooks/use-keyframed-value";
import { TrackMatteLayer, getTrackMatte, isTrackMatteSource } from "./components/track-matte-layer";
import { useVideoEditorStore } from "../../stores/video-editor-store";

/**
 * Custom comparison function for Layer memo
 * Only re-renders when meaningful overlay properties change
 * This prevents unnecessary re-renders during drag operations on other overlays
 * 
 * IMPORTANT: If keyframes are enabled, we MUST allow re-renders on every frame
 * so that useKeyframedTransform can recalculate interpolated values
 */
const areLayerPropsEqual = (
  prevProps: { overlay: Overlay; baseUrl?: string; fontInfos?: Record<string, FontInfo>; allOverlays?: Overlay[] },
  nextProps: { overlay: Overlay; baseUrl?: string; fontInfos?: Record<string, FontInfo>; allOverlays?: Overlay[] }
): boolean => {
  const prev = prevProps.overlay;
  const next = nextProps.overlay;
  
  // Check if allOverlays changed (for track matte relationships)
  // We do a shallow length check first for performance
  if (prevProps.allOverlays?.length !== nextProps.allOverlays?.length) return false;
  
  // CRITICAL: If overlay has active keyframes, ALWAYS re-render
  // This is necessary because useKeyframedTransform needs to run on every frame
  // to calculate interpolated values based on the current playback time
  const nextKeyframes = (next as any).keyframes;
  if (nextKeyframes && Array.isArray(nextKeyframes)) {
    const hasActiveKeyframes = nextKeyframes.some(
      (pk: any) => pk.enabled && pk.keyframes && pk.keyframes.length > 0
    );
    if (hasActiveKeyframes) {
      // Allow re-render on every frame for animated overlays
      return false;
    }
  }
  
  // Quick reference check - if same object, no need to re-render
  if (prev === next) return true;
  
  // Check critical properties for visual rendering
  if (prev.id !== next.id) return false;
  if (prev.left !== next.left) return false;
  if (prev.top !== next.top) return false;
  if (prev.width !== next.width) return false;
  if (prev.height !== next.height) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.row !== next.row) return false;
  if (prev.from !== next.from) return false;
  if (prev.durationInFrames !== next.durationInFrames) return false;
  if (prev.type !== next.type) return false;
  
  // Check if content changed (for text, captions, etc.)
  if ((prev as any).content !== (next as any).content) return false;
  if ((prev as any).text !== (next as any).text) return false;
  
  // Check if source changed (for video/image/audio)
  if ((prev as any).src !== (next as any).src) return false;
  
  // Check audio-specific properties
  if ((prev as any).playbackRate !== (next as any).playbackRate) return false;
  if ((prev as any).toneFrequency !== (next as any).toneFrequency) return false;
  
  // Skip isDragging comparison - we don't want to re-render just because dragging state changed
  // The visual position is handled by CSS transforms in SelectionOutline
  
  // Check masks - critical for visual rendering
  const prevMasks = (prev as any).masks;
  const nextMasks = (next as any).masks;
  if (prevMasks !== nextMasks) {
    if (JSON.stringify(prevMasks) !== JSON.stringify(nextMasks)) {
      return false;
    }
  }
  
  // Check effects - critical for visual rendering
  const prevEffects = (prev as any).effects;
  const nextEffects = (next as any).effects;
  if (prevEffects !== nextEffects) {
    if (JSON.stringify(prevEffects) !== JSON.stringify(nextEffects)) {
      return false;
    }
  }
  
  // Check audioEffects - critical for audio rendering
  const prevAudioEffects = (prev as any).audioEffects;
  const nextAudioEffects = (next as any).audioEffects;
  if (prevAudioEffects !== nextAudioEffects) {
    if (JSON.stringify(prevAudioEffects) !== JSON.stringify(nextAudioEffects)) {
      return false;
    }
  }
  
  // Check styles object - only re-render if styles actually changed
  const prevStyles = (prev as any).styles;
  const nextStyles = (next as any).styles;
  if (prevStyles !== nextStyles) {
    if (JSON.stringify(prevStyles) !== JSON.stringify(nextStyles)) {
      return false;
    }
  }
  
  // Check greenscreen settings
  const prevGreenscreen = (prev as any).greenscreen;
  const nextGreenscreen = (next as any).greenscreen;
  if (prevGreenscreen !== nextGreenscreen) {
    if (JSON.stringify(prevGreenscreen) !== JSON.stringify(nextGreenscreen)) {
      return false;
    }
  }
  
  // Check keyframes structure changed (but active keyframes are handled above)
  const prevKeyframes = (prev as any).keyframes;
  if (prevKeyframes !== nextKeyframes) {
    if (JSON.stringify(prevKeyframes) !== JSON.stringify(nextKeyframes)) {
      return false;
    }
  }
  
  // Check transitions - critical for visual rendering (video/sound overlays only)
  const prevInTransition = (prev as any).inTransition;
  const nextInTransition = (next as any).inTransition;
  if (prevInTransition !== nextInTransition) {
    if (JSON.stringify(prevInTransition) !== JSON.stringify(nextInTransition)) {
      return false;
    }
  }
  
  const prevOutTransition = (prev as any).outTransition;
  const nextOutTransition = (next as any).outTransition;
  if (prevOutTransition !== nextOutTransition) {
    if (JSON.stringify(prevOutTransition) !== JSON.stringify(nextOutTransition)) {
      return false;
    }
  }
  
  // Check other props
  if (prevProps.baseUrl !== nextProps.baseUrl) return false;
  if (prevProps.fontInfos !== nextProps.fontInfos) return false;
  
  return true;
};

/**
 * Convert easing configuration to Remotion easing function
 */
const getEasingFunction = (easing?: TransitionEasing): ((t: number) => number) => {
  if (!easing) return Easing.linear;
  
  let bezier: [number, number, number, number];
  
  if (easing.preset === EasingPreset.CUSTOM && easing.bezier) {
    bezier = easing.bezier;
  } else if (easing.preset !== EasingPreset.CUSTOM) {
    bezier = EASING_BEZIER_CURVES[easing.preset];
  } else {
    return Easing.linear;
  }
  
  return Easing.bezier(...bezier);
};

/**
 * TransitionWrapper - Applies ALL transition effects (in, out, and between) uniformly
 * 
 * This component handles ALL transition types the same way:
 * - crossfade, fade, fadeToBlack, fadeToWhite
 * - zoomIn, zoomOut
 * - slideLeft, slideRight, slideUp, slideDown
 * - crossBlur
 * - wipeLeft, wipeRight, wipeUp, wipeDown
 * - irisCircle, irisRectangle
 * 
 * Transition behavior:
 * - IN transition: Effect plays from _absoluteStartTime to _absoluteEndTime (clip fades in)
 * - OUT transition: Effect plays from _absoluteStartTime to _absoluteEndTime (clip fades out)
 * - BETWEEN transition: Treated as OUT for first clip, IN for second clip
 *   Both clips render during overlap, creating the crossfade effect
 */
const TransitionWrapper: React.FC<{
  children: React.ReactNode;
  overlay: Overlay;
  durationInFrames: number;
}> = ({ children, overlay, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps: FPS } = useVideoConfig();

  // Check if overlay has transitions (ClipOverlay, ImageOverlay, and SoundOverlay)
  const hasTransitions = overlay.type === "video" || overlay.type === "image" || overlay.type === "sound";
  if (!hasTransitions) {
    return <>{children}</>;
  }

  const typedOverlay = overlay as any;
  const inTransition = typedOverlay.inTransition;
  const outTransition = typedOverlay.outTransition;
  
  // If no transitions at all, just render children
  if (!inTransition && !outTransition) {
    return <>{children}</>;
  }
  
  // The clip's absolute start time in seconds (overlay.from is in frames)
  const clipStartTimeSeconds = overlay.from / FPS;

  let opacity = 1;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let filter = '';
  let clipPath = '';

  /**
   * Calculate transition frame range relative to this clip
   * SIMPLIFIED: All transitions have _absoluteStartTime and _absoluteEndTime
   */
  const getTransitionFrames = (transition: any): { start: number; end: number } => {
    const absStart = transition._absoluteStartTime;
    const absEnd = transition._absoluteEndTime;
    
    // Convert absolute timeline times to frames relative to clip start
    return {
      start: Math.round((absStart - clipStartTimeSeconds) * FPS),
      end: Math.round((absEnd - clipStartTimeSeconds) * FPS),
    };
  };

  // Apply IN transition (clip fades in from 0 to 1)
  // Before transition: invisible. During: fading in. After: visible.
  if (inTransition && inTransition._absoluteStartTime !== undefined) {
    const { start: transitionStartFrame, end: transitionEndFrame } = getTransitionFrames(inTransition);
    
    const easingFn = getEasingFunction(inTransition.easing);
    const interpolateOptions = { 
      extrapolateLeft: 'clamp' as const, 
      extrapolateRight: 'clamp' as const, 
      easing: easingFn 
    };
    
    // Before the transition starts, clip should be invisible
    if (frame < transitionStartFrame) {
      opacity = 0;
    } else if (frame < transitionEndFrame) {
      // During the transition, interpolate
      switch (inTransition.type) {
        case "crossfade":
        case "fade":
        case "fadeToBlack":
        case "fadeToWhite":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          break;
        case "zoomIn":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          scale = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0.5, 1], interpolateOptions);
          break;
        case "zoomOut":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          scale = interpolate(frame, [transitionStartFrame, transitionEndFrame], [1.5, 1], interpolateOptions);
          break;
        case "slideLeft":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          translateX = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          break;
        case "slideRight":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          translateX = interpolate(frame, [transitionStartFrame, transitionEndFrame], [-100, 0], interpolateOptions);
          break;
        case "slideUp":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          translateY = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          break;
        case "slideDown":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          translateY = interpolate(frame, [transitionStartFrame, transitionEndFrame], [-100, 0], interpolateOptions);
          break;
        case "crossBlur":
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
          const blurIn = interpolate(frame, [transitionStartFrame, transitionEndFrame], [10, 0], interpolateOptions);
          filter = `blur(${blurIn}px)`;
          break;
        case "wipeLeft":
          const wipeLeftProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          clipPath = `inset(0 ${wipeLeftProgress}% 0 0)`;
          break;
        case "wipeRight":
          const wipeRightProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          clipPath = `inset(0 0 0 ${wipeRightProgress}%)`;
          break;
        case "wipeUp":
          const wipeUpProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          clipPath = `inset(${wipeUpProgress}% 0 0 0)`;
          break;
        case "wipeDown":
          const wipeDownProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [100, 0], interpolateOptions);
          clipPath = `inset(0 0 ${wipeDownProgress}% 0)`;
          break;
        case "irisCircle":
          const irisCircleSize = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 75], interpolateOptions);
          clipPath = `circle(${irisCircleSize}% at 50% 50%)`;
          break;
        case "irisRectangle":
          const irisRectProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [50, 0], interpolateOptions);
          clipPath = `inset(${irisRectProgress}% ${irisRectProgress}% ${irisRectProgress}% ${irisRectProgress}%)`;
          break;
        default:
          opacity = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 1], interpolateOptions);
      }
    }
    // After transition ends, opacity stays at 1 (default)
  }

  // Apply OUT transition (clip fades out from 1 to 0)
  // Before transition: visible. During: fading out. After: invisible.
  if (outTransition && outTransition._absoluteStartTime !== undefined) {
    const { start: transitionStartFrame, end: transitionEndFrame } = getTransitionFrames(outTransition);
    
    const outEasingFn = getEasingFunction(outTransition.easing);
    const outInterpolateOptions = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const, easing: outEasingFn };
    
    // After the transition ends, clip should be invisible
    if (frame >= transitionEndFrame) {
      opacity = 0;
    } else if (frame >= transitionStartFrame) {
      // During the transition, interpolate
      switch (outTransition.type) {
        case "crossfade":
        case "fade":
        case "fadeToBlack":
        case "fadeToWhite":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          break;
        case "zoomIn":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          scale *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 1.5], outInterpolateOptions);
          break;
        case "zoomOut":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          scale *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0.5], outInterpolateOptions);
          break;
        case "slideLeft":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          translateX += interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, -100], outInterpolateOptions);
          break;
        case "slideRight":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          translateX += interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          break;
        case "slideUp":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          translateY += interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, -100], outInterpolateOptions);
          break;
        case "slideDown":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          translateY += interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          break;
        case "crossBlur":
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
          const blurOut = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 10], outInterpolateOptions);
          filter = filter ? `${filter} blur(${blurOut}px)` : `blur(${blurOut}px)`;
          break;
        case "wipeLeft":
          const wipeLeftOutProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          clipPath = `inset(0 0 0 ${wipeLeftOutProgress}%)`;
          break;
        case "wipeRight":
          const wipeRightOutProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          clipPath = `inset(0 ${wipeRightOutProgress}% 0 0)`;
          break;
        case "wipeUp":
          const wipeUpOutProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          clipPath = `inset(0 0 ${wipeUpOutProgress}% 0)`;
          break;
        case "wipeDown":
          const wipeDownOutProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 100], outInterpolateOptions);
          clipPath = `inset(${wipeDownOutProgress}% 0 0 0)`;
          break;
        case "irisCircle":
          const irisCircleOutSize = interpolate(frame, [transitionStartFrame, transitionEndFrame], [75, 0], outInterpolateOptions);
          clipPath = `circle(${irisCircleOutSize}% at 50% 50%)`;
          break;
        case "irisRectangle":
          const irisRectOutProgress = interpolate(frame, [transitionStartFrame, transitionEndFrame], [0, 50], outInterpolateOptions);
          clipPath = `inset(${irisRectOutProgress}% ${irisRectOutProgress}% ${irisRectOutProgress}% ${irisRectOutProgress}%)`;
          break;
        default:
          opacity *= interpolate(frame, [transitionStartFrame, transitionEndFrame], [1, 0], outInterpolateOptions);
      }
    }
  }

  const transitionStyle: React.CSSProperties = {
    opacity,
    transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
    width: '100%',
    height: '100%',
    ...(filter && { filter }),
    ...(clipPath && { clipPath, WebkitClipPath: clipPath }),
  };

  return <div style={transitionStyle}>{children}</div>;
};

/**
 * Props for the Layer component
 * @interface LayerProps
 * @property {Overlay} overlay - The overlay object containing position, dimensions, and content information
 * @property {string | undefined} baseUrl - The base URL for the video
 * @property {Record<string, FontInfo>} fontInfos - Font infos for rendering (populated during SSR/Lambda rendering)
 * @property {Overlay[]} allOverlays - All overlays in the composition (for track matte lookup)
 */
/**
 * Extended overlay type with keyframes support
 */
type OverlayWithKeyframes = Overlay & { keyframes?: PropertyKeyframes[] };

export const Layer: React.FC<{
  overlay: Overlay;
  baseUrl?: string;
  fontInfos?: Record<string, FontInfo>;
  allOverlays?: Overlay[];
}> = memo(({ overlay, baseUrl, fontInfos, allOverlays = [] }) => {
  // Get actual fps from Remotion video config
  const { fps } = useVideoConfig();
  
  // Check if this text overlay is being inline-edited
  const editingOverlayId = useVideoEditorStore(s => s.editingOverlayId);
  const isEditing = overlay.type === OverlayType.TEXT && editingOverlayId === overlay.id;
  
  // Cast overlay to include keyframes
  const overlayWithKeyframes = overlay as OverlayWithKeyframes;
  
  // Get keyframed transform values (uses current frame from Remotion)
  // This automatically interpolates position, scale, rotation, opacity based on keyframes
  // IMPORTANT: outsideSequence=true because useCurrentFrame() is called in Layer's body,
  // BEFORE the Sequence is returned. The Sequence only affects children's frame context,
  // not the parent component's hooks. So we need to manually convert global frame to relative.
  const keyframedTransform = useKeyframedTransform(overlayWithKeyframes, fps, true);
  
  /**
   * Memoized style calculations for the layer
   * Handles positioning, dimensions, rotation, and z-index based on:
   * - Overlay position (left, top) - with keyframe animation support
   * - Dimensions (width, height) - with keyframe animation support
   * - Rotation - with keyframe animation support
   * - Scale - with keyframe animation support
   * - Row position for z-index stacking
   * - Selection state for pointer events
   * - Blend mode from overlay styles
   *
   * @returns {React.CSSProperties} Computed styles for the layer
   */
  const style: React.CSSProperties = useMemo(() => {
    // Higher row numbers should be at the bottom
    // e.g. row 4 = z-index 60, row 0 = z-index 100
    const zIndex = 100 - (overlay.row || 0) * 10;

    // Get blend mode from overlay styles if available
    const overlayStyles = (overlay as any).styles;
    const mixBlendMode = overlayStyles?.mixBlendMode;

    // Use keyframed values if available, otherwise fall back to overlay values
    const left = keyframedTransform.x;
    const top = keyframedTransform.y;
    const width = keyframedTransform.width;
    const height = keyframedTransform.height;
    const rotation = keyframedTransform.rotation;
    const scale = keyframedTransform.scale;
    const opacity = keyframedTransform.opacity;

    // Build transform string (scale is applied in addition to rotation)
    const transformParts: string[] = [];
    if (rotation !== 0) {
      transformParts.push(`rotate(${rotation}deg)`);
    }
    if (scale !== 1) {
      transformParts.push(`scale(${scale})`);
    }
    const transform = transformParts.length > 0 ? transformParts.join(' ') : undefined;

    return {
      position: "absolute",
      left,
      top,
      width,
      height,
      ...(transform && { transform }),
      transformOrigin: "center center",
      zIndex,
      // Apply keyframed opacity
      ...(opacity !== 1 && { opacity }),
      // Disable pointer events normally - interaction via SelectionOutline
      // BUT enable them when inline text editing is active
      pointerEvents: isEditing ? "auto" : "none",
      // Apply blend mode if set
      ...(mixBlendMode && mixBlendMode !== 'normal' && { mixBlendMode }),
    };
  }, [
    overlay.row,
    (overlay as any).styles?.mixBlendMode,
    keyframedTransform.x,
    keyframedTransform.y,
    keyframedTransform.width,
    keyframedTransform.height,
    keyframedTransform.rotation,
    keyframedTransform.scale,
    keyframedTransform.opacity,
    isEditing,
  ]);

  /**
   * Special handling for sound overlays
   * Sound overlays don't need positioning or visual representation,
   * they just need to be sequenced correctly
   */
  if (overlay.type === "sound") {
    return (
      <Sequence
        key={overlay.id}
        from={overlay.from}
        durationInFrames={overlay.durationInFrames}
      >
        <TransitionWrapper overlay={overlay} durationInFrames={overlay.durationInFrames}>
          <LayerContent overlay={overlay} {...(baseUrl && { baseUrl })} {...(fontInfos && { fontInfos })} />
        </TransitionWrapper>
      </Sequence>
    );
  }

  /**
   * Track matte handling
   * If this overlay is used as a track matte source by another overlay,
   * it will be rendered inside that overlay's mask, so we skip rendering it here.
   */
  const isMatteSource = allOverlays.length > 0 && isTrackMatteSource(overlay.id, allOverlays);
  if (isMatteSource) {
    // This layer is a matte source - it will be rendered inside the target layer's mask
    // Return null to avoid double-rendering
    return null;
  }

  /**
   * Check if this overlay has a track matte configured
   */
  const trackMatte = getTrackMatte(overlay);
  const matteSourceOverlay = trackMatte 
    ? allOverlays.find(o => o.id === trackMatte.sourceOverlayId) 
    : null;

  /**
   * Render content - with or without track matte masking
   */
  const renderContent = () => {
    const content = (
      <LayerContent overlay={overlay} isEditing={isEditing} {...(baseUrl && { baseUrl })} {...(fontInfos && { fontInfos })} />
    );

    // If we have a valid track matte, wrap content in TrackMatteLayer
    if (trackMatte && matteSourceOverlay) {
      return (
        <TrackMatteLayer
          targetOverlay={overlay}
          matteSourceOverlay={matteSourceOverlay}
          trackMatte={trackMatte}
          baseUrl={baseUrl}
          fontInfos={fontInfos}
        >
          {content}
        </TrackMatteLayer>
      );
    }

    return content;
  };

  /**
   * Standard layer rendering for visual elements
   * Wraps the content in a Sequence for timing control and
   * a positioned div for layout management
   *
   * premountFor is used to preload assets before they appear, preventing
   * flickering at split points where a lower track video could briefly show through.
   * Note: premountFor requires removing layout="none" as the Sequence needs
   * a container to apply opacity: 0 and pointer-events: none during premount.
   * @see https://www.remotion.dev/docs/player/premounting
   */
  return (
    <Sequence
      key={overlay.id}
      from={overlay.from}
      durationInFrames={overlay.durationInFrames}
      premountFor={30}
    >
      <div style={style}>
        <TransitionWrapper overlay={overlay} durationInFrames={overlay.durationInFrames}>
          {renderContent()}
        </TransitionWrapper>
      </div>
    </Sequence>
  );
}, areLayerPropsEqual);
