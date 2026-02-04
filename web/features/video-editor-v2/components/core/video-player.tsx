import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Main } from "../../utils/remotion/main";
import { useEditorContext } from "../../contexts/editor-context";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import { clipsToOverlaysWithTracks } from "../../utils/clip-to-render-adapter";
import { MaskManipulationOverlay } from "./mask-manipulation-overlay";
import { ShapeManipulationOverlay } from "./shape-manipulation-overlay";
import { Mask } from "../../types/masks";
import { ShapeOverlay, OverlayType } from "../../types";
import { getInterpolatedValue } from "../../utils/keyframe-interpolator";
import type { PropertyKeyframes } from "../../types/keyframes";

/**
 * Props for the VideoPlayer component
 * @interface VideoPlayerProps
 * @property {React.RefObject<PlayerRef>} [playerRef] - Optional reference to the Remotion player instance (overrides context playerRef)
 * @property {string} [className] - Optional CSS class name
 * @property {React.CSSProperties} [style] - Optional inline styles
 * @property {boolean} [isPlayerOnly] - Whether to render in player-only mode (no editor UI)
 */
export interface VideoPlayerProps {
  playerRef?: React.RefObject<PlayerRef>;
  className?: string;
  style?: React.CSSProperties;
  isPlayerOnly?: boolean;
}

