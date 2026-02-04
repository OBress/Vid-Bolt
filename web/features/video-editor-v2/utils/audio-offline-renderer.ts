/**
 * Audio Offline Renderer
 * 
 * Offline audio processing for export/rendering.
 * Uses OfflineAudioContext to process audio files with effects
 * for consistent, deterministic output regardless of real-time performance.
 * 
 * Features:
 * - Process audio files through effect chains offline
 * - Generate processed audio buffers for export
 * - Support for all audio effect types
 * - Progress reporting for long operations
 */

import type { AudioEffect } from '../types/audio-effects';
import { createEffectNode, type AudioEffectNode } from './audio-effect-processor';

// ============================================================
// TYPES
// ============================================================

export interface OfflineRenderOptions {
  /** Sample rate for output (default: 44100) */
  sampleRate?: number;
  /** Number of channels (default: 2 for stereo) */
  numberOfChannels?: number;
  /** Progress callback (0-1) */
  onProgress?: (progress: number) => void;
}

export interface OfflineRenderResult {
  /** Processed audio buffer */
  buffer: AudioBuffer;
  /** Duration in seconds */
  duration: number;
  /** Sample rate */
  sampleRate: number;
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Load an audio file and decode it
 */
async function loadAudioBuffer(
  url: string,
  sampleRate: number = 44100
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  
  // Create a temporary context for decoding
  const tempContext = new OfflineAudioContext(2, 1, sampleRate);
  const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);
  
  return audioBuffer;
}

/**
 * Create an offline context with the correct size
 */
function createOfflineContext(
  buffer: AudioBuffer,
  options: OfflineRenderOptions = {}
): OfflineAudioContext {
  const sampleRate = options.sampleRate ?? buffer.sampleRate;
  const numberOfChannels = options.numberOfChannels ?? buffer.numberOfChannels;
  const length = Math.ceil(buffer.length * (sampleRate / buffer.sampleRate));
  
  return new OfflineAudioContext(numberOfChannels, length, sampleRate);
}

/**
 * Connect effects in series
 */
function connectEffectsChain(
  context: OfflineAudioContext,
  effects: AudioEffect[],
  sourceNode: AudioBufferSourceNode,
  destinationNode: AudioNode
): AudioEffectNode[] {
  // Sort and filter enabled effects
  const enabledEffects = effects
    .filter(e => e.enabled)
    .sort((a, b) => a.order - b.order);
  
  if (enabledEffects.length === 0) {
    // No effects - direct connection
    sourceNode.connect(destinationNode);
    return [];
  }
  
  // Create effect nodes
  const effectNodes: AudioEffectNode[] = enabledEffects.map(effect => 
    createEffectNode(context, effect)
  );
  
  // Connect chain: source -> effect1 -> effect2 -> ... -> destination
  sourceNode.connect(effectNodes[0].inputNode);
  
  for (let i = 0; i < effectNodes.length - 1; i++) {
    effectNodes[i].outputNode.connect(effectNodes[i + 1].inputNode);
  }
  
  effectNodes[effectNodes.length - 1].outputNode.connect(destinationNode);
  
  return effectNodes;
}

// ============================================================
// MAIN RENDER FUNCTION
// ============================================================

/**
 * Process an audio file through effect chain offline
 * 
 * @param audioUrl - URL of the audio file to process
 * @param effects - Array of audio effects to apply
 * @param options - Render options
 * @returns Processed audio buffer
 */
export async function renderAudioOffline(
  audioUrl: string,
  effects: AudioEffect[],
  options: OfflineRenderOptions = {}
): Promise<OfflineRenderResult> {
  const { onProgress } = options;
  
  // Report initial progress
  onProgress?.(0);
  
  // Load the source audio
  const sourceBuffer = await loadAudioBuffer(audioUrl, options.sampleRate);
  onProgress?.(0.2);
  
  // Create offline context
  const offlineContext = createOfflineContext(sourceBuffer, options);
  
  // Create source node
  const sourceNode = offlineContext.createBufferSource();
  sourceNode.buffer = sourceBuffer;
  
  // Connect effects chain
  const effectNodes = connectEffectsChain(
    offlineContext,
    effects,
    sourceNode,
    offlineContext.destination
  );
  
  onProgress?.(0.3);
  
  // Start playback
  sourceNode.start(0);
  
  // Render
  const renderedBuffer = await offlineContext.startRendering();
  
  // Cleanup
  effectNodes.forEach(node => node.dispose());
  
  onProgress?.(1);
  
  return {
    buffer: renderedBuffer,
    duration: renderedBuffer.duration,
    sampleRate: renderedBuffer.sampleRate,
  };
}

/**
 * Process an existing AudioBuffer through effect chain
 */
