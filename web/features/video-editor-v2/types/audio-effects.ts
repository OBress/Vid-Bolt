/**
 * Audio Effects System Types
 * 
 * Professional audio effects system similar to Adobe Premiere Pro and Audition.
 * Supports real-time processing using Web Audio API.
 * 
 * Features:
 * - Parametric EQ with visual frequency response
 * - Dynamics processing (Compressor, Noise Gate)
 * - Spatial effects (Reverb, Delay)
 * - Creative effects (Chorus, Distortion)
 * - Full keyframe animation support
 */

// ============================================================
// AUDIO EFFECT TYPE ENUM
// ============================================================

export enum AudioEffectType {
  // Dynamics
  COMPRESSOR = 'compressor',
  NOISE_GATE = 'noiseGate',
  LIMITER = 'limiter',
  
  // EQ
  PARAMETRIC_EQ = 'parametricEQ',
  
  // Spatial/Time
  REVERB = 'reverb',
  DELAY = 'delay',
  
  // Creative
  CHORUS = 'chorus',
  DISTORTION = 'distortion',
  
  // Utility
  GAIN = 'gain',
  STEREO_ENHANCER = 'stereoEnhancer',
}

// ============================================================
// BASE AUDIO EFFECT INTERFACE
// ============================================================

export interface BaseAudioEffect {
  /** Unique identifier for this effect instance */
  id: string;
  /** Type of audio effect */
  type: AudioEffectType;
  /** Whether this effect is currently enabled */
  enabled: boolean;
  /** Order in the effect chain (lower = processed first) */
  order: number;
  /** Display name for this effect instance */
  name?: string;
  /** Whether this effect is expanded in the UI */
  expanded?: boolean;
  /** Dry/Wet mix (0-100, where 100 is fully wet) */
  mix?: number;
}

// ============================================================
// EQ TYPES
// ============================================================

export type EQBandType = 
  | 'lowShelf'
  | 'highShelf'
  | 'peaking'
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch';

export interface EQBand {
  /** Band identifier */
  id: string;
  /** Band type */
  type: EQBandType;
  /** Center/cutoff frequency in Hz (20-20000) */
  frequency: number;
  /** Gain in dB (-24 to +24, only for shelf and peaking) */
  gain: number;
  /** Q factor / bandwidth (0.1-18) */
  q: number;
  /** Whether this band is enabled */
  enabled: boolean;
}

export interface ParametricEQEffect extends BaseAudioEffect {
  type: AudioEffectType.PARAMETRIC_EQ;
  /** EQ bands (typically 3-8 bands) */
  bands: EQBand[];
  /** Output gain in dB (-24 to +24) */
  outputGain: number;
  /** Current preset name (if using a preset) */
  presetName?: string;
}

// ============================================================
// DYNAMICS TYPES
// ============================================================

export interface CompressorEffect extends BaseAudioEffect {
  type: AudioEffectType.COMPRESSOR;
  /** Threshold in dB (-60 to 0) */
  threshold: number;
  /** Compression ratio (1:1 to 20:1) */
  ratio: number;
  /** Attack time in ms (0.1 to 1000) */
  attack: number;
  /** Release time in ms (10 to 3000) */
  release: number;
  /** Knee width in dB (0 to 40) */
  knee: number;
  /** Makeup gain in dB (0 to 24) */
  makeupGain: number;
  /** Auto makeup gain */
  autoMakeup: boolean;
}

export interface NoiseGateEffect extends BaseAudioEffect {
  type: AudioEffectType.NOISE_GATE;
  /** Threshold in dB (-80 to 0) */
  threshold: number;
  /** Attack time in ms (0.1 to 100) */
  attack: number;
  /** Hold time in ms (0 to 500) */
  hold: number;
  /** Release time in ms (10 to 1000) */
  release: number;
  /** Range/depth in dB (-80 to 0, how much to attenuate when closed) */
  range: number;
}

export interface LimiterEffect extends BaseAudioEffect {
  type: AudioEffectType.LIMITER;
  /** Ceiling in dB (-12 to 0) */
  ceiling: number;
  /** Release time in ms (10 to 1000) */
  release: number;
  /** Lookahead in ms (0 to 10) */
  lookahead: number;
}

