/**
 * BezierCurveEditor - Premiere Pro style easing curve editor
 * Clean, professional design with larger canvas
 */

import React, { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { cn } from '../../../utils/general/utils';
import type { KeyframeInterpolation, BezierHandles, InterpolationType } from '../../../types/keyframes';
import { getPresetBezierHandles } from '../../../types/keyframes';
import { ChevronRight } from 'lucide-react';

// ==========================================
// TYPES
// ==========================================

interface BezierCurveEditorProps {
  interpolation: KeyframeInterpolation;
  onChange: (interpolation: KeyframeInterpolation) => void;
  disabled?: boolean;
}

interface Point {
  x: number;
  y: number;
}

// ==========================================
// PRESET DEFINITIONS
// ==========================================

interface EasingPreset {
  type: InterpolationType;
  label: string;
  category: 'basic' | 'smooth' | 'dramatic' | 'bounce' | 'special';
}

const EASING_PRESETS: EasingPreset[] = [
  { type: 'linear', label: 'Linear', category: 'basic' },
  { type: 'hold', label: 'Hold', category: 'basic' },
  { type: 'ease', label: 'Ease', category: 'smooth' },
  { type: 'ease-in', label: 'Ease In', category: 'smooth' },
  { type: 'ease-out', label: 'Ease Out', category: 'smooth' },
  { type: 'ease-in-out', label: 'Ease In Out', category: 'smooth' },
  { type: 'ease-in-quad', label: 'Ease In Quad', category: 'smooth' },
  { type: 'ease-out-quad', label: 'Ease Out Quad', category: 'smooth' },
  { type: 'ease-in-out-quad', label: 'Ease In Out Quad', category: 'smooth' },
  { type: 'ease-in-cubic', label: 'Ease In Cubic', category: 'dramatic' },
  { type: 'ease-out-cubic', label: 'Ease Out Cubic', category: 'dramatic' },
  { type: 'ease-in-out-cubic', label: 'Ease In Out Cubic', category: 'dramatic' },
  { type: 'ease-in-quart', label: 'Ease In Quart', category: 'dramatic' },
  { type: 'ease-out-quart', label: 'Ease Out Quart', category: 'dramatic' },
  { type: 'ease-in-out-quart', label: 'Ease In Out Quart', category: 'dramatic' },
  { type: 'ease-in-expo', label: 'Ease In Expo', category: 'dramatic' },
  { type: 'ease-out-expo', label: 'Ease Out Expo', category: 'dramatic' },
  { type: 'ease-in-out-expo', label: 'Ease In Out Expo', category: 'dramatic' },
  { type: 'ease-in-back', label: 'Ease In Back', category: 'bounce' },
  { type: 'ease-out-back', label: 'Ease Out Back', category: 'bounce' },
  { type: 'ease-in-out-back', label: 'Ease In Out Back', category: 'bounce' },
  { type: 'ease-out-bounce', label: 'Bounce', category: 'special' },
  { type: 'ease-in-elastic', label: 'Elastic In', category: 'special' },
  { type: 'ease-out-elastic', label: 'Elastic Out', category: 'special' },
  { type: 'ease-in-out-elastic', label: 'Elastic', category: 'special' },
];

const CATEGORIES = [
  { key: 'basic', label: 'Basic', color: '#9ca3af', icon: '●' },
  { key: 'smooth', label: 'Smooth', color: '#60a5fa', icon: '◗' },
  { key: 'dramatic', label: 'Dramatic', color: '#a78bfa', icon: '◆' },
  { key: 'bounce', label: 'Bounce', color: '#fb923c', icon: '◉' },
  { key: 'special', label: 'Special', color: '#f472b6', icon: '★' },
] as const;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function evaluateBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function generateCurvePoints(handles: BezierHandles, numPoints: number = 60): Point[] {
  const points: Point[] = [];
  const p0 = { x: 0, y: 0 };
  const p1 = { x: handles.in.x, y: handles.in.y };
  const p2 = { x: handles.out.x, y: handles.out.y };
  const p3 = { x: 1, y: 1 };
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      x: evaluateBezier(t, p0.x, p1.x, p2.x, p3.x),
      y: evaluateBezier(t, p0.y, p1.y, p2.y, p3.y),
    });
  }
  return points;
}

// View range for extended curves
const VIEW_Y_MIN = -0.4;
const VIEW_Y_MAX = 1.4;
const VIEW_Y_RANGE = VIEW_Y_MAX - VIEW_Y_MIN;

