import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioChunk } from '@/types/video';

export interface SequenceState {
  isPlaying: boolean;
  currentChunkIndex: number;
  totalTime: number; // Global time across all chunks
  duration: number; // Total duration of all chunks
  currentTimeInChunk: number;
  isLoading: boolean; // Whether audio is still loading
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

interface ChunkDuration {
  duration: number;
  start: number;
  end: number;
}

export function useSequencedAudio(chunks: AudioChunk[]) {
  const [state, setState] = useState<SequenceState>({
    isPlaying: false,
    currentChunkIndex: 0,
    totalTime: 0,
    duration: 0,
    currentTimeInChunk: 0,
    isLoading: true,
  });

  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  const chunkDurationsRef = useRef<ChunkDuration[]>([]);
  const currentChunkIndexRef = useRef<number>(0); // Track current chunk for callbacks

  // Preload all audio clips and get their durations
  useEffect(() => {
    if (chunks.length === 0) {
      setState(prev => ({ ...prev, duration: 0, isLoading: false }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));
    
    const loadPromises: Promise<{ index: number; duration: number }>[] = [];
    
    chunks.forEach((chunk, index) => {
      const promise = new Promise<{ index: number; duration: number }>((resolve) => {
        // Check if we have explicit duration from backend
        if (chunk.duration_seconds && chunk.duration_seconds > 0) {
          resolve({ index, duration: chunk.duration_seconds });
          return;
        }
        
        // Otherwise, load the audio to get duration
        const audio = new Audio();
        audio.preload = 'metadata';
        
        const handleLoaded = () => {
          const duration = audio.duration || 0;
          preloadedAudioRefs.current.set(index, audio);
          resolve({ index, duration });
        };
        
        const handleError = () => {
          // Use authoritative duration from TTS backend — never fall back to an arbitrary value.
          // chunk.duration_seconds is always set by the audio worker; if it's missing, that's a pipeline bug.
          const backendDuration = chunk.duration_seconds;
          if (backendDuration && backendDuration > 0) {
            console.warn(`[useSequencedAudio] Audio chunk ${index} failed to load in browser — using backend duration ${backendDuration.toFixed(2)}s`);
            resolve({ index, duration: backendDuration });
          } else {
            console.error(`[useSequencedAudio] Audio chunk ${index} failed to load AND has no backend duration — this is a pipeline bug`);
            resolve({ index, duration: 0 }); // 0 = skip, prevents silent misalignment
          }
        };
        
        audio.addEventListener('loadedmetadata', handleLoaded, { once: true });
        audio.addEventListener('error', handleError, { once: true });
        audio.src = chunk.url;
      });
      
      loadPromises.push(promise);
    });

    Promise.all(loadPromises).then((results) => {
      // Sort by index and calculate timeframes
      results.sort((a, b) => a.index - b.index);
      
      let totalTime = 0;
      const durations: ChunkDuration[] = results.map((result) => {
        const start = totalTime;
        const duration = result.duration;
        totalTime += duration;
        return { duration, start, end: totalTime };
      });
      
      chunkDurationsRef.current = durations;
      setState(prev => ({ ...prev, duration: totalTime, isLoading: false }));
    });

    return () => {
      // Cleanup preloaded audio
      preloadedAudioRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      preloadedAudioRefs.current.clear();
    };
  }, [chunks]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (state.isPlaying) {
      audioRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      audioRef.current.play().catch(e => console.error("Play failed:", e));
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.isPlaying]);

  // Handle Seek (Global)
  const seekTo = useCallback((time: number) => {
    const durations = chunkDurationsRef.current;
    if (durations.length === 0) return;

    // Find which chunk this time belongs to
    let targetIndex = durations.findIndex(
      (d) => time >= d.start && time < d.end
    );
    
    // If time is at or past the end, clamp to last chunk
    if (targetIndex === -1) {
      targetIndex = durations.length - 1;
      time = Math.min(time, durations[targetIndex].end - 0.01);
    }

    const chunkStart = durations[targetIndex].start;
    const offsetInChunk = Math.max(0, time - chunkStart);

    // Determine if we need to switch sources
    const needsSwitch = targetIndex !== state.currentChunkIndex;

    // Update ref for use in callbacks
    currentChunkIndexRef.current = targetIndex;

    setState(prev => ({
      ...prev,
      currentChunkIndex: targetIndex,
      totalTime: time,
      currentTimeInChunk: offsetInChunk
    }));

    if (audioRef.current) {
      if (needsSwitch) {
        audioRef.current.src = chunks[targetIndex].url;
        audioRef.current.currentTime = offsetInChunk;
        audioRef.current.playbackRate = playbackSpeed;
        if (state.isPlaying) {
          audioRef.current.play().catch(() => {});
        }
      } else {
        audioRef.current.currentTime = offsetInChunk;
      }
    }
  }, [chunks, state.currentChunkIndex, state.isPlaying, playbackSpeed]);

  // Setup Audio Event Listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "auto";

    // Initialize first chunk
    if (chunks.length > 0) {
      audio.src = chunks[0].url;
    }

    const onTimeUpdate = () => {
      const durations = chunkDurationsRef.current;
      const chunkIndex = currentChunkIndexRef.current;
      const currentChunkStart = durations[chunkIndex]?.start || 0;
      const currentGlobal = currentChunkStart + audio.currentTime;
      setState(prev => ({
        ...prev,
        totalTime: currentGlobal,
        currentTimeInChunk: audio.currentTime
      }));
    };

    const onEnded = () => {
      // Move to next chunk if available
      setState(prev => {
        const nextIndex = prev.currentChunkIndex + 1;
        if (nextIndex < chunks.length) {
          // Update ref for callbacks
          currentChunkIndexRef.current = nextIndex;
          // Play next
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.src = chunks[nextIndex].url;
              audioRef.current.playbackRate = playbackSpeed;
              audioRef.current.play().catch(() => {});
            }
          }, 0);
          return {
            ...prev,
            currentChunkIndex: nextIndex,
            currentTimeInChunk: 0,
          };
        } else {
          // End of sequence - reset to beginning
          currentChunkIndexRef.current = 0;
          return {
            ...prev,
            isPlaying: false,
            totalTime: prev.duration,
            currentChunkIndex: 0,
            currentTimeInChunk: 0
          };
        }
      });
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [chunks.length]);

  // Handle regeneration (chunk url change at specific index)
  useEffect(() => {
    if (audioRef.current && chunks[state.currentChunkIndex]) {
      const currentSrc = audioRef.current.src;
      const newUrl = chunks[state.currentChunkIndex].url;
      
      if (newUrl && !currentSrc.endsWith(newUrl) && !currentSrc.includes(newUrl)) {
        const wasPlaying = !audioRef.current.paused;
        
        audioRef.current.src = newUrl;
        audioRef.current.currentTime = 0;
        audioRef.current.playbackRate = playbackSpeed;
        
        if (wasPlaying) audioRef.current.play().catch(() => {});
      }
    }
  }, [chunks, state.currentChunkIndex, playbackSpeed]);

  // Apply playback speed when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Skip to previous chunk
  const skipToPrevChunk = useCallback(() => {
    const durations = chunkDurationsRef.current;
    if (state.currentChunkIndex <= 0 || durations.length === 0) return;
    
    const prevIndex = state.currentChunkIndex - 1;
    const targetTime = durations[prevIndex]?.start ?? 0;
    seekTo(targetTime);
  }, [state.currentChunkIndex, seekTo]);

  // Skip to next chunk
  const skipToNextChunk = useCallback(() => {
    const durations = chunkDurationsRef.current;
    if (durations.length === 0) return;
    if (state.currentChunkIndex >= chunks.length - 1) return;
    
    const nextIndex = state.currentChunkIndex + 1;
    const targetTime = durations[nextIndex]?.start ?? 0;
    seekTo(targetTime);
  }, [state.currentChunkIndex, chunks.length, seekTo]);

  // Navigate to specific chunk
  const goToChunk = useCallback((index: number) => {
    const durations = chunkDurationsRef.current;
    if (index < 0 || index >= chunks.length || durations.length === 0) return;
    
    const targetTime = durations[index]?.start ?? 0;
    seekTo(targetTime);
  }, [chunks.length, seekTo]);

  return {
    state,
    togglePlay,
    seekTo,
    skipToPrevChunk,
    skipToNextChunk,
    goToChunk,
    playbackSpeed,
    setPlaybackSpeed,
  };
}
