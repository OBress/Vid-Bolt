/**
 * Audio Context Manager
 * 
 * Singleton manager for Web Audio API AudioContext.
 * Handles context creation, state management, and resource cleanup.
 * 
 * Features:
 * - Single shared AudioContext for the application
 * - Automatic context resume handling (for autoplay policies)
 * - Analyzer node pooling for visualization
 * - Memory-efficient cleanup
 */

import type { AudioEffect } from '../types/audio-effects';
import { 
  createAudioEffectChain, 
  type AudioEffectChain,
  getFrequencyData,
  getTimeDomainData,
  calculateRMSLevel,
  calculatePeakLevel,
} from './audio-effect-processor';

// ============================================================
// TYPES
// ============================================================

export interface AudioLevels {
  rms: number;
  peak: number;
  clipping: boolean;
}

export interface AnalyzerConfig {
  fftSize?: number;
  smoothingTimeConstant?: number;
  minDecibels?: number;
  maxDecibels?: number;
}

interface PooledAnalyzer {
  analyzer: AnalyserNode;
  inUse: boolean;
  lastUsed: number;
}

// ============================================================
// AUDIO CONTEXT MANAGER
// ============================================================

class AudioContextManager {
  private static instance: AudioContextManager;
  private context: AudioContext | null = null;
  private analyzerPool: PooledAnalyzer[] = [];
  private effectChains: Map<string, AudioEffectChain> = new Map();
  private masterGain: GainNode | null = null;
  private masterAnalyzer: AnalyserNode | null = null;
  private resumePromise: Promise<void> | null = null;
  
  private constructor() {
    // Private constructor for singleton
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }
  
