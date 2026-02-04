/**
 * useOptimizedScrubbing - High-performance playhead scrubbing hook
 * 
 * Architecture (Split Update Rates):
 * - STORE UPDATES (60fps via RAF): For smooth UI playhead movement
 * - PLAYER SEEKS (20fps via timer): For Remotion rendering (can't keep up at 60fps)
 * 
 * This separation ensures:
 * - Timeline playhead moves smoothly at 60fps (reads from store)
 * - Video preview updates at 20fps (Remotion's comfortable rate)
 * - No circular updates (polling suspended via isScrubbingRef)
 * 
 * Data Flow:
 *   Mouse Move → RAF → setCurrentTime(store) → Timeline reads → Playhead moves (60fps)
 *                   ↘ Timer → playerRef.seekTo() → Video updates (20fps)
 */

import { useCallback, useRef, useMemo } from 'react';
import { useVideoEditorStore } from '../stores/video-editor-store';
import { useEditorContext } from '../contexts/editor-context';

// Video seek throttle interval (50ms = 20fps)
// Remotion player can comfortably render at this rate
const VIDEO_SEEK_INTERVAL_MS = 50;

interface UseScrubbingOptions {
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  pauseDuringScrub?: boolean;
  /** Callback fired on every time update (for additional UI effects) */
  onLocalTimeChange?: (time: number) => void;
}

interface ScrubbingResult {
  startScrubbing: () => void;
  updateTime: (time: number) => void;
  endScrubbing: () => void;
  /** Current scrubbing time ref - updates instantly */
  localTimeRef: React.MutableRefObject<number>;
  /** Whether currently scrubbing */
  isScrubbing: boolean;
}

export function useOptimizedScrubbing(options: UseScrubbingOptions = {}): ScrubbingResult {
  const { onScrubStart, onScrubEnd, pauseDuringScrub = true, onLocalTimeChange } = options;
  
  const { playerRef, fps: contextFps, isScrubbingRef } = useEditorContext();
  const setCurrentTime = useVideoEditorStore(state => state.setCurrentTime);
  const pause = useVideoEditorStore(state => state.pause);
  const play = useVideoEditorStore(state => state.play);
  const isPlaying = useVideoEditorStore(state => state.playback.isPlaying);
  const storeFps = useVideoEditorStore(state => state.fps);
  const fps = storeFps || contextFps || 30;
  
  // === REFS ===
  /** Current time value */
  const localTimeRef = useRef<number>(0);
  /** RAF ID for store updates */
  const rafIdRef = useRef<number | null>(null);
  /** Pending time for RAF update */
  const pendingStoreTimeRef = useRef<number | null>(null);
  /** Last video seek timestamp */
  const lastSeekTimeRef = useRef<number>(0);
  /** Pending time for video seek */
  const pendingSeekTimeRef = useRef<number | null>(null);
  /** Timer ID for video seek throttling */
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Was playing before scrub */
  const wasPlayingRef = useRef(false);
  
  /**
   * Seek the video player (throttled to 20fps)
   */
  const seekPlayer = useCallback((time: number) => {
    if (playerRef?.current) {
      const frame = Math.round(time * fps);
      playerRef.current.seekTo(frame);
    }
    lastSeekTimeRef.current = performance.now();
  }, [playerRef, fps]);
  
  /**
   * Schedule video seek at throttled rate (20fps)
   */
  const scheduleVideoSeek = useCallback((time: number) => {
    const now = performance.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;
    
    if (timeSinceLastSeek >= VIDEO_SEEK_INTERVAL_MS) {
      // Enough time passed, seek immediately
      seekPlayer(time);
      pendingSeekTimeRef.current = null;
    } else {
      // Store pending and schedule
      pendingSeekTimeRef.current = time;
      
      if (seekTimerRef.current === null) {
        const remainingTime = VIDEO_SEEK_INTERVAL_MS - timeSinceLastSeek;
        seekTimerRef.current = setTimeout(() => {
          seekTimerRef.current = null;
          if (pendingSeekTimeRef.current !== null) {
            seekPlayer(pendingSeekTimeRef.current);
            pendingSeekTimeRef.current = null;
          }
        }, remainingTime);
      }
    }
  }, [seekPlayer]);
  
  /**
   * Schedule store update via RAF (60fps for smooth UI)
   */
  const scheduleStoreUpdate = useCallback((time: number) => {
    pendingStoreTimeRef.current = time;
    
    if (rafIdRef.current !== null) {
      return; // Already scheduled
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      
      if (pendingStoreTimeRef.current !== null) {
        // Update store - this triggers React re-renders for timeline playhead
        setCurrentTime(pendingStoreTimeRef.current);
        pendingStoreTimeRef.current = null;
      }
    });
  }, [setCurrentTime]);
  
  /**
   * Start scrubbing
   */
  const startScrubbing = useCallback(() => {
    if (isScrubbingRef.current) return;
    
    isScrubbingRef.current = true;
    wasPlayingRef.current = isPlaying;
    
    if (pauseDuringScrub && isPlaying) {
      pause();
    }
    
    onScrubStart?.();
  }, [isPlaying, pause, pauseDuringScrub, onScrubStart, isScrubbingRef]);
  
  /**
   * Update time during scrubbing
   * - Store updates at 60fps (RAF) for smooth playhead
   * - Video seeks at 20fps (timer) for Remotion
   */
  const updateTime = useCallback((time: number) => {
    if (!isScrubbingRef.current) return;
    
    // Update local ref instantly
    localTimeRef.current = time;
    
    // Optional callback for additional UI effects
    onLocalTimeChange?.(time);
    
    // SMOOTH (60fps): Update store for timeline playhead
    scheduleStoreUpdate(time);
    
    // THROTTLED (20fps): Seek video player
    scheduleVideoSeek(time);
  }, [scheduleStoreUpdate, scheduleVideoSeek, onLocalTimeChange, isScrubbingRef]);
  
  /**
   * End scrubbing
   */
  const endScrubbing = useCallback(() => {
    if (!isScrubbingRef.current) return;
    
    // Cancel pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    
    // Cancel pending seek timer
    if (seekTimerRef.current !== null) {
      clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    
    // Apply final position to both store and player
    const finalTime = localTimeRef.current;
    setCurrentTime(finalTime);
    seekPlayer(finalTime);
    
    pendingStoreTimeRef.current = null;
    pendingSeekTimeRef.current = null;
    
    // Clear scrubbing flag
    isScrubbingRef.current = false;
    
    // Resume playback if needed
    if (pauseDuringScrub && wasPlayingRef.current) {
      play();
    }
    
    onScrubEnd?.();
  }, [setCurrentTime, seekPlayer, play, pauseDuringScrub, onScrubEnd, isScrubbingRef]);
  
  return useMemo(() => ({
    startScrubbing,
    updateTime,
    endScrubbing,
    localTimeRef,
    isScrubbing: isScrubbingRef.current,
  }), [startScrubbing, updateTime, endScrubbing, isScrubbingRef]);
}
