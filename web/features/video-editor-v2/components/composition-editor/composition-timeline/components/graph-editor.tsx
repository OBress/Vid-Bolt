/**
 * GraphEditor - After Effects style graph editor for keyframe curves
 * 
 * Features:
 * - Value graph showing property values over time
 * - Bezier curve editing with handles
 * - Zoom and pan
 * - Multiple property overlays
 */

import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import type { CompositionLayer } from '../../../../types/composition';
import type { PropertyKeyframes, Keyframe } from '../../../../types/keyframes';

interface GraphEditorProps {
  layer: CompositionLayer | null;
  selectedPropertyPath: string | null;
  fps: number;
  currentFrame: number;
  duration: number;
  onUpdateKeyframe: (layerId: string, propertyPath: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  onSeek: (frame: number) => void;
}

// Colors for different properties
const PROPERTY_COLORS: Record<string, string> = {
  'transform.x': '#ff6b6b',
  'transform.y': '#51cf66',
  'transform.scaleX': '#339af0',
  'transform.scaleY': '#339af0',
  'transform.rotation': '#ffd43b',
  'transform.opacity': '#cc5de8',
  'transform.anchorX': '#ff922b',
  'transform.anchorY': '#ff922b',
};

// Interpolation function
function interpolateKeyframes(
  keyframes: Keyframe[],
  time: number,
  fps: number
): number | undefined {
  if (keyframes.length === 0) return undefined;
  if (keyframes.length === 1) return keyframes[0].value as number;
  
  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  
  // Find surrounding keyframes
  let prevKf: Keyframe | null = null;
  let nextKf: Keyframe | null = null;
  
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].time <= time) {
      prevKf = sorted[i];
    }
    if (sorted[i].time >= time && !nextKf) {
      nextKf = sorted[i];
    }
  }
  
  if (!prevKf) return sorted[0].value as number;
  if (!nextKf) return sorted[sorted.length - 1].value as number;
  if (prevKf === nextKf) return prevKf.value as number;
  
  // Interpolate based on type
  const t = (time - prevKf.time) / (nextKf.time - prevKf.time);
  const type = prevKf.interpolation?.type || 'linear';
  
  let easedT = t;
  switch (type) {
    case 'hold':
      easedT = 0;
      break;
    case 'ease-in':
      easedT = t * t;
      break;
    case 'ease-out':
      easedT = 1 - (1 - t) * (1 - t);
      break;
    case 'ease-in-out':
      easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      break;
    case 'bezier':
      // TODO: Use actual bezier handles
      easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      break;
  }
  
  const prevValue = prevKf.value as number;
  const nextValue = nextKf.value as number;
  return prevValue + (nextValue - prevValue) * easedT;
}

