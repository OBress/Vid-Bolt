/**
 * Real-Time Audio Manager
 * 
 * Manages audio playback with effects outside of React's lifecycle.
 * Creates stable audio elements and Web Audio connections that survive re-renders.
 */

import type { AudioEffect } from '../types/audio-effects';
import { getAudioContextManager } from './audio-context-manager';

interface AudioTrack {
  element: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  isSetup: boolean;
}

class RealtimeAudioManager {
  private static instance: RealtimeAudioManager;
  public tracks = new Map<string, AudioTrack>(); // Public for direct access
  
  private constructor() {}
  
  public static getInstance(): RealtimeAudioManager {
    if (!RealtimeAudioManager.instance) {
      RealtimeAudioManager.instance = new RealtimeAudioManager();
    }
    return RealtimeAudioManager.instance;
  }
  
  /**
   * Get or create audio track for a clip
   */
  public getOrCreateTrack(clipId: string, src: string, effects: AudioEffect[]): AudioTrack {
    let track = this.tracks.get(clipId);
    
    if (!track) {
      console.log('[RealtimeAudio] Creating new track for:', clipId);
      const element = new Audio();
      element.crossOrigin = 'anonymous';
      element.preload = 'auto';
      element.src = src;
      
      track = {
        element,
        sourceNode: null,
        isSetup: false,
      };
      
      this.tracks.set(clipId, track);
    }
    
    // Update src if changed
    if (track.element.src !== src && src) {
      console.log('[RealtimeAudio] Updating src for:', clipId);
      track.element.src = src;
      track.isSetup = false;
    }
    
    // Setup Web Audio if we have effects and haven't set up yet
    if (effects.length > 0 && !track.isSetup) {
      this.setupWebAudio(clipId, track, effects);
    } else if (effects.length === 0 && track.isSetup) {
      // Remove Web Audio routing if no effects
      this.teardownWebAudio(clipId, track);
    } else if (effects.length > 0 && track.isSetup) {
      // Update effect chain
      this.updateEffectChain(clipId, effects);
    }
    
    return track;
  }
  
  /**
   * Setup Web Audio routing
   */
  private setupWebAudio(clipId: string, track: AudioTrack, effects: AudioEffect[]): void {
    if (track.isSetup) return;
    
    try {
      const manager = getAudioContextManager();
      const context = manager.getContext();
      
      // Resume if needed
      if (context.state === 'suspended') {
        manager.resume();
      }
      
      // Create source node
      console.log('[RealtimeAudio] Creating MediaElementSource for:', clipId);
      track.sourceNode = context.createMediaElementSource(track.element);
      
      // Create effect chain
      const chain = manager.createEffectChain(clipId, effects);
      
      // Connect: source -> effects -> destination
      track.sourceNode.connect(chain.inputNode);
      chain.outputNode.connect(context.destination);
      
      track.isSetup = true;
      console.log('[RealtimeAudio] Web Audio setup complete for:', clipId);
    } catch (error) {
      console.error('[RealtimeAudio] Setup error:', error);
    }
  }
  
  /**
   * Teardown Web Audio routing
   */
  private teardownWebAudio(clipId: string, track: AudioTrack): void {
    if (!track.isSetup) return;
    
    const manager = getAudioContextManager();
    
    if (track.sourceNode) {
      try {
        track.sourceNode.disconnect();
      } catch {}
    }
    
    manager.disposeEffectChain(clipId);
    track.isSetup = false;
    
    console.log('[RealtimeAudio] Web Audio torn down for:', clipId);
  }
  
  /**
   * Update effect chain parameters
   */
  private updateEffectChain(clipId: string, effects: AudioEffect[]): void {
    const manager = getAudioContextManager();
    const track = this.tracks.get(clipId);
    
    if (!track || !track.sourceNode) return;
    
    // Disconnect old chain
    manager.disposeEffectChain(clipId);
    
    // Create new chain
    const chain = manager.createEffectChain(clipId, effects);
    
    // Reconnect
    track.sourceNode.disconnect();
    track.sourceNode.connect(chain.inputNode);
    chain.outputNode.connect(manager.getContext().destination);
    
    console.log('[RealtimeAudio] Effect chain updated for:', clipId);
  }
  
  /**
   * Update playback properties
   */
  public updatePlayback(
    clipId: string,
    time: number,
    isPlaying: boolean,
    volume: number,
    playbackRate: number,
    effects: AudioEffect[]
  ): void {
    const track = this.tracks.get(clipId);
    if (!track) return;
    
    const hasEffects = effects.length > 0 && effects.some(e => e.enabled);
    
    // Update volume (through effect chain if using effects, otherwise direct)
    // Clamp volume to prevent clipping/distortion
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    if (hasEffects) {
      const manager = getAudioContextManager();
      const chain = manager.getEffectChain(clipId);
      if (chain) {
        chain.outputNode.gain.value = clampedVolume;
      }
      // When using Web Audio, set element volume to 1 (controlled by effect chain)
      track.element.volume = 1;
    } else {
      track.element.volume = clampedVolume;
    }
    
    // Update playback rate
    if (Math.abs(track.element.playbackRate - playbackRate) > 0.01) {
      track.element.playbackRate = playbackRate;
    }
    
    // Sync time ONLY when significantly out of sync
    // This prevents constant seeking which causes stuttering/artifacts
    const timeDiff = Math.abs(track.element.currentTime - time);
    if (timeDiff > 0.5) { // Large tolerance - only sync when really needed
      track.element.currentTime = time;
    }
    
    // Play/pause - only change state when needed
    if (isPlaying && track.element.paused) {
      track.element.play().catch(() => {});
    } else if (!isPlaying && !track.element.paused) {
      track.element.pause();
    }
  }
  
  /**
   * Remove track
   */
  public removeTrack(clipId: string): void {
    const track = this.tracks.get(clipId);
    if (!track) return;
    
    console.log('[RealtimeAudio] Removing track:', clipId);
    
    track.element.pause();
    track.element.src = '';
    
    if (track.isSetup) {
      this.teardownWebAudio(clipId, track);
    }
    
    this.tracks.delete(clipId);
  }
  
  /**
   * Cleanup all tracks
   */
  public cleanup(): void {
    console.log('[RealtimeAudio] Cleaning up all tracks');
    this.tracks.forEach((_, clipId) => this.removeTrack(clipId));
  }
}

export function getRealtimeAudioManager(): RealtimeAudioManager {
  return RealtimeAudioManager.getInstance();
}

export default RealtimeAudioManager;
