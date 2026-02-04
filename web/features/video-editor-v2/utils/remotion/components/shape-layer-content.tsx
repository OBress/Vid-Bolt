/**
 * ShapeLayerContent - Renders shape overlays in Remotion
 * 
 * Supports:
 * - Rectangle, Ellipse, Triangle, Line shapes
 * - Fill colors and gradients
 * - Stroke with width and color
 * - Drop shadows and inner shadows
 * - Blend modes
 * - Border radius (rectangles)
 */

import React, { useMemo } from "react";
import { ShapeOverlay } from "../../../types";
import { Gradient, GradientType } from "../../../types/gradients";
import { Shadow } from "../../../types/shadows";

interface ShapeLayerContentProps {
  overlay: ShapeOverlay;
}

/**
 * Generate gradient CSS from gradient config
 */
const generateGradientCSS = (gradient: Gradient): string => {
  if (!gradient || !gradient.stops || gradient.stops.length === 0) {
    return '';
  }

  const stops = gradient.stops
    .map(stop => `${stop.color} ${stop.offset}%`)
    .join(', ');

  if (gradient.type === GradientType.RADIAL) {
    return `radial-gradient(circle, ${stops})`;
  } else {
    // Linear gradient
    const angle = gradient.angle || 0;
    return `linear-gradient(${angle}deg, ${stops})`;
  }
};

/**
 * Generate box-shadow CSS from shadow configs
 */
const generateShadowCSS = (shadows: Shadow[]): string => {
  if (!shadows || shadows.length === 0) {
    return '';
  }

  return shadows
    .map(s => `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread || 0}px ${s.color}`)
    .join(', ');
};

export const ShapeLayerContent: React.FC<ShapeLayerContentProps> = ({ overlay }) => {
  const styles = overlay.styles || {};
  const shapeType = overlay.content; // 'rectangle', 'ellipse', 'triangle', 'line'

  // Build the style object
  const shapeStyle: React.CSSProperties = useMemo(() => {
    const style: React.CSSProperties = {
      width: '100%',
      height: '100%',
      position: 'relative',
    };

    // Background: gradient takes priority over fill
    if (styles.gradientConfig) {
      style.background = generateGradientCSS(styles.gradientConfig);
    } else if (styles.fill && styles.fill !== 'transparent') {
      style.backgroundColor = styles.fill;
    }

    // Border/Stroke
    if (styles.stroke && styles.stroke !== 'transparent' && (styles.strokeWidth ?? 0) > 0) {
      style.border = `${styles.strokeWidth}px solid ${styles.stroke}`;
    }

    // Border radius (for rectangles)
    if (styles.borderRadius) {
      style.borderRadius = styles.borderRadius;
    }

    // Shadows: use shadows array if available, otherwise dropShadow, otherwise boxShadow string
    if (styles.shadows && styles.shadows.length > 0) {
      style.boxShadow = generateShadowCSS(styles.shadows);
    } else if (styles.dropShadow) {
      style.boxShadow = generateShadowCSS([styles.dropShadow]);
    } else if (styles.boxShadow) {
      // Fallback to existing boxShadow string
      style.boxShadow = styles.boxShadow;
    }
    
    // Inner shadow (needs to be handled separately with pseudo-element or SVG filter)
    // For now, we'll add it to the same boxShadow with 'inset' keyword
    if (styles.innerShadow) {
      const innerShadowCSS = `inset ${styles.innerShadow.offsetX}px ${styles.innerShadow.offsetY}px ${styles.innerShadow.blur}px ${styles.innerShadow.spread || 0}px ${styles.innerShadow.color}`;
      style.boxShadow = style.boxShadow ? `${style.boxShadow}, ${innerShadowCSS}` : innerShadowCSS;
    }

    // Blend mode
    if (styles.mixBlendMode && styles.mixBlendMode !== 'normal') {
      style.mixBlendMode = styles.mixBlendMode as any;
    }

    // Opacity
    if (styles.opacity !== undefined) {
      style.opacity = styles.opacity;
    }

    return style;
  }, [styles, shapeType]);

  // Render based on shape type
  switch (shapeType) {
    case 'rectangle':
      return <div style={shapeStyle} />;

    case 'ellipse':
      return <div style={{ ...shapeStyle, borderRadius: '50%' }} />;

    case 'triangle':
      return (
        <div
          style={{
            ...shapeStyle,
            clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
            WebkitClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
          }}
        />
      );

    case 'line':
      // Lines are rendered as thin rectangles
      // The rotation is handled by the parent Layer component
      return (
        <div
          style={{
            ...shapeStyle,
            backgroundColor: styles.stroke || styles.fill || '#3b82f6',
            border: 'none', // Lines don't have borders
          }}
        />
      );

    default:
      // Fallback for unknown shapes
      return <div style={shapeStyle} />;
  }
};

export default ShapeLayerContent;