export const GraphEditor: React.FC<GraphEditorProps> = ({
  layer,
  selectedPropertyPath,
  fps,
  currentFrame,
  duration,
  onUpdateKeyframe,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragKeyframe, setDragKeyframe] = useState<{
    propertyPath: string;
    keyframeId: string;
    handleType: 'main' | 'in' | 'out';
  } | null>(null);
  
  // Zoom and pan
  const [viewRange, setViewRange] = useState({ start: 0, end: duration / fps });
  const [valueRange, setValueRange] = useState({ min: -100, max: 100 });
  
  // Get all keyframed properties
  const keyframedProperties = useMemo(() => {
    if (!layer?.keyframes) return [];
    return layer.keyframes.filter(pk => pk.keyframes.length > 0);
  }, [layer?.keyframes]);
  
  // Calculate value range from keyframes
  useEffect(() => {
    if (keyframedProperties.length === 0) return;
    
    let min = Infinity;
    let max = -Infinity;
    
    for (const pk of keyframedProperties) {
      for (const kf of pk.keyframes) {
        const value = kf.value as number;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    
    // Add padding
    const range = max - min || 1;
    const padding = range * 0.2;
    setValueRange({
      min: min - padding,
      max: max + padding,
    });
  }, [keyframedProperties]);
  
  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Convert time to x position
  const timeToX = useCallback((time: number) => {
    const { start, end } = viewRange;
    return ((time - start) / (end - start)) * dimensions.width;
  }, [viewRange, dimensions.width]);
  
  // Convert value to y position
  const valueToY = useCallback((value: number) => {
    const { min, max } = valueRange;
    return dimensions.height - ((value - min) / (max - min)) * dimensions.height;
  }, [valueRange, dimensions.height]);
  
  // Convert x position to time
  const xToTime = useCallback((x: number) => {
    const { start, end } = viewRange;
    return start + (x / dimensions.width) * (end - start);
  }, [viewRange, dimensions.width]);
  
  // Convert y position to value
  const yToValue = useCallback((y: number) => {
    const { min, max } = valueRange;
    return min + ((dimensions.height - y) / dimensions.height) * (max - min);
  }, [valueRange, dimensions.height]);
  
  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = dimensions;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Clear
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.5;
    
    // Vertical lines (time)
    const timeStep = (viewRange.end - viewRange.start) / 10;
    for (let t = viewRange.start; t <= viewRange.end; t += timeStep) {
      const x = timeToX(t);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines (value)
    const valueStep = (valueRange.max - valueRange.min) / 5;
    for (let v = valueRange.min; v <= valueRange.max; v += valueStep) {
      const y = valueToY(v);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw zero line
    if (valueRange.min < 0 && valueRange.max > 0) {
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1;
      const y = valueToY(0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw curves for each property
    for (const pk of keyframedProperties) {
      const color = PROPERTY_COLORS[pk.propertyPath] || '#f9a825';
      const isSelected = pk.propertyPath === selectedPropertyPath;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.globalAlpha = isSelected ? 1 : 0.5;
      
      // Draw curve
      ctx.beginPath();
      let firstPoint = true;
      
      const step = (viewRange.end - viewRange.start) / width;
      for (let t = viewRange.start; t <= viewRange.end; t += step) {
        const value = interpolateKeyframes(pk.keyframes, t, fps);
        if (value === undefined) continue;
        
        const x = timeToX(t);
        const y = valueToY(value);
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      
      // Draw keyframe points
      for (const kf of pk.keyframes) {
        const x = timeToX(kf.time);
        const y = valueToY(kf.value as number);
        
        // Main keyframe point
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, isSelected ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Selection ring
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      
      ctx.globalAlpha = 1;
    }
    
    // Draw playhead
    const playheadX = timeToX(currentFrame / fps);
    ctx.strokeStyle = '#ff3b3b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
  }, [dimensions, keyframedProperties, selectedPropertyPath, viewRange, valueRange, currentFrame, fps, timeToX, valueToY]);
  
  // Handle mouse interactions
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !layer) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = xToTime(x);
    const value = yToValue(y);
    
    // Check if clicking on a keyframe
    for (const pk of keyframedProperties) {
      for (const kf of pk.keyframes) {
        const kfX = timeToX(kf.time);
        const kfY = valueToY(kf.value as number);
        
        const dist = Math.sqrt((x - kfX) ** 2 + (y - kfY) ** 2);
        if (dist < 8) {
          setIsDragging(true);
          setDragKeyframe({
            propertyPath: pk.propertyPath,
            keyframeId: kf.id,
            handleType: 'main',
          });
          return;
        }
      }
    }
    
    // Otherwise, seek
    onSeek(Math.round(time * fps));
  }, [layer, keyframedProperties, xToTime, yToValue, timeToX, valueToY, fps, onSeek]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragKeyframe || !layer) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = Math.max(0, xToTime(x));
    const value = yToValue(y);
    
    if (dragKeyframe.handleType === 'main') {
      onUpdateKeyframe(layer.id, dragKeyframe.propertyPath, dragKeyframe.keyframeId, {
        time,
        value,
      });
    }
  }, [isDragging, dragKeyframe, layer, xToTime, yToValue, onUpdateKeyframe]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragKeyframe(null);
  }, []);
  
  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (e.ctrlKey || e.metaKey) {
      // Zoom value range
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const center = (valueRange.max + valueRange.min) / 2;
      const range = valueRange.max - valueRange.min;
      const newRange = range * delta;
      
      setValueRange({
        min: center - newRange / 2,
        max: center + newRange / 2,
      });
    } else if (e.shiftKey) {
      // Zoom time range
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const center = (viewRange.end + viewRange.start) / 2;
      const range = viewRange.end - viewRange.start;
      const newRange = Math.max(0.5, Math.min(duration / fps, range * delta));
      
      setViewRange({
        start: Math.max(0, center - newRange / 2),
        end: Math.min(duration / fps, center + newRange / 2),
      });
    } else {
      // Pan
      const panAmount = e.deltaX / dimensions.width * (viewRange.end - viewRange.start);
      const newStart = Math.max(0, viewRange.start + panAmount);
      const newEnd = Math.min(duration / fps, viewRange.end + panAmount);
      
      if (newEnd - newStart === viewRange.end - viewRange.start) {
        setViewRange({ start: newStart, end: newEnd });
      }
    }
  }, [valueRange, viewRange, duration, fps, dimensions.width]);
  
  if (!layer) {
    return (
      <div 
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: '#141414' }}
      >
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: '#b8b8b8' }}>
            Graph Editor
          </p>
          <p className="text-xs mt-1" style={{ color: '#888888' }}>
            Select a layer to view its animation curves
          </p>
        </div>
      </div>
    );
  }
  
  if (keyframedProperties.length === 0) {
    return (
      <div 
        className="h-full flex items-center justify-center"
        style={{ backgroundColor: '#141414' }}
      >
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: '#b8b8b8' }}>
            No Keyframes
          </p>
          <p className="text-xs mt-1" style={{ color: '#888888' }}>
            Add keyframes to see animation curves
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className="h-full relative overflow-hidden"
      style={{ backgroundColor: '#141414' }}
    >
      {/* Property legend */}
      <div 
        className="absolute top-2 left-2 z-10 flex flex-col gap-1 p-2 rounded"
        style={{ backgroundColor: '#1a1a1add', border: '1px solid #2a2a2a' }}
      >
        {keyframedProperties.map((pk) => (
          <div 
            key={pk.propertyPath}
            className={cn(
              "flex items-center gap-1.5 text-[10px] cursor-pointer",
              pk.propertyPath === selectedPropertyPath && "font-medium"
            )}
          >
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: PROPERTY_COLORS[pk.propertyPath] || '#f9a825' }}
            />
            <span style={{ color: '#f0f0f0' }}>
              {pk.propertyPath.split('.').pop()}
            </span>
          </div>
        ))}
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* Value labels */}
      <div 
        className="absolute right-1 top-1 bottom-1 flex flex-col justify-between pointer-events-none"
      >
        <span className="text-[8px] font-mono" style={{ color: '#888888' }}>
          {valueRange.max.toFixed(0)}
        </span>
        <span className="text-[8px] font-mono" style={{ color: '#888888' }}>
          {valueRange.min.toFixed(0)}
        </span>
      </div>
    </div>
  );
};

export default GraphEditor;
