/**
 * EffectsTab - Premiere Pro-style Effects Panel
 * 
 * Clean, visual UX with:
 * - Category tabs for major effect types
 * - Card-based grid layout for effects
 * - Search with filter chips
 * - Drag-to-apply functionality
 */

import React, { useState, useMemo } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Input } from "../../ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { VideoTransitionType, AudioTransitionType } from "../../../types";
import { EffectType, EFFECT_METADATA, getAddableEffectTypes } from "../../../types/effects";
import { ShapeMaskType } from "../../../types/masks";
import { 
  AudioEffectType, 
  AUDIO_EFFECT_METADATA, 
  getAudioEffectsByCategory,
  AUDIO_EFFECT_CATEGORY_NAMES,
} from "../../../types/audio-effects";
import {
  AUDIO_EFFECT_PRESETS,
  getPresetsByCategory,
  PRESET_CATEGORY_NAMES,
} from "../../../data/audio-effect-presets";
import {
  startEffectDrag,
  startVideoTransitionDrag,
  startAudioTransitionDrag,
  startMaskDrag,
  endDrag,
} from "../../../stores/video-editor-store";
import {
  Search,
  Film,
  Music2,
  Wand2,
  Layers,
  Circle,
  Square,
  Pentagon,
  ZoomIn,
  ZoomOut,
  Volume2,
  SunMedium,
  Contrast,
  Droplets,
  CircleDot,
  ImageOff,
  RefreshCw,
  Aperture,
  Triangle,
  Sun,
  Palette,
  Sparkles,
  X,
  Move,
  Eye,
  Headphones,
  Activity,
  Gauge,
  VolumeX,
  BarChart3,
  Waves,
  Timer,
  Users,
  Zap,
  PanelLeftClose,
  Mic,
  Radio,
  Music,
  Phone,
  Building,
  Repeat,
  Disc,
  Flame,
  MessageSquare,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

type EffectCategory = 'transitions' | 'effects' | 'masks' | 'audio';

interface EffectItem {
  id: string;
  name: string;
  description?: string;
  icon: React.ElementType;
  type: 'videoTransition' | 'audioTransition' | 'videoEffect' | 'audioEffect' | 'mask';
  value: string;
  subcategory?: string;
}

// ==========================================
// ANIMATED TRANSITION PREVIEW
// ==========================================

type TransitionAnimationType = 
  | 'crossfade' | 'fade-black' | 'fade-white' | 'dissolve'
  | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down'
  | 'zoom-in' | 'zoom-out'
  | 'iris-circle' | 'iris-rect'
  | 'flip-h';

interface TransitionPreviewProps {
  animation: TransitionAnimationType;
  isPlaying?: boolean;
}

const TransitionPreview: React.FC<TransitionPreviewProps> = ({ animation, isPlaying = true }) => {
  // CSS keyframes are defined inline for each animation type
  // Longer duration with pauses: 0-25% show A, 25-35% transition, 35-60% show B, 60-70% transition back, 70-100% pause
  const getAnimationStyles = (): { slideA: React.CSSProperties; slideB: React.CSSProperties; overlay?: React.CSSProperties } => {
    const duration = '3.5s';
    const baseA: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '10px',
      fontWeight: 600,
    };
    const baseB: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '10px',
      fontWeight: 600,
    };

    switch (animation) {
      case 'crossfade':
        return {
          slideA: { ...baseA },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `crossfade ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
          },
        };
      case 'fade-black':
        return {
          slideA: { ...baseA },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `crossfade ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
          },
          overlay: {
            position: 'absolute',
            inset: 0,
            background: 'black',
            animation: isPlaying ? `fadeBlack ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
            pointerEvents: 'none',
          },
        };
      case 'fade-white':
        return {
          slideA: { ...baseA },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `crossfade ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
          },
          overlay: {
            position: 'absolute',
            inset: 0,
            background: 'white',
            animation: isPlaying ? `fadeBlack ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
            pointerEvents: 'none',
          },
        };
      case 'dissolve':
        return {
          slideA: { 
            ...baseA, 
            animation: isPlaying ? `filmDissolveOut ${duration} ease-in-out infinite` : 'none',
          },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `filmDissolveIn ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
            transform: 'scale(1.05)',
          },
          overlay: {
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, rgba(255,200,150,0.3) 0%, transparent 70%)',
            animation: isPlaying ? `filmGlow ${duration} ease-in-out infinite` : 'none',
            opacity: 0,
            pointerEvents: 'none',
          },
        };
      // PUSH/SLIDE: Both clips move together - A exits, B enters from opposite side
      case 'slide-left':
        return {
          slideA: { ...baseA, animation: isPlaying ? `pushOutLeft ${duration} ease-in-out infinite` : 'none' },
          slideB: { ...baseB, animation: isPlaying ? `pushInLeft ${duration} ease-in-out infinite` : 'none', transform: 'translateX(100%)' },
        };
      case 'slide-right':
        return {
          slideA: { ...baseA, animation: isPlaying ? `pushOutRight ${duration} ease-in-out infinite` : 'none' },
          slideB: { ...baseB, animation: isPlaying ? `pushInRight ${duration} ease-in-out infinite` : 'none', transform: 'translateX(-100%)' },
        };
      case 'slide-up':
        return {
          slideA: { ...baseA, animation: isPlaying ? `pushOutUp ${duration} ease-in-out infinite` : 'none' },
          slideB: { ...baseB, animation: isPlaying ? `pushInUp ${duration} ease-in-out infinite` : 'none', transform: 'translateY(100%)' },
        };
      case 'slide-down':
        return {
          slideA: { ...baseA, animation: isPlaying ? `pushOutDown ${duration} ease-in-out infinite` : 'none' },
          slideB: { ...baseB, animation: isPlaying ? `pushInDown ${duration} ease-in-out infinite` : 'none', transform: 'translateY(-100%)' },
        };
      // WIPE: A stays completely still, B reveals over A with a moving edge
      case 'wipe-left':
        return {
          slideA: { ...baseA }, // A stays still!
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `wipeFromRight ${duration} ease-in-out infinite` : 'none',
            clipPath: 'inset(0 100% 0 0)',
          },
        };
      case 'wipe-right':
        return {
          slideA: { ...baseA }, // A stays still!
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `wipeFromLeft ${duration} ease-in-out infinite` : 'none',
            clipPath: 'inset(0 0 0 100%)',
          },
        };
      case 'wipe-up':
        return {
          slideA: { ...baseA }, // A stays still!
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `wipeFromBottom ${duration} ease-in-out infinite` : 'none',
            clipPath: 'inset(100% 0 0 0)',
          },
        };
      case 'wipe-down':
        return {
          slideA: { ...baseA }, // A stays still!
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `wipeFromTop ${duration} ease-in-out infinite` : 'none',
            clipPath: 'inset(0 0 100% 0)',
          },
        };
      case 'zoom-in':
        return {
          slideA: { ...baseA, animation: isPlaying ? `zoomOut ${duration} ease-in-out infinite` : 'none' },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `zoomIn ${duration} ease-in-out infinite` : 'none',
            transform: 'scale(0)',
            opacity: 0,
          },
        };
      case 'zoom-out':
        return {
          slideA: { ...baseA, animation: isPlaying ? `zoomIn2 ${duration} ease-in-out infinite` : 'none' },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `zoomOut2 ${duration} ease-in-out infinite` : 'none',
            transform: 'scale(2)',
            opacity: 0,
          },
        };
      case 'iris-circle':
        return {
          slideA: { ...baseA },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `irisCircle ${duration} ease-in-out infinite` : 'none',
            clipPath: 'circle(0% at 50% 50%)',
          },
        };
      case 'iris-rect':
        return {
          slideA: { ...baseA },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `irisRect ${duration} ease-in-out infinite` : 'none',
            clipPath: 'inset(50% 50% 50% 50%)',
          },
        };
      case 'flip-h':
        return {
          slideA: { 
            ...baseA, 
            animation: isPlaying ? `flipOutH ${duration} ease-in-out infinite` : 'none',
            backfaceVisibility: 'hidden',
          },
          slideB: { 
            ...baseB, 
            animation: isPlaying ? `flipInH ${duration} ease-in-out infinite` : 'none',
            transform: 'rotateY(-180deg)',
            backfaceVisibility: 'hidden',
          },
        };
      default:
        return { slideA: baseA, slideB: baseB };
    }
  };

  const styles = getAnimationStyles();

  return (
    <div 
      className="relative w-14 h-10 rounded-md overflow-hidden shrink-0 border border-border/50"
      style={{ perspective: '200px' }}
    >
      {/* CSS Keyframes - timing: 0-20% A, 20-30% transition, 30-50% B, 50-60% transition back, 60-100% pause */}
      <style>{`
        @keyframes crossfade {
          0%, 20% { opacity: 0; }
          30%, 50% { opacity: 1; }
          60%, 100% { opacity: 0; }
        }
        @keyframes fadeBlack {
          0%, 15% { opacity: 0; }
          25%, 35% { opacity: 1; }
          45%, 100% { opacity: 0; }
        }
        @keyframes filmDissolveOut {
          0%, 20% { opacity: 1; transform: scale(1); filter: saturate(1); }
          25% { filter: saturate(1.2) sepia(0.1); }
          30%, 50% { opacity: 0; transform: scale(0.98); filter: saturate(1); }
          60%, 100% { opacity: 1; transform: scale(1); filter: saturate(1); }
        }
        @keyframes filmDissolveIn {
          0%, 20% { opacity: 0; transform: scale(1.05); filter: saturate(1); }
          25% { filter: saturate(1.2) sepia(0.1); }
          30%, 50% { opacity: 1; transform: scale(1); filter: saturate(1); }
          60%, 100% { opacity: 0; transform: scale(1.05); filter: saturate(1); }
        }
        @keyframes filmGlow {
          0%, 18% { opacity: 0; }
          25%, 35% { opacity: 1; }
          42%, 100% { opacity: 0; }
        }
        /* PUSH animations - both clips move together */
        @keyframes pushOutLeft {
          0%, 20% { transform: translateX(0); }
          30%, 50% { transform: translateX(-100%); }
          60%, 100% { transform: translateX(0); }
        }
        @keyframes pushInLeft {
          0%, 20% { transform: translateX(100%); }
          30%, 50% { transform: translateX(0); }
          60%, 100% { transform: translateX(100%); }
        }
        @keyframes pushOutRight {
          0%, 20% { transform: translateX(0); }
          30%, 50% { transform: translateX(100%); }
          60%, 100% { transform: translateX(0); }
        }
        @keyframes pushInRight {
          0%, 20% { transform: translateX(-100%); }
          30%, 50% { transform: translateX(0); }
          60%, 100% { transform: translateX(-100%); }
        }
        @keyframes pushOutUp {
          0%, 20% { transform: translateY(0); }
          30%, 50% { transform: translateY(-100%); }
          60%, 100% { transform: translateY(0); }
        }
        @keyframes pushInUp {
          0%, 20% { transform: translateY(100%); }
          30%, 50% { transform: translateY(0); }
          60%, 100% { transform: translateY(100%); }
        }
        @keyframes pushOutDown {
          0%, 20% { transform: translateY(0); }
          30%, 50% { transform: translateY(100%); }
          60%, 100% { transform: translateY(0); }
        }
        @keyframes pushInDown {
          0%, 20% { transform: translateY(-100%); }
          30%, 50% { transform: translateY(0); }
          60%, 100% { transform: translateY(-100%); }
        }
        /* WIPE animations - A stays still, B reveals over it via clip-path */
        @keyframes wipeFromRight {
          0%, 20% { clip-path: inset(0 100% 0 0); }
          30%, 50% { clip-path: inset(0 0 0 0); }
          60%, 100% { clip-path: inset(0 100% 0 0); }
        }
        @keyframes wipeFromLeft {
          0%, 20% { clip-path: inset(0 0 0 100%); }
          30%, 50% { clip-path: inset(0 0 0 0); }
          60%, 100% { clip-path: inset(0 0 0 100%); }
        }
        @keyframes wipeFromBottom {
          0%, 20% { clip-path: inset(100% 0 0 0); }
          30%, 50% { clip-path: inset(0 0 0 0); }
          60%, 100% { clip-path: inset(100% 0 0 0); }
        }
        @keyframes wipeFromTop {
          0%, 20% { clip-path: inset(0 0 100% 0); }
          30%, 50% { clip-path: inset(0 0 0 0); }
          60%, 100% { clip-path: inset(0 0 100% 0); }
        }
        @keyframes zoomOut {
          0%, 20% { transform: scale(1); opacity: 1; }
          30%, 50% { transform: scale(1.5); opacity: 0; }
          60%, 100% { transform: scale(1); opacity: 1; }
        }
        @keyframes zoomIn {
          0%, 20% { transform: scale(0); opacity: 0; }
          30%, 50% { transform: scale(1); opacity: 1; }
          60%, 100% { transform: scale(0); opacity: 0; }
        }
        @keyframes zoomIn2 {
          0%, 20% { transform: scale(1); opacity: 1; }
          30%, 50% { transform: scale(0.5); opacity: 0; }
          60%, 100% { transform: scale(1); opacity: 1; }
        }
        @keyframes zoomOut2 {
          0%, 20% { transform: scale(2); opacity: 0; }
          30%, 50% { transform: scale(1); opacity: 1; }
          60%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes irisCircle {
          0%, 20% { clip-path: circle(0% at 50% 50%); }
          30%, 50% { clip-path: circle(75% at 50% 50%); }
          60%, 100% { clip-path: circle(0% at 50% 50%); }
        }
        @keyframes irisRect {
          0%, 20% { clip-path: inset(50% 50% 50% 50%); }
          30%, 50% { clip-path: inset(0% 0% 0% 0%); }
          60%, 100% { clip-path: inset(50% 50% 50% 50%); }
        }
        @keyframes flipOutH {
          0%, 20% { transform: rotateY(0deg); }
          30%, 50% { transform: rotateY(180deg); }
          60%, 100% { transform: rotateY(0deg); }
        }
        @keyframes flipInH {
          0%, 20% { transform: rotateY(-180deg); }
          30%, 50% { transform: rotateY(0deg); }
          60%, 100% { transform: rotateY(-180deg); }
        }
      `}</style>
      
      {/* Slide A (background) */}
      <div style={styles.slideA}>A</div>
      
      {/* Slide B (foreground) */}
      <div style={styles.slideB}>B</div>
      
      {/* Optional overlay for fade effects */}
      {styles.overlay && <div style={styles.overlay} />}
    </div>
  );
};

