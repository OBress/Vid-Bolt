/**
 * Shape Style Presets - Premiere Pro Style
 * 
 * Pre-configured shape styles for common use cases:
 * - Lower thirds backgrounds
 * - Title backgrounds
 * - Call-to-action boxes
 * - Dividers and accents
 * - Social media graphics
 */

import { ShapeOverlay } from "../types";
import { Gradient, GradientType } from "../types/gradients";
import { Shadow } from "../types/shadows";

export interface ShapeStylePreset {
  id: string;
  name: string;
  category: 'lower-thirds' | 'backgrounds' | 'accents' | 'social' | 'overlays';
  preview: string;
  description: string;
  shapeType: 'rectangle' | 'ellipse' | 'triangle' | 'line';
  defaultSize: { width: number; height: number };
  styles: Partial<ShapeOverlay['styles']>;
}

export const SHAPE_STYLE_PRESETS: ShapeStylePreset[] = [
  // ==========================================
  // LOWER THIRDS
  // ==========================================
  {
    id: 'lower-third-bar',
    name: 'Lower Third Bar',
    category: 'lower-thirds',
    preview: 'Classic lower third background',
    description: 'Semi-transparent dark bar for text',
    shapeType: 'rectangle',
    defaultSize: { width: 600, height: 80 },
    styles: {
      fill: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '4px',
      dropShadow: {
        offsetX: 0,
        offsetY: 4,
        blur: 12,
        spread: 0,
        color: 'rgba(0, 0, 0, 0.3)',
      },
    },
  },
  {
    id: 'gradient-lower-third',
    name: 'Gradient Lower Third',
    category: 'lower-thirds',
    preview: 'Modern gradient background',
    description: 'Colorful gradient for text overlay',
    shapeType: 'rectangle',
    defaultSize: { width: 650, height: 90 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 90,
        stops: [
          { color: '#667eea', offset: 0 },
          { color: '#764ba2', offset: 100 },
        ],
      },
      borderRadius: '8px',
      dropShadow: {
        offsetX: 0,
        offsetY: 6,
        blur: 16,
        spread: 0,
        color: 'rgba(0, 0, 0, 0.4)',
      },
    },
  },
  {
    id: 'outlined-lower-third',
    name: 'Outlined Lower Third',
    category: 'lower-thirds',
    preview: 'Stroke-only design',
    description: 'Minimal outline style',
    shapeType: 'rectangle',
    defaultSize: { width: 550, height: 70 },
    styles: {
      fill: 'transparent',
      stroke: '#ffffff',
      strokeWidth: 3,
      borderRadius: '6px',
    },
  },

  // ==========================================
  // BACKGROUNDS
  // ==========================================
  {
    id: 'title-background',
    name: 'Title Background',
    category: 'backgrounds',
    preview: 'Full-width title background',
    description: 'Wide background for titles',
    shapeType: 'rectangle',
    defaultSize: { width: 1200, height: 200 },
    styles: {
      fill: 'rgba(0, 0, 0, 0.85)',
      dropShadow: {
        offsetX: 0,
        offsetY: 8,
        blur: 24,
        spread: 0,
        color: 'rgba(0, 0, 0, 0.5)',
      },
    },
  },
  {
    id: 'gradient-background',
    name: 'Gradient Background',
    category: 'backgrounds',
    preview: 'Colorful full background',
    description: 'Vibrant gradient fill',
    shapeType: 'rectangle',
    defaultSize: { width: 1920, height: 1080 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 135,
        stops: [
          { color: '#ff6b6b', offset: 0 },
          { color: '#ffa500', offset: 50 },
          { color: '#ff1493', offset: 100 },
        ],
      },
      mixBlendMode: 'multiply',
      opacity: 0.7,
    },
  },
  {
    id: 'spotlight-circle',
    name: 'Spotlight Circle',
    category: 'backgrounds',
    preview: 'Circular spotlight effect',
    description: 'Radial gradient for focus',
    shapeType: 'ellipse',
    defaultSize: { width: 800, height: 800 },
    styles: {
      gradientConfig: {
        type: GradientType.RADIAL,
        stops: [
          { color: 'rgba(255, 255, 255, 0.3)', offset: 0 },
          { color: 'rgba(255, 255, 255, 0)', offset: 100 },
        ],
      },
      mixBlendMode: 'screen',
    },
  },

  // ==========================================
  // ACCENTS
  // ==========================================
  {
    id: 'accent-line',
    name: 'Accent Line',
    category: 'accents',
    preview: 'Thin decorative line',
    description: 'Underline or divider',
    shapeType: 'line',
    defaultSize: { width: 400, height: 4 },
    styles: {
      fill: '#3b82f6',
      dropShadow: {
        offsetX: 0,
        offsetY: 2,
        blur: 6,
        spread: 0,
        color: 'rgba(59, 130, 246, 0.5)',
      },
    },
  },
  {
    id: 'gradient-line',
    name: 'Gradient Line',
    category: 'accents',
    preview: 'Colorful gradient line',
    description: 'Multi-color divider',
    shapeType: 'line',
    defaultSize: { width: 500, height: 6 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 90,
        stops: [
          { color: '#667eea', offset: 0 },
          { color: '#764ba2', offset: 100 },
        ],
      },
    },
  },
  {
    id: 'corner-accent',
    name: 'Corner Accent',
    category: 'accents',
    preview: 'Frame corner decoration',
    description: 'L-shaped corner element',
    shapeType: 'rectangle',
    defaultSize: { width: 100, height: 100 },
    styles: {
      fill: 'transparent',
      stroke: '#ffffff',
      strokeWidth: 4,
      borderRadius: '0px',
    },
  },
  {
    id: 'glow-circle',
    name: 'Glow Circle',
    category: 'accents',
    preview: 'Glowing circular accent',
    description: 'Bright circular glow',
    shapeType: 'ellipse',
    defaultSize: { width: 200, height: 200 },
    styles: {
      fill: '#00ff9f',
      shadows: [
        { offsetX: 0, offsetY: 0, blur: 20, spread: 0, color: '#00ff9f', opacity: 0.8 },
        { offsetX: 0, offsetY: 0, blur: 40, spread: 0, color: '#00ff9f', opacity: 0.4 },
        { offsetX: 0, offsetY: 0, blur: 80, spread: 0, color: '#00ff9f', opacity: 0.2 },
      ],
      mixBlendMode: 'screen',
      opacity: 0.8,
    },
  },

  // ==========================================
  // SOCIAL MEDIA
  // ==========================================
  {
    id: 'instagram-story-bg',
    name: 'Instagram Story Background',
    category: 'social',
    preview: 'IG story-sized gradient',
    description: '9:16 gradient background',
    shapeType: 'rectangle',
    defaultSize: { width: 1080, height: 1920 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 135,
        stops: [
          { color: '#667eea', offset: 0 },
          { color: '#764ba2', offset: 100 },
        ],
      },
    },
  },
  {
    id: 'youtube-thumbnail-bg',
    name: 'YouTube Thumbnail Background',
    category: 'social',
    preview: '16:9 thumbnail background',
    description: 'Eye-catching gradient',
    shapeType: 'rectangle',
    defaultSize: { width: 1280, height: 720 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 45,
        stops: [
          { color: '#ff0844', offset: 0 },
          { color: '#ffb199', offset: 100 },
        ],
      },
    },
  },
  {
    id: 'call-to-action',
    name: 'Call to Action Button',
    category: 'social',
    preview: 'Clickable button style',
    description: 'Rounded button with shadow',
    shapeType: 'rectangle',
    defaultSize: { width: 300, height: 80 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 180,
        stops: [
          { color: '#ff6b6b', offset: 0 },
          { color: '#ee5a6f', offset: 100 },
        ],
      },
      borderRadius: '40px',
      dropShadow: {
        offsetX: 0,
        offsetY: 8,
        blur: 20,
        spread: 0,
        color: 'rgba(255, 107, 107, 0.4)',
      },
    },
  },
  {
    id: 'subscribe-button',
    name: 'Subscribe Button',
    category: 'social',
    preview: 'YouTube-style subscribe',
    description: 'Red gradient button',
    shapeType: 'rectangle',
    defaultSize: { width: 280, height: 70 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 180,
        stops: [
          { color: '#ff0000', offset: 0 },
          { color: '#cc0000', offset: 100 },
        ],
      },
      borderRadius: '35px',
      dropShadow: {
        offsetX: 0,
        offsetY: 6,
        blur: 16,
        spread: 0,
        color: 'rgba(255, 0, 0, 0.5)',
      },
    },
  },

  // ==========================================
  // OVERLAYS
  // ==========================================
  {
    id: 'vignette-overlay',
    name: 'Vignette Overlay',
    category: 'overlays',
    preview: 'Dark edge vignette',
    description: 'Cinematic dark edges',
    shapeType: 'ellipse',
    defaultSize: { width: 1920, height: 1080 },
    styles: {
      gradientConfig: {
        type: GradientType.RADIAL,
        stops: [
          { color: 'rgba(0, 0, 0, 0)', offset: 0 },
          { color: 'rgba(0, 0, 0, 0)', offset: 40 },
          { color: 'rgba(0, 0, 0, 0.8)', offset: 100 },
        ],
      },
      mixBlendMode: 'multiply',
    },
  },
  {
    id: 'light-leak',
    name: 'Light Leak',
    category: 'overlays',
    preview: 'Bright light overlay',
    description: 'Soft light leak effect',
    shapeType: 'ellipse',
    defaultSize: { width: 600, height: 600 },
    styles: {
      gradientConfig: {
        type: GradientType.RADIAL,
        stops: [
          { color: 'rgba(255, 200, 100, 0.6)', offset: 0 },
          { color: 'rgba(255, 100, 100, 0.3)', offset: 50 },
          { color: 'rgba(255, 100, 100, 0)', offset: 100 },
        ],
      },
      mixBlendMode: 'screen',
      opacity: 0.7,
    },
  },
  {
    id: 'color-grade-overlay',
    name: 'Color Grade Overlay',
    category: 'overlays',
    preview: 'Teal/orange color grade',
    description: 'Cinematic color overlay',
    shapeType: 'rectangle',
    defaultSize: { width: 1920, height: 1080 },
    styles: {
      gradientConfig: {
        type: GradientType.LINEAR,
        angle: 135,
        stops: [
          { color: 'rgba(0, 150, 150, 0.2)', offset: 0 },
          { color: 'rgba(255, 140, 0, 0.2)', offset: 100 },
        ],
      },
      mixBlendMode: 'overlay',
      opacity: 0.5,
    },
  },
];

