/**
 * GraphEditor Component
 * 
 * Professional bezier curve graph editor for fine-tuning keyframe animations.
 * Similar to After Effects / Premiere Pro graph editor.
 * 
 * Features:
 * - Canvas-based curve visualization
 * - Value graph and Velocity graph modes (like Premiere Pro)
 * - Draggable bezier handles for in/out tangents
 * - Multi-property overlay view
 * - Value axis (Y) and time axis (X)
 * - Zoom and pan controls
 * - Preset curve buttons
 * - Box selection for multiple keyframes
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Activity,
  TrendingUp,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../utils/general/utils';
import { useVideoEditorStore } from '../../../stores/video-editor-store';
import type { 
  PropertyKeyframes, 
  Keyframe, 
  KeyframeInterpolation,
  BezierHandles,
} from '../../../types/keyframes';
import { 
  STANDARD_ANIMATABLE_PROPERTIES, 
  DEFAULT_BEZIER_HANDLES,
  getPresetBezierHandles,
  EASE_IN_OUT_HANDLES,
} from '../../../types/keyframes';
import { sampleInterpolatedValues, extractNumber } from '../../../utils/keyframe-interpolator';
import { Button } from '../../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../ui/toggle-group';

// ==========================================
// TYPES
// ==========================================

interface GraphEditorProps {
  clipId: string;
  propertyPath: string;
  propertyKeyframes: PropertyKeyframes;
  duration: number;
  currentTime: number;
  height?: number;
  onKeyframeSelect?: (keyframeId: string) => void;
  onClose?: () => void;
  /** Additional properties to overlay on the graph */
  overlayProperties?: { path: string; keyframes: PropertyKeyframes }[];
  /** Whether to show overlay properties */
  showOverlay?: boolean;
}

interface Point {
  x: number;
  y: number;
}

type GraphMode = 'value' | 'velocity';

// ==========================================
// CONSTANTS
// ==========================================

const PADDING = { top: 24, right: 20, bottom: 32, left: 55 };
const KEYFRAME_RADIUS = 6;
const HANDLE_RADIUS = 5;
const CURVE_SAMPLES = 100;
const VELOCITY_SAMPLES = 50;