// ==========================================
// EFFECT DEFINITIONS
// ==========================================

interface VideoTransitionItem extends EffectItem {
  animation: TransitionAnimationType;
}

const VIDEO_TRANSITIONS: VideoTransitionItem[] = [
  // Dissolve
  { id: 'crossfade', name: 'Cross Dissolve', description: 'Smooth blend', icon: Layers, type: 'videoTransition', value: VideoTransitionType.CROSSFADE, subcategory: 'Dissolve', animation: 'crossfade' },
  { id: 'fade', name: 'Dip to Black', description: 'Through black', icon: Square, type: 'videoTransition', value: VideoTransitionType.FADE_TO_BLACK, subcategory: 'Dissolve', animation: 'fade-black' },
  { id: 'fade-white', name: 'Dip to White', description: 'Through white', icon: Circle, type: 'videoTransition', value: VideoTransitionType.FADE_TO_WHITE, subcategory: 'Dissolve', animation: 'fade-white' },
  { id: 'dissolve', name: 'Film Dissolve', description: 'Classic dissolve', icon: Sparkles, type: 'videoTransition', value: VideoTransitionType.DISSOLVE, subcategory: 'Dissolve', animation: 'dissolve' },
  // Slide/Push
  { id: 'slide-left', name: 'Push Left', icon: Layers, type: 'videoTransition', value: VideoTransitionType.SLIDE_LEFT, subcategory: 'Slide', animation: 'slide-left' },
  { id: 'slide-right', name: 'Push Right', icon: Layers, type: 'videoTransition', value: VideoTransitionType.SLIDE_RIGHT, subcategory: 'Slide', animation: 'slide-right' },
  { id: 'slide-up', name: 'Push Up', icon: Layers, type: 'videoTransition', value: VideoTransitionType.SLIDE_UP, subcategory: 'Slide', animation: 'slide-up' },
  { id: 'slide-down', name: 'Push Down', icon: Layers, type: 'videoTransition', value: VideoTransitionType.SLIDE_DOWN, subcategory: 'Slide', animation: 'slide-down' },
  // Wipe
  { id: 'wipe-left', name: 'Wipe Left', icon: Layers, type: 'videoTransition', value: VideoTransitionType.WIPE_LEFT, subcategory: 'Wipe', animation: 'wipe-left' },
  { id: 'wipe-right', name: 'Wipe Right', icon: Layers, type: 'videoTransition', value: VideoTransitionType.WIPE_RIGHT, subcategory: 'Wipe', animation: 'wipe-right' },
  { id: 'wipe-up', name: 'Wipe Up', icon: Layers, type: 'videoTransition', value: VideoTransitionType.WIPE_UP, subcategory: 'Wipe', animation: 'wipe-up' },
  { id: 'wipe-down', name: 'Wipe Down', icon: Layers, type: 'videoTransition', value: VideoTransitionType.WIPE_DOWN, subcategory: 'Wipe', animation: 'wipe-down' },
  // Zoom
  { id: 'zoom-in', name: 'Zoom In', icon: ZoomIn, type: 'videoTransition', value: VideoTransitionType.ZOOM_IN, subcategory: 'Zoom', animation: 'zoom-in' },
  { id: 'zoom-out', name: 'Zoom Out', icon: ZoomOut, type: 'videoTransition', value: VideoTransitionType.ZOOM_OUT, subcategory: 'Zoom', animation: 'zoom-out' },
  // Iris
  { id: 'iris-circle', name: 'Iris Round', icon: Circle, type: 'videoTransition', value: VideoTransitionType.IRIS_CIRCLE, subcategory: 'Iris', animation: 'iris-circle' },
  { id: 'iris-rect', name: 'Iris Box', icon: Square, type: 'videoTransition', value: VideoTransitionType.IRIS_RECTANGLE, subcategory: 'Iris', animation: 'iris-rect' },
  // 3D
  { id: 'flip-h', name: 'Flip Over', description: '3D flip', icon: Layers, type: 'videoTransition', value: VideoTransitionType.FLIP_HORIZONTAL, subcategory: '3D Motion', animation: 'flip-h' },
];

