/**
 * Composition Serializer - CompositionDefinition → Remotion Code
 * 
 * Single Source of Truth Architecture:
 * - CompositionDefinition is the single source of truth
 * - AI generates CompositionDefinition directly
 * - serializeToRemotionCode generates code for export/rendering
 */

import type {
  CompositionDefinition,
  CompositionLayer,
  LayerTransform,
  TextLayerProperties,
  ShapeLayerProperties,
  SolidLayerProperties,
  ImageLayerProperties,
} from '../types/composition';
import type { PropertyKeyframes, InterpolationType } from '../types/keyframes';
import { secondsToFrames } from './time-conversion';

// ============================================================
// TYPES
// ============================================================

interface AnimatedProperty {
  varName: string;
  propertyPath: string;
  keyframes: PropertyKeyframes;
  defaultValue: number;
}

// ============================================================
// EASING MAPPING
// ============================================================

/**
 * Map our interpolation types to Remotion Easing functions
 */
function getRemotionEasing(type: InterpolationType): string {
  switch (type) {
    case 'linear':
      return 'Easing.linear';
    case 'ease-in':
    case 'ease-in-quad':
      return 'Easing.in(Easing.quad)';
    case 'ease-out':
    case 'ease-out-quad':
      return 'Easing.out(Easing.quad)';
    case 'ease-in-out':
    case 'ease-in-out-quad':
      return 'Easing.inOut(Easing.quad)';
    case 'ease':
      return 'Easing.bezier(0.25, 0.1, 0.25, 1)';
    case 'ease-in-cubic':
      return 'Easing.in(Easing.cubic)';
    case 'ease-out-cubic':
      return 'Easing.out(Easing.cubic)';
    case 'ease-in-out-cubic':
      return 'Easing.inOut(Easing.cubic)';
    case 'ease-in-quart':
      return 'Easing.in(Easing.poly(4))';
    case 'ease-out-quart':
      return 'Easing.out(Easing.poly(4))';
    case 'ease-in-out-quart':
      return 'Easing.inOut(Easing.poly(4))';
    case 'ease-in-expo':
      return 'Easing.in(Easing.exp)';
    case 'ease-out-expo':
      return 'Easing.out(Easing.exp)';
    case 'ease-in-out-expo':
      return 'Easing.inOut(Easing.exp)';
    case 'ease-in-back':
      return 'Easing.in(Easing.back(1.7))';
    case 'ease-out-back':
      return 'Easing.out(Easing.back(1.7))';
    case 'ease-in-out-back':
      return 'Easing.inOut(Easing.back(1.7))';
    case 'ease-out-bounce':
      return 'Easing.out(Easing.bounce)';
    case 'ease-in-elastic':
      return 'Easing.in(Easing.elastic(1))';
    case 'ease-out-elastic':
      return 'Easing.out(Easing.elastic(1))';
    case 'ease-in-out-elastic':
      return 'Easing.inOut(Easing.elastic(1))';
    case 'bezier':
      // For custom bezier, fall back to linear - would need handle data
      return 'Easing.linear';
    case 'hold':
      // Hold uses step interpolation
      return 'Easing.step0';
    default:
      return 'Easing.linear';
  }
}

// ============================================================
// KEYFRAME ANIMATION GENERATION
// ============================================================

/**
 * Generate interpolation code for a single animated property
 */
function generatePropertyAnimation(
  animProp: AnimatedProperty,
  fps: number,
  layerStartFrame: number
): string {
  const { varName, keyframes, defaultValue } = animProp;
  const kfs = keyframes.keyframes;
  
  if (kfs.length === 0) {
    return `const ${varName} = ${defaultValue};`;
  }
  
  if (kfs.length === 1) {
    const value = typeof kfs[0].value === 'number' ? kfs[0].value : defaultValue;
    return `const ${varName} = ${value};`;
  }
  
  // Convert keyframe times from seconds to frames (relative to layer start)
  const frameValues = kfs.map(kf => {
    const frameTime = secondsToFrames(kf.time, fps);
    const value = typeof kf.value === 'number' ? kf.value : defaultValue;
    return { frame: frameTime, value };
  });
  
  // Build input/output arrays
  const inputFrames = frameValues.map(fv => fv.frame);
  const outputValues = frameValues.map(fv => fv.value);
  
  // Get easing from first keyframe (simplified - ideally per-segment)
  const easing = getRemotionEasing(kfs[0].interpolation?.type || 'linear');
  
  // Generate interpolate call
  // We use (frame - layerStartFrame) to make animation relative to layer start
  return `const ${varName} = interpolate(
    frame - ${layerStartFrame},
    [${inputFrames.join(', ')}],
    [${outputValues.join(', ')}],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ${easing} }
  );`;
}

/**
 * Extract animated properties from a layer's keyframes
 */
