/**
 * CompositionTimeline - After Effects Style Timeline
 * 
 * Professional layer timeline with:
 * - Expandable layers with property groups
 * - Inline keyframe editing
 * - Property stopwatches for animation control
 * - Graph editor toggle
 * - Work area bar
 * - Professional AE visual design
 */

import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { cn } from '../../../utils/general/utils';
import { useCompositionEditorStore, selectHasSoloedLayers } from '../../../stores/composition-editor-store';
import type { CompositionLayer } from '../../../types/composition';
import { getLayerTypeColor } from '../../../types/composition';
import type { PropertyKeyframes } from '../../../types/keyframes';
import {
  Plus,
  Type,
  Square,
  Palette,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  BarChart2,
  Repeat,
} from 'lucide-react';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';

// Import components
import { 
  LayerRow,
  LayerTrack,
  PropertyRow,
  PropertyTrack,
  KeyframeDiamond,
  GraphEditor,
  SnapIndicator,
} from './components';
import {
  AE_COLORS,
  LAYER_LIST_WIDTH,
  CONTROLS_WIDTH,
  TRACK_HEIGHT,
  PROPERTY_ROW_HEIGHT,
  RULER_HEIGHT,
  TOOLBAR_HEIGHT,
  NAVIGATOR_HEIGHT,
  MIN_PIXELS_PER_FRAME,
  MAX_PIXELS_PER_FRAME,
  DEFAULT_PIXELS_PER_FRAME,
  PROPERTY_GROUPS,
  PROPERTY_SHORTCUTS,
} from './constants';

// ==========================================
// TIME FORMATTING
// ==========================================

