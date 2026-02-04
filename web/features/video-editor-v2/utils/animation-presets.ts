/**
 * ============================================================
 * ANIMATION PRESETS
 * ============================================================
 * 
 * Pre-defined animation templates that can be applied to composition layers.
 * Each preset generates keyframes for common animation patterns.
 * 
 * Usage:
 * 1. Select a preset from the library
 * 2. Call applyPresetToLayer() with the layer and preset
 * 3. The preset will generate appropriate keyframes
 */

import type { PropertyKeyframes, Keyframe, KeyframeInterpolation } from '../types/keyframes';
import { generateKeyframeId } from '../types/keyframes';
import { framesToSeconds } from './time-conversion';

// ============================================================
// TYPES
// ============================================================

export type AnimationPresetCategory = 
  | 'entrance'
  | 'exit'
  | 'emphasis'
  | 'motion'
  | 'transform';

export interface AnimationPreset {
  /** Unique preset ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Category for organization */
  category: AnimationPresetCategory;
  /** Duration in frames (default) */
  defaultDuration: number;
  /** Properties this preset animates */
  animatedProperties: string[];
  /** Function to generate keyframes */
  generateKeyframes: (options: PresetOptions) => PropertyKeyframes[];
  /** Preview thumbnail or icon */
  icon?: string;
}

export interface PresetOptions {
  /** Start frame for the animation */
  startFrame: number;
  /** Duration in frames */
  duration: number;
  /** FPS of the composition */
  fps: number;
  /** Whether to reverse the animation (e.g., for exit) */
  reverse?: boolean;
  /** Custom easing */
  easing?: KeyframeInterpolation;
  /** Property-specific overrides */
  propertyOverrides?: Record<string, any>;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Create a keyframe with defaults
 */
function createKeyframe(
  time: number,
  value: number,
  interpolation: KeyframeInterpolation = 'ease-out'
): Keyframe {
  return {
    id: generateKeyframeId(),
    time,
    value,
    interpolation,
  };
}

/**
 * Convert frame to time in seconds
 * Uses centralized utility for consistency
 */
const frameToTime = framesToSeconds;

// ============================================================
// ENTRANCE PRESETS
// ============================================================

const fadeIn: AnimationPreset = {
  id: 'fade-in',
  name: 'Fade In',
  description: 'Smoothly fade in from transparent',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.opacity'],
  icon: '✨',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out' } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    
    return [{
      propertyPath: 'transform.opacity',
      enabled: true,
      keyframes: [
        createKeyframe(startTime, 0, easing),
        createKeyframe(endTime, 1, 'linear'),
      ],
    }];
  },
};

const slideInLeft: AnimationPreset = {
  id: 'slide-in-left',
  name: 'Slide In Left',
  description: 'Slide in from the left side',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.x', 'transform.opacity'],
  icon: '➡️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const offsetX = propertyOverrides?.offsetX ?? -200;
    const targetX = propertyOverrides?.targetX ?? 0;
    
    return [
      {
        propertyPath: 'transform.x',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, offsetX, easing),
          createKeyframe(endTime, targetX, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, easing),
          createKeyframe(endTime, 1, 'linear'),
        ],
      },
    ];
  },
};

const slideInRight: AnimationPreset = {
  id: 'slide-in-right',
  name: 'Slide In Right',
  description: 'Slide in from the right side',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.x', 'transform.opacity'],
  icon: '⬅️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const offsetX = propertyOverrides?.offsetX ?? 200;
    const targetX = propertyOverrides?.targetX ?? 0;
    
    return [
      {
        propertyPath: 'transform.x',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, offsetX, easing),
          createKeyframe(endTime, targetX, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, easing),
          createKeyframe(endTime, 1, 'linear'),
        ],
      },
    ];
  },
};

const slideInUp: AnimationPreset = {
  id: 'slide-in-up',
  name: 'Slide In Up',
  description: 'Slide in from below',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.y', 'transform.opacity'],
  icon: '⬆️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const offsetY = propertyOverrides?.offsetY ?? 100;
    const targetY = propertyOverrides?.targetY ?? 0;
    
    return [
      {
        propertyPath: 'transform.y',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, offsetY, easing),
          createKeyframe(endTime, targetY, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, easing),
          createKeyframe(endTime, 1, 'linear'),
        ],
      },
    ];
  },
};