const AUDIO_TRANSITIONS: EffectItem[] = [
  { id: 'audio-crossfade', name: 'Crossfade', description: 'Linear blend', icon: Volume2, type: 'audioTransition', value: AudioTransitionType.CROSSFADE_LINEAR },
  { id: 'audio-constant', name: 'Constant Power', description: 'Smooth audio', icon: Volume2, type: 'audioTransition', value: AudioTransitionType.CROSSFADE_CONSTANT_POWER },
  { id: 'audio-exp', name: 'Exponential', description: 'Natural fade', icon: Volume2, type: 'audioTransition', value: AudioTransitionType.CROSSFADE_EXPONENTIAL },
];

// Map effect types to icons
const EFFECT_ICONS: Record<EffectType, React.ElementType> = {
  [EffectType.MOTION]: Move,
  [EffectType.OPACITY]: Eye,
  [EffectType.BLUR]: Circle,
  [EffectType.DROP_SHADOW]: Square,
  [EffectType.GLOW]: Sun,
  [EffectType.COLOR_CORRECTION]: Palette,
  [EffectType.VIGNETTE]: Aperture,
  [EffectType.SHARPEN]: Triangle,
  [EffectType.NOISE]: Sparkles,
  [EffectType.BRIGHTNESS]: SunMedium,
  [EffectType.CONTRAST]: Contrast,
  [EffectType.SATURATION]: Droplets,
  [EffectType.HUE]: CircleDot,
  [EffectType.GRAYSCALE]: ImageOff,
  [EffectType.SEPIA]: Aperture,
  [EffectType.INVERT]: RefreshCw,
};