function toSvg(point: Point, width: number, height: number, padding: number): Point {
  return {
    x: padding + point.x * (width - 2 * padding),
    y: height - padding - ((point.y - VIEW_Y_MIN) / VIEW_Y_RANGE) * (height - 2 * padding),
  };
}

function fromSvg(point: Point, width: number, height: number, padding: number): Point {
  const normalizedY = VIEW_Y_MIN + (1 - (point.y - padding) / (height - 2 * padding)) * VIEW_Y_RANGE;
  return {
    x: Math.max(0, Math.min(1, (point.x - padding) / (width - 2 * padding))),
    y: Math.max(-0.6, Math.min(1.6, normalizedY)),
  };
}

function yValueToSvg(value: number, height: number, padding: number): number {
  return height - padding - ((value - VIEW_Y_MIN) / VIEW_Y_RANGE) * (height - 2 * padding);
}

// ==========================================
// MINI CURVE PREVIEW
// ==========================================

const MiniCurvePreview: React.FC<{
  type: InterpolationType;
  size?: number;
  isActive?: boolean;
}> = memo(({ type, size = 20, isActive = false }) => {
  const handles = useMemo(() => {
    const preset = getPresetBezierHandles(type);
    return preset || { in: { x: 0.25, y: 0.25 }, out: { x: 0.75, y: 0.75 } };
  }, [type]);
  
  const path = useMemo(() => {
    if (type === 'hold') {
      const p = 3;
      return `M ${p} ${size - p} L ${size/2} ${size - p} L ${size/2} ${p} L ${size - p} ${p}`;
    }
    
    const points = generateCurvePoints(handles, 20);
    const p = 3;
    
    let yMin = 0, yMax = 1;
    points.forEach(pt => {
      if (pt.y < yMin) yMin = pt.y;
      if (pt.y > yMax) yMax = pt.y;
    });
    yMin = Math.min(0, yMin) - 0.08;
    yMax = Math.max(1, yMax) + 0.08;
    const yRange = yMax - yMin;
    
    return points.map((pt, i) => {
      const x = p + pt.x * (size - 2 * p);
      const y = size - p - ((pt.y - yMin) / yRange) * (size - 2 * p);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }, [type, handles, size]);
  
  // Linear reference for comparison
  const linearPath = useMemo(() => {
    const p = 3;
    return `M ${p} ${size - p} L ${size - p} ${p}`;
  }, [size]);
  
  return (
    <svg width={size} height={size} className="shrink-0 rounded">
      <rect x={0} y={0} width={size} height={size} rx={3} fill="rgba(0,0,0,0.4)" />
      {/* Linear reference line */}
      <path d={linearPath} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} strokeDasharray="2 2" />
      {/* Curve */}
      <path 
        d={path} 
        fill="none" 
        stroke={isActive ? "#38bdf8" : "rgba(255,255,255,0.6)"} 
        strokeWidth={2} 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
});

MiniCurvePreview.displayName = 'MiniCurvePreview';

// ==========================================
// MAIN COMPONENT
// ==========================================

export const BezierCurveEditor: React.FC<BezierCurveEditorProps> = ({
  interpolation,
  onChange,
  disabled = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'in' | 'out' | null>(null);
  const [hovered, setHovered] = useState<'in' | 'out' | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('smooth');
  
  // Larger canvas dimensions
  const WIDTH = 280;
  const HEIGHT = 220;
  const PADDING = 28;
  const HANDLE_RADIUS = 8;
  
  const handles = useMemo((): BezierHandles => {
    if (interpolation.type === 'bezier' && interpolation.bezierHandles) {
      return interpolation.bezierHandles;
    }
    const preset = getPresetBezierHandles(interpolation.type);
    return preset || { in: { x: 0.25, y: 0.25 }, out: { x: 0.75, y: 0.75 } };
  }, [interpolation]);
  
  const [localHandles, setLocalHandles] = useState<BezierHandles | null>(null);
  const displayHandles = localHandles || handles;
  
  const curvePath = useMemo(() => {
    const points = generateCurvePoints(displayHandles);
    const svgPoints = points.map(p => toSvg(p, WIDTH, HEIGHT, PADDING));
    return svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [displayHandles]);
  
  const startPoint = toSvg({ x: 0, y: 0 }, WIDTH, HEIGHT, PADDING);
  const endPoint = toSvg({ x: 1, y: 1 }, WIDTH, HEIGHT, PADDING);
  const inHandle = toSvg(displayHandles.in, WIDTH, HEIGHT, PADDING);
  const outHandle = toSvg(displayHandles.out, WIDTH, HEIGHT, PADDING);
  const y0Line = yValueToSvg(0, HEIGHT, PADDING);
  const y1Line = yValueToSvg(1, HEIGHT, PADDING);
  
  const handleMouseDown = useCallback((handle: 'in' | 'out') => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    setLocalHandles(handles);
  }, [disabled, handles]);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const normalized = fromSvg({ x: e.clientX - rect.left, y: e.clientY - rect.top }, WIDTH, HEIGHT, PADDING);
    
    if (dragging === 'in') {
      normalized.x = Math.max(0, Math.min(0.6, normalized.x));
    } else {
      normalized.x = Math.max(0.4, Math.min(1, normalized.x));
    }
    
    const newHandles: BezierHandles = {
      ...(localHandles || handles),
      [dragging]: { x: normalized.x, y: normalized.y },
    };
    
    setLocalHandles(newHandles);
    onChange({ type: 'bezier', bezierHandles: newHandles });
  }, [dragging, handles, localHandles, onChange]);
  
  const handleMouseUp = useCallback(() => {
    if (localHandles) {
      onChange({ type: 'bezier', bezierHandles: localHandles });
    }
    setDragging(null);
    setLocalHandles(null);
  }, [localHandles, onChange]);
  
  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);
  
  const handlePresetClick = useCallback((type: InterpolationType) => {
    if (disabled) return;
    const preset = getPresetBezierHandles(type);
    if (preset) {
      onChange({ type, bezierHandles: preset });
    } else {
      onChange({ type });
    }
  }, [disabled, onChange]);
  
  return (
    <div className="flex flex-col gap-3">
      {/* Graph Canvas */}
      <div className={cn(
        "relative rounded-lg overflow-hidden",
        "bg-neutral-900 border border-neutral-700",
        disabled && "opacity-50 pointer-events-none"
      )}>
        <svg
          ref={svgRef}
          width={WIDTH}
          height={HEIGHT}
          className="block select-none cursor-crosshair"
          style={{ touchAction: 'none' }}
        >
          {/* Background */}
          <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#171717" />
          
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const x = PADDING + t * (WIDTH - 2 * PADDING);
            return (
              <line key={`v${i}`} x1={x} y1={PADDING} x2={x} y2={HEIGHT - PADDING}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            );
          })}
          
          {/* Y = 0 and Y = 1 reference lines */}
          <line x1={PADDING} y1={y0Line} x2={WIDTH - PADDING} y2={y0Line}
            stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <line x1={PADDING} y1={y1Line} x2={WIDTH - PADDING} y2={y1Line}
            stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          
          {/* Midline dashed */}
          <line x1={PADDING} y1={yValueToSvg(0.5, HEIGHT, PADDING)} x2={WIDTH - PADDING} y2={yValueToSvg(0.5, HEIGHT, PADDING)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="4 4" />
          
          {/* Axis labels */}
          <text x={PADDING - 8} y={y0Line + 4} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="end">0</text>
          <text x={PADDING - 8} y={y1Line + 4} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="end">1</text>
          <text x={PADDING} y={HEIGHT - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="start">0</text>
          <text x={WIDTH - PADDING} y={HEIGHT - 8} fill="rgba(255,255,255,0.25)" fontSize="10" textAnchor="end">1</text>
          
          {/* Linear reference diagonal */}
          <line x1={startPoint.x} y1={startPoint.y} x2={endPoint.x} y2={endPoint.y}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4 4" />
          
          {/* Handle lines */}
          <line x1={startPoint.x} y1={startPoint.y} x2={inHandle.x} y2={inHandle.y}
            stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" />
          <line x1={endPoint.x} y1={endPoint.y} x2={outHandle.x} y2={outHandle.y}
            stroke="#4ade80" strokeWidth={2} strokeLinecap="round" />
          
          {/* Curve */}
          <path d={curvePath} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          
          {/* Start/End anchor points */}
          <circle cx={startPoint.x} cy={startPoint.y} r={5} fill="#404040" stroke="#666" strokeWidth={2} />
          <circle cx={endPoint.x} cy={endPoint.y} r={5} fill="#404040" stroke="#666" strokeWidth={2} />
          
          {/* In handle */}
          <circle
            cx={inHandle.x}
            cy={inHandle.y}
            r={dragging === 'in' || hovered === 'in' ? HANDLE_RADIUS + 2 : HANDLE_RADIUS}
            fill="#38bdf8"
            stroke="#0ea5e9"
            strokeWidth={2}
            className="cursor-move"
            style={{ 
              filter: dragging === 'in' ? 'drop-shadow(0 0 8px #38bdf8)' : undefined,
              transition: dragging ? 'none' : 'r 100ms ease-out'
            }}
            onMouseDown={handleMouseDown('in')}
            onMouseEnter={() => !dragging && setHovered('in')}
            onMouseLeave={() => !dragging && setHovered(null)}
          />
          
          {/* Out handle */}
          <circle
            cx={outHandle.x}
            cy={outHandle.y}
            r={dragging === 'out' || hovered === 'out' ? HANDLE_RADIUS + 2 : HANDLE_RADIUS}
            fill="#4ade80"
            stroke="#22c55e"
            strokeWidth={2}
            className="cursor-move"
            style={{ 
              filter: dragging === 'out' ? 'drop-shadow(0 0 8px #4ade80)' : undefined,
              transition: dragging ? 'none' : 'r 100ms ease-out'
            }}
            onMouseDown={handleMouseDown('out')}
            onMouseEnter={() => !dragging && setHovered('out')}
            onMouseLeave={() => !dragging && setHovered(null)}
          />
        </svg>
        
        {/* Current type badge */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-xs font-medium text-white/70 capitalize">
          {interpolation.type === 'bezier' ? 'Custom' : interpolation.type.replace(/-/g, ' ')}
        </div>
      </div>
      
      {/* Handle coordinates */}
      <div className="flex justify-between px-1 text-xs font-mono text-neutral-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <span>In: ({displayHandles.in.x.toFixed(2)}, {displayHandles.in.y.toFixed(2)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span>Out: ({displayHandles.out.x.toFixed(2)}, {displayHandles.out.y.toFixed(2)})</span>
        </div>
      </div>
      
      {/* Presets */}
      <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900">
        <div className="px-3 py-2 border-b border-neutral-700 bg-neutral-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-300">Presets</span>
            <span className="text-xs text-neutral-500">{EASING_PRESETS.length} total</span>
          </div>
        </div>
        
        <div className="max-h-[200px] overflow-y-auto inspector-scrollbar">
          {CATEGORIES.map(cat => {
            const presets = EASING_PRESETS.filter(p => p.category === cat.key);
            const isExpanded = expandedCategory === cat.key;
            const categoryColor = cat.color;
            
            return (
              <div key={cat.key} className="border-b border-neutral-800 last:border-b-0">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                  className="flex items-center justify-between w-full px-3 py-2 hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: categoryColor }}>{cat.icon}</span>
                    <span className="text-xs font-medium text-neutral-300">{cat.label}</span>
                    <span className="text-xs text-neutral-500">({presets.length})</span>
                  </div>
                  <ChevronRight className={cn(
                    "w-3.5 h-3.5 text-neutral-500 transition-transform duration-150",
                    isExpanded && "rotate-90"
                  )} />
                </button>
                
                {isExpanded && (
                  <div className="px-2 pb-2 grid grid-cols-2 gap-1.5">
                    {presets.map(preset => {
                      const isActive = interpolation.type === preset.type;
                      return (
                        <button
                          key={preset.type}
                          onClick={() => handlePresetClick(preset.type)}
                          disabled={disabled}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 rounded text-left transition-all",
                            "bg-neutral-800/40 hover:bg-neutral-700/60",
                            isActive && "bg-sky-500/20 ring-1 ring-sky-500/40 hover:bg-sky-500/25"
                          )}
                        >
                          <div className="shrink-0 p-0.5 rounded" style={{ backgroundColor: isActive ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.05)' }}>
                            <MiniCurvePreview type={preset.type} size={22} isActive={isActive} />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className={cn(
                              "text-xs font-medium truncate",
                              isActive ? "text-sky-300" : "text-neutral-300"
                            )}>
                              {preset.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Help text */}
      <p className="text-xs text-neutral-500 px-1">
        Drag handles to customize curve
      </p>
    </div>
  );
};

export default BezierCurveEditor;