const slideInDown: AnimationPreset = {
  id: 'slide-in-down',
  name: 'Slide In Down',
  description: 'Slide in from above',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.y', 'transform.opacity'],
  icon: '⬇️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const offsetY = propertyOverrides?.offsetY ?? -100;
    const targetY = propertyOverrides?.targetY ?? 0;
    
    return [
      {
        propertyPath: 'transform.y',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, offsetY, easing),
          createKeyframe(endTime, targetY, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, easing),
          createKeyframe(endTime, 1, 'linear'),
        ],
      },
    ];
  },
};

const scaleIn: AnimationPreset = {
  id: 'scale-in',
  name: 'Scale In',
  description: 'Scale up from small to full size',
  category: 'entrance',
  defaultDuration: 30,
  animatedProperties: ['transform.scaleX', 'transform.scaleY', 'transform.opacity'],
  icon: '📐',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-out', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const startScale = propertyOverrides?.startScale ?? 0.5;
    const endScale = propertyOverrides?.endScale ?? 1;
    
    return [
      {
        propertyPath: 'transform.scaleX',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startScale, easing),
          createKeyframe(endTime, endScale, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.scaleY',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startScale, easing),
          createKeyframe(endTime, endScale, 'linear'),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, easing),
          createKeyframe(endTime, 1, 'linear'),
        ],
      },
    ];
  },
};

const bounceIn: AnimationPreset = {
  id: 'bounce-in',
  name: 'Bounce In',
  description: 'Bounce in with spring effect',
  category: 'entrance',
  defaultDuration: 45,
  animatedProperties: ['transform.scaleX', 'transform.scaleY', 'transform.opacity'],
  icon: '🏀',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps } = options;
    const startTime = frameToTime(startFrame, fps);
    const t1 = frameToTime(startFrame + duration * 0.4, fps);
    const t2 = frameToTime(startFrame + duration * 0.6, fps);
    const t3 = frameToTime(startFrame + duration * 0.8, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    
    const scaleKeyframes: Keyframe[] = [
      createKeyframe(startTime, 0, 'ease-out'),
      createKeyframe(t1, 1.15, 'ease-in-out'),
      createKeyframe(t2, 0.95, 'ease-in-out'),
      createKeyframe(t3, 1.02, 'ease-in-out'),
      createKeyframe(endTime, 1, 'linear'),
    ];
    
    return [
      {
        propertyPath: 'transform.scaleX',
        enabled: true,
        keyframes: scaleKeyframes,
      },
      {
        propertyPath: 'transform.scaleY',
        enabled: true,
        keyframes: scaleKeyframes.map(k => ({ ...k, id: generateKeyframeId() })),
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 0, 'ease-out'),
          createKeyframe(t1, 1, 'linear'),
        ],
      },
    ];
  },
};

// ============================================================
// EXIT PRESETS
// ============================================================

const fadeOut: AnimationPreset = {
  id: 'fade-out',
  name: 'Fade Out',
  description: 'Smoothly fade out to transparent',
  category: 'exit',
  defaultDuration: 30,
  animatedProperties: ['transform.opacity'],
  icon: '💨',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-in' } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    
    return [{
      propertyPath: 'transform.opacity',
      enabled: true,
      keyframes: [
        createKeyframe(startTime, 1, 'linear'),
        createKeyframe(endTime, 0, easing),
      ],
    }];
  },
};

const slideOutLeft: AnimationPreset = {
  id: 'slide-out-left',
  name: 'Slide Out Left',
  description: 'Slide out to the left side',
  category: 'exit',
  defaultDuration: 30,
  animatedProperties: ['transform.x', 'transform.opacity'],
  icon: '⬅️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-in', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const startX = propertyOverrides?.startX ?? 0;
    const offsetX = propertyOverrides?.offsetX ?? -200;
    
    return [
      {
        propertyPath: 'transform.x',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startX, 'linear'),
          createKeyframe(endTime, offsetX, easing),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 1, 'linear'),
          createKeyframe(endTime, 0, easing),
        ],
      },
    ];
  },
};

