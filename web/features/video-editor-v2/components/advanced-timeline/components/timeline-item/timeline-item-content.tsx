import React, { useRef, useEffect, useState, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { TimelineItemContentFactory } from './timeline-item-content-factory';
import { TimelineItemSkeleton } from './timeline-item-skeleton';
import { TrackItemType } from '../../types';
import { useWaveformProcessor } from '../../hooks/use-waveform-processor';
import { useThumbnailGenerator } from '../../hooks/use-thumbnail-generator';
import { useScrollState } from '../../contexts/scroll-state-context';
import { useMediaIssuesStore, selectClipHasIssues, selectHighlightedClipId } from '../../../../stores/media-issues-store';

/**
 * Loading phases for multi-tier lazy loading:
 * 
 * Phase 0 - SKELETON:  Ultra-lightweight placeholder (colored bar + label).
 *                      Rendered during active scrolling. No hooks fire.
 * Phase 1 - BASIC:     Full TimelineItemContentFactory renders (labels, badges,
 *                      type icons, resize handles). ResizeObserver attached.
 * Phase 2 - FULL:      Expensive hooks fire — waveform processing for audio,
 *                      thumbnail sprite generation for video. Triggered via
 *                      requestIdleCallback so it never blocks the main thread.
 */
const enum LoadPhase {
  SKELETON = 0,
  BASIC = 1,
  FULL = 2,
}

interface TimelineItemContentProps {
  label?: string;
  type?: TrackItemType | string;
  data?: any; // Type-specific data
  start?: number;
  end?: number;
  mediaStart?: number; // Media start position in source file
  mediaEnd?: number;   // Media end position in source file
  isHovering?: boolean; // Add hover state prop
  isSelected?: boolean; // Add selected state prop
  itemId?: string; // Add itemId to identify which item is being resized
  onThumbnailDisplayChange?: (isShowingThumbnails: boolean) => void; // Callback to notify when thumbnails are displayed
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
}

/** Delay (ms) after scroll stops before promoting from SKELETON → BASIC */
const SETTLE_DELAY_MS = 100;

export const TimelineItemContent: React.FC<TimelineItemContentProps> = memo(({
  label,
  type,
  data,
  start = 0,
  end = 0,
  mediaStart,
  isHovering = false,
  isSelected = false,
  itemId,
  onThumbnailDisplayChange,
  currentFrame,
  fps = 30,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [phase, setPhase] = useState<LoadPhase>(LoadPhase.SKELETON);

  // Read scroll state from context (provided by ScrollStateProvider in TimelineContent)
  const { isScrolling } = useScrollState();

  // Track whether we were ever settled (prevents re-skeletonizing on subsequent scrolls
  // after the item has already fully loaded)
  const hasFullyLoadedRef = useRef(false);

  // ──────────────────────────────────────────────────────────
  // Phase transitions
  // ──────────────────────────────────────────────────────────

  // SKELETON → BASIC: after scroll stops and a short settle delay
  useEffect(() => {
    // If already at BASIC or FULL, no-op (we never go back to skeleton once loaded)
    if (phase >= LoadPhase.BASIC || hasFullyLoadedRef.current) return;

    // If still scrolling, stay at SKELETON
    if (isScrolling) return;

    // Scroll stopped — promote to BASIC after settle delay
    const timer = setTimeout(() => {
      setPhase(LoadPhase.BASIC);
    }, SETTLE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isScrolling, phase]);

  // BASIC → FULL: use requestIdleCallback to avoid blocking the main thread
  useEffect(() => {
    if (phase !== LoadPhase.BASIC) return;

    let handle: number;
    const hasIdleCallback = typeof window.requestIdleCallback === 'function';

    if (hasIdleCallback) {
      // Use requestIdleCallback for non-urgent loading of expensive content
      handle = window.requestIdleCallback(() => {
        setPhase(LoadPhase.FULL);
        hasFullyLoadedRef.current = true;
      }, { timeout: 500 }); // Force within 500ms even if browser stays busy
    } else {
      // Fallback for browsers without rIC
      handle = window.setTimeout(() => {
        setPhase(LoadPhase.FULL);
        hasFullyLoadedRef.current = true;
      }, 50) as unknown as number;
    }

    return () => {
      if (hasIdleCallback) {
        window.cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [phase]);

  // ──────────────────────────────────────────────────────────
  // Phase 0: SKELETON — return early, no expensive work
  // ──────────────────────────────────────────────────────────

  if (phase === LoadPhase.SKELETON && !hasFullyLoadedRef.current) {
    return (
      <div ref={containerRef} className="flex-1 min-w-0 h-full">
        <TimelineItemSkeleton label={label} type={type as TrackItemType} />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────
  // Phase 1+: BASIC / FULL content (hooks below only run in these phases)
  // ──────────────────────────────────────────────────────────

  return (
    <TimelineItemContentInner
      containerRef={containerRef}
      label={label}
      type={type}
      data={data}
      start={start}
      end={end}
      mediaStart={mediaStart}
      isHovering={isHovering}
      isSelected={isSelected}
      itemId={itemId}
      onThumbnailDisplayChange={onThumbnailDisplayChange}
      currentFrame={currentFrame}
      fps={fps}
      dimensions={dimensions}
      setDimensions={setDimensions}
      enableExpensiveHooks={phase >= LoadPhase.FULL}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Inner component for Phase 1/2 — contains all the expensive hooks
// Separated so that Phase 0 (skeleton) never mounts these hooks at all.
// ─────────────────────────────────────────────────────────────────────────────

interface TimelineItemContentInnerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  label?: string;
  type?: TrackItemType | string;
  data?: any;
  start: number;
  end: number;
  mediaStart?: number;
  isHovering: boolean;
  isSelected: boolean;
  itemId?: string;
  onThumbnailDisplayChange?: (isShowingThumbnails: boolean) => void;
  currentFrame?: number;
  fps: number;
  dimensions: { width: number; height: number };
  setDimensions: (dims: { width: number; height: number }) => void;
  enableExpensiveHooks: boolean;
}

const TimelineItemContentInner: React.FC<TimelineItemContentInnerProps> = memo(({
  containerRef,
  label,
  type,
  data,
  start,
  end,
  mediaStart,
  isHovering,
  isSelected,
  itemId,
  onThumbnailDisplayChange,
  currentFrame,
  fps,
  dimensions,
  setDimensions,
  enableExpensiveHooks,
}) => {
  // Calculate audio content timing
  const audioContentStart = type === TrackItemType.AUDIO
    ? (mediaStart !== undefined
        ? mediaStart
        : (data?.startFromSound !== undefined ? data.startFromSound : 0))
    : 0;

  // Generate waveform data for audio items — only in Phase 2 (FULL)
  const waveformResult = useWaveformProcessor(
    type === TrackItemType.AUDIO && data?.src && enableExpensiveHooks ? data.src : undefined,
    audioContentStart,
    end - start
  );

  // Generate thumbnail data — only in Phase 2 (FULL)
  const thumbnailResult = useThumbnailGenerator(
    type === TrackItemType.VIDEO && enableExpensiveHooks
      ? {
          videoId: data?.content,
          videoSrc: data?.src || data?.originalUrl,
          duration: end - start,
          itemWidth: dimensions.width,
          itemHeight: dimensions.height,
        }
      : {
          videoId: null,
          videoSrc: null,
          duration: 0,
          itemWidth: 0,
          itemHeight: 0,
        }
  );

  // Augment data with waveform/thumbnail information
  const enhancedData = type === TrackItemType.AUDIO
    ? {
        ...data,
        waveformData: waveformResult.data,
        isLoadingWaveform: waveformResult.isLoading,
        clipId: itemId,
      }
    : type === TrackItemType.VIDEO
    ? {
        ...data,
        spriteUrl: thumbnailResult.spriteUrl,
        rectForTime: thumbnailResult.rectForTime,
        isLoadingThumbnails: thumbnailResult.isLoading,
        thumbnailError: thumbnailResult.error,
        intervalSec: thumbnailResult.intervalSec,
        mediaStart: mediaStart,
      }
    : data;

  // Measure the container dimensions to pass to type-specific components
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateDimensions();

    // Update dimensions on resize
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Check if this clip has media issues
  const hasIssues = useMediaIssuesStore(
    useCallback((s) => itemId ? selectClipHasIssues(itemId)(s) : false, [itemId])
  );

  // Check if this clip is currently highlighted from the issues panel
  const isHighlighted = useMediaIssuesStore(
    useCallback((s) => itemId ? selectHighlightedClipId(s) === itemId : false, [itemId])
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 min-w-0 h-full relative",
        isHighlighted && "ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent rounded-sm animate-pulse"
      )}
    >
      {/* Keep content visible during resize to allow visual alignment with thumbnails/waveforms */}
      {dimensions.width > 0 && (
        <TimelineItemContentFactory
          type={type}
          label={label}
          data={enhancedData}
          itemWidth={dimensions.width}
          itemHeight={dimensions.height}
          start={start}
          end={end}
          isHovering={isHovering}
          isSelected={isSelected}
          onThumbnailDisplayChange={onThumbnailDisplayChange}
          currentFrame={currentFrame}
          fps={fps}
        />
      )}

      {/* Media issue warning badge */}
      {hasIssues && (
        <div
          className="absolute top-0.5 right-1 z-10 w-4 h-4 flex items-center justify-center rounded-sm bg-amber-500/90"
          title="This clip has media issues"
        >
          <span className="text-[10px] font-bold text-black leading-none">⚠</span>
        </div>
      )}
    </div>
  );
});
 