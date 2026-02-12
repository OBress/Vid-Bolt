/**
 * TransformSection - Position, Scale, Rotation, and Anchor controls
 * 
 * Professional transform controls with:
 * - Draggable number inputs (scrub to change values)
 * - Constrain proportions toggle
 * - Circular rotation dial (like After Effects)
 * - 9-point anchor selector
 * - Multi-select support (shows shared values)
 */

import React, { useMemo, useState, useCallback } from "react";
import { Overlay } from "../../../types";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { DraggableNumber } from "../../ui/draggable-number";
import { RotationDial } from "../../ui/rotation-dial";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import { 
  RotateCcw, 
  Link2, 
  Link2Off,
  FlipHorizontal,
  FlipVertical,
  Move,
  Maximize2,
  RotateCw,
  Crosshair,
} from "lucide-react";

// Custom Photoshop-style alignment icons
const AlignLeftIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="1" width="1.5" height="14" fill="currentColor" />
    <rect x="5" y="5" width="8" height="6" fill="currentColor" opacity="0.5" />
  </svg>
);

const AlignHCenterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7.25" y="1" width="1.5" height="14" fill="currentColor" />
    <rect x="3" y="5" width="10" height="6" fill="currentColor" opacity="0.5" />
  </svg>
);

const AlignRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="12.5" y="1" width="1.5" height="14" fill="currentColor" />
    <rect x="3" y="5" width="8" height="6" fill="currentColor" opacity="0.5" />
  </svg>
);

const AlignTopIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="14" height="1.5" fill="currentColor" />
    <rect x="5" y="5" width="6" height="8" fill="currentColor" opacity="0.5" />
  </svg>
);

const AlignMiddleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="7.25" width="14" height="1.5" fill="currentColor" />
    <rect x="5" y="3" width="6" height="10" fill="currentColor" opacity="0.5" />
  </svg>
);

const AlignBottomIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="12.5" width="14" height="1.5" fill="currentColor" />
    <rect x="5" y="3" width="6" height="8" fill="currentColor" opacity="0.5" />
  </svg>
);
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface TransformSectionProps {
  selectedOverlays: Overlay[];
  onUpdate: (updates: Partial<Overlay>) => void;
  onUpdateIndividual?: (overlayId: number, updater: (overlay: Overlay) => Overlay) => void;
}

type MixedValue = number | 'mixed';

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getSharedValue<T extends number>(
  overlays: Overlay[],
  getter: (overlay: Overlay) => T
): MixedValue {
  if (overlays.length === 0) return 0;
  const firstValue = getter(overlays[0]);
  const allSame = overlays.every(o => Math.abs(getter(o) - firstValue) < 0.001);
  return allSame ? firstValue : 'mixed';
}

// Alignment functions
function alignOverlays(
  overlays: Overlay[],
  alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal-center' | 'vertical-center',
  canvasWidth: number,
  canvasHeight: number
): Array<{ id: number; updates: Partial<Overlay> }> {
  return overlays.map(overlay => {
    let newLeft = overlay.left;
    let newTop = overlay.top;

    switch (alignment) {
      case 'left':
        newLeft = 0;
        break;
      case 'center':
        newLeft = (canvasWidth - overlay.width) / 2;
        break;
      case 'right':
        newLeft = canvasWidth - overlay.width;
        break;
      case 'top':
        newTop = 0;
        break;
      case 'middle':
        newTop = (canvasHeight - overlay.height) / 2;
        break;
      case 'bottom':
        newTop = canvasHeight - overlay.height;
        break;
      case 'horizontal-center':
        newLeft = (canvasWidth - overlay.width) / 2;
        break;
      case 'vertical-center':
        newTop = (canvasHeight - overlay.height) / 2;
        break;
    }

    return {
      id: overlay.id,
      updates: {
        left: Math.round(newLeft),
        top: Math.round(newTop),
      }
    };
  });
}

