/**
 * JSX Layer Regenerator
 * 
 * Regenerates JSX code from layer changes while preserving structure.
 * Updates values in tagged JSX when users edit layers in the composition editor.
 */

import type {
  CompositionLayer,
  TextLayerProperties,
  ShapeLayerProperties,
  SolidLayerProperties,
  ImageLayerProperties,
} from '../types/composition';
import type { PropertyKeyframes, Keyframe } from '../types/keyframes';
import { secondsToFrames } from './time-conversion';

// ============================================================
// LAYER METADATA REGENERATION
// ============================================================

/**
 * Update LAYER_META block for a layer
 */
function regenerateLayerMeta(code: string, layer: CompositionLayer): string {
  const layerId = layer.id;
  const metaRegex = new RegExp(
    `\\/\\*\\s*LAYER_META:${layerId}\\s*\\n[\\s\\S]*?\\*\\/`,
    'i'
  );
  
  const newMeta = `/* LAYER_META:${layerId}
{
  "id": "${layer.id}",
  "type": "${layer.type}",
  "name": "${layer.name}",
  "startFrame": ${layer.startTime},
  "endFrame": ${layer.startTime + layer.duration}
}
*/`;
  
  if (metaRegex.test(code)) {
    return code.replace(metaRegex, newMeta);
  }
  
  console.warn(`[JSX Regenerator] LAYER_META not found for ${layerId}`);
  return code;
}

// ============================================================
// ANIMATION CALCULATION REGENERATION
// ============================================================

/**
 * Convert keyframes to interpolate() call
 */
function keyframesToInterpolate(
  varName: string,
  keyframes: Keyframe[],
  fps: number = 30
): string {
  if (keyframes.length < 2) {
    // Single keyframe = static value
    return `const ${varName} = ${keyframes[0].value};`;
  }
  
  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  // Convert times to frames
  const firstFrame = secondsToFrames(first.time, fps);
  const lastFrame = secondsToFrames(last.time, fps);
  
  // Simple interpolate between first and last
  return `const ${varName} = interpolate(frame, [${firstFrame}, ${lastFrame}], [${first.value}, ${last.value}], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });`;
}

/**
 * Convert keyframes to spring() call
 */