// Effect subcategories
const EFFECT_SUBCATEGORIES: Record<EffectType, string> = {
  [EffectType.MOTION]: 'Transform',
  [EffectType.OPACITY]: 'Transform',
  [EffectType.BLUR]: 'Blur & Sharpen',
  [EffectType.SHARPEN]: 'Blur & Sharpen',
  [EffectType.DROP_SHADOW]: 'Stylize',
  [EffectType.GLOW]: 'Stylize',
  [EffectType.VIGNETTE]: 'Stylize',
  [EffectType.NOISE]: 'Stylize',
  [EffectType.COLOR_CORRECTION]: 'Color',
  [EffectType.BRIGHTNESS]: 'Color',
  [EffectType.CONTRAST]: 'Color',
  [EffectType.SATURATION]: 'Color',
  [EffectType.HUE]: 'Color',
  [EffectType.GRAYSCALE]: 'Color',
  [EffectType.SEPIA]: 'Color',
  [EffectType.INVERT]: 'Color',
};

const VIDEO_EFFECTS: EffectItem[] = getAddableEffectTypes().map(type => ({
  id: `effect-${type}`,
  name: EFFECT_METADATA[type].name,
  description: EFFECT_METADATA[type].description,
  icon: EFFECT_ICONS[type] || Wand2,
  type: 'videoEffect' as const,
  value: type,
  subcategory: EFFECT_SUBCATEGORIES[type] || 'Other',
}));

