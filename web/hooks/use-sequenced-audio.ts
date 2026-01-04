
import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioChunk } from '@/types/video';

export interface SequenceState {
  isPlaying: boolean;
  currentChunkIndex: number;
  totalTime: number; // Global time across all chunks
  duration: number; // Total duration of all chunks
  currentTimeInChunk: number;
}

export function useSequencedAudio(chunks: AudioChunk[]) {
  const [state, setState] = useState<SequenceState>({
    isPlaying: false,
    currentChunkIndex: 0,
    totalTime: 0,
    duration: 0,
    currentTimeInChunk: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0); // Start time of current chunk in global timeline

  // Calculate total duration and start times for each chunk
  const timeframeRef = useRef<{ start: number; end: number }[]>([]);

  useEffect(() => {
    let total = 0;
    const timeframes = chunks.map((chunk) => {
        const start = total;
        // Prefer explicit duration, fallback to estimate or 0
        // (Real duration updates when metadata loads)
        const dur = chunk.duration_seconds || 0;
        total += dur;
        return { start, end: total };
    });
    timeframeRef.current = timeframes;
    setState(prev => ({ ...prev, duration: total }));
  }, [chunks]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (state.isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(e => console.error("Play failed:", e));
    }
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, [state.isPlaying]);

  // Handle Seek (Global)
  const seekTo = useCallback((time: number) => {
    // Find which chunk this time belongs to
    const index = timeframeRef.current.findIndex(
      (tf) => time >= tf.start && time < tf.end
    );
    
    // If time is the exact end, clamp to last chunk end
    const targetIndex = index === -1 ? chunks.length - 1 : index;
    if (targetIndex < 0) return;

    const chunkStart = timeframeRef.current[targetIndex].start;
    const offsetInChunk = time - chunkStart;

    // Determine if we need to switch sources
    const needsSwitch = targetIndex !== state.currentChunkIndex;

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
             // If we were playing, keep playing. 
             // Note: source change might stop playback, need explicit play
             if (state.isPlaying) {
                 audioRef.current.play().catch(() => {});
             }
        } else {
            audioRef.current.currentTime = offsetInChunk;
        }
    }
  }, [chunks, state.currentChunkIndex, state.isPlaying]);

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
        const chunkStart = timeframeRef.current[state.currentChunkIndex]?.start || 0;
        const currentGlobal = chunkStart + audio.currentTime;
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
                // Play next
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current.src = chunks[nextIndex].url;
                        audioRef.current.play().catch(() => {});
                    }
                }, 0);
                return {
                    ...prev,
                    currentChunkIndex: nextIndex,
                    currentTimeInChunk: 0,
                };
            } else {
                // End of sequence
                return {
                    ...prev,
                    isPlaying: false,
                    totalTime: 0,
                    currentChunkIndex: 0,
                    currentTimeInChunk: 0
                };
            }
        });
    };
    
    const onLoadedMetadata = () => {
        // Update the duration of the current chunk in our map if strictly needed?
        // Ideally backend provides accurate duration. For now trust backend.
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
        audio.pause();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [chunks.length]); // Re-init if chunks totally change (not ideal for regeneration, need refine)

  // Handle regeneration (chunk url change at specific index)
  useEffect(() => {
     if (audioRef.current && chunks[state.currentChunkIndex]) {
         const currentSrc = audioRef.current.src;
         const newUrl = chunks[state.currentChunkIndex].url;
         
         // Only update if current playing chunk URL changed (but checking full URL might tricky with blobs/relative)
         if (!currentSrc.includes(newUrl) && newUrl) {
             const wasPlaying = !audioRef.current.paused;
             const currentTime = audioRef.current.currentTime;
             
             audioRef.current.src = newUrl;
             audioRef.current.currentTime = currentTime; // Try to keep position? Or reset?
             // Reset to 0 usually safer for new audio
             audioRef.current.currentTime = 0; 
             
             if (wasPlaying) audioRef.current.play().catch(() => {});
         }
     }
  }, [chunks, state.currentChunkIndex]);

  return {
    state,
    togglePlay,
    seekTo,
  };
}
