/**
 * CompositionRenderer - Remotion Component for Rendering Composition Layers
 * 
 * Renders all visible layers in the composition at the current frame.
 * Supports text, shapes, images, solids, and video layers.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, Sequence } from "remotion";
import type {
  CompositionDefinition,
  CompositionLayer,
  TextLayerProperties,
  ShapeLayerProperties,
  SolidLayerProperties,
  ImageLayerProperties,
  LayerTransform,
} from "../../../types/composition";
import { getLayerEndFrame } from "../../../types/composition";
import { getInterpolatedValue } from "../../../utils/keyframe-interpolator";
import { framesToSeconds } from "../../../utils/time-conversion";

// ==========================================
// TYPES
// ==========================================

interface CompositionRendererProps {
  composition: CompositionDefinition;
}

interface LayerRendererProps {
  layer: CompositionLayer;
  compositionWidth: number;
  compositionHeight: number;
  currentTime: number;
  fps: number;
  zIndex?: number;
}

interface LayerRendererWithTimingProps {
  layer: CompositionLayer;
  compositionWidth: number;
  compositionHeight: number;
  fps: number;
  zIndex?: number;
}

// ==========================================
// LAYER TRANSFORM STYLE
// ==========================================

/**
 * Get transform style for layers with known dimensions (shapes, solids, images)
 */
function getTransformStyle(transform: LayerTransform, width: number, height: number, zIndex?: number): React.CSSProperties {
  const anchorOffsetX = width * transform.anchorX;
  const anchorOffsetY = height * transform.anchorY;

  return {
    position: 'absolute',
    left: transform.x - anchorOffsetX,
    top: transform.y - anchorOffsetY,
    transform: `
      rotate(${transform.rotation}deg)
      scale(${transform.scaleX}, ${transform.scaleY})
    `.trim(),
    transformOrigin: `${transform.anchorX * 100}% ${transform.anchorY * 100}%`,
    opacity: transform.opacity,
    zIndex: zIndex ?? 'auto',
  };
}

/**
 * Get transform style for auto-sized layers (text)
 * Uses CSS translate() to handle anchor-based positioning
 */
function getAutoSizeTransformStyle(transform: LayerTransform, zIndex?: number): React.CSSProperties {
  // For auto-sized elements, use translate to handle anchor positioning
  // anchor (0.5, 0.5) means center, so translate(-50%, -50%)
  // anchor (0, 0) means top-left, so translate(0, 0)
  // anchor (1, 1) means bottom-right, so translate(-100%, -100%)
  const translateX = -transform.anchorX * 100;
  const translateY = -transform.anchorY * 100;

  return {
    position: 'absolute',
    left: transform.x,
    top: transform.y,
    transform: `
      translate(${translateX}%, ${translateY}%)
      rotate(${transform.rotation}deg)
      scale(${transform.scaleX}, ${transform.scaleY})
    `.trim(),
    transformOrigin: `${transform.anchorX * 100}% ${transform.anchorY * 100}%`,
    opacity: transform.opacity,
    zIndex: zIndex ?? 'auto',
  };
}

// ==========================================
// TEXT LAYER RENDERER
// ==========================================

const TextLayerRenderer = React.memo<{
  properties: TextLayerProperties;
  transform: LayerTransform;
  zIndex?: number;
}>(({ properties, transform, zIndex }) => {
  // Use auto-size transform for text (handles anchor-based centering via CSS translate)
  const style: React.CSSProperties = {
    ...getAutoSizeTransformStyle(transform, zIndex),
    fontFamily: properties?.fontFamily || 'Inter, system-ui, sans-serif',
    fontSize: properties?.fontSize || 48,
    fontWeight: properties?.fontWeight || 600,
    lineHeight: properties?.lineHeight || 1.2,
    letterSpacing: properties?.letterSpacing || 0,
    color: properties?.color || '#FFFFFF',
    textAlign: properties?.textAlign || 'center',
    whiteSpace: 'pre-wrap',
    padding: properties?.padding || 0,
    borderRadius: properties?.borderRadius || 0,
    backgroundColor: properties?.backgroundColor || 'transparent',
  };

  // Add text shadow if specified
  if (properties?.shadow) {
    style.textShadow = `${properties.shadow.offsetX}px ${properties.shadow.offsetY}px ${properties.shadow.blur}px ${properties.shadow.color}`;
  }

  // Add stroke if specified
  if (properties?.stroke) {
    style.WebkitTextStroke = `${properties.stroke.width}px ${properties.stroke.color}`;
  }

  return (
    <div style={style}>
      {properties?.text || 'No text'}
    </div>
  );
});

