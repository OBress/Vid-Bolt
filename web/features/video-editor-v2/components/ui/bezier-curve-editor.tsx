/**
 * BezierCurveEditor - Interactive cubic bezier curve editor
 * 
 * Features:
 * - SVG-based curve visualization
 * - Draggable P1 and P2 control points
 * - Real-time curve preview as you drag
 * - Preset buttons that animate to new positions
 * - Copy/paste bezier values
 * - Grid background with timing markers
 * - Visual feedback with control point handles
 */

import * as React from "react";
import { cn } from "../../utils/general/utils";
import { Button } from "./button";
import { Input } from "./input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { Copy, Check, ChevronDown } from "lucide-react";

// Bezier curve type
export type BezierCurve = [number, number, number, number];

// Preset curves
export interface BezierPreset {
  name: string;
  value: BezierCurve;
  category: string;
}

export const BEZIER_PRESETS: BezierPreset[] = [
  // Basic
  { name: "Linear", value: [0, 0, 1, 1], category: "Basic" },
  { name: "Ease", value: [0.25, 0.1, 0.25, 1], category: "Basic" },
  { name: "Ease In", value: [0.42, 0, 1, 1], category: "Basic" },
  { name: "Ease Out", value: [0, 0, 0.58, 1], category: "Basic" },
  { name: "Ease In Out", value: [0.42, 0, 0.58, 1], category: "Basic" },
  
  // Strong
  { name: "Ease In Cubic", value: [0.55, 0.055, 0.675, 0.19], category: "Strong" },
  { name: "Ease Out Cubic", value: [0.215, 0.61, 0.355, 1], category: "Strong" },
  { name: "Ease In Out Cubic", value: [0.645, 0.045, 0.355, 1], category: "Strong" },
  
  // Dramatic
  { name: "Ease In Expo", value: [0.95, 0.05, 0.795, 0.035], category: "Dramatic" },
  { name: "Ease Out Expo", value: [0.19, 1, 0.22, 1], category: "Dramatic" },
  { name: "Ease In Out Expo", value: [1, 0, 0, 1], category: "Dramatic" },
  
  // Bounce
  { name: "Ease In Back", value: [0.6, -0.28, 0.735, 0.045], category: "Bounce" },
  { name: "Ease Out Back", value: [0.175, 0.885, 0.32, 1.275], category: "Bounce" },
  { name: "Ease In Out Back", value: [0.68, -0.55, 0.265, 1.55], category: "Bounce" },
];

export interface BezierCurveEditorProps {
  /** Current bezier curve values [x1, y1, x2, y2] */
  value: BezierCurve;
  /** Callback when curve changes */
  onChange: (value: BezierCurve) => void;
  /** Width of the editor (default: 200) */
  width?: number;
  /** Height of the editor (default: 200) */
  height?: number;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Show preset selector */
  showPresets?: boolean;
  /** Show copy button */
  showCopy?: boolean;
  /** Show numeric inputs */
  showInputs?: boolean;
  /** Additional class names */
  className?: string;
}

