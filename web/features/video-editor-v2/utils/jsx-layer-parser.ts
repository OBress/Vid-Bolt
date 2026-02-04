/**
 * JSX Layer Parser
 * 
 * Parses comment-tagged JSX code to extract layer definitions.
 * Converts AI-generated JSX with LAYER_META and LAYER boundary tags
 * into editable layer structures with properties and keyframes.
 */

import type {
  CompositionLayer,
  LayerType,
  TextLayerProperties,
  ShapeLayerProperties,
  SolidLayerProperties,
  ImageLayerProperties,
  LayerTransform,
} from '../types/composition';
import type { PropertyKeyframes, Keyframe, KeyframeInterpolation } from '../types/keyframes';
import { generateKeyframeId } from '../types/keyframes';
import { framesToSeconds } from './time-conversion';

// ============================================================
// TYPES
// ============================================================

interface LayerMetadata {
  id: string;
  type: LayerType;
  name: string;
  startFrame: number;
  endFrame: number;
}

interface ParsedLayer {
  metadata: LayerMetadata;
  calculations: string; // The animation calculation code
  jsxContent: string; // The JSX between LAYER tags
}

interface AnimationCalculation {
  variable: string; // e.g., "text1Opacity"
  property: string; // e.g., "opacity"
  type: 'interpolate' | 'spring' | 'static';
  keyframes?: Keyframe[];
  value?: any; // For static values
}

// ============================================================
// LAYER METADATA EXTRACTION
// ============================================================

/**
 * Extract all LAYER_META blocks from JSX code
 */
function extractLayerMetadata(code: string): Map<string, LayerMetadata> {
  const layers = new Map<string, LayerMetadata>();
  
  // Match /* LAYER_META:id {...} */
  const metaRegex = /\/\*\s*LAYER_META:([a-z0-9-]+)\s*\n([\s\S]*?)\*\//gi;
  
  let match;
  while ((match = metaRegex.exec(code)) !== null) {
    const layerId = match[1];
    const jsonStr = match[2].trim();
    
    try {
      const metadata = JSON.parse(jsonStr) as LayerMetadata;
      
      // Validate required fields
      if (metadata.id && metadata.type && metadata.name !== undefined) {
        layers.set(layerId, metadata);
      } else {
        console.warn(`[JSX Parser] Invalid LAYER_META for ${layerId}:`, metadata);
      }
    } catch (error) {
      console.error(`[JSX Parser] Failed to parse LAYER_META for ${layerId}:`, error);
    }
  }
  
  return layers;
}

// ============================================================
// LAYER CONTENT EXTRACTION
// ============================================================

/**
 * Extract JSX content between LAYER boundary tags
 */
