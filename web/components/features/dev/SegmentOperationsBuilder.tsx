"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Film,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

export interface AnimationConfig {
  mode?: string;
  start?: Record<string, number | number[]>;
  end?: Record<string, number | number[]>;
  easing?: string;
  delay?: number;
  duration?: number;
  cycles?: number;
  direction?: string;
  stagger_delay?: number;
}

export interface SegOp {
  id: string;
  type: string;
  animation?: AnimationConfig;
  [key: string]: unknown;
}

interface AnimationFieldDefinition {
  key: string;
  label: string;
  kind?: "scalar" | "pair";
  min: number;
  max: number;
  step: number;
  axes?: [string, string];
  description?: string;
  getValue: (op: SegOp) => number | number[];
  getSuggestedStart?: (op: SegOp) => number | number[];
  getSuggestedEnd?: (op: SegOp) => number | number[];
}

// All available operation types organized by category
export const SEGMENT_OPERATION_CATEGORIES = [
  {
    label: "Selection",
    ops: [
      { type: "select", label: "Select Region", desc: "Switch target region (optional: per-object index)" },
    ],
  },
  {
    label: "Blur / Privacy",
    ops: [
      { type: "blur", label: "Gaussian Blur", desc: "Blur strength 1-100" },
      { type: "pixelate", label: "Pixelate", desc: "Mosaic block size 5-50px" },
      { type: "redact", label: "Redact", desc: "Solid color fill" },
    ],
  },
  {
    label: "Color & Appearance",
    ops: [
      { type: "color_overlay", label: "Color Overlay", desc: "Semi-transparent fill" },
      { type: "color_grade", label: "Color Grade", desc: "Brightness/contrast/saturation" },
      { type: "opacity", label: "Opacity", desc: "Adjust transparency" },
      { type: "replace_color", label: "Replace Color", desc: "Hue shift + saturation" },
    ],
  },
  {
    label: "Compositing",
    ops: [
      { type: "remove_background", label: "Remove Background", desc: "Transparent BG (RGBA)" },
      { type: "replace_background", label: "Replace Background", desc: "Color or image" },
      { type: "greenscreen", label: "Green Screen", desc: "Green BG for compositing" },
    ],
  },
  {
    label: "Drawing & Annotation",
    ops: [
      { type: "outline", label: "Outline", desc: "Draw smooth contour lines" },
      { type: "bounding_box", label: "Bounding Box", desc: "Draw bounding boxes" },
    ],
  },
  {
    label: "Creative Effects",
    ops: [
      { type: "spotlight", label: "Spotlight", desc: "Darken everything except objects" },
      { type: "bokeh", label: "Bokeh", desc: "Depth-of-field background blur" },
      { type: "glow", label: "Glow", desc: "Bloom around edges" },
      { type: "shadow", label: "Shadow", desc: "Drop shadow on objects" },
      { type: "vignette", label: "Vignette", desc: "Focused vignette" },
    ],
  },
  {
    label: "Filters",
    ops: [
      { type: "grayscale", label: "Grayscale", desc: "Convert to B&W" },
      { type: "invert", label: "Invert", desc: "Invert colors" },
      { type: "sharpen", label: "Sharpen", desc: "Enhance edges" },
      { type: "sepia", label: "Sepia", desc: "Warm vintage tone" },
      { type: "posterize", label: "Posterize", desc: "Reduce color levels" },
      { type: "edge_detect", label: "Edge Detect", desc: "Line art blend" },
      { type: "emboss", label: "Emboss", desc: "3D relief effect" },
      { type: "noise", label: "Noise", desc: "Add grain/noise" },
      { type: "sketch", label: "Sketch", desc: "Pencil drawing effect" },
    ],
  },
  {
    label: "Artistic",
    ops: [
      { type: "duotone", label: "Duotone", desc: "Two-color palette" },
      { type: "halftone", label: "Halftone", desc: "Newspaper dot pattern" },
      { type: "glitch", label: "Glitch", desc: "RGB shift + scanlines" },
    ],
  },
  {
    label: "Distortion",
    ops: [
      { type: "motion_blur", label: "Motion Blur", desc: "Directional blur" },
      { type: "glass", label: "Glass", desc: "Frosted glass distortion" },
    ],
  },
  {
    label: "Mask Processing",
    ops: [
      { type: "feather", label: "Feather", desc: "Soften mask edges" },
    ],
  },
  {
    label: "Camera (Animation)",
    ops: [
      { type: "zoom", label: "Zoom", desc: "Ken Burns zoom" },
      { type: "pan", label: "Pan", desc: "Smooth camera pan" },
    ],
  },
];

const getNumberProp = (op: SegOp, key: string, fallback: number) =>
  typeof op[key] === "number" ? (op[key] as number) : fallback;

const getPairProp = (op: SegOp, key: string, fallback: [number, number]) => {
  const value = op[key];
  if (Array.isArray(value) && value.length >= 2) {
    return [
      typeof value[0] === "number" ? value[0] : fallback[0],
      typeof value[1] === "number" ? value[1] : fallback[1],
    ];
  }
  return fallback;
};

