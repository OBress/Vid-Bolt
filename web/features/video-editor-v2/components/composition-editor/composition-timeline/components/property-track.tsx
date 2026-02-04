/**
 * PropertyTrack - Timeline track for a single animatable property
 * 
 * Shows keyframes as diamonds that can be selected, dragged, and edited.
 * This is the right-side track area for a property row.
 */

import React, { useMemo } from 'react';
import { AE_COLORS, PROPERTY_ROW_HEIGHT } from '../constants';
import { KeyframeDiamond } from './keyframe-diamond';
import type { PropertyKeyframes } from '../../../../types/keyframes';

interface PropertyTrackProps {
  layerId: string;
  propertyPath: string;
  propertyKeyframes: PropertyKeyframes | undefined;
  layerStartTime: number; // In frames
  layerDuration: number; // In frames
  pixelsPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  fps: number;
  compositionDuration?: number; // For duration gradient
  selectedKeyframeIds: Set<string>;
  onSelectKeyframe: (keyframeId: string, addToSelection: boolean) => void;
  onDragKeyframe: (keyframeId: string, newTime: number) => void;
  onDeleteKeyframe?: (keyframeId: string) => void;
  onSetKeyframeEasing?: (keyframeId: string, easing: string) => void;
}

export const PropertyTrack = React.memo<PropertyTrackProps>(({
  layerId,
  propertyPath,
  propertyKeyframes,
  layerStartTime,
  layerDuration,
  pixelsPerFrame,
  scrollLeft,
  viewportWidth,
  fps,
  compositionDuration,
  selectedKeyframeIds,
  onSelectKeyframe,
  onDragKeyframe,
  onDeleteKeyframe,
  onSetKeyframeEasing,
}) => {
  // Calculate layer bar position (relative to layer start, not composition)
  const layerStartX = layerStartTime * pixelsPerFrame - scrollLeft;
  const layerWidth = layerDuration * pixelsPerFrame;
  
  // Get visible keyframes (filtered and clamped)
  const visibleKeyframes = useMemo(() => {
    if (!propertyKeyframes?.keyframes) return [];
    
    // Filter to visible range and clamp to layer duration
    const startFrame = scrollLeft / pixelsPerFrame;
    const endFrame = (scrollLeft + viewportWidth) / pixelsPerFrame;
    const layerEndFrame = layerStartTime + layerDuration;
    
    return propertyKeyframes.keyframes.filter(kf => {
      // Keyframe time is in seconds relative to layer start
      const keyframeTimeInSeconds = kf.time;
      const keyframeFrame = keyframeTimeInSeconds * fps;
      
      // Keyframe should be within layer duration (in seconds)
      const layerDurationInSeconds = layerDuration / fps;
      if (keyframeTimeInSeconds < 0 || keyframeTimeInSeconds > layerDurationInSeconds) {
        return false; // Skip keyframes outside layer duration
      }
      
      // Check if visible in viewport
      const absoluteFrame = layerStartTime + keyframeFrame;
      return absoluteFrame >= startFrame - 10 && absoluteFrame <= endFrame + 10;
    });
  }, [propertyKeyframes, scrollLeft, viewportWidth, pixelsPerFrame, layerStartTime, layerDuration, fps]);
  
  return (
    <div
      className="relative"
      style={{
        height: PROPERTY_ROW_HEIGHT,
      }}
    >
      {/* Layer extent indicator (subtle background) */}
      {layerStartX + layerWidth > 0 && layerStartX < viewportWidth && (
        <div
          className="absolute top-1 bottom-1 opacity-20"
          style={{
            left: Math.max(0, layerStartX),
            width: Math.min(layerWidth, viewportWidth - layerStartX),
            backgroundColor: AE_COLORS.bgLight,
            borderRadius: 2,
          }}
        />
      )}
      
      {/* Keyframes */}
      {visibleKeyframes.map((keyframe) => {
        // Keyframe.time is in SECONDS relative to layer start
        // Convert to frames, add layer start time, convert to pixels
        const keyframeRelativeFrames = keyframe.time * fps;
        const keyframeAbsoluteFrame = layerStartTime + keyframeRelativeFrames;
        const x = keyframeAbsoluteFrame * pixelsPerFrame - scrollLeft;
        
        return (
          <div
            key={keyframe.id}
            className="absolute"
            style={{ 
              left: x,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
            }}
          >
            <KeyframeDiamond
              keyframe={keyframe}
              layerId={layerId}
              propertyPath={propertyPath}
              pixelsPerFrame={pixelsPerFrame}
              fps={fps}
              isSelected={selectedKeyframeIds.has(keyframe.id)}
              onSelect={onSelectKeyframe}
              onDrag={onDragKeyframe}
              onDelete={onDeleteKeyframe}
              onSetEasing={onSetKeyframeEasing}
            />
          </div>
        );
      })}
    </div>
  );
});

export default PropertyTrack;