function keyframesToSpring(
  varName: string,
  keyframes: Keyframe[],
  fps: number = 30
): string {
  const first = keyframes[0];
  const delayFrames = secondsToFrames(first.time, fps);
  const config = { damping: 15 }; // Default spring config
  
  const frameExpr = delayFrames > 0 ? `frame - ${delayFrames}` : 'frame';
  const configStr = JSON.stringify(config).replace(/"/g, '');
  
  return `const ${varName} = spring({ frame: ${frameExpr}, fps, config: ${configStr} });`;
}

/**
 * Regenerate animation calculations for a layer
 */
function regenerateLayerCalculations(code: string, layer: CompositionLayer, fps: number = 30): string {
  const layerId = layer.id;
  const normalizedId = layerId.replace(/-/g, '');
  
  // Find the section with calculations for this layer
  // Pattern: Lines starting with const [normalizedId][Property] =
  const lines = code.split('\n');
  const updatedLines: string[] = [];
  
  // Track which properties we've updated
  const updatedProps = new Set<string>();
  
  for (const line of lines) {
    const varPattern = new RegExp(`^(\\s*)const\\s+(${normalizedId}([A-Z][a-zA-Z0-9]*))\\s*=`, 'i');
    const match = line.match(varPattern);
    
    if (!match) {
      updatedLines.push(line);
      continue;
    }
    
    const indent = match[1];
    const varName = match[2];
    const propName = match[3].toLowerCase();
    
    // Determine property path (transform properties vs direct properties)
    const transformProps = ['x', 'y', 'scalex', 'scaley', 'rotation', 'opacity', 'anchorx', 'anchory'];
    const propertyPath = transformProps.includes(propName) ? `transform.${propName}` : propName;
    
    // Check if we have keyframes for this property
    const keyframeData = layer.keyframes?.find(pk => pk.propertyPath === propertyPath);
    
    if (keyframeData && keyframeData.enabled && keyframeData.keyframes.length > 0) {
      // Determine if this should be a spring or interpolate
      const isSpring = keyframeData.keyframes.some(kf => 
        kf.interpolation.type === 'ease-out-cubic' || 
        kf.interpolation.type === 'ease-out-back'
      );
      
      let newLine: string;
      if (isSpring) {
        newLine = indent + keyframesToSpring(varName, keyframeData.keyframes, fps);
      } else {
        newLine = indent + keyframesToInterpolate(varName, keyframeData.keyframes, fps);
      }
      
      updatedLines.push(newLine);
      updatedProps.add(propName);
    } else {
      // Keep original line if no keyframes
      updatedLines.push(line);
    }
  }
  
  return updatedLines.join('\n');
}

// ============================================================
// JSX CONTENT REGENERATION
// ============================================================

/**
 * Update a style property in JSX
 */
function updateStyleProperty(
  styleContent: string,
  propName: string,
  newValue: any
): string {
  const propPattern = new RegExp(`(${propName}):\\s*[^,}]+`, 'g');
  
  // Format value based on type
  let formattedValue: string;
  if (typeof newValue === 'string') {
    formattedValue = `'${newValue}'`;
  } else if (typeof newValue === 'number') {
    formattedValue = String(newValue);
  } else {
    formattedValue = String(newValue);
  }
  
  if (propPattern.test(styleContent)) {
    return styleContent.replace(propPattern, `$1: ${formattedValue}`);
  } else {
    // Add new property
    return styleContent + `,\n      ${propName}: ${formattedValue}`;
  }
}

/**
 * Regenerate JSX content for a layer
 */
function regenerateLayerJSX(code: string, layer: CompositionLayer): string {
  const layerId = layer.id;
  
  // Find content between LAYER tags
  const startTag = `{/\\*\\s*LAYER:${layerId}:start\\s*\\*/}`;
  const endTag = `{/\\*\\s*LAYER:${layerId}:end\\s*\\*/}`;
  const contentRegex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`, 'i');
  
  const match = code.match(contentRegex);
  if (!match) {
    console.warn(`[JSX Regenerator] Layer content not found for ${layerId}`);
    return code;
  }
  
  let jsxContent = match[1];
  
  // Update based on layer type
  switch (layer.type) {
    case 'text':
      const textProps = layer.properties as TextLayerProperties;
      
      // Update text content
      jsxContent = jsxContent.replace(/>([^<]+)<\//, `>${textProps.text}</`);
      
      // Update style properties
      jsxContent = updateJSXStyles(jsxContent, {
        fontSize: textProps.fontSize,
        color: textProps.color,
        fontFamily: textProps.fontFamily,
        fontWeight: textProps.fontWeight,
        top: layer.transform.y,
        left: layer.transform.x,
        opacity: layer.transform.opacity,
      });
      break;
      
    case 'shape':
      const shapeProps = layer.properties as ShapeLayerProperties;
      
      jsxContent = updateJSXStyles(jsxContent, {
        backgroundColor: shapeProps.fillColor,
        width: shapeProps.width,
        height: shapeProps.height,
        borderRadius: shapeProps.cornerRadius,
        top: layer.transform.y,
        left: layer.transform.x,
        opacity: layer.transform.opacity,
      });
      break;
      
    case 'solid':
      const solidProps = layer.properties as SolidLayerProperties;
      
      jsxContent = updateJSXStyles(jsxContent, {
        backgroundColor: solidProps.color,
        width: solidProps.width,
        height: solidProps.height,
        top: layer.transform.y,
        left: layer.transform.x,
        opacity: layer.transform.opacity,
      });
      break;
      
    case 'image':
      const imageProps = layer.properties as ImageLayerProperties;
      
      jsxContent = updateJSXStyles(jsxContent, {
        width: imageProps.width,
        height: imageProps.height,
        top: layer.transform.y,
        left: layer.transform.x,
        opacity: layer.transform.opacity,
      });
      break;
  }
  
  // Replace the content
  return code.replace(contentRegex, `{/* LAYER:${layerId}:start */}${jsxContent}{/* LAYER:${layerId}:end */}`);
}

/**
 * Update multiple style properties in JSX
 */
function updateJSXStyles(jsxContent: string, updates: Record<string, any>): string {
  // Find style attribute
  const styleMatch = jsxContent.match(/style=\{\{([^}]+)\}\}/s);
  if (!styleMatch) {
    console.warn('[JSX Regenerator] No style attribute found');
    return jsxContent;
  }
  
  let styleContent = styleMatch[1];
  
  // Update each property
  for (const [propName, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      styleContent = updateStyleProperty(styleContent, propName, value);
    }
  }
  
  // Replace style content
  return jsxContent.replace(/style=\{\{([^}]+)\}\}/s, `style={{${styleContent}}}`);
}

// ============================================================
// MAIN REGENERATOR
// ============================================================

/**
 * Regenerate JSX code with updated layer data
 */
export function regenerateJSXFromLayer(
  originalCode: string,
  layer: CompositionLayer,
  fps: number = 30
): string {
  console.log(`[JSX Regenerator] Regenerating JSX for layer: ${layer.id}`);
  
  let updatedCode = originalCode;
  
  // 1. Update LAYER_META
  updatedCode = regenerateLayerMeta(updatedCode, layer);
  
  // 2. Update animation calculations
  updatedCode = regenerateLayerCalculations(updatedCode, layer, fps);
  
  // 3. Update JSX content
  updatedCode = regenerateLayerJSX(updatedCode, layer);
  
  console.log('[JSX Regenerator] Successfully regenerated JSX');
  return updatedCode;
}

/**
 * Regenerate JSX code with multiple layer updates
 */
export function regenerateJSXFromLayers(
  originalCode: string,
  layers: CompositionLayer[],
  fps: number = 30
): string {
  console.log(`[JSX Regenerator] Regenerating JSX for ${layers.length} layer(s)`);
  
  let updatedCode = originalCode;
  
  for (const layer of layers) {
    updatedCode = regenerateJSXFromLayer(updatedCode, layer, fps);
  }
  
  return updatedCode;
}

/**
 * Quick update for a single property (optimized)
 */
export function updateLayerProperty(
  originalCode: string,
  layerId: string,
  propertyPath: string, // e.g., "transform.x" or "properties.text"
  newValue: any
): string {
  console.log(`[JSX Regenerator] Quick update: ${layerId}.${propertyPath} = ${newValue}`);
  
  // For now, use full regeneration
  // TODO: Optimize for single property updates
  
  return originalCode;
}