const ANIMATION_FIELD_DEFINITIONS: Record<string, AnimationFieldDefinition[]> = {
  blur: [
    {
      key: "strength",
      label: "Blur Strength",
      min: 0,
      max: 100,
      step: 1,
      description: "Fade background blur in or out.",
      getValue: (op) => getNumberProp(op, "strength", 25),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 25),
    },
  ],
  pixelate: [
    {
      key: "block_size",
      label: "Block Size",
      min: 0,
      max: 50,
      step: 1,
      description: "Grow or reduce mosaic block size over time.",
      getValue: (op) => getNumberProp(op, "block_size", 15),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "block_size", 15),
    },
  ],
  color_grade: [
    {
      key: "brightness",
      label: "Brightness",
      min: -100,
      max: 100,
      step: 1,
      description: "Animate brightness changes.",
      getValue: (op) => getNumberProp(op, "brightness", 0),
    },
    {
      key: "contrast",
      label: "Contrast",
      min: -100,
      max: 100,
      step: 1,
      description: "Animate contrast changes.",
      getValue: (op) => getNumberProp(op, "contrast", 0),
    },
    {
      key: "saturation",
      label: "Saturation",
      min: -100,
      max: 100,
      step: 1,
      description: "Animate saturation from muted to vivid.",
      getValue: (op) => getNumberProp(op, "saturation", 0),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "saturation", 0),
    },
  ],
  opacity: [
    {
      key: "value",
      label: "Opacity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Fade selections in or out.",
      getValue: (op) => getNumberProp(op, "value", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "value", 1),
    },
  ],
  replace_color: [
    {
      key: "hue_shift",
      label: "Hue Shift",
      min: -180,
      max: 180,
      step: 1,
      description: "Shift hue gradually across the clip.",
      getValue: (op) => getNumberProp(op, "hue_shift", 0),
    },
    {
      key: "saturation_scale",
      label: "Saturation Scale",
      min: 0,
      max: 3,
      step: 0.1,
      description: "Boost or mute recolored saturation.",
      getValue: (op) => getNumberProp(op, "saturation_scale", 1),
      getSuggestedStart: () => 1,
      getSuggestedEnd: (op) => getNumberProp(op, "saturation_scale", 1),
    },
  ],
  outline: [
    {
      key: "progress",
      label: "Draw Progress",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Trace contour lines progressively from 0 to 1.",
      getValue: (op) => getNumberProp(op, "progress", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "progress", 1),
    },
    {
      key: "thickness",
      label: "Thickness",
      min: 0,
      max: 20,
      step: 1,
      description: "Grow or shrink outline thickness.",
      getValue: (op) => getNumberProp(op, "thickness", 3),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "thickness", 3),
    },
  ],
  bounding_box: [
    {
      key: "thickness",
      label: "Thickness",
      min: 0,
      max: 20,
      step: 1,
      description: "Animate box line thickness.",
      getValue: (op) => getNumberProp(op, "thickness", 2),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "thickness", 2),
    },
  ],
  spotlight: [
    {
      key: "darkness",
      label: "Darkness",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Dim the surroundings over time.",
      getValue: (op) => getNumberProp(op, "darkness", 0.7),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "darkness", 0.7),
    },
  ],
  bokeh: [
    {
      key: "strength",
      label: "Bokeh Strength",
      min: 0,
      max: 50,
      step: 1,
      description: "Increase or reduce background bokeh blur.",
      getValue: (op) => getNumberProp(op, "strength", 15),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 15),
    },
  ],
  glow: [
    {
      key: "radius",
      label: "Glow Radius",
      min: 0,
      max: 50,
      step: 1,
      description: "Expand or contract glow radius.",
      getValue: (op) => getNumberProp(op, "radius", 15),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "radius", 15),
    },
    {
      key: "intensity",
      label: "Glow Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Pulse or fade glow intensity.",
      getValue: (op) => getNumberProp(op, "intensity", 0.5),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 0.5),
    },
  ],
  shadow: [
    {
      key: "offset",
      label: "Shadow Offset",
      kind: "pair",
      min: -500,
      max: 500,
      step: 1,
      axes: ["X", "Y"],
      description: "Move the drop shadow across the frame.",
      getValue: (op) => getPairProp(op, "offset", [5, 5]),
      getSuggestedStart: () => [0, 0],
      getSuggestedEnd: (op) => getPairProp(op, "offset", [5, 5]),
    },
    {
      key: "blur",
      label: "Shadow Blur",
      min: 0,
      max: 30,
      step: 1,
      description: "Soften the shadow as it appears.",
      getValue: (op) => getNumberProp(op, "blur", 10),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "blur", 10),
    },
  ],
  vignette: [
    {
      key: "strength",
      label: "Vignette Strength",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Darken edges progressively.",
      getValue: (op) => getNumberProp(op, "strength", 0.5),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 0.5),
    },
  ],
  grayscale: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Blend from full color to grayscale.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  invert: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Pulse or fade inverted colors.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  sharpen: [
    {
      key: "strength",
      label: "Strength",
      min: 0,
      max: 10,
      step: 0.1,
      description: "Increase edge sharpening over time.",
      getValue: (op) => getNumberProp(op, "strength", 2),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 2),
    },
  ],
  sepia: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Warm footage into a vintage look.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  posterize: [
    {
      key: "levels",
      label: "Levels",
      min: 2,
      max: 32,
      step: 1,
      description: "Reduce color detail over time.",
      getValue: (op) => getNumberProp(op, "levels", 4),
      getSuggestedStart: () => 32,
      getSuggestedEnd: (op) => getNumberProp(op, "levels", 4),
    },
  ],
  edge_detect: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Fade line-art edges in or out.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  emboss: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Fade the emboss relief effect in.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  noise: [
    {
      key: "amount",
      label: "Amount",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Add or remove grain progressively.",
      getValue: (op) => getNumberProp(op, "amount", 0.3),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "amount", 0.3),
    },
  ],
  sketch: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Morph from photo to sketch.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
    {
      key: "detail",
      label: "Detail",
      min: 1,
      max: 10,
      step: 1,
      description: "Animate sketch detail level.",
      getValue: (op) => getNumberProp(op, "detail", 5),
    },
  ],
  duotone: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Blend toward the duotone palette.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  halftone: [
    {
      key: "dot_size",
      label: "Dot Size",
      min: 0,
      max: 30,
      step: 1,
      description: "Animate coarse dots into a finer halftone pattern.",
      getValue: (op) => getNumberProp(op, "dot_size", 6),
      getSuggestedStart: () => 30,
      getSuggestedEnd: (op) => getNumberProp(op, "dot_size", 6),
    },
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Blend halftone in or out.",
      getValue: (op) => getNumberProp(op, "intensity", 1),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 1),
    },
  ],
  glitch: [
    {
      key: "intensity",
      label: "Intensity",
      min: 0,
      max: 1,
      step: 0.01,
      description: "Pulse or loop the glitch effect.",
      getValue: (op) => getNumberProp(op, "intensity", 0.5),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "intensity", 0.5),
    },
    {
      key: "rgb_shift",
      label: "RGB Shift",
      min: 0,
      max: 30,
      step: 1,
      description: "Increase channel separation over time.",
      getValue: (op) => getNumberProp(op, "rgb_shift", 10),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "rgb_shift", 10),
    },
  ],
  motion_blur: [
    {
      key: "angle",
      label: "Angle",
      min: 0,
      max: 360,
      step: 1,
      description: "Rotate blur direction during playback.",
      getValue: (op) => getNumberProp(op, "angle", 0),
    },
    {
      key: "strength",
      label: "Strength",
      min: 0,
      max: 50,
      step: 1,
      description: "Fade motion blur in or out.",
      getValue: (op) => getNumberProp(op, "strength", 15),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 15),
    },
  ],
  glass: [
    {
      key: "strength",
      label: "Strength",
      min: 0,
      max: 30,
      step: 1,
      description: "Fade in the frosted distortion.",
      getValue: (op) => getNumberProp(op, "strength", 8),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "strength", 8),
    },
    {
      key: "scale",
      label: "Scale",
      min: 0,
      max: 20,
      step: 1,
      description: "Adjust the glass pattern scale over time.",
      getValue: (op) => getNumberProp(op, "scale", 4),
    },
  ],
  feather: [
    {
      key: "radius",
      label: "Radius",
      min: 0,
      max: 50,
      step: 1,
      description: "Soften mask edges progressively.",
      getValue: (op) => getNumberProp(op, "radius", 10),
      getSuggestedStart: () => 0,
      getSuggestedEnd: (op) => getNumberProp(op, "radius", 10),
    },
  ],
  zoom: [
    {
      key: "scale",
      label: "Scale",
      min: 1,
      max: 4,
      step: 0.1,
      description: "Create a Ken Burns zoom from the base frame.",
      getValue: (op) => getNumberProp(op, "scale", 1.5),
      getSuggestedStart: () => 1,
      getSuggestedEnd: (op) => getNumberProp(op, "scale", 1.5),
    },
  ],
  pan: [
    {
      key: "offset",
      label: "Offset",
      kind: "pair",
      min: -2000,
      max: 2000,
      step: 1,
      axes: ["X", "Y"],
      description: "Animate a camera pan with explicit start and end offsets.",
      getValue: (op) => getPairProp(op, "offset", [0, 0]),
      getSuggestedStart: () => [0, 0],
      getSuggestedEnd: (op) => getPairProp(op, "offset", [0, 0]),
    },
  ],
};