// ============================================================
// SPATIAL/TIME TYPES
// ============================================================

export type ReverbPreset = 
  | 'small_room'
  | 'medium_room'
  | 'large_room'
  | 'hall'
  | 'cathedral'
  | 'plate'
  | 'spring'
  | 'chamber'
  | 'ambient';

export interface ReverbEffect extends BaseAudioEffect {
  type: AudioEffectType.REVERB;
  /** Reverb preset */
  preset: ReverbPreset;
  /** Decay time in seconds (0.1 to 10) */
  decay: number;
  /** Pre-delay in ms (0 to 200) */
  preDelay: number;
  /** High frequency damping (0-100) */
  damping: number;
  /** Room size (0-100) */
  roomSize: number;
  /** Dry/Wet mix (0-100) */
  mix: number;
}

export interface DelayEffect extends BaseAudioEffect {
  type: AudioEffectType.DELAY;
  /** Delay time in ms (1 to 2000) */
  delayTime: number;
  /** Feedback amount (0-95%) */
  feedback: number;
  /** High cut frequency in Hz (200-20000) */
  highCut: number;
  /** Low cut frequency in Hz (20-2000) */
  lowCut: number;
  /** Sync to tempo (optional) */
  syncTempo: boolean;
  /** Note value when synced (1/4, 1/8, etc.) */
  noteValue?: '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32';
  /** Dry/Wet mix (0-100) */
  mix: number;
  /** Stereo ping-pong mode */
  pingPong: boolean;
}

// ============================================================
// CREATIVE TYPES
// ============================================================

export interface ChorusEffect extends BaseAudioEffect {
  type: AudioEffectType.CHORUS;
  /** Modulation rate in Hz (0.1 to 10) */
  rate: number;
  /** Modulation depth (0-100) */
  depth: number;
  /** Delay time in ms (1 to 50) */
  delay: number;
  /** Feedback amount (0-95%) */
  feedback: number;
  /** Dry/Wet mix (0-100) */
  mix: number;
}

export interface DistortionEffect extends BaseAudioEffect {
  type: AudioEffectType.DISTORTION;
  /** Drive/amount (0-100) */
  drive: number;
  /** Tone/color (-100 to +100) */
  tone: number;
  /** Output level in dB (-24 to 0) */
  output: number;
  /** Distortion type */
  distortionType: 'soft' | 'hard' | 'tube' | 'fuzz';
}

// ============================================================
// UTILITY TYPES
// ============================================================

export interface GainEffect extends BaseAudioEffect {
  type: AudioEffectType.GAIN;
  /** Gain in dB (-60 to +24) */
  gain: number;
}

export interface StereoEnhancerEffect extends BaseAudioEffect {
  type: AudioEffectType.STEREO_ENHANCER;
  /** Width (0-200, 100 = normal, 0 = mono, 200 = extra wide) */
  width: number;
  /** Mid level in dB (-24 to +24) */
  midLevel: number;
  /** Side level in dB (-24 to +24) */
  sideLevel: number;
}

// ============================================================
// AUDIO EFFECT UNION TYPE
// ============================================================

export type AudioEffect =
  | ParametricEQEffect
  | CompressorEffect
  | NoiseGateEffect
  | LimiterEffect
  | ReverbEffect
  | DelayEffect
  | ChorusEffect
  | DistortionEffect
  | GainEffect
  | StereoEnhancerEffect;

// ============================================================
// DEFAULT VALUES
// ============================================================

export const DEFAULT_EQ_BAND: Omit<EQBand, 'id'> = {
  type: 'peaking',
  frequency: 1000,
  gain: 0,
  q: 1,
  enabled: true,
};