function getSharedStyleValue(
  overlays: Overlay[],
  getter: (styles: any) => string | undefined
): string | 'mixed' | undefined {
  if (overlays.length === 0) return undefined;
  
  const values = overlays.map(o => {
    if ('styles' in o && o.styles) {
      return getter(o.styles);
    }
    return undefined;
  });
  
  const firstValue = values[0];
  const allSame = values.every(v => v === firstValue);
  return allSame ? firstValue : 'mixed';
}

// ==========================================
// SECTION HEADER COMPONENT
// ==========================================

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, children }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      {React.createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" })}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ==========================================
// ANCHOR POINT SELECTOR COMPONENT
// ==========================================

type AnchorPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

interface AnchorPointSelectorProps {
  value: AnchorPosition;
  onChange: (position: AnchorPosition) => void;
  disabled?: boolean;
}

const AnchorPointSelector: React.FC<AnchorPointSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const positions: AnchorPosition[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
  
  return (
    <div className={cn(
      "grid grid-cols-3 gap-1 w-20 p-1 bg-muted/30 rounded-md border border-border",
      disabled && "opacity-50 pointer-events-none"
    )}>
      {positions.map((pos) => (
        <button
          key={pos}
          className={cn(
            "w-5 h-5 rounded-sm transition-colors flex items-center justify-center",
            "hover:bg-muted",
            value === pos && "bg-primary"
          )}
          onClick={() => onChange(pos)}
          disabled={disabled}
        >
          <div className={cn(
            "w-2 h-2 rounded-full",
            value === pos ? "bg-primary-foreground" : "bg-muted-foreground/50"
          )} />
        </button>
      ))}
    </div>
  );
};

// Helper to convert anchor position to percentage values
function anchorToPercent(anchor: AnchorPosition): { x: number; y: number } {
  const map: Record<AnchorPosition, { x: number; y: number }> = {
    'tl': { x: 0, y: 0 },
    'tc': { x: 50, y: 0 },
    'tr': { x: 100, y: 0 },
    'ml': { x: 0, y: 50 },
    'mc': { x: 50, y: 50 },
    'mr': { x: 100, y: 50 },
    'bl': { x: 0, y: 100 },
    'bc': { x: 50, y: 100 },
    'br': { x: 100, y: 100 },
  };
  return map[anchor];
}

// ==========================================
// TRANSFORM SECTION COMPONENT
// ==========================================

export const TransformSection: React.FC<TransformSectionProps> = ({
  selectedOverlays,
  onUpdate,
  onUpdateIndividual,
}) => {
  const [constrainProportions, setConstrainProportions] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [anchorPoint, setAnchorPoint] = useState<AnchorPosition>('mc');

  // Get canvas dimensions for alignment from store
  const canvasAspectRatio = useVideoEditorStore(state => state.aspectRatio) || '16:9';
  const canvasResolution = useVideoEditorStore(state => state.resolution) || '1080p';
  
  const getAspectRatioDimensions = useCallback(() => {
    const resolutionHeights: Record<string, number> = {
      '720p': 720,
      '1080p': 1080,
      '1440p': 1440,
      '4k': 2160,
    };
    
    const aspectRatios: Record<string, number> = {
      '16:9': 16/9,
      '9:16': 9/16,
      '1:1': 1,
      '4:5': 4/5,
    };
    
    const height = resolutionHeights[canvasResolution] || 1080;
    const ratio = aspectRatios[canvasAspectRatio] || 16/9;
    const width = Math.round(height * ratio);
    
    return { width, height };
  }, [canvasAspectRatio, canvasResolution]);

  // Get shared values
  const posX = useMemo(() => getSharedValue(selectedOverlays, o => o.left), [selectedOverlays]);
  const posY = useMemo(() => getSharedValue(selectedOverlays, o => o.top), [selectedOverlays]);
  const width = useMemo(() => getSharedValue(selectedOverlays, o => o.width), [selectedOverlays]);
  const height = useMemo(() => getSharedValue(selectedOverlays, o => o.height), [selectedOverlays]);
  const rotation = useMemo(() => getSharedValue(selectedOverlays, o => o.rotation), [selectedOverlays]);

  // Check for flip states in transform
  const transform = useMemo(() => getSharedStyleValue(selectedOverlays, s => s.transform), [selectedOverlays]);
  const isFlippedH = transform !== 'mixed' && transform?.includes('scaleX(-1)');
  const isFlippedV = transform !== 'mixed' && transform?.includes('scaleY(-1)');

  // Store aspect ratio when constraining proportions
  React.useEffect(() => {
    if (constrainProportions && width !== 'mixed' && height !== 'mixed' && height > 0) {
      setAspectRatio(width / height);
    } else if (!constrainProportions) {
      setAspectRatio(null);
    }
  }, [constrainProportions, width, height]);

  // Handlers
  const handlePositionXChange = useCallback((value: number) => {
    onUpdate({ left: Math.round(value) });
  }, [onUpdate]);

  const handlePositionYChange = useCallback((value: number) => {
    onUpdate({ top: Math.round(value) });
  }, [onUpdate]);

  const handleWidthChange = useCallback((value: number) => {
    const newWidth = Math.round(value);
    if (constrainProportions && aspectRatio !== null) {
      onUpdate({ width: newWidth, height: Math.round(newWidth / aspectRatio) });
    } else {
      onUpdate({ width: newWidth });
    }
  }, [onUpdate, constrainProportions, aspectRatio]);

  const handleHeightChange = useCallback((value: number) => {
    const newHeight = Math.round(value);
    if (constrainProportions && aspectRatio !== null) {
      onUpdate({ height: newHeight, width: Math.round(newHeight * aspectRatio) });
    } else {
      onUpdate({ height: newHeight });
    }
  }, [onUpdate, constrainProportions, aspectRatio]);

  const handleRotationChange = useCallback((value: number) => {
    // Normalize rotation to 0-360
    const normalized = ((value % 360) + 360) % 360;
    onUpdate({ rotation: normalized });
  }, [onUpdate]);

  const handleResetRotation = useCallback(() => {
    onUpdate({ rotation: 0 });
  }, [onUpdate]);

  const handleAnchorPointChange = useCallback((position: AnchorPosition) => {
    setAnchorPoint(position);
    // The anchor point affects the transform origin
    const { x, y } = anchorToPercent(position);
    const transformOrigin = `${x}% ${y}%`;
    
    // Apply transformOrigin to all selected overlays
    selectedOverlays.forEach(overlay => {
      if ('styles' in overlay && onUpdateIndividual) {
        onUpdateIndividual(overlay.id, (prev) => ({
          ...prev,
          styles: {
            ...(prev as any).styles,
            transformOrigin,
          }
        }));
      }
    });
  }, [selectedOverlays, onUpdateIndividual]);

  const handleFlip = useCallback((direction: 'horizontal' | 'vertical') => {
    // Check current flip state to determine toggle direction
    const currentlyFlipped = direction === 'horizontal' ? isFlippedH : isFlippedV;
    
    // For each overlay, calculate and apply the new transform individually
    selectedOverlays.forEach(overlay => {
      if ('styles' in overlay && onUpdateIndividual) {
        const currentTransform = (overlay.styles as any)?.transform || '';
        let newTransform = currentTransform;
        
        if (direction === 'horizontal') {
          if (currentlyFlipped) {
            // Remove horizontal flip
            newTransform = newTransform.replace(/scaleX\(-1\)\s*/g, '').trim();
          } else {
            // Add horizontal flip
            newTransform = `scaleX(-1) ${newTransform}`.trim();
          }
        } else {
          if (currentlyFlipped) {
            // Remove vertical flip
            newTransform = newTransform.replace(/scaleY\(-1\)\s*/g, '').trim();
          } else {
            // Add vertical flip
            newTransform = `scaleY(-1) ${newTransform}`.trim();
          }
        }
        
        // Update the specific overlay with new transform using individual updater
        onUpdateIndividual(overlay.id, (prev) => ({
          ...prev,
          styles: {
            ...(prev as any).styles,
            transform: newTransform || undefined,
          }
        }));
      }
    });
  }, [selectedOverlays, onUpdateIndividual, isFlippedH, isFlippedV]);

  const handleAlignment = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal-center' | 'vertical-center') => {
    const canvasDimensions = getAspectRatioDimensions();
    const alignmentUpdates = alignOverlays(selectedOverlays, alignment, canvasDimensions.width, canvasDimensions.height);

    // Apply alignment to each overlay individually
    alignmentUpdates.forEach(({ id, updates }) => {
      if (onUpdateIndividual) {
        onUpdateIndividual(id, ((prev: any) => ({
          ...prev,
          ...updates,
        })) as any);
      }
    });
  }, [selectedOverlays, onUpdateIndividual, getAspectRatioDimensions]);

  const isMixed = (val: MixedValue): val is 'mixed' => val === 'mixed';

  return (
    <div className="space-y-3">
      {/* Position */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Move} title="Position" />
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={isMixed(posX) ? 0 : posX}
            onChange={handlePositionXChange}
            suffix="px"
            decimals={0}
            step={1}
            disabled={isMixed(posX)}
          />
          <DraggableNumber
            label="Y"
            value={isMixed(posY) ? 0 : posY}
            onChange={handlePositionYChange}
            suffix="px"
            decimals={0}
            step={1}
            disabled={isMixed(posY)}
          />
        </div>
      </div>

      {/* Size */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Maximize2} title="Size">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-xs gap-1",
              constrainProportions && "bg-accent text-accent-foreground"
            )}
            onClick={() => setConstrainProportions(!constrainProportions)}
          >
            {constrainProportions ? (
              <Link2 className="h-3 w-3" />
            ) : (
              <Link2Off className="h-3 w-3" />
            )}
            {constrainProportions ? 'Locked' : 'Lock'}
          </Button>
        </SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="W"
            value={isMixed(width) ? 100 : width}
            onChange={handleWidthChange}
            suffix="px"
            decimals={0}
            step={1}
            min={1}
            disabled={isMixed(width)}
          />
          <DraggableNumber
            label="H"
            value={isMixed(height) ? 100 : height}
            onChange={handleHeightChange}
            suffix="px"
            decimals={0}
            step={1}
            min={1}
            disabled={isMixed(height)}
          />
        </div>
      </div>

      {/* Rotation */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={RotateCw} title="Rotation" />
        <RotationDial
          value={isMixed(rotation) ? 0 : rotation}
          onChange={handleRotationChange}
          clampTo360={true}
          snapEnabled={false}
          size={56}
          disabled={isMixed(rotation)}
          showReset={true}
        />
      </div>

      {/* Anchor Point */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Crosshair} title="Anchor Point" />
        <AnchorPointSelector
          value={anchorPoint}
          onChange={handleAnchorPointChange}
          disabled={isMixed(posX) || isMixed(posY)}
        />
      </div>

      {/* Alignment */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={AlignHCenterIcon} title="Align" />
        <div className="space-y-3">
          {/* Horizontal Alignment */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Horizontal</div>
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('left')}
                title="Align Left"
              >
                <AlignLeftIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('center')}
                title="Align Center"
              >
                <AlignHCenterIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('right')}
                title="Align Right"
              >
                <AlignRightIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Vertical Alignment */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">Vertical</div>
            <div className="grid grid-cols-3 gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('top')}
                title="Align Top"
              >
                <AlignTopIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('middle')}
                title="Align Middle"
              >
                <AlignMiddleIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => handleAlignment('bottom')}
                title="Align Bottom"
              >
                <AlignBottomIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Flip */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={FlipHorizontal} title="Flip" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-2",
              isFlippedH && "bg-accent border-accent"
            )}
            onClick={() => handleFlip('horizontal')}
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
            Horizontal
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-2",
              isFlippedV && "bg-accent border-accent"
            )}
            onClick={() => handleFlip('vertical')}
          >
            <FlipVertical className="h-3.5 w-3.5" />
            Vertical
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TransformSection;
