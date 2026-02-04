/**
 * ProcessedAudio Component
 * 
 * Remotion-compatible audio component with Web Audio API effects processing.
 * Wraps Remotion's Audio component and applies effect chain processing.
 * 
 * Features:
 * - Real-time audio effects (EQ, Compressor, Reverb, etc.)
 * - Seamless integration with Remotion's timing system
 * - Automatic effect chain management
 * - Support for keyframed effect parameters
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { Audio, useCurrentFrame, useVideoConfig, getRemotionEnvironment } from 'remotion';
import type { AudioEffect } from '../../../types/audio-effects';
import { getAudioContextManager } from '../../audio-context-manager';
import { updateEffectInChain, type AudioEffectChain } from '../../audio-effect-processor';
import { ProcessedAudioRender } from './processed-audio-render';

// ============================================================
// TYPES
// ============================================================

export interface ProcessedAudioProps {
  /** Audio source URL */
  src: string;
  /** Volume (0-1) */
  volume?: number;
  /** Start frame in source audio */
  startFrom?: number;
  /** End frame in source audio */
  endAt?: number;
  /** Playback rate */
  playbackRate?: number;
  /** Audio effects to apply */
  audioEffects?: AudioEffect[];
  /** Clip ID for effect chain management */
  clipId?: string;
  /** Whether the audio is muted */
  muted?: boolean;
  /** Tone frequency / pitch adjustment */
  toneFrequency?: number;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * ProcessedAudio component
 * 
 * Renders audio with Web Audio API effects processing.
 * Falls back to standard Remotion Audio when no effects are present or during server rendering.
 */