/**
 * VideoPlayer component that renders a responsive video editor with clip support
 * Uses the unified VideoEditorStore for all state management.
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  playerRef: externalPlayerRef,
  className,
  style,
  isPlayerOnly = false,
}) => {
  // Get config from context
  const { playerRef: contextPlayerRef, fps: contextFps, isScrubbingRef } = useEditorContext();
  
  // Get state directly from the unified store
  const timelineClips = useVideoEditorStore(state => state.clips) || [];
  const timelineTracks = useVideoEditorStore(state => state.tracks) || [];
  const transitions = useVideoEditorStore(state => state.transitions) || {};
  const selectedClipIds = useVideoEditorStore(state => state.selection?.clipIds) || [];
  const aspectRatio = useVideoEditorStore(state => state.aspectRatio) || '16:9';
  const resolution = useVideoEditorStore(state => state.resolution) || '1080p';
  const playerDimensions = useVideoEditorStore(state => state.playerDimensions) || { width: 1920, height: 1080 };
  const storeFps = useVideoEditorStore(state => state.fps);
  const fps = storeFps || contextFps || 30;
  const playbackRate = useVideoEditorStore(state => state.playback?.playbackRate) || 1;
  const showAlignmentGuides = useVideoEditorStore(state => state.showAlignmentGuides) ?? true;
  const backgroundColor = useVideoEditorStore(state => state.backgroundColor) || '#000000';
  const durationInFrames = useVideoEditorStore(state => {
    if (!state.clips || state.clips.length === 0) return 900; // default 30 seconds at 30fps
    const maxEndTime = Math.max(...state.clips.map(c => c.startTime + c.duration));
    return Math.ceil(maxEndTime * (state.fps || 30));
  });
  
  // Get current time for animation-aware positioning
  const currentTime = useVideoEditorStore(state => state.playback?.currentTime) || 0;
  
  // Get actions from store
  const selectClip = useVideoEditorStore(state => state.selectClip);
  const updateClip = useVideoEditorStore(state => state.updateClip);
  const setPlayerDimensions = useVideoEditorStore(state => state.setPlayerDimensions) || (() => {});
  const setCurrentTime = useVideoEditorStore(state => state.setCurrentTime);

  // Use external playerRef if provided, otherwise use context playerRef
  const playerRef = externalPlayerRef || contextPlayerRef;
  
  // Sync player's current frame to store (for text/shape placement at playhead)
  useEffect(() => {
    const updateStoreTime = () => {
      // Skip updates while scrubbing to prevent circular updates
      if (isScrubbingRef.current) return;
      
      if (playerRef?.current) {
        const currentFrame = playerRef.current.getCurrentFrame();
        const timeInSeconds = currentFrame / fps;
        setCurrentTime(timeInSeconds);
      }
    };
    
    // Update immediately on mount
    updateStoreTime();
    
    // Poll for updates while playing (Remotion Player doesn't have a frame callback)
    // Skips updates while scrubbing to prevent lag
    const interval = setInterval(() => {
      updateStoreTime();
    }, 100); // Update 10 times per second
    
    return () => clearInterval(interval);
  }, [playerRef, fps, setCurrentTime, isScrubbingRef]);

  // State to track actual container dimensions
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  
  // Ref to track the container element
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate aspect ratio dimensions
  const getAspectRatioDimensions = useCallback(() => {
    // Resolution heights
    const resolutionHeights: Record<string, number> = {
      '720p': 720,
      '1080p': 1080,
      '1440p': 1440,
      '4k': 2160,
    };
    
    // Aspect ratio multipliers
    const aspectRatios: Record<string, number> = {
      '16:9': 16/9,
      '9:16': 9/16,
      '1:1': 1,
      '4:5': 4/5,
    };
    
    const height = resolutionHeights[resolution] || 1080;
    const ratio = aspectRatios[aspectRatio] || 16/9;
    const width = Math.round(height * ratio);
    
    return { width, height };
  }, [aspectRatio, resolution]);

  /**
   * Updates the player dimensions when the container size or aspect ratio changes
   */
  useEffect(() => {
    const handleDimensionUpdate = (containerElement: Element) => {
      const { width, height } = containerElement.getBoundingClientRect();
      setContainerDimensions({ width, height });
      setPlayerDimensions({ width, height });
    };

    let containerElement: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    
    if (isPlayerOnly) {
      containerElement = containerRef.current;
    } else {
      containerElement = document.querySelector(".video-container");
    }
    
    if (containerElement) {
      handleDimensionUpdate(containerElement);
      
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          handleDimensionUpdate(entry.target);
        }
      });
      
      resizeObserver.observe(containerElement);
    }

    const handleOrientationChange = () => {
      setTimeout(() => {
        if (containerElement) {
          handleDimensionUpdate(containerElement);
        }
      }, 100);
    };
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, [aspectRatio, setPlayerDimensions, isPlayerOnly]);

  // Get composition dimensions
  const { width: compositionWidth, height: compositionHeight } = getAspectRatioDimensions();

  // Player configuration - memoized to prevent unnecessary re-renders
  const PLAYER_CONFIG = useMemo(() => ({
    durationInFrames: Math.round(durationInFrames),
    fps: fps,
  }), [durationInFrames, fps]);

  // Calculate optimal player size
  const playerSize = useMemo(() => {
    const containerWidth = containerDimensions.width || playerDimensions.width;
    const containerHeight = containerDimensions.height || playerDimensions.height;
    
    return {
      width: Math.min(containerWidth, compositionWidth),
      height: Math.min(containerHeight, compositionHeight),
    };
  }, [containerDimensions, playerDimensions, compositionWidth, compositionHeight]);

  // Convert clips to overlays for Remotion compatibility
  const overlays = useMemo(() => {
    const converted = clipsToOverlaysWithTracks(timelineClips, timelineTracks, fps, transitions);
    console.log('[VideoPlayer] Converted clips to overlays:', {
      clipCount: timelineClips.length,
      overlayCount: converted.length,
      transitionCount: Object.keys(transitions).length,
      audioClips: timelineClips.filter(c => c.type === 'audio').map(c => ({
        id: c.id,
        audioEffects: c.audioEffects,
        effectCount: c.audioEffects?.length || 0,
      })),
    });
    return converted;
  }, [timelineClips, timelineTracks, fps, transitions]);

  // Get the first selected clip ID for single selection and convert to numeric overlay ID
  const selectedOverlayId = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const clipId = selectedClipIds[0];
    // Convert clip ID to numeric overlay ID (same logic as clip-to-render-adapter)
    return parseInt(clipId.replace(/\D/g, ''), 10) || null;
  }, [selectedClipIds]);

  // Adapter for setSelectedOverlayId to use the new selectClip action
  // Remotion passes a numeric overlay ID, we need to find the corresponding clip ID
  // Uses getState() to avoid recreating callback when clips change (performance optimization)
  const setSelectedOverlayId = useCallback((overlayId: number | null) => {
    if (overlayId === null) {
      selectClip(null);
      return;
    }
    
    // Get current clips from store (avoids making this callback depend on timelineClips)
    const currentClips = useVideoEditorStore.getState().clips || [];
    
    // Find the clip that corresponds to this numeric overlay ID
    const matchingClip = currentClips.find(clip => {
      const numericId = parseInt(clip.id.replace(/\D/g, ''), 10) || 0;
      return numericId === overlayId;
    });
    
    if (matchingClip) {
      selectClip(matchingClip.id);
    } else {
      console.warn('[VideoPlayer] setSelectedOverlayId: No clip found for overlay ID:', overlayId);
    }
  }, [selectClip]);

  // Adapter for changeOverlay to update clip via store
  // The Remotion components call changeOverlay(overlayId, updater) where:
  // - overlayId is a NUMBER (converted from clip ID by stripping non-digits)
  // - updater is a FUNCTION (overlay: Overlay) => Overlay
  // 
  // PREMIERE PRO-STYLE AUTO-KEYFRAMING:
  // When a property has keyframing enabled, canvas manipulations automatically
  // create/update keyframes at the current playhead position instead of
  // updating the base clip values.
  const changeOverlay = useCallback((overlayId: number, updater: (overlay: any) => any) => {
    // Get current state from store
    const store = useVideoEditorStore.getState();
    const currentClips = store.clips || [];
    const currentTime = store.playback?.currentTime ?? 0;
    
    // Find the clip that corresponds to this numeric overlay ID
    const matchingClip = currentClips.find(clip => {
      const numericId = parseInt(clip.id.replace(/\D/g, ''), 10) || 0;
      return numericId === overlayId;
    });
    
    if (!matchingClip) {
      console.warn('[VideoPlayer] changeOverlay: No clip found for overlay ID:', overlayId);
      return;
    }
    
    // Get the current overlay (convert clip to overlay format)
    const currentOverlay = {
      id: overlayId,
      left: matchingClip.transform?.x ?? 0,
      top: matchingClip.transform?.y ?? 0,
      width: matchingClip.transform?.width ?? 100,
      height: matchingClip.transform?.height ?? 100,
      rotation: matchingClip.transform?.rotation ?? 0,
      scale: (matchingClip.transform as any)?.scale ?? 1,
      ...matchingClip,
    };
    
    // Call the updater function to get the new values
    const updatedOverlay = updater(currentOverlay);
    
    // Helper to check if a property has keyframing enabled
    const isPropertyKeyframed = (propertyPath: string): boolean => {
      const keyframes = matchingClip.keyframes;
      if (!keyframes) return false;
      const propKf = keyframes.find((pk: any) => pk.propertyPath === propertyPath);
      return propKf?.enabled === true;
    };
    
    // Get selected keyframes from store
    const keyframeSelection = store.keyframeSelection;
    
    // Helper to check if there are selected keyframes for a property
    const getSelectedKeyframesForProperty = (propertyPath: string): string[] => {
      if (!keyframeSelection) return [];
      if (keyframeSelection.clipId !== matchingClip.id) return [];
      if (keyframeSelection.propertyPath !== propertyPath) return [];
      return keyframeSelection.keyframeIds || [];
    };
    
    // Helper to add/update keyframe for a property
    // PREMIERE PRO BEHAVIOR: If keyframes are selected for this property, update those.
    // Otherwise, create/update at current playhead time.
    const updateKeyframeForProperty = (propertyPath: string, value: number) => {
      const selectedKfIds = getSelectedKeyframesForProperty(propertyPath);
      
      if (selectedKfIds.length > 0) {
        // Update selected keyframes instead of creating new ones
        selectedKfIds.forEach(kfId => {
          store.updateKeyframe(matchingClip.id, propertyPath, kfId, { value });
        });
      } else {
        // No selection - create/update at current playhead time
        const relativeTime = Math.max(0, currentTime - matchingClip.startTime);
        const clampedTime = Math.min(relativeTime, matchingClip.duration);
        store.addKeyframe(matchingClip.id, propertyPath, clampedTime, value);
      }
    };
    
    // Convert overlay properties back to clip format
    const clipUpdates: Record<string, any> = {};
    
    // Check if transform properties were changed
    const leftChanged = updatedOverlay.left !== currentOverlay.left;
    const topChanged = updatedOverlay.top !== currentOverlay.top;
    const widthChanged = updatedOverlay.width !== currentOverlay.width;
    const heightChanged = updatedOverlay.height !== currentOverlay.height;
    const rotationChanged = updatedOverlay.rotation !== currentOverlay.rotation;
    const scaleChanged = updatedOverlay.scale !== undefined && updatedOverlay.scale !== currentOverlay.scale;
    
    // Handle each transform property - either keyframe it or update base value
    if (leftChanged || topChanged || widthChanged || heightChanged || rotationChanged || scaleChanged) {
      // Start with current transform
      const newTransform = { ...matchingClip.transform };
      
      // Position X
      if (leftChanged) {
        if (isPropertyKeyframed('transform.x')) {
          updateKeyframeForProperty('transform.x', updatedOverlay.left);
        } else {
          newTransform.x = updatedOverlay.left;
        }
      }
      
      // Position Y
      if (topChanged) {
        if (isPropertyKeyframed('transform.y')) {
          updateKeyframeForProperty('transform.y', updatedOverlay.top);
        } else {
          newTransform.y = updatedOverlay.top;
        }
      }
      
      // Width
      if (widthChanged) {
        // Width doesn't have keyframing yet, always update base value
        newTransform.width = updatedOverlay.width;
      }
      
      // Height
      if (heightChanged) {
        // Height doesn't have keyframing yet, always update base value
        newTransform.height = updatedOverlay.height;
      }
      
      // Rotation
      if (rotationChanged) {
        if (isPropertyKeyframed('transform.rotation')) {
          updateKeyframeForProperty('transform.rotation', updatedOverlay.rotation);
        } else {
          newTransform.rotation = updatedOverlay.rotation;
        }
      }
      
      // Scale
      if (scaleChanged) {
        if (isPropertyKeyframed('transform.scale')) {
          updateKeyframeForProperty('transform.scale', updatedOverlay.scale);
        } else {
          (newTransform as any).scale = updatedOverlay.scale;
        }
      }
      
      // Only include transform update if non-keyframed properties changed
      const hasNonKeyframedChanges = 
        (leftChanged && !isPropertyKeyframed('transform.x')) ||
        (topChanged && !isPropertyKeyframed('transform.y')) ||
        widthChanged ||
        heightChanged ||
        (rotationChanged && !isPropertyKeyframed('transform.rotation')) ||
        (scaleChanged && !isPropertyKeyframed('transform.scale'));
      
      if (hasNonKeyframedChanges) {
        clipUpdates.transform = newTransform;
      }
    }
    
    // Check for style property changes - merge with existing styles
    if (updatedOverlay.styles) {
      const updatedStyles = updatedOverlay.styles;
      const currentStyles = currentOverlay.styles || {};
      
      // Only update if styles actually changed
      if (JSON.stringify(updatedStyles) !== JSON.stringify(currentStyles)) {
        // Check for opacity change with keyframing
        if (updatedStyles.opacity !== undefined && updatedStyles.opacity !== currentStyles.opacity) {
          if (isPropertyKeyframed('transform.opacity')) {
            updateKeyframeForProperty('transform.opacity', updatedStyles.opacity);
            // Don't include in clipUpdates if keyframed
            const stylesWithoutOpacity = { ...updatedStyles };
            delete stylesWithoutOpacity.opacity;
            if (Object.keys(stylesWithoutOpacity).length > 0) {
              clipUpdates.styles = {
                ...(matchingClip.styles || {}),
                ...stylesWithoutOpacity,
              };
            }
          } else {
        clipUpdates.styles = {
          ...(matchingClip.styles || {}),
          ...updatedStyles,
        };
          clipUpdates.opacity = updatedStyles.opacity;
          }
        } else {
          clipUpdates.styles = {
            ...(matchingClip.styles || {}),
            ...updatedStyles,
          };
        }
      }
    }
    
    // Check for volume changes
    if (updatedOverlay.volume !== undefined && updatedOverlay.volume !== currentOverlay.volume) {
      clipUpdates.volume = updatedOverlay.volume;
    }
    
    // Effects array
    if (updatedOverlay.effects !== undefined && JSON.stringify(updatedOverlay.effects) !== JSON.stringify(currentOverlay.effects)) {
      clipUpdates.effects = updatedOverlay.effects;
    }
    
    // Masks array
    if (updatedOverlay.masks !== undefined && JSON.stringify(updatedOverlay.masks) !== JSON.stringify(currentOverlay.masks)) {
      clipUpdates.masks = updatedOverlay.masks;
    }
    
    // Only update if there are actual changes
    if (Object.keys(clipUpdates).length > 0) {
      updateClip(matchingClip.id, clipUpdates);
    }
  }, [updateClip]);

  // Editor input props for Remotion
  const editorInputProps = useMemo(() => ({
    overlays,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps: fps,
    width: compositionWidth,
    height: compositionHeight,
    showAlignmentGuides,
    backgroundColor,
  }), [
    overlays,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps,
    compositionWidth,
    compositionHeight,
    showAlignmentGuides,
    backgroundColor,
  ]);

  // Player-only input props (no guides)
  const playerOnlyInputProps = useMemo(() => ({
    overlays,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps: fps,
    width: compositionWidth,
    height: compositionHeight,
    showAlignmentGuides: false,
    backgroundColor,
  }), [
    overlays,
    setSelectedOverlayId,
    changeOverlay,
    selectedOverlayId,
    durationInFrames,
    fps,
    compositionWidth,
    compositionHeight,
    backgroundColor,
  ]);

  // Handler to deselect clips when clicking on the background
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setSelectedOverlayId(null);
    }
  };

  // Ref for the player wrapper to measure its rendered size
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const [renderedPlayerSize, setRenderedPlayerSize] = useState({ width: 0, height: 0 });

  // Calculate the actual video area within the player (accounting for aspect ratio)
  // The player maintains composition aspect ratio, so we need to find the actual video bounds
  const videoAreaDimensions = useMemo(() => {
    if (renderedPlayerSize.width === 0 || renderedPlayerSize.height === 0) {
      return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
    }
    
    const containerAspect = renderedPlayerSize.width / renderedPlayerSize.height;
    const videoAspect = compositionWidth / compositionHeight;
    
    let videoWidth: number;
    let videoHeight: number;
    let offsetX = 0;
    let offsetY = 0;
    
    if (containerAspect > videoAspect) {
      // Container is wider - video is letterboxed (pillarboxed actually - black bars on sides)
      videoHeight = renderedPlayerSize.height;
      videoWidth = videoHeight * videoAspect;
      offsetX = (renderedPlayerSize.width - videoWidth) / 2;
    } else {
      // Container is taller - video is pillarboxed (letterboxed - black bars on top/bottom)
      videoWidth = renderedPlayerSize.width;
      videoHeight = videoWidth / videoAspect;
      offsetY = (renderedPlayerSize.height - videoHeight) / 2;
    }
    
    return { width: videoWidth, height: videoHeight, offsetX, offsetY };
  }, [renderedPlayerSize, compositionWidth, compositionHeight]);

  // Track rendered player size for mask overlay positioning
  useEffect(() => {
    if (!playerWrapperRef.current) return;
    
    const updateSize = () => {
      if (playerWrapperRef.current) {
        const rect = playerWrapperRef.current.getBoundingClientRect();
        setRenderedPlayerSize({ width: rect.width, height: rect.height });
      }
    };
    
    updateSize();
    
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(playerWrapperRef.current);
    
    return () => resizeObserver.disconnect();
  }, []);

  // Get the selected clip and its masks for the overlay
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    return timelineClips.find(c => c.id === selectedClipIds[0]) || null;
  }, [selectedClipIds, timelineClips]);

  const selectedClipMasks = useMemo(() => {
    return (selectedClip?.masks as Mask[]) || [];
  }, [selectedClip]);

  // Calculate the overlay's bounds within the video area
  // The clip's transform uses COMPOSITION PIXEL coordinates (not percentages!)
  // We need to scale these to the rendered video area size
  // IMPORTANT: Uses keyframed/animated values so masks follow the item during animation
  const overlayBounds = useMemo(() => {
    if (!selectedClip || videoAreaDimensions.width === 0) {
      return { x: 0, y: 0, width: videoAreaDimensions.width, height: videoAreaDimensions.height };
    }
    
    // Calculate time relative to clip start for keyframe interpolation
    const clipRelativeTime = Math.max(0, currentTime - selectedClip.startTime);
    
    // Helper to get interpolated value for a property
    const getAnimatedValue = (propertyPath: string, defaultValue: number): number => {
      if (!selectedClip.keyframes) return defaultValue;
      const propKf = selectedClip.keyframes.find(
        (pk: PropertyKeyframes) => pk.propertyPath === propertyPath
      );
      if (!propKf || !propKf.enabled || propKf.keyframes.length === 0) {
        return defaultValue;
      }
      const interpolated = getInterpolatedValue(propKf, clipRelativeTime, defaultValue);
      return typeof interpolated === 'number' ? interpolated : defaultValue;
    };
    
    // Get clip's transform with keyframe animation support
    // Falls back to static transform values if no keyframes exist
    const clipX = getAnimatedValue('transform.x', selectedClip.transform?.x ?? 0);
    const clipY = getAnimatedValue('transform.y', selectedClip.transform?.y ?? 0);
    const clipWidth = getAnimatedValue('transform.width', selectedClip.transform?.width ?? compositionWidth);
    const clipHeight = getAnimatedValue('transform.height', selectedClip.transform?.height ?? compositionHeight);
    
    // Calculate scale factor from composition to rendered video area
    const scaleX = videoAreaDimensions.width / compositionWidth;
    const scaleY = videoAreaDimensions.height / compositionHeight;
    
    // Scale composition pixel coordinates to rendered pixel coordinates
    const x = clipX * scaleX;
    const y = clipY * scaleY;
    const width = clipWidth * scaleX;
    const height = clipHeight * scaleY;
    
    return { x, y, width, height };
  }, [selectedClip, videoAreaDimensions, compositionWidth, compositionHeight, currentTime]);

  // Calculate the overlay's aspect ratio for mask calculations
  // This is the actual pixel aspect ratio of the overlay element
  const overlayAspectRatio = useMemo(() => {
    if (overlayBounds.width === 0 || overlayBounds.height === 0) {
      // Fallback to composition aspect ratio
      const ratios: Record<string, number> = {
        '16:9': 16/9,
        '9:16': 9/16,
        '1:1': 1,
        '4:5': 4/5,
        '4:3': 4/3,
        '21:9': 21/9,
      };
      const fallback = ratios[aspectRatio] || 16/9;
      return fallback;
    }
    const ratio = overlayBounds.width / overlayBounds.height;
    return ratio;
  }, [overlayBounds, aspectRatio]);

  // Callback to update masks for the selected clip
  const handleUpdateMasks = useCallback((newMasks: Mask[]) => {
    if (selectedClipIds.length !== 1) return;
    updateClip(selectedClipIds[0], { masks: newMasks });
  }, [selectedClipIds, updateClip]);

  // Check if selected clip is a shape
  const selectedShapeClip = useMemo(() => {
    if (selectedClipIds.length !== 1 || !selectedClip) return null;
    if (selectedClip.type === 'shape') {
      return selectedClip;
    }
    return null;
  }, [selectedClipIds, selectedClip]);

  // Callback to update shape properties
  const handleUpdateShapeStyles = useCallback((styleUpdates: Partial<ShapeOverlay['styles']>) => {
    if (selectedClipIds.length !== 1) return;
    const clip = timelineClips.find(c => c.id === selectedClipIds[0]);
    if (clip && clip.type === 'shape') {
      updateClip(selectedClipIds[0], {
        styles: {
          ...clip.styles,
          ...styleUpdates,
        },
      });
    }
  }, [selectedClipIds, timelineClips, updateClip]);

  return (
    <div ref={containerRef} className={`w-full h-full overflow-hidden ${className || ''}`} style={style}>
      {!isPlayerOnly ? (
        /* Editor mode: Grid background container */
        <div
          className="z-0 video-container relative w-full h-full select-none
          bg-muted
          bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] 
          dark:bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)]
          bg-size-[16px_16px] 
          shadow-lg"
          onClick={handleBackgroundClick}
        >
          <div 
            className="z-10 absolute inset-2 sm:inset-4 flex items-center justify-center"
            onClick={handleBackgroundClick}
          >
            <div
              ref={playerWrapperRef}
              className="relative mx-2 sm:mx-0"
              style={{
                width: Math.min(playerDimensions.width, compositionWidth),
                height: Math.min(playerDimensions.height, compositionHeight),
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            >
              <Player
                ref={playerRef}
                className="w-full h-full"
                component={Main}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                durationInFrames={PLAYER_CONFIG.durationInFrames}
                fps={PLAYER_CONFIG.fps}
                playbackRate={playbackRate}
                acknowledgeRemotionLicense={true}
                inputProps={editorInputProps}
                errorFallback={() => <></>}
                overflowVisible
              />
              
              {/* Mask Manipulation Overlay - only show when a clip with masks is selected */}
              {selectedClipIds.length === 1 && selectedClipMasks.length > 0 && overlayBounds.width > 0 && (
                <MaskManipulationOverlay
                  containerWidth={overlayBounds.width}
                  containerHeight={overlayBounds.height}
                  offsetX={videoAreaDimensions.offsetX + overlayBounds.x}
                  offsetY={videoAreaDimensions.offsetY + overlayBounds.y}
                  clipId={selectedClipIds[0]}
                  masks={selectedClipMasks}
                  onUpdateMasks={handleUpdateMasks}
                  aspectRatio={overlayAspectRatio}
                />
              )}

              {/* Shape Manipulation Overlay - only show when a shape clip is selected */}
              {selectedShapeClip && overlayBounds.width > 0 && (
                <ShapeManipulationOverlay
                  containerWidth={overlayBounds.width}
                  containerHeight={overlayBounds.height}
                  offsetX={videoAreaDimensions.offsetX + overlayBounds.x}
                  offsetY={videoAreaDimensions.offsetY + overlayBounds.y}
                  shape={selectedShapeClip as any as ShapeOverlay}
                  onUpdateShape={handleUpdateShapeStyles}
                  aspectRatio={overlayAspectRatio}
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Player-only mode: Simple centered container */
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div
            className="relative"
            style={{
              width: playerSize.width,
              height: playerSize.height,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <Player
              ref={playerRef}
              className="w-full h-full"
              component={Main}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              style={{
                width: "100%",
                height: "100%",
              }}
              acknowledgeRemotionLicense={true}
              durationInFrames={PLAYER_CONFIG.durationInFrames}
              fps={PLAYER_CONFIG.fps}
              playbackRate={playbackRate}
              inputProps={playerOnlyInputProps}
              errorFallback={() => <></>}
              overflowVisible
            />
          </div>
        </div>
      )}
    </div>
  );
};