// ==========================================
// SHAPE LAYER RENDERER
// ==========================================

const ShapeLayerRenderer = React.memo<{
  properties: ShapeLayerProperties;
  transform: LayerTransform;
  zIndex?: number;
}>(({ properties, transform, zIndex }) => {
  const style: React.CSSProperties = {
    ...getTransformStyle(transform, properties?.width || 100, properties?.height || 100, zIndex),
    width: properties?.width || 100,
    height: properties?.height || 100,
    backgroundColor: properties?.fillColor || '#3B82F6',
    opacity: properties?.fillOpacity ?? 1,
    borderRadius: properties?.shapeType === 'ellipse' 
      ? '50%' 
      : properties?.cornerRadius || 0,
    boxSizing: 'border-box',
  };

  if (properties?.strokeColor && properties?.strokeWidth) {
    style.border = `${properties.strokeWidth}px solid ${properties.strokeColor}`;
  }

  // Handle different shape types
  if (properties?.shapeType === 'polygon' || properties?.shapeType === 'star') {
    // For polygons and stars, we'd use SVG in the future
    // For now, just render as a rectangle
    return <div style={style} />;
  }

  return <div style={style} />;
});

// ==========================================
// SOLID LAYER RENDERER
// ==========================================

const SolidLayerRenderer = React.memo<{
  properties: SolidLayerProperties;
  transform: LayerTransform;
  zIndex?: number;
}>(({ properties, transform, zIndex }) => {
  const style: React.CSSProperties = {
    ...getTransformStyle(transform, properties?.width || 100, properties?.height || 100, zIndex),
    width: properties?.width || 100,
    height: properties?.height || 100,
    backgroundColor: properties?.color || '#000000',
    borderRadius: properties?.borderRadius || 0,
  };

  return <div style={style} />;
});

// ==========================================
// IMAGE LAYER RENDERER
// ==========================================

const ImageLayerRenderer = React.memo<{
  properties: ImageLayerProperties;
  transform: LayerTransform;
  zIndex?: number;
}>(({ properties, transform, zIndex }) => {
  const style: React.CSSProperties = {
    ...getTransformStyle(transform, properties.width, properties.height, zIndex),
    width: properties.width,
    height: properties.height,
    objectFit: properties.objectFit,
    borderRadius: properties.borderRadius || 0,
  };

  return (
    <img
      src={properties.src}
      alt=""
      style={style}
    />
  );
});

// ==========================================
// LAYER RENDERER
// ==========================================