const MASK_PRESETS: EffectItem[] = [
  { id: 'mask-ellipse', name: 'Ellipse', description: 'Circular mask', icon: Circle, type: 'mask', value: ShapeMaskType.ELLIPSE },
  { id: 'mask-rect', name: 'Rectangle', description: 'Box mask', icon: Square, type: 'mask', value: ShapeMaskType.RECTANGLE },
  { id: 'mask-polygon', name: 'Free Draw', description: 'Custom shape', icon: Pentagon, type: 'mask', value: ShapeMaskType.POLYGON },
];

// Audio Effect Icons Map
const AUDIO_EFFECT_ICONS: Record<AudioEffectType, React.ElementType> = {
  [AudioEffectType.PARAMETRIC_EQ]: Activity,
  [AudioEffectType.COMPRESSOR]: Gauge,
  [AudioEffectType.NOISE_GATE]: VolumeX,
  [AudioEffectType.LIMITER]: BarChart3,
  [AudioEffectType.REVERB]: Waves,
  [AudioEffectType.DELAY]: Timer,
  [AudioEffectType.CHORUS]: Users,
  [AudioEffectType.DISTORTION]: Zap,
  [AudioEffectType.GAIN]: Volume2,
  [AudioEffectType.STEREO_ENHANCER]: PanelLeftClose,
};

// Preset Icon Map
const PRESET_ICONS: Record<string, React.ElementType> = {
  'voice-clarity': Mic,
  'voice-warmth': Flame,
  'de-esser': MessageSquare,
  'podcast-voice': Radio,
  'interview': Users,
  'music-master': Music,
  'lofi': Disc,
  'telephone': Phone,
  'concert-hall': Building,
  'echo': Repeat,
  'underwater': Waves,
  'noise-reduction': VolumeX,
  'loudness-normalization': Activity,
  'volume-boost': Volume2,
};

// Create audio effect items from types
const getAudioEffectItems = (): EffectItem[] => {
  const effectsByCategory = getAudioEffectsByCategory();
  const items: EffectItem[] = [];
  
  Object.entries(effectsByCategory).forEach(([category, types]) => {
    types.forEach(type => {
      const metadata = AUDIO_EFFECT_METADATA[type];
      items.push({
        id: `audio-effect-${type}`,
        name: metadata.name,
        description: metadata.description,
        icon: AUDIO_EFFECT_ICONS[type] || Volume2,
        type: 'audioEffect',
        value: type,
        subcategory: AUDIO_EFFECT_CATEGORY_NAMES[category] || category,
      });
    });
  });
  
  return items;
};

const AUDIO_EFFECTS = getAudioEffectItems();

// ==========================================
// EFFECT CARD COMPONENT
// ==========================================

