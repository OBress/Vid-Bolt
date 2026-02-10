/**
 * Audio Effects Cache
 * 
 * Pre-processes audio files with effects and caches the results.
 * When effects are added/changed, audio is processed in the background
 * and the processed version is used for both preview and render.
 */

import type { AudioEffect } from '../types/audio-effects';
import { renderAudioOffline, audioBufferToWav } from './audio-offline-renderer';

interface ProcessedAudio {
  originalSrc: string;
  processedUrl: string;
  effects: AudioEffect[];
  effectsHash: string;
  isProcessing: boolean;
}

class AudioEffectsCache {
  private static instance: AudioEffectsCache;
  private cache = new Map<string, ProcessedAudio>();
  private processingQueue = new Set<string>();
  
  private constructor() {}
  
  public static getInstance(): AudioEffectsCache {
    if (!AudioEffectsCache.instance) {
      AudioEffectsCache.instance = new AudioEffectsCache();
    }
    return AudioEffectsCache.instance;
  }
  
  /**
   * Get hash of effects for cache key
   */
  private getEffectsHash(effects: AudioEffect[]): string {
    const enabledEffects = effects.filter(e => e.enabled);
    return JSON.stringify(enabledEffects.map(e => {
      const { id, ...rest } = e;
      return rest;
    }));
  }
  
  /**
   * Get cache key
   */
  private getCacheKey(clipId: string, src: string, effects: AudioEffect[]): string {
    const effectsHash = this.getEffectsHash(effects);
    return `${clipId}-${src}-${effectsHash}`;
  }
  
  /**
   * Check if we have a cached processed version
   */
  public getCachedAudio(clipId: string, src: string, effects: AudioEffect[]): string | null {
    if (!effects.length || !effects.some(e => e.enabled)) {
      return src; // No effects, use original
    }
    
    const key = this.getCacheKey(clipId, src, effects);
    const cached = this.cache.get(key);
    
    if (cached && !cached.isProcessing) {
      console.log('[AudioEffectsCache] Cache hit for:', clipId);
      return cached.processedUrl;
    }
    
    if (cached && cached.isProcessing) {
      console.log('[AudioEffectsCache] Still processing for:', clipId);
      return src; // Return original while processing
    }
    
    // Not cached - trigger processing
    this.processAudio(clipId, src, effects);
    return src; // Return original while processing
  }
  
  /**
   * Process audio with effects in background
   */
  private async processAudio(clipId: string, src: string, effects: AudioEffect[]): Promise<void> {
    const key = this.getCacheKey(clipId, src, effects);
    
    // Check if already processing
    if (this.processingQueue.has(key)) {
      return;
    }
    
    console.log('[AudioEffectsCache] Starting to process audio for:', clipId);
    
    this.processingQueue.add(key);
    
    // Mark as processing
    this.cache.set(key, {
      originalSrc: src,
      processedUrl: src,
      effects,
      effectsHash: this.getEffectsHash(effects),
      isProcessing: true,
    });
    
    // Small delay to make processing status visible
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      const enabledEffects = effects.filter(e => e.enabled).sort((a, b) => a.order - b.order);
      
      console.log('[AudioEffectsCache] Processing with', enabledEffects.length, 'effects:', 
        enabledEffects.map(e => e.type));
      console.log('[AudioEffectsCache] Full effect chain:', enabledEffects);
      
      // Process audio through ALL effects in order (EQ -> Compressor -> Reverb -> etc.)
      const result = await renderAudioOffline(src, enabledEffects, {
        sampleRate: 48000,
        onProgress: (progress) => {
          console.log(`[AudioEffectsCache] Processing ${clipId}: ${(progress * 100).toFixed(0)}%`);
          
          // Update progress in UI
          window.dispatchEvent(new CustomEvent('audio-effects-progress', {
            detail: { clipId, progress }
          }));
        },
      });
      
      // Convert to WAV blob
      const wavBlob = audioBufferToWav(result.buffer);
      const processedUrl = URL.createObjectURL(wavBlob);
      
      console.log('[AudioEffectsCache] ✅ Processing complete for:', clipId);
      
      // Update cache with processed version
      this.cache.set(key, {
        originalSrc: src,
        processedUrl,
        effects,
        effectsHash: this.getEffectsHash(effects),
        isProcessing: false,
      });
      
      this.processingQueue.delete(key);
      
      // Trigger a re-render by dispatching a custom event
      window.dispatchEvent(new CustomEvent('audio-effects-processed', { 
        detail: { clipId, key } 
      }));
      
    } catch (error) {
      console.error('[AudioEffectsCache] Error processing audio:', error);
      this.processingQueue.delete(key);
      this.cache.delete(key);
    }
  }
  
  /**
   * Check if audio is currently being processed
   */
  public isProcessing(clipId: string, src: string, effects: AudioEffect[]): boolean {
    if (!effects.length || !effects.some(e => e.enabled)) {
      return false;
    }
    
    const key = this.getCacheKey(clipId, src, effects);
    const cached = this.cache.get(key);
    return cached?.isProcessing || false;
  }
  
  /**
   * Clear cached audio for a clip
   */
  public clearClip(clipId: string): void {
    const keysToDelete: string[] = [];
    
    this.cache.forEach((value, key) => {
      if (key.startsWith(clipId)) {
        // Revoke object URL to free memory
        if (value.processedUrl !== value.originalSrc) {
          URL.revokeObjectURL(value.processedUrl);
        }
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
  
  /**
   * Clear entire cache
   */
  public clearAll(): void {
    console.log('[AudioEffectsCache] Clearing all cached audio');
    
    this.cache.forEach(value => {
      if (value.processedUrl !== value.originalSrc) {
        URL.revokeObjectURL(value.processedUrl);
      }
    });
    
    this.cache.clear();
    this.processingQueue.clear();
  }
}

export function getAudioEffectsCache(): AudioEffectsCache {
  return AudioEffectsCache.getInstance();
}

export default AudioEffectsCache;
