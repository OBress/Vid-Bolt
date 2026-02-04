import { interpolate } from "remotion";
import { VideoTransitionType, AudioTransitionType } from "../types";

/**
 * Video and Audio Transition Templates
 * 
 * Provides functions to calculate styles for video transitions and
 * volume levels for audio transitions during the transition period.
 */

export interface VideoTransitionStyles {
  opacity?: number;
  transform?: string;
  filter?: string;
  clipPath?: string;
  zIndex?: number;
}

export interface VideoTransitionTemplate {
  name: string;
  description: string;
  category: "fade" | "wipe" | "slide" | "zoom" | "blur" | "iris" | "3d" | "stylized";
  exit: (progress: number, fps: number) => VideoTransitionStyles;
  enter: (progress: number, fps: number) => VideoTransitionStyles;
}

export interface AudioTransitionTemplate {
  name: string;
  description: string;
  category: "crossfade" | "fadeIn" | "fadeOut";
  exit: (progress: number, baseVolume: number) => number;
  enter: (progress: number, baseVolume: number) => number;
}

// ==========================================
// VIDEO TRANSITIONS
// ==========================================

const fadeTransition: VideoTransitionTemplate = {
  name: "Fade",
  description: "Simple opacity fade between clips",
  category: "fade",
  exit: (progress) => ({
    opacity: interpolate(progress, [0, 1], [1, 0], { extrapolateRight: "clamp" }),
    zIndex: 1,
  }),
  enter: (progress) => ({
    opacity: interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" }),
    zIndex: 2,
  }),
};

const crossfadeTransition: VideoTransitionTemplate = {
  name: "Crossfade",
  description: "Smooth cross-dissolve between clips",
  category: "fade",
  exit: (progress) => ({
    opacity: interpolate(progress, [0, 0.5, 1], [1, 0.5, 0], { extrapolateRight: "clamp" }),
    zIndex: 1,
  }),
  enter: (progress) => ({
    opacity: interpolate(progress, [0, 0.5, 1], [0, 0.5, 1], { extrapolateRight: "clamp" }),
    zIndex: 2,
  }),
};

const fadeToBlackTransition: VideoTransitionTemplate = {
  name: "Fade to Black",
  description: "Fade out to black, then fade in from black",
  category: "fade",
  exit: (progress) => ({
    opacity: interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" }),
    zIndex: 1,
  }),
  enter: (progress) => ({
    opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }),
    zIndex: 2,
  }),
};

const fadeToWhiteTransition: VideoTransitionTemplate = {
  name: "Fade to White",
  description: "Fade out to white, then fade in from white",
  category: "fade",
  exit: (progress) => ({
    opacity: interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" }),
    filter: `brightness(${interpolate(progress, [0, 0.5], [1, 3], { extrapolateRight: "clamp" })})`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }),
    filter: `brightness(${interpolate(progress, [0.5, 1], [3, 1], { extrapolateLeft: "clamp" })})`,
    zIndex: 2,
  }),
};

