/**
 * LayerInfoCard - Layer information header card
 * 
 * Displays layer name, type, duration, and controls:
 * - Editable layer name (click to edit)
 * - Layer type badge with color
 * - Duration display
 * - Lock and Solo indicators
 */

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../../../utils/general/utils';
import { useCompositionEditorStore } from '../../../../stores/composition-editor-store';
import type { CompositionLayer } from '../../../../types/composition';
import { getLayerTypeColor } from '../../../../types/composition';
import { Input } from '../../../ui/input';
import { Badge } from '../../../ui/badge';
import { Lock, CircleDot, Clock } from 'lucide-react';
import { 
  Type, 
  Square, 
  Palette, 
  Image, 
  Film, 
  Crosshair, 
  Sliders,
  Layers
} from 'lucide-react';

// ==========================================
// TYPES
// ==========================================

interface LayerInfoCardProps {
  layer: CompositionLayer;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const getLayerIcon = (type: string) => {
  const className = "h-4 w-4";
  switch (type) {
    case 'text': return <Type className={className} />;
    case 'shape': return <Square className={className} />;
    case 'solid': return <Palette className={className} />;
    case 'image': return <Image className={className} />;
    case 'video': return <Film className={className} />;
    case 'null': return <Crosshair className={className} />;
    case 'adjustment': return <Sliders className={className} />;
    default: return <Layers className={className} />;
  }
};

const getLayerTypeName = (type: string) => {
  switch (type) {
    case 'text': return 'Text';
    case 'shape': return 'Shape';
    case 'solid': return 'Solid';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'null': return 'Null';
    case 'adjustment': return 'Adjustment';
    default: return 'Layer';
  }
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const LayerInfoCard: React.FC<LayerInfoCardProps> = ({ layer }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const updateLayer = useCompositionEditorStore((state) => state.updateLayer);
  const composition = useCompositionEditorStore((state) => state.composition);

  const layerColor = layer.color || getLayerTypeColor(layer.type);
  const fps = composition?.fps || 30;

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== layer.name) {
      updateLayer(layer.id, { name: editedName.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditedName(layer.name);
      setIsEditing(false);
    }
  };

  // Calculate duration in seconds
  const durationSeconds = (layer.duration / fps).toFixed(2);

  return (
    <div className="space-y-3">
      {/* Layer Name (editable) */}
      <div className="flex items-center gap-2">
        <div 
          className="w-1 h-6 rounded-full shrink-0" 
          style={{ backgroundColor: layerColor }}
        />
        
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm font-medium flex-1 bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
          />
        ) : (
          <h2
            className="text-sm font-medium flex-1 truncate cursor-pointer hover:text-primary transition-colors"
            onClick={() => setIsEditing(true)}
            title="Click to edit name"
          >
            {layer.name}
          </h2>
        )}

        {/* Type Badge */}
        <Badge
          variant="secondary"
          className="flex items-center gap-1.5 px-2.5 py-1"
          style={{ 
            backgroundColor: `${layerColor}20`,
            borderColor: `${layerColor}40`,
            color: layerColor
          }}
        >
          {getLayerIcon(layer.type)}
          <span className="text-xs font-medium">{getLayerTypeName(layer.type)}</span>
        </Badge>
      </div>

      {/* Layer Stats */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Duration</span>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{layer.duration}f</span>
            <span className="text-muted-foreground/60">•</span>
            <span className="font-mono">{durationSeconds}s</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">In Point</span>
          <span className="font-mono">{layer.startTime}f</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Out Point</span>
          <span className="font-mono">{layer.startTime + layer.duration}f</span>
        </div>
      </div>

      {/* Layer State Indicators */}
      {(layer.locked || layer.solo) && (
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          {layer.locked && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <Lock className="h-3.5 w-3.5" />
              <span>Locked</span>
            </div>
          )}
          {layer.solo && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <CircleDot className="h-3.5 w-3.5" />
              <span>Solo</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LayerInfoCard;