function extractAnimatedProperties(layer: CompositionLayer): AnimatedProperty[] {
  if (!layer.keyframes || layer.keyframes.length === 0) {
    return [];
  }
  
  const animatedProps: AnimatedProperty[] = [];
  const transform = layer.transform;
  
  // Map property paths to default values
  const propertyDefaults: Record<string, number> = {
    'transform.x': transform.x,
    'transform.y': transform.y,
    'transform.scaleX': transform.scaleX,
    'transform.scaleY': transform.scaleY,
    'transform.rotation': transform.rotation,
    'transform.opacity': transform.opacity,
    'transform.anchorX': transform.anchorX,
    'transform.anchorY': transform.anchorY,
  };
  
  // Map property paths to variable names
  const propertyVarNames: Record<string, string> = {
    'transform.x': 'animX',
    'transform.y': 'animY',
    'transform.scaleX': 'animScaleX',
    'transform.scaleY': 'animScaleY',
    'transform.rotation': 'animRotation',
    'transform.opacity': 'animOpacity',
    'transform.anchorX': 'animAnchorX',
    'transform.anchorY': 'animAnchorY',
  };
  
  for (const propKf of layer.keyframes) {
    if (!propKf.enabled || propKf.keyframes.length === 0) {
      continue;
    }
    
    const varName = propertyVarNames[propKf.propertyPath];
    const defaultValue = propertyDefaults[propKf.propertyPath];
    
    if (varName !== undefined && defaultValue !== undefined) {
      animatedProps.push({
        varName,
        propertyPath: propKf.propertyPath,
        keyframes: propKf,
        defaultValue,
      });
    }
  }
  
  return animatedProps;
}

/**
 * Check if a layer has any animations
 */
function hasAnimations(layer: CompositionLayer): boolean {
  return extractAnimatedProperties(layer).length > 0;
}

// ============================================================
// COMPOSITION → REMOTION CODE (PRIMARY)
// ============================================================

/**
 * Serialize a CompositionDefinition to Remotion JSX code
 * 
 * This is the PRIMARY function for code generation.
 * It generates remotionCode from the CompositionDefinition for:
 * - Video export/rendering
 * - Preview fallback for non-CompositionRenderer contexts
 * 
 * The generated code is compatible with Remotion and can be compiled by Babel.
 */
export function serializeToRemotionCode(composition: CompositionDefinition): string {
  const { width, height, backgroundColor, layers, fps } = composition;
  
  // Sort layers by their array index (first = top, renders last)
  const sortedLayers = [...layers].filter(l => l.visible).reverse();
  
  // Generate layer JSX with animations
  const layerCode = sortedLayers.map((layer, index) => {
    return generateLayerCode(layer, index, fps);
  }).join('\n\n  ');
  
  // Generate the full component
  const code = `const { useCurrentFrame, interpolate, Sequence, Easing } = require('remotion');

const Component = () => {
  const frame = useCurrentFrame();
  
  return (
    <div style={{
      width: ${width},
      height: ${height},
      backgroundColor: '${backgroundColor || 'transparent'}',
      position: 'relative',
      overflow: 'hidden',
    }}>
      ${layerCode}
    </div>
  );
};

module.exports = { Component };`;
  
  return code.trim();
}

/**
 * Generate code for a single layer (including animations if present)
 */
function generateLayerCode(layer: CompositionLayer, index: number, fps: number): string {
  const animatedProps = extractAnimatedProperties(layer);
  const hasAnims = animatedProps.length > 0;
  
  // Generate Sequence wrapper for layer timing
  const sequenceStart = `<Sequence from={${layer.startTime}} durationInFrames={${layer.duration}} layout="none">`;
  const sequenceEnd = '</Sequence>';
  
  if (hasAnims) {
    // Layer with animations - wrap in a function component for hooks
    const animationCode = animatedProps
      .map(prop => generatePropertyAnimation(prop, fps, layer.startTime))
      .join('\n      ');
    
    const elementJsx = layerToJsx(layer, animatedProps);
    
    return `{/* Layer: ${layer.name} */}
      ${sequenceStart}
        {(() => {
          ${animationCode}
          
          return ${elementJsx};
        })()}
      ${sequenceEnd}`;
  } else {
    // Static layer - no animations
    const elementJsx = layerToJsx(layer, []);
    
    return `{/* Layer: ${layer.name} */}
      ${sequenceStart}
        ${elementJsx}
      ${sequenceEnd}`;
  }
}

/**
 * Convert a layer to JSX string
 */
function layerToJsx(layer: CompositionLayer, animatedProps: AnimatedProperty[]): string {
  const { type } = layer;
  
  switch (type) {
    case 'text':
      return textLayerToJsx(layer, animatedProps);
    case 'shape':
      return shapeLayerToJsx(layer, animatedProps);
    case 'solid':
      return solidLayerToJsx(layer, animatedProps);
    case 'image':
      return imageLayerToJsx(layer, animatedProps);
    default:
      return '<div />';
  }
}

/**
 * Build transform style with animated values substituted
 */
