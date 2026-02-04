/**
 * RealtimeAudio Component
 * 
 * Renders audio with real-time effects in the Remotion player.
 * Uses the RealtimeAudioManager to manage audio outside React's lifecycle.
 */

import { useEffect } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { AudioEffect } from '../../../types/audio-effects';
import { getRealtimeAudioManager } from '../../realtime-audio-manager';
import { getAudioContextManager } from '../../audio-context-manager';

export interface RealtimeAudioProps {
  src: string;
  volume?: number;
  startFrom?: number;
  endAt?: number;
  playbackRate?: number;
  audioEffects?: AudioEffect[];
  clipId: string;
  muted?: boolean;
  toneFrequency?: number;
  isPlaying?: boolean;
}

export const RealtimeAudio: React.FC<RealtimeAudioProps> = ({
  src,
  volume = 1,
  startFrom = 0,
  endAt,
  playbackRate = 1,
  audioEffects = [],
  clipId,
  muted = false,
  toneFrequency = 1,
  isPlaying = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const enabledEffects = audioEffects.filter(e => e.enabled);
  
  // Calculate audio time - startFrom is in frames, convert to seconds
  const currentTimeInSeconds = frame / fps;
  const startFromSeconds = startFrom / fps;
  const audioTime = startFromSeconds + currentTimeInSeconds;
  
  // Check if we should be playing
  const endTimeInSeconds = endAt ? endAt / fps : undefined;
  const shouldPlay = isPlaying && 
                    currentTimeInSeconds >= 0 && 
                    (endTimeInSeconds === undefined || currentTimeInSeconds < endTimeInSeconds);
  
  const finalVolume = muted ? 0 : volume;
  
  // Create/setup track once
  useEffect(() => {
    const manager = getRealtimeAudioManager();
    manager.getOrCreateTrack(clipId, src, enabledEffects);
  }, [clipId, src]);
  
  // Update effect chain when effects change
  useEffect(() => {
    const manager = getRealtimeAudioManager();
    const track = manager.tracks.get(clipId);
    if (track && enabledEffects.length > 0) {
      manager.getOrCreateTrack(clipId, src, enabledEffects);
    }
  }, [clipId, src, enabledEffects]);
  
  // Update volume and playback rate only when they change
  useEffect(() => {
    const manager = getRealtimeAudioManager();
    const track = manager.tracks.get(clipId);
    if (!track) return;
    
    const hasEffects = enabledEffects.length > 0;
    const clampedVolume = Math.max(0, Math.min(1, finalVolume));
    
    if (hasEffects) {
      const audioManager = getAudioContextManager();
      const chain = audioManager.getEffectChain(clipId);
      if (chain) {
        chain.outputNode.gain.value = clampedVolume;
      }
      track.element.volume = 1;
    } else {
      track.element.volume = clampedVolume;
    }
    
    if (Math.abs(track.element.playbackRate - playbackRate) > 0.01) {
      track.element.playbackRate = playbackRate;
    }
  }, [clipId, finalVolume, playbackRate, enabledEffects]);
  
  // Handle play/pause
  useEffect(() => {
    const manager = getRealtimeAudioManager();
    const track = manager.tracks.get(clipId);
    if (!track) return;
    
    // Play/pause based on state
    if (shouldPlay && track.element.paused) {
      // Sync time before playing
      track.element.currentTime = audioTime;
      track.element.play().catch(() => {});
    } else if (!shouldPlay && !track.element.paused) {
      track.element.pause();
    }
  }, [clipId, shouldPlay]);
  
  // Sync time only on frame scrubbing (when user drags playhead while paused)
  useEffect(() => {
    if (shouldPlay) return; // Don't sync while playing, let it run naturally
    
    const manager = getRealtimeAudioManager();
    const track = manager.tracks.get(clipId);
    if (track) {
      track.element.currentTime = audioTime;
    }
  }, [clipId, audioTime, shouldPlay]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const manager = getRealtimeAudioManager();
      manager.removeTrack(clipId);
    };
  }, [clipId]);
  
  return null; // No visual rendering
};

export default RealtimeAudio;