export const DEFAULT_AUDIO_EFFECT_VALUES: Record<AudioEffectType, Omit<AudioEffect, 'id' | 'order'>> = {
  [AudioEffectType.PARAMETRIC_EQ]: {
    type: AudioEffectType.PARAMETRIC_EQ,
    enabled: true,
    bands: [
      { id: 'band-1', type: 'highpass', frequency: 80, gain: 0, q: 0.7, enabled: true },
      { id: 'band-2', type: 'lowShelf', frequency: 200, gain: 0, q: 0.7, enabled: true },
      { id: 'band-3', type: 'peaking', frequency: 1000, gain: 0, q: 1, enabled: true },
      { id: 'band-4', type: 'peaking', frequency: 3000, gain: 0, q: 1, enabled: true },
      { id: 'band-5', type: 'highShelf', frequency: 8000, gain: 0, q: 0.7, enabled: true },
    ],
    outputGain: 0,
  },
  
  [AudioEffectType.COMPRESSOR]: {
    type: AudioEffectType.COMPRESSOR,
    enabled: true,
    threshold: -18,
    ratio: 4,
    attack: 10,
    release: 100,
    knee: 6,
    makeupGain: 0,
    autoMakeup: true,
  },
  
  [AudioEffectType.NOISE_GATE]: {
    type: AudioEffectType.NOISE_GATE,
    enabled: true,
    threshold: -40,
    attack: 0.5,
    hold: 50,
    release: 100,
    range: -80,
  },
  
  [AudioEffectType.LIMITER]: {
    type: AudioEffectType.LIMITER,
    enabled: true,
    ceiling: -0.3,
    release: 100,
    lookahead: 5,
  },
  
  [AudioEffectType.REVERB]: {
    type: AudioEffectType.REVERB,
    enabled: true,
    preset: 'medium_room',
    decay: 1.5,
    preDelay: 20,
    damping: 50,
    roomSize: 50,
    mix: 30,
  },
  
  [AudioEffectType.DELAY]: {
    type: AudioEffectType.DELAY,
    enabled: true,
    delayTime: 250,
    feedback: 30,
    highCut: 8000,
    lowCut: 200,
    syncTempo: false,
    mix: 25,
    pingPong: false,
  },
  
  [AudioEffectType.CHORUS]: {
    type: AudioEffectType.CHORUS,
    enabled: true,
    rate: 1.5,
    depth: 50,
    delay: 7,
    feedback: 20,
    mix: 50,
  },
  
  [AudioEffectType.DISTORTION]: {
    type: AudioEffectType.DISTORTION,
    enabled: true,
    drive: 30,
    tone: 0,
    output: -6,
    distortionType: 'soft',
  },
  
  [AudioEffectType.GAIN]: {
    type: AudioEffectType.GAIN,
    enabled: true,
    gain: 0,
  },
  
  [AudioEffectType.STEREO_ENHANCER]: {
    type: AudioEffectType.STEREO_ENHANCER,
    enabled: true,
    width: 100,
    midLevel: 0,
    sideLevel: 0,
  },
};

// ============================================================
// EFFECT METADATA
// ============================================================

export interface AudioEffectMetadata {
  type: AudioEffectType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'dynamics' | 'eq' | 'spatial' | 'creative' | 'utility';
}