const LayerRenderer = React.memo<LayerRendererProps>(({
  layer,
  compositionWidth,
  compositionHeight,
  currentTime,
  fps,
  zIndex,
}) => {
  const { type, transform, layerProperties } = layer;

  // Compute animated transform by interpolating keyframes
  const animatedTransform = useMemo((): LayerTransform => {
    if (!layer.keyframes || layer.keyframes.length === 0) {
      return transform;
    }
    
    const animated = { ...transform };
    
    // Apply keyframed values for each transform property
    const transformKeys: (keyof LayerTransform)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'anchorX', 'anchorY'];
    
    transformKeys.forEach(key => {
      const propertyPath = `transform.${key}`;
      const propertyKeyframes = layer.keyframes?.find(pk => pk.propertyPath === propertyPath && pk.enabled);
      
      if (propertyKeyframes && propertyKeyframes.keyframes.length > 0) {
        const interpolatedValue = getInterpolatedValue(propertyKeyframes, currentTime, transform[key]);
        if (typeof interpolatedValue === 'number') {
          animated[key] = interpolatedValue;
        }
      }
    });
    
    return animated;
  }, [layer.keyframes, transform, currentTime]);

  // Get the actual properties to render
  const properties = layerProperties?.properties || layerProperties;

  switch (type) {
    case 'text':
      return (
        <TextLayerRenderer
          properties={properties as TextLayerProperties}
          transform={animatedTransform}
          zIndex={zIndex}
        />
      );

    case 'shape':
      return (
        <ShapeLayerRenderer
          properties={properties as ShapeLayerProperties}
          transform={animatedTransform}
          zIndex={zIndex}
        />
      );

    case 'solid':
      return (
        <SolidLayerRenderer
          properties={properties as SolidLayerProperties}
          transform={animatedTransform}
          zIndex={zIndex}
        />
      );

    case 'image':
      return (
        <ImageLayerRenderer
          properties={properties as ImageLayerProperties}
          transform={animatedTransform}
          zIndex={zIndex}
        />
      );

    case 'null':
    case 'adjustment':
      // Null and adjustment layers don't render anything directly
      return null;

    default:
      return null;
  }
});

// ==========================================
// LAYER RENDERER WITH TIMING (uses inner frame from Sequence)
// ==========================================

/**
 * Wrapper that uses useCurrentFrame() inside the Sequence
 * to get the correct relative frame for keyframe interpolation.
 * 
 * Inside a Sequence, useCurrentFrame() returns the frame relative
 * to the Sequence's `from` prop, which is what we need for layer-relative
 * keyframe times.
 */
const LayerRendererWithTiming = React.memo<LayerRendererWithTimingProps>(({
  layer,
  compositionWidth,
  compositionHeight,
  fps,
  zIndex,
}) => {
  // This gets the frame RELATIVE to the Sequence's start (layer.startTime)
  const relativeFrame = useCurrentFrame();
  const currentTime = framesToSeconds(relativeFrame, fps);
  
  return (
    <LayerRenderer
      layer={layer}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      currentTime={currentTime}
      fps={fps}
      zIndex={zIndex}
    />
  );
});

// ==========================================
// MAIN RENDERER
// ==========================================

export const CompositionRenderer: React.FC<CompositionRendererProps> = ({
  composition,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Safety check: If no composition, show empty state
  if (!composition) {
    return (
      <div style={{
        width: width || 1920,
        height: height || 1080,
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: 16,
        fontFamily: 'system-ui, sans-serif',
      }}>
        No composition loaded
      </div>
    );
  }

  // Filter and sort layers for rendering
  const visibleLayers = useMemo(() => {
    const hasSoloedLayers = composition.layers.some(l => l.solo);
    
    return composition.layers
      .filter(layer => {
        // Check visibility
        if (!layer.visible) return false;
        
        // Check solo
        if (hasSoloedLayers && !layer.solo) return false;
        
        // Check if layer is active at current frame
        const endFrame = getLayerEndFrame(layer);
        return frame >= layer.startTime && frame < endFrame;
      });
      // Note: DO NOT reverse - layers should render in array order
      // First layer (index 0) renders first (behind), last layer renders on top
      // This matches video editing conventions where lower tracks are behind
  }, [composition.layers, frame]);

  // Use composition dimensions
  const renderWidth = composition.width || width;
  const renderHeight = composition.height || height;

  // CompositionRenderer ALWAYS renders from layers
  // JSX rendering is handled by PreviewRenderer/DynamicComposition
  // This ensures layer edits are visible in the preview
  
  return (
    <div
      style={{
        width: renderWidth,
        height: renderHeight,
        backgroundColor: composition.backgroundColor || 'transparent',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {visibleLayers.map((layer, index) => (
        <Sequence
          key={layer.id}
          from={layer.startTime}
          durationInFrames={layer.duration}
          layout="none"
        >
          <LayerRendererWithTiming
            layer={layer}
            compositionWidth={renderWidth}
            compositionHeight={renderHeight}
            fps={fps}
            zIndex={index}
          />
        </Sequence>
      ))}
    </div>
  );
};

export default CompositionRenderer;
