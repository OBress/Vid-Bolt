/**
 * LayerRow - Single layer row in the After Effects timeline
 * 
 * Shows:
 * - Disclosure triangle for expansion
 * - Layer number and color
 * - Layer name
 * - Control switches (Solo, Visibility, Lock)
 */

import React, { useCallback } from 'react';
import { cn } from '../../../../utils/general/utils';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  CircleDot,
  Type,
  Square,
  Palette,
  Image,
  Film,
  Crosshair,
  Sliders,
  Layers,
} from 'lucide-react';
import { AE_COLORS, TRACK_HEIGHT, CONTROLS_WIDTH, LAYER_LIST_WIDTH } from '../constants';
import type { CompositionLayer, CompositionLayerType } from '../../../../types/composition';
import { getLayerTypeColor, getLayerTypeIcon } from '../../../../types/composition';

interface LayerRowProps {
  layer: CompositionLayer;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  hasSoloedLayers: boolean;
  alternateRow?: boolean; // For alternating row colors
  onSelect: (layerId: string, addToSelection: boolean) => void;
  onToggleExpansion: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onToggleSolo: (layerId: string) => void;
}

// Layer type icons
const LayerIcon = React.memo<{ type: CompositionLayerType; className?: string }>(({ type, className = "h-3 w-3" }) => {
  const iconName = getLayerTypeIcon(type);
  const props = { className };
  
  switch (iconName) {
    case 'Type': return <Type {...props} />;
    case 'Square': return <Square {...props} />;
    case 'Palette': return <Palette {...props} />;
    case 'Image': return <Image {...props} />;
    case 'Film': return <Film {...props} />;
    case 'Crosshair': return <Crosshair {...props} />;
    case 'Sliders': return <Sliders {...props} />;
    default: return <Layers {...props} />;
  }
});

export const LayerRow = React.memo<LayerRowProps>(({
  layer,
  index,
  isSelected,
  isExpanded,
  hasSoloedLayers,
  alternateRow = false,
  onSelect,
  onToggleExpansion,
  onToggleVisibility,
  onToggleLock,
  onToggleSolo,
}) => {
  const layerColor = layer.color || getLayerTypeColor(layer.type);
  
  // Determine effective visibility (considering solo)
  const isEffectivelyVisible = hasSoloedLayers 
    ? (layer.solo && layer.visible)
    : layer.visible;
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
  }, [layer.id, onSelect]);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpansion(layer.id);
  }, [layer.id, onToggleExpansion]);
  
  const handleToggleExpansion = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpansion(layer.id);
  }, [layer.id, onToggleExpansion]);
  
  return (
    <div
      className={cn(
        "flex items-center border-b cursor-pointer transition-colors",
        isSelected 
          ? "bg-[#2d4a6b]" 
          : alternateRow 
            ? "bg-[#3a3a3a] hover:bg-[#404040]"
            : "bg-[#323232] hover:bg-[#383838]",
        !isEffectivelyVisible && "opacity-50"
      )}
      style={{
        height: TRACK_HEIGHT,
        borderColor: '#0f0f0f',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Layer info section */}
      <div 
        className="flex items-center flex-1 min-w-0 pl-1"
        style={{ width: LAYER_LIST_WIDTH - CONTROLS_WIDTH }}
      >
        {/* Expand/collapse triangle */}
        <button
          onClick={handleToggleExpansion}
          className="w-5 h-5 flex items-center justify-center text-[#aaa] hover:text-white hover:bg-white/5 rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        
        {/* Layer number */}
        <span 
          className="w-5 text-[10px] text-right font-mono font-semibold mr-1"
          style={{ color: AE_COLORS.textSecondary }}
        >
          {index + 1}
        </span>
        
        {/* Color indicator */}
        <div
          className="w-1 h-3 rounded-full mr-1.5"
          style={{ backgroundColor: layerColor }}
        />
        
        {/* Layer icon */}
        <div 
          className="mr-1.5 flex-shrink-0"
          style={{ color: layerColor }}
        >
          <LayerIcon type={layer.type} className="w-3 h-3" />
        </div>
        
        {/* Layer name */}
        <span 
          className={cn(
            "text-[11px] truncate flex-1 font-medium",
            isSelected ? "text-white" : "text-[#f0f0f0]"
          )}
        >
          {layer.name}
        </span>
      </div>
      
      {/* Control switches */}
      <div 
        className="flex items-center justify-center gap-0.5 shrink-0 border-l px-1"
        style={{ 
          width: CONTROLS_WIDTH,
          borderColor: AE_COLORS.bgDark,
        }}
      >
        {/* Solo */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSolo(layer.id);
          }}
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded transition-colors",
            layer.solo 
              ? "text-[#f9a825] hover:text-[#ffc107] hover:bg-white/5" 
              : "text-[#666] hover:text-[#aaa] hover:bg-white/5"
          )}
          title="Solo (isolate layer)"
        >
          <CircleDot className="w-3.5 h-3.5" strokeWidth={layer.solo ? 2.5 : 1.5} />
        </button>
        
        {/* Visibility */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded transition-colors",
            layer.visible 
              ? "text-[#f0f0f0] hover:text-white hover:bg-white/5" 
              : "text-[#666] hover:text-[#aaa] hover:bg-white/5"
          )}
          title={layer.visible ? "Hide layer" : "Show layer"}
        >
          {layer.visible ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
        
        {/* Lock */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(layer.id);
          }}
          className={cn(
            "w-6 h-6 flex items-center justify-center rounded transition-colors",
            layer.locked 
              ? "text-[#e91e63] hover:text-[#ff4081] hover:bg-white/5" 
              : "text-[#666] hover:text-[#aaa] hover:bg-white/5"
          )}
          title={layer.locked ? "Unlock layer" : "Lock layer"}
        >
          {layer.locked ? (
            <Lock className="w-3.5 h-3.5" />
          ) : (
            <Unlock className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

export default LayerRow;