const slideOutRight: AnimationPreset = {
  id: 'slide-out-right',
  name: 'Slide Out Right',
  description: 'Slide out to the right side',
  category: 'exit',
  defaultDuration: 30,
  animatedProperties: ['transform.x', 'transform.opacity'],
  icon: '➡️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-in', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const startX = propertyOverrides?.startX ?? 0;
    const offsetX = propertyOverrides?.offsetX ?? 200;
    
    return [
      {
        propertyPath: 'transform.x',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startX, 'linear'),
          createKeyframe(endTime, offsetX, easing),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 1, 'linear'),
          createKeyframe(endTime, 0, easing),
        ],
      },
    ];
  },
};

const scaleOut: AnimationPreset = {
  id: 'scale-out',
  name: 'Scale Out',
  description: 'Scale down to small size',
  category: 'exit',
  defaultDuration: 30,
  animatedProperties: ['transform.scaleX', 'transform.scaleY', 'transform.opacity'],
  icon: '📐',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, easing = 'ease-in', propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const startScale = propertyOverrides?.startScale ?? 1;
    const endScale = propertyOverrides?.endScale ?? 0.5;
    
    return [
      {
        propertyPath: 'transform.scaleX',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startScale, 'linear'),
          createKeyframe(endTime, endScale, easing),
        ],
      },
      {
        propertyPath: 'transform.scaleY',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, startScale, 'linear'),
          createKeyframe(endTime, endScale, easing),
        ],
      },
      {
        propertyPath: 'transform.opacity',
        enabled: true,
        keyframes: [
          createKeyframe(startTime, 1, 'linear'),
          createKeyframe(endTime, 0, easing),
        ],
      },
    ];
  },
};

// ============================================================
// EMPHASIS PRESETS
// ============================================================

const pulse: AnimationPreset = {
  id: 'pulse',
  name: 'Pulse',
  description: 'Pulsing scale effect',
  category: 'emphasis',
  defaultDuration: 30,
  animatedProperties: ['transform.scaleX', 'transform.scaleY'],
  icon: '💓',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, propertyOverrides } = options;
    const startTime = frameToTime(startFrame, fps);
    const midTime = frameToTime(startFrame + duration * 0.5, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    const pulseScale = propertyOverrides?.pulseScale ?? 1.1;
    
    const scaleKeyframes: Keyframe[] = [
      createKeyframe(startTime, 1, 'ease-out'),
      createKeyframe(midTime, pulseScale, 'ease-in-out'),
      createKeyframe(endTime, 1, 'ease-in'),
    ];
    
    return [
      {
        propertyPath: 'transform.scaleX',
        enabled: true,
        keyframes: scaleKeyframes,
      },
      {
        propertyPath: 'transform.scaleY',
        enabled: true,
        keyframes: scaleKeyframes.map(k => ({ ...k, id: generateKeyframeId() })),
      },
    ];
  },
};

const shake: AnimationPreset = {
  id: 'shake',
  name: 'Shake',
  description: 'Horizontal shake effect',
  category: 'emphasis',
  defaultDuration: 30,
  animatedProperties: ['transform.x'],
  icon: '📳',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, propertyOverrides } = options;
    const shakeAmount = propertyOverrides?.shakeAmount ?? 10;
    const baseX = propertyOverrides?.baseX ?? 0;
    
    const keyframes: Keyframe[] = [];
    const steps = 8;
    const stepDuration = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      const time = frameToTime(startFrame + stepDuration * i, fps);
      let value = baseX;
      
      if (i > 0 && i < steps) {
        // Alternate left and right, decreasing amplitude
        const direction = i % 2 === 1 ? 1 : -1;
        const decay = 1 - (i / steps);
        value = baseX + direction * shakeAmount * decay;
      }
      
      keyframes.push(createKeyframe(time, value, 'linear'));
    }
    
    return [{
      propertyPath: 'transform.x',
      enabled: true,
      keyframes,
    }];
  },
};