const wipeLeftTransition: VideoTransitionTemplate = {
  name: "Wipe Left",
  description: "Wipe from right to left",
  category: "wipe",
  exit: (progress) => ({
    clipPath: `inset(0 ${interpolate(progress, [0, 1], [0, 100])}% 0 0)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `inset(0 0 0 ${interpolate(progress, [0, 1], [100, 0])}%)`,
    zIndex: 2,
  }),
};

const wipeRightTransition: VideoTransitionTemplate = {
  name: "Wipe Right",
  description: "Wipe from left to right",
  category: "wipe",
  exit: (progress) => ({
    clipPath: `inset(0 0 0 ${interpolate(progress, [0, 1], [0, 100])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `inset(0 ${interpolate(progress, [0, 1], [100, 0])}% 0 0)`,
    zIndex: 2,
  }),
};

const wipeUpTransition: VideoTransitionTemplate = {
  name: "Wipe Up",
  description: "Wipe from bottom to top",
  category: "wipe",
  exit: (progress) => ({
    clipPath: `inset(0 0 ${interpolate(progress, [0, 1], [0, 100])}% 0)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `inset(${interpolate(progress, [0, 1], [100, 0])}% 0 0 0)`,
    zIndex: 2,
  }),
};

const wipeDownTransition: VideoTransitionTemplate = {
  name: "Wipe Down",
  description: "Wipe from top to bottom",
  category: "wipe",
  exit: (progress) => ({
    clipPath: `inset(${interpolate(progress, [0, 1], [0, 100])}% 0 0 0)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `inset(0 0 ${interpolate(progress, [0, 1], [100, 0])}% 0)`,
    zIndex: 2,
  }),
};

const slideLeftTransition: VideoTransitionTemplate = {
  name: "Slide Left",
  description: "Slide in from the right",
  category: "slide",
  exit: (progress) => ({
    transform: `translateX(${interpolate(progress, [0, 1], [0, -100])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `translateX(${interpolate(progress, [0, 1], [100, 0])}%)`,
    zIndex: 2,
  }),
};

const slideRightTransition: VideoTransitionTemplate = {
  name: "Slide Right",
  description: "Slide in from the left",
  category: "slide",
  exit: (progress) => ({
    transform: `translateX(${interpolate(progress, [0, 1], [0, 100])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `translateX(${interpolate(progress, [0, 1], [-100, 0])}%)`,
    zIndex: 2,
  }),
};

const slideUpTransition: VideoTransitionTemplate = {
  name: "Slide Up",
  description: "Slide in from the bottom",
  category: "slide",
  exit: (progress) => ({
    transform: `translateY(${interpolate(progress, [0, 1], [0, -100])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `translateY(${interpolate(progress, [0, 1], [100, 0])}%)`,
    zIndex: 2,
  }),
};

const slideDownTransition: VideoTransitionTemplate = {
  name: "Slide Down",
  description: "Slide in from the top",
  category: "slide",
  exit: (progress) => ({
    transform: `translateY(${interpolate(progress, [0, 1], [0, 100])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `translateY(${interpolate(progress, [0, 1], [-100, 0])}%)`,
    zIndex: 2,
  }),
};

const zoomInTransition: VideoTransitionTemplate = {
  name: "Zoom In",
  description: "Zoom in with fade",
  category: "zoom",
  exit: (progress) => ({
    transform: `scale(${interpolate(progress, [0, 1], [1, 0.8])})`,
    opacity: interpolate(progress, [0, 1], [1, 0]),
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `scale(${interpolate(progress, [0, 1], [1.2, 1])})`,
    opacity: interpolate(progress, [0, 1], [0, 1]),
    zIndex: 2,
  }),
};

const zoomOutTransition: VideoTransitionTemplate = {
  name: "Zoom Out",
  description: "Zoom out with fade",
  category: "zoom",
  exit: (progress) => ({
    transform: `scale(${interpolate(progress, [0, 1], [1, 1.2])})`,
    opacity: interpolate(progress, [0, 1], [1, 0]),
    zIndex: 1,
  }),
  enter: (progress) => ({
    transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
    opacity: interpolate(progress, [0, 1], [0, 1]),
    zIndex: 2,
  }),
};

const crossBlurTransition: VideoTransitionTemplate = {
  name: "Cross Blur",
  description: "Blur out and blur in",
  category: "blur",
  exit: (progress) => ({
    filter: `blur(${interpolate(progress, [0, 0.5], [0, 30], { extrapolateRight: "clamp" })}px)`,
    opacity: interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" }),
    zIndex: 1,
  }),
  enter: (progress) => ({
    filter: `blur(${interpolate(progress, [0.5, 1], [30, 0], { extrapolateLeft: "clamp" })}px)`,
    opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }),
    zIndex: 2,
  }),
};

const irisCircleTransition: VideoTransitionTemplate = {
  name: "Iris Circle",
  description: "Circular iris reveal",
  category: "iris",
  exit: (progress) => ({
    clipPath: `circle(${interpolate(progress, [0, 1], [100, 0])}% at center)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `circle(${interpolate(progress, [0, 1], [0, 100])}% at center)`,
    zIndex: 2,
  }),
};

const irisRectangleTransition: VideoTransitionTemplate = {
  name: "Iris Rectangle",
  description: "Rectangular iris reveal",
  category: "iris",
  exit: (progress) => ({
    clipPath: `inset(${interpolate(progress, [0, 1], [0, 50])}%)`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    clipPath: `inset(${interpolate(progress, [0, 1], [50, 0])}%)`,
    zIndex: 2,
  }),
};

const flipHorizontalTransition: VideoTransitionTemplate = {
  name: "Flip Horizontal",
  description: "3D horizontal flip",
  category: "3d",
  exit: (progress) => ({
    transform: `perspective(1000px) rotateY(${interpolate(progress, [0, 0.5], [0, 90], { extrapolateRight: "clamp" })}deg)`,
    opacity: interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" }),
    zIndex: progress < 0.5 ? 2 : 1,
  }),
  enter: (progress) => ({
    transform: `perspective(1000px) rotateY(${interpolate(progress, [0.5, 1], [-90, 0], { extrapolateLeft: "clamp" })}deg)`,
    opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }),
    zIndex: progress >= 0.5 ? 2 : 1,
  }),
};

const flipVerticalTransition: VideoTransitionTemplate = {
  name: "Flip Vertical",
  description: "3D vertical flip",
  category: "3d",
  exit: (progress) => ({
    transform: `perspective(1000px) rotateX(${interpolate(progress, [0, 0.5], [0, 90], { extrapolateRight: "clamp" })}deg)`,
    opacity: interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" }),
    zIndex: progress < 0.5 ? 2 : 1,
  }),
  enter: (progress) => ({
    transform: `perspective(1000px) rotateX(${interpolate(progress, [0.5, 1], [-90, 0], { extrapolateLeft: "clamp" })}deg)`,
    opacity: interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }),
    zIndex: progress >= 0.5 ? 2 : 1,
  }),
};

const dissolveTransition: VideoTransitionTemplate = {
  name: "Dissolve",
  description: "Gradual dissolve effect",
  category: "stylized",
  exit: (progress) => ({
    opacity: interpolate(progress, [0, 1], [1, 0]),
    filter: `grayscale(${interpolate(progress, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" })}) contrast(${interpolate(progress, [0, 1], [1, 1.5])})`,
    zIndex: 1,
  }),
  enter: (progress) => ({
    opacity: interpolate(progress, [0, 1], [0, 1]),
    filter: `grayscale(${interpolate(progress, [0, 0.5], [1, 0], { extrapolateRight: "clamp" })}) contrast(${interpolate(progress, [0, 1], [1.5, 1])})`,
    zIndex: 2,
  }),
};

// ==========================================
// AUDIO TRANSITIONS
// ==========================================

const crossfadeLinearAudioTransition: AudioTransitionTemplate = {
  name: "Linear Crossfade",
  description: "Simple linear crossfade between audio clips",
  category: "crossfade",
  exit: (progress, baseVolume) => {
    return interpolate(progress, [0, 1], [baseVolume, 0], { extrapolateRight: "clamp" });
  },
  enter: (progress, baseVolume) => {
    return interpolate(progress, [0, 1], [0, baseVolume], { extrapolateRight: "clamp" });
  },
};

const crossfadeConstantPowerAudioTransition: AudioTransitionTemplate = {
  name: "Constant Power",
  description: "Maintains perceived loudness during crossfade (recommended)",
  category: "crossfade",
  exit: (progress, baseVolume) => {
    return baseVolume * Math.cos(progress * Math.PI / 2);
  },
  enter: (progress, baseVolume) => {
    return baseVolume * Math.sin(progress * Math.PI / 2);
  },
};

const crossfadeExponentialAudioTransition: AudioTransitionTemplate = {
  name: "Exponential Crossfade",
  description: "Exponential curves for dramatic crossfade effect",
  category: "crossfade",
  exit: (progress, baseVolume) => {
    return baseVolume * Math.pow(1 - progress, 2);
  },
  enter: (progress, baseVolume) => {
    return baseVolume * Math.pow(progress, 2);
  },
};

const fadeInLinearAudioTransition: AudioTransitionTemplate = {
  name: "Linear Fade In",
  description: "Linear volume increase",
  category: "fadeIn",
  exit: (progress, baseVolume) => baseVolume,
  enter: (progress, baseVolume) => {
    return interpolate(progress, [0, 1], [0, baseVolume], { extrapolateRight: "clamp" });
  },
};

const fadeOutLinearAudioTransition: AudioTransitionTemplate = {
  name: "Linear Fade Out",
  description: "Linear volume decrease",
  category: "fadeOut",
  exit: (progress, baseVolume) => {
    return interpolate(progress, [0, 1], [baseVolume, 0], { extrapolateRight: "clamp" });
  },
  enter: () => 0,
};

// ==========================================
// EXPORTS
// ==========================================

export const videoTransitionTemplates: Record<VideoTransitionType, VideoTransitionTemplate> = {
  [VideoTransitionType.FADE]: fadeTransition,
  [VideoTransitionType.CROSSFADE]: crossfadeTransition,
  [VideoTransitionType.FADE_TO_BLACK]: fadeToBlackTransition,
  [VideoTransitionType.FADE_TO_WHITE]: fadeToWhiteTransition,
  [VideoTransitionType.WIPE_LEFT]: wipeLeftTransition,
  [VideoTransitionType.WIPE_RIGHT]: wipeRightTransition,
  [VideoTransitionType.WIPE_UP]: wipeUpTransition,
  [VideoTransitionType.WIPE_DOWN]: wipeDownTransition,
  [VideoTransitionType.SLIDE_LEFT]: slideLeftTransition,
  [VideoTransitionType.SLIDE_RIGHT]: slideRightTransition,
  [VideoTransitionType.SLIDE_UP]: slideUpTransition,
  [VideoTransitionType.SLIDE_DOWN]: slideDownTransition,
  [VideoTransitionType.ZOOM_IN]: zoomInTransition,
  [VideoTransitionType.ZOOM_OUT]: zoomOutTransition,
  [VideoTransitionType.CROSS_BLUR]: crossBlurTransition,
  [VideoTransitionType.IRIS_CIRCLE]: irisCircleTransition,
  [VideoTransitionType.IRIS_RECTANGLE]: irisRectangleTransition,
  [VideoTransitionType.FLIP_HORIZONTAL]: flipHorizontalTransition,
  [VideoTransitionType.FLIP_VERTICAL]: flipVerticalTransition,
  [VideoTransitionType.DISSOLVE]: dissolveTransition,
};

export const audioTransitionTemplates: Record<AudioTransitionType, AudioTransitionTemplate> = {
  [AudioTransitionType.CROSSFADE_LINEAR]: crossfadeLinearAudioTransition,
  [AudioTransitionType.CROSSFADE_CONSTANT_POWER]: crossfadeConstantPowerAudioTransition,
  [AudioTransitionType.CROSSFADE_EXPONENTIAL]: crossfadeExponentialAudioTransition,
  [AudioTransitionType.FADE_IN_LINEAR]: fadeInLinearAudioTransition,
  [AudioTransitionType.FADE_OUT_LINEAR]: fadeOutLinearAudioTransition,
};

export const transitionCategoryNames: Record<string, string> = {
  fade: "Fade",
  wipe: "Wipe",
  slide: "Slide",
  zoom: "Zoom",
  blur: "Blur",
  iris: "Iris",
  "3d": "3D",
  stylized: "Stylized",
};

export const audioTransitionCategoryNames: Record<string, string> = {
  crossfade: "Crossfade",
  fadeIn: "Fade In",
  fadeOut: "Fade Out",
};

export const getVideoTransitionsByCategory = () => {
  const categories: Record<string, Array<{ type: VideoTransitionType; template: VideoTransitionTemplate }>> = {};
  
  Object.entries(videoTransitionTemplates).forEach(([type, template]) => {
    const category = template.category;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({
      type: type as VideoTransitionType,
      template,
    });
  });
  
  return categories;
};

export const getAudioTransitionsByCategory = () => {
  const categories: Record<string, Array<{ type: AudioTransitionType; template: AudioTransitionTemplate }>> = {};
  
  Object.entries(audioTransitionTemplates).forEach(([type, template]) => {
    const category = template.category;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({
      type: type as AudioTransitionType,
      template,
    });
  });
  
  return categories;
};