// Preset easing curves
const EASING_PRESETS = [
  { name: 'Linear', type: 'linear' as const, icon: '/' },
  { name: 'Ease', type: 'ease-in-out' as const, icon: 'S' },
  { name: 'Ease In', type: 'ease-in' as const, icon: '⌐' },
  { name: 'Ease Out', type: 'ease-out' as const, icon: '⌙' },
  { name: 'Hold', type: 'hold' as const, icon: '⌐⌙' },
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getPropertyColor(propertyPath: string): string {
  const prop = STANDARD_ANIMATABLE_PROPERTIES.find(p => p.path === propertyPath);
  return prop?.color ?? '#6B7280';
}

function getPropertyName(propertyPath: string): string {
  const prop = STANDARD_ANIMATABLE_PROPERTIES.find(p => p.path === propertyPath);
  return prop?.name ?? propertyPath.split('.').pop() ?? '';
}

/**
 * Calculate velocity (rate of change) from value samples
 */
function calculateVelocitySamples(
  samples: { time: number; value: any }[]
): { time: number; velocity: number }[] {
  if (samples.length < 2) return [];
  
  const velocities: { time: number; velocity: number }[] = [];
  
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].time - samples[i - 1].time;
    if (dt > 0) {
      const dv = extractNumber(samples[i].value) - extractNumber(samples[i - 1].value);
      const velocity = dv / dt;
      velocities.push({
        time: (samples[i].time + samples[i - 1].time) / 2,
        velocity,
      });
    }
  }
  
  return velocities;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const GraphEditor: React.FC<GraphEditorProps> = ({
  clipId,
  propertyPath,
  propertyKeyframes,
  duration,
  currentTime,
  height = 220,
  onKeyframeSelect,
  onClose,
  overlayProperties = [],
  showOverlay = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(400);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'keyframe' | 'handleIn' | 'handleOut' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [graphMode, setGraphMode] = useState<GraphMode>('value');
  const [showOverlayProperties, setShowOverlayProperties] = useState(showOverlay);
  const [hoveredKeyframeId, setHoveredKeyframeId] = useState<string | null>(null);
  
  // Box selection state
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxStart, setBoxStart] = useState<Point | null>(null);
  const [boxEnd, setBoxEnd] = useState<Point | null>(null);
  const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<string[]>([]);
  
  const { updateKeyframe, setKeyframeInterpolation } = useVideoEditorStore();
  
  const propertyColor = useMemo(() => getPropertyColor(propertyPath), [propertyPath]);
  const keyframes = propertyKeyframes.keyframes;
  
  // Calculate value range
  const valueRange = useMemo(() => {
    if (keyframes.length === 0) return { min: 0, max: 100 };
    
    let values = keyframes.map(kf => extractNumber(kf.value));
    
    // Include overlay properties in range calculation
    if (showOverlayProperties) {
      overlayProperties.forEach(prop => {
        prop.keyframes.keyframes.forEach(kf => {
          values.push(extractNumber(kf.value));
        });
      });
    }
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range * 0.15 || 10;
    
    return {
      min: min - padding,
      max: max + padding,
    };
  }, [keyframes, overlayProperties, showOverlayProperties]);
  
  // Calculate velocity range for velocity mode
  const velocityRange = useMemo(() => {
    if (graphMode !== 'velocity' || keyframes.length < 2) {
      return { min: -100, max: 100 };
    }
    
    const defaultValue = keyframes[0]?.value ?? 0;
    const samples = sampleInterpolatedValues(
      propertyKeyframes,
      0,
      duration,
      VELOCITY_SAMPLES,
      defaultValue
    );
    
    const velocities = calculateVelocitySamples(samples);
    if (velocities.length === 0) return { min: -100, max: 100 };
    
    const velocityValues = velocities.map(v => v.velocity);
    const min = Math.min(...velocityValues);
    const max = Math.max(...velocityValues);
    const range = max - min;
    const padding = range * 0.2 || 10;
    
    return {
      min: min - padding,
      max: max + padding,
    };
  }, [graphMode, keyframes, propertyKeyframes, duration]);
  
  const currentRange = graphMode === 'velocity' ? velocityRange : valueRange;
  
  // Convert time to canvas X
  const timeToX = useCallback((time: number): number => {
    const plotWidth = canvasWidth - PADDING.left - PADDING.right;
    const x = PADDING.left + (time / duration) * plotWidth * zoom + pan.x;
    return x;
  }, [canvasWidth, duration, zoom, pan.x]);
  
  // Convert value to canvas Y
  const valueToY = useCallback((value: number): number => {
    const plotHeight = height - PADDING.top - PADDING.bottom;
    const normalizedValue = (value - currentRange.min) / (currentRange.max - currentRange.min);
    const y = height - PADDING.bottom - normalizedValue * plotHeight * zoom + pan.y;
    return y;
  }, [height, currentRange, zoom, pan.y]);
  
  // Convert canvas X to time
  const xToTime = useCallback((x: number): number => {
    const plotWidth = canvasWidth - PADDING.left - PADDING.right;
    const time = ((x - PADDING.left - pan.x) / (plotWidth * zoom)) * duration;
    return Math.max(0, Math.min(duration, time));
  }, [canvasWidth, duration, zoom, pan.x]);
  
  // Convert canvas Y to value
  const yToValue = useCallback((y: number): number => {
    const plotHeight = height - PADDING.top - PADDING.bottom;
    const normalizedValue = (height - PADDING.bottom - y + pan.y) / (plotHeight * zoom);
    return currentRange.min + normalizedValue * (currentRange.max - currentRange.min);
  }, [height, currentRange, zoom, pan.y]);
  
  // Sample curve for visualization
  const curveSamples = useMemo(() => {
    if (keyframes.length < 2) return [];
    
    const defaultValue = keyframes[0]?.value ?? 0;
    return sampleInterpolatedValues(
      propertyKeyframes,
      0,
      duration,
      CURVE_SAMPLES,
      defaultValue
    );
  }, [propertyKeyframes, duration, keyframes]);
  
  // Velocity samples for velocity graph mode
  const velocitySamples = useMemo(() => {
    if (graphMode !== 'velocity') return [];
    return calculateVelocitySamples(curveSamples);
  }, [graphMode, curveSamples]);
  
  // Overlay curve samples
  const overlayCurveSamples = useMemo(() => {
    if (!showOverlayProperties) return [];
    
    return overlayProperties.map(prop => ({
      path: prop.path,
      color: getPropertyColor(prop.path),
      samples: prop.keyframes.keyframes.length >= 2
        ? sampleInterpolatedValues(
            prop.keyframes,
            0,
            duration,
            CURVE_SAMPLES,
            prop.keyframes.keyframes[0]?.value ?? 0
          )
        : [],
    }));
  }, [overlayProperties, showOverlayProperties, duration]);
  
  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Draw the graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size with device pixel ratio for sharpness
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    
    // Clear with dark background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvasWidth, height);
    
    // Draw grid
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 1;
    
    // Vertical grid lines (time)
    const timeStep = duration / 10;
    for (let t = 0; t <= duration; t += timeStep) {
      const x = timeToX(t);
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, height - PADDING.bottom);
      ctx.stroke();
    }
    
    // Horizontal grid lines (value/velocity)
    const valueStep = (currentRange.max - currentRange.min) / 5;
    for (let v = currentRange.min; v <= currentRange.max; v += valueStep) {
      const y = valueToY(v);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(canvasWidth - PADDING.right, y);
      ctx.stroke();
    }
    
    // Draw zero line for velocity graph
    if (graphMode === 'velocity' && currentRange.min < 0 && currentRange.max > 0) {
      const zeroY = valueToY(0);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, zeroY);
      ctx.lineTo(canvasWidth - PADDING.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    // Draw axis labels
    ctx.fillStyle = '#525252';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    
    // Time labels
    for (let t = 0; t <= duration; t += timeStep * 2) {
      const x = timeToX(t);
      ctx.fillText(`${t.toFixed(1)}s`, x, height - 10);
    }
    
    // Value labels
    ctx.textAlign = 'right';
    for (let v = currentRange.min; v <= currentRange.max; v += valueStep) {
      const y = valueToY(v);
      const label = graphMode === 'velocity' 
        ? `${v.toFixed(0)}/s`
        : `${Math.round(v)}`;
      ctx.fillText(label, PADDING.left - 8, y + 3);
    }
    
    // Draw current time line
    const currentX = timeToX(currentTime);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(currentX, PADDING.top);
    ctx.lineTo(currentX, height - PADDING.bottom);
    ctx.stroke();
    
    // Draw playhead triangle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(currentX - 5, PADDING.top);
    ctx.lineTo(currentX + 5, PADDING.top);
    ctx.lineTo(currentX, PADDING.top + 8);
    ctx.closePath();
    ctx.fill();
    
    // Draw overlay curves (behind main curve)
    if (showOverlayProperties && graphMode === 'value') {
      overlayCurveSamples.forEach(({ color, samples }) => {
        if (samples.length < 2) return;
        
        ctx.strokeStyle = color + '60'; // 40% opacity
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        const firstSample = samples[0];
        ctx.moveTo(timeToX(firstSample.time), valueToY(extractNumber(firstSample.value)));
        
        for (let i = 1; i < samples.length; i++) {
          const sample = samples[i];
          ctx.lineTo(timeToX(sample.time), valueToY(extractNumber(sample.value)));
        }
        
        ctx.stroke();
      });
    }
    
    // Draw the main curve or velocity curve
    if (graphMode === 'velocity') {
      // Velocity graph
      if (velocitySamples.length > 1) {
        ctx.strokeStyle = '#f59e0b'; // Amber for velocity
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        ctx.moveTo(timeToX(velocitySamples[0].time), valueToY(velocitySamples[0].velocity));
        
        for (let i = 1; i < velocitySamples.length; i++) {
          const sample = velocitySamples[i];
          ctx.lineTo(timeToX(sample.time), valueToY(sample.velocity));
        }
        
        ctx.stroke();
        
        // Fill area under curve
        ctx.lineTo(timeToX(velocitySamples[velocitySamples.length - 1].time), valueToY(0));
        ctx.lineTo(timeToX(velocitySamples[0].time), valueToY(0));
        ctx.closePath();
        ctx.fillStyle = '#f59e0b15';
        ctx.fill();
      }
    } else {
      // Value graph
      if (curveSamples.length > 1) {
        ctx.strokeStyle = propertyColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const firstSample = curveSamples[0];
        ctx.moveTo(timeToX(firstSample.time), valueToY(extractNumber(firstSample.value)));
        
        for (let i = 1; i < curveSamples.length; i++) {
          const sample = curveSamples[i];
          ctx.lineTo(timeToX(sample.time), valueToY(extractNumber(sample.value)));
        }
        
        ctx.stroke();
      }
    }
    
    // Draw keyframes (only in value mode)
    if (graphMode === 'value') {
      for (const kf of keyframes) {
        const x = timeToX(kf.time);
        const y = valueToY(extractNumber(kf.value));
        const isSelected = selectedKeyframeIds.includes(kf.id) || kf.id === selectedKeyframeId;
        const isHovered = kf.id === hoveredKeyframeId;
        
        // Draw bezier handles for selected keyframe
        if (isSelected && kf.interpolation.type === 'bezier' && kf.interpolation.bezierHandles) {
          const handles = kf.interpolation.bezierHandles;
          
          // Find surrounding keyframes for handle positioning
          const kfIndex = keyframes.indexOf(kf);
          const prevKf = kfIndex > 0 ? keyframes[kfIndex - 1] : null;
          const nextKf = kfIndex < keyframes.length - 1 ? keyframes[kfIndex + 1] : null;
          
          // Draw handles
          ctx.strokeStyle = '#52525b';
          ctx.lineWidth = 1;
          
          // In handle (from previous keyframe)
          if (prevKf) {
            const prevX = timeToX(prevKf.time);
            const prevY = valueToY(extractNumber(prevKf.value));
            const handleInX = x - (x - prevX) * (1 - handles.in.x);
            const handleInY = y - (y - prevY) * (1 - handles.in.y);
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(handleInX, handleInY);
            ctx.stroke();
            
            // Handle dot
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(handleInX, handleInY, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          
          // Out handle (to next keyframe)
          if (nextKf) {
            const nextX = timeToX(nextKf.time);
            const nextY = valueToY(extractNumber(nextKf.value));
            const handleOutX = x + (nextX - x) * handles.out.x;
            const handleOutY = y + (nextY - y) * handles.out.y;
            
            ctx.strokeStyle = '#52525b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(handleOutX, handleOutY);
            ctx.stroke();
            
            // Handle dot
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(handleOutX, handleOutY, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        
        // Draw keyframe diamond
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        
        const radius = isHovered ? KEYFRAME_RADIUS + 2 : KEYFRAME_RADIUS;
        ctx.fillStyle = isSelected ? '#ffffff' : propertyColor;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        
        if (isSelected || isHovered) {
          ctx.strokeStyle = isSelected ? propertyColor : '#ffffff80';
          ctx.lineWidth = 2;
          ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
        }
        
        ctx.restore();
      }
    }
    
    // Draw box selection rectangle
    if (isBoxSelecting && boxStart && boxEnd) {
      const minX = Math.min(boxStart.x, boxEnd.x);
      const minY = Math.min(boxStart.y, boxEnd.y);
      const boxWidth = Math.abs(boxEnd.x - boxStart.x);
      const boxHeight = Math.abs(boxEnd.y - boxStart.y);
      
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(minX, minY, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX, minY, boxWidth, boxHeight);
    }
    
  }, [
    canvasWidth, 
    height, 
    keyframes, 
    curveSamples, 
    velocitySamples,
    currentTime, 
    timeToX, 
    valueToY, 
    currentRange, 
    propertyColor,
    selectedKeyframeId,
    selectedKeyframeIds,
    hoveredKeyframeId,
    duration,
    graphMode,
    showOverlayProperties,
    overlayCurveSamples,
    isBoxSelecting,
    boxStart,
    boxEnd,
  ]);
  
  // Find keyframe at position
  const findKeyframeAtPosition = useCallback((x: number, y: number): Keyframe | null => {
    for (const kf of keyframes) {
      const kfX = timeToX(kf.time);
      const kfY = valueToY(extractNumber(kf.value));
      
      const dist = Math.sqrt((x - kfX) ** 2 + (y - kfY) ** 2);
      if (dist < KEYFRAME_RADIUS * 2.5) {
        return kf;
      }
    }
    return null;
  }, [keyframes, timeToX, valueToY]);
  
  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking on a keyframe
    const clickedKf = findKeyframeAtPosition(x, y);
    
    if (clickedKf) {
      const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
      
      if (isMultiSelect) {
        setSelectedKeyframeIds(prev => 
          prev.includes(clickedKf.id)
            ? prev.filter(id => id !== clickedKf.id)
            : [...prev, clickedKf.id]
        );
      } else {
        setSelectedKeyframeId(clickedKf.id);
        setSelectedKeyframeIds([clickedKf.id]);
      }
      
      setIsDragging(true);
      setDragType('keyframe');
      onKeyframeSelect?.(clickedKf.id);
      return;
    }
    
    // Start box selection
    setIsBoxSelecting(true);
    setBoxStart({ x, y });
    setBoxEnd({ x, y });
    
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedKeyframeId(null);
      setSelectedKeyframeIds([]);
    }
  }, [findKeyframeAtPosition, onKeyframeSelect]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle box selection
    if (isBoxSelecting) {
      setBoxEnd({ x, y });
      return;
    }
    
    // Handle keyframe hover
    const hoveredKf = findKeyframeAtPosition(x, y);
    setHoveredKeyframeId(hoveredKf?.id ?? null);
    
    // Handle dragging keyframes
    if (isDragging && dragType === 'keyframe' && graphMode === 'value') {
      const newTime = xToTime(x);
      const newValue = yToValue(y);
      
      // Move all selected keyframes
      const idsToMove = selectedKeyframeIds.length > 0 ? selectedKeyframeIds : (selectedKeyframeId ? [selectedKeyframeId] : []);
      
      if (idsToMove.length === 1) {
        // Single keyframe - move directly
        updateKeyframe(clipId, propertyPath, idsToMove[0], {
          time: newTime,
          value: newValue,
        });
      }
    }
  }, [isBoxSelecting, findKeyframeAtPosition, isDragging, dragType, graphMode, selectedKeyframeId, selectedKeyframeIds, clipId, propertyPath, xToTime, yToValue, updateKeyframe]);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Finalize box selection
    if (isBoxSelecting && boxStart && boxEnd) {
      const minX = Math.min(boxStart.x, boxEnd.x);
      const maxX = Math.max(boxStart.x, boxEnd.x);
      const minY = Math.min(boxStart.y, boxEnd.y);
      const maxY = Math.max(boxStart.y, boxEnd.y);
      
      // Only select if box is larger than 5px
      if (maxX - minX > 5 && maxY - minY > 5) {
        const keyframesInBox = keyframes.filter(kf => {
          const kfX = timeToX(kf.time);
          const kfY = valueToY(extractNumber(kf.value));
          return kfX >= minX && kfX <= maxX && kfY >= minY && kfY <= maxY;
        });
        
        if (keyframesInBox.length > 0) {
          const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey;
          if (addToSelection) {
            setSelectedKeyframeIds(prev => [
              ...prev,
              ...keyframesInBox.map(kf => kf.id).filter(id => !prev.includes(id))
            ]);
          } else {
            setSelectedKeyframeIds(keyframesInBox.map(kf => kf.id));
          }
          
          if (keyframesInBox.length === 1) {
            setSelectedKeyframeId(keyframesInBox[0].id);
          }
        }
      }
    }
    
    setIsBoxSelecting(false);
    setBoxStart(null);
    setBoxEnd(null);
    setIsDragging(false);
    setDragType(null);
  }, [isBoxSelecting, boxStart, boxEnd, keyframes, timeToX, valueToY]);
  
  // Handle preset selection
  const handlePresetSelect = useCallback((type: KeyframeInterpolation['type']) => {
    const idsToUpdate = selectedKeyframeIds.length > 0 ? selectedKeyframeIds : (selectedKeyframeId ? [selectedKeyframeId] : []);
    if (idsToUpdate.length === 0) return;
    
    const handles = type === 'bezier' ? DEFAULT_BEZIER_HANDLES : getPresetBezierHandles(type);
    
    idsToUpdate.forEach(id => {
      setKeyframeInterpolation(clipId, propertyPath, id, {
        type,
        bezierHandles: handles ?? undefined,
      });
    });
  }, [selectedKeyframeId, selectedKeyframeIds, clipId, propertyPath, setKeyframeInterpolation]);
  
  // Easy Ease selected keyframes
  const handleEasyEase = useCallback(() => {
    const idsToUpdate = selectedKeyframeIds.length > 0 ? selectedKeyframeIds : (selectedKeyframeId ? [selectedKeyframeId] : []);
    if (idsToUpdate.length === 0) return;
    
    idsToUpdate.forEach(id => {
      setKeyframeInterpolation(clipId, propertyPath, id, {
        type: 'ease-in-out',
        bezierHandles: EASE_IN_OUT_HANDLES,
      });
    });
  }, [selectedKeyframeId, selectedKeyframeIds, clipId, propertyPath, setKeyframeInterpolation]);
  
  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(4, z * 1.25));
  }, []);
  
  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(0.25, z / 1.25));
  }, []);
  
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  
  const hasSelection = selectedKeyframeIds.length > 0 || selectedKeyframeId !== null;
  
  return (
    <TooltipProvider>
      <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: propertyColor }}
              />
              <span className="text-xs font-medium">
                {getPropertyName(propertyPath)}
              </span>
            </div>
            
            {/* Graph mode toggle */}
            <ToggleGroup 
              type="single" 
              value={graphMode} 
              onValueChange={(v) => v && setGraphMode(v as GraphMode)}
              className="bg-muted/50 rounded p-0.5"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="value" className="h-6 w-6 p-0 data-[state=on]:bg-background">
                    <TrendingUp className="h-3 w-3" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Value Graph</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value="velocity" className="h-6 w-6 p-0 data-[state=on]:bg-background">
                    <Activity className="h-3 w-3" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>Velocity Graph (Speed)</TooltipContent>
              </Tooltip>
            </ToggleGroup>
            
            {/* Overlay toggle */}
            {overlayProperties.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn("h-6 w-6", showOverlayProperties && "bg-muted")}
                    onClick={() => setShowOverlayProperties(prev => !prev)}
                  >
                    {showOverlayProperties ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showOverlayProperties ? 'Hide Other Properties' : 'Show Other Properties'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Easy Ease button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn("h-6 w-6", !hasSelection && "opacity-50")}
                  onClick={handleEasyEase}
                  disabled={!hasSelection}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Easy Ease (F9)</TooltipContent>
            </Tooltip>
            
            <div className="w-px h-4 bg-border mx-1" />
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomOut}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomIn}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleResetView}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit to View</TooltipContent>
            </Tooltip>
          </div>
        </div>
        
        {/* Canvas */}
        <div 
          ref={containerRef} 
          className="relative select-none"
          style={{ height }}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              "w-full h-full",
              graphMode === 'value' ? "cursor-crosshair" : "cursor-default"
            )}
            onMouseDown={graphMode === 'value' ? handleMouseDown : undefined}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          
          {/* Mode indicator */}
          {graphMode === 'velocity' && (
            <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500/20 text-amber-400 text-[10px] font-medium rounded">
              Velocity (read-only)
            </div>
          )}
        </div>
        
        {/* Preset buttons - only show in value mode */}
        {graphMode === 'value' && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-border bg-muted/30">
            <span className="text-[10px] text-muted-foreground mr-2">Easing:</span>
            {EASING_PRESETS.map(preset => (
              <Tooltip key={preset.type}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2 text-[10px]",
                      !hasSelection && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => handlePresetSelect(preset.type)}
                    disabled={!hasSelection}
                  >
                    {preset.name}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{preset.name} interpolation</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        
        {/* Selection info / Instructions */}
        <div className="px-3 py-1.5 bg-muted/20 text-[10px] text-muted-foreground/70 flex items-center justify-between">
          <span>
            {graphMode === 'velocity' 
              ? 'Velocity graph shows rate of change over time'
              : 'Click keyframe to select • Drag to move • Shift+click for multi-select • Drag box to select multiple'
            }
          </span>
          {selectedKeyframeIds.length > 0 && (
            <span className="text-primary">
              {selectedKeyframeIds.length} selected
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default GraphEditor;