function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = frame / fps;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor(frame % fps);
  return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatTimeShort(frame: number, fps: number): string {
  const seconds = frame / fps;
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${Math.floor(seconds)}s`;
}

// ==========================================
// TIMELINE RULER
// ==========================================

interface TimelineRulerProps {
  duration: number;
  fps: number;
  pixelsPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  currentFrame: number;
  workAreaStart?: number;
  workAreaEnd?: number;
  onSeek: (frame: number) => void;
  onWorkAreaChange?: (start: number | undefined, end: number | undefined) => void;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  duration,
  fps,
  pixelsPerFrame,
  scrollLeft,
  viewportWidth,
  currentFrame,
  workAreaStart,
  workAreaEnd,
  onSeek,
  onWorkAreaChange,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [workAreaDrag, setWorkAreaDrag] = useState<'start' | 'end' | 'middle' | null>(null);
  const workAreaDragRef = useRef({ startX: 0, origStart: 0, origEnd: 0 });
  
  const frameToX = useCallback((frame: number) => {
    return frame * pixelsPerFrame - scrollLeft;
  }, [pixelsPerFrame, scrollLeft]);
  
  const xToFrame = useCallback((x: number) => {
    const frame = Math.round((x + scrollLeft) / pixelsPerFrame);
    return Math.max(0, Math.min(duration - 1, frame));
  }, [pixelsPerFrame, scrollLeft, duration]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    
    // Check if clicking on work area handles
    const target = e.target as HTMLElement;
    if (target.dataset.workArea) {
      const type = target.dataset.workArea as 'start' | 'end' | 'middle';
      setWorkAreaDrag(type);
      workAreaDragRef.current = {
        startX: e.clientX,
        origStart: workAreaStart ?? 0,
        origEnd: workAreaEnd ?? duration,
      };
      
      // Set cursor
      document.body.style.cursor = type === 'middle' ? 'grabbing' : 'ew-resize';
      
      const handleMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - workAreaDragRef.current.startX;
        const deltaFrames = Math.round(deltaX / pixelsPerFrame);
        const { origStart, origEnd } = workAreaDragRef.current;
        
        if (type === 'start') {
          const newStart = Math.max(0, Math.min(origEnd - fps, origStart + deltaFrames));
          onWorkAreaChange?.(newStart, origEnd);
        } else if (type === 'end') {
          const newEnd = Math.min(duration, Math.max(origStart + fps, origEnd + deltaFrames));
          onWorkAreaChange?.(origStart, newEnd);
        } else if (type === 'middle') {
          const range = origEnd - origStart;
          let newStart = origStart + deltaFrames;
          let newEnd = origEnd + deltaFrames;
          
          if (newStart < 0) {
            newStart = 0;
            newEnd = range;
          }
          if (newEnd > duration) {
            newEnd = duration;
            newStart = duration - range;
          }
          
          onWorkAreaChange?.(newStart, newEnd);
        }
      };
      
      const handleUp = () => {
        setWorkAreaDrag(null);
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      return;
    }
    
    // Normal seek behavior
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = xToFrame(x);
    onSeek(frame);
    setIsDragging(true);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const frame = xToFrame(x);
      onSeek(frame);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [xToFrame, onSeek, workAreaStart, workAreaEnd, duration, fps, pixelsPerFrame, onWorkAreaChange]);
  
  // Double-click to reset work area
  const handleDoubleClick = useCallback(() => {
    onWorkAreaChange?.(undefined, undefined);
  }, [onWorkAreaChange]);
  
  // Generate time markers
  const markers = useMemo(() => {
    const result: { frame: number; label: string; isMajor: boolean }[] = [];
    
    // Calculate interval based on zoom
    let frameInterval: number;
    if (pixelsPerFrame >= 15) {
      frameInterval = 1;
    } else if (pixelsPerFrame >= 8) {
      frameInterval = 5;
    } else if (pixelsPerFrame >= 4) {
      frameInterval = 10;
    } else if (pixelsPerFrame >= 2) {
      frameInterval = Math.round(fps / 2);
    } else if (pixelsPerFrame >= 1) {
      frameInterval = fps;
    } else {
      frameInterval = fps * 2;
    }
    
    const startFrame = Math.max(0, Math.floor(scrollLeft / pixelsPerFrame) - frameInterval);
    const endFrame = Math.min(duration, Math.ceil((scrollLeft + viewportWidth) / pixelsPerFrame) + frameInterval);
    
    for (let frame = Math.floor(startFrame / frameInterval) * frameInterval; frame <= endFrame; frame += frameInterval) {
      if (frame < 0) continue;
      
      const isMajor = frame % fps === 0;
      result.push({
        frame,
        label: formatTimeShort(frame, fps),
        isMajor,
      });
    }
    
    return result;
  }, [duration, fps, pixelsPerFrame, scrollLeft, viewportWidth]);
  
  const playheadX = frameToX(currentFrame);
  const hasWorkArea = workAreaStart !== undefined && workAreaEnd !== undefined;
  const workAreaX = hasWorkArea ? frameToX(workAreaStart) : 0;
  const workAreaWidth = hasWorkArea ? (workAreaEnd - workAreaStart) * pixelsPerFrame : 0;
  
  return (
    <div 
      ref={rulerRef}
      className="absolute inset-0 select-none overflow-hidden"
      style={{ 
        backgroundColor: '#1a1a1a',
        cursor: 'pointer',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Work area bar */}
      {hasWorkArea && workAreaX + workAreaWidth > 0 && workAreaX < viewportWidth && (
        <>
          {/* Work area background */}
          <div
            data-work-area="middle"
            className="absolute top-0 h-2 hover:opacity-90"
            style={{
              left: Math.max(0, workAreaX),
              width: Math.min(workAreaWidth, viewportWidth - workAreaX),
              backgroundColor: AE_COLORS.workArea,
              cursor: 'grab',
            }}
          />
          
          {/* Start handle */}
          {workAreaX >= 0 && workAreaX <= viewportWidth && (
            <div
              data-work-area="start"
              className="absolute top-0 h-2 w-1.5 cursor-ew-resize z-10 hover:bg-white/30"
              style={{
                left: workAreaX - 1,
                backgroundColor: AE_COLORS.workAreaHandle,
                borderRadius: '2px 0 0 2px',
              }}
            />
          )}
          
          {/* End handle */}
          {workAreaX + workAreaWidth >= 0 && workAreaX + workAreaWidth <= viewportWidth && (
            <div
              data-work-area="end"
              className="absolute top-0 h-2 w-1.5 cursor-ew-resize z-10 hover:bg-white/30"
              style={{
                left: workAreaX + workAreaWidth - 1,
                backgroundColor: AE_COLORS.workAreaHandle,
                borderRadius: '0 2px 2px 0',
              }}
            />
          )}
        </>
      )}
      
      {/* Markers */}
      {markers.map((marker, i) => {
        const x = frameToX(marker.frame);
        if (x < -30 || x > viewportWidth + 30) return null;
        
        return (
          <div
            key={`${marker.frame}-${i}`}
            className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
            style={{ left: x }}
          >
            {marker.isMajor && (
              <span 
                className="absolute top-0 text-[12px] font-mono font-bold whitespace-nowrap transform -translate-x-1/2"
                style={{ 
                  color: '#ffffff',
                  textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)',
                }}
              >
                {marker.label}
              </span>
            )}
            <div 
              className={cn(
                "absolute bottom-0 w-px",
                marker.isMajor ? "h-3" : "h-1.5"
              )}
              style={{ 
                backgroundColor: marker.isMajor ? '#e0e0e0' : '#888888'
              }}
            />
          </div>
        );
      })}
      
      {/* Playhead indicator (triangle) */}
      {playheadX >= -10 && playheadX <= viewportWidth + 10 && (
        <div
          className="absolute bottom-0 z-30 pointer-events-none"
          style={{ left: playheadX }}
        >
          <div 
            className="w-0 h-0 -translate-x-1/2"
            style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderBottom: '10px solid #ff5252',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            }}
          />
        </div>
      )}
    </div>
  );
};

// ==========================================
// NAVIGATOR (Mini-map)
// ==========================================

interface TimelineNavigatorProps {
  duration: number;
  pixelsPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  currentFrame?: number;
  onScrollChange: (scrollLeft: number) => void;
  onZoomChange: (pixelsPerFrame: number) => void;
  layers: CompositionLayer[];
}

const TimelineNavigator: React.FC<TimelineNavigatorProps> = ({
  duration,
  pixelsPerFrame,
  scrollLeft,
  viewportWidth,
  currentFrame = 0,
  onScrollChange,
  onZoomChange,
  layers,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'left' | 'right' | 'middle' | null>(null);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0, pixelsPerFrame: 0 });
  
  // After Effects approach: Navigator always represents the full composition
  // Thumb width = visible frames / total frames (responds to zoom immediately)
  const visibleFrames = viewportWidth / pixelsPerFrame;
  const scrollLeftFrames = scrollLeft / pixelsPerFrame;
  
  // Thumb width shrinks as you zoom in (seeing fewer frames)
  const thumbWidthPercent = Math.min(100, Math.max(3, (visibleFrames / duration) * 100));
  
  // Thumb position based on scroll
  const maxScrollFrames = Math.max(0, duration - visibleFrames);
  const maxThumbLeft = 100 - thumbWidthPercent;
  const thumbLeftPercent = maxScrollFrames > 0 
    ? (scrollLeftFrames / maxScrollFrames) * maxThumbLeft 
    : 0;
  
  const maxScrollLeft = Math.max(0, duration * pixelsPerFrame - viewportWidth);
  
  const handleThumbMouseDown = useCallback((e: React.MouseEvent, type: 'left' | 'right' | 'middle') => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { x: e.clientX, scrollLeft, pixelsPerFrame };
    setIsDragging(type);
    document.body.style.cursor = type === 'middle' ? 'grabbing' : 'ew-resize';
  }, [scrollLeft, pixelsPerFrame]);
  
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-thumb]')) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clickPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const targetThumbLeft = Math.max(0, Math.min(maxThumbLeft, clickPercent - thumbWidthPercent / 2));
    const targetScrollLeft = maxScrollLeft > 0 ? (targetThumbLeft / maxThumbLeft) * maxScrollLeft : 0;
    
    onScrollChange(targetScrollLeft);
  }, [maxThumbLeft, thumbWidthPercent, maxScrollLeft, onScrollChange]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const { x: startX, scrollLeft: startScrollLeft, pixelsPerFrame: startPpf } = dragStartRef.current;
      const deltaPixels = e.clientX - startX;
      const deltaPercent = (deltaPixels / rect.width) * 100;
      
      if (isDragging === 'middle') {
        // Pan - move the viewport
        const newThumbLeft = Math.max(0, Math.min(maxThumbLeft, thumbLeftPercent + deltaPercent));
        const newScrollLeft = maxScrollLeft > 0 ? (newThumbLeft / maxThumbLeft) * maxScrollLeft : 0;
        onScrollChange(Math.max(0, Math.min(maxScrollLeft, newScrollLeft)));
      } else if (isDragging === 'left' || isDragging === 'right') {
        // Zoom - change pixels per frame (more sensitive for better control)
        const zoomSensitivity = 0.1;
        const zoomDelta = isDragging === 'left' ? deltaPercent * zoomSensitivity : -deltaPercent * zoomSensitivity;
        const newPpf = Math.max(MIN_PIXELS_PER_FRAME, Math.min(MAX_PIXELS_PER_FRAME, startPpf + zoomDelta));
        onZoomChange(newPpf);
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(null);
      document.body.style.cursor = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, maxScrollLeft, maxThumbLeft, thumbLeftPercent, thumbWidthPercent, onScrollChange, onZoomChange]);
  
  return (
    <div 
      ref={containerRef}
      className="h-full relative select-none"
      style={{ 
        backgroundColor: '#1a1a1a',
        cursor: 'pointer',
      }}
      onMouseDown={handleTrackClick}
    >
      {/* Track background */}
      <div 
        className="absolute inset-x-2 top-1.5 bottom-1.5 rounded-full pointer-events-none overflow-hidden"
        style={{ backgroundColor: '#0f0f0f', border: '1px solid #2a2a2a' }}
      >
        {/* Mini layer bars */}
        {layers.map((layer, index) => {
          const left = (layer.startTime / duration) * 100;
          const width = (layer.duration / duration) * 100;
          
          return (
            <div
              key={layer.id}
              className="absolute top-0 bottom-0"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: layer.color || getLayerTypeColor(layer.type),
                opacity: 0.4,
              }}
            />
          );
        })}
      </div>
      
      {/* Thumb */}
      <div
        data-thumb
        className="absolute top-1 bottom-1 rounded-full transition-colors"
        style={{
          left: `calc(${thumbLeftPercent}% + 8px)`,
          width: `calc(${thumbWidthPercent}% - 16px)`,
          minWidth: '24px',
          backgroundColor: isDragging === 'middle' ? '#505050' : '#404040',
          border: '1px solid #606060',
        }}
      >
        {/* Left handle */}
        <div
          className={cn(
            "absolute -left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-ew-resize z-10 transition-colors",
            isDragging === 'left' 
              ? 'bg-blue-500 border-blue-400' 
              : 'bg-neutral-400 border-neutral-300 hover:bg-blue-400 hover:border-blue-300'
          )}
          onMouseDown={(e) => handleThumbMouseDown(e, 'left')}
        />
        
        {/* Center drag area */}
        <div
          className="absolute inset-x-2 inset-y-0 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => handleThumbMouseDown(e, 'middle')}
        />
        
        {/* Right handle */}
        <div
          className={cn(
            "absolute -right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-ew-resize z-10 transition-colors",
            isDragging === 'right' 
              ? 'bg-blue-500 border-blue-400' 
              : 'bg-neutral-400 border-neutral-300 hover:bg-blue-400 hover:border-blue-300'
          )}
          onMouseDown={(e) => handleThumbMouseDown(e, 'right')}
        />
      </div>
    </div>
  );
};

// ==========================================
// ADD LAYER MENU
// ==========================================

const AddLayerMenu: React.FC<{ onAddLayer: (type: 'text' | 'shape' | 'solid' | 'null') => void }> = ({ onAddLayer }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-7 px-3 text-[11px] gap-1.5 font-semibold rounded"
        style={{ 
          backgroundColor: '#3a3a3a',
          color: AE_COLORS.textPrimary,
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        New Layer
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-36">
      <DropdownMenuItem onClick={() => onAddLayer('text')} className="text-xs">
        <Type className="h-3 w-3 mr-2" style={{ color: AE_COLORS.layerText }} />
        Text Layer
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAddLayer('shape')} className="text-xs">
        <Square className="h-3 w-3 mr-2" style={{ color: AE_COLORS.layerShape }} />
        Shape Layer
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAddLayer('solid')} className="text-xs">
        <Palette className="h-3 w-3 mr-2" style={{ color: AE_COLORS.layerSolid }} />
        Solid Layer
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onAddLayer('null')} className="text-xs">
        <Crosshair className="h-3 w-3 mr-2" style={{ color: AE_COLORS.layerNull }} />
        Null Object
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

// ==========================================
// KEYFRAME CONTEXT MENU
// ==========================================

interface KeyframeContextMenuProps {
  children: React.ReactNode;
  onDelete: () => void;
  onSetEasing: (type: string) => void;
}

const KeyframeContextMenu: React.FC<KeyframeContextMenuProps> = ({ 
  children, 
  onDelete, 
  onSetEasing 
}) => (
  <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent className="w-40">
      <ContextMenuItem onClick={onDelete} className="text-xs text-red-400">
        Delete Keyframe
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onSetEasing('linear')} className="text-xs">
        Linear
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSetEasing('ease-in')} className="text-xs">
        Ease In
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSetEasing('ease-out')} className="text-xs">
        Ease Out
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSetEasing('ease-in-out')} className="text-xs">
        Ease In Out
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onSetEasing('hold')} className="text-xs">
        Hold
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);

// ==========================================
// EXPANDED LAYER PROPERTIES - LEFT SIDE (Layer List)
// ==========================================

interface ExpandedPropertyRowsProps {
  layer: CompositionLayer;
  expandedProperties: string[];
  fps: number;
  currentFrame: number;
  onTogglePropertyGroup: (propertyPath: string) => void;
  onToggleKeyframing: (layerId: string, propertyPath: string, enabled: boolean) => void;
  onAddKeyframe: (layerId: string, propertyPath: string, frame: number, value: any) => void;
}

const ExpandedPropertyRows: React.FC<ExpandedPropertyRowsProps> = ({
  layer,
  expandedProperties,
  fps,
  currentFrame,
  onTogglePropertyGroup,
  onToggleKeyframing,
  onAddKeyframe,
}) => {
  const rows: React.ReactNode[] = [];
  const isTransformExpanded = expandedProperties.includes('transform');
  
  // Transform group header
  rows.push(
    <div
      key="transform-header"
      className="flex items-center border-b cursor-pointer hover:bg-[#242424] px-1"
      style={{
        height: PROPERTY_ROW_HEIGHT,
        borderColor: '#0f0f0f',
        backgroundColor: '#202020',
      }}
      onClick={() => onTogglePropertyGroup('transform')}
    >
      <div style={{ width: 28 }} />
      <span 
        className="text-[11px] font-semibold"
        style={{ color: AE_COLORS.textPrimary }}
      >
        {isTransformExpanded ? '▼' : '▶'} Transform
      </span>
    </div>
  );
  
  // Transform properties
  if (isTransformExpanded) {
    PROPERTY_GROUPS.transform.properties.forEach((prop, propIndex) => {
      const propertyKeyframes = layer.keyframes?.find(pk => pk.propertyPath === prop.path);
      
      rows.push(
        <PropertyRow
          key={prop.path}
          layer={layer}
          propertyPath={prop.path}
          propertyName={prop.name}
          depth={2}
          fps={fps}
          currentFrame={currentFrame}
          alternateRow={propIndex % 2 === 1}
          onToggleKeyframing={onToggleKeyframing}
          onAddKeyframe={onAddKeyframe}
          onJumpToKeyframe={(dir) => {
            if (!propertyKeyframes?.keyframes) return;
            const layerTime = (currentFrame - layer.startTime) / fps;
            const sorted = [...propertyKeyframes.keyframes].sort((a, b) => a.time - b.time);
            
            if (dir === 'prev') {
              const prev = sorted.filter(kf => kf.time < layerTime - 0.001).pop();
              if (prev) {
                const frame = layer.startTime + prev.time * fps;
                useCompositionEditorStore.getState().setCurrentFrame(Math.round(frame));
              }
            } else {
              const next = sorted.find(kf => kf.time > layerTime + 0.001);
              if (next) {
                const frame = layer.startTime + next.time * fps;
                useCompositionEditorStore.getState().setCurrentFrame(Math.round(frame));
              }
            }
          }}
        />
      );
    });
  }
  
  return <>{rows}</>;
};

// ==========================================
// EXPANDED PROPERTY TRACKS - RIGHT SIDE (Timeline)
// ==========================================

interface ExpandedPropertyTracksProps {
  layer: CompositionLayer;
  expandedProperties: string[];
  pixelsPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  fps: number;
  compositionDuration: number;
  selectedKeyframeIds: Set<string>;
  onSelectKeyframe: (keyframeId: string, addToSelection: boolean) => void;
  onDragKeyframe: (keyframeId: string, newTime: number) => void;
  onDeleteKeyframe: (layerId: string, propertyPath: string, keyframeId: string) => void;
  onSetKeyframeEasing: (layerId: string, propertyPath: string, keyframeId: string, easing: string) => void;
}

const ExpandedPropertyTracks: React.FC<ExpandedPropertyTracksProps> = ({
  layer,
  expandedProperties,
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
  const tracks: React.ReactNode[] = [];
  const isTransformExpanded = expandedProperties.includes('transform');
  
  // Calculate duration gradient
  const durationX = compositionDuration * pixelsPerFrame - scrollLeft;
  const durationPercent = Math.min(100, Math.max(0, (durationX / viewportWidth) * 100));
  
  // Transform group header track (empty space)
  tracks.push(
    <div
      key="transform-header-track"
      className="border-b"
      style={{
        height: PROPERTY_ROW_HEIGHT,
        background: `linear-gradient(90deg, #383838 0%, #383838 ${durationPercent}%, #232323 ${durationPercent}%)`,
        borderColor: '#0f0f0f',
      }}
    />
  );
  
  // Transform property tracks
  if (isTransformExpanded) {
    PROPERTY_GROUPS.transform.properties.forEach((prop, propIndex) => {
      const propertyKeyframes = layer.keyframes?.find(pk => pk.propertyPath === prop.path);
      const brightColor = propIndex % 2 === 0 ? '#383838' : '#303030';
      const afterColor = propIndex % 2 === 0 ? '#222222' : '#1e1e1e';
      
      tracks.push(
        <div
          key={prop.path}
          className="border-b"
          style={{
            height: PROPERTY_ROW_HEIGHT,
            background: `linear-gradient(90deg, ${brightColor} 0%, ${brightColor} ${durationPercent}%, ${afterColor} ${durationPercent}%)`,
            borderColor: '#0f0f0f',
          }}
        >
          <PropertyTrack
            layerId={layer.id}
            propertyPath={prop.path}
            propertyKeyframes={propertyKeyframes}
            layerStartTime={layer.startTime}
            layerDuration={layer.duration}
            pixelsPerFrame={pixelsPerFrame}
            scrollLeft={scrollLeft}
            viewportWidth={viewportWidth}
            fps={fps}
            compositionDuration={compositionDuration}
            selectedKeyframeIds={selectedKeyframeIds}
            onSelectKeyframe={onSelectKeyframe}
            onDragKeyframe={onDragKeyframe}
            onDeleteKeyframe={onDeleteKeyframe}
            onSetKeyframeEasing={onSetKeyframeEasing}
          />
        </div>
      );
    });
  }
  
  return <>{tracks}</>;
};