const STATIC_PRESETS = [
  {
    label: "Blur Background",
    ops: [
      { id: "r1", type: "select", target: "background" },
      { id: "r2", type: "blur", strength: 25 },
    ],
  },
  {
    label: "Redact Faces",
    ops: [
      { id: "r1", type: "select", target: "mask" },
      { id: "r2", type: "pixelate", block_size: 20 },
    ],
  },
  {
    label: "Green Screen",
    ops: [{ id: "r1", type: "greenscreen" }],
  },
  {
    label: "Spotlight + Bokeh",
    ops: [
      { id: "r1", type: "spotlight", darkness: 0.6 },
      { id: "r2", type: "select", target: "background" },
      { id: "r3", type: "bokeh", strength: 15 },
    ],
  },
  {
    label: "Outline + Bbox",
    ops: [
      { id: "r1", type: "outline", color: [0, 255, 0, 255], thickness: 3 },
      { id: "r2", type: "bounding_box", color: [255, 0, 0, 255], thickness: 2 },
    ],
  },
  {
    label: "BG Replace",
    ops: [{ id: "r1", type: "replace_background", color: [30, 30, 30] }],
  },
  {
    label: "Vintage Film",
    ops: [
      { id: "r1", type: "sepia", intensity: 0.7 },
      { id: "r2", type: "noise", amount: 0.2, noise_type: "grain" },
    ],
  },
  {
    label: "Neon Outline",
    ops: [
      { id: "r1", type: "outline", color: [0, 255, 255, 255], thickness: 3 },
      { id: "r2", type: "glow", color: [0, 200, 255], radius: 20, intensity: 0.7 },
    ],
  },
  {
    label: "Pencil Sketch",
    ops: [{ id: "r1", type: "sketch", intensity: 0.9, detail: 6 }],
  },
  {
    label: "Color Pop",
    ops: [
      { id: "r1", type: "select", target: "background" },
      { id: "r2", type: "grayscale", intensity: 1.0 },
      { id: "r3", type: "select", target: "mask" },
      { id: "r4", type: "color_grade", brightness: 0, contrast: 0, saturation: 50 },
    ],
  },
  {
    label: "Per-Object FX",
    ops: [
      { id: "r1", type: "select", target: "background" },
      { id: "r2", type: "blur", strength: 20 },
      { id: "r3", type: "select", target: "mask", object_label: "object1" },
      { id: "r4", type: "outline", color: [0, 255, 255, 255], thickness: 3 },
      { id: "r5", type: "glow", color: [0, 200, 255], radius: 15, intensity: 0.6 },
      { id: "r6", type: "select", target: "mask", object_label: "object2" },
      { id: "r7", type: "outline", color: [255, 100, 0, 255], thickness: 3 },
      { id: "r8", type: "glow", color: [255, 100, 0], radius: 15, intensity: 0.6 },
    ],
  },
];

const ANIMATED_PRESETS = [
  {
    label: "\u2728 Cinematic Reveal",
    ops: [
      { id: "r1", type: "spotlight", darkness: 0.8, animation: { mode: "transition", start: { darkness: 0 }, end: { darkness: 0.8 }, easing: "ease_in", duration: 1.5 } },
      { id: "r2", type: "outline", color: [0, 255, 255, 255], thickness: 3, animation: { mode: "draw", easing: "ease_in_out", delay: 1.0, duration: 2.0 } },
      { id: "r3", type: "glow", color: [0, 200, 255], radius: 20, intensity: 0.5, animation: { mode: "pulse", start: { intensity: 0 }, end: { intensity: 0.8 }, easing: "ease_in_out", cycles: 3, delay: 1.5 } },
      { id: "r4", type: "zoom", target: "mask", animation: { mode: "transition", start: { scale: 1.0 }, end: { scale: 1.3 }, easing: "ease_out", delay: 0.5 } },
    ],
  },
  {
    label: "\u2728 Glitch Flicker",
    ops: [
      { id: "r1", type: "glitch", rgb_shift: 15, intensity: 0.5, seed: 42, animation: { mode: "pulse", start: { intensity: 0 }, end: { intensity: 0.8 }, easing: "ease_out_elastic", cycles: 5 } },
      { id: "r2", type: "glow", color: [255, 50, 255], radius: 15, intensity: 0.5, animation: { mode: "loop", start: { intensity: 0.2 }, end: { intensity: 0.9 }, easing: "ease_in_out", cycles: 4 } },
    ],
  },
  {
    label: "\u2728 Blur Fade-In",
    ops: [
      { id: "r1", type: "select", target: "background" },
      { id: "r2", type: "blur", strength: 25, animation: { mode: "transition", start: { strength: 0 }, end: { strength: 25 }, easing: "ease_out" } },
    ],
  },
  {
    label: "\u2728 Sketch Transform",
    ops: [
      { id: "r1", type: "sketch", detail: 6, intensity: 1.0, animation: { mode: "transition", start: { intensity: 0 }, end: { intensity: 1.0 }, easing: "ease_in_out" } },
    ],
  },
];

let _opCounter = 0;
const genId = () => `op_${++_opCounter}_${Date.now()}`;

// ============================================================================
// OPERATION PARAMETER EDITORS
// ============================================================================

function ColorInput({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  const hex = `#${(value || [0, 0, 0]).slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('')}`;
  const alpha = value?.[3] ?? 255;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500 w-16 shrink-0">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const r = parseInt(e.target.value.slice(1, 3), 16);
          const g = parseInt(e.target.value.slice(3, 5), 16);
          const b = parseInt(e.target.value.slice(5, 7), 16);
          onChange(value?.length === 4 ? [r, g, b, alpha] : [r, g, b]);
        }}
        className="w-8 h-6 rounded border border-neutral-600 cursor-pointer bg-transparent"
      />
      {value?.length === 4 && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-600">A:</span>
          <Input
            type="number"
            min={0}
            max={255}
            value={alpha}
            onChange={(e) => onChange([...(value || [0, 0, 0]).slice(0, 3), parseInt(e.target.value) || 0])}
            className="w-16 h-6 text-xs bg-neutral-800 border-neutral-700"
          />
        </div>
      )}
    </div>
  );
}

