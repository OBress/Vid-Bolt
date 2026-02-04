/**
 * ShapeManipulationOverlay - On-canvas manipulation for shapes
 * 
 * Provides interactive handles for:
 * - Rectangle: corner/edge resize, border radius handles
 * - Ellipse: center drag, radius handles
 * - Triangle/Polygon: vertex manipulation
 * - Line: endpoint handles
 * 
 * Similar to mask-manipulation-overlay but for shape-specific properties
 */

import React, { useRef, useState, useCallback, useMemo } from "react";
import { ShapeOverlay } from "../../types";
import { cn } from "../../utils/general/utils";

// ==========================================
// CONSTANTS
// ==========================================

const HANDLE_SIZE = 8;
const HANDLE_STYLE = "fill-blue-400 stroke-white stroke-1 cursor-pointer hover:fill-blue-500";
const HANDLE_POINTER_STYLE = { pointerEvents: 'auto' as const };
const MOVE_AREA_STYLE = "fill-transparent stroke-blue-400 stroke-2 cursor-move";

// ==========================================
// TYPES
// ==========================================

interface ShapeManipulationOverlayProps {
  /** Width of the container (shape overlay bounds) */
  containerWidth: number;
  /** Height of the container (shape overlay bounds) */
  containerHeight: number;
  /** Offset X from video area */
  offsetX: number;
  /** Offset Y from video area */
  offsetY: number;
  /** Shape overlay to manipulate */
  shape: ShapeOverlay;
  /** Callback when shape properties change */
  onUpdateShape: (updates: Partial<ShapeOverlay['styles']>) => void;
  /** Aspect ratio of the overlay */
  aspectRatio: number;
}

type HandleType = 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 
                  'resize-t' | 'resize-r' | 'resize-b' | 'resize-l' | 
                  'radius' | 'endpoint-start' | 'endpoint-end' | 'vertex';

interface DragState {
  handleType: HandleType;
  startX: number;
  startY: number;
  initialValues: any;
  vertexIndex?: number;
}

// ==========================================
// RECTANGLE SHAPE OVERLAY
// ==========================================

interface RectangleShapeOverlayProps {
  containerWidth: number;
  containerHeight: number;
  shape: ShapeOverlay;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent) => void;
}

const RectangleShapeOverlay: React.FC<RectangleShapeOverlayProps> = ({
  containerWidth,
  containerHeight,
  shape,
  onStartDrag,
}) => {
  const borderRadius = parseInt(shape.styles.borderRadius || "0", 10);
  const radiusPercent = (borderRadius / Math.min(containerWidth, containerHeight)) * 100;

  return (
    <g>
      {/* Main rectangle (move area) */}
      <rect
        x={0}
        y={0}
        width={containerWidth}
        height={containerHeight}
        rx={borderRadius}
        className={MOVE_AREA_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('move', e)}
      />

      {/* Corner handles */}
      <circle
        cx={0}
        cy={0}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-tl', e)}
      />
      <circle
        cx={containerWidth}
        cy={0}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-tr', e)}
      />
      <circle
        cx={0}
        cy={containerHeight}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-bl', e)}
      />
      <circle
        cx={containerWidth}
        cy={containerHeight}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-br', e)}
      />

      {/* Edge handles */}
      <circle
        cx={containerWidth / 2}
        cy={0}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-t', e)}
      />
      <circle
        cx={containerWidth}
        cy={containerHeight / 2}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-r', e)}
      />
      <circle
        cx={containerWidth / 2}
        cy={containerHeight}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-b', e)}
      />
      <circle
        cx={0}
        cy={containerHeight / 2}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-l', e)}
      />

      {/* Border radius handle (top-left corner) */}
      {borderRadius > 0 && (
        <circle
          cx={borderRadius}
          cy={borderRadius}
          r={HANDLE_SIZE / 2}
          className="fill-green-400 stroke-white stroke-1 cursor-pointer hover:fill-green-500"
          style={HANDLE_POINTER_STYLE}
          onMouseDown={(e) => onStartDrag('radius', e)}
        />
      )}
    </g>
  );
};

// ==========================================
// ELLIPSE SHAPE OVERLAY
// ==========================================

interface EllipseShapeOverlayProps {
  containerWidth: number;
  containerHeight: number;
  shape: ShapeOverlay;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent) => void;
}

const EllipseShapeOverlay: React.FC<EllipseShapeOverlayProps> = ({
  containerWidth,
  containerHeight,
  shape,
  onStartDrag,
}) => {
  const cx = containerWidth / 2;
  const cy = containerHeight / 2;
  const rx = containerWidth / 2;
  const ry = containerHeight / 2;

  return (
    <g>
      {/* Main ellipse (move area) */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        className={MOVE_AREA_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('move', e)}
      />

      {/* Center handle */}
      <circle
        cx={cx}
        cy={cy}
        r={HANDLE_SIZE / 2}
        className="fill-yellow-400 stroke-white stroke-1 cursor-move hover:fill-yellow-500"
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('move', e)}
      />

      {/* Radius handles (4 cardinal directions) */}
      <circle
        cx={cx}
        cy={0}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-t', e)}
      />
      <circle
        cx={containerWidth}
        cy={cy}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-r', e)}
      />
      <circle
        cx={cx}
        cy={containerHeight}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-b', e)}
      />
      <circle
        cx={0}
        cy={cy}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('resize-l', e)}
      />
    </g>
  );
};