// ==========================================
// MAIN COMPONENT
// ==========================================

// Minimal scrollbar styles
const scrollbarStyles = `
  /* Main timeline scrollbar - visible on right */
  .minimal-scrollbar::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .minimal-scrollbar::-webkit-scrollbar-track {
    background: #1a1a1a;
  }
  .minimal-scrollbar::-webkit-scrollbar-thumb {
    background: #3a3a3a;
    border-radius: 5px;
    border: 2px solid #1a1a1a;
  }
  .minimal-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #4a4a4a;
  }
  .minimal-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #3a3a3a #1a1a1a;
  }
  
  /* Hidden scrollbar for layer list */
  .hidden-scrollbar::-webkit-scrollbar {
    width: 0px;
  }
  .hidden-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
`;

export const CompositionTimeline: React.FC = () => {
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const layerListRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(DEFAULT_PIXELS_PER_FRAME);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [snapLine, setSnapLine] = useState<{ x: number; visible: boolean } | null>(null);
  const [isDraggingDurationEnd, setIsDraggingDurationEnd] = useState(false);
  const isSyncingScroll = useRef(false);

  // Store state
  const composition = useCompositionEditorStore((state) => state.composition);
  const selection = useCompositionEditorStore((state) => state.selection);
  const playback = useCompositionEditorStore((state) => state.playback);
  const expandedLayers = useCompositionEditorStore((state) => state.expandedLayers);
  const graphEditorVisible = useCompositionEditorStore((state) => state.graphEditorVisible);
  const graphEditorSelectedProperty = useCompositionEditorStore((state) => state.graphEditorSelectedProperty);
  const hasSoloedLayers = useCompositionEditorStore(selectHasSoloedLayers);

  // Store actions
  const selectLayers = useCompositionEditorStore((state) => state.selectLayers);
  const clearLayerSelection = useCompositionEditorStore((state) => state.clearLayerSelection);
  const toggleLayerVisibility = useCompositionEditorStore((state) => state.toggleLayerVisibility);
  const toggleLayerLock = useCompositionEditorStore((state) => state.toggleLayerLock);
  const toggleLayerSolo = useCompositionEditorStore((state) => state.toggleLayerSolo);
  const addLayer = useCompositionEditorStore((state) => state.addLayer);
  const updateLayer = useCompositionEditorStore((state) => state.updateLayer);
  const setCurrentFrame = useCompositionEditorStore((state) => state.setCurrentFrame);
  const togglePlayback = useCompositionEditorStore((state) => state.togglePlayback);
  const toggleLoop = useCompositionEditorStore((state) => state.toggleLoop);
  const setWorkArea = useCompositionEditorStore((state) => state.setWorkArea);
  
  // Timeline expansion actions
  const toggleLayerExpansion = useCompositionEditorStore((state) => state.toggleLayerExpansion);
  const expandPropertyGroup = useCompositionEditorStore((state) => state.expandPropertyGroup);
  const collapsePropertyGroup = useCompositionEditorStore((state) => state.collapsePropertyGroup);
  const toggleGraphEditor = useCompositionEditorStore((state) => state.toggleGraphEditor);
  const revealProperty = useCompositionEditorStore((state) => state.revealProperty);
  const revealKeyframedProperties = useCompositionEditorStore((state) => state.revealKeyframedProperties);
  
  // Keyframe actions
  const selectKeyframes = useCompositionEditorStore((state) => state.selectKeyframes);
  const addKeyframe = useCompositionEditorStore((state) => state.addKeyframe);
  const updateKeyframe = useCompositionEditorStore((state) => state.updateKeyframe);
  const deleteKeyframe = useCompositionEditorStore((state) => state.deleteKeyframe);
  const togglePropertyKeyframing = useCompositionEditorStore((state) => state.togglePropertyKeyframing);

  // Measure viewport width
  useEffect(() => {
    const container = tracksContainerRef.current;
    if (!container) return;
    
    const updateWidth = () => {
      setViewportWidth(container.clientWidth);
    };
    
    updateWidth();
    
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, []);
  
  // Sync vertical scroll between layer list and tracks
  useEffect(() => {
    const layerList = layerListRef.current;
    const tracksScroll = tracksScrollRef.current;
    if (!layerList || !tracksScroll) return;
    
    const handleLayerListScroll = () => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      tracksScroll.scrollTop = layerList.scrollTop;
      setTimeout(() => { isSyncingScroll.current = false; }, 0);
    };
    
    const handleTracksScroll = () => {
      if (isSyncingScroll.current) return;
      isSyncingScroll.current = true;
      layerList.scrollTop = tracksScroll.scrollTop;
      setTimeout(() => { isSyncingScroll.current = false; }, 0);
    };
    
    layerList.addEventListener('scroll', handleLayerListScroll);
    tracksScroll.addEventListener('scroll', handleTracksScroll);
    
    return () => {
      layerList.removeEventListener('scroll', handleLayerListScroll);
      tracksScroll.removeEventListener('scroll', handleTracksScroll);
    };
  }, []);

  if (!composition) {
    return (
      <div 
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        <p className="text-sm" style={{ color: '#888888' }}>No composition loaded</p>
      </div>
    );
  }

  // Reverse layers for display (foreground at top) - memoized to prevent new array reference on every render
  const layers = useMemo(() => [...composition.layers].reverse(), [composition.layers]);
  const fps = composition.fps;
  const duration = composition.duration;
  const currentFrame = playback.currentFrame;
  const isPlaying = playback.isPlaying;
  const selectedLayerIds = useMemo(() => new Set(selection.layerIds), [selection.layerIds]);
  const selectedKeyframeIds = useMemo(() => new Set(selection.keyframeIds), [selection.keyframeIds]);

  const totalWidth = duration * pixelsPerFrame;
  const maxScrollLeft = Math.max(0, totalWidth - viewportWidth);

  // Handle layer selection
  const handleLayerSelect = useCallback((layerId: string, addToSelection: boolean) => {
    selectLayers([layerId], addToSelection);
  }, [selectLayers]);

  // Handle add layer
  const handleAddLayer = useCallback((type: 'text' | 'shape' | 'solid' | 'null') => {
    const { DEFAULT_TEXT_PROPERTIES, DEFAULT_SHAPE_PROPERTIES, DEFAULT_SOLID_PROPERTIES, DEFAULT_LAYER_TRANSFORM } = require('../../../types/composition');

    let layerProperties: any;
    let name = '';
    let color = '';

    switch (type) {
      case 'text':
        layerProperties = { type: 'text', properties: { ...DEFAULT_TEXT_PROPERTIES } };
        name = `Text ${layers.length + 1}`;
        color = AE_COLORS.layerText;
        break;
      case 'shape':
        layerProperties = { type: 'shape', properties: { ...DEFAULT_SHAPE_PROPERTIES } };
        name = `Shape ${layers.length + 1}`;
        color = AE_COLORS.layerShape;
        break;
      case 'solid':
        layerProperties = { type: 'solid', properties: { ...DEFAULT_SOLID_PROPERTIES } };
        name = `Solid ${layers.length + 1}`;
        color = AE_COLORS.layerSolid;
        break;
      case 'null':
        layerProperties = { type: 'null', properties: {} };
        name = `Null ${layers.length + 1}`;
        color = AE_COLORS.layerNull;
        break;
    }

    addLayer({
      name,
      type,
      startTime: currentFrame,
      duration: duration - currentFrame,
      transform: { ...DEFAULT_LAYER_TRANSFORM, x: composition.width / 2, y: composition.height / 2 },
      layerProperties,
      visible: true,
      locked: false,
      color,
    });
  }, [layers.length, currentFrame, duration, composition, addLayer]);

  // Handle duration end marker drag
  const handleDurationEndDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDraggingDurationEnd(true);
    const startX = e.clientX;
    const startDuration = duration;
    
    const handleMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaFrames = Math.round(deltaX / pixelsPerFrame);
      const newDuration = Math.max(fps, startDuration + deltaFrames);
      
      useCompositionEditorStore.getState().updateComposition({ duration: newDuration });
    };
    
    const handleUp = () => {
      setIsDraggingDurationEnd(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [duration, pixelsPerFrame, fps]);

  // Handle wheel zoom/scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = -Math.sign(e.deltaY) * 0.5;
      const newPpf = Math.max(MIN_PIXELS_PER_FRAME, Math.min(MAX_PIXELS_PER_FRAME, pixelsPerFrame + zoomDelta));
      setPixelsPerFrame(newPpf);
    } else if (e.shiftKey) {
      e.preventDefault();
      setScrollLeft(prev => Math.max(0, Math.min(maxScrollLeft, prev + e.deltaY)));
    } else {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setScrollLeft(prev => Math.max(0, Math.min(maxScrollLeft, prev + e.deltaX)));
      }
    }
  }, [pixelsPerFrame, maxScrollLeft]);

  // Playback controls
  const handleSkipBackward = useCallback(() => {
    setCurrentFrame(Math.max(0, currentFrame - fps));
  }, [currentFrame, fps, setCurrentFrame]);

  const handleSkipForward = useCallback(() => {
    setCurrentFrame(Math.min(duration - 1, currentFrame + fps));
  }, [currentFrame, duration, fps, setCurrentFrame]);

  // Jump to next/previous keyframe helper
  const jumpToKeyframe = useCallback((direction: 'prev' | 'next') => {
    if (selection.layerIds.length === 0 || !composition) return;
    
    const selectedLayers = composition.layers.filter(l => selection.layerIds.includes(l.id));
    const allKeyframeTimes = new Set<number>();
    
    for (const layer of selectedLayers) {
      if (!layer.keyframes) continue;
      for (const pk of layer.keyframes) {
        for (const kf of pk.keyframes) {
          const frame = layer.startTime + kf.time * fps;
          allKeyframeTimes.add(Math.round(frame));
        }
      }
    }
    
    const sortedFrames = [...allKeyframeTimes].sort((a, b) => a - b);
    
    if (direction === 'prev') {
      const prev = sortedFrames.filter(f => f < currentFrame - 0.5).pop();
      if (prev !== undefined) setCurrentFrame(prev);
    } else {
      const next = sortedFrames.find(f => f > currentFrame + 0.5);
      if (next !== undefined) setCurrentFrame(next);
    }
  }, [composition, selection.layerIds, currentFrame, fps, setCurrentFrame]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = e.key.toUpperCase();
      
      // Playback
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentFrame(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentFrame(duration - 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentFrame(Math.max(0, currentFrame - (e.shiftKey ? fps : 1)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentFrame(Math.min(duration - 1, currentFrame + (e.shiftKey ? fps : 1)));
      }
      // J/K - Jump to previous/next keyframe (After Effects style)
      else if (key === 'J') {
        e.preventDefault();
        jumpToKeyframe('prev');
      } else if (key === 'K') {
        e.preventDefault();
        jumpToKeyframe('next');
      }
      // [ - Set work area start / ] - Set work area end
      else if (e.key === '[') {
        e.preventDefault();
        const newEnd = playback.workAreaEnd ?? duration;
        setWorkArea(currentFrame, Math.max(currentFrame + fps, newEnd));
      } else if (e.key === ']') {
        e.preventDefault();
        const newStart = playback.workAreaStart ?? 0;
        setWorkArea(Math.min(currentFrame - fps, newStart), currentFrame);
      }
      // B - Set work area to begin at current frame
      else if (key === 'B' && !e.ctrlKey) {
        e.preventDefault();
        setWorkArea(currentFrame, playback.workAreaEnd ?? duration);
      }
      // N - Set work area to end at current frame
      else if (key === 'N' && !e.ctrlKey) {
        e.preventDefault();
        setWorkArea(playback.workAreaStart ?? 0, currentFrame);
      }
      // Zoom
      else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setPixelsPerFrame(prev => Math.min(MAX_PIXELS_PER_FRAME, prev + 0.5));
      } else if (e.key === '-') {
        e.preventDefault();
        setPixelsPerFrame(prev => Math.max(MIN_PIXELS_PER_FRAME, prev - 0.5));
      }
      // Property shortcuts (P, S, R, T, A)
      else if (PROPERTY_SHORTCUTS[key] && selection.layerIds.length > 0) {
        e.preventDefault();
        for (const layerId of selection.layerIds) {
          revealProperty(layerId, PROPERTY_SHORTCUTS[key]);
        }
      }
      // U - reveal keyframed properties
      else if (key === 'U' && selection.layerIds.length > 0) {
        e.preventDefault();
        for (const layerId of selection.layerIds) {
          revealKeyframedProperties(layerId);
        }
      }
      // L - toggle lock
      else if (key === 'L' && !e.ctrlKey && selection.layerIds.length > 0) {
        e.preventDefault();
        for (const layerId of selection.layerIds) {
          toggleLayerLock(layerId);
        }
      }
      // Delete/Backspace - delete selected layers
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.layerIds.length > 0) {
        e.preventDefault();
        useCompositionEditorStore.getState().deleteLayers(selection.layerIds);
      }
      // Ctrl+D - duplicate selected layers
      else if (key === 'D' && (e.ctrlKey || e.metaKey) && selection.layerIds.length > 0) {
        e.preventDefault();
        for (const layerId of selection.layerIds) {
          useCompositionEditorStore.getState().duplicateLayer(layerId);
        }
      }
      // Ctrl+A - select all layers
      else if (key === 'A' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (composition) {
          selectLayers(composition.layers.map(l => l.id));
        }
      }
      // Escape - deselect all
      else if (e.key === 'Escape') {
        e.preventDefault();
        clearLayerSelection();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrame, duration, fps, selection.layerIds, playback.workAreaStart, playback.workAreaEnd, composition, togglePlayback, setCurrentFrame, revealProperty, revealKeyframedProperties, toggleLayerLock, jumpToKeyframe, setWorkArea, selectLayers, clearLayerSelection]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const playheadX = currentFrame * pixelsPerFrame;
    const margin = 100;
    
    if (playheadX < scrollLeft + margin) {
      setScrollLeft(Math.max(0, playheadX - margin));
    } else if (playheadX > scrollLeft + viewportWidth - margin) {
      setScrollLeft(Math.min(maxScrollLeft, playheadX - viewportWidth + margin));
    }
  }, [currentFrame, pixelsPerFrame, scrollLeft, viewportWidth, maxScrollLeft]);

  // Calculate total height for layer list and tracks - memoized to prevent recreation on every render
  const calculateLayerHeight = useCallback((layer: CompositionLayer): number => {
    const expanded = expandedLayers[layer.id] || [];
    let height = TRACK_HEIGHT;
    
    if (expanded.length > 0) {
      // Transform header
      height += PROPERTY_ROW_HEIGHT;
      
      // Individual properties if transform is expanded
      if (expanded.includes('transform')) {
        height += PROPERTY_GROUPS.transform.properties.length * PROPERTY_ROW_HEIGHT;
      }
    }
    
    return height;
  }, [expandedLayers]);

  // Render playhead line - memoized to prevent recalculation
  const playheadX = useMemo(() => currentFrame * pixelsPerFrame - scrollLeft, [currentFrame, pixelsPerFrame, scrollLeft]);

  return (
    <div 
      className="h-full flex flex-col"
      style={{ backgroundColor: '#1a1a1a' }}
      onWheel={handleWheel}
    >
      {/* Inject scrollbar styles */}
      <style>{scrollbarStyles}</style>
      {/* Toolbar - Premiere Pro style */}
      <div 
        className="shrink-0 flex items-center px-4 py-2 border-b"
        style={{ 
          height: TOOLBAR_HEIGHT,
          backgroundColor: '#0f0f0f',
          borderColor: '#2a2a2a',
        }}
      >
        {/* Left - Layer controls */}
        <div className="flex items-center gap-2">
          <AddLayerMenu onAddLayer={handleAddLayer} />
        </div>
        
        <div className="flex-1" />
        
        {/* Center - Playback controls */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 rounded"
            style={{
              backgroundColor: '#3a3a3a',
            }}
            onClick={handleSkipBackward}
            title="Previous second"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 rounded"
            style={{
              backgroundColor: isPlaying ? '#4a90d9' : '#3a3a3a',
              color: isPlaying ? 'white' : undefined,
            }}
            onClick={togglePlayback}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 rounded"
            style={{
              backgroundColor: '#3a3a3a',
            }}
            onClick={handleSkipForward}
            title="Next second"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          
          {/* Loop toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded ml-1"
            style={{
              backgroundColor: playback.loop ? '#4a90d9' : '#3a3a3a',
              color: playback.loop ? 'white' : undefined,
            }}
            onClick={toggleLoop}
            title="Loop playback"
          >
            <Repeat className="h-3.5 w-3.5" />
          </Button>
          
          {/* Timecode */}
          <div 
            className="px-3 py-1.5 rounded text-[11px] font-mono font-bold ml-2"
            style={{ 
              backgroundColor: '#2a2a2a',
              color: AE_COLORS.textPrimary,
              border: `1px solid ${AE_COLORS.border}`,
              letterSpacing: '0.5px',
            }}
          >
            {formatTimecode(currentFrame, fps)}
          </div>
        </div>
        
        <div className="flex-1" />
        
        {/* Right - View controls */}
        <div className="flex items-center gap-2">
          {/* Graph editor toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded"
            style={{
              backgroundColor: graphEditorVisible ? '#4a90d9' : '#3a3a3a',
              color: graphEditorVisible ? 'white' : undefined,
            }}
            onClick={toggleGraphEditor}
            title="Toggle Graph Editor"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </Button>
          
          <div className="w-px h-5" style={{ backgroundColor: AE_COLORS.border }} />
          
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded"
              style={{
                backgroundColor: '#3a3a3a',
              }}
              onClick={() => setPixelsPerFrame(prev => Math.max(MIN_PIXELS_PER_FRAME, prev - 0.5))}
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            
            <div 
              className="px-2 text-[10px] font-mono font-semibold"
              style={{ color: AE_COLORS.textPrimary }}
            >
              {Math.round(pixelsPerFrame * 25)}%
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded"
              style={{
                backgroundColor: '#3a3a3a',
              }}
              onClick={() => setPixelsPerFrame(prev => Math.min(MAX_PIXELS_PER_FRAME, prev + 0.5))}
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Timeline content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main timeline area */}
        <div className={cn("flex flex-col", graphEditorVisible ? "flex-[0_0_65%]" : "flex-1")}>
          <div className="flex-1 flex overflow-hidden">
            {/* Layer list (left) */}
            <div
              className="shrink-0 flex flex-col border-r overflow-hidden"
              style={{ 
                width: LAYER_LIST_WIDTH + CONTROLS_WIDTH,
                borderColor: '#2a2a2a',
              }}
            >
          {/* Layer list header */}
          <div
            className="flex items-center border-b shrink-0"
            style={{ 
              height: RULER_HEIGHT,
              backgroundColor: '#1a1a1a',
              borderColor: '#2a2a2a',
            }}
          >
            <div 
              className="flex-1 px-2 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: AE_COLORS.textSecondary }}
            >
              Layer
            </div>
            <div 
              className="flex items-center justify-center gap-2 px-1 border-l"
              style={{ 
                width: CONTROLS_WIDTH,
                borderColor: AE_COLORS.border,
                color: AE_COLORS.textSecondary,
              }}
            >
              <span className="text-[9px] font-bold">S</span>
              <span className="text-[9px] font-bold">V</span>
              <span className="text-[9px] font-bold">L</span>
            </div>
          </div>

          {/* Layer list items */}
          <div 
            ref={layerListRef}
            className="flex-1 hidden-scrollbar"
            style={{ 
              backgroundColor: '#1a1a1a',
              overflowY: 'auto',
              overflowX: 'hidden', // Prevent horizontal scroll
            }}
          >
            {layers.map((layer, index) => {
              const isExpanded = (expandedLayers[layer.id]?.length ?? 0) > 0;
              const expanded = expandedLayers[layer.id] || [];
              
              return (
                <React.Fragment key={layer.id}>
                  {/* Main layer row */}
                  <LayerRow
                    layer={layer}
                    index={index}
                    isSelected={selectedLayerIds.has(layer.id)}
                    isExpanded={isExpanded}
                    hasSoloedLayers={hasSoloedLayers}
                    alternateRow={index % 2 === 1}
                    onSelect={handleLayerSelect}
                    onToggleExpansion={toggleLayerExpansion}
                    onToggleVisibility={toggleLayerVisibility}
                    onToggleLock={toggleLayerLock}
                    onToggleSolo={toggleLayerSolo}
                  />
                  
                  {/* Expanded property rows (left side only) */}
                  {isExpanded && (
                    <ExpandedPropertyRows
                      layer={layer}
                      expandedProperties={expanded}
                      fps={fps}
                      currentFrame={currentFrame}
                      onTogglePropertyGroup={(path) => {
                        if (expanded.includes(path)) {
                          collapsePropertyGroup(layer.id, path);
                        } else {
                          expandPropertyGroup(layer.id, path);
                        }
                      }}
                      onToggleKeyframing={togglePropertyKeyframing}
                      onAddKeyframe={addKeyframe}
                    />
                  )}
                </React.Fragment>
              );
            })}
            
            {layers.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-[11px] font-medium" style={{ color: AE_COLORS.textSecondary }}>
                  No layers in composition
                </p>
                <p className="text-[10px] mt-1" style={{ color: AE_COLORS.textDim }}>
                  Click "New" to add a layer
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline tracks (right) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          <div 
            className="shrink-0 relative border-b"
            style={{ 
              height: RULER_HEIGHT,
              borderColor: '#2a2a2a',
            }}
          >
            <TimelineRuler
              duration={duration}
              fps={fps}
              pixelsPerFrame={pixelsPerFrame}
              scrollLeft={scrollLeft}
              viewportWidth={viewportWidth}
              currentFrame={currentFrame}
              workAreaStart={playback.workAreaStart}
              workAreaEnd={playback.workAreaEnd}
              onSeek={setCurrentFrame}
              onWorkAreaChange={setWorkArea}
            />
          </div>

          {/* Tracks area */}
          <div 
            ref={tracksContainerRef}
            className="flex-1 relative"
            style={{ 
              backgroundColor: '#202020',
              overflow: 'hidden',
            }}
            onClick={() => clearLayerSelection()}
          >
            {/* Composition end marker - draggable */}
            {(() => {
              const durationX = duration * pixelsPerFrame - scrollLeft;
              
              return (
                <>
                  {durationX >= -5 && durationX <= viewportWidth + 5 && (
                    <div
                      className="absolute top-0 bottom-0 z-10 cursor-ew-resize group"
                      style={{
                        left: durationX - 5,
                        width: '10px',
                      }}
                      onMouseDown={handleDurationEndDrag}
                      title="Drag to change composition duration"
                    >
                      {/* Marker line */}
                      <div
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 top-0 bottom-0 transition-all",
                          isDraggingDurationEnd ? "w-0.5" : "w-px group-hover:w-0.5"
                        )}
                        style={{
                          backgroundColor: '#ff8800',
                          opacity: isDraggingDurationEnd ? 0.9 : 0.6,
                        }}
                      />
                      {/* Handle at top */}
                      <div
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 top-0 rounded-b transition-all",
                          isDraggingDurationEnd ? "w-2 h-3" : "w-1.5 h-2 group-hover:w-2 group-hover:h-3"
                        )}
                        style={{
                          backgroundColor: '#ff8800',
                        }}
                      />
                      {/* Handle at bottom */}
                      <div
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 bottom-0 rounded-t transition-all",
                          isDraggingDurationEnd ? "w-2 h-3" : "w-1.5 h-2 group-hover:w-2 group-hover:h-3"
                        )}
                        style={{
                          backgroundColor: '#ff8800',
                        }}
                      />
                    </div>
                  )}
                </>
              );
            })()}
            
            {/* Tracks content - single scrollable container */}
            <div 
              ref={tracksScrollRef}
              className="absolute inset-0 minimal-scrollbar"
              style={{
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {layers.map((layer, index) => {
                const isExpanded = (expandedLayers[layer.id]?.length ?? 0) > 0;
                const expanded = expandedLayers[layer.id] || [];
                
                return (
                  <React.Fragment key={layer.id}>
                    {/* Layer track */}
                    <div 
                      className="border-b"
                      style={{ 
                        height: TRACK_HEIGHT,
                        borderColor: '#0f0f0f',
                        background: (() => {
                          const durationX = duration * pixelsPerFrame - scrollLeft;
                          const durationPercent = Math.min(100, Math.max(0, (durationX / viewportWidth) * 100));
                          const brightColor = index % 2 === 1 ? '#3a3a3a' : '#323232';
                          const afterColor = index % 2 === 1 ? '#242424' : '#202020';
                          return `linear-gradient(90deg, ${brightColor} 0%, ${brightColor} ${durationPercent}%, ${afterColor} ${durationPercent}%)`;
                        })(),
                      }}
                    >
                      <LayerTrack
                        layer={layer}
                        pixelsPerFrame={pixelsPerFrame}
                        scrollLeft={scrollLeft}
                        viewportWidth={viewportWidth}
                        isSelected={selectedLayerIds.has(layer.id)}
                        onSelect={handleLayerSelect}
                        onUpdateLayer={updateLayer}
                        compositionDuration={duration}
                        fps={fps}
                        currentFrame={currentFrame}
                        otherLayers={composition?.layers || []}
                        onSnapLineChange={setSnapLine}
                      />
                    </div>
                    
                    {/* Property tracks if expanded (right side only) */}
                    {isExpanded && (
                      <ExpandedPropertyTracks
                        layer={layer}
                        expandedProperties={expanded}
                        pixelsPerFrame={pixelsPerFrame}
                        scrollLeft={scrollLeft}
                        viewportWidth={viewportWidth}
                        fps={fps}
                        compositionDuration={duration}
                        selectedKeyframeIds={selectedKeyframeIds}
                        onSelectKeyframe={(id, add) => selectKeyframes([id], add)}
                        onDragKeyframe={(id, newTime) => {
                          // Clamp keyframe time to layer duration
                          const maxTime = layer.duration / fps;
                          const clampedTime = Math.max(0, Math.min(maxTime, newTime));
                          
                          // Find the property and update
                          for (const pk of layer.keyframes || []) {
                            const kf = pk.keyframes.find(k => k.id === id);
                            if (kf) {
                              updateKeyframe(layer.id, pk.propertyPath, id, { time: clampedTime });
                              break;
                            }
                          }
                        }}
                        onDeleteKeyframe={deleteKeyframe}
                        onSetKeyframeEasing={(layerId, propertyPath, keyframeId, easing) => {
                          updateKeyframe(layerId, propertyPath, keyframeId, {
                            interpolation: { type: easing as any },
                          });
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Snap indicator line */}
            {snapLine && snapLine.visible && (
              <SnapIndicator x={snapLine.x} visible={snapLine.visible} />
            )}

            {/* Playhead line - After Effects style */}
            {playheadX >= 0 && playheadX <= viewportWidth && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: playheadX - 1 }}
              >
                {/* Main line - clean red, no glow */}
                <div 
                  className="absolute inset-y-0 w-0.5"
                  style={{ backgroundColor: '#ff3b3b' }}
                />
              </div>
            )}

            {/* Empty state */}
            {layers.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: AE_COLORS.textSecondary }}>
                    No layers in timeline
                  </p>
                  <p className="text-xs mt-1" style={{ color: AE_COLORS.textDim }}>
                    Use the "New" button to add a layer
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
        
      {/* Navigator */}
      <div className="shrink-0 h-6 border-t" style={{ borderColor: '#2a2a2a' }}>
        <TimelineNavigator
          duration={duration}
          pixelsPerFrame={pixelsPerFrame}
          scrollLeft={scrollLeft}
          viewportWidth={viewportWidth}
          currentFrame={currentFrame}
          onScrollChange={setScrollLeft}
          onZoomChange={setPixelsPerFrame}
          layers={layers}
        />
      </div>
    </div>

        {/* Graph Editor Panel (right side when visible) */}
        {graphEditorVisible && (
          <div 
            className="flex-[0_0_35%] border-l flex flex-col"
            style={{ 
              borderColor: '#2a2a2a',
              backgroundColor: '#1a1a1a',
            }}
          >
            {/* Graph editor header */}
            <div 
              className="shrink-0 border-b px-3 py-2 flex items-center justify-between"
              style={{
                height: RULER_HEIGHT,
                backgroundColor: '#1a1a1a',
                borderColor: '#2a2a2a',
              }}
            >
              <span 
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: AE_COLORS.textSecondary }}
              >
                Graph Editor
              </span>
            </div>
            
            {/* Graph editor content */}
            <div className="flex-1 overflow-hidden">
              <GraphEditor
                layer={selection.layerIds.length === 1 
                  ? composition?.layers.find(l => l.id === selection.layerIds[0]) ?? null
                  : null
                }
                selectedPropertyPath={graphEditorSelectedProperty}
                fps={fps}
                currentFrame={currentFrame}
                duration={duration}
                onUpdateKeyframe={updateKeyframe}
                onSeek={setCurrentFrame}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompositionTimeline;
