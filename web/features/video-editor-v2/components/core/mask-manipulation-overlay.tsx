/**
 * MaskManipulationOverlay - Direct on-canvas mask editing
 * 
 * Renders interactive handles over the video preview to allow
 * direct manipulation of masks like in Premiere Pro:
 * - Drag vertices to reshape
 * - Drag center to move
 * - Drag corner handles to resize
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import {
  Mask,
  MaskType,
  ShapeMask,
  ShapeMaskType,
  RectangleMask,
  EllipseMask,
  PolygonMask,
} from "../../types/masks";
import { cn } from "../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface MaskManipulationOverlayProps {
  /** The video area width in pixels (actual video, not container) */
  containerWidth: number;
  /** The video area height in pixels (actual video, not container) */
  containerHeight: number;
  /** Horizontal offset from container edge to video area */
  offsetX?: number;
  /** Vertical offset from container edge to video area */
  offsetY?: number;
  /** The clip ID that owns the masks */
  clipId: string;
  /** The masks to render controls for */
  masks: Mask[];
  /** Callback to update masks */
  onUpdateMasks: (masks: Mask[]) => void;
  /** The video's aspect ratio (width/height) */
  aspectRatio: number;
}

type HandleType = 
  | 'move' 
  | 'nw' | 'n' | 'ne' 
  | 'w' | 'e' 
  | 'sw' | 's' | 'se'
  | 'vertex';

interface DragState {
  maskId: string;
  handleType: HandleType;
  vertexIndex?: number;
  startMouse: { x: number; y: number };
  startMask: ShapeMask;
}

// ==========================================
// HANDLE STYLES
// ==========================================

const HANDLE_SIZE = 10;
const HANDLE_STYLE = "absolute rounded-full border-2 border-white bg-primary shadow-md cursor-pointer transition-transform hover:scale-125";
const OUTLINE_STYLE = "stroke-primary stroke-2 fill-none pointer-events-none";
const MOVE_AREA_STYLE = "fill-primary/10 cursor-move pointer-events-auto";
const CLICKABLE_AREA_STYLE = "fill-transparent cursor-pointer hover:fill-primary/5 pointer-events-auto";
const HANDLE_POINTER_STYLE = { pointerEvents: 'auto' as const };

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/** Convert percentage coordinates to pixel coordinates */
function percentToPixels(
  percent: { x: number; y: number },
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: (percent.x / 100) * containerWidth,
    y: (percent.y / 100) * containerHeight,
  };
}

/** Convert pixel coordinates to percentage coordinates */
function pixelsToPercent(
  pixels: { x: number; y: number },
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: (pixels.x / containerWidth) * 100,
    y: (pixels.y / containerHeight) * 100,
  };
}

// ==========================================
// RECTANGLE MASK OVERLAY
// ==========================================

interface RectangleMaskOverlayProps {
  mask: RectangleMask;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent) => void;
}

const RectangleMaskOverlay: React.FC<RectangleMaskOverlayProps> = ({
  mask,
  containerWidth,
  containerHeight,
  isSelected,
  onSelect,
  onStartDrag,
}) => {
  // Calculate pixel positions
  const x = (mask.x / 100) * containerWidth;
  const y = (mask.y / 100) * containerHeight;
  const width = (mask.width / 100) * containerWidth;
  const height = (mask.height / 100) * containerHeight;

  // Handle positions (corners and edges)
  const handles = [
    { type: 'nw' as HandleType, x: x, y: y, cursor: 'nw-resize' },
    { type: 'n' as HandleType, x: x + width / 2, y: y, cursor: 'n-resize' },
    { type: 'ne' as HandleType, x: x + width, y: y, cursor: 'ne-resize' },
    { type: 'w' as HandleType, x: x, y: y + height / 2, cursor: 'w-resize' },
    { type: 'e' as HandleType, x: x + width, y: y + height / 2, cursor: 'e-resize' },
    { type: 'sw' as HandleType, x: x, y: y + height, cursor: 'sw-resize' },
    { type: 's' as HandleType, x: x + width / 2, y: y + height, cursor: 's-resize' },
    { type: 'se' as HandleType, x: x + width, y: y + height, cursor: 'se-resize' },
  ];

  return (
    <g>
      {/* Clickable/draggable fill area - double-click to select/edit */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={mask.cornerRadius}
        className={cn(isSelected ? MOVE_AREA_STYLE : CLICKABLE_AREA_STYLE)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isSelected) {
            onStartDrag('move', e);
          }
        }}
      />
      
      {/* Outline */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={mask.cornerRadius}
        className={cn(OUTLINE_STYLE, !isSelected && "stroke-primary/50")}
        strokeDasharray={isSelected ? undefined : "4 4"}
      />

      {/* Resize handles - only show when selected */}
      {isSelected && handles.map((handle) => (
        <circle
          key={handle.type}
          cx={handle.x}
          cy={handle.y}
          r={HANDLE_SIZE / 2}
          className="fill-white stroke-primary stroke-2 cursor-pointer hover:fill-primary"
          style={{ cursor: handle.cursor, ...HANDLE_POINTER_STYLE }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartDrag(handle.type, e);
          }}
        />
      ))}
    </g>
  );
};

