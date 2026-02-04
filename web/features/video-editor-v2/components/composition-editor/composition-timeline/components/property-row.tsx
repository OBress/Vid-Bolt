/**
 * PropertyRow - Single property row in the After Effects timeline
 * 
 * Shows:
 * - Stopwatch icon to enable/disable keyframing
 * - Property name with value
 * - Keyframe navigation (< >) buttons
 * - Keyframe track on the right side
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '../../../../utils/general/utils';
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Diamond,
} from 'lucide-react';
import { AE_COLORS, PROPERTY_ROW_HEIGHT, LAYER_LIST_WIDTH, CONTROLS_WIDTH } from '../constants';
import type { CompositionLayer, LayerTransform } from '../../../../types/composition';
import type { PropertyKeyframes } from '../../../../types/keyframes';

interface PropertyRowProps {
  layer: CompositionLayer;
  propertyPath: string;
  propertyName: string;
  depth: number; // Indentation level
  fps: number;
  currentFrame: number;
  onToggleKeyframing: (layerId: string, propertyPath: string, enabled: boolean) => void;
  onAddKeyframe: (layerId: string, propertyPath: string, frame: number, value: any) => void;
  onJumpToKeyframe: (direction: 'prev' | 'next') => void;
  isSelected?: boolean;
  alternateRow?: boolean;
}

// Helper to get property value from layer
function getPropertyValue(layer: CompositionLayer, propertyPath: string): any {
  const parts = propertyPath.split('.');
  let value: any = layer;
  
  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }
  
  return value;
}

// Format value for display
function formatValue(value: any, propertyPath: string): string {
  if (value === undefined || value === null) return '—';
  
  if (typeof value === 'number') {
    // Check for percentages
    if (propertyPath.includes('opacity') || 
        propertyPath.includes('scale') || 
        propertyPath.includes('anchor')) {
      return `${(value * 100).toFixed(1)}%`;
    }
    // Check for rotation
    if (propertyPath.includes('rotation')) {
      return `${value.toFixed(1)}°`;
    }
    // Position/dimension
    return value.toFixed(1);
  }
  
  return String(value);
}

export const PropertyRow = React.memo<PropertyRowProps>(({
  layer,
  propertyPath,
  propertyName,
  depth,
  fps,
  currentFrame,
  onToggleKeyframing,
  onAddKeyframe,
  onJumpToKeyframe,
  isSelected = false,
  alternateRow = false,
}) => {
  // Get the property keyframes
  const propertyKeyframes = useMemo(() => {
    return layer.keyframes?.find(pk => pk.propertyPath === propertyPath);
  }, [layer.keyframes, propertyPath]);
  
  // Check if keyframing is enabled
  const isKeyframed = propertyKeyframes?.enabled ?? false;
  const hasKeyframes = (propertyKeyframes?.keyframes?.length ?? 0) > 0;
  
  // Get current value
  const currentValue = getPropertyValue(layer, propertyPath);
  
  // Check if current frame has a keyframe
  const currentTime = currentFrame / fps;
  const hasKeyframeAtCurrentFrame = useMemo(() => {
    if (!propertyKeyframes?.keyframes) return false;
    const layerTime = (currentFrame - layer.startTime) / fps;
    return propertyKeyframes.keyframes.some(kf => 
      Math.abs(kf.time - layerTime) < 0.001
    );
  }, [propertyKeyframes, currentFrame, layer.startTime, fps]);
  
  // Find previous/next keyframe
  const { hasPrev, hasNext } = useMemo(() => {
    if (!propertyKeyframes?.keyframes || propertyKeyframes.keyframes.length === 0) {
      return { hasPrev: false, hasNext: false };
    }
    
    const layerTime = (currentFrame - layer.startTime) / fps;
    const prev = propertyKeyframes.keyframes.filter(kf => kf.time < layerTime - 0.001);
    const next = propertyKeyframes.keyframes.filter(kf => kf.time > layerTime + 0.001);
    
    return {
      hasPrev: prev.length > 0,
      hasNext: next.length > 0,
    };
  }, [propertyKeyframes, currentFrame, layer.startTime, fps]);
  
  // Handle stopwatch click
  const handleStopwatchClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isKeyframed) {
      // Enable keyframing and add first keyframe at current frame
      onToggleKeyframing(layer.id, propertyPath, true);
      onAddKeyframe(layer.id, propertyPath, currentFrame, currentValue);
    } else {
      // Disable keyframing (will remove all keyframes)
      onToggleKeyframing(layer.id, propertyPath, false);
    }
  }, [layer.id, propertyPath, isKeyframed, currentFrame, currentValue, onToggleKeyframing, onAddKeyframe]);
  
  // Handle add keyframe button click
  const handleAddKeyframe = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasKeyframeAtCurrentFrame) {
      onAddKeyframe(layer.id, propertyPath, currentFrame, currentValue);
    }
  }, [layer.id, propertyPath, currentFrame, currentValue, hasKeyframeAtCurrentFrame, onAddKeyframe]);
  
  const indentPx = 16 + depth * 12; // Increased base indent for better hierarchy
  
  return (
    <div
      className={cn(
        "flex items-center border-b",
        isSelected 
          ? "bg-[#2d4560]" 
          : alternateRow 
            ? "bg-[#383838] hover:bg-[#3e3e3e]"
            : "bg-[#303030] hover:bg-[#363636]"
      )}
      style={{
        height: PROPERTY_ROW_HEIGHT,
        borderColor: '#0f0f0f',
      }}
    >
      {/* Left side - Property info */}
      <div 
        className="flex items-center shrink-0"
        style={{ width: LAYER_LIST_WIDTH }}
      >
        {/* Indent spacer */}
        <div style={{ width: indentPx }} />
        
        {/* Stopwatch */}
        <button
          onClick={handleStopwatchClick}
          className={cn(
            "w-5 h-5 flex items-center justify-center transition-colors rounded",
            isKeyframed 
              ? "text-[#f9a825] hover:text-[#ffc107] hover:bg-white/5" 
              : "text-[#888] hover:text-[#bbb] hover:bg-white/5"
          )}
          title={isKeyframed ? "Remove keyframes" : "Add keyframe"}
        >
          <Clock className="w-3.5 h-3.5" strokeWidth={isKeyframed ? 2.5 : 1.5} />
        </button>
        
        {/* Property name */}
        <span 
          className="ml-1 text-[11px] flex-1 truncate font-medium"
          style={{ color: AE_COLORS.textPrimary }}
        >
          {propertyName}
        </span>
        
        {/* Value display */}
        <span 
          className="mr-2 text-[10px] font-mono font-semibold"
          style={{ color: AE_COLORS.textPrimary }}
        >
          {formatValue(currentValue, propertyPath)}
        </span>
      </div>
      
      {/* Controls area */}
      <div 
        className="flex items-center justify-center gap-0.5 shrink-0 border-r"
        style={{ 
          width: CONTROLS_WIDTH,
          borderColor: AE_COLORS.bgDark,
        }}
      >
        {/* Previous keyframe */}
        <button
          onClick={() => hasPrev && onJumpToKeyframe('prev')}
          disabled={!hasPrev}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded transition-colors",
            hasPrev 
              ? "text-[#b8b8b8] hover:text-white hover:bg-[#3a3a3a]" 
              : "text-[#555] cursor-not-allowed"
          )}
          title="Previous keyframe"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        
        {/* Add/indicator keyframe */}
        <button
          onClick={handleAddKeyframe}
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded transition-all",
            hasKeyframeAtCurrentFrame 
              ? "text-[#f9a825]" 
              : isKeyframed 
                ? "text-[#888] hover:text-[#f9a825] hover:bg-[#3a3a3a]"
                : "text-[#555] cursor-not-allowed"
          )}
          disabled={!isKeyframed}
          title={hasKeyframeAtCurrentFrame ? "Keyframe at current time" : "Add keyframe"}
        >
          <Diamond 
            className="w-3 h-3" 
            fill={hasKeyframeAtCurrentFrame ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
        </button>
        
        {/* Next keyframe */}
        <button
          onClick={() => hasNext && onJumpToKeyframe('next')}
          disabled={!hasNext}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded transition-colors",
            hasNext 
              ? "text-[#b8b8b8] hover:text-white hover:bg-[#3a3a3a]" 
              : "text-[#555] cursor-not-allowed"
          )}
          title="Next keyframe"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

export default PropertyRow;