export async function processAudioBuffer(
  sourceBuffer: AudioBuffer,
  effects: AudioEffect[],
  options: OfflineRenderOptions = {}
): Promise<AudioBuffer> {
  const { onProgress } = options;
  
  onProgress?.(0);
  
  // Create offline context
  const offlineContext = createOfflineContext(sourceBuffer, options);
  
  // Create source node
  const sourceNode = offlineContext.createBufferSource();
  sourceNode.buffer = sourceBuffer;
  
  // Connect effects chain
  const effectNodes = connectEffectsChain(
    offlineContext,
    effects,
    sourceNode,
    offlineContext.destination
  );
  
  onProgress?.(0.3);
  
  // Start playback
  sourceNode.start(0);
  
  // Render
  const renderedBuffer = await offlineContext.startRendering();
  
  // Cleanup
  effectNodes.forEach(node => node.dispose());
  
  onProgress?.(1);
  
  return renderedBuffer;
}

/**
 * Convert AudioBuffer to WAV blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Convert AudioBuffer to MP3 blob (requires encoding library)
 * This is a placeholder - actual MP3 encoding requires a library like lamejs
 */
export async function audioBufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  // For now, return WAV as fallback
  // In production, you'd use a library like lamejs for MP3 encoding
  console.warn('MP3 encoding not implemented, returning WAV');
  return audioBufferToWav(buffer);
}

/**
 * Helper to write string to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Process a segment of audio (for timeline clips)
 */
export async function renderAudioSegment(
  audioUrl: string,
  effects: AudioEffect[],
  startTime: number,
  duration: number,
  options: OfflineRenderOptions = {}
): Promise<OfflineRenderResult> {
  const { onProgress } = options;
  const sampleRate = options.sampleRate ?? 44100;
  
  onProgress?.(0);
  
  // Load the source audio
  const sourceBuffer = await loadAudioBuffer(audioUrl, sampleRate);
  onProgress?.(0.2);
  
  // Calculate sample positions
  const startSample = Math.floor(startTime * sourceBuffer.sampleRate);
  const endSample = Math.min(
    sourceBuffer.length,
    Math.floor((startTime + duration) * sourceBuffer.sampleRate)
  );
  const segmentLength = endSample - startSample;
  
  // Create a new buffer for the segment
  const segmentBuffer = new AudioBuffer({
    numberOfChannels: sourceBuffer.numberOfChannels,
    length: segmentLength,
    sampleRate: sourceBuffer.sampleRate,
  });
  
  // Copy segment data
  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const segmentData = segmentBuffer.getChannelData(channel);
    for (let i = 0; i < segmentLength; i++) {
      segmentData[i] = sourceData[startSample + i];
    }
  }
  
  onProgress?.(0.3);
  
  // Process the segment through effects
  const processedBuffer = await processAudioBuffer(segmentBuffer, effects, {
    ...options,
    onProgress: (p) => onProgress?.(0.3 + p * 0.7),
  });
  
  return {
    buffer: processedBuffer,
    duration: processedBuffer.duration,
    sampleRate: processedBuffer.sampleRate,
  };
}

/**
 * Batch process multiple audio clips
 */
export async function batchRenderAudio(
  clips: Array<{
    url: string;
    effects: AudioEffect[];
    startTime: number;
    duration: number;
  }>,
  options: OfflineRenderOptions = {}
): Promise<OfflineRenderResult[]> {
  const { onProgress } = options;
  const results: OfflineRenderResult[] = [];
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipProgress = (progress: number) => {
      const overallProgress = (i + progress) / clips.length;
      onProgress?.(overallProgress);
    };
    
    const result = await renderAudioSegment(
      clip.url,
      clip.effects,
      clip.startTime,
      clip.duration,
      { ...options, onProgress: clipProgress }
    );
    
    results.push(result);
  }
  
  return results;
}

/**
 * Mix multiple audio buffers together
 */
export function mixAudioBuffers(
  buffers: Array<{ buffer: AudioBuffer; startTime: number; volume: number }>,
  totalDuration: number,
  sampleRate: number = 44100
): AudioBuffer {
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const numberOfChannels = Math.max(...buffers.map(b => b.buffer.numberOfChannels));
  
  const mixedBuffer = new AudioBuffer({
    numberOfChannels,
    length: totalSamples,
    sampleRate,
  });
  
  // Initialize with silence
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = mixedBuffer.getChannelData(channel);
    data.fill(0);
  }
  
  // Mix each buffer
  for (const { buffer, startTime, volume } of buffers) {
    const startSample = Math.floor(startTime * sampleRate);
    
    for (let channel = 0; channel < Math.min(numberOfChannels, buffer.numberOfChannels); channel++) {
      const sourceData = buffer.getChannelData(channel);
      const destData = mixedBuffer.getChannelData(channel);
      
      for (let i = 0; i < sourceData.length; i++) {
        const destIndex = startSample + i;
        if (destIndex < totalSamples) {
          // Additive mixing with volume
          destData[destIndex] += sourceData[i] * volume;
        }
      }
    }
  }
  
  // Normalize to prevent clipping
  let maxSample = 0;
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = mixedBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      const absValue = Math.abs(data[i]);
      if (absValue > maxSample) maxSample = absValue;
    }
  }
  
  if (maxSample > 1) {
    const normalizeRatio = 0.99 / maxSample;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const data = mixedBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] *= normalizeRatio;
      }
    }
  }
  
  return mixedBuffer;
}