// ==========================================
// ELLIPSE MASK OVERLAY
// ==========================================

interface EllipseMaskOverlayProps {
  mask: EllipseMask;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent) => void;
}

const EllipseMaskOverlay: React.FC<EllipseMaskOverlayProps> = ({
  mask,
  containerWidth,
  containerHeight,
  isSelected,
  onSelect,
  onStartDrag,
}) => {
  // Calculate pixel positions
  const cx = (mask.centerX / 100) * containerWidth;
  const cy = (mask.centerY / 100) * containerHeight;
  const rx = (mask.radiusX / 100) * containerWidth;
  const ry = (mask.radiusY / 100) * containerHeight;

  // Handle positions
  const handles = [
    { type: 'n' as HandleType, x: cx, y: cy - ry, cursor: 'n-resize' },
    { type: 'e' as HandleType, x: cx + rx, y: cy, cursor: 'e-resize' },
    { type: 's' as HandleType, x: cx, y: cy + ry, cursor: 's-resize' },
    { type: 'w' as HandleType, x: cx - rx, y: cy, cursor: 'w-resize' },
  ];

  return (
    <g>
      {/* Clickable/draggable fill area - double-click to select/edit */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        className={cn(isSelected ? MOVE_AREA_STYLE : CLICKABLE_AREA_STYLE)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isSelected) {
            onStartDrag('move', e);
          }
        }}
      />
      
      {/* Outline */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        className={cn(OUTLINE_STYLE, !isSelected && "stroke-primary/50")}
        strokeDasharray={isSelected ? undefined : "4 4"}
      />

      {/* Center crosshair when selected */}
      {isSelected && (
        <>
          <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} className="stroke-primary stroke-1" />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} className="stroke-primary stroke-1" />
        </>
      )}

      {/* Resize handles - only show when selected */}
      {isSelected && handles.map((handle) => (
        <circle
          key={handle.type}
          cx={handle.x}
          cy={handle.y}
          r={HANDLE_SIZE / 2}
          className="fill-white stroke-primary stroke-2 cursor-pointer hover:fill-primary"
          style={{ cursor: handle.cursor, ...HANDLE_POINTER_STYLE }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartDrag(handle.type, e);
          }}
        />
      ))}
    </g>
  );
};

// ==========================================
// POLYGON MASK OVERLAY
// ==========================================

interface PolygonMaskOverlayProps {
  mask: PolygonMask;
  containerWidth: number;
  containerHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onStartDrag: (handleType: HandleType, e: React.MouseEvent, vertexIndex?: number) => void;
}