const wiggle: AnimationPreset = {
  id: 'wiggle',
  name: 'Wiggle',
  description: 'Rotation wiggle effect',
  category: 'emphasis',
  defaultDuration: 30,
  animatedProperties: ['transform.rotation'],
  icon: '〰️',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, propertyOverrides } = options;
    const rotationAmount = propertyOverrides?.rotationAmount ?? 5;
    const baseRotation = propertyOverrides?.baseRotation ?? 0;
    
    const keyframes: Keyframe[] = [];
    const steps = 6;
    const stepDuration = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      const time = frameToTime(startFrame + stepDuration * i, fps);
      let value = baseRotation;
      
      if (i > 0 && i < steps) {
        const direction = i % 2 === 1 ? 1 : -1;
        const decay = 1 - (i / steps);
        value = baseRotation + direction * rotationAmount * decay;
      }
      
      keyframes.push(createKeyframe(time, value, 'ease-in-out'));
    }
    
    return [{
      propertyPath: 'transform.rotation',
      enabled: true,
      keyframes,
    }];
  },
};

// ============================================================
// MOTION PRESETS
// ============================================================

const float: AnimationPreset = {
  id: 'float',
  name: 'Float',
  description: 'Gentle floating motion (loop-ready)',
  category: 'motion',
  defaultDuration: 60,
  animatedProperties: ['transform.y'],
  icon: '🎈',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, propertyOverrides } = options;
    const floatAmount = propertyOverrides?.floatAmount ?? 10;
    const baseY = propertyOverrides?.baseY ?? 0;
    
    const startTime = frameToTime(startFrame, fps);
    const midTime = frameToTime(startFrame + duration * 0.5, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    
    return [{
      propertyPath: 'transform.y',
      enabled: true,
      keyframes: [
        createKeyframe(startTime, baseY, 'ease-in-out'),
        createKeyframe(midTime, baseY - floatAmount, 'ease-in-out'),
        createKeyframe(endTime, baseY, 'ease-in-out'),
      ],
    }];
  },
};

const spin: AnimationPreset = {
  id: 'spin',
  name: 'Spin',
  description: 'Full 360 degree rotation',
  category: 'motion',
  defaultDuration: 30,
  animatedProperties: ['transform.rotation'],
  icon: '🔄',
  generateKeyframes: (options) => {
    const { startFrame, duration, fps, propertyOverrides } = options;
    const startRotation = propertyOverrides?.startRotation ?? 0;
    const endRotation = propertyOverrides?.endRotation ?? 360;
    
    const startTime = frameToTime(startFrame, fps);
    const endTime = frameToTime(startFrame + duration, fps);
    
    return [{
      propertyPath: 'transform.rotation',
      enabled: true,
      keyframes: [
        createKeyframe(startTime, startRotation, 'linear'),
        createKeyframe(endTime, endRotation, 'linear'),
      ],
    }];
  },
};

// ============================================================
// PRESET LIBRARY
// ============================================================

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // Entrance
  fadeIn,
  slideInLeft,
  slideInRight,
  slideInUp,
  slideInDown,
  scaleIn,
  bounceIn,
  // Exit
  fadeOut,
  slideOutLeft,
  slideOutRight,
  scaleOut,
  // Emphasis
  pulse,
  shake,
  wiggle,
  // Motion
  float,
  spin,
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: AnimationPresetCategory): AnimationPreset[] {
  return ANIMATION_PRESETS.filter(p => p.category === category);
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): AnimationPreset | undefined {
  return ANIMATION_PRESETS.find(p => p.id === id);
}

/**
 * Get all preset categories with their presets
 */
export function getPresetCategories(): { category: AnimationPresetCategory; label: string; presets: AnimationPreset[] }[] {
  return [
    { category: 'entrance', label: 'Entrance', presets: getPresetsByCategory('entrance') },
    { category: 'exit', label: 'Exit', presets: getPresetsByCategory('exit') },
    { category: 'emphasis', label: 'Emphasis', presets: getPresetsByCategory('emphasis') },
    { category: 'motion', label: 'Motion', presets: getPresetsByCategory('motion') },
  ];
}

// ============================================================
// APPLY PRESET TO LAYER
// ============================================================

