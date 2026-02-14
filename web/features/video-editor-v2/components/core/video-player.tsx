import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Main } from "../../utils/remotion/main";
import { useEditorContext } from "../../contexts/editor-context";
import { useVideoEditorStore, selectDurationInFrames } from "../../stores/video-editor-store";
import type { TimelineClip } from "../../types/timeline-v2";
import { selectOverlays } from "../../stores/memoized-render-selectors";
import { clipIdToNumeric } from "../../utils/clip-to-render-adapter";
import { SelectionOverlays } from "./selection-overlays";

/**
 * Props for the VideoPlayer component
 * @interface VideoPlayerProps
 * @property {React.RefObject<PlayerRef>} [playerRef] - Optional reference to the Remotion player instance (overrides context playerRef)
 * @property {string} [className] - Optional CSS class name
 * @property {React.CSSProperties} [style] - Optional inline styles
 * @property {boolean} [isPlayerOnly] - Whether to render in player-only mode (no editor UI)
 */
export interface VideoPlayerProps {
  playerRef?: React.RefObject<PlayerRef | null>;
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
  // PERF: selectOverlays is memoized via reselect — only recomputes when clips/tracks/transitions/fps change
  const overlays = useVideoEditorStore(selectOverlays);
  // PERF: selectedOverlayId subscription removed — SortedOutlines now reads it
  // directly from the store. This prevents the entire VideoPlayer + Remotion Player
  // from re-rendering on every selection change.
  // PERF: selectedClipIds subscription removed — it caused full VideoPlayer re-renders
  // on every selection change, busting all downstream useMemos and re-rendering the
  // Remotion Player. Mask/shape overlays are now in SelectionOverlays component.
  const aspectRatio = useVideoEditorStore(state => state.aspectRatio) || '16:9';
  const resolution = useVideoEditorStore(state => state.resolution) || '1080p';
  const playerDimensions = useVideoEditorStore(state => state.playerDimensions) || { width: 1920, height: 1080 };
  const storeFps = useVideoEditorStore(state => state.fps);
  const fps = storeFps || contextFps || 30;
  const playbackRate = useVideoEditorStore(state => state.playback?.playbackRate) || 1;
  const showAlignmentGuides = useVideoEditorStore(state => state.showAlignmentGuides) ?? true;
  const backgroundColor = useVideoEditorStore(state => state.backgroundColor) || '#000000';
  // Memoized selector — only recomputes when clips or fps actually change
  const durationInFrames = useVideoEditorStore(selectDurationInFrames) || 900;
  
  // NOTE: currentTime subscription removed — it was only used to pass to SelectionOverlays.
  // SelectionOverlays now reads it directly from the store, avoiding a full VideoPlayer
  // re-render every 500ms during playback.
  
  // Get actions from store
  const selectClip = useVideoEditorStore(state => state.selectClip);
  const updateClip = useVideoEditorStore(state => state.updateClip);
  const setPlayerDimensions = useVideoEditorStore(state => state.setPlayerDimensions) || (() => {});
  const setCurrentTime = useVideoEditorStore(state => state.setCurrentTime);

  // Use external playerRef if provided, otherwise use context playerRef
  const playerRef = externalPlayerRef || contextPlayerRef;
  
  // Sync player's current frame to store (for text/shape placement at playhead)
  // PERF: Writes to store at 2×/sec instead of 10×/sec to avoid cascading re-renders.
  // Each store write creates a new playback object reference, triggering re-renders
  // in every component that subscribes to playback state. 500ms is sufficient for
  // UI features that read currentTime (inspector panel, keyframe nav, etc.).
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
    // Throttled to 500ms (2×/sec) to minimize store-triggered re-render cascades
    const interval = setInterval(() => {
      updateStoreTime();
    }, 500);
    
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

  // NOTE: overlays are computed via memoized selector at the top (selectOverlays).
  // selectedOverlayId is no longer subscribed here — SortedOutlines reads it from store directly.

  // Adapter for setSelectedOverlayId to use the new selectClip action
  // Remotion passes a numeric overlay ID, we need to find the corresponding clip ID
  // Uses getState() to avoid recreating callback when clips change (performance optimization)
  const setSelectedOverlayId = useCallback((overlayId: number | null) => {
    if (overlayId === null) {
      selectClip(null);
      return;
    }
    
    // Get current clips from store (avoids making this callback depend on timelineClips)
    const currentClips = Object.values(useVideoEditorStore.getState().clips) as TimelineClip[];
    
    // Find the clip that corresponds to this numeric overlay ID
    const matchingClip = currentClips.find((clip: TimelineClip) => {
      const numericId = clipIdToNumeric(clip.id);
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
    const currentClips = Object.values(store.clips) as TimelineClip[];
    const currentTime = store.playback?.currentTime ?? 0;
    
    // Find the clip that corresponds to this numeric overlay ID
    const matchingClip = currentClips.find((clip: TimelineClip) => {
      const numericId = clipIdToNumeric(clip.id);
      return numericId === overlayId;
    });
    
    if (!matchingClip) {
      console.warn('[VideoPlayer] changeOverlay: No clip found for overlay ID:', overlayId);
      return;
    }
    
    const { id: _clipId, ...clipRest } = matchingClip;
    const currentOverlay = {
      id: overlayId,
      left: matchingClip.transform?.x ?? 0,
      top: matchingClip.transform?.y ?? 0,
      width: matchingClip.transform?.width ?? 100,
      height: matchingClip.transform?.height ?? 100,
      rotation: matchingClip.transform?.rotation ?? 0,
      scale: (matchingClip.transform as any)?.scale ?? 1,
      ...clipRest,
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

  // PERF: selectedOverlayId is no longer passed — SortedOutlines reads it
  // directly from the Zustand store. This means VideoPlayer doesn't re-render
  // on selection change, and the value is always fresh (eliminates stale-value bug).
  const editorInputProps = useMemo(() => ({
    overlays,
    setSelectedOverlayId,
    changeOverlay,
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

  // PERF: Mask/shape overlay logic moved to SelectionOverlays component.
  // This prevents selection changes from re-rendering VideoPlayer + Remotion Player.

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
                inputProps={editorInputProps as any}
                numberOfSharedAudioTags={16}
                errorFallback={({error}) => (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', color: '#ff6b6b', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
                    <span>Player error: {error.message}</span>
                  </div>
                )}
                overflowVisible
              />
              
              {/* PERF: Selection-dependent overlays isolated from VideoPlayer */}
              <SelectionOverlays
                videoAreaDimensions={videoAreaDimensions}
                compositionWidth={compositionWidth}
                compositionHeight={compositionHeight}
                aspectRatio={aspectRatio}
                fps={fps}
              />
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
              inputProps={playerOnlyInputProps as any}
              numberOfSharedAudioTags={16}
              errorFallback={({error}) => (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', color: '#ff6b6b', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
                  <span>Player error: {error.message}</span>
                </div>
              )}
              overflowVisible
            />
          </div>
        </div>
      )}
    </div>
  );
};
