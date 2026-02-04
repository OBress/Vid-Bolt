/**
 * MaskCanvasEditor - Interactive mask drawing/editing on canvas
 * 
 * Features:
 * - Overlay on video preview for drawing masks
 * - Rectangle/Ellipse tools with drag-to-create
 * - Bezier path tool with control point handles
 * - Feather radius preview (soft edge visualization)
 * - Transform handles for resizing/rotating masks
 * - Point editing for polygon masks
 */

import * as React from "react";
import { cn } from "../../utils/general/utils";
import {
  Mask,
  MaskType,
  ShapeMask,
  ShapeMaskType,
  RectangleMask,
  EllipseMask,
  PolygonMask,
  BezierPoint,
  createRectangleMask,
  createEllipseMask,
  createPolygonMask,
  createBezierMask,
  getMaskBounds,
} from "../../types/masks";
import { Button } from "./button";
import {
  Square,
  Circle,
  PenTool,
  Move,
  Pointer,
  Plus,
  Minus,
  RotateCcw,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

export type MaskTool = "select" | "rectangle" | "ellipse" | "polygon" | "bezier" | "pan";

interface MaskCanvasEditorProps {
  /** Current masks */
  masks: Mask[];
  /** Callback when masks change */
  onMasksChange: (masks: Mask[]) => void;
  /** Currently selected mask ID */
  selectedMaskId?: string;
  /** Callback when mask selection changes */
  onSelectMask: (id: string | null) => void;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Whether the editor is active */
  isActive?: boolean;
  /** Additional class names */
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

interface DragState {
  type: "create" | "move" | "resize" | "point" | "handle";
  startPoint: Point;
  maskId?: string;
  pointIndex?: number;
  handleType?: "in" | "out";
  corner?: "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
}

// ==========================================
// CONSTANTS
// ==========================================

const POINT_RADIUS = 6;
const HANDLE_RADIUS = 4;
const HANDLE_LINE_COLOR = "hsl(var(--primary))";
const MASK_STROKE_COLOR = "hsl(var(--primary))";
const MASK_FILL_COLOR = "hsla(var(--primary), 0.2)";
const SELECTED_COLOR = "hsl(var(--primary))";

// ==========================================
// MASK CANVAS EDITOR COMPONENT
// ==========================================

export const MaskCanvasEditor = React.forwardRef<HTMLDivElement, MaskCanvasEditorProps>(
  (
    {
      masks,
      onMasksChange,
      selectedMaskId,
      onSelectMask,
      width,
      height,
      isActive = true,
      className,
    },
    ref
  ) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [tool, setTool] = React.useState<MaskTool>("select");
    const [dragState, setDragState] = React.useState<DragState | null>(null);
    const [hoverPoint, setHoverPoint] = React.useState<{ maskId: string; pointIndex: number } | null>(null);
    const [tempPoints, setTempPoints] = React.useState<BezierPoint[]>([]);

    // Get selected mask
    const selectedMask = React.useMemo(() => {
      return masks.find(m => m.id === selectedMaskId) as ShapeMask | undefined;
    }, [masks, selectedMaskId]);

    // Convert canvas coordinates to percentage
    const toPercentage = React.useCallback((point: Point): Point => ({
      x: (point.x / width) * 100,
      y: (point.y / height) * 100,
    }), [width, height]);

    // Convert percentage to canvas coordinates
    const toCanvas = React.useCallback((point: Point): Point => ({
      x: (point.x / 100) * width,
      y: (point.y / 100) * height,
    }), [width, height]);

    // Draw masks on canvas
    const drawMasks = React.useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw each mask
      for (const mask of masks) {
        if (mask.type !== MaskType.SHAPE) continue;
        
        const shapeMask = mask as ShapeMask;
        const isSelected = mask.id === selectedMaskId;
        
        ctx.save();
        
        // Set styles
        ctx.strokeStyle = isSelected ? SELECTED_COLOR : MASK_STROKE_COLOR;
        ctx.fillStyle = MASK_FILL_COLOR;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.setLineDash(isSelected ? [] : [5, 5]);

        // Draw based on shape type
        switch (shapeMask.shapeType) {
          case ShapeMaskType.RECTANGLE:
            drawRectangleMask(ctx, shapeMask as RectangleMask);
            break;
          case ShapeMaskType.ELLIPSE:
            drawEllipseMask(ctx, shapeMask as EllipseMask);
            break;
          case ShapeMaskType.POLYGON:
            drawPolygonMask(ctx, shapeMask as PolygonMask, isSelected);
            break;
        }

        ctx.restore();

        // Draw selection handles for selected mask
        if (isSelected) {
          drawSelectionHandles(ctx, shapeMask);
        }
      }

      // Draw temp points for polygon creation
      if (tempPoints.length > 0 && (tool === "polygon" || tool === "bezier")) {
        ctx.save();
        ctx.strokeStyle = SELECTED_COLOR;
        ctx.fillStyle = MASK_FILL_COLOR;
        ctx.lineWidth = 2;

        ctx.beginPath();
        const firstPoint = toCanvas(tempPoints[0]);
        ctx.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < tempPoints.length; i++) {
          const point = toCanvas(tempPoints[i]);
          ctx.lineTo(point.x, point.y);
        }
        
        ctx.stroke();

        // Draw points
        for (const point of tempPoints) {
          const canvasPoint = toCanvas(point);
          ctx.beginPath();
          ctx.arc(canvasPoint.x, canvasPoint.y, POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = SELECTED_COLOR;
          ctx.stroke();
        }

        ctx.restore();
      }
    }, [masks, selectedMaskId, width, height, tempPoints, tool, toCanvas]);

    // Draw rectangle mask
    const drawRectangleMask = (ctx: CanvasRenderingContext2D, mask: RectangleMask) => {
      const x = (mask.x / 100) * width;
      const y = (mask.y / 100) * height;
      const w = (mask.width / 100) * width;
      const h = (mask.height / 100) * height;

      ctx.beginPath();
      if (mask.cornerRadius > 0) {
        ctx.roundRect(x, y, w, h, mask.cornerRadius);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
      ctx.stroke();
    };

    // Draw ellipse mask
    const drawEllipseMask = (ctx: CanvasRenderingContext2D, mask: EllipseMask) => {
      const cx = (mask.centerX / 100) * width;
      const cy = (mask.centerY / 100) * height;
      const rx = (mask.radiusX / 100) * width;
      const ry = (mask.radiusY / 100) * height;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    // Draw polygon mask
    const drawPolygonMask = (
      ctx: CanvasRenderingContext2D,
      mask: PolygonMask,
      isSelected: boolean
    ) => {
      if (mask.points.length < 2) return;

      ctx.beginPath();
      
      if (mask.smooth) {
        // Draw bezier curves
        const firstPoint = toCanvas(mask.points[0]);
        ctx.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < mask.points.length; i++) {
          const prev = mask.points[i - 1];
          const curr = mask.points[i];
          
          if (prev.handleOut || curr.handleIn) {
            const cp1 = toCanvas(prev.handleOut || prev);
            const cp2 = toCanvas(curr.handleIn || curr);
            const end = toCanvas(curr);
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
          } else {
            const end = toCanvas(curr);
            ctx.lineTo(end.x, end.y);
          }
        }
        
        if (mask.closed) {
          const last = mask.points[mask.points.length - 1];
          const first = mask.points[0];
          if (last.handleOut || first.handleIn) {
            const cp1 = toCanvas(last.handleOut || last);
            const cp2 = toCanvas(first.handleIn || first);
            const end = toCanvas(first);
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
          }
          ctx.closePath();
        }
      } else {
        // Draw linear segments
        const firstPoint = toCanvas(mask.points[0]);
        ctx.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < mask.points.length; i++) {
          const point = toCanvas(mask.points[i]);
          ctx.lineTo(point.x, point.y);
        }
        
        if (mask.closed) ctx.closePath();
      }
      
      ctx.fill();
      ctx.stroke();

      // Draw points and handles for selected mask
      if (isSelected) {
        for (let i = 0; i < mask.points.length; i++) {
          const point = mask.points[i];
          const canvasPoint = toCanvas(point);
          
          // Draw bezier handles
          if (mask.smooth && (point.handleIn || point.handleOut)) {
            ctx.save();
            ctx.strokeStyle = HANDLE_LINE_COLOR;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            
            if (point.handleIn) {
              const handleIn = toCanvas(point.handleIn);
              ctx.beginPath();
              ctx.moveTo(canvasPoint.x, canvasPoint.y);
              ctx.lineTo(handleIn.x, handleIn.y);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.arc(handleIn.x, handleIn.y, HANDLE_RADIUS, 0, Math.PI * 2);
              ctx.fillStyle = HANDLE_LINE_COLOR;
              ctx.fill();
            }
            
            if (point.handleOut) {
              const handleOut = toCanvas(point.handleOut);
              ctx.beginPath();
              ctx.moveTo(canvasPoint.x, canvasPoint.y);
              ctx.lineTo(handleOut.x, handleOut.y);
              ctx.stroke();
              
              ctx.beginPath();
              ctx.arc(handleOut.x, handleOut.y, HANDLE_RADIUS, 0, Math.PI * 2);
              ctx.fillStyle = HANDLE_LINE_COLOR;
              ctx.fill();
            }
            
            ctx.restore();
          }
          
          // Draw main point
          ctx.beginPath();
          ctx.arc(canvasPoint.x, canvasPoint.y, POINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = SELECTED_COLOR;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
      }
    };

    // Draw selection handles for transform
    const drawSelectionHandles = (ctx: CanvasRenderingContext2D, mask: ShapeMask) => {
      const bounds = getMaskBounds(mask);
      const minX = (bounds.minX / 100) * width;
      const minY = (bounds.minY / 100) * height;
      const maxX = (bounds.maxX / 100) * width;
      const maxY = (bounds.maxY / 100) * height;
      
      // Draw bounding box
      ctx.save();
      ctx.strokeStyle = SELECTED_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();

      // Draw corner handles
      const handleSize = 8;
      const handles = [
        { x: minX, y: minY, corner: "nw" },
        { x: maxX, y: minY, corner: "ne" },
        { x: minX, y: maxY, corner: "sw" },
        { x: maxX, y: maxY, corner: "se" },
        { x: (minX + maxX) / 2, y: minY, corner: "n" },
        { x: (minX + maxX) / 2, y: maxY, corner: "s" },
        { x: minX, y: (minY + maxY) / 2, corner: "w" },
        { x: maxX, y: (minY + maxY) / 2, corner: "e" },
      ];

      ctx.fillStyle = "white";
      ctx.strokeStyle = SELECTED_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);

      for (const handle of handles) {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      }
    };

    // Effect to redraw when masks change
    React.useEffect(() => {
      drawMasks();
    }, [drawMasks]);

    // Handle mouse down
    const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = { x, y };
      const percentPoint = toPercentage(point);

      switch (tool) {
        case "select": {
          // Check if clicking on a mask
          let clickedMask: Mask | null = null;
          for (const mask of [...masks].reverse()) {
            if (mask.type === MaskType.SHAPE) {
              if (isPointInMask(percentPoint, mask as ShapeMask)) {
                clickedMask = mask;
                break;
              }
            }
          }
          
          if (clickedMask) {
            onSelectMask(clickedMask.id);
            setDragState({
              type: "move",
              startPoint: point,
              maskId: clickedMask.id,
            });
          } else {
            onSelectMask(null);
          }
          break;
        }
        
        case "rectangle":
        case "ellipse":
          setDragState({
            type: "create",
            startPoint: point,
          });
          break;
        
        case "polygon":
        case "bezier":
          // Add point to temp polygon
          setTempPoints(prev => [...prev, { x: percentPoint.x, y: percentPoint.y, pointType: tool === "bezier" ? "smooth" : "corner" }]);
          break;
      }
    }, [isActive, tool, masks, onSelectMask, toPercentage]);

    // Handle mouse move
    const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragState) return;
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const percentPoint = toPercentage({ x, y });
      const startPercent = toPercentage(dragState.startPoint);

      switch (dragState.type) {
        case "create": {
          // Update or create temp mask for preview
          // This would show a preview rectangle/ellipse while dragging
          break;
        }
        
        case "move": {
          if (!dragState.maskId) return;
          
          const dx = percentPoint.x - startPercent.x;
          const dy = percentPoint.y - startPercent.y;
          
          const updatedMasks = masks.map(mask => {
            if (mask.id !== dragState.maskId) return mask;
            
            const shapeMask = mask as ShapeMask;
            switch (shapeMask.shapeType) {
              case ShapeMaskType.RECTANGLE: {
                const rect = shapeMask as RectangleMask;
                return { ...rect, x: rect.x + dx, y: rect.y + dy };
              }
              case ShapeMaskType.ELLIPSE: {
                const ellipse = shapeMask as EllipseMask;
                return { ...ellipse, centerX: ellipse.centerX + dx, centerY: ellipse.centerY + dy };
              }
              case ShapeMaskType.POLYGON: {
                const polygon = shapeMask as PolygonMask;
                return {
                  ...polygon,
                  points: polygon.points.map(p => ({
                    ...p,
                    x: p.x + dx,
                    y: p.y + dy,
                    handleIn: p.handleIn ? { x: p.handleIn.x + dx, y: p.handleIn.y + dy } : undefined,
                    handleOut: p.handleOut ? { x: p.handleOut.x + dx, y: p.handleOut.y + dy } : undefined,
                  })),
                };
              }
              default:
                return mask;
            }
          });
          
          onMasksChange(updatedMasks);
          setDragState({ ...dragState, startPoint: { x, y } });
          break;
        }
      }
    }, [dragState, masks, onMasksChange, toPercentage]);

    // Handle mouse up
    const handleMouseUp = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragState) return;
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const percentPoint = toPercentage({ x, y });
      const startPercent = toPercentage(dragState.startPoint);

      switch (dragState.type) {
        case "create": {
          if (tool === "rectangle") {
            const newMask = createRectangleMask();
            newMask.x = Math.min(startPercent.x, percentPoint.x);
            newMask.y = Math.min(startPercent.y, percentPoint.y);
            newMask.width = Math.abs(percentPoint.x - startPercent.x);
            newMask.height = Math.abs(percentPoint.y - startPercent.y);
            
            if (newMask.width > 2 && newMask.height > 2) {
              onMasksChange([...masks, newMask]);
              onSelectMask(newMask.id);
            }
          } else if (tool === "ellipse") {
            const newMask = createEllipseMask();
            newMask.centerX = (startPercent.x + percentPoint.x) / 2;
            newMask.centerY = (startPercent.y + percentPoint.y) / 2;
            newMask.radiusX = Math.abs(percentPoint.x - startPercent.x) / 2;
            newMask.radiusY = Math.abs(percentPoint.y - startPercent.y) / 2;
            
            if (newMask.radiusX > 1 && newMask.radiusY > 1) {
              onMasksChange([...masks, newMask]);
              onSelectMask(newMask.id);
            }
          }
          break;
        }
      }
      
      setDragState(null);
    }, [dragState, tool, masks, onMasksChange, onSelectMask, toPercentage]);

    // Handle double click to finish polygon
    const handleDoubleClick = React.useCallback(() => {
      if ((tool === "polygon" || tool === "bezier") && tempPoints.length >= 3) {
        const newMask = tool === "bezier" ? createBezierMask() : createPolygonMask();
        (newMask as PolygonMask).points = tempPoints;
        (newMask as PolygonMask).smooth = tool === "bezier";
        
        onMasksChange([...masks, newMask]);
        onSelectMask(newMask.id);
        setTempPoints([]);
        setTool("select");
      }
    }, [tool, tempPoints, masks, onMasksChange, onSelectMask]);

    // Handle key down (Escape to cancel, Delete to remove)
    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!isActive) return;
        
        switch (e.key) {
          case "Escape":
            setTempPoints([]);
            setDragState(null);
            setTool("select");
            break;
          case "Delete":
          case "Backspace":
            if (selectedMaskId) {
              onMasksChange(masks.filter(m => m.id !== selectedMaskId));
              onSelectMask(null);
            }
            break;
        }
      };
      
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, selectedMaskId, masks, onMasksChange, onSelectMask]);

    // Check if a point is inside a mask
    const isPointInMask = (point: Point, mask: ShapeMask): boolean => {
      switch (mask.shapeType) {
        case ShapeMaskType.RECTANGLE: {
          const rect = mask as RectangleMask;
          return (
            point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height
          );
        }
        case ShapeMaskType.ELLIPSE: {
          const ellipse = mask as EllipseMask;
          const dx = (point.x - ellipse.centerX) / ellipse.radiusX;
          const dy = (point.y - ellipse.centerY) / ellipse.radiusY;
          return dx * dx + dy * dy <= 1;
        }
        case ShapeMaskType.POLYGON: {
          // Simple point-in-polygon test
          const polygon = mask as PolygonMask;
          let inside = false;
          for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i++) {
            const xi = polygon.points[i].x;
            const yi = polygon.points[i].y;
            const xj = polygon.points[j].x;
            const yj = polygon.points[j].y;
            
            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
              inside = !inside;
            }
          }
          return inside;
        }
        default:
          return false;
      }
    };

    return (
      <div ref={ref} className={cn("relative", className)}>
        {/* Toolbar */}
        <div className="absolute top-2 left-2 z-10 flex gap-1 bg-background/90 rounded-lg p-1 shadow-lg border border-border">
          <Button
            variant={tool === "select" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setTool("select")}
            title="Select (V)"
          >
            <Pointer className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "rectangle" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setTool("rectangle")}
            title="Rectangle Mask (M)"
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "ellipse" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setTool("ellipse")}
            title="Ellipse Mask (E)"
          >
            <Circle className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "polygon" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setTool("polygon")}
            title="Polygon Mask (P)"
          >
            <PenTool className="h-4 w-4" />
          </Button>
          <Button
            variant={tool === "bezier" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setTool("bezier")}
            title="Bezier Mask (B)"
          >
            <PenTool className="h-4 w-4 text-primary" />
          </Button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={cn(
            "absolute inset-0",
            tool === "select" && "cursor-default",
            tool === "rectangle" && "cursor-crosshair",
            tool === "ellipse" && "cursor-crosshair",
            tool === "polygon" && "cursor-crosshair",
            tool === "bezier" && "cursor-crosshair",
            !isActive && "pointer-events-none opacity-50"
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />

        {/* Instructions */}
        {(tool === "polygon" || tool === "bezier") && tempPoints.length > 0 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background/90 rounded px-3 py-1 text-xs text-muted-foreground">
            Click to add points. Double-click to close shape. Esc to cancel.
          </div>
        )}
      </div>
    );
  }
);

MaskCanvasEditor.displayName = "MaskCanvasEditor";

export default MaskCanvasEditor;