const PolygonMaskOverlay: React.FC<PolygonMaskOverlayProps> = ({
  mask,
  containerWidth,
  containerHeight,
  isSelected,
  onSelect,
  onStartDrag,
}) => {
  // Convert points to pixel coordinates
  const points = mask.points.map((p) => ({
    x: (p.x / 100) * containerWidth,
    y: (p.y / 100) * containerHeight,
  }));

  // Create SVG path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (mask.closed ? ' Z' : '');

  // Calculate centroid for move handle
  const centroid = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };

  return (
    <g>
      {/* Clickable/draggable fill area - double-click to select/edit */}
      <path
        d={pathD}
        className={cn(isSelected ? MOVE_AREA_STYLE : CLICKABLE_AREA_STYLE)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (isSelected) {
            onStartDrag('move', e);
          }
        }}
      />
      
      {/* Outline */}
      <path
        d={pathD}
        className={cn(OUTLINE_STYLE, !isSelected && "stroke-primary/50")}
        strokeDasharray={isSelected ? undefined : "4 4"}
      />

      {/* Vertex handles - only show when selected */}
      {isSelected && points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={HANDLE_SIZE / 2}
          className="fill-white stroke-primary stroke-2 cursor-pointer hover:fill-primary"
          style={HANDLE_POINTER_STYLE}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartDrag('vertex', e, index);
          }}
        />
      ))}

      {/* Center move indicator */}
      {isSelected && (
        <circle
          cx={centroid.x}
          cy={centroid.y}
          r={6}
          className="fill-primary/30 stroke-primary stroke-1 cursor-move"
          style={HANDLE_POINTER_STYLE}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartDrag('move', e);
          }}
        />
      )}
    </g>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const MaskManipulationOverlay: React.FC<MaskManipulationOverlayProps> = ({
  containerWidth,
  containerHeight,
  offsetX = 0,
  offsetY = 0,
  clipId,
  masks,
  onUpdateMasks,
  aspectRatio,
}) => {
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Get shape masks only
  const shapeMasks = useMemo(() => 
    masks.filter((m): m is ShapeMask => m.type === MaskType.SHAPE && m.enabled),
    [masks]
  );

  // Handle mask selection
  const handleSelectMask = useCallback((maskId: string) => {
    setSelectedMaskId(maskId);
  }, []);

  // Handle click on background to deselect
  const handleBackgroundClick = useCallback(() => {
    setSelectedMaskId(null);
  }, []);


  // Start dragging
  const handleStartDrag = useCallback((
    maskId: string,
    handleType: HandleType,
    e: React.MouseEvent,
    vertexIndex?: number
  ) => {
    const mask = shapeMasks.find(m => m.id === maskId);
    if (!mask) return;

    e.preventDefault();
    e.stopPropagation();

    setDragState({
      maskId,
      handleType,
      vertexIndex,
      startMouse: { x: e.clientX, y: e.clientY },
      startMask: { ...mask } as ShapeMask,
    });
  }, [shapeMasks]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { maskId, handleType, vertexIndex, startMouse, startMask } = dragState;

      // Calculate delta in pixels
      const deltaX = e.clientX - startMouse.x;
      const deltaY = e.clientY - startMouse.y;

      // Convert delta to percentage
      const deltaXPercent = (deltaX / containerWidth) * 100;
      const deltaYPercent = (deltaY / containerHeight) * 100;

      // Update mask based on handle type
      let updatedMask: ShapeMask;

      switch (startMask.shapeType) {
        case ShapeMaskType.RECTANGLE: {
          const rect = startMask as RectangleMask;
          updatedMask = { ...rect };

          switch (handleType) {
            case 'move':
              (updatedMask as RectangleMask).x = Math.max(0, Math.min(100 - rect.width, rect.x + deltaXPercent));
              (updatedMask as RectangleMask).y = Math.max(0, Math.min(100 - rect.height, rect.y + deltaYPercent));
              break;
            case 'nw':
              (updatedMask as RectangleMask).x = Math.max(0, rect.x + deltaXPercent);
              (updatedMask as RectangleMask).y = Math.max(0, rect.y + deltaYPercent);
              (updatedMask as RectangleMask).width = Math.max(5, rect.width - deltaXPercent);
              (updatedMask as RectangleMask).height = Math.max(5, rect.height - deltaYPercent);
              break;
            case 'n':
              (updatedMask as RectangleMask).y = Math.max(0, rect.y + deltaYPercent);
              (updatedMask as RectangleMask).height = Math.max(5, rect.height - deltaYPercent);
              break;
            case 'ne':
              (updatedMask as RectangleMask).y = Math.max(0, rect.y + deltaYPercent);
              (updatedMask as RectangleMask).width = Math.max(5, rect.width + deltaXPercent);
              (updatedMask as RectangleMask).height = Math.max(5, rect.height - deltaYPercent);
              break;
            case 'w':
              (updatedMask as RectangleMask).x = Math.max(0, rect.x + deltaXPercent);
              (updatedMask as RectangleMask).width = Math.max(5, rect.width - deltaXPercent);
              break;
            case 'e':
              (updatedMask as RectangleMask).width = Math.max(5, rect.width + deltaXPercent);
              break;
            case 'sw':
              (updatedMask as RectangleMask).x = Math.max(0, rect.x + deltaXPercent);
              (updatedMask as RectangleMask).width = Math.max(5, rect.width - deltaXPercent);
              (updatedMask as RectangleMask).height = Math.max(5, rect.height + deltaYPercent);
              break;
            case 's':
              (updatedMask as RectangleMask).height = Math.max(5, rect.height + deltaYPercent);
              break;
            case 'se':
              (updatedMask as RectangleMask).width = Math.max(5, rect.width + deltaXPercent);
              (updatedMask as RectangleMask).height = Math.max(5, rect.height + deltaYPercent);
              break;
          }
          break;
        }

        case ShapeMaskType.ELLIPSE: {
          const ellipse = startMask as EllipseMask;
          updatedMask = { ...ellipse };

          switch (handleType) {
            case 'move':
              (updatedMask as EllipseMask).centerX = Math.max(0, Math.min(100, ellipse.centerX + deltaXPercent));
              (updatedMask as EllipseMask).centerY = Math.max(0, Math.min(100, ellipse.centerY + deltaYPercent));
              break;
            case 'n':
              (updatedMask as EllipseMask).radiusY = Math.max(1, ellipse.radiusY - deltaYPercent);
              break;
            case 'e':
              (updatedMask as EllipseMask).radiusX = Math.max(1, ellipse.radiusX + deltaXPercent);
              break;
            case 's':
              (updatedMask as EllipseMask).radiusY = Math.max(1, ellipse.radiusY + deltaYPercent);
              break;
            case 'w':
              (updatedMask as EllipseMask).radiusX = Math.max(1, ellipse.radiusX - deltaXPercent);
              break;
          }
          break;
        }

        case ShapeMaskType.POLYGON: {
          const polygon = startMask as PolygonMask;
          updatedMask = { ...polygon };

          if (handleType === 'move') {
            // Move all vertices
            (updatedMask as PolygonMask).points = polygon.points.map(p => ({
              ...p,
              x: Math.max(0, Math.min(100, p.x + deltaXPercent)),
              y: Math.max(0, Math.min(100, p.y + deltaYPercent)),
            }));
          } else if (handleType === 'vertex' && vertexIndex !== undefined) {
            // Move single vertex
            const newPoints = [...polygon.points];
            newPoints[vertexIndex] = {
              ...newPoints[vertexIndex],
              x: Math.max(0, Math.min(100, polygon.points[vertexIndex].x + deltaXPercent)),
              y: Math.max(0, Math.min(100, polygon.points[vertexIndex].y + deltaYPercent)),
            };
            (updatedMask as PolygonMask).points = newPoints;
          }
          break;
        }

        default:
          return;
      }

      // Update masks array
      const newMasks = masks.map(m => m.id === maskId ? updatedMask : m);
      onUpdateMasks(newMasks);
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, containerWidth, containerHeight, masks, onUpdateMasks]);

  // Don't render if no masks or container not sized
  if (shapeMasks.length === 0 || containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  return (
    <svg
      ref={svgRef}
      className="absolute"
      width={containerWidth}
      height={containerHeight}
      style={{ 
        overflow: 'visible',
        left: offsetX,
        top: offsetY,
        // Only enable pointer events when a mask is selected (for clicking outside to deselect)
        // or always allow interaction with mask shapes via their own pointer-events
        pointerEvents: selectedMaskId ? 'auto' : 'none',
      }}
    >
      {/* Background click area - only active when a mask is selected, clicks here deselect */}
      {selectedMaskId && (
        <rect
          x={0}
          y={0}
          width={containerWidth}
          height={containerHeight}
          fill="transparent"
          className="cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            handleBackgroundClick();
          }}
        />
      )}

      {shapeMasks.map((mask) => {
        const isSelected = selectedMaskId === mask.id;

        switch (mask.shapeType) {
          case ShapeMaskType.RECTANGLE:
            return (
              <RectangleMaskOverlay
                key={mask.id}
                mask={mask as RectangleMask}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                isSelected={isSelected}
                onSelect={() => handleSelectMask(mask.id)}
                onStartDrag={(handleType, e) => handleStartDrag(mask.id, handleType, e)}
              />
            );

          case ShapeMaskType.ELLIPSE:
            return (
              <EllipseMaskOverlay
                key={mask.id}
                mask={mask as EllipseMask}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                isSelected={isSelected}
                onSelect={() => handleSelectMask(mask.id)}
                onStartDrag={(handleType, e) => handleStartDrag(mask.id, handleType, e)}
              />
            );

          case ShapeMaskType.POLYGON:
            return (
              <PolygonMaskOverlay
                key={mask.id}
                mask={mask as PolygonMask}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                isSelected={isSelected}
                onSelect={() => handleSelectMask(mask.id)}
                onStartDrag={(handleType, e, vertexIndex) => handleStartDrag(mask.id, handleType, e, vertexIndex)}
              />
            );

          default:
            return null;
        }
      })}

      {/* Instructions tooltip when no mask selected */}
      {!selectedMaskId && shapeMasks.length > 0 && (
        <text
          x={containerWidth / 2}
          y={20}
          textAnchor="middle"
          className="fill-white text-xs font-medium pointer-events-none"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
        >
          Double-click a mask to edit
        </text>
      )}
    </svg>
  );
};

export default MaskManipulationOverlay;
