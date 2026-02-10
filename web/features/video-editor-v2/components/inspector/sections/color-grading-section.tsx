/**
 * ColorGradingSection - Professional color grading controls
 * Modeled after Premiere Pro / DaVinci Resolve color panels
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Overlay, VisualOverlay } from "../../../types";
import { cn } from "../../../utils/general/utils";
import { RotateCcw } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface CurvePoint {
  x: number; // 0-255 input value
  y: number; // 0-255 output value
}

interface ColorGradingValues {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  rgbCurve: CurvePoint[];
  redCurve: CurvePoint[];
  greenCurve: CurvePoint[];
  blueCurve: CurvePoint[];
}

const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 }
];

const DEFAULT_COLOR_GRADING: ColorGradingValues = {
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  rgbCurve: [...DEFAULT_CURVE],
  redCurve: [...DEFAULT_CURVE],
  greenCurve: [...DEFAULT_CURVE],
  blueCurve: [...DEFAULT_CURVE],
};

type TabId = "basic" | "curves";
type CurveChannel = "rgb" | "red" | "green" | "blue";

// ============================================================================
// Slider Component
// ============================================================================

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  gradient?: string;
}

const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = -100,
  max = 100,
  label,
  gradient,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync external value when not dragging
  useEffect(() => {
    if (!isDragging) setLocalValue(value);
  }, [value, isDragging]);

  // Calculate value from mouse position
  const calculateValue = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return localValue;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(min + percent * (max - min));
    },
    [min, max, localValue]
  );

  // Mouse down handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const newValue = calculateValue(e.clientX);
      setLocalValue(newValue);
      onChangeRef.current(newValue);
    },
    [calculateValue]
  );

  // Global mouse move/up handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newValue = calculateValue(e.clientX);
      setLocalValue(newValue);
      onChangeRef.current(newValue);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, calculateValue]);

  // Calculate visual positions
  const percent = ((localValue - min) / (max - min)) * 100;
  const centerPercent = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const isBidirectional = min < 0 && max > 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-400 w-20 shrink-0">{label}</span>
      <div
        ref={trackRef}
        className="flex-1 h-2 rounded-full cursor-pointer bg-neutral-700 relative"
        style={gradient ? { background: gradient } : undefined}
        onMouseDown={handleMouseDown}
      >
        {isBidirectional ? (
          <>
            <div
              className="absolute inset-y-0 bg-blue-500 rounded-full"
              style={{
                left: localValue < 0 ? `${percent}%` : `${centerPercent}%`,
                width: `${Math.abs(percent - centerPercent)}%`,
              }}
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-neutral-500"
              style={{ left: `${centerPercent}%` }}
            />
          </>
        ) : (
          <div
            className="absolute inset-y-0 left-0 bg-blue-500 rounded-l-full"
            style={{ width: `${percent}%` }}
          />
        )}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow border border-neutral-400 transition-transform",
            isDragging && "scale-110"
          )}
          style={{ left: `calc(${percent}% - 8px)` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-mono w-8 text-right tabular-nums",
          localValue === 0 ? "text-neutral-600" : "text-neutral-300"
        )}
      >
        {localValue}
      </span>
    </div>
  );
};

// ============================================================================
// Curves Editor Component
// ============================================================================

interface CurvesEditorProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  channel: CurveChannel;
}

const CurvesEditor: React.FC<CurvesEditorProps> = ({ points, onChange, channel }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [localPoints, setLocalPoints] = useState(points);
  const [hasDragged, setHasDragged] = useState(false);
  const [pendingAddPoint, setPendingAddPoint] = useState<{ x: number; y: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const localPointsRef = useRef(localPoints);
  localPointsRef.current = localPoints;

  // Sync external points when not dragging
  useEffect(() => {
    if (dragIndex === null) setLocalPoints(points);
  }, [points, dragIndex]);

  // Channel colors
  const color =
    channel === "red" ? "#ef4444" :
    channel === "green" ? "#22c55e" :
    channel === "blue" ? "#3b82f6" : "#ffffff";

  // SVG dimensions - grid is 100x100, with padding for control points
  const gridSize = 100;
  const padding = 4;
  const viewBoxSize = gridSize + padding * 2;

  // Convert mouse position to curve value (0-255)
  const mouseToValue = useCallback(
    (clientX: number, clientY: number): CurvePoint => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      
      // Convert to SVG coordinates
      const svgX = ((clientX - rect.left) / rect.width) * viewBoxSize - padding;
      const svgY = ((clientY - rect.top) / rect.height) * viewBoxSize - padding;
      
      // Convert to value (0-255), Y is inverted
      return {
        x: Math.round(Math.max(0, Math.min(255, (svgX / gridSize) * 255))),
        y: Math.round(Math.max(0, Math.min(255, (1 - svgY / gridSize) * 255))),
      };
    },
    [viewBoxSize, gridSize, padding]
  );

  // Convert curve value to SVG coordinate
  const valueToSvg = useCallback(
    (point: CurvePoint) => ({
      x: padding + (point.x / 255) * gridSize,
      y: padding + (1 - point.y / 255) * gridSize,
    }),
    [gridSize, padding]
  );

  // Handle mouse down on SVG background (not on a point) - prepare to add point
  const handleBackgroundMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left click
      if (e.button !== 0) return;
      
      const clickPoint = mouseToValue(e.clientX, e.clientY);
      
      // Check if click is too close to existing point
      if (localPointsRef.current.some((p) => Math.abs(p.x - clickPoint.x) < 20)) {
        return;
      }
      
      // Store the potential add point - will add on mouseup if no drag occurred
      setPendingAddPoint(clickPoint);
      setHasDragged(false);
    },
    [mouseToValue]
  );

  // Handle mouse down on a control point - start dragging
  const handlePointMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation(); // Prevent background handler
      if (e.button !== 0) return;
      
      setDragIndex(index);
      setHasDragged(false);
      setPendingAddPoint(null);
    },
    []
  );

  // Handle double-click to remove point
  const handlePointDoubleClick = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      // Can't remove first or last point
      if (index === 0 || index === localPoints.length - 1) return;
      
      const newPoints = localPoints.filter((_, i) => i !== index);
      setLocalPoints(newPoints);
      onChangeRef.current(newPoints);
    },
    [localPoints]
  );

  // Handle drag and mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Mark that we've dragged
      setHasDragged(true);
      
      if (dragIndex === null) return;
      
      const value = mouseToValue(e.clientX, e.clientY);
      
      setLocalPoints((prev) => {
        const newPoints = [...prev];
        
        // First and last points can only move vertically
        if (dragIndex === 0) {
          newPoints[0] = { x: 0, y: value.y };
        } else if (dragIndex === prev.length - 1) {
          newPoints[dragIndex] = { x: 255, y: value.y };
        } else {
          // Middle points are constrained between neighbors
          const minX = prev[dragIndex - 1].x + 5;
          const maxX = prev[dragIndex + 1].x - 5;
          newPoints[dragIndex] = {
            x: Math.max(minX, Math.min(maxX, value.x)),
            y: value.y,
          };
        }
        
        return newPoints;
      });
    };

    const handleMouseUp = () => {
      // If we were dragging a point, commit the change
      if (dragIndex !== null) {
        onChangeRef.current(localPointsRef.current);
        setDragIndex(null);
      }
      
      // If we had a pending add point and didn't drag, add it now
      if (pendingAddPoint && !hasDragged) {
        const newPoints = [...localPointsRef.current, pendingAddPoint].sort((a, b) => a.x - b.x);
        setLocalPoints(newPoints);
        onChangeRef.current(newPoints);
      }
      
      setPendingAddPoint(null);
      setHasDragged(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragIndex, mouseToValue, pendingAddPoint, hasDragged]);

  // Generate smooth curve path using Catmull-Rom spline
  const generatePath = useCallback(() => {
    if (localPoints.length < 2) return "";
    
    const svgPoints = localPoints.map(valueToSvg);
    let d = `M ${svgPoints[0].x} ${svgPoints[0].y}`;
    
    for (let i = 0; i < svgPoints.length - 1; i++) {
      const p0 = svgPoints[Math.max(0, i - 1)];
      const p1 = svgPoints[i];
      const p2 = svgPoints[i + 1];
      const p3 = svgPoints[Math.min(svgPoints.length - 1, i + 2)];
      
      // Catmull-Rom to Bezier conversion
      const tension = 0.15;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    
    return d;
  }, [localPoints, valueToSvg]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full bg-neutral-800 cursor-crosshair select-none"
      onMouseDown={handleBackgroundMouseDown}
    >
      {/* Grid pattern */}
      <defs>
        <pattern id="curvesGrid" width="25" height="25" patternUnits="userSpaceOnUse" x={padding} y={padding}>
          <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#3a3a3a" strokeWidth="0.5" />
        </pattern>
      </defs>
      
      {/* Grid background */}
      <rect x={padding} y={padding} width={gridSize} height={gridSize} fill="url(#curvesGrid)" />
      
      {/* Grid border */}
      <rect x={padding} y={padding} width={gridSize} height={gridSize} fill="none" stroke="#3a3a3a" strokeWidth="0.5" />
      
      {/* Diagonal reference line (identity curve) */}
      <line
        x1={padding}
        y1={padding + gridSize}
        x2={padding + gridSize}
        y2={padding}
        stroke="#4a4a4a"
        strokeWidth="0.5"
        strokeDasharray="3,3"
      />
      
      {/* Curve line */}
      <path
        d={generatePath()}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Control points */}
      {localPoints.map((point, index) => {
        const svgPoint = valueToSvg(point);
        const isActive = dragIndex === index;
        
        return (
          <circle
            key={index}
            cx={svgPoint.x}
            cy={svgPoint.y}
            r={isActive ? 4 : 3}
            fill={color}
            stroke="#ffffff"
            strokeWidth="1"
            className="cursor-grab active:cursor-grabbing"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => handlePointMouseDown(e, index)}
            onDoubleClick={(e) => handlePointDoubleClick(e, index)}
          />
        );
      })}
    </svg>
  );
};