import type { CompositionLayer } from '../types/composition';

/**
 * Apply an animation preset to a layer
 * 
 * @param layer - The layer to apply the preset to
 * @param preset - The preset to apply
 * @param options - Options for generating keyframes
 * @param mergeMode - How to handle existing keyframes:
 *   - 'replace': Replace all keyframes for the affected properties
 *   - 'merge': Merge with existing keyframes (existing keyframes take precedence at same time)
 *   - 'append': Add to end of existing keyframes (adjusts timing)
 * @returns Updated layer with new keyframes
 */
export function applyPresetToLayer(
  layer: CompositionLayer,
  preset: AnimationPreset,
  options: PresetOptions,
  mergeMode: 'replace' | 'merge' | 'append' = 'replace'
): CompositionLayer {
  // Generate keyframes from the preset
  const newKeyframes = preset.generateKeyframes(options);
  
  // Get existing keyframes
  const existingKeyframes = layer.keyframes || [];
  
  let updatedKeyframes: PropertyKeyframes[];
  
  switch (mergeMode) {
    case 'replace':
      // Remove existing keyframes for the affected properties, add new ones
      const affectedPaths = new Set(newKeyframes.map(pk => pk.propertyPath));
      updatedKeyframes = [
        ...existingKeyframes.filter(pk => !affectedPaths.has(pk.propertyPath)),
        ...newKeyframes,
      ];
      break;
      
    case 'merge':
      // Merge: keep existing keyframes at same time, add new ones where no conflict
      updatedKeyframes = [...existingKeyframes];
      for (const newPk of newKeyframes) {
        const existingPk = updatedKeyframes.find(pk => pk.propertyPath === newPk.propertyPath);
        if (existingPk) {
          // Merge keyframes (existing take precedence at same time)
          const existingTimes = new Set(existingPk.keyframes.map(k => k.time));
          const mergedKeyframes = [
            ...existingPk.keyframes,
            ...newPk.keyframes.filter(k => !existingTimes.has(k.time)),
          ].sort((a, b) => a.time - b.time);
          existingPk.keyframes = mergedKeyframes;
        } else {
          updatedKeyframes.push(newPk);
        }
      }
      break;
      
    case 'append':
      // Append: add after existing keyframes (adjust timing)
      updatedKeyframes = [...existingKeyframes];
      for (const newPk of newKeyframes) {
        const existingPk = updatedKeyframes.find(pk => pk.propertyPath === newPk.propertyPath);
        if (existingPk && existingPk.keyframes.length > 0) {
          // Find the last keyframe time
          const lastTime = Math.max(...existingPk.keyframes.map(k => k.time));
          // Offset new keyframes
          const offsetKeyframes = newPk.keyframes.map(k => ({
            ...k,
            id: generateKeyframeId(),
            time: k.time + lastTime,
          }));
          existingPk.keyframes = [
            ...existingPk.keyframes,
            ...offsetKeyframes,
          ].sort((a, b) => a.time - b.time);
        } else {
          updatedKeyframes.push(newPk);
        }
      }
      break;
  }
  
  return {
    ...layer,
    keyframes: updatedKeyframes,
  };
}

/**
 * Create entrance and exit animations for a layer
 */
export function applyEntranceAndExit(
  layer: CompositionLayer,
  entrancePreset: AnimationPreset,
  exitPreset: AnimationPreset,
  fps: number,
  entranceDuration?: number,
  exitDuration?: number
): CompositionLayer {
  const entDuration = entranceDuration ?? entrancePreset.defaultDuration;
  const extDuration = exitDuration ?? exitPreset.defaultDuration;
  
  // Apply entrance at layer start
  let updatedLayer = applyPresetToLayer(layer, entrancePreset, {
    startFrame: layer.startTime,
    duration: entDuration,
    fps,
  }, 'replace');
  
  // Apply exit at layer end
  const exitStartFrame = layer.startTime + layer.duration - extDuration;
  updatedLayer = applyPresetToLayer(updatedLayer, exitPreset, {
    startFrame: exitStartFrame,
    duration: extDuration,
    fps,
  }, 'merge');
  
  return updatedLayer;
}
