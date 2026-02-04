/**
 * Advanced Text Style Presets - Premiere Pro Style
 * 
 * Uses new features:
 * - textStroke for outlines
 * - textShadows for multiple shadows
 * - textGradient for gradient fills
 * - glowEffect for glowing text
 * - characterAnimation for animated text reveals
 */

import { TextOverlay } from "../types";
import { Gradient, GradientType } from "../types/gradients";
import { Shadow } from "../types/shadows";

export interface TextStylePreset {
  id: string;
  name: string;
  category: 'titles' | 'lower-thirds' | 'captions' | 'credits' | 'social' | 'effects';
  preview: string;
  description: string;
  styles: Partial<TextOverlay['styles']>;
}

export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  // ==========================================
  // TITLES
  // ==========================================
  {
    id: 'cinematic-title',
    name: 'Cinematic Title',
    category: 'titles',
    preview: 'Epic movie-style title',
    description: 'Bold title with dramatic shadow and subtle glow',
    styles: {
      fontSize: '72px',
      fontWeight: '900',
      fontFamily: 'Montserrat',
      color: '#ffffff',
      textAlign: 'center',
      letterSpacing: '0.05em',
      textShadows: [
        { offsetX: 0, offsetY: 4, blur: 20, color: 'rgba(0, 0, 0, 0.8)' },
        { offsetX: 0, offsetY: 8, blur: 40, color: 'rgba(0, 0, 0, 0.4)' },
      ],
      glowEffect: {
        color: 'rgba(255, 255, 255, 0.3)',
        intensity: 10,
      },
    },
  },
  {
    id: 'gradient-title',
    name: 'Gradient Title',
    category: 'titles',
    preview: 'Colorful gradient text',
    description: 'Modern gradient fill with clean look',
    styles: {
      fontSize: '64px',
      fontWeight: '800',
      fontFamily: 'Poppins',
      textAlign: 'center',
      letterSpacing: '-0.02em',
      textGradient: {
        type: GradientType.LINEAR,
        angle: 135,
        stops: [
          { color: '#667eea', offset: 0 },
          { color: '#764ba2', offset: 100 },
        ],
      } as Gradient,
      textShadows: [
        { offsetX: 0, offsetY: 2, blur: 8, color: 'rgba(0, 0, 0, 0.2)' },
      ],
    },
  },
  {
    id: 'outlined-title',
    name: 'Outlined Title',
    category: 'titles',
    preview: 'Bold outline effect',
    description: 'Thick stroke with transparent fill',
    styles: {
      fontSize: '80px',
      fontWeight: '900',
      fontFamily: 'Oswald',
      color: 'transparent',
      textAlign: 'center',
      letterSpacing: '0.03em',
      textStroke: {
        width: 3,
        color: '#ffffff',
      },
      textShadows: [
        { offsetX: 0, offsetY: 4, blur: 12, color: 'rgba(0, 0, 0, 0.5)' },
      ],
    },
  },
  {
    id: 'neon-title',
    name: 'Neon Title',
    category: 'titles',
    preview: 'Glowing neon effect',
    description: 'Bright neon glow with multiple layers',
    styles: {
      fontSize: '68px',
      fontWeight: '700',
      fontFamily: 'Raleway',
      color: '#00ff9f',
      textAlign: 'center',
      letterSpacing: '0.1em',
      textShadows: [
        { offsetX: 0, offsetY: 0, blur: 10, color: '#00ff9f' },
        { offsetX: 0, offsetY: 0, blur: 20, color: '#00ff9f' },
        { offsetX: 0, offsetY: 0, blur: 40, color: '#00ff9f' },
        { offsetX: 0, offsetY: 0, blur: 80, color: 'rgba(0, 255, 159, 0.5)' },
      ],
    },
  },
  {
    id: 'animated-title',
    name: 'Animated Title',
    category: 'titles',
    preview: 'Character-by-character reveal',
    description: 'Smooth fade-in animation per character',
    styles: {
      fontSize: '60px',
      fontWeight: '700',
      fontFamily: 'Inter',
      color: '#ffffff',
      textAlign: 'center',
      characterAnimation: {
        preset: 'fadeIn',
        duration: 15,
        stagger: 3,
      },
      textShadows: [
        { offsetX: 0, offsetY: 2, blur: 10, color: 'rgba(0, 0, 0, 0.3)' },
      ],
    },
  },

  // ==========================================
  // LOWER THIRDS
  // ==========================================
  {
    id: 'modern-lower-third',
    name: 'Modern Lower Third',
    category: 'lower-thirds',
    preview: 'Clean professional look',
    description: 'Subtle shadow with white text',
    styles: {
      fontSize: '36px',
      fontWeight: '600',
      fontFamily: 'Inter',
      color: '#ffffff',
      textAlign: 'left',
      padding: '12px 20px',
      paddingBackgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '4px',
      textShadows: [
        { offsetX: 0, offsetY: 1, blur: 4, color: 'rgba(0, 0, 0, 0.3)' },
      ],
    },
  },
  {
    id: 'gradient-lower-third',
    name: 'Gradient Lower Third',
    category: 'lower-thirds',
    preview: 'Colorful gradient background',
    description: 'Gradient text with dark background',
    styles: {
      fontSize: '32px',
      fontWeight: '700',
      fontFamily: 'Roboto',
      textAlign: 'left',
      padding: '10px 18px',
      paddingBackgroundColor: 'rgba(0, 0, 0, 0.85)',
      borderRadius: '6px',
      textGradient: {
        type: GradientType.LINEAR,
        angle: 90,
        stops: [
          { color: '#ff6b6b', offset: 0 },
          { color: '#ffa500', offset: 100 },
        ],
      } as Gradient,
    },
  },
  {
    id: 'outlined-lower-third',
    name: 'Outlined Lower Third',
    category: 'lower-thirds',
    preview: 'Bold outline style',
    description: 'Thick stroke for visibility',
    styles: {
      fontSize: '38px',
      fontWeight: '800',
      fontFamily: 'Oswald',
      color: '#ffffff',
      textAlign: 'left',
      padding: '10px 16px',
      textStroke: {
        width: 2,
        color: '#000000',
      },
    },
  },

  // ==========================================
  // CAPTIONS
  // ==========================================
  {
    id: 'classic-caption',
    name: 'Classic Caption',
    category: 'captions',
    preview: 'Traditional subtitle style',
    description: 'Black outline on white text',
    styles: {
      fontSize: '28px',
      fontWeight: '700',
      fontFamily: 'Arial',
      color: '#ffffff',
      textAlign: 'center',
      textStroke: {
        width: 2,
        color: '#000000',
      },
    },
  },
  {
    id: 'modern-caption',
    name: 'Modern Caption',
    category: 'captions',
    preview: 'Clean boxed subtitle',
    description: 'Semi-transparent background box',
    styles: {
      fontSize: '26px',
      fontWeight: '600',
      fontFamily: 'Inter',
      color: '#ffffff',
      textAlign: 'center',
      padding: '8px 16px',
      paddingBackgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderRadius: '4px',
    },
  },
  {
    id: 'pop-caption',
    name: 'Pop Caption',
    category: 'captions',
    preview: 'Eye-catching animated',
    description: 'Animated reveal with shadow',
    styles: {
      fontSize: '32px',
      fontWeight: '800',
      fontFamily: 'Poppins',
      color: '#ffff00',
      textAlign: 'center',
      textStroke: {
        width: 3,
        color: '#000000',
      },
      characterAnimation: {
        preset: 'scaleIn',
        duration: 12,
        stagger: 2,
      },
    },
  },

  // ==========================================
  // SOCIAL MEDIA
  // ==========================================
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    category: 'social',
    preview: 'Trendy IG style',
    description: 'Gradient background with modern font',
    styles: {
      fontSize: '42px',
      fontWeight: '700',
      fontFamily: 'Montserrat',
      color: '#ffffff',
      textAlign: 'center',
      padding: '16px 24px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      textShadows: [
        { offsetX: 0, offsetY: 2, blur: 8, color: 'rgba(0, 0, 0, 0.3)' },
      ],
    },
  },
  {
    id: 'tiktok-caption',
    name: 'TikTok Caption',
    category: 'social',
    preview: 'Bold TikTok style',
    description: 'Large, bold text with heavy outline',
    styles: {
      fontSize: '48px',
      fontWeight: '900',
      fontFamily: 'Proxima Nova',
      color: '#ffffff',
      textAlign: 'center',
      textStroke: {
        width: 4,
        color: '#000000',
      },
      textShadows: [
        { offsetX: 2, offsetY: 2, blur: 0, color: '#000000' },
      ],
    },
  },
  {
    id: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    category: 'social',
    preview: 'Clickable thumbnail text',
    description: 'High contrast with glow',
    styles: {
      fontSize: '64px',
      fontWeight: '900',
      fontFamily: 'Oswald',
      color: '#ffff00',
      textAlign: 'center',
      textStroke: {
        width: 4,
        color: '#000000',
      },
      textShadows: [
        { offsetX: 0, offsetY: 0, blur: 20, color: '#ffff00' },
        { offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0, 0, 0, 0.8)' },
      ],
    },
  },

  // ==========================================
  // SPECIAL EFFECTS
  // ==========================================
  {
    id: 'glitch-text',
    name: 'Glitch Text',
    category: 'effects',
    preview: 'Digital glitch effect',
    description: 'RGB split shadow effect',
    styles: {
      fontSize: '56px',
      fontWeight: '900',
      fontFamily: 'Roboto Mono',
      color: '#ffffff',
      textAlign: 'center',
      letterSpacing: '0.05em',
      textShadows: [
        { offsetX: 2, offsetY: 0, blur: 0, color: '#ff0000' },
        { offsetX: -2, offsetY: 0, blur: 0, color: '#00ffff' },
        { offsetX: 0, offsetY: 2, blur: 0, color: '#00ff00' },
      ],
    },
  },
  {
    id: '3d-text',
    name: '3D Text',
    category: 'effects',
    preview: 'Three-dimensional effect',
    description: 'Layered shadows for depth',
    styles: {
      fontSize: '68px',
      fontWeight: '900',
      fontFamily: 'Impact',
      color: '#ffffff',
      textAlign: 'center',
      textShadows: [
        { offsetX: 1, offsetY: 1, blur: 0, color: '#e0e0e0' },
        { offsetX: 2, offsetY: 2, blur: 0, color: '#c0c0c0' },
        { offsetX: 3, offsetY: 3, blur: 0, color: '#a0a0a0' },
        { offsetX: 4, offsetY: 4, blur: 0, color: '#808080' },
        { offsetX: 5, offsetY: 5, blur: 10, color: 'rgba(0, 0, 0, 0.5)' },
      ],
    },
  },
  {
    id: 'rainbow-text',
    name: 'Rainbow Text',
    category: 'effects',
    preview: 'Colorful gradient',
    description: 'Multi-color gradient fill',
    styles: {
      fontSize: '60px',
      fontWeight: '800',
      fontFamily: 'Poppins',
      textAlign: 'center',
      textGradient: {
        type: GradientType.LINEAR,
        angle: 90,
        stops: [
          { color: '#ff0000', offset: 0 },
          { color: '#ff7f00', offset: 17 },
          { color: '#ffff00', offset: 33 },
          { color: '#00ff00', offset: 50 },
          { color: '#0000ff', offset: 67 },
          { color: '#4b0082', offset: 83 },
          { color: '#9400d3', offset: 100 },
        ],
      } as Gradient,
      textShadows: [
        { offsetX: 0, offsetY: 2, blur: 8, color: 'rgba(0, 0, 0, 0.3)' },
      ],
    },
  },
  {
    id: 'fire-text',
    name: 'Fire Text',
    category: 'effects',
    preview: 'Fiery glow effect',
    description: 'Orange/red gradient with intense glow',
    styles: {
      fontSize: '64px',
      fontWeight: '900',
      fontFamily: 'Oswald',
      textAlign: 'center',
      textGradient: {
        type: GradientType.LINEAR,
        angle: 180,
        stops: [
          { color: '#ffff00', offset: 0 },
          { color: '#ff6600', offset: 50 },
          { color: '#ff0000', offset: 100 },
        ],
      } as Gradient,
      textShadows: [
        { offsetX: 0, offsetY: 0, blur: 15, color: '#ff6600' },
        { offsetX: 0, offsetY: 0, blur: 30, color: '#ff0000' },
        { offsetX: 0, offsetY: 0, blur: 60, color: 'rgba(255, 100, 0, 0.5)' },
      ],
    },
  },
  {
    id: 'typewriter-text',
    name: 'Typewriter',
    category: 'effects',
    preview: 'Classic typing effect',
    description: 'Letter-by-letter reveal animation',
    styles: {
      fontSize: '40px',
      fontWeight: '400',
      fontFamily: 'Courier New',
      color: '#00ff00',
      textAlign: 'left',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      padding: '16px',
      characterAnimation: {
        preset: 'typewriter',
        duration: 5,
        stagger: 2,
      },
    },
  },
];

// Group presets by category
export const TEXT_PRESETS_BY_CATEGORY = TEXT_STYLE_PRESETS.reduce((acc, preset) => {
  if (!acc[preset.category]) {
    acc[preset.category] = [];
  }
  acc[preset.category].push(preset);
  return acc;
}, {} as Record<string, TextStylePreset[]>);

// Convert to object format for easy access
export const textStylePresets: Record<string, { name: string; preview: string; styles: Partial<TextOverlay['styles']> }> = TEXT_STYLE_PRESETS.reduce((acc, preset) => {
  acc[preset.id] = {
    name: preset.name,
    preview: preset.preview,
    styles: preset.styles,
  };
  return acc;
}, {} as Record<string, { name: string; preview: string; styles: Partial<TextOverlay['styles']> }>);