// ============================================================================
// Panel Components
// ============================================================================

interface PanelProps {
  colorGrading: ColorGradingValues;
  update: (changes: Partial<ColorGradingValues>) => void;
}

const BasicPanel: React.FC<PanelProps> = ({ colorGrading, update }) => (
  <div className="h-full flex flex-col gap-2">
    {/* White Balance */}
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">White Balance</span>
      <button
        onClick={() => update({ temperature: 0, tint: 0 })}
        className="text-neutral-500 hover:text-white transition-colors"
        title="Reset White Balance"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
    <Slider
      value={colorGrading.temperature}
      onChange={(temperature) => update({ temperature })}
      label="Temperature"
      gradient="linear-gradient(to right, #5b9fd9, #555, #d9a05b)"
    />
    <Slider
      value={colorGrading.tint}
      onChange={(tint) => update({ tint })}
      label="Tint"
      gradient="linear-gradient(to right, #5bd95b, #555, #d95bd9)"
    />

    {/* Tone */}
    <div className="flex items-center justify-between mt-1 pt-2 border-t border-neutral-800">
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Tone</span>
      <button
        onClick={() => update({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 })}
        className="text-neutral-500 hover:text-white transition-colors"
        title="Reset Tone"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
    <Slider value={colorGrading.exposure} onChange={(exposure) => update({ exposure })} label="Exposure" />
    <Slider value={colorGrading.contrast} onChange={(contrast) => update({ contrast })} label="Contrast" />
    <Slider value={colorGrading.highlights} onChange={(highlights) => update({ highlights })} label="Highlights" />
    <Slider value={colorGrading.shadows} onChange={(shadows) => update({ shadows })} label="Shadows" />
    <Slider value={colorGrading.whites} onChange={(whites) => update({ whites })} label="Whites" />
    <Slider value={colorGrading.blacks} onChange={(blacks) => update({ blacks })} label="Blacks" />

    {/* Color */}
    <div className="flex items-center justify-between mt-1 pt-2 border-t border-neutral-800">
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Color</span>
      <button
        onClick={() => update({ saturation: 0, vibrance: 0 })}
        className="text-neutral-500 hover:text-white transition-colors"
        title="Reset Color"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
    <Slider value={colorGrading.vibrance} onChange={(vibrance) => update({ vibrance })} label="Vibrance" />
    <Slider
      value={colorGrading.saturation}
      onChange={(saturation) => update({ saturation })}
      label="Saturation"
      gradient="linear-gradient(to right, #555, #e88, #ee8, #8e8, #8ee, #88e, #e8e)"
    />
  </div>
);

