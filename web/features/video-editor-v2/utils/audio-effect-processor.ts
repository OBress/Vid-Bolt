/**
 * Audio Effect Processor
 * 
 * Web Audio API-based audio effect processing engine.
 * Handles real-time audio effects like EQ, Compression, Reverb, etc.
 * 
 * Architecture:
 * - Creates and manages Web Audio API node graphs
 * - Supports dynamic effect chain updates
 * - Provides analyzer nodes for visualization
 * - Memory-efficient with proper cleanup
 */

import type {
  AudioEffect,
  AudioEffectType,
  ParametricEQEffect,
  CompressorEffect,
  NoiseGateEffect,
  LimiterEffect,
  ReverbEffect,
  DelayEffect,
  ChorusEffect,
  DistortionEffect,
  GainEffect,
  StereoEnhancerEffect,
  EQBand,
} from '../types/audio-effects';
import { AudioEffectType as AET } from '../types/audio-effects';

// ============================================================
// TYPES
// ============================================================

export interface AudioEffectNode {
  type: AudioEffectType;
  inputNode: AudioNode;
  outputNode: AudioNode;
  nodes: AudioNode[];
  update: (effect: AudioEffect) => void;
  dispose: () => void;
}

export interface AudioEffectChain {
  inputNode: GainNode;
  outputNode: GainNode;
  analyzerPre: AnalyserNode;
  analyzerPost: AnalyserNode;
  effectNodes: Map<string, AudioEffectNode>;
  dispose: () => void;
}

// ============================================================
// REVERB IMPULSE RESPONSE GENERATION
// ============================================================

/**
 * Generate a simple impulse response for reverb
 * This is a synthetic IR - in production you'd load real IR files
 */
function generateImpulseResponse(
  context: BaseAudioContext,
  duration: number,
  decay: number,
  reverse: boolean = false
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponential decay with random noise
      const n = reverse ? length - i : i;
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    }
  }
  
  return impulse;
}

/**
 * Get reverb preset parameters
 */
function getReverbPresetParams(preset: string): { duration: number; decay: number } {
  const presets: Record<string, { duration: number; decay: number }> = {
    small_room: { duration: 0.8, decay: 2 },
    medium_room: { duration: 1.5, decay: 2.5 },
    large_room: { duration: 2.5, decay: 3 },
    hall: { duration: 3.5, decay: 3.5 },
    cathedral: { duration: 5, decay: 4 },
    plate: { duration: 2, decay: 2 },
    spring: { duration: 1.2, decay: 1.5 },
    chamber: { duration: 2, decay: 3 },
    ambient: { duration: 4, decay: 5 },
  };
  return presets[preset] || presets.medium_room;
}

// ============================================================
// DISTORTION CURVE GENERATION
// ============================================================

/**
 * Generate distortion curve
 */
function makeDistortionCurve(amount: number, type: string): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    
    switch (type) {
      case 'soft':
        // Soft clipping (tanh)
        curve[i] = Math.tanh(x * amount * 0.1);
        break;
      case 'hard':
        // Hard clipping
        curve[i] = Math.max(-1, Math.min(1, x * (1 + amount * 0.1)));
        break;
      case 'tube':
        // Tube-like saturation
        const k = amount * 0.5;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        break;
      case 'fuzz':
        // Fuzz distortion
        curve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.5 / (1 + amount * 0.1));
        break;
      default:
        curve[i] = ((3 + amount * 0.2) * x * 20 * deg) / (Math.PI + amount * 0.2 * Math.abs(x));
    }
  }
  
  return curve;
}

// ============================================================
// EFFECT NODE CREATORS
// ============================================================

/**
 * Create Parametric EQ effect nodes
 */
