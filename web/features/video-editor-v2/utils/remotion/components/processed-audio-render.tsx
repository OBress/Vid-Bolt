/**
 * ProcessedAudio for Remotion Rendering
 * 
 * During Remotion rendering (server-side, Lambda, CLI), this component:
 * 1. Uses OfflineAudioContext to process audio with effects
 * 2. Converts the processed buffer to a data URL
 * 3. Feeds it to Remotion's Audio component
 * 
 * This ensures effects work identically in preview AND final render.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Audio, delayRender, continueRender } from 'remotion';
import type { AudioEffect } from '../../../types/audio-effects';
import { renderAudioOffline, audioBufferToWav } from '../../audio-offline-renderer';

export interface ProcessedAudioRenderProps {
  src: string;
  volume?: number;
  startFrom?: number;
  endAt?: number;
  playbackRate?: number;
  audioEffects: AudioEffect[];
  muted?: boolean;
  toneFrequency?: number;
}

/**
 * ProcessedAudio component for Remotion rendering
 * Uses OfflineAudioContext to pre-process audio with effects
 */
export const ProcessedAudioRender: React.FC<ProcessedAudioRenderProps> = ({
  src,
  volume = 1,
  startFrom,
  endAt,
  playbackRate = 1,
  audioEffects,
  muted = false,
  toneFrequency,
}) => {
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  // Only use enabled effects
  const enabledEffects = useMemo(() => {
    return audioEffects.filter(e => e.enabled).sort((a, b) => a.order - b.order);
  }, [audioEffects]);
  
  // Process audio on mount
  useEffect(() => {
    let handle: number | null = null;
    let objectUrl: string | null = null;
    
    const processAudio = async () => {
      handle = delayRender('Processing audio effects');
      
      try {
        console.log('[ProcessedAudioRender] Processing audio with', enabledEffects.length, 'effects');
        
        // Render audio through effect chain
        const result = await renderAudioOffline(src, enabledEffects, {
          sampleRate: 48000, // Use high quality for renders
        });
        
        // Convert to WAV blob
        const wavBlob = audioBufferToWav(result.buffer);
        
        // Create object URL
        objectUrl = URL.createObjectURL(wavBlob);
        setProcessedAudioUrl(objectUrl);
        
        console.log('[ProcessedAudioRender] Audio processed successfully');
      } catch (err) {
        console.error('[ProcessedAudioRender] Error processing audio:', err);
        setError(err as Error);
      } finally {
        if (handle !== null) {
          continueRender(handle);
        }
      }
    };
    
    processAudio();
    
    // Cleanup object URL on unmount
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, enabledEffects]);
  
  // If processing failed, fall back to original audio
  if (error || processedAudioUrl === null) {
    return (
      <Audio
        src={src}
        volume={muted ? 0 : volume}
        startFrom={startFrom}
        endAt={endAt}
        playbackRate={playbackRate}
        toneFrequency={toneFrequency}
      />
    );
  }
  
  // Use processed audio
  return (
    <Audio
      src={processedAudioUrl}
      volume={muted ? 0 : volume}
      startFrom={startFrom}
      endAt={endAt}
      playbackRate={playbackRate}
      toneFrequency={toneFrequency}
    />
  );
};

export default ProcessedAudioRender;