function buildTransformStyle(transform: LayerTransform, animatedProps: AnimatedProperty[]): string {
  // Create a map of animated property paths to their variable names
  const animMap = new Map<string, string>();
  for (const ap of animatedProps) {
    animMap.set(ap.propertyPath, ap.varName);
  }
  
  // Get value or animated variable reference
  const getVal = (path: string, staticValue: number) => {
    const varName = animMap.get(path);
    return varName ? varName : staticValue;
  };
  
  const x = getVal('transform.x', transform.x);
  const y = getVal('transform.y', transform.y);
  const scaleX = getVal('transform.scaleX', transform.scaleX);
  const scaleY = getVal('transform.scaleY', transform.scaleY);
  const rotation = getVal('transform.rotation', transform.rotation);
  const opacity = getVal('transform.opacity', transform.opacity);
  const anchorX = getVal('transform.anchorX', transform.anchorX);
  const anchorY = getVal('transform.anchorY', transform.anchorY);
  
  // If any values are animated (variable names), use template literals
  const hasAnimatedVars = animatedProps.length > 0;
  
  if (hasAnimatedVars) {
    return `{
          position: 'absolute',
          left: ${x},
          top: ${y},
          transform: \`rotate(\${${rotation}}deg) scale(\${${scaleX}}, \${${scaleY}})\`,
          transformOrigin: \`\${${anchorX} * 100}% \${${anchorY} * 100}%\`,
          opacity: ${opacity},
        }`;
  } else {
    return `{
          position: 'absolute',
          left: ${transform.x},
          top: ${transform.y},
          transform: 'rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})',
          transformOrigin: '${transform.anchorX * 100}% ${transform.anchorY * 100}%',
          opacity: ${transform.opacity},
        }`;
  }
}

/**
 * Convert text layer to JSX
 */
function textLayerToJsx(layer: CompositionLayer, animatedProps: AnimatedProperty[]): string {
  const props = layer.layerProperties.properties as TextLayerProperties;
  const baseStyle = buildTransformStyle(layer.transform, animatedProps);
  
  // Escape text content for JSX
  const escapedText = (props.text || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  
  const style = `Object.assign(${baseStyle}, {
          fontFamily: '${props.fontFamily || 'Inter, system-ui, sans-serif'}',
          fontSize: ${props.fontSize || 48},
          fontWeight: ${props.fontWeight || 600},
          lineHeight: ${props.lineHeight || 1.2},
          letterSpacing: ${props.letterSpacing || 0},
          color: '${props.color || '#FFFFFF'}',
          textAlign: '${props.textAlign || 'center'}',
          whiteSpace: 'pre-wrap',
          ${props.backgroundColor ? `backgroundColor: '${props.backgroundColor}',` : ''}
          ${props.padding ? `padding: ${props.padding},` : ''}
          ${props.borderRadius ? `borderRadius: ${props.borderRadius},` : ''}
        })`;
  
  return `<div style={${style}}>${escapedText}</div>`;
}

/**
 * Convert shape layer to JSX
 */
function shapeLayerToJsx(layer: CompositionLayer, animatedProps: AnimatedProperty[]): string {
  const props = layer.layerProperties.properties as ShapeLayerProperties;
  const baseStyle = buildTransformStyle(layer.transform, animatedProps);
  
  const borderRadius = props.shapeType === 'ellipse' ? "'50%'" : (props.cornerRadius || 0);
  
  const style = `Object.assign(${baseStyle}, {
          width: ${props.width || 100},
          height: ${props.height || 100},
          backgroundColor: '${props.fillColor || '#3B82F6'}',
          ${props.fillOpacity !== undefined ? `opacity: ${props.fillOpacity},` : ''}
          borderRadius: ${borderRadius},
          ${props.strokeColor && props.strokeWidth ? `border: '${props.strokeWidth}px solid ${props.strokeColor}',` : ''}
          boxSizing: 'border-box',
        })`;
  
  return `<div style={${style}} />`;
}

/**
 * Convert solid layer to JSX
 */
function solidLayerToJsx(layer: CompositionLayer, animatedProps: AnimatedProperty[]): string {
  const props = layer.layerProperties.properties as SolidLayerProperties;
  const baseStyle = buildTransformStyle(layer.transform, animatedProps);
  
  const style = `Object.assign(${baseStyle}, {
          width: ${props.width || 100},
          height: ${props.height || 100},
          backgroundColor: '${props.color || '#000000'}',
          ${props.borderRadius ? `borderRadius: ${props.borderRadius},` : ''}
        })`;
  
  return `<div style={${style}} />`;
}

/**
 * Convert image layer to JSX
 */
function imageLayerToJsx(layer: CompositionLayer, animatedProps: AnimatedProperty[]): string {
  const props = layer.layerProperties.properties as ImageLayerProperties;
  const baseStyle = buildTransformStyle(layer.transform, animatedProps);
  
  const style = `Object.assign(${baseStyle}, {
          width: ${props.width || 100},
          height: ${props.height || 100},
          objectFit: '${props.objectFit || 'cover'}',
          ${props.borderRadius ? `borderRadius: ${props.borderRadius},` : ''}
        })`;
  
  return `<img src="${props.src || ''}" alt="" style={${style}} />`;
}

export default {
  serializeToRemotionCode,
};