interface EffectCardProps {
  item: EffectItem;
  onSelect: () => void;
  compact?: boolean;
}

const EffectCard: React.FC<EffectCardProps> = ({ item, onSelect, compact = false }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        let dragId: string;
        
        if (item.type === 'audioTransition') {
          dragId = (startAudioTransitionDrag as any)(item.value as AudioTransitionType, 1);
        } else if (item.type === 'videoEffect') {
          dragId = (startEffectDrag as any)(item.value as EffectType, item.name);
        } else if (item.type === 'mask') {
          dragId = (startMaskDrag as any)(item.value as ShapeMaskType, item.name);
        } else {
          dragId = (startEffectDrag as any)(item.value as EffectType, item.name);
        }
        
        e.dataTransfer.setData('text/x-video-effect', dragId);
        e.dataTransfer.setData('text/plain', dragId);
        e.dataTransfer.effectAllowed = 'copy';
        
        if (e.dataTransfer.setDragImage && e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          e.dataTransfer.setDragImage(e.currentTarget, rect.width / 2, rect.height / 2);
        }
      }}
      onDragEnd={() => {
        // Clean up drag state
        endDrag();
      }}
      className={cn(
        "group relative flex items-center gap-2 p-2 rounded-lg",
        "bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border",
        "transition-all cursor-grab active:cursor-grabbing",
        "text-left w-full",
        compact ? "py-1.5" : "py-2"
      )}
      title={item.description}
    >
      <div className={cn(
        "flex items-center justify-center rounded-md bg-muted/50 group-hover:bg-primary/10",
        "transition-colors shrink-0",
        compact ? "w-7 h-7" : "w-8 h-8"
      )}>
        {React.createElement(Icon, { className: cn(
          "text-muted-foreground group-hover:text-primary transition-colors",
          compact ? "h-3.5 w-3.5" : "h-4 w-4"
        ) })}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-medium truncate",
          compact ? "text-xs" : "text-sm"
        )}>
          {item.name}
        </p>
        {!compact && item.description && (
          <p className="text-[10px] text-muted-foreground truncate">
            {item.description}
          </p>
        )}
      </div>
    </button>
  );
};

// ==========================================
// VIDEO TRANSITION CARD (with animated preview)
// ==========================================

interface VideoTransitionCardProps {
  item: VideoTransitionItem;
  onSelect: () => void;
}

const VideoTransitionCard: React.FC<VideoTransitionCardProps> = ({ item, onSelect }) => {
  return (
    <button
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        const dragId = startVideoTransitionDrag(item.value as VideoTransitionType, 1);
        e.dataTransfer.setData('text/plain', dragId);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDragEnd={() => {
        endDrag();
      }}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 p-2 rounded-lg",
        "bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border",
        "transition-all cursor-grab active:cursor-grabbing",
        "text-center w-full"
      )}
      title={item.description}
    >
      {/* Animated Preview - always playing */}
      <TransitionPreview animation={item.animation} isPlaying={true} />
      
      {/* Text */}
      <p className="text-[11px] font-medium truncate w-full leading-tight">{item.name}</p>
    </button>
  );
};

// ==========================================
// CATEGORY SECTION COMPONENT
// ==========================================