function extractLayerContent(code: string, layerId: string): string | null {
  // Match {/* LAYER:id:start */} ... {/* LAYER:id:end */}
  const startTag = `{\\/\\*\\s*LAYER:${layerId}:start\\s*\\*\\/}`;
  const endTag = `{\\/\\*\\s*LAYER:${layerId}:end\\s*\\*\\/}`;
  const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`, 'i');
  
  console.log(`[JSX Parser] Looking for LAYER tags for: ${layerId}`);
  
  const match = code.match(regex);
  if (match && match[1]) {
    console.log(`[JSX Parser]   Found JSX content, length: ${match[1].length}`);
    return match[1].trim();
  }
  
  console.warn(`[JSX Parser]   LAYER boundary tags not found for: ${layerId}`);
  return null;
}

/**
 * Extract animation calculations for a specific layer
 * Looks for variables named like: layerIdProperty (e.g., text1Opacity, shape2X)
 */
function extractLayerCalculations(code: string, layerId: string): string {
  const lines: string[] = [];
  
  // Normalize layer ID for variable matching (remove hyphens)
  const normalizedId = layerId.replace(/-/g, '');
  
  console.log(`[JSX Parser] Extracting calculations for layer: ${layerId} (normalized: ${normalizedId})`);
  
  // Find all lines that define variables for this layer
  // Pattern: const [normalizedId][Property] =
  const varPattern = new RegExp(`^\\s*const\\s+${normalizedId}[A-Z][a-zA-Z0-9]*\\s*=`, 'i');
  
  const codeLines = code.split('\n');
  for (const line of codeLines) {
    if (varPattern.test(line)) {
      lines.push(line.trim());
      console.log(`[JSX Parser]   Found calculation:`, line.trim().substring(0, 80));
    }
  }
  
  console.log(`[JSX Parser] Found ${lines.length} calculation(s) for ${layerId}`);
  return lines.join('\n');
}

// ============================================================
// ANIMATION PARSING
// ============================================================

/**
 * Parse an interpolate() call to extract keyframes
 * Example: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })
 */
function parseInterpolate(expression: string, fps: number = 30): Keyframe[] | null {
  // Match interpolate(frame, [start, end], [fromValue, toValue], options)
  const pattern = /interpolate\s*\(\s*frame\s*,\s*\[([^\]]+)\]\s*,\s*\[([^\]]+)\]/;
  const match = expression.match(pattern);
  
  if (!match) return null;
  
  try {
    const frames = match[1].split(',').map(s => parseFloat(s.trim()));
    const values = match[2].split(',').map(s => parseFloat(s.trim()));
    
    if (frames.length !== 2 || values.length !== 2) return null;
    
    const interpolation: KeyframeInterpolation = { type: 'linear' };
    
    return [
      {
        id: generateKeyframeId(),
        time: framesToSeconds(frames[0], fps),
        value: values[0],
        interpolation,
      },
      {
        id: generateKeyframeId(),
        time: framesToSeconds(frames[1], fps),
        value: values[1],
        interpolation,
      },
    ];
  } catch (error) {
    console.warn('[JSX Parser] Failed to parse interpolate:', error);
    return null;
  }
}

/**
 * Parse a spring() call to extract keyframe with spring physics
 * Example: spring({ frame, fps, config: { damping: 15 } })
 */
function parseSpring(expression: string, fps: number = 30): Keyframe[] | null {
  // Match spring({ frame: frame - delay, fps, config: {...} })
  const frameMatch = expression.match(/frame:\s*frame\s*-\s*(\d+)/);
  const delay = frameMatch ? parseInt(frameMatch[1], 10) : 0;
  
  // Extract spring config if present
  const configMatch = expression.match(/config:\s*\{([^}]+)\}/);
  let config = undefined;
  
  if (configMatch) {
    try {
      // Parse config object
      const configStr = `{${configMatch[1]}}`;
      config = eval(`(${configStr})`);
    } catch (error) {
      console.warn('[JSX Parser] Failed to parse spring config:', error);
    }
  }
  
  // Spring animations go from 0 to 1 over a natural duration
  const interpolation: KeyframeInterpolation = {
    type: 'ease-out-cubic', // Approximate spring with cubic easing
  };
  
  return [
    {
      id: generateKeyframeId(),
      time: framesToSeconds(delay, fps),
      value: 0,
      interpolation,
    },
    {
      id: generateKeyframeId(),
      time: framesToSeconds(delay + 60, fps), // 2 second duration
      value: 1,
      interpolation,
    },
  ];
}

/**
 * Parse animation calculations into keyframes array
 */
function parseAnimationCalculations(calculations: string, layerId: string, fps: number = 30): PropertyKeyframes[] {
  const keyframesArray: PropertyKeyframes[] = [];
  const normalizedId = layerId.replace(/-/g, '');
  
  const lines = calculations.split('\n');
  
  for (const line of lines) {
    // Extract variable name and expression
    // const text1Opacity = interpolate(...);
    const match = line.match(/const\s+([a-zA-Z0-9]+)\s*=\s*(.+);?$/);
    if (!match) continue;
    
    const varName = match[1];
    const expression = match[2].trim();
    
    // Extract property name from variable (text1Opacity -> opacity, text1X -> x)
    const propMatch = varName.match(new RegExp(`^${normalizedId}([A-Z][a-zA-Z0-9]*)$`, 'i'));
    if (!propMatch) continue;
    
    const propName = propMatch[1].toLowerCase();
    
    // Determine property path (transform properties vs direct properties)
    const transformProps = ['x', 'y', 'scalex', 'scaley', 'rotation', 'opacity', 'anchorx', 'anchory'];
    const propertyPath = transformProps.includes(propName) ? `transform.${propName}` : propName;
    
    // Check if it's an interpolate call
    if (expression.includes('interpolate(')) {
      const interpolateKeyframes = parseInterpolate(expression, fps);
      if (interpolateKeyframes) {
        keyframesArray.push({
          propertyPath,
          enabled: true,
          keyframes: interpolateKeyframes,
        });
      }
    }
    // Check if it's a spring call
    else if (expression.includes('spring(')) {
      const springKeyframes = parseSpring(expression, fps);
      if (springKeyframes) {
        keyframesArray.push({
          propertyPath,
          enabled: true,
          keyframes: springKeyframes,
        });
      }
    }
    // Static value
    else {
      // Try to parse as number
      const numValue = parseFloat(expression);
      if (!isNaN(numValue)) {
        const interpolation: KeyframeInterpolation = { type: 'linear' };
        keyframesArray.push({
          propertyPath,
          enabled: false, // Static values don't need keyframing
          keyframes: [
            {
              id: generateKeyframeId(),
              time: 0,
              value: numValue,
              interpolation,
            },
          ],
        });
      }
    }
  }
  
  return keyframesArray;
}

// ============================================================
// JSX STYLE PARSING
// ============================================================

/**
 * Parse inline styles from JSX to extract static properties
 */
function parseJSXStyles(jsxContent: string): Partial<LayerTransform> & Record<string, any> {
  const properties: any = {};
  
  // Extract style attribute: style={{...}}
  const styleMatch = jsxContent.match(/style=\{\{([^}]+)\}\}/s);
  if (!styleMatch) return properties;
  
  const styleContent = styleMatch[1];
  
  // Parse individual style properties
  const propMatches = styleContent.matchAll(/([a-zA-Z]+):\s*([^,}]+)/g);
  
  for (const match of propMatches) {
    const propName = match[1].trim();
    let value = match[2].trim();
    
    // Remove quotes from strings
    value = value.replace(/^['"]|['"]$/g, '');
    
    // Parse common properties
    switch (propName) {
      case 'top':
      case 'left':
      case 'width':
      case 'height':
      case 'fontSize':
        properties[propName] = parseFloat(value) || value;
        break;
      case 'color':
      case 'backgroundColor':
      case 'fontFamily':
      case 'fontWeight':
        properties[propName] = value;
        break;
      case 'position':
        // Skip position: absolute
        break;
      default:
        properties[propName] = value;
    }
  }
  
  return properties;
}

/**
 * Extract text content from JSX
 */
function extractTextContent(jsxContent: string): string {
  // Match content between tags: <div...>Content</div>
  const match = jsxContent.match(/>([^<]+)</);
  return match ? match[1].trim() : '';
}

// ============================================================
// LAYER BUILDER
// ============================================================

/**
 * Build a CompositionLayer from parsed data
 */
function buildLayer(
  parsed: ParsedLayer,
  calculations: string,
  index: number,
  fps: number = 30
): CompositionLayer | null {
  const { metadata, jsxContent } = parsed;
  
  // Parse styles and animations
  const styles = parseJSXStyles(jsxContent);
  const keyframesArray = parseAnimationCalculations(calculations, metadata.id, fps);
  
  // Build base layer
  const baseLayer: Partial<CompositionLayer> = {
    id: metadata.id,
    type: metadata.type,
    name: metadata.name,
    startTime: metadata.startFrame,
    duration: metadata.endFrame - metadata.startFrame,
    visible: true,
    locked: false,
    solo: false,
    zIndex: index,
  };
  
  // Build transform
  const transform: LayerTransform = {
    x: styles.left ?? 0,
    y: styles.top ?? 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    anchorX: 0,
    anchorY: 0,
  };
  
  // Build layer-specific properties
  let layerProperties: any;
  
  switch (metadata.type) {
    case 'text':
      const text = extractTextContent(jsxContent);
      layerProperties = {
        text,
        fontSize: styles.fontSize ?? 24,
        fontFamily: styles.fontFamily ?? 'Inter, sans-serif',
        fontWeight: styles.fontWeight ?? 'normal',
        color: styles.color ?? '#ffffff',
        textAlign: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      } as TextLayerProperties;
      break;
      
    case 'shape':
      layerProperties = {
        shapeType: 'rectangle',
        fillColor: styles.backgroundColor ?? '#ffffff',
        strokeColor: null,
        strokeWidth: 0,
        width: styles.width ?? 100,
        height: styles.height ?? 100,
        cornerRadius: styles.borderRadius ?? 0,
      } as ShapeLayerProperties;
      break;
      
    case 'solid':
      layerProperties = {
        color: styles.backgroundColor ?? '#000000',
        width: styles.width ?? 100,
        height: styles.height ?? 100,
      } as SolidLayerProperties;
      break;
      
    case 'image':
      layerProperties = {
        src: '', // TODO: Extract from Img component
        width: styles.width ?? 100,
        height: styles.height ?? 100,
        objectFit: 'cover',
      } as ImageLayerProperties;
      break;
      
    default:
      console.warn(`[JSX Parser] Unknown layer type: ${metadata.type}`);
      return null;
  }
  
  return {
    ...baseLayer,
    transform,
    keyframes: keyframesArray,
    layerProperties: {
      type: metadata.type,
      properties: layerProperties,
    },
  } as CompositionLayer;
}

// ============================================================
// MAIN PARSER
// ============================================================

/**
 * Parse tagged JSX code into composition layers
 */
export function parseTaggedJSX(code: string, fps: number = 30): CompositionLayer[] {
  console.log('[JSX Parser] Parsing tagged JSX with fps:', fps);
  
  // Extract all layer metadata
  const layerMetadata = extractLayerMetadata(code);
  console.log(`[JSX Parser] Found ${layerMetadata.size} layer(s)`);
  
  if (layerMetadata.size === 0) {
    console.warn('[JSX Parser] No LAYER_META tags found in code');
    return [];
  }
  
  const layers: CompositionLayer[] = [];
  let index = 0;
  
  // Process each layer
  for (const [layerId, metadata] of layerMetadata.entries()) {
    // Extract JSX content
    const jsxContent = extractLayerContent(code, layerId);
    if (!jsxContent) {
      console.warn(`[JSX Parser] No JSX content found for layer: ${layerId}`);
      continue;
    }
    
    // Extract animation calculations
    const calculations = extractLayerCalculations(code, layerId);
    
    const parsed: ParsedLayer = {
      metadata,
      calculations,
      jsxContent,
    };
    
    // Build layer
    const layer = buildLayer(parsed, calculations, index++, fps);
    if (layer) {
      layers.push(layer);
      console.log(`[JSX Parser] Parsed layer: ${layer.name} (${layer.type})`, {
        keyframeCount: layer.keyframes?.length || 0,
        keyframes: layer.keyframes?.map(kf => ({
          path: kf.propertyPath,
          enabled: kf.enabled,
          keyframeCount: kf.keyframes.length,
        })) || [],
        calculations: parsed.calculations,
      });
    }
  }
  
  console.log(`[JSX Parser] Successfully parsed ${layers.length} layer(s)`);
  return layers;
}

/**
 * Check if JSX code has layer tags
 */
export function hasLayerTags(code: string): boolean {
  return /\/\*\s*LAYER_META:/i.test(code) && /{\s*\/\*\s*LAYER:[^:]+:start\s*\*\/\s*}/i.test(code);
}