  /**
   * Get or create the AudioContext
   */
  public getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.setupMasterChain();
    }
    return this.context;
  }
  
  /**
   * Check if context exists and is running
   */
  public isContextReady(): boolean {
    return this.context !== null && this.context.state === 'running';
  }
  
  /**
   * Get the context state
   */
  public getState(): AudioContextState | null {
    return this.context?.state ?? null;
  }
  
  /**
   * Resume the audio context (handles browser autoplay policies)
   */
  public async resume(): Promise<void> {
    if (!this.context) {
      this.getContext();
    }
    
    if (this.context!.state === 'suspended') {
      if (!this.resumePromise) {
        this.resumePromise = this.context!.resume().finally(() => {
          this.resumePromise = null;
        });
      }
      await this.resumePromise;
    }
  }
  
  /**
   * Suspend the audio context (saves resources)
   */
  public async suspend(): Promise<void> {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
    }
  }
  
  /**
   * Setup master output chain
   */
  private setupMasterChain(): void {
    if (!this.context) return;
    
    this.masterGain = this.context.createGain();
    this.masterAnalyzer = this.context.createAnalyser();
    
    this.masterAnalyzer.fftSize = 2048;
    this.masterAnalyzer.smoothingTimeConstant = 0.8;
    
    this.masterGain.connect(this.masterAnalyzer);
    this.masterAnalyzer.connect(this.context.destination);
  }
  
  /**
   * Get master gain node
   */
  public getMasterGain(): GainNode | null {
    return this.masterGain;
  }
  
  /**
   * Get master analyzer
   */
  public getMasterAnalyzer(): AnalyserNode | null {
    return this.masterAnalyzer;
  }
  
  /**
   * Set master volume (0-1)
   */
  public setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
  
  // ============================================================
  // ANALYZER POOL
  // ============================================================
  
  /**
   * Get an analyzer from the pool or create a new one
   */
  public getAnalyzer(config?: AnalyzerConfig): AnalyserNode {
    const context = this.getContext();
    
    // Try to find an available analyzer
    const available = this.analyzerPool.find(a => !a.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      this.configureAnalyzer(available.analyzer, config);
      return available.analyzer;
    }
    
    // Create new analyzer
    const analyzer = context.createAnalyser();
    this.configureAnalyzer(analyzer, config);
    
    this.analyzerPool.push({
      analyzer,
      inUse: true,
      lastUsed: Date.now(),
    });
    
    return analyzer;
  }
  
  /**
   * Return an analyzer to the pool
   */
  public releaseAnalyzer(analyzer: AnalyserNode): void {
    const pooled = this.analyzerPool.find(a => a.analyzer === analyzer);
    if (pooled) {
      pooled.inUse = false;
      analyzer.disconnect();
    }
  }
  
  /**
   * Configure an analyzer node
   */
  private configureAnalyzer(analyzer: AnalyserNode, config?: AnalyzerConfig): void {
    analyzer.fftSize = config?.fftSize ?? 2048;
    analyzer.smoothingTimeConstant = config?.smoothingTimeConstant ?? 0.8;
    analyzer.minDecibels = config?.minDecibels ?? -90;
    analyzer.maxDecibels = config?.maxDecibels ?? -10;
  }
  
  /**
   * Clean up unused analyzers (call periodically)
   */
  public cleanupAnalyzerPool(maxAge: number = 60000): void {
    const now = Date.now();
    this.analyzerPool = this.analyzerPool.filter(pooled => {
      if (!pooled.inUse && now - pooled.lastUsed > maxAge) {
        pooled.analyzer.disconnect();
        return false;
      }
      return true;
    });
  }
  
  // ============================================================
  // EFFECT CHAINS
  // ============================================================
  
  /**
   * Create or update an effect chain for a clip
   */
  public createEffectChain(clipId: string, effects: AudioEffect[]): AudioEffectChain {
    const context = this.getContext();
    
    console.log('[AudioContextManager] Creating effect chain for:', clipId);
    console.log('[AudioContextManager] Effects:', effects.map(e => ({ 
      type: e.type, 
      enabled: e.enabled, 
      order: e.order 
    })));
    
    // Dispose existing chain if any
    this.disposeEffectChain(clipId);
    
    // Create new chain
    const chain = createAudioEffectChain(context, effects);
    this.effectChains.set(clipId, chain);
    
    console.log('[AudioContextManager] Effect chain created with', chain.effectNodes.size, 'effect nodes');
    
    return chain;
  }
  
  /**
   * Get an existing effect chain
   */
  public getEffectChain(clipId: string): AudioEffectChain | undefined {
    return this.effectChains.get(clipId);
  }
  
  /**
   * Dispose an effect chain
   */
  public disposeEffectChain(clipId: string): void {
    const chain = this.effectChains.get(clipId);
    if (chain) {
      chain.dispose();
      this.effectChains.delete(clipId);
    }
  }
  
  /**
   * Dispose all effect chains
   */
  public disposeAllEffectChains(): void {
    this.effectChains.forEach(chain => chain.dispose());
    this.effectChains.clear();
  }
  
  // ============================================================
  // AUDIO LEVELS
  // ============================================================
  
  /**
   * Get audio levels from an analyzer
   */
  public getAudioLevels(analyzer: AnalyserNode): AudioLevels {
    const timeData = getTimeDomainData(analyzer);
    const rms = calculateRMSLevel(timeData);
    const peak = calculatePeakLevel(timeData);
    
    return {
      rms,
      peak,
      clipping: peak > -0.5, // Clipping threshold
    };
  }
  
  /**
   * Get frequency data from an analyzer
   */
  public getFrequencyData(analyzer: AnalyserNode): Uint8Array {
    return getFrequencyData(analyzer);
  }
  
  /**
   * Get master audio levels
   */
  public getMasterLevels(): AudioLevels | null {
    if (!this.masterAnalyzer) return null;
    return this.getAudioLevels(this.masterAnalyzer);
  }
  
  // ============================================================
  // UTILITIES
  // ============================================================
  
  /**
   * Create a media element source
   */
  public createMediaElementSource(element: HTMLMediaElement): MediaElementAudioSourceNode {
    return this.getContext().createMediaElementSource(element);
  }
  
  /**
   * Create a media stream source
   */
  public createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode {
    return this.getContext().createMediaStreamSource(stream);
  }
  
  /**
   * Get the sample rate
   */
  public getSampleRate(): number {
    return this.getContext().sampleRate;
  }
  
  /**
   * Get current time
   */
  public getCurrentTime(): number {
    return this.context?.currentTime ?? 0;
  }
  
  /**
   * Create an offline context for rendering
   */
  public createOfflineContext(
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ): OfflineAudioContext {
    return new OfflineAudioContext(numberOfChannels, length, sampleRate);
  }
  
  // ============================================================
  // CLEANUP
  // ============================================================
  
  /**
   * Dispose of all resources
   */
  public dispose(): void {
    // Dispose effect chains
    this.disposeAllEffectChains();
    
    // Clean up analyzer pool
    this.analyzerPool.forEach(pooled => {
      pooled.analyzer.disconnect();
    });
    this.analyzerPool = [];
    
    // Disconnect master chain
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }
    if (this.masterAnalyzer) {
      this.masterAnalyzer.disconnect();
      this.masterAnalyzer = null;
    }
    
    // Close context
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
  
  /**
   * Reset the manager (useful for testing)
   */
  public reset(): void {
    this.dispose();
    AudioContextManager.instance = new AudioContextManager();
  }
}

// ============================================================
// EXPORTS
// ============================================================

/**
 * Get the audio context manager instance
 */
export function getAudioContextManager(): AudioContextManager {
  return AudioContextManager.getInstance();
}

/**
 * Convenience function to get the AudioContext
 */
export function getAudioContext(): AudioContext {
  return AudioContextManager.getInstance().getContext();
}

/**
 * Convenience function to resume audio context
 */
export async function resumeAudioContext(): Promise<void> {
  return AudioContextManager.getInstance().resume();
}

/**
 * Hook-friendly audio context getter
 * Returns null if context doesn't exist yet
 */
export function getAudioContextIfExists(): AudioContext | null {
  const manager = AudioContextManager.getInstance();
  return manager.isContextReady() ? manager.getContext() : null;
}

export default AudioContextManager;