// ==========================================
// TRIANGLE SHAPE OVERLAY
// ==========================================

interface TriangleShapeOverlayProps {
  containerWidth: number;
  containerHeight: number;
  shape: ShapeOverlay;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent, vertexIndex?: number) => void;
}

const TriangleShapeOverlay: React.FC<TriangleShapeOverlayProps> = ({
  containerWidth,
  containerHeight,
  shape,
  onStartDrag,
}) => {
  // Triangle vertices (top center, bottom right, bottom left)
  const vertices = [
    { x: containerWidth / 2, y: 0 },
    { x: containerWidth, y: containerHeight },
    { x: 0, y: containerHeight },
  ];

  const pathD = `M ${vertices[0].x} ${vertices[0].y} L ${vertices[1].x} ${vertices[1].y} L ${vertices[2].x} ${vertices[2].y} Z`;

  return (
    <g>
      {/* Main triangle (move area) */}
      <path
        d={pathD}
        className={MOVE_AREA_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('move', e)}
      />

      {/* Vertex handles */}
      {vertices.map((vertex, index) => (
        <circle
          key={index}
          cx={vertex.x}
          cy={vertex.y}
          r={HANDLE_SIZE / 2}
          className={HANDLE_STYLE}
          style={HANDLE_POINTER_STYLE}
          onMouseDown={(e) => onStartDrag('vertex', e, index)}
        />
      ))}
    </g>
  );
};

// ==========================================
// LINE SHAPE OVERLAY
// ==========================================

interface LineShapeOverlayProps {
  containerWidth: number;
  containerHeight: number;
  shape: ShapeOverlay;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent) => void;
}

const LineShapeOverlay: React.FC<LineShapeOverlayProps> = ({
  containerWidth,
  containerHeight,
  shape,
  onStartDrag,
}) => {
  // Line from left to right (horizontal by default, rotation handled by parent)
  const startX = 0;
  const startY = containerHeight / 2;
  const endX = containerWidth;
  const endY = containerHeight / 2;

  return (
    <g>
      {/* Main line */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        className="stroke-blue-400 stroke-2 cursor-move"
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('move', e)}
      />

      {/* Start endpoint handle */}
      <circle
        cx={startX}
        cy={startY}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('endpoint-start', e)}
      />

      {/* End endpoint handle */}
      <circle
        cx={endX}
        cy={endY}
        r={HANDLE_SIZE / 2}
        className={HANDLE_STYLE}
        style={HANDLE_POINTER_STYLE}
        onMouseDown={(e) => onStartDrag('endpoint-end', e)}
      />
    </g>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const ShapeManipulationOverlay: React.FC<ShapeManipulationOverlayProps> = ({
  containerWidth,
  containerHeight,
  offsetX,
  offsetY,
  shape,
  onUpdateShape,
  aspectRatio,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const shapeType = shape.content; // 'rectangle', 'ellipse', 'triangle', 'line'

  const handleStartDrag = useCallback((handleType: HandleType, e: React.MouseEvent, vertexIndex?: number) => {
    e.stopPropagation();
    e.preventDefault();

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setDragState({
      handleType,
      startX,
      startY,
      initialValues: {
        borderRadius: shape.styles.borderRadius,
        // Store other initial values as needed
      },
      vertexIndex,
    });
  }, [shape.styles]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const deltaX = currentX - dragState.startX;
    const deltaY = currentY - dragState.startY;

    // Handle different drag types
    switch (dragState.handleType) {
      case 'radius': {
        // Border radius manipulation
        const newRadius = Math.max(0, Math.min(
          Math.sqrt(currentX * currentX + currentY * currentY),
          Math.min(containerWidth, containerHeight) / 2
        ));
        onUpdateShape({ borderRadius: `${Math.round(newRadius)}px` });
        break;
      }

      // Note: Other handle types (resize, move, etc.) would need to update
      // the parent overlay's transform properties (width, height, left, top)
      // which should be handled at the video-player level, not here
      // For now, we're focusing on shape-specific properties like borderRadius
    }
  }, [dragState, containerWidth, containerHeight, onUpdateShape]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Attach global mouse event listeners during drag
  React.useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  return (
    <svg
      ref={svgRef}
      className="absolute pointer-events-none"
      width={containerWidth}
      height={containerHeight}
      style={{
        overflow: 'visible',
        left: offsetX,
        top: offsetY,
      }}
    >
      {shapeType === 'rectangle' && (
        <RectangleShapeOverlay
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          shape={shape}
          onStartDrag={handleStartDrag}
        />
      )}

      {shapeType === 'ellipse' && (
        <EllipseShapeOverlay
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          shape={shape}
          onStartDrag={handleStartDrag}
        />
      )}

      {shapeType === 'triangle' && (
        <TriangleShapeOverlay
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          shape={shape}
          onStartDrag={handleStartDrag}
        />
      )}

      {shapeType === 'line' && (
        <LineShapeOverlay
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          shape={shape}
          onStartDrag={handleStartDrag}
        />
      )}
    </svg>
  );
};

export default ShapeManipulationOverlay;
