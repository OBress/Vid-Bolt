/**
 * Audio Resource Manager
 * 
 * Centralized manager for audio resource lifecycle.
 * Ensures proper cleanup of audio resources when clips are deleted,
 * projects are reset, or the editor is unmounted.
 * 
 * This manager:
 * - Subscribes to VideoEditorStore changes
 * - Automatically cleans up resources when clips are deleted
 * - Provides cleanup methods for project reset/change
 * - Prevents memory leaks from orphaned audio resources
 */

import { getRealtimeAudioManager } from './realtime-audio-manager';
import { getAudioEffectsCache } from './audio-effects-cache';
import { getAudioContextManager } from './audio-context-manager';
import type { TimelineClip } from '../types/timeline-v2';

// ============================================================
// TYPES
// ============================================================

export interface CleanupStats {
  realtimeTracksRemoved: number;
  effectCachesCleared: number;
  effectChainsDisposed: number;
}

// ============================================================
// AUDIO RESOURCE MANAGER
// ============================================================

class AudioResourceManager {
  private static instance: AudioResourceManager;
  private isInitialized: boolean = false;
  private unsubscribe: (() => void) | null = null;
  private previousClipIds: Set<string> = new Set();
  
  private constructor() {
    // Private constructor for singleton
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): AudioResourceManager {
    if (!AudioResourceManager.instance) {
      AudioResourceManager.instance = new AudioResourceManager();
    }
    return AudioResourceManager.instance;
  }
  
  /**
   * Initialize the manager and subscribe to store changes
   * Should be called once when the video editor mounts
   */
  public initialize(store: any): void {
    if (this.isInitialized) {
      console.log('[AudioResourceManager] Already initialized');
      return;
    }
    
    console.log('[AudioResourceManager] Initializing...');
    
    // Store initial clip IDs
    const initialClips = Object.values(store.getState().clips) as TimelineClip[];
    this.previousClipIds = new Set(initialClips.map(c => c.id));
    
    // Subscribe to clip changes using Zustand's subscribeWithSelector
    this.unsubscribe = store.subscribe(
      (state: any) => state.clips,
      (clips: Record<string, TimelineClip>, prevClips: Record<string, TimelineClip>) => {
        this.handleClipChanges(
          Object.values(clips) as TimelineClip[],
          Object.values(prevClips) as TimelineClip[]
        );
      }
    );
    
    this.isInitialized = true;
    console.log('[AudioResourceManager] Initialized with', this.previousClipIds.size, 'clips');
  }
  
  /**
   * Handle clip changes - detect deletions and clean up resources
   */
  private handleClipChanges(newClips: TimelineClip[], prevClips: TimelineClip[]): void {
    const newClipIds = new Set(newClips.map(c => c.id));
    const prevClipIds = new Set(prevClips.map(c => c.id));
    
    // Find deleted clips (in prev but not in new)
    const deletedClipIds: string[] = [];
    prevClipIds.forEach(id => {
      if (!newClipIds.has(id)) {
        deletedClipIds.push(id);
      }
    });
    
    // Clean up resources for deleted clips
    if (deletedClipIds.length > 0) {
      console.log('[AudioResourceManager] Detected', deletedClipIds.length, 'deleted clips, cleaning up...');
      deletedClipIds.forEach(clipId => {
        this.cleanupClipResources(clipId);
      });
    }
    
    // Update tracked clip IDs
    this.previousClipIds = newClipIds;
  }
  
  /**
   * Clean up all audio resources for a specific clip
   */
  public cleanupClipResources(clipId: string): CleanupStats {
    const stats: CleanupStats = {
      realtimeTracksRemoved: 0,
      effectCachesCleared: 0,
      effectChainsDisposed: 0,
    };
    
    console.log('[AudioResourceManager] Cleaning up resources for clip:', clipId);
    
    // 1. Clean up RealtimeAudioManager track
    try {
      const realtimeManager = getRealtimeAudioManager();
      if (realtimeManager.tracks.has(clipId)) {
        realtimeManager.removeTrack(clipId);
        stats.realtimeTracksRemoved = 1;
        console.log('[AudioResourceManager] Removed realtime audio track for:', clipId);
      }
    } catch (error) {
      console.warn('[AudioResourceManager] Error cleaning realtime track:', error);
    }
    
    // 2. Clean up AudioEffectsCache
    try {
      const effectsCache = getAudioEffectsCache();
      effectsCache.clearClip(clipId);
      stats.effectCachesCleared = 1;
      console.log('[AudioResourceManager] Cleared effects cache for:', clipId);
    } catch (error) {
      console.warn('[AudioResourceManager] Error cleaning effects cache:', error);
    }
    
    // 3. Clean up AudioContextManager effect chain
    try {
      const contextManager = getAudioContextManager();
      const chain = contextManager.getEffectChain(clipId);
      if (chain) {
        contextManager.disposeEffectChain(clipId);
        stats.effectChainsDisposed = 1;
        console.log('[AudioResourceManager] Disposed effect chain for:', clipId);
      }
    } catch (error) {
      console.warn('[AudioResourceManager] Error cleaning effect chain:', error);
    }
    
    return stats;
  }
  