export const ProcessedAudio: React.FC<ProcessedAudioProps> = ({
  src,
  volume = 1,
  startFrom,
  endAt,
  playbackRate = 1,
  audioEffects,
  clipId,
  muted = false,
  toneFrequency,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const effectChainRef = useRef<AudioEffectChain | null>(null);
  const isConnectedRef = useRef(false);
  const hasSetupRef = useRef(false);
  
  // Check if we're in a rendering environment
  const environment = getRemotionEnvironment();
  const isRendering = environment.isRendering;
  
  // Determine if we need effects processing
  const hasEffects = useMemo(() => {
    return audioEffects && audioEffects.length > 0 && audioEffects.some(e => e.enabled);
  }, [audioEffects]);
  
  // Memoize enabled effects
  const enabledEffects = useMemo(() => {
    if (!audioEffects) return [];
    return audioEffects.filter(e => e.enabled).sort((a, b) => a.order - b.order);
  }, [audioEffects]);
  
  // Setup effect chain
  const setupEffectChain = useCallback(() => {
    if (!audioRef.current || !hasEffects || isRendering || hasSetupRef.current) {
      console.log('[ProcessedAudio] Skipping effect chain setup:', { 
        hasAudioRef: !!audioRef.current, 
        hasEffects, 
        isRendering,
        alreadySetup: hasSetupRef.current,
      });
      return;
    }
    
    console.log('[ProcessedAudio] Setting up effect chain with', enabledEffects.length, 'effects');
    
    const manager = getAudioContextManager();
    const context = manager.getContext();
    
    console.log('[ProcessedAudio] AudioContext state:', context.state);
    
    // Resume context if suspended (browser autoplay policy)
    if (context.state === 'suspended') {
      console.log('[ProcessedAudio] Resuming suspended AudioContext');
      manager.resume();
    }
    
    try {
      // Create source node ONLY ONCE per audio element
      if (!sourceNodeRef.current) {
        console.log('[ProcessedAudio] Creating MediaElementSource');
        sourceNodeRef.current = context.createMediaElementSource(audioRef.current);
      }
      
      // Create or update effect chain
      const chainId = clipId || `audio-${src}`;
      console.log('[ProcessedAudio] Creating effect chain with ID:', chainId);
      console.log('[ProcessedAudio] Effects to apply:', enabledEffects.map(e => ({ 
        type: e.type, 
        enabled: e.enabled,
        order: e.order 
      })));
      
      effectChainRef.current = manager.createEffectChain(chainId, enabledEffects);
      
      console.log('[ProcessedAudio] Effect chain created successfully');
      
      // Apply volume to the effect chain's output
      effectChainRef.current.outputNode.gain.value = muted ? 0 : volume;
      
      // Connect: source -> effect chain -> destination
      console.log('[ProcessedAudio] Connecting audio graph');
      sourceNodeRef.current.connect(effectChainRef.current.inputNode);
      effectChainRef.current.outputNode.connect(context.destination);
      isConnectedRef.current = true;
      hasSetupRef.current = true;
      console.log('[ProcessedAudio] Audio graph connected successfully');
    } catch (error) {
      console.error('[ProcessedAudio] Error setting up audio effect chain:', error);
      // Reset refs on error so we can try again
      sourceNodeRef.current = null;
      effectChainRef.current = null;
      isConnectedRef.current = false;
    }
  }, [hasEffects, enabledEffects, clipId, src, isRendering, volume, muted]);
  
  // Cleanup effect chain
  const cleanupEffectChain = useCallback(() => {
    console.log('[ProcessedAudio] Cleaning up effect chain');
    
    if (effectChainRef.current) {
      const manager = getAudioContextManager();
      const chainId = clipId || `audio-${src}`;
      manager.disposeEffectChain(chainId);
      effectChainRef.current = null;
    }
    
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // May already be disconnected
      }
      sourceNodeRef.current = null;
    }
    
    isConnectedRef.current = false;
    hasSetupRef.current = false;
  }, [clipId, src]);
  
  // Rebuild effect chain when effects change
  useEffect(() => {
    if (!sourceNodeRef.current || !hasEffects || isRendering) return;
    
    console.log('[ProcessedAudio] Effects changed, rebuilding chain');
    
    const manager = getAudioContextManager();
    const chainId = clipId || `audio-${src}`;
    
    // Disconnect old chain
    if (effectChainRef.current) {
      try {
        sourceNodeRef.current.disconnect();
        effectChainRef.current.outputNode.disconnect();
      } catch (e) {
        console.log('[ProcessedAudio] Error disconnecting old chain:', e);
      }
      manager.disposeEffectChain(chainId);
    }
    
    // Create new chain
    effectChainRef.current = manager.createEffectChain(chainId, enabledEffects);
    effectChainRef.current.outputNode.gain.value = muted ? 0 : volume;
    
    // Reconnect
    sourceNodeRef.current.connect(effectChainRef.current.inputNode);
    effectChainRef.current.outputNode.connect(manager.getContext().destination);
    
    console.log('[ProcessedAudio] Effect chain rebuilt successfully');
  }, [enabledEffects, hasEffects, clipId, src, isRendering, volume, muted]);
  
  // Update volume when it changes
  useEffect(() => {
    if (!effectChainRef.current) return;
    effectChainRef.current.outputNode.gain.value = muted ? 0 : volume;
  }, [volume, muted]);
  
  // Setup/cleanup on mount/unmount and when src changes
  useEffect(() => {
    // Reset setup flag when src changes
    hasSetupRef.current = false;
    
    return () => {
      cleanupEffectChain();
    };
  }, [src, cleanupEffectChain]);
  
  // Handle audio element load
  const handleCanPlay = useCallback(() => {
    console.log('[ProcessedAudio] handleCanPlay called', { hasEffects, isRendering, alreadySetup: hasSetupRef.current });
    if (hasEffects && !isRendering && !hasSetupRef.current) {
      setupEffectChain();
    }
  }, [hasEffects, isRendering, setupEffectChain]);
  
  // Calculate final volume
  const finalVolume = muted ? 0 : volume;
  
  // For rendering with effects, use offline processing
  if (isRendering && hasEffects) {
    return (
      <ProcessedAudioRender
        src={src}
        volume={finalVolume}
        startFrom={startFrom}
        endAt={endAt}
        playbackRate={playbackRate}
        audioEffects={enabledEffects}
        muted={muted}
        toneFrequency={toneFrequency}
      />
    );
  }
  
  // For rendering without effects, use standard Remotion Audio
  if (isRendering) {
    return (
      <Audio
        src={src}
        volume={finalVolume}
        startFrom={startFrom}
        endAt={endAt}
        playbackRate={playbackRate}
        toneFrequency={toneFrequency}
      />
    );
  }
  
  // For client-side with effects, just use standard audio for now
  // TODO: Implement proper Web Audio routing without constant remounting
  console.log('[ProcessedAudio] Using standard audio (effects not yet implemented for preview)');
  return (
    <Audio
      src={src}
      volume={finalVolume}
      startFrom={startFrom}
      endAt={endAt}
      playbackRate={playbackRate}
      toneFrequency={toneFrequency}
    />
  );
};

// ============================================================
// HOOKS
// ============================================================

/**
 * Hook to get audio levels for visualization
 */
export function useAudioLevels(clipId: string) {
  const rafRef = useRef<number>();
  const [levels, setLevels] = React.useState({ rms: -60, peak: -60, clipping: false });
  
  useEffect(() => {
    const manager = getAudioContextManager();
    const chain = manager.getEffectChain(clipId);
    
    if (!chain) return;
    
    const updateLevels = () => {
      const postLevels = manager.getAudioLevels(chain.analyzerPost);
      setLevels(postLevels);
      rafRef.current = requestAnimationFrame(updateLevels);
    };
    
    rafRef.current = requestAnimationFrame(updateLevels);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [clipId]);
  
  return levels;
}

/**
 * Hook to get frequency data for EQ visualization
 */
export function useFrequencyData(clipId: string, fftSize: number = 256) {
  const rafRef = useRef<number>();
  const [frequencyData, setFrequencyData] = React.useState<Uint8Array>(new Uint8Array(fftSize / 2));
  
  useEffect(() => {
    const manager = getAudioContextManager();
    const chain = manager.getEffectChain(clipId);
    
    if (!chain) return;
    
    const updateData = () => {
      const data = manager.getFrequencyData(chain.analyzerPost);
      setFrequencyData(data);
      rafRef.current = requestAnimationFrame(updateData);
    };
    
    rafRef.current = requestAnimationFrame(updateData);
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [clipId, fftSize]);
  
  return frequencyData;
}

export default ProcessedAudio;
