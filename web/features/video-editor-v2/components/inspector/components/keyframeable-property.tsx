/**
 * KeyframeableProperty Component
 * 
 * Wraps an inspector property input to add keyframe animation controls:
 * - Stopwatch icon to enable/disable keyframing
 * - Diamond icon when keyframes exist
 * - Previous/Next keyframe navigation
 * - Add keyframe at current time button
 * - Shows interpolated value at current frame
 * 
 * Usage:
 * ```tsx
 * <KeyframeableProperty
 *   clipId={clipId}
 *   propertyPath="transform.x"
 *   label="Position X"
 *   value={currentValue}
 *   onChange={handleValueChange}
 * >
 *   <Input type="number" value={currentValue} onChange={...} />
 * </KeyframeableProperty>
 * ```
 */

import React, { useCallback, useMemo } from 'react';
import { 
  Clock, 
  Diamond, 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '../../../utils/general/utils';
import { useVideoEditorStore } from '../../../stores/video-editor-store';
import type { PropertyKeyframes, KeyframeValue, KeyframeInterpolation } from '../../../types/keyframes';
import { 
  getInterpolatedValue,
  getNearestKeyframeTime,
  hasKeyframeAtTime,
} from '../../../utils/keyframe-interpolator';
import { STANDARD_ANIMATABLE_PROPERTIES, DEFAULT_INTERPOLATION } from '../../../types/keyframes';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { Button } from '../../ui/button';

// ==========================================
// TYPES
// ==========================================

interface KeyframeablePropertyProps {
  /** Clip ID */
  clipId: string;
  /** Property path (e.g., "transform.x") */
  propertyPath: string;
  /** Display label */
  label: string;
  /** Current static value (used when not animated) */
  value: KeyframeValue;
  /** Callback when value changes */
  onChange?: (value: KeyframeValue) => void;
  /** Current playback time in seconds (relative to clip start) */
  currentTime: number;
  /** Clip duration in seconds */
  clipDuration: number;
  /** Children (the actual input component) */
  children: React.ReactNode;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Custom class name */
  className?: string;
  /** Whether property is disabled */
  disabled?: boolean;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get property metadata
 */
function getPropertyMetadata(propertyPath: string) {
  return STANDARD_ANIMATABLE_PROPERTIES.find(p => p.path === propertyPath);
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const KeyframeableProperty: React.FC<KeyframeablePropertyProps> = ({
  clipId,
  propertyPath,
  label,
  value,
  onChange,
  currentTime,
  clipDuration,
  children,
  showLabel = true,
  className,
  disabled = false,
}) => {
  const {
    clips,
    addKeyframe,
    updateKeyframe,
    deleteKeyframe,
    togglePropertyAnimation,
    getPropertyKeyframes,
    setCurrentTime,
    playback,
    keyframeSelection,
  } = useVideoEditorStore();
  
  // Get the clip's keyframes for this property
  const propertyKeyframes = useMemo(() => {
    return getPropertyKeyframes(clipId, propertyPath);
  }, [clipId, propertyPath, clips]); // Need clips dependency to re-compute when keyframes change
  
  // Check if keyframing is enabled
  const isAnimated = propertyKeyframes?.enabled && (propertyKeyframes?.keyframes.length ?? 0) > 0;
  const hasKeyframes = (propertyKeyframes?.keyframes.length ?? 0) > 0;
  const isEnabled = propertyKeyframes?.enabled ?? false;
  
  // Check if there's a keyframe at current time
  const hasKeyframeAtCurrentTime = useMemo(() => {
    if (!propertyKeyframes) return false;
    return hasKeyframeAtTime(propertyKeyframes, currentTime);
  }, [propertyKeyframes, currentTime]);
  
  // Get interpolated value at current time
  const interpolatedValue = useMemo(() => {
    if (!isAnimated) return value;
    return getInterpolatedValue(propertyKeyframes, currentTime, value);
  }, [isAnimated, propertyKeyframes, currentTime, value]);
  
  // Get previous/next keyframe times
  const prevKeyframeTime = useMemo(() => {
    return getNearestKeyframeTime(propertyKeyframes, currentTime, 'before');
  }, [propertyKeyframes, currentTime]);
  
  const nextKeyframeTime = useMemo(() => {
    return getNearestKeyframeTime(propertyKeyframes, currentTime, 'after');
  }, [propertyKeyframes, currentTime]);
  
  // Get property color
  const propertyColor = useMemo(() => {
    const meta = getPropertyMetadata(propertyPath);
    return meta?.color ?? '#6B7280';
  }, [propertyPath]);
  
  // Handle toggle animation (stopwatch click)
  const handleToggleAnimation = useCallback(() => {
    if (disabled) return;
    togglePropertyAnimation(clipId, propertyPath, value);
  }, [clipId, propertyPath, value, disabled, togglePropertyAnimation]);
  
  // Handle add keyframe
  const handleAddKeyframe = useCallback(() => {
    if (disabled) return;
    
    // Use the current input value or interpolated value
    const keyframeValue = isAnimated ? interpolatedValue : value;
    addKeyframe(clipId, propertyPath, currentTime, keyframeValue);
  }, [clipId, propertyPath, currentTime, value, interpolatedValue, isAnimated, disabled, addKeyframe]);
  
  // Handle delete keyframe at current time
  const handleDeleteKeyframe = useCallback(() => {
    if (disabled || !propertyKeyframes) return;
    
    const kfAtTime = propertyKeyframes.keyframes.find(
      kf => Math.abs(kf.time - currentTime) < 0.001
    );
    if (kfAtTime) {
      deleteKeyframe(clipId, propertyPath, kfAtTime.id);
    }
  }, [clipId, propertyPath, currentTime, propertyKeyframes, disabled, deleteKeyframe]);
  
  // Handle navigate to previous keyframe
  const handlePrevKeyframe = useCallback(() => {
    if (prevKeyframeTime === null) return;
    
    // Get the clip to find its start time
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    
    // Set current time to previous keyframe (convert to global time)
    setCurrentTime(clip.startTime + prevKeyframeTime);
  }, [prevKeyframeTime, clipId, clips, setCurrentTime]);
  
  // Handle navigate to next keyframe
  const handleNextKeyframe = useCallback(() => {
    if (nextKeyframeTime === null) return;
    
    // Get the clip to find its start time
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    
    // Set current time to next keyframe (convert to global time)
    setCurrentTime(clip.startTime + nextKeyframeTime);
  }, [nextKeyframeTime, clipId, clips, setCurrentTime]);
  
  // Get selected keyframes for this property from the store
  const selectedKeyframeIds = useMemo(() => {
    if (!keyframeSelection) return [];
    if (keyframeSelection.clipId !== clipId) return [];
    if (keyframeSelection.propertyPath !== propertyPath) return [];
    return keyframeSelection.keyframeIds || [];
  }, [keyframeSelection, clipId, propertyPath]);
  
  // Handle value change (PREMIERE PRO BEHAVIOR: update selected keyframe if any)
  const handleValueChange = useCallback((newValue: KeyframeValue) => {
    if (isAnimated) {
      // If there are selected keyframes for this property, update them
      if (selectedKeyframeIds.length > 0) {
        selectedKeyframeIds.forEach(kfId => {
          updateKeyframe(clipId, propertyPath, kfId, { value: newValue });
        });
      } else {
        // No selection - add/update keyframe at current time
        addKeyframe(clipId, propertyPath, currentTime, newValue);
      }
    }
    
    // Always call parent onChange
    onChange?.(newValue);
  }, [isAnimated, clipId, propertyPath, currentTime, onChange, addKeyframe, updateKeyframe, selectedKeyframeIds]);
  
  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", className)}>
        {/* Stopwatch / Diamond button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-5 w-5 p-0 flex-shrink-0",
                isEnabled ? "text-primary" : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              onClick={handleToggleAnimation}
              disabled={disabled}
            >
              {hasKeyframes ? (
                <Diamond 
                  className="h-3 w-3" 
                  style={{ color: isEnabled ? propertyColor : undefined }}
                  fill={isEnabled ? propertyColor : 'none'}
                />
              ) : (
                <Clock className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {hasKeyframes 
              ? (isEnabled ? 'Disable keyframe animation' : 'Enable keyframe animation')
              : 'Enable keyframe animation'}
          </TooltipContent>
        </Tooltip>
        
        {/* Label */}
        {showLabel && (
          <span className="text-xs text-muted-foreground min-w-[60px] flex-shrink-0">
            {label}
          </span>
        )}
        
        {/* Input area */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
        
        {/* Keyframe controls - only show when animated */}
        {isAnimated && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Previous keyframe */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5 p-0",
                    prevKeyframeTime === null && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={handlePrevKeyframe}
                  disabled={prevKeyframeTime === null || disabled}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Go to previous keyframe
              </TooltipContent>
            </Tooltip>
            
            {/* Add/Delete keyframe at current time */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5 p-0",
                    hasKeyframeAtCurrentTime ? "text-destructive" : "text-primary"
                  )}
                  onClick={hasKeyframeAtCurrentTime ? handleDeleteKeyframe : handleAddKeyframe}
                  disabled={disabled}
                >
                  {hasKeyframeAtCurrentTime ? (
                    <Diamond 
                      className="h-3 w-3" 
                      fill={propertyColor}
                      style={{ color: propertyColor }}
                    />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {hasKeyframeAtCurrentTime ? 'Delete keyframe' : 'Add keyframe'}
              </TooltipContent>
            </Tooltip>
            
            {/* Next keyframe */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5 p-0",
                    nextKeyframeTime === null && "opacity-50 cursor-not-allowed"
                  )}
                  onClick={handleNextKeyframe}
                  disabled={nextKeyframeTime === null || disabled}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Go to next keyframe
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

// ==========================================
// KEYFRAME VALUE DISPLAY
// ==========================================

interface KeyframeValueDisplayProps {
  value: KeyframeValue;
  unit?: string;
  precision?: number;
}

/**
 * Display a keyframe value with appropriate formatting
 */
export const KeyframeValueDisplay: React.FC<KeyframeValueDisplayProps> = ({
  value,
  unit = '',
  precision = 1,
}) => {
  const formatted = useMemo(() => {
    if (typeof value === 'number') {
      return value.toFixed(precision) + unit;
    }
    if (Array.isArray(value)) {
      return value.map(v => v.toFixed(precision)).join(', ');
    }
    return String(value);
  }, [value, unit, precision]);
  
  return <span className="font-mono text-xs">{formatted}</span>;
};

export default KeyframeableProperty;