function createParametricEQ(
  context: BaseAudioContext,
  effect: ParametricEQEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const outputGain = context.createGain();
  const filters: BiquadFilterNode[] = [];
  
  // Create a filter for each band
  effect.bands.forEach((band, index) => {
    const filter = context.createBiquadFilter();
    updateEQBand(filter, band);
    filters.push(filter);
  });
  
  // Connect filters in series
  let prevNode: AudioNode = inputGain;
  filters.forEach(filter => {
    prevNode.connect(filter);
    prevNode = filter;
  });
  prevNode.connect(outputGain);
  
  // Set output gain (clamped to prevent distortion)
  const outputGainLinear = Math.pow(10, effect.outputGain / 20);
  outputGain.gain.value = Math.min(2, outputGainLinear); // Limit to +6dB max
  
  return {
    type: AET.PARAMETRIC_EQ,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, ...filters, outputGain],
    update: (newEffect: AudioEffect) => {
      const eq = newEffect as ParametricEQEffect;
      eq.bands.forEach((band, index) => {
        if (filters[index]) {
          updateEQBand(filters[index], band);
        }
      });
      outputGain.gain.value = Math.pow(10, eq.outputGain / 20);
    },
    dispose: () => {
      filters.forEach(f => f.disconnect());
      inputGain.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Update a single EQ band
 */
function updateEQBand(filter: BiquadFilterNode, band: EQBand): void {
  if (!band.enabled) {
    // Bypass: set to flat response
    filter.type = 'peaking';
    filter.gain.value = 0;
    return;
  }
  
  // Map band type to Web Audio filter type
  const typeMap: Record<string, BiquadFilterType> = {
    lowShelf: 'lowshelf',
    highShelf: 'highshelf',
    peaking: 'peaking',
    lowpass: 'lowpass',
    highpass: 'highpass',
    bandpass: 'bandpass',
    notch: 'notch',
  };
  
  filter.type = typeMap[band.type] || 'peaking';
  filter.frequency.value = band.frequency;
  filter.Q.value = band.q;
  
  // Only shelf and peaking filters use gain
  if (['lowShelf', 'highShelf', 'peaking'].includes(band.type)) {
    filter.gain.value = band.gain;
  }
}

/**
 * Create Compressor effect nodes
 */
function createCompressor(
  context: BaseAudioContext,
  effect: CompressorEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const makeupGain = context.createGain();
  
  // Set compressor parameters
  compressor.threshold.value = effect.threshold;
  compressor.ratio.value = effect.ratio;
  compressor.attack.value = effect.attack / 1000; // Convert ms to seconds
  compressor.release.value = effect.release / 1000;
  compressor.knee.value = effect.knee;
  
  // Calculate makeup gain
  let gain = effect.makeupGain;
  if (effect.autoMakeup) {
    // Simple auto-makeup: compensate for average gain reduction
    const avgReduction = (effect.threshold * (1 - 1 / effect.ratio)) / 2;
    gain = -avgReduction;
  }
  makeupGain.gain.value = Math.pow(10, gain / 20);
  
  // Connect
  inputGain.connect(compressor);
  compressor.connect(makeupGain);
  
  return {
    type: AET.COMPRESSOR,
    inputNode: inputGain,
    outputNode: makeupGain,
    nodes: [inputGain, compressor, makeupGain],
    update: (newEffect: AudioEffect) => {
      const comp = newEffect as CompressorEffect;
      compressor.threshold.value = comp.threshold;
      compressor.ratio.value = comp.ratio;
      compressor.attack.value = comp.attack / 1000;
      compressor.release.value = comp.release / 1000;
      compressor.knee.value = comp.knee;
      
      let newGain = comp.makeupGain;
      if (comp.autoMakeup) {
        const avgReduction = (comp.threshold * (1 - 1 / comp.ratio)) / 2;
        newGain = -avgReduction;
      }
      makeupGain.gain.value = Math.pow(10, newGain / 20);
    },
    dispose: () => {
      inputGain.disconnect();
      compressor.disconnect();
      makeupGain.disconnect();
    },
  };
}

/**
 * Create Noise Gate effect nodes
 * Note: Web Audio doesn't have a native gate, so we simulate with gain automation
 */
function createNoiseGate(
  context: BaseAudioContext,
  effect: NoiseGateEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const outputGain = context.createGain();
  const analyser = context.createAnalyser();
  
  analyser.fftSize = 256;
  const dataArray = new Float32Array(analyser.frequencyBinCount);
  
  // For a proper noise gate, you'd need ScriptProcessor or AudioWorklet
  // This is a simplified version that doesn't actually gate in real-time
  // In a production app, you'd use an AudioWorklet for proper gating
  
  inputGain.connect(analyser);
  analyser.connect(outputGain);
  
  // Store parameters for later use
  (outputGain as any)._gateParams = {
    threshold: effect.threshold,
    attack: effect.attack,
    hold: effect.hold,
    release: effect.release,
    range: effect.range,
  };
  
  return {
    type: AET.NOISE_GATE,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, analyser, outputGain],
    update: (newEffect: AudioEffect) => {
      const gate = newEffect as NoiseGateEffect;
      (outputGain as any)._gateParams = {
        threshold: gate.threshold,
        attack: gate.attack,
        hold: gate.hold,
        release: gate.release,
        range: gate.range,
      };
    },
    dispose: () => {
      inputGain.disconnect();
      analyser.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Limiter effect nodes
 */
function createLimiter(
  context: BaseAudioContext,
  effect: LimiterEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const outputGain = context.createGain();
  
  // Configure as a limiter (high ratio, fast attack)
  compressor.threshold.value = effect.ceiling;
  compressor.ratio.value = 20; // High ratio for limiting
  compressor.attack.value = 0.001; // Very fast attack
  compressor.release.value = effect.release / 1000;
  compressor.knee.value = 0; // Hard knee for limiting
  
  inputGain.connect(compressor);
  compressor.connect(outputGain);
  
  return {
    type: AET.LIMITER,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, compressor, outputGain],
    update: (newEffect: AudioEffect) => {
      const lim = newEffect as LimiterEffect;
      compressor.threshold.value = lim.ceiling;
      compressor.release.value = lim.release / 1000;
    },
    dispose: () => {
      inputGain.disconnect();
      compressor.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Reverb effect nodes
 */
function createReverb(
  context: BaseAudioContext,
  effect: ReverbEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const convolver = context.createConvolver();
  const preDelay = context.createDelay(1);
  const outputGain = context.createGain();
  
  // Generate impulse response based on preset
  const presetParams = getReverbPresetParams(effect.preset);
  const adjustedDuration = presetParams.duration * (effect.roomSize / 50);
  const adjustedDecay = presetParams.decay * (1 + effect.damping / 100);
  
  convolver.buffer = generateImpulseResponse(
    context,
    Math.max(0.1, adjustedDuration * effect.decay),
    adjustedDecay
  );
  
  // Set pre-delay
  preDelay.delayTime.value = effect.preDelay / 1000;
  
  // Set wet/dry mix
  const wetLevel = effect.mix / 100;
  const dryLevel = 1 - wetLevel * 0.5; // Keep some dry signal
  dryGain.gain.value = dryLevel;
  wetGain.gain.value = wetLevel;
  
  // Connect: input -> dry -> output
  //          input -> preDelay -> convolver -> wet -> output
  inputGain.connect(dryGain);
  inputGain.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(outputGain);
  wetGain.connect(outputGain);
  
  return {
    type: AET.REVERB,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, dryGain, wetGain, convolver, preDelay, outputGain],
    update: (newEffect: AudioEffect) => {
      const rev = newEffect as ReverbEffect;
      
      // Update impulse response if preset or parameters changed
      const newPresetParams = getReverbPresetParams(rev.preset);
      const newDuration = newPresetParams.duration * (rev.roomSize / 50);
      const newDecay = newPresetParams.decay * (1 + rev.damping / 100);
      
      convolver.buffer = generateImpulseResponse(
        context,
        Math.max(0.1, newDuration * rev.decay),
        newDecay
      );
      
      preDelay.delayTime.value = rev.preDelay / 1000;
      
      const newWetLevel = rev.mix / 100;
      const newDryLevel = 1 - newWetLevel * 0.5;
      dryGain.gain.value = newDryLevel;
      wetGain.gain.value = newWetLevel;
    },
    dispose: () => {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      convolver.disconnect();
      preDelay.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Delay effect nodes
 */
function createDelay(
  context: BaseAudioContext,
  effect: DelayEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delayL = context.createDelay(5);
  const delayR = context.createDelay(5);
  const feedbackGain = context.createGain();
  const highCut = context.createBiquadFilter();
  const lowCut = context.createBiquadFilter();
  const outputGain = context.createGain();
  
  // Configure delays
  delayL.delayTime.value = effect.delayTime / 1000;
  delayR.delayTime.value = effect.pingPong 
    ? (effect.delayTime / 1000) * 2 
    : effect.delayTime / 1000;
  
  // Configure feedback
  feedbackGain.gain.value = effect.feedback / 100;
  
  // Configure filters
  highCut.type = 'lowpass';
  highCut.frequency.value = effect.highCut;
  lowCut.type = 'highpass';
  lowCut.frequency.value = effect.lowCut;
  
  // Set wet/dry
  const wetLevel = effect.mix / 100;
  dryGain.gain.value = 1;
  wetGain.gain.value = wetLevel;
  
  // Connect
  inputGain.connect(dryGain);
  inputGain.connect(lowCut);
  lowCut.connect(highCut);
  highCut.connect(delayL);
  delayL.connect(feedbackGain);
  feedbackGain.connect(delayL); // Feedback loop
  delayL.connect(wetGain);
  dryGain.connect(outputGain);
  wetGain.connect(outputGain);
  
  return {
    type: AET.DELAY,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, dryGain, wetGain, delayL, delayR, feedbackGain, highCut, lowCut, outputGain],
    update: (newEffect: AudioEffect) => {
      const del = newEffect as DelayEffect;
      delayL.delayTime.value = del.delayTime / 1000;
      delayR.delayTime.value = del.pingPong 
        ? (del.delayTime / 1000) * 2 
        : del.delayTime / 1000;
      feedbackGain.gain.value = del.feedback / 100;
      highCut.frequency.value = del.highCut;
      lowCut.frequency.value = del.lowCut;
      wetGain.gain.value = del.mix / 100;
    },
    dispose: () => {
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      delayL.disconnect();
      delayR.disconnect();
      feedbackGain.disconnect();
      highCut.disconnect();
      lowCut.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Chorus effect nodes
 */
function createChorus(
  context: BaseAudioContext,
  effect: ChorusEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delay = context.createDelay(1);
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  const feedbackGain = context.createGain();
  const outputGain = context.createGain();
  
  // Configure LFO
  lfo.type = 'sine';
  lfo.frequency.value = effect.rate;
  lfoGain.gain.value = (effect.depth / 100) * (effect.delay / 1000);
  
  // Configure delay
  delay.delayTime.value = effect.delay / 1000;
  
  // Configure feedback
  feedbackGain.gain.value = effect.feedback / 100;
  
  // Set wet/dry
  const wetLevel = effect.mix / 100;
  dryGain.gain.value = 1;
  wetGain.gain.value = wetLevel;
  
  // Connect LFO to delay time
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start();
  
  // Connect audio path
  inputGain.connect(dryGain);
  inputGain.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(wetGain);
  dryGain.connect(outputGain);
  wetGain.connect(outputGain);
  
  return {
    type: AET.CHORUS,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, dryGain, wetGain, delay, lfo, lfoGain, feedbackGain, outputGain],
    update: (newEffect: AudioEffect) => {
      const cho = newEffect as ChorusEffect;
      lfo.frequency.value = cho.rate;
      lfoGain.gain.value = (cho.depth / 100) * (cho.delay / 1000);
      delay.delayTime.value = cho.delay / 1000;
      feedbackGain.gain.value = cho.feedback / 100;
      wetGain.gain.value = cho.mix / 100;
    },
    dispose: () => {
      lfo.stop();
      inputGain.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      delay.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      feedbackGain.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Distortion effect nodes
 */
function createDistortion(
  context: BaseAudioContext,
  effect: DistortionEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const waveshaper = context.createWaveShaper();
  const toneFilter = context.createBiquadFilter();
  const outputGain = context.createGain();
  
  // Set distortion curve
  waveshaper.curve = makeDistortionCurve(effect.drive, effect.distortionType);
  waveshaper.oversample = '4x';
  
  // Configure tone filter
  toneFilter.type = 'lowshelf';
  toneFilter.frequency.value = 3000;
  toneFilter.gain.value = effect.tone * 0.12; // -12 to +12 dB
  
  // Set output level
  outputGain.gain.value = Math.pow(10, effect.output / 20);
  
  // Connect
  inputGain.connect(waveshaper);
  waveshaper.connect(toneFilter);
  toneFilter.connect(outputGain);
  
  return {
    type: AET.DISTORTION,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, waveshaper, toneFilter, outputGain],
    update: (newEffect: AudioEffect) => {
      const dist = newEffect as DistortionEffect;
      waveshaper.curve = makeDistortionCurve(dist.drive, dist.distortionType);
      toneFilter.gain.value = dist.tone * 0.12;
      outputGain.gain.value = Math.pow(10, dist.output / 20);
    },
    dispose: () => {
      inputGain.disconnect();
      waveshaper.disconnect();
      toneFilter.disconnect();
      outputGain.disconnect();
    },
  };
}

/**
 * Create Gain effect nodes
 */
function createGainEffect(
  context: BaseAudioContext,
  effect: GainEffect
): AudioEffectNode {
  const gainNode = context.createGain();
  gainNode.gain.value = Math.pow(10, effect.gain / 20);
  
  return {
    type: AET.GAIN,
    inputNode: gainNode,
    outputNode: gainNode,
    nodes: [gainNode],
    update: (newEffect: AudioEffect) => {
      const g = newEffect as GainEffect;
      gainNode.gain.value = Math.pow(10, g.gain / 20);
    },
    dispose: () => {
      gainNode.disconnect();
    },
  };
}

/**
 * Create Stereo Enhancer effect nodes
 * Note: This requires stereo input/output
 */
function createStereoEnhancer(
  context: BaseAudioContext,
  effect: StereoEnhancerEffect
): AudioEffectNode {
  const inputGain = context.createGain();
  const outputGain = context.createGain();
  
  // For a proper stereo enhancer, you'd use a ChannelSplitterNode
  // and ChannelMergerNode with mid/side processing
  // This is a simplified version
  
  inputGain.connect(outputGain);
  
  // Store width parameter for reference
  (outputGain as any)._stereoParams = {
    width: effect.width,
    midLevel: effect.midLevel,
    sideLevel: effect.sideLevel,
  };
  
  return {
    type: AET.STEREO_ENHANCER,
    inputNode: inputGain,
    outputNode: outputGain,
    nodes: [inputGain, outputGain],
    update: (newEffect: AudioEffect) => {
      const se = newEffect as StereoEnhancerEffect;
      (outputGain as any)._stereoParams = {
        width: se.width,
        midLevel: se.midLevel,
        sideLevel: se.sideLevel,
      };
    },
    dispose: () => {
      inputGain.disconnect();
      outputGain.disconnect();
    },
  };
}

// ============================================================
// MAIN PROCESSOR CLASS
// ============================================================

/**
 * Create an effect node based on type
 */
export function createEffectNode(
  context: BaseAudioContext,
  effect: AudioEffect
): AudioEffectNode {
  console.log('[createEffectNode] Creating node for:', effect.type, effect);
  
  switch (effect.type) {
    case AET.PARAMETRIC_EQ:
      console.log('[createEffectNode] EQ bands:', (effect as ParametricEQEffect).bands);
      return createParametricEQ(context, effect as ParametricEQEffect);
    case AET.COMPRESSOR:
      return createCompressor(context, effect as CompressorEffect);
    case AET.NOISE_GATE:
      return createNoiseGate(context, effect as NoiseGateEffect);
    case AET.LIMITER:
      return createLimiter(context, effect as LimiterEffect);
    case AET.REVERB:
      return createReverb(context, effect as ReverbEffect);
    case AET.DELAY:
      return createDelay(context, effect as DelayEffect);
    case AET.CHORUS:
      return createChorus(context, effect as ChorusEffect);
    case AET.DISTORTION:
      return createDistortion(context, effect as DistortionEffect);
    case AET.GAIN:
      return createGainEffect(context, effect as GainEffect);
    case AET.STEREO_ENHANCER:
      return createStereoEnhancer(context, effect as StereoEnhancerEffect);
    default:
      console.warn('[createEffectNode] Unknown type, using passthrough:', effect.type);
      const passthrough = context.createGain();
      return {
        type: effect.type,
        inputNode: passthrough,
        outputNode: passthrough,
        nodes: [passthrough],
        update: () => {},
        dispose: () => passthrough.disconnect(),
      };
  }
}

/**
 * Create a complete audio effect chain
 */
export function createAudioEffectChain(
  context: BaseAudioContext,
  effects: AudioEffect[]
): AudioEffectChain {
  console.log('[AudioEffectProcessor] Creating effect chain with', effects.length, 'total effects');
  
  const inputNode = context.createGain();
  const outputNode = context.createGain();
  const analyzerPre = context.createAnalyser();
  const analyzerPost = context.createAnalyser();
  const effectNodes = new Map<string, AudioEffectNode>();
  
  // Configure analyzers
  analyzerPre.fftSize = 2048;
  analyzerPost.fftSize = 2048;
  
  // Sort effects by order
  const sortedEffects = [...effects]
    .filter(e => e.enabled)
    .sort((a, b) => a.order - b.order);
  
  console.log('[AudioEffectProcessor] Enabled effects after filtering:', sortedEffects.map(e => ({
    type: e.type,
    enabled: e.enabled,
    order: e.order,
  })));
  
  // Create effect nodes
  sortedEffects.forEach(effect => {
    console.log('[AudioEffectProcessor] Creating node for effect:', effect.type, effect);
    const node = createEffectNode(context, effect);
    effectNodes.set(effect.id, node);
  });
  
  console.log('[AudioEffectProcessor] Created', effectNodes.size, 'effect nodes');
  
  // Connect the chain
  inputNode.connect(analyzerPre);
  
  let prevNode: AudioNode = analyzerPre;
  sortedEffects.forEach(effect => {
    const node = effectNodes.get(effect.id);
    if (node) {
      prevNode.connect(node.inputNode);
      prevNode = node.outputNode;
    }
  });
  
  prevNode.connect(analyzerPost);
  analyzerPost.connect(outputNode);
  
  console.log('[AudioEffectProcessor] Effect chain fully connected');
  
  return {
    inputNode,
    outputNode,
    analyzerPre,
    analyzerPost,
    effectNodes,
    dispose: () => {
      effectNodes.forEach(node => node.dispose());
      inputNode.disconnect();
      outputNode.disconnect();
      analyzerPre.disconnect();
      analyzerPost.disconnect();
    },
  };
}

/**
 * Update an effect in an existing chain
 */
export function updateEffectInChain(
  chain: AudioEffectChain,
  effectId: string,
  effect: AudioEffect
): void {
  const node = chain.effectNodes.get(effectId);
  if (node) {
    node.update(effect);
  }
}

/**
 * Get frequency data from analyzer
 */
export function getFrequencyData(analyzer: AnalyserNode): Uint8Array {
  const dataArray = new Uint8Array(analyzer.frequencyBinCount);
  analyzer.getByteFrequencyData(dataArray);
  return dataArray;
}

/**
 * Get time domain data from analyzer
 */
export function getTimeDomainData(analyzer: AnalyserNode): Uint8Array {
  const dataArray = new Uint8Array(analyzer.frequencyBinCount);
  analyzer.getByteTimeDomainData(dataArray);
  return dataArray;
}

/**
 * Calculate RMS level from time domain data
 */
export function calculateRMSLevel(dataArray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const value = (dataArray[i] - 128) / 128;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / dataArray.length);
  // Convert to dB
  return 20 * Math.log10(rms + 0.0001);
}

/**
 * Calculate peak level from time domain data
 */
export function calculatePeakLevel(dataArray: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const value = Math.abs((dataArray[i] - 128) / 128);
    if (value > peak) peak = value;
  }
  // Convert to dB
  return 20 * Math.log10(peak + 0.0001);
}