export const BezierCurveEditor = React.forwardRef<HTMLDivElement, BezierCurveEditorProps>(
  (
    {
      value,
      onChange,
      width = 200,
      height = 200,
      disabled = false,
      showPresets = true,
      showCopy = true,
      showInputs = true,
      className,
    },
    ref
  ) => {
    const svgRef = React.useRef<SVGSVGElement>(null);
    const [draggingPoint, setDraggingPoint] = React.useState<"p1" | "p2" | null>(null);
    const [copied, setCopied] = React.useState(false);
    const [animatingTo, setAnimatingTo] = React.useState<BezierCurve | null>(null);

    // Padding for the graph area
    const padding = 20;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Convert bezier coordinates to SVG coordinates
    const toSvgX = React.useCallback((x: number) => padding + x * graphWidth, [graphWidth]);
    const toSvgY = React.useCallback((y: number) => padding + (1 - y) * graphHeight, [graphHeight]);
    
    // Convert SVG coordinates to bezier coordinates
    const toBezierX = React.useCallback((svgX: number) => {
      return Math.max(0, Math.min(1, (svgX - padding) / graphWidth));
    }, [graphWidth]);
    
    const toBezierY = React.useCallback((svgY: number) => {
      return Math.max(-0.5, Math.min(1.5, 1 - (svgY - padding) / graphHeight));
    }, [graphHeight]);

    // Current control points
    const [x1, y1, x2, y2] = value;
    const p1SvgX = toSvgX(x1);
    const p1SvgY = toSvgY(y1);
    const p2SvgX = toSvgX(x2);
    const p2SvgY = toSvgY(y2);

    // Generate the bezier curve path
    const curvePath = React.useMemo(() => {
      const startX = toSvgX(0);
      const startY = toSvgY(0);
      const endX = toSvgX(1);
      const endY = toSvgY(1);
      
      return `M ${startX} ${startY} C ${p1SvgX} ${p1SvgY}, ${p2SvgX} ${p2SvgY}, ${endX} ${endY}`;
    }, [toSvgX, toSvgY, p1SvgX, p1SvgY, p2SvgX, p2SvgY]);

    // Handle mouse down on control point
    const handlePointMouseDown = React.useCallback((point: "p1" | "p2") => (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setDraggingPoint(point);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, [disabled]);

    // Handle mouse move (dragging)
    React.useEffect(() => {
      if (!draggingPoint) return;

      const handleMouseMove = (e: MouseEvent) => {
        if (!svgRef.current) return;
        
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = e.clientX - rect.left;
        const svgY = e.clientY - rect.top;
        
        const newX = toBezierX(svgX);
        const newY = toBezierY(svgY);
        
        if (draggingPoint === "p1") {
          onChange([newX, newY, x2, y2]);
        } else {
          onChange([x1, y1, newX, newY]);
        }
      };

      const handleMouseUp = () => {
        setDraggingPoint(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [draggingPoint, onChange, toBezierX, toBezierY, x1, y1, x2, y2]);

    // Animate to preset
    const animateToPreset = React.useCallback((preset: BezierCurve) => {
      setAnimatingTo(preset);
      
      const startValue = [...value] as BezierCurve;
      const startTime = performance.now();
      const duration = 300;
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        const newValue: BezierCurve = [
          startValue[0] + (preset[0] - startValue[0]) * eased,
          startValue[1] + (preset[1] - startValue[1]) * eased,
          startValue[2] + (preset[2] - startValue[2]) * eased,
          startValue[3] + (preset[3] - startValue[3]) * eased,
        ];
        
        onChange(newValue);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setAnimatingTo(null);
        }
      };
      
      requestAnimationFrame(animate);
    }, [value, onChange]);

    // Copy bezier values to clipboard
    const handleCopy = React.useCallback(() => {
      const text = `cubic-bezier(${value.join(", ")})`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, [value]);

    // Handle input change
    const handleInputChange = React.useCallback((index: number, inputValue: string) => {
      const num = parseFloat(inputValue);
      if (isNaN(num)) return;
      
      const newValue = [...value] as BezierCurve;
      // Clamp x values to 0-1, allow y values to be -0.5 to 1.5
      if (index === 0 || index === 2) {
        newValue[index] = Math.max(0, Math.min(1, num));
      } else {
        newValue[index] = Math.max(-0.5, Math.min(1.5, num));
      }
      onChange(newValue);
    }, [value, onChange]);

    // Generate grid lines
    const gridLines = React.useMemo(() => {
      const lines = [];
      
      // Vertical lines
      for (let i = 0; i <= 4; i++) {
        const x = toSvgX(i / 4);
        lines.push(
          <line
            key={`v${i}`}
            x1={x}
            y1={toSvgY(0)}
            x2={x}
            y2={toSvgY(1)}
            stroke="currentColor"
            strokeWidth={i === 0 || i === 4 ? 1 : 0.5}
            opacity={i === 0 || i === 4 ? 0.3 : 0.1}
          />
        );
      }
      
      // Horizontal lines
      for (let i = 0; i <= 4; i++) {
        const y = toSvgY(i / 4);
        lines.push(
          <line
            key={`h${i}`}
            x1={toSvgX(0)}
            y1={y}
            x2={toSvgX(1)}
            y2={y}
            stroke="currentColor"
            strokeWidth={i === 0 || i === 4 ? 1 : 0.5}
            opacity={i === 0 || i === 4 ? 0.3 : 0.1}
          />
        );
      }
      
      // Diagonal reference line (linear)
      lines.push(
        <line
          key="diagonal"
          x1={toSvgX(0)}
          y1={toSvgY(0)}
          x2={toSvgX(1)}
          y2={toSvgY(1)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.2}
        />
      );
      
      return lines;
    }, [toSvgX, toSvgY]);

    // Group presets by category
    const presetsByCategory = React.useMemo(() => {
      const grouped: Record<string, BezierPreset[]> = {};
      BEZIER_PRESETS.forEach(preset => {
        if (!grouped[preset.category]) {
          grouped[preset.category] = [];
        }
        grouped[preset.category].push(preset);
      });
      return grouped;
    }, []);

    // Find current preset name if value matches
    const currentPresetName = React.useMemo(() => {
      const preset = BEZIER_PRESETS.find(p => 
        Math.abs(p.value[0] - value[0]) < 0.01 &&
        Math.abs(p.value[1] - value[1]) < 0.01 &&
        Math.abs(p.value[2] - value[2]) < 0.01 &&
        Math.abs(p.value[3] - value[3]) < 0.01
      );
      return preset?.name || "Custom";
    }, [value]);

    return (
      <div ref={ref} className={cn("flex flex-col gap-2", className)}>
        {/* Preset selector */}
        {showPresets && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex-1 justify-between"
                  disabled={disabled}
                >
                  <span>{currentPresetName}</span>
                  <ChevronDown className="h-3 w-3 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-2">
                  {Object.entries(presetsByCategory).map(([category, presets]) => (
                    <div key={category}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">
                        {category}
                      </div>
                      <div className="space-y-0.5">
                        {presets.map(preset => (
                          <button
                            key={preset.name}
                            onClick={() => animateToPreset(preset.value)}
                            className={cn(
                              "w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors",
                              currentPresetName === preset.name && "bg-accent text-accent-foreground"
                            )}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            
            {showCopy && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCopy}
                      disabled={disabled}
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copied ? "Copied!" : "Copy CSS"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {/* SVG Editor */}
        <div className="relative bg-muted/30 rounded-lg border border-border overflow-hidden">
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cn(
              "block",
              disabled && "opacity-50 pointer-events-none"
            )}
          >
            {/* Grid */}
            <g className="text-muted-foreground">
              {gridLines}
            </g>
            
            {/* Control point lines to endpoints */}
            <line
              x1={toSvgX(0)}
              y1={toSvgY(0)}
              x2={p1SvgX}
              y2={p1SvgY}
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              opacity={0.5}
            />
            <line
              x1={toSvgX(1)}
              y1={toSvgY(1)}
              x2={p2SvgX}
              y2={p2SvgY}
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              opacity={0.5}
            />
            
            {/* Bezier curve */}
            <path
              d={curvePath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            
            {/* Start point (0, 0) */}
            <circle
              cx={toSvgX(0)}
              cy={toSvgY(0)}
              r={4}
              fill="hsl(var(--muted-foreground))"
            />
            
            {/* End point (1, 1) */}
            <circle
              cx={toSvgX(1)}
              cy={toSvgY(1)}
              r={4}
              fill="hsl(var(--muted-foreground))"
            />
            
            {/* Control point P1 */}
            <g
              onMouseDown={handlePointMouseDown("p1")}
              style={{ cursor: disabled ? "default" : "grab" }}
            >
              <circle
                cx={p1SvgX}
                cy={p1SvgY}
                r={12}
                fill="transparent"
              />
              <circle
                cx={p1SvgX}
                cy={p1SvgY}
                r={7}
                fill="hsl(var(--background))"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                className={cn(
                  "transition-all",
                  draggingPoint === "p1" && "r-[8px]"
                )}
                style={{
                  filter: draggingPoint === "p1" ? "drop-shadow(0 0 6px hsl(var(--primary)))" : undefined
                }}
              />
              <text
                x={p1SvgX}
                y={p1SvgY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8}
                fontWeight="bold"
                fill="hsl(var(--primary))"
                pointerEvents="none"
              >
                1
              </text>
            </g>
            
            {/* Control point P2 */}
            <g
              onMouseDown={handlePointMouseDown("p2")}
              style={{ cursor: disabled ? "default" : "grab" }}
            >
              <circle
                cx={p2SvgX}
                cy={p2SvgY}
                r={12}
                fill="transparent"
              />
              <circle
                cx={p2SvgX}
                cy={p2SvgY}
                r={7}
                fill="hsl(var(--background))"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                className={cn(
                  "transition-all",
                  draggingPoint === "p2" && "r-[8px]"
                )}
                style={{
                  filter: draggingPoint === "p2" ? "drop-shadow(0 0 6px hsl(var(--primary)))" : undefined
                }}
              />
              <text
                x={p2SvgX}
                y={p2SvgY + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8}
                fontWeight="bold"
                fill="hsl(var(--primary))"
                pointerEvents="none"
              >
                2
              </text>
            </g>
            
            {/* Axis labels */}
            <text
              x={padding}
              y={height - 4}
              fontSize={9}
              fill="currentColor"
              opacity={0.4}
            >
              Time
            </text>
            <text
              x={4}
              y={padding + 10}
              fontSize={9}
              fill="currentColor"
              opacity={0.4}
              transform={`rotate(-90, 8, ${padding + 20})`}
            >
              Progress
            </text>
          </svg>
        </div>

        {/* Numeric inputs */}
        {showInputs && (
          <div className="grid grid-cols-4 gap-1">
            {["x1", "y1", "x2", "y2"].map((label, index) => (
              <div key={label} className="space-y-0.5">
                <label className="text-[9px] text-muted-foreground uppercase block text-center">
                  {label}
                </label>
                <Input
                  type="number"
                  min={index % 2 === 0 ? 0 : -0.5}
                  max={index % 2 === 0 ? 1 : 1.5}
                  step={0.01}
                  value={value[index].toFixed(2)}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  disabled={disabled}
                  className="h-6 text-[10px] text-center px-1"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

BezierCurveEditor.displayName = "BezierCurveEditor";

export default BezierCurveEditor;
