import { useState, useEffect, useRef, useCallback } from "react";
import { PlayerRef } from "@remotion/player";

/**
 * Custom hook for managing video player functionality
 * @param fps - Frames per second for the video
 * @param externalPlayerRef - Optional external playerRef to use instead of creating internal one
 * @returns An object containing video player controls and state
 */
export const useVideoPlayer = (fps: number = 30, externalPlayerRef?: React.RefObject<PlayerRef>) => {
  // State management
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const internalPlayerRef = useRef<PlayerRef>(null);
  
  // Use external playerRef if provided, otherwise use internal one
  const playerRef = externalPlayerRef || internalPlayerRef;

  // Sync isPlaying state with actual player state
  useEffect(() => {
    if (playerRef.current) {
      const player = playerRef.current;
      
      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleEnded = () => setIsPlaying(false);
      
      // Add event listeners to sync state
      try {
        player.addEventListener?.('play', handlePlay);
        player.addEventListener?.('pause', handlePause);
        player.addEventListener?.('ended', handleEnded);
        
        return () => {
          player.removeEventListener?.('play', handlePlay);
          player.removeEventListener?.('pause', handlePause);
          player.removeEventListener?.('ended', handleEnded);
        };
      } catch (e) {
        // Fallback if event listeners aren't available
        console.warn('Player event listeners not available:', e);
        return undefined;
      }
    }
    return undefined;
  }, [playerRef]);

  // Frame update via Remotion's frameupdate event (replaces rAF polling)
  // This only fires when the frame actually changes — during playback or seeking
  useEffect(() => {
    if (!playerRef.current) return;
    const player = playerRef.current;

    const handleFrameUpdate = (e: { detail: { frame: number } }) => {
      setCurrentFrame(Math.round(e.detail.frame));
    };

    try {
      player.addEventListener('frameupdate', handleFrameUpdate as any);
      return () => {
        player.removeEventListener('frameupdate', handleFrameUpdate as any);
      };
    } catch (e) {
      console.warn('[useVideoPlayer] frameupdate listener not available:', e);
      return undefined;
    }
  }, [playerRef]);

  /**
   * Starts playing the video
   */
  const play = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, [playerRef]);

  /**
   * Pauses the video
   */
  const pause = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.pause();
      setIsPlaying(false);
    }
  }, [playerRef]);

  // Keep a ref to isPlaying for stable togglePlayPause callback
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  /**
   * Toggles between play and pause states
   * Uses ref to avoid dependency on isPlaying — keeps callback reference stable
   */
  const togglePlayPause = useCallback(() => {
    if (playerRef.current) {
      if (!isPlayingRef.current) {
        playerRef.current.play();
        setIsPlaying(true);
      } else {
        playerRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [playerRef]);

  /**
   * Converts frame count to formatted time string
   * @param frames - Number of frames to convert
   * @returns Formatted time string in MM:SS format
   */
  const formatTime = useCallback((frames: number) => {
    const totalSeconds = frames / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames2Digits = Math.floor(frames % fps)
      .toString()
      .padStart(2, "0");

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}.${frames2Digits}`;
  }, [fps]);

  /**
   * Seeks to a specific frame in the video
   * @param frame - Target frame number
   */
  const seekTo = useCallback(
    (frame: number) => {
      if (playerRef.current) {
        setCurrentFrame(frame);
        playerRef.current.seekTo(frame);
      }
    },
    [playerRef]
  );

  return {
    isPlaying,
    currentFrame,
    playerRef,
    togglePlayPause,
    formatTime,
    play,
    pause,
    seekTo,
  };
};