export const AUDIO_EFFECT_METADATA: Record<AudioEffectType, AudioEffectMetadata> = {
  [AudioEffectType.PARAMETRIC_EQ]: {
    type: AudioEffectType.PARAMETRIC_EQ,
    name: 'Parametric EQ',
    description: 'Shape frequency response with multiple bands',
    icon: 'Activity',
    category: 'eq',
  },
  
  [AudioEffectType.COMPRESSOR]: {
    type: AudioEffectType.COMPRESSOR,
    name: 'Compressor',
    description: 'Control dynamic range and add punch',
    icon: 'Gauge',
    category: 'dynamics',
  },
  
  [AudioEffectType.NOISE_GATE]: {
    type: AudioEffectType.NOISE_GATE,
    name: 'Noise Gate',
    description: 'Remove background noise and unwanted sounds',
    icon: 'VolumeX',
    category: 'dynamics',
  },
  
  [AudioEffectType.LIMITER]: {
    type: AudioEffectType.LIMITER,
    name: 'Limiter',
    description: 'Prevent clipping and maximize loudness',
    icon: 'BarChart3',
    category: 'dynamics',
  },
  
  [AudioEffectType.REVERB]: {
    type: AudioEffectType.REVERB,
    name: 'Reverb',
    description: 'Add space and depth with room simulation',
    icon: 'Waves',
    category: 'spatial',
  },
  
  [AudioEffectType.DELAY]: {
    type: AudioEffectType.DELAY,
    name: 'Delay',
    description: 'Create echoes and rhythmic effects',
    icon: 'Timer',
    category: 'spatial',
  },
  
  [AudioEffectType.CHORUS]: {
    type: AudioEffectType.CHORUS,
    name: 'Chorus',
    description: 'Thicken sound with modulated copies',
    icon: 'Users',
    category: 'creative',
  },
  
  [AudioEffectType.DISTORTION]: {
    type: AudioEffectType.DISTORTION,
    name: 'Distortion',
    description: 'Add warmth, grit, or aggressive distortion',
    icon: 'Zap',
    category: 'creative',
  },
  
  [AudioEffectType.GAIN]: {
    type: AudioEffectType.GAIN,
    name: 'Gain',
    description: 'Adjust overall volume level',
    icon: 'Volume2',
    category: 'utility',
  },
  
  [AudioEffectType.STEREO_ENHANCER]: {
    type: AudioEffectType.STEREO_ENHANCER,
    name: 'Stereo Enhancer',
    description: 'Control stereo width and balance',
    icon: 'PanelLeftClose',
    category: 'utility',
  },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Creates a new audio effect with default values
 */
export function createAudioEffect(type: AudioEffectType, order: number): AudioEffect {
  const defaults = DEFAULT_AUDIO_EFFECT_VALUES[type];
  return {
    ...defaults,
    id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    order,
    expanded: true,
  } as AudioEffect;
}

/**
 * Generates a unique audio effect ID
 */
export function generateAudioEffectId(): string {
  return `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new EQ band with default values
 */
export function createEQBand(type: EQBandType = 'peaking', frequency: number = 1000): EQBand {
  return {
    id: `eq-band-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...DEFAULT_EQ_BAND,
    type,
    frequency,
  };
}

/**
 * Gets the list of all addable audio effect types
 */
export function getAddableAudioEffectTypes(): AudioEffectType[] {
  return Object.values(AudioEffectType);
}

/**
 * Gets audio effects grouped by category
 */
export function getAudioEffectsByCategory(): Record<string, AudioEffectType[]> {
  const categories: Record<string, AudioEffectType[]> = {};
  
  Object.values(AudioEffectType).forEach(type => {
    const metadata = AUDIO_EFFECT_METADATA[type];
    if (!categories[metadata.category]) {
      categories[metadata.category] = [];
    }
    categories[metadata.category].push(type);
  });
  
  return categories;
}

/**
 * Category display names
 */
export const AUDIO_EFFECT_CATEGORY_NAMES: Record<string, string> = {
  dynamics: 'Dynamics',
  eq: 'Equalizer',
  spatial: 'Spatial & Time',
  creative: 'Creative',
  utility: 'Utility',
};

// ============================================================
// ANIMATABLE PROPERTIES
// ============================================================

/**
 * Defines which audio effect properties can be keyframed
 */
export const ANIMATABLE_AUDIO_EFFECT_PROPERTIES: Record<AudioEffectType, string[]> = {
  [AudioEffectType.PARAMETRIC_EQ]: [
    'bands[*].frequency',
    'bands[*].gain',
    'bands[*].q',
    'outputGain',
  ],
  [AudioEffectType.COMPRESSOR]: [
    'threshold',
    'ratio',
    'attack',
    'release',
    'makeupGain',
  ],
  [AudioEffectType.NOISE_GATE]: [
    'threshold',
    'attack',
    'hold',
    'release',
  ],
  [AudioEffectType.LIMITER]: [
    'ceiling',
    'release',
  ],
  [AudioEffectType.REVERB]: [
    'decay',
    'preDelay',
    'damping',
    'mix',
  ],
  [AudioEffectType.DELAY]: [
    'delayTime',
    'feedback',
    'mix',
  ],
  [AudioEffectType.CHORUS]: [
    'rate',
    'depth',
    'mix',
  ],
  [AudioEffectType.DISTORTION]: [
    'drive',
    'tone',
    'output',
  ],
  [AudioEffectType.GAIN]: [
    'gain',
  ],
  [AudioEffectType.STEREO_ENHANCER]: [
    'width',
    'midLevel',
    'sideLevel',
  ],
};