interface CategorySectionProps {
  title: string;
  items: EffectItem[];
  onSelectEffect: (item: EffectItem) => void;
  compact?: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({ 
  title, 
  items, 
  onSelectEffect,
  compact = false 
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
        {title}
      </h4>
      <div className={cn(
        "grid gap-1.5",
        compact ? "grid-cols-1" : "grid-cols-2"
      )}>
        {items.map(item => (
          <EffectCard
            key={item.id}
            item={item}
            onSelect={() => onSelectEffect(item)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
};

// ==========================================
// TRANSITIONS CONTENT
// ==========================================

type TransitionSubTab = 'video' | 'audio';

interface TransitionsContentProps {
  searchQuery: string;
  onSelectEffect: (item: EffectItem) => void;
}

const TransitionsContent: React.FC<TransitionsContentProps> = ({ searchQuery, onSelectEffect }) => {
  const [activeSubTab, setActiveSubTab] = useState<TransitionSubTab>('video');

  const filteredVideo = useMemo(() => {
    if (!searchQuery) return VIDEO_TRANSITIONS;
    const query = searchQuery.toLowerCase();
    return VIDEO_TRANSITIONS.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.subcategory?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const filteredAudio = useMemo(() => {
    if (!searchQuery) return AUDIO_TRANSITIONS;
    const query = searchQuery.toLowerCase();
    return AUDIO_TRANSITIONS.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group video transitions by subcategory
  const groupedVideo = useMemo(() => {
    const groups: Record<string, VideoTransitionItem[]> = {};
    filteredVideo.forEach(item => {
      const cat = item.subcategory || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredVideo]);

  return (
    <div className="space-y-3">
      {/* Sub-tab Toggle */}
      <div className="flex gap-1 p-0.5 bg-muted/40 rounded-md">
        <button
          onClick={() => setActiveSubTab('video')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors",
            activeSubTab === 'video' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Film className="h-3 w-3" />
          Video
          <span className="text-[10px] text-muted-foreground">({filteredVideo.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('audio')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors",
            activeSubTab === 'audio' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Music2 className="h-3 w-3" />
          Audio
          <span className="text-[10px] text-muted-foreground">({filteredAudio.length})</span>
        </button>
      </div>

      {/* Video Transitions with Animated Previews */}
      {activeSubTab === 'video' && (
        <div className="space-y-4">
          {Object.entries(groupedVideo).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {category}
              </h4>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(item => (
                  <VideoTransitionCard
                    key={item.id}
                    item={item}
                    onSelect={() => onSelectEffect(item)}
                  />
                ))}
              </div>
            </div>
          ))}
          {filteredVideo.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No video transitions found</p>
          )}
        </div>
      )}

      {/* Audio Transitions */}
      {activeSubTab === 'audio' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-1.5">
            {filteredAudio.map(item => (
              <EffectCard
                key={item.id}
                item={item}
                onSelect={() => onSelectEffect(item)}
              />
            ))}
          </div>
          {filteredAudio.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No audio transitions found</p>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// EFFECTS CONTENT
// ==========================================

interface EffectsContentProps {
  searchQuery: string;
  onSelectEffect: (item: EffectItem) => void;
}

const EffectsContent: React.FC<EffectsContentProps> = ({ searchQuery, onSelectEffect }) => {
  const filteredEffects = useMemo(() => {
    if (!searchQuery) return VIDEO_EFFECTS;
    const query = searchQuery.toLowerCase();
    return VIDEO_EFFECTS.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.subcategory?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group by subcategory
  const grouped = useMemo(() => {
    const groups: Record<string, EffectItem[]> = {};
    filteredEffects.forEach(item => {
      const cat = item.subcategory || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredEffects]);

  // Define order
  const categoryOrder = ['Color', 'Blur & Sharpen', 'Stylize'];

  return (
    <div className="space-y-4">
      {categoryOrder.map(category => {
        const items = grouped[category];
        if (!items || items.length === 0) return null;
        return (
          <CategorySection
            key={category}
            title={category}
            items={items}
            onSelectEffect={onSelectEffect}
          />
        );
      })}
      {filteredEffects.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No effects found</p>
      )}
    </div>
  );
};

// ==========================================
// MASKS CONTENT
// ==========================================

interface MasksContentProps {
  searchQuery: string;
  onSelectEffect: (item: EffectItem) => void;
}

const MasksContent: React.FC<MasksContentProps> = ({ searchQuery, onSelectEffect }) => {
  const filtered = useMemo(() => {
    if (!searchQuery) return MASK_PRESETS;
    const query = searchQuery.toLowerCase();
    return MASK_PRESETS.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground px-1">
        Drag a mask shape onto a clip to constrain its visible area.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {filtered.map(item => (
          <EffectCard
            key={item.id}
            item={item}
            onSelect={() => onSelectEffect(item)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No masks found</p>
      )}
    </div>
  );
};

// ==========================================
// AUDIO EFFECTS CONTENT
// ==========================================

type AudioSubTab = 'effects' | 'presets';

interface AudioEffectsContentProps {
  searchQuery: string;
  onSelectEffect: (item: EffectItem) => void;
}

const AudioEffectsContent: React.FC<AudioEffectsContentProps> = ({ searchQuery, onSelectEffect }) => {
  const [activeSubTab, setActiveSubTab] = useState<AudioSubTab>('effects');

  // Filter effects
  const filteredEffects = useMemo(() => {
    if (!searchQuery) return AUDIO_EFFECTS;
    const query = searchQuery.toLowerCase();
    return AUDIO_EFFECTS.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.subcategory?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Filter presets
  const filteredPresets = useMemo(() => {
    if (!searchQuery) return AUDIO_EFFECT_PRESETS;
    const query = searchQuery.toLowerCase();
    return AUDIO_EFFECT_PRESETS.filter(preset => 
      preset.name.toLowerCase().includes(query) ||
      preset.description?.toLowerCase().includes(query) ||
      preset.category?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group effects by subcategory
  const groupedEffects = useMemo(() => {
    const groups: Record<string, EffectItem[]> = {};
    filteredEffects.forEach(item => {
      const cat = item.subcategory || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredEffects]);

  // Group presets by category
  const groupedPresets = useMemo(() => {
    const groups: Record<string, typeof AUDIO_EFFECT_PRESETS> = {};
    filteredPresets.forEach(preset => {
      const cat = PRESET_CATEGORY_NAMES[preset.category] || preset.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(preset);
    });
    return groups;
  }, [filteredPresets]);

  return (
    <div className="space-y-3">
      {/* Sub-tab Toggle */}
      <div className="flex gap-1 p-0.5 bg-muted/40 rounded-md">
        <button
          onClick={() => setActiveSubTab('effects')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors",
            activeSubTab === 'effects' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Headphones className="h-3 w-3" />
          Effects
          <span className="text-[10px] text-muted-foreground">({filteredEffects.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('presets')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors",
            activeSubTab === 'presets' 
              ? "bg-background text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="h-3 w-3" />
          Presets
          <span className="text-[10px] text-muted-foreground">({filteredPresets.length})</span>
        </button>
      </div>

      {/* Audio Effects */}
      {activeSubTab === 'effects' && (
        <div className="space-y-4">
          {Object.entries(groupedEffects).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {category}
              </h4>
              <div className="grid grid-cols-1 gap-1.5">
                {items.map(item => (
                  <EffectCard
                    key={item.id}
                    item={item}
                    onSelect={() => onSelectEffect(item)}
                  />
                ))}
              </div>
            </div>
          ))}
          {filteredEffects.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No audio effects found</p>
          )}
        </div>
      )}

      {/* Presets */}
      {activeSubTab === 'presets' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground px-1">
            Pre-configured effect chains for common use cases.
          </p>
          {Object.entries(groupedPresets).map(([category, presets]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {category}
              </h4>
              <div className="grid grid-cols-1 gap-1.5">
                {presets.map(preset => {
                  const Icon = PRESET_ICONS[preset.id] || Headphones;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        // Presets are handled differently - they add multiple effects
                        onSelectEffect({
                          id: `preset-${preset.id}`,
                          name: preset.name,
                          description: preset.description,
                          icon: Icon,
                          type: 'audioEffect',
                          value: `preset:${preset.id}`,
                          subcategory: category,
                        });
                      }}
                      className={cn(
                        "group relative flex items-center gap-2 p-2 rounded-lg",
                        "bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border",
                        "transition-all cursor-pointer",
                        "text-left w-full"
                      )}
                      title={preset.description}
                    >
                      <div className={cn(
                        "flex items-center justify-center rounded-md bg-primary/10",
                        "transition-colors shrink-0 w-8 h-8"
                      )}>
                        {React.createElement(Icon, { className: "h-4 w-4 text-primary" })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {preset.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {preset.effects.length} effect{preset.effects.length !== 1 ? 's' : ''} • {preset.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredPresets.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No presets found</p>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// EFFECTS TAB COMPONENT
// ==========================================

export const EffectsTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<EffectCategory>('transitions');

  const handleSelectEffect = (_item: EffectItem) => {
    // TODO: Apply effect to selected clip or show preview
  };

  const handleClearSearch = () => setSearchQuery('');

  return (
    <div className="relative h-full overflow-hidden flex flex-col" style={{ height: '100%' }}>
      {/* Search Bar */}
      <div className="shrink-0 p-2 border-b border-border bg-background">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search effects..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs 
        value={activeCategory} 
        onValueChange={(v) => setActiveCategory(v as EffectCategory)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="shrink-0 w-full h-9 bg-muted/30 p-0.5 rounded-none border-b border-border">
          <TabsTrigger
            value="transitions"
            className="flex-1 h-full text-xs px-1.5 rounded-sm gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Film className="h-3 w-3" />
            Trans.
          </TabsTrigger>
          <TabsTrigger
            value="effects"
            className="flex-1 h-full text-xs px-1.5 rounded-sm gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Wand2 className="h-3 w-3" />
            Video
          </TabsTrigger>
          <TabsTrigger
            value="audio"
            className="flex-1 h-full text-xs px-1.5 rounded-sm gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Headphones className="h-3 w-3" />
            Audio
          </TabsTrigger>
          <TabsTrigger
            value="masks"
            className="flex-1 h-full text-xs px-1.5 rounded-sm gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Layers className="h-3 w-3" />
            Masks
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="transitions" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full sidepanel-scrollbar">
              <div className="p-3">
                <TransitionsContent 
                  searchQuery={searchQuery} 
                  onSelectEffect={handleSelectEffect}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="effects" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full sidepanel-scrollbar">
              <div className="p-3">
                <EffectsContent 
                  searchQuery={searchQuery}
                  onSelectEffect={handleSelectEffect}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="audio" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full sidepanel-scrollbar">
              <div className="p-3">
                <AudioEffectsContent 
                  searchQuery={searchQuery}
                  onSelectEffect={handleSelectEffect}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="masks" className="h-full m-0 p-0 data-[state=inactive]:hidden">
            <ScrollArea className="h-full sidepanel-scrollbar">
              <div className="p-3">
                <MasksContent 
                  searchQuery={searchQuery}
                  onSelectEffect={handleSelectEffect}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer Hint */}
      <div className="shrink-0 px-3 py-2 border-t border-border bg-muted/10">
        <p className="text-[10px] text-muted-foreground text-center">
          Drag onto clips or select a clip first
        </p>
      </div>
    </div>
  );
};

export default EffectsTab;