const CurvesPanel: React.FC<PanelProps> = ({ colorGrading, update }) => {
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  
  const curveKey = channel === "rgb" ? "rgbCurve" : channel === "red" ? "redCurve" : channel === "green" ? "greenCurve" : "blueCurve";
  const currentCurve = colorGrading[curveKey] || DEFAULT_CURVE;

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Channel selector */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex bg-neutral-800 rounded p-0.5">
          {(["rgb", "red", "green", "blue"] as CurveChannel[]).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded transition-colors",
                channel === ch
                  ? ch === "rgb" ? "bg-neutral-600 text-white"
                    : ch === "red" ? "bg-red-600 text-white"
                    : ch === "green" ? "bg-green-600 text-white"
                    : "bg-blue-600 text-white"
                  : "text-neutral-500 hover:text-white"
              )}
            >
              {ch === "rgb" ? "RGB" : ch[0].toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => update({ [curveKey]: [...DEFAULT_CURVE] })}
          className="text-neutral-500 hover:text-white transition-colors"
          title="Reset Curve"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Curves editor - fills remaining space */}
      <div className="flex-1 min-h-0">
        <CurvesEditor
          points={currentCurve}
          onChange={(points) => update({ [curveKey]: points })}
          channel={channel}
        />
      </div>

      {/* Instructions */}
      <p className="text-xs text-neutral-500 text-center shrink-0">
        Click to add point • Drag to adjust • Double-click to remove
      </p>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