function OpParams({
  op,
  onChange,
  objectLabels,
  objectIdEnabled,
}: {
  op: SegOp;
  onChange: (updates: Partial<SegOp>) => void;
  objectLabels?: string[];
  objectIdEnabled?: boolean;
}) {
  const t = op.type;

  if (t === "select") {
    const hasLabels = objectLabels && objectLabels.length > 0;
    const currentLabel = op.object_label as string | undefined;
    const currentLabels = op.object_labels as string[] | undefined;
    const selectedLabels = currentLabels?.length ? currentLabels : currentLabel ? [currentLabel] : [];
    const currentObjectId = op.object_id as number | undefined;
    const currentObjectIds = op.object_ids as number[] | undefined;
    return (
      <div className="space-y-2 w-full">
        <div className="flex gap-1">
          {(["mask", "background", "all"] as const).map((target) => (
            <button
              key={target}
              onClick={() => onChange({ target })}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                op.target === target ? "bg-cyan-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
              }`}
            >
              {target}
            </button>
          ))}
        </div>
        {op.target === "mask" && hasLabels && (
          <div className="space-y-1.5">
            <span className="text-xs text-neutral-500">Target Labels</span>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onChange({
                  object_label: undefined,
                  object_labels: undefined,
                  object_index: undefined,
                  object_id: undefined,
                  object_ids: undefined,
                })}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  selectedLabels.length === 0 ? "bg-cyan-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                }`}
              >
                all objects
              </button>
              {objectLabels.map((label) => {
                const isActive = selectedLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => {
                      const nextLabels = isActive
                        ? selectedLabels.filter((selected) => selected !== label)
                        : [...selectedLabels, label];
                      onChange({
                        object_label: nextLabels.length === 1 ? nextLabels[0] : undefined,
                        object_labels: nextLabels.length > 1 ? nextLabels : undefined,
                        object_index: undefined,
                        object_id: undefined,
                        object_ids: undefined,
                      });
                    }}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      isActive ? "bg-amber-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-neutral-600 italic">Click one or more labels to target their union</span>
          </div>
        )}
        {op.target === "mask" && objectIdEnabled && (
          <div className="space-y-1.5">
            <span className="text-xs text-neutral-500">Stable Object IDs</span>
            <Input
              value={currentObjectIds?.length ? currentObjectIds.join(", ") : currentObjectId?.toString() || ""}
              onChange={(e) => {
                const values = e.target.value
                  .split(",")
                  .map((value) => parseInt(value.trim(), 10))
                  .filter((value) => Number.isFinite(value));
                onChange({
                  object_id: values.length === 1 ? values[0] : undefined,
                  object_ids: values.length > 1 ? values : undefined,
                  object_index: undefined,
                  object_label: undefined,
                  object_labels: undefined,
                });
              }}
              placeholder="1, 3"
              className="bg-neutral-800 border-neutral-700 text-xs h-7 font-mono"
            />
            <span className="text-xs text-neutral-600 italic">Optional. Overrides label/index targeting when present.</span>
          </div>
        )}
        {op.target === "mask" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 shrink-0">Object #</span>
            <Input
              type="number"
              min={0}
              value={(op.object_index as number) ?? ""}
              onChange={(e) => onChange({
                object_index: e.target.value ? parseInt(e.target.value) : undefined,
                object_id: undefined,
                object_ids: undefined,
                object_label: undefined,
                object_labels: undefined,
              })}
              placeholder="all"
              className="w-20 h-6 text-xs bg-neutral-800 border-neutral-700"
            />
            <span className="text-xs text-neutral-600 italic">Fallback 0-based selector (blank = all objects)</span>
          </div>
        )}
      </div>
    );
  }

  if (t === "blur") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Strength</span>
          <span className="text-xs text-neutral-400">{(op.strength as number) ?? 25}</span>
        </div>
        <Slider value={[(op.strength as number) ?? 25]} onValueChange={([v]) => onChange({ strength: v })} min={1} max={100} step={1} />
      </div>
    );
  }

  if (t === "pixelate") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Block Size</span>
          <span className="text-xs text-neutral-400">{(op.block_size as number) ?? 15}px</span>
        </div>
        <Slider value={[(op.block_size as number) ?? 15]} onValueChange={([v]) => onChange({ block_size: v })} min={5} max={50} step={1} />
      </div>
    );
  }

  if (t === "redact") {
    return <ColorInput label="Color" value={(op.color as number[]) || [0, 0, 0]} onChange={(color) => onChange({ color })} />;
  }

  if (t === "color_overlay") {
    return <ColorInput label="Color" value={(op.color as number[]) || [255, 0, 0, 128]} onChange={(color) => onChange({ color })} />;
  }

  if (t === "color_grade") {
    return (
      <div className="space-y-2 w-full">
        {(["brightness", "contrast", "saturation"] as const).map((prop) => (
          <div key={prop}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-neutral-500 capitalize">{prop}</span>
              <span className="text-xs text-neutral-400">{(op[prop] as number) ?? 0}</span>
            </div>
            <Slider value={[(op[prop] as number) ?? 0]} onValueChange={([v]) => onChange({ [prop]: v })} min={-100} max={100} step={1} />
          </div>
        ))}
      </div>
    );
  }

  if (t === "opacity") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Opacity</span>
          <span className="text-xs text-neutral-400">{((op.value as number) ?? 1.0).toFixed(2)}</span>
        </div>
        <Slider value={[((op.value as number) ?? 1.0) * 100]} onValueChange={([v]) => onChange({ value: v / 100 })} min={0} max={100} step={1} />
      </div>
    );
  }

  if (t === "replace_color") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Hue Shift</span>
            <span className="text-xs text-neutral-400">{(op.hue_shift as number) ?? 0}°</span>
          </div>
          <Slider value={[(op.hue_shift as number) ?? 0]} onValueChange={([v]) => onChange({ hue_shift: v })} min={-180} max={180} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Saturation Scale</span>
            <span className="text-xs text-neutral-400">{((op.saturation_scale as number) ?? 1.0).toFixed(1)}x</span>
          </div>
          <Slider value={[((op.saturation_scale as number) ?? 1.0) * 10]} onValueChange={([v]) => onChange({ saturation_scale: v / 10 })} min={0} max={30} step={1} />
        </div>
      </div>
    );
  }

  if (t === "remove_background" || t === "greenscreen") {
    return <span className="text-xs text-neutral-500 italic">No parameters</span>;
  }

  if (t === "replace_background") {
    return (
      <div className="space-y-2 w-full">
        <ColorInput label="Color" value={(op.color as number[]) || [0, 0, 0]} onChange={(color) => onChange({ color, image_url: undefined })} />
        <div>
          <span className="text-xs text-neutral-500">Or Image URL</span>
          <Input
            value={(op.image_url as string) || ""}
            onChange={(e) => onChange({ image_url: e.target.value || undefined })}
            placeholder="https://example.com/bg.jpg"
            className="bg-neutral-800 border-neutral-700 text-xs h-7 mt-1"
          />
        </div>
      </div>
    );
  }

  if (t === "outline" || t === "bounding_box") {
    return (
      <div className="space-y-2 w-full">
        <ColorInput label="Color" value={(op.color as number[]) || (t === "outline" ? [0, 255, 0, 255] : [255, 0, 0, 255])} onChange={(color) => onChange({ color })} />
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Thickness</span>
            <span className="text-xs text-neutral-400">{(op.thickness as number) ?? 3}px</span>
          </div>
          <Slider value={[(op.thickness as number) ?? 3]} onValueChange={([v]) => onChange({ thickness: v })} min={1} max={20} step={1} />
        </div>
        {t === "outline" && (
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-neutral-500">Progress</span>
              <span className="text-xs text-neutral-400">{((op.progress as number) ?? 1).toFixed(2)}</span>
            </div>
            <Slider
              value={[((op.progress as number) ?? 1) * 100]}
              onValueChange={([v]) => onChange({ progress: v / 100 })}
              min={0}
              max={100}
              step={1}
            />
          </div>
        )}
      </div>
    );
  }

  // text_label removed in GPU-API v0.9.1

  if (t === "spotlight") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Darkness</span>
          <span className="text-xs text-neutral-400">{((op.darkness as number) ?? 0.7).toFixed(2)}</span>
        </div>
        <Slider value={[((op.darkness as number) ?? 0.7) * 100]} onValueChange={([v]) => onChange({ darkness: v / 100 })} min={0} max={100} step={1} />
      </div>
    );
  }

  if (t === "bokeh") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Strength</span>
          <span className="text-xs text-neutral-400">{(op.strength as number) ?? 15}</span>
        </div>
        <Slider value={[(op.strength as number) ?? 15]} onValueChange={([v]) => onChange({ strength: v })} min={5} max={50} step={1} />
      </div>
    );
  }

  if (t === "glow") {
    return (
      <div className="space-y-2 w-full">
        <ColorInput label="Color" value={(op.color as number[]) || [255, 255, 255]} onChange={(color) => onChange({ color })} />
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Radius</span>
            <span className="text-xs text-neutral-400">{(op.radius as number) ?? 15}</span>
          </div>
          <Slider value={[(op.radius as number) ?? 15]} onValueChange={([v]) => onChange({ radius: v })} min={5} max={50} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Intensity</span>
            <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 0.5).toFixed(2)}</span>
          </div>
          <Slider value={[((op.intensity as number) ?? 0.5) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
        </div>
      </div>
    );
  }

  if (t === "shadow") {
    return (
      <div className="space-y-2 w-full">
        <div className="flex gap-2">
          <div>
            <span className="text-xs text-neutral-500">X</span>
            <Input type="number" value={(op.offset as number[])?.[0] ?? 5} onChange={(e) => onChange({ offset: [parseInt(e.target.value) || 0, (op.offset as number[])?.[1] ?? 5] })} className="w-14 h-6 text-xs bg-neutral-800 border-neutral-700" />
          </div>
          <div>
            <span className="text-xs text-neutral-500">Y</span>
            <Input type="number" value={(op.offset as number[])?.[1] ?? 5} onChange={(e) => onChange({ offset: [(op.offset as number[])?.[0] ?? 5, parseInt(e.target.value) || 0] })} className="w-14 h-6 text-xs bg-neutral-800 border-neutral-700" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Blur</span>
            <span className="text-xs text-neutral-400">{(op.blur as number) ?? 10}</span>
          </div>
          <Slider value={[(op.blur as number) ?? 10]} onValueChange={([v]) => onChange({ blur: v })} min={5} max={30} step={1} />
        </div>
        <ColorInput label="Color" value={(op.color as number[]) || [0, 0, 0, 180]} onChange={(color) => onChange({ color })} />
      </div>
    );
  }

  if (t === "vignette") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Strength</span>
          <span className="text-xs text-neutral-400">{((op.strength as number) ?? 0.5).toFixed(2)}</span>
        </div>
        <Slider value={[((op.strength as number) ?? 0.5) * 100]} onValueChange={([v]) => onChange({ strength: v / 100 })} min={0} max={100} step={1} />
      </div>
    );
  }

  // --- Filters ---
  if (t === "grayscale" || t === "invert" || t === "sepia" || t === "edge_detect" || t === "emboss") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Intensity</span>
          <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 1.0).toFixed(2)}</span>
        </div>
        <Slider value={[((op.intensity as number) ?? 1.0) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
      </div>
    );
  }

  if (t === "sharpen") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Strength</span>
          <span className="text-xs text-neutral-400">{((op.strength as number) ?? 2.0).toFixed(1)}</span>
        </div>
        <Slider value={[((op.strength as number) ?? 2.0) * 10]} onValueChange={([v]) => onChange({ strength: v / 10 })} min={0} max={100} step={1} />
      </div>
    );
  }

  if (t === "posterize") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Levels</span>
          <span className="text-xs text-neutral-400">{(op.levels as number) ?? 4}</span>
        </div>
        <Slider value={[(op.levels as number) ?? 4]} onValueChange={([v]) => onChange({ levels: v })} min={2} max={32} step={1} />
      </div>
    );
  }

  if (t === "noise") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Amount</span>
            <span className="text-xs text-neutral-400">{((op.amount as number) ?? 0.3).toFixed(2)}</span>
          </div>
          <Slider value={[((op.amount as number) ?? 0.3) * 100]} onValueChange={([v]) => onChange({ amount: v / 100 })} min={0} max={100} step={1} />
        </div>
        <div className="flex gap-1">
          {(["gaussian", "grain"] as const).map((nt) => (
            <button key={nt} onClick={() => onChange({ noise_type: nt })} className={`px-2 py-0.5 rounded text-xs ${op.noise_type === nt ? "bg-cyan-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}>{nt}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Seed</span>
          <Input type="number" value={(op.seed as number) ?? ""} onChange={(e) => onChange({ seed: e.target.value ? parseInt(e.target.value) : undefined })} className="w-20 h-6 text-xs bg-neutral-800 border-neutral-700" placeholder="auto" />
        </div>
      </div>
    );
  }

  if (t === "sketch") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Intensity</span>
            <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 1.0).toFixed(2)}</span>
          </div>
          <Slider value={[((op.intensity as number) ?? 1.0) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Detail</span>
            <span className="text-xs text-neutral-400">{(op.detail as number) ?? 5}</span>
          </div>
          <Slider value={[(op.detail as number) ?? 5]} onValueChange={([v]) => onChange({ detail: v })} min={1} max={10} step={1} />
        </div>
      </div>
    );
  }

  // --- Artistic ---
  if (t === "duotone") {
    return (
      <div className="space-y-2 w-full">
        <ColorInput label="Dark" value={(op.color_dark as number[]) || [20, 0, 80]} onChange={(c) => onChange({ color_dark: c })} />
        <ColorInput label="Light" value={(op.color_light as number[]) || [255, 200, 100]} onChange={(c) => onChange({ color_light: c })} />
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Intensity</span>
            <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 1.0).toFixed(2)}</span>
          </div>
          <Slider value={[((op.intensity as number) ?? 1.0) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
        </div>
      </div>
    );
  }

  if (t === "halftone") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Dot Size</span>
            <span className="text-xs text-neutral-400">{(op.dot_size as number) ?? 6}</span>
          </div>
          <Slider value={[(op.dot_size as number) ?? 6]} onValueChange={([v]) => onChange({ dot_size: v })} min={2} max={30} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Intensity</span>
            <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 1.0).toFixed(2)}</span>
          </div>
          <Slider value={[((op.intensity as number) ?? 1.0) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
        </div>
      </div>
    );
  }

  if (t === "glitch") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Intensity</span>
            <span className="text-xs text-neutral-400">{((op.intensity as number) ?? 0.5).toFixed(2)}</span>
          </div>
          <Slider value={[((op.intensity as number) ?? 0.5) * 100]} onValueChange={([v]) => onChange({ intensity: v / 100 })} min={0} max={100} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">RGB Shift</span>
            <span className="text-xs text-neutral-400">{(op.rgb_shift as number) ?? 10}px</span>
          </div>
          <Slider value={[(op.rgb_shift as number) ?? 10]} onValueChange={([v]) => onChange({ rgb_shift: v })} min={0} max={30} step={1} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Seed</span>
          <Input type="number" value={(op.seed as number) ?? ""} onChange={(e) => onChange({ seed: e.target.value ? parseInt(e.target.value) : undefined })} className="w-20 h-6 text-xs bg-neutral-800 border-neutral-700" placeholder="auto" />
        </div>
      </div>
    );
  }

  // --- Distortion ---
  if (t === "motion_blur") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Angle</span>
            <span className="text-xs text-neutral-400">{(op.angle as number) ?? 0}°</span>
          </div>
          <Slider value={[(op.angle as number) ?? 0]} onValueChange={([v]) => onChange({ angle: v })} min={0} max={360} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Strength</span>
            <span className="text-xs text-neutral-400">{(op.strength as number) ?? 15}</span>
          </div>
          <Slider value={[(op.strength as number) ?? 15]} onValueChange={([v]) => onChange({ strength: v })} min={1} max={50} step={1} />
        </div>
      </div>
    );
  }

  if (t === "glass") {
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Strength</span>
            <span className="text-xs text-neutral-400">{(op.strength as number) ?? 8}</span>
          </div>
          <Slider value={[(op.strength as number) ?? 8]} onValueChange={([v]) => onChange({ strength: v })} min={1} max={30} step={1} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Scale</span>
            <span className="text-xs text-neutral-400">{(op.scale as number) ?? 4}</span>
          </div>
          <Slider value={[(op.scale as number) ?? 4]} onValueChange={([v]) => onChange({ scale: v })} min={1} max={20} step={1} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Seed</span>
          <Input type="number" value={(op.seed as number) ?? ""} onChange={(e) => onChange({ seed: e.target.value ? parseInt(e.target.value) : undefined })} className="w-20 h-6 text-xs bg-neutral-800 border-neutral-700" placeholder="auto" />
        </div>
      </div>
    );
  }

  // --- Mask Processing ---
  if (t === "feather") {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-500">Radius</span>
          <span className="text-xs text-neutral-400">{(op.radius as number) ?? 10}px</span>
        </div>
        <Slider value={[(op.radius as number) ?? 10]} onValueChange={([v]) => onChange({ radius: v })} min={1} max={50} step={1} />
      </div>
    );
  }

  // --- Camera ---
  if (t === "zoom") {
    const zoomTarget = Array.isArray(op.target) ? "custom" : ((op.target as string) || "mask");
    const zoomPoint = Array.isArray(op.target) ? op.target as number[] : [0.5, 0.5];
    return (
      <div className="space-y-2 w-full">
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-neutral-500">Scale</span>
            <span className="text-xs text-neutral-400">{((op.scale as number) ?? 1.5).toFixed(1)}x</span>
          </div>
          <Slider value={[((op.scale as number) ?? 1.5) * 10]} onValueChange={([v]) => onChange({ scale: v / 10 })} min={10} max={40} step={1} />
        </div>
        <div className="flex gap-1">
          {(["mask", "center", "custom"] as const).map((tgt) => (
            <button key={tgt} onClick={() => onChange({ target: tgt === "custom" ? zoomPoint : tgt })} className={`px-2 py-0.5 rounded text-xs ${zoomTarget === tgt ? "bg-cyan-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"}`}>{tgt}</button>
          ))}
        </div>
        {zoomTarget === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-neutral-500">X (0-1)</span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={zoomPoint[0] ?? 0.5}
                onChange={(e) => onChange({ target: [parseFloat(e.target.value) || 0, zoomPoint[1] ?? 0.5] })}
                className="h-6 text-xs bg-neutral-800 border-neutral-700"
              />
            </div>
            <div>
              <span className="text-xs text-neutral-500">Y (0-1)</span>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={zoomPoint[1] ?? 0.5}
                onChange={(e) => onChange({ target: [zoomPoint[0] ?? 0.5, parseFloat(e.target.value) || 0] })}
                className="h-6 text-xs bg-neutral-800 border-neutral-700"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (t === "pan") {
    return (
      <div className="flex gap-2 w-full">
        <div>
          <span className="text-xs text-neutral-500">X</span>
          <Input type="number" value={(op.offset as number[])?.[0] ?? 0} onChange={(e) => onChange({ offset: [parseInt(e.target.value) || 0, (op.offset as number[])?.[1] ?? 0] })} className="w-16 h-6 text-xs bg-neutral-800 border-neutral-700" />
        </div>
        <div>
          <span className="text-xs text-neutral-500">Y</span>
          <Input type="number" value={(op.offset as number[])?.[1] ?? 0} onChange={(e) => onChange({ offset: [(op.offset as number[])?.[0] ?? 0, parseInt(e.target.value) || 0] })} className="w-16 h-6 text-xs bg-neutral-800 border-neutral-700" />
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// LABEL LOOKUP
// ============================================================================
const OP_LABELS: Record<string, string> = {};
SEGMENT_OPERATION_CATEGORIES.forEach((cat) =>
  cat.ops.forEach((op) => {
    OP_LABELS[op.type] = op.label;
  }),
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const EASING_OPTIONS = [
  "linear", "ease_in", "ease_out", "ease_in_out",
  "ease_in_cubic", "ease_out_cubic", "ease_in_out_cubic",
  "ease_out_back", "ease_out_elastic", "ease_out_bounce",
];

const ANIM_MODES = ["transition", "draw", "pulse", "reveal", "loop", "stagger"];
const REVEAL_DIRS = ["left", "right", "top", "bottom", "radial"];

function AnimationEditor({
  op,
  animation,
  onChange,
}: {
  op: SegOp;
  animation?: AnimationConfig;
  onChange: (a: AnimationConfig | undefined) => void;
}) {
  const [open, setOpen] = useState(!!animation);
  const a = animation || {};
  const fieldDefinitions = ANIMATION_FIELD_DEFINITIONS[op.type] || [];
  const activeFieldKeys = new Set([
    ...Object.keys(a.start || {}),
    ...Object.keys(a.end || {}),
  ]);
  const activeFields = fieldDefinitions.filter((field) =>
    activeFieldKeys.has(field.key),
  );
  const inactiveFields = fieldDefinitions.filter(
    (field) => !activeFieldKeys.has(field.key),
  );
  const supportsKeyframes =
    a.mode === "transition" ||
    a.mode === "pulse" ||
    a.mode === "loop" ||
    a.mode === "stagger";

  const update = (patch: Partial<AnimationConfig>) => onChange({ ...a, ...patch });
  const updateMap = (
    key: "start" | "end",
    value: Record<string, number | number[]> | undefined,
  ) => update({ [key]: value } as Partial<AnimationConfig>);

  const updateField = (
    key: "start" | "end",
    fieldKey: string,
    value: number | number[],
  ) => {
    const next = { ...(a[key] || {}) };
    next[fieldKey] = value;
    updateMap(key, Object.keys(next).length ? next : undefined);
  };

  const removeField = (fieldKey: string) => {
    const nextStart = { ...(a.start || {}) };
    const nextEnd = { ...(a.end || {}) };
    delete nextStart[fieldKey];
    delete nextEnd[fieldKey];
    update({
      start: Object.keys(nextStart).length ? nextStart : undefined,
      end: Object.keys(nextEnd).length ? nextEnd : undefined,
    });
  };

  const addField = (field: AnimationFieldDefinition) => {
    const currentValue = field.getValue(op);
    update({
      start: {
        ...(a.start || {}),
        [field.key]: field.getSuggestedStart
          ? field.getSuggestedStart(op)
          : currentValue,
      },
      end: {
        ...(a.end || {}),
        [field.key]: field.getSuggestedEnd
          ? field.getSuggestedEnd(op)
          : currentValue,
      },
    });
  };

  return (
    <div className="mt-2 border-t border-neutral-700 pt-2">
      <button onClick={() => { setOpen(!open); if (!open && !animation) onChange({ mode: "transition", easing: "ease_out" }); }} className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 w-full">
        <Film className="w-3 h-3" />
        {open ? "Hide Animation" : "Add Animation"}
      </button>
      {open && animation && (
        <div className="mt-2 space-y-2 pl-1">
          <div className="flex gap-1.5 flex-wrap">
            {ANIM_MODES.map((m) => (
              <button key={m} onClick={() => update({ mode: m })} className={`px-1.5 py-0.5 rounded text-[10px] ${a.mode === m ? "bg-purple-600 text-white" : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"}`}>{m}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 w-12 shrink-0">Easing</span>
            <select value={a.easing || "ease_out"} onChange={(e) => update({ easing: e.target.value })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-300 px-1 py-0.5 flex-1">
              {EASING_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1"><span className="text-[10px] text-neutral-500">Delay (s)</span><Input type="number" value={a.delay ?? ""} onChange={(e) => update({ delay: e.target.value ? parseFloat(e.target.value) : undefined })} className="h-6 text-xs bg-neutral-800 border-neutral-700" step={0.1} min={0} max={10} placeholder="0" /></div>
            <div className="flex-1"><span className="text-[10px] text-neutral-500">Duration (s)</span><Input type="number" value={a.duration ?? ""} onChange={(e) => update({ duration: e.target.value ? parseFloat(e.target.value) : undefined })} className="h-6 text-xs bg-neutral-800 border-neutral-700" step={0.1} min={0} max={10} placeholder="auto" /></div>
          </div>
          {(a.mode === "pulse" || a.mode === "loop") && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 w-12 shrink-0">Cycles</span>
              <Input type="number" value={a.cycles ?? 1} onChange={(e) => update({ cycles: parseInt(e.target.value) || 1 })} className="w-16 h-6 text-xs bg-neutral-800 border-neutral-700" min={1} max={20} />
            </div>
          )}
          {a.mode === "reveal" && (
            <div className="flex gap-1">
              {REVEAL_DIRS.map((d) => (
                <button key={d} onClick={() => update({ direction: d })} className={`px-1.5 py-0.5 rounded text-[10px] ${a.direction === d ? "bg-purple-600 text-white" : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"}`}>{d}</button>
              ))}
            </div>
          )}
          {a.mode === "stagger" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 shrink-0">Stagger (s)</span>
              <Input type="number" value={a.stagger_delay ?? 0.2} onChange={(e) => update({ stagger_delay: parseFloat(e.target.value) || 0.2 })} className="w-16 h-6 text-xs bg-neutral-800 border-neutral-700" step={0.05} min={0} max={2} />
            </div>
          )}
          {supportsKeyframes && fieldDefinitions.length > 0 && (
            <div className="space-y-2 rounded-lg border border-neutral-700 bg-neutral-900/60 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                    Animated Parameters
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    Pick the operation values that should move from start to end.
                  </p>
                </div>
                {inactiveFields.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {inactiveFields.map((field) => (
                      <button
                        key={field.key}
                        onClick={() => addField(field)}
                        className="rounded border border-purple-700/50 bg-purple-900/20 px-2 py-0.5 text-[10px] text-purple-300 transition-colors hover:bg-purple-800/30"
                      >
                        Add {field.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {activeFields.length === 0 ? (
                <p className="text-[10px] text-neutral-500">
                  No animated parameters selected yet.
                </p>
              ) : (
                activeFields.map((field) => {
                  const startValue =
                    (a.start?.[field.key] as number | number[] | undefined) ??
                    field.getSuggestedStart?.(op) ??
                    field.getValue(op);
                  const endValue =
                    (a.end?.[field.key] as number | number[] | undefined) ??
                    field.getSuggestedEnd?.(op) ??
                    field.getValue(op);

                  return (
                    <div
                      key={field.key}
                      className="space-y-2 rounded-md border border-neutral-700 bg-neutral-950/60 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-white">{field.label}</p>
                          {field.description && (
                            <p className="text-[10px] text-neutral-500">
                              {field.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeField(field.key)}
                          className="text-[10px] text-red-400 transition-colors hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>

                      {field.kind === "pair" ? (
                        <div className="grid grid-cols-2 gap-2">
                          {(field.axes || ["X", "Y"]).map((axisLabel, axisIndex) => (
                            <div key={`${field.key}-${axisLabel}`} className="space-y-1">
                              <span className="text-[10px] text-neutral-500">
                                {axisLabel} Start
                              </span>
                              <Input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={Array.isArray(startValue) ? startValue[axisIndex] ?? 0 : 0}
                                onChange={(e) => {
                                  const next = Array.isArray(startValue) ? [...startValue] : [0, 0];
                                  next[axisIndex] = parseFloat(e.target.value) || 0;
                                  updateField("start", field.key, next);
                                }}
                                className="h-6 text-xs bg-neutral-800 border-neutral-700"
                              />
                            </div>
                          ))}
                          {(field.axes || ["X", "Y"]).map((axisLabel, axisIndex) => (
                            <div key={`${field.key}-${axisLabel}-end`} className="space-y-1">
                              <span className="text-[10px] text-neutral-500">
                                {axisLabel} End
                              </span>
                              <Input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={Array.isArray(endValue) ? endValue[axisIndex] ?? 0 : 0}
                                onChange={(e) => {
                                  const next = Array.isArray(endValue) ? [...endValue] : [0, 0];
                                  next[axisIndex] = parseFloat(e.target.value) || 0;
                                  updateField("end", field.key, next);
                                }}
                                className="h-6 text-xs bg-neutral-800 border-neutral-700"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-[10px] text-neutral-500">Start</span>
                            <Input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={typeof startValue === "number" ? startValue : field.min}
                              onChange={(e) => updateField("start", field.key, parseFloat(e.target.value) || 0)}
                              className="h-6 text-xs bg-neutral-800 border-neutral-700"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-neutral-500">End</span>
                            <Input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={typeof endValue === "number" ? endValue : field.max}
                              onChange={(e) => updateField("end", field.key, parseFloat(e.target.value) || 0)}
                              className="h-6 text-xs bg-neutral-800 border-neutral-700"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
          {false && (a.mode === "transition" || a.mode === "pulse" || a.mode === "loop" || a.mode === "stagger") && (
            <div className="space-y-1">
              <span className="text-[10px] text-neutral-500">Start → End values (param:value)</span>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input value={a.start ? Object.entries(a.start || {}).map(([k,v]) => `${k}:${v}`).join(", ") : ""} onChange={(e) => { const obj: Record<string,number> = {}; e.target.value.split(",").forEach(p => { const [k,v] = p.split(":").map(s => s.trim()); if (k && v) obj[k] = parseFloat(v); }); update({ start: Object.keys(obj).length ? obj : undefined }); }} className="h-6 text-[10px] bg-neutral-800 border-neutral-700 font-mono" placeholder="strength:0" />
                </div>
                <span className="text-neutral-600 text-xs self-center">→</span>
                <div className="flex-1">
                  <Input value={a.end ? Object.entries(a.end || {}).map(([k,v]) => `${k}:${v}`).join(", ") : ""} onChange={(e) => { const obj: Record<string,number> = {}; e.target.value.split(",").forEach(p => { const [k,v] = p.split(":").map(s => s.trim()); if (k && v) obj[k] = parseFloat(v); }); update({ end: Object.keys(obj).length ? obj : undefined }); }} className="h-6 text-[10px] bg-neutral-800 border-neutral-700 font-mono" placeholder="strength:25" />
                </div>
              </div>
            </div>
          )}
          <button onClick={() => { onChange(undefined); setOpen(false); }} className="text-[10px] text-red-400 hover:text-red-300">Remove Animation</button>
        </div>
      )}
    </div>
  );
}

interface SegmentOperationsBuilderProps {
  operations: SegOp[];
  onChange: (ops: SegOp[]) => void;
  animationEnabled?: boolean;
  objectLabels?: string[];
  objectIdEnabled?: boolean;
}

export function SegmentOperationsBuilder({
  operations,
  onChange,
  animationEnabled = false,
  objectLabels,
  objectIdEnabled = false,
}: SegmentOperationsBuilderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const allPresets = animationEnabled ? [...STATIC_PRESETS, ...ANIMATED_PRESETS] : STATIC_PRESETS;
  const availableOperationCategories = animationEnabled
    ? SEGMENT_OPERATION_CATEGORIES
    : SEGMENT_OPERATION_CATEGORIES.filter((category) => category.label !== "Camera (Animation)");

  const addOp = (type: string) => {
    const defaults: Record<string, Partial<SegOp>> = {
      select: { target: "mask" },
      blur: { strength: 25 },
      pixelate: { block_size: 15 },
      redact: { color: [0, 0, 0] },
      color_overlay: { color: [255, 0, 0, 128] },
      color_grade: { brightness: 0, contrast: 0, saturation: 0 },
      opacity: { value: 1.0 },
      replace_color: { hue_shift: 0, saturation_scale: 1.0 },
      replace_background: { color: [0, 0, 0] },
      outline: { color: [0, 255, 0, 255], thickness: 3 },
      bounding_box: { color: [255, 0, 0, 255], thickness: 2 },
      spotlight: { darkness: 0.7 },
      bokeh: { strength: 15 },
      glow: { color: [255, 255, 255], radius: 15, intensity: 0.5 },
      shadow: { offset: [5, 5], blur: 10, color: [0, 0, 0, 180] },
      vignette: { strength: 0.5 },
      grayscale: { intensity: 1.0 },
      invert: { intensity: 1.0 },
      sharpen: { strength: 2.0 },
      sepia: { intensity: 1.0 },
      posterize: { levels: 4 },
      edge_detect: { intensity: 1.0 },
      emboss: { intensity: 1.0 },
      noise: { amount: 0.3, noise_type: "gaussian" },
      sketch: { intensity: 1.0, detail: 5 },
      duotone: { color_dark: [20, 0, 80], color_light: [255, 200, 100], intensity: 1.0 },
      halftone: { dot_size: 6, intensity: 1.0 },
      glitch: { intensity: 0.5, rgb_shift: 10 },
      motion_blur: { angle: 0, strength: 15 },
      glass: { strength: 8, scale: 4 },
      feather: { radius: 10 },
      zoom: { scale: 1.5, target: "mask" },
      pan: { offset: [0, 0] },
    };
    onChange([...operations, { id: genId(), type, ...(defaults[type] || {}) }]);
    setMenuOpen(false);
  };

  const removeOp = (id: string) => {
    onChange(operations.filter(op => op.id !== id));
  };

  const updateOp = (id: string, updates: Partial<SegOp>) => {
    onChange(operations.map(op => op.id === id ? { ...op, ...updates } : op));
  };

  const moveOp = (index: number, direction: -1 | 1) => {
    const newOps = [...operations];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOps.length) return;
    [newOps[index], newOps[targetIndex]] = [newOps[targetIndex], newOps[index]];
    onChange(newOps);
  };

  const applyRecipe = (recipe: typeof STATIC_PRESETS[0]) => {
    onChange(recipe.ops.map(op => ({ ...op, id: genId() })));
    setMenuOpen(false);
  };

  return (
    <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Effects Pipeline ({operations.length} ops)
        </h4>
      </div>

      {/* Recipe Presets */}
      <div className="flex gap-1.5 flex-wrap">
        {allPresets.map((recipe) => (
          <button
            key={recipe.label}
            onClick={() => applyRecipe(recipe)}
            className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
              recipe.label.startsWith("✨")
                ? "bg-purple-900/30 text-purple-300 hover:bg-purple-800/40 border-purple-700/50"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border-neutral-700"
            }`}
          >
            {recipe.label}
          </button>
        ))}
      </div>

      {/* Operations List */}
      {operations.length > 0 && (
        <div className="space-y-2">
          {operations.map((op, index) => (
            <div key={op.id} className={`bg-neutral-800 rounded-lg border p-2.5 ${op.animation ? "border-purple-700/50" : "border-neutral-700"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-neutral-700 text-neutral-400 px-1.5 py-0.5 rounded font-mono">
                    {index + 1}
                  </span>
                  <span className="text-xs font-medium text-white">
                    {OP_LABELS[op.type] || op.type}
                  </span>
                  {op.animation && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-600/30 text-purple-300">🎬 {op.animation.mode}</span>}
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => moveOp(index, -1)} disabled={index === 0} className="p-0.5 text-neutral-500 hover:text-white disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveOp(index, 1)} disabled={index === operations.length - 1} className="p-0.5 text-neutral-500 hover:text-white disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeOp(op.id)} className="p-0.5 text-neutral-500 hover:text-red-400 ml-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <OpParams
                op={op}
                onChange={(updates) => updateOp(op.id, updates)}
                objectLabels={objectLabels}
                objectIdEnabled={objectIdEnabled}
              />
              {animationEnabled && op.type !== "select" && (
                <AnimationEditor op={op} animation={op.animation} onChange={(a) => updateOp(op.id, { animation: a })} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Operation */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-full border-dashed border-neutral-600 text-neutral-400 hover:text-white hover:border-cyan-600 text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Operation
        </Button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            {/* Dropdown */}
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
              {availableOperationCategories.map((cat) => (
                <div key={cat.label}>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium bg-neutral-850 sticky top-0">
                    {cat.label}
                  </div>
                  {cat.ops.map((op) => (
                    <button
                      key={op.type}
                      onClick={() => addOp(op.type)}
                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 transition-colors"
                    >
                      <span className="text-xs text-white">{op.label}</span>
                      <span className="text-[10px] text-neutral-500 ml-2">{op.desc}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