  /**
   * Clean up resources for multiple clips
   */
  public cleanupMultipleClips(clipIds: string[]): CleanupStats {
    const totalStats: CleanupStats = {
      realtimeTracksRemoved: 0,
      effectCachesCleared: 0,
      effectChainsDisposed: 0,
    };
    
    clipIds.forEach(clipId => {
      const stats = this.cleanupClipResources(clipId);
      totalStats.realtimeTracksRemoved += stats.realtimeTracksRemoved;
      totalStats.effectCachesCleared += stats.effectCachesCleared;
      totalStats.effectChainsDisposed += stats.effectChainsDisposed;
    });
    
    return totalStats;
  }
  
  /**
   * Clean up ALL audio resources (for project reset/change)
   */
  public cleanupAllResources(): CleanupStats {
    console.log('[AudioResourceManager] Cleaning up ALL audio resources...');
    
    const stats: CleanupStats = {
      realtimeTracksRemoved: 0,
      effectCachesCleared: 0,
      effectChainsDisposed: 0,
    };
    
    // 1. Clean up all realtime audio tracks
    try {
      const realtimeManager = getRealtimeAudioManager();
      const trackCount = realtimeManager.tracks.size;
      realtimeManager.cleanup();
      stats.realtimeTracksRemoved = trackCount;
      console.log('[AudioResourceManager] Cleaned up', trackCount, 'realtime audio tracks');
    } catch (error) {
      console.warn('[AudioResourceManager] Error cleaning all realtime tracks:', error);
    }
    
    // 2. Clear all audio effects cache
    try {
      const effectsCache = getAudioEffectsCache();
      effectsCache.clearAll();
      stats.effectCachesCleared = 1;
      console.log('[AudioResourceManager] Cleared all effects cache');
    } catch (error) {
      console.warn('[AudioResourceManager] Error clearing effects cache:', error);
    }
    
    // 3. Dispose all effect chains
    try {
      const contextManager = getAudioContextManager();
      contextManager.disposeAllEffectChains();
      stats.effectChainsDisposed = 1;
      console.log('[AudioResourceManager] Disposed all effect chains');
    } catch (error) {
      console.warn('[AudioResourceManager] Error disposing effect chains:', error);
    }
    
    // 4. Clean up analyzer pool
    try {
      const contextManager = getAudioContextManager();
      contextManager.cleanupAnalyzerPool(0); // Clean all
      console.log('[AudioResourceManager] Cleaned up analyzer pool');
    } catch (error) {
      console.warn('[AudioResourceManager] Error cleaning analyzer pool:', error);
    }
    
    // Reset tracked clip IDs
    this.previousClipIds.clear();
    
    console.log('[AudioResourceManager] Cleanup complete:', stats);
    return stats;
  }
  
  /**
   * Destroy the manager and unsubscribe from store
   * Should be called when the video editor unmounts
   */
  public destroy(): void {
    console.log('[AudioResourceManager] Destroying...');
    
    // Unsubscribe from store
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    
    // Clean up all resources
    this.cleanupAllResources();
    
    // Reset state
    this.isInitialized = false;
    this.previousClipIds.clear();
    
    console.log('[AudioResourceManager] Destroyed');
  }
  
  /**
   * Check if the manager is initialized
   */
  public isActive(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Get the number of currently tracked clips
   */
  public getTrackedClipCount(): number {
    return this.previousClipIds.size;
  }
}

// ============================================================
// EXPORTS
// ============================================================

/**
 * Get the audio resource manager instance
 */
export function getAudioResourceManager(): AudioResourceManager {
  return AudioResourceManager.getInstance();
}

/**
 * Initialize the audio resource manager with the store
 */
export function initializeAudioResourceManager(store: any): void {
  AudioResourceManager.getInstance().initialize(store);
}

/**
 * Clean up resources for a specific clip
 */
export function cleanupClipAudioResources(clipId: string): CleanupStats {
  return AudioResourceManager.getInstance().cleanupClipResources(clipId);
}

/**
 * Clean up all audio resources (for project reset)
 */
export function cleanupAllAudioResources(): CleanupStats {
  return AudioResourceManager.getInstance().cleanupAllResources();
}

/**
 * Destroy the audio resource manager
 */
export function destroyAudioResourceManager(): void {
  AudioResourceManager.getInstance().destroy();
}

export default AudioResourceManager;