interface ColorGradingSectionProps {
  overlay: Overlay;
  onUpdate: (updates: Partial<Overlay>) => void;
}

export const ColorGradingSection: React.FC<ColorGradingSectionProps> = ({ overlay, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<TabId>("basic");

  // Get current color grading values with defaults
  const colorGrading: ColorGradingValues = {
    ...DEFAULT_COLOR_GRADING,
    ...((overlay as any).styles?.colorGrading || {}),
  };

  // Update handler
  const update = useCallback(
    (changes: Partial<ColorGradingValues>) => {
      onUpdate({
        styles: {
          ...(overlay as VisualOverlay).styles,
          colorGrading: { ...colorGrading, ...changes },
        },
      } as Partial<Overlay>);
    },
    [overlay, colorGrading, onUpdate]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab navigation */}
      <div className="shrink-0 px-3 py-2 border-b border-neutral-800">
        <div className="flex bg-neutral-800 rounded p-0.5">
          {[
            { id: "basic", label: "Basic" },
            { id: "curves", label: "Curves" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded transition-colors",
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-neutral-500 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto inspector-scrollbar">
        {activeTab === "basic" && <BasicPanel colorGrading={colorGrading} update={update} />}
        {activeTab === "curves" && <CurvesPanel colorGrading={colorGrading} update={update} />}
      </div>
    </div>
  );
};

// Exports
export type { ColorGradingValues, CurvePoint };
export { DEFAULT_COLOR_GRADING };
export default ColorGradingSection;