// Group presets by category
export const SHAPE_PRESETS_BY_CATEGORY = SHAPE_STYLE_PRESETS.reduce((acc, preset) => {
  if (!acc[preset.category]) {
    acc[preset.category] = [];
  }
  acc[preset.category].push(preset);
  return acc;
}, {} as Record<string, ShapeStylePreset[]>);

// Convert to object format for easy access
export const shapeStylePresets: Record<string, { 
  name: string; 
  preview: string; 
  content: 'rectangle' | 'ellipse' | 'triangle' | 'line';
  styles: Partial<ShapeOverlay['styles']> 
}> = SHAPE_STYLE_PRESETS.reduce((acc, preset) => {
  // Convert preset styles to match actual ShapeOverlay type
  const styles: Partial<ShapeOverlay['styles']> = { ...preset.styles };
  
  // Rename gradientConfig if it was named gradient
  if ((preset.styles as any).gradient) {
    styles.gradientConfig = (preset.styles as any).gradient;
    delete (styles as any).gradient;
  }
  
  // Combine shadows
  const shadows: Shadow[] = [];
  if ((preset.styles as any).dropShadows) {
    shadows.push(...(preset.styles as any).dropShadows);
    delete (styles as any).dropShadows;
  }
  if ((preset.styles as any).innerShadows) {
    shadows.push(...(preset.styles as any).innerShadows.map((s: Shadow) => ({ ...s, inset: true })));
    delete (styles as any).innerShadows;
  }
  if (shadows.length > 0) {
    styles.shadows = shadows;
  }

  acc[preset.id] = {
    name: preset.name,
    preview: preset.preview,
    content: preset.shapeType,
    styles,
  };
  return acc;
}, {} as Record<string, { name: string; preview: string; content: 'rectangle' | 'ellipse' | 'triangle' | 'line'; styles: Partial<ShapeOverlay['styles']> }>);
