/**
 * ProcessedAudio - Stable Implementation
 * 
 * Uses a single stable audio element that survives React re-renders.
 * Processes audio through Web Audio API for real-time effects.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { AudioEffect } from '../../../types/audio-effects';
import { getAudioContextManager } from '../../audio-context-manager';

export interface ProcessedAudioStableProps {
  src: string;
  volume?: number;
  startFrom?: number;
  endAt?: number;
  playbackRate?: number;
  audioEffects?: AudioEffect[];
  clipId: string;
  muted?: boolean;
  toneFrequency?: number;
}

// Global map to track audio elements by clip ID to prevent recreation
const audioElementCache = new Map<string, HTMLAudioElement>();
const sourceNodeCache = new Map<string, MediaElementAudioSourceNode>();

export const ProcessedAudioStable: React.FC<ProcessedAudioStableProps> = ({
  src,
  volume = 1,
  startFrom = 0,
  endAt,
  playbackRate = 1,
  audioEffects = [],
  clipId,
  muted = false,
  toneFrequency = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const enabledEffects = useMemo(() => {
    return audioEffects.filter(e => e.enabled).sort((a, b) => a.order - b.order);
  }, [audioEffects]);
  
  const hasEffects = enabledEffects.length > 0;
  
  // Calculate current playback time
  const currentTime = frame / fps;
  const startTime = startFrom / fps;
  const audioTime = (currentTime + startTime) / playbackRate;
  const shouldBePlaying = endAt === undefined || currentTime < (endAt / fps);
  
  useEffect(() => {
    const manager = getAudioContextManager();
    const context = manager.getContext();
    
    // Get or create stable audio element
    let audioElement = audioElementCache.get(clipId);
    if (!audioElement) {
      console.log('[ProcessedAudioStable] Creating new audio element for', clipId);
      audioElement = new Audio();
      audioElement.crossOrigin = 'anonymous';
      audioElement.preload = 'auto';
      audioElementCache.set(clipId, audioElement);
    }
    
    // Update audio source if needed
    if (audioElement.src !== src) {
      console.log('[ProcessedAudioStable] Updating src to:', src);
      audioElement.src = src;
    }
    
    // Setup Web Audio routing if we have effects
    if (hasEffects) {
      let sourceNode = sourceNodeCache.get(clipId);
      
      if (!sourceNode) {
        try {
          console.log('[ProcessedAudioStable] Creating MediaElementSource for', clipId);
          sourceNode = context.createMediaElementSource(audioElement);
          sourceNodeCache.set(clipId, sourceNode);
          
          // Create effect chain
          const chain = manager.createEffectChain(clipId, enabledEffects);
          
          // Connect: source -> effects -> output
          sourceNode.connect(chain.inputNode);
          chain.outputNode.connect(context.destination);
          
          console.log('[ProcessedAudioStable] Web Audio graph connected');
        } catch (error) {
          console.error('[ProcessedAudioStable] Error setting up Web Audio:', error);
        }
      } else {
        // Update existing effect chain
        manager.disposeEffectChain(clipId);
        const chain = manager.createEffectChain(clipId, enabledEffects);
        sourceNode.connect(chain.inputNode);
        chain.outputNode.connect(context.destination);
      }
      
      // Update volume through effect chain
      const chain = manager.getEffectChain(clipId);
      if (chain) {
        chain.outputNode.gain.value = muted ? 0 : volume;
      }
    }
    
    // Sync audio playback with Remotion frame
    audioElement.playbackRate = playbackRate * (toneFrequency || 1);
    audioElement.volume = hasEffects ? 1 : (muted ? 0 : volume); // If using effects, volume controlled by effect chain
    audioElement.currentTime = audioTime;
    
    if (shouldBePlaying && audioElement.paused) {
      audioElement.play().catch(e => {
        if (context.state === 'suspended') {
          manager.resume().then(() => audioElement.play());
        }
      });
    } else if (!shouldBePlaying && !audioElement.paused) {
      audioElement.pause();
    }
    
    // Cleanup on unmount
    return () => {
      // Don't clean up the audio element itself - it's cached
      // Just pause it
      if (audioElement && !audioElement.paused) {
        audioElement.pause();
      }
    };
  }, [clipId, src, frame, fps, startFrom, endAt, playbackRate, volume, muted, toneFrequency, enabledEffects, hasEffects, shouldBePlaying, audioTime]);
  
  // Hidden container (audio is not rendered visually)
  return <div ref={containerRef} style={{ display: 'none' }} />;
};

// Cleanup function to be called when clip is removed
export function cleanupAudioForClip(clipId: string) {
  const audioElement = audioElementCache.get(clipId);
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElementCache.delete(clipId);
  }
  
  const sourceNode = sourceNodeCache.get(clipId);
  if (sourceNode) {
    try {
      sourceNode.disconnect();
    } catch {}
    sourceNodeCache.delete(clipId);
  }
  
  const manager = getAudioContextManager();
  manager.disposeEffectChain(clipId);
}

export default ProcessedAudioStable;
