/**
 * CompositionInspector - Effect Controls Panel for Composition Editor
 * 
 * Tabbed interface with distinct visual sections:
 * - Layer Info: Editable name, type, duration
 * - Transform: Position, scale, rotation, opacity with stopwatches
 * - Properties: Type-specific properties (text, shape, solid, etc.)
 */

import React, { useMemo, useState } from "react";
import { useCompositionEditorStore } from "../../../stores/composition-editor-store";
import { CompositionSettingsSection } from "./sections/composition-settings-section";
import { LayerTransformSection } from "./sections/layer-transform-section";
import { TextLayerSection } from "./sections/text-layer-section";
import { ShapeLayerSection } from "./sections/shape-layer-section";
import { SolidLayerSection } from "./sections/solid-layer-section";
import { PropertyCard } from "./components/property-card";
import { LayerInfoCard } from "./components/layer-info-card";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import {
  PanelRightClose,
  Settings,
  Move,
  Palette,
  Layers,
  Type,
  Square,
  Image,
  Film,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";
import { DEFAULT_LAYER_TRANSFORM } from "../../../types/composition";

// ==========================================
// TYPES
// ==========================================

interface CompositionInspectorProps {
  onClose?: () => void;
}

// ==========================================
// NO SELECTION STATE
// ==========================================

const NoSelectionState = React.memo(() => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <Layers className="h-8 w-8 text-muted-foreground" />
    </div>
    <h3 className="text-sm font-semibold mb-2">No Layer Selected</h3>
    <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
      Select a layer in the timeline to edit its properties and add animations
    </p>
  </div>
));

// ==========================================
// MULTI-SELECT STATE
// ==========================================

interface MultiSelectStateProps {
  count: number;
}

const MultiSelectState = React.memo<MultiSelectStateProps>(({ count }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <Layers className="h-8 w-8 text-muted-foreground" />
    </div>
    <h3 className="text-sm font-semibold mb-2">{count} Layers Selected</h3>
    <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
      Multi-selection editing coming soon. Select a single layer to edit properties.
    </p>
  </div>
));

// ==========================================
// MAIN COMPONENT
// ==========================================

export const CompositionInspector: React.FC<CompositionInspectorProps> = ({
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState("properties");
  
  // Store state
  const composition = useCompositionEditorStore((state) => state.composition);
  const selectionLayerIds = useCompositionEditorStore((state) => state.selection.layerIds);
  const updateComposition = useCompositionEditorStore((state) => state.updateComposition);
  const updateLayerTransform = useCompositionEditorStore((state) => state.updateLayerTransform);
  const updateLayerProperties = useCompositionEditorStore((state) => state.updateLayerProperties);

  // Determine selection state
  const hasSelection = selectionLayerIds.length > 0;
  const hasMultiSelection = selectionLayerIds.length > 1;
  const hasSingleSelection = selectionLayerIds.length === 1;
  
  // Get selected layer (only for single selection)
  const selectedLayer = useMemo(() => {
    if (!composition || !hasSingleSelection) return null;
    return composition.layers.find(l => l.id === selectionLayerIds[0]) || null;
  }, [composition, hasSingleSelection, selectionLayerIds]);

  // Reset transform to defaults
  const handleResetTransform = () => {
    if (!selectedLayer) return;
    updateLayerTransform(selectedLayer.id, DEFAULT_LAYER_TRANSFORM);
  };

  // Get property icon for selected layer
  const getPropertyIcon = () => {
    if (!selectedLayer) return <Palette className="h-3.5 w-3.5" />;
    switch (selectedLayer.type) {
      case 'text': return <Type className="h-3.5 w-3.5" />;
      case 'shape': return <Square className="h-3.5 w-3.5" />;
      case 'solid': return <Palette className="h-3.5 w-3.5" />;
      case 'image': return <Image className="h-3.5 w-3.5" />;
      case 'video': return <Film className="h-3.5 w-3.5" />;
      default: return <Layers className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 h-10 flex items-center justify-between px-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Effect Controls</span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Content with Tabs */}
      {!hasSelection && composition && (
        <ScrollArea className="flex-1">
          <div className="p-3">
            <CompositionSettingsSection
              composition={composition}
              onUpdate={updateComposition}
            />
          </div>
        </ScrollArea>
      )}

      {hasMultiSelection && (
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
          <Layers className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h3 className="text-sm font-semibold mb-1">{selectionLayerIds.length} Layers Selected</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select a single layer to edit properties.
          </p>
        </div>
      )}

      {selectedLayer && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 border-b border-border bg-muted/10">
            <TabsList className="w-full h-9 p-0 bg-transparent rounded-none justify-start">
              <TabsTrigger 
                value="properties"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <Move className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Properties</span>
              </TabsTrigger>
              <TabsTrigger 
                value="style"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                {getPropertyIcon()}
                <span className="text-xs font-medium">Style</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0">
            <TabsContent value="properties" className="h-full m-0 focus-visible:outline-none focus-visible:ring-0">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {/* Layer Info Card */}
                  <Card className="bg-[#222225] shadow-none border-0">
                    <CardHeader className="p-3 pb-2 flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-xs font-medium flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-cyan-400" />
                        Layer Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <LayerInfoCard layer={selectedLayer} />
                    </CardContent>
                  </Card>

                  {/* Transform Section - has its own cards inside */}
                  <LayerTransformSection
                    layer={selectedLayer}
                    onUpdate={(updates) => updateLayerTransform(selectedLayer.id, updates)}
                  />
                  
                  {/* Reset Transform Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs bg-[#222225] hover:bg-[#2a2a2d] border-0"
                    onClick={handleResetTransform}
                  >
                    Reset All Transform
                  </Button>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="style" className="h-full m-0 focus-visible:outline-none focus-visible:ring-0">
              <ScrollArea className="h-full">
                <div className="p-3">
                  {selectedLayer.type === 'text' && selectedLayer.layerProperties?.type === 'text' && (
                    <TextLayerSection
                      properties={selectedLayer.layerProperties.properties || {}}
                      onUpdate={(updates) => updateLayerProperties(selectedLayer.id, updates)}
                    />
                  )}

                  {selectedLayer.type === 'shape' && selectedLayer.layerProperties?.type === 'shape' && (
                    <ShapeLayerSection
                      properties={selectedLayer.layerProperties.properties || {}}
                      onUpdate={(updates) => updateLayerProperties(selectedLayer.id, updates)}
                    />
                  )}

                  {selectedLayer.type === 'solid' && selectedLayer.layerProperties?.type === 'solid' && (
                    <SolidLayerSection
                      properties={selectedLayer.layerProperties.properties || {}}
                      onUpdate={(updates) => updateLayerProperties(selectedLayer.id, updates)}
                    />
                  )}

                  {(selectedLayer.type === 'image' || selectedLayer.type === 'video' || 
                    selectedLayer.type === 'null' || selectedLayer.type === 'adjustment') && (
                    <Card className="bg-[#222225] shadow-none border-0 p-8">
                      <div className="flex flex-col items-center justify-center text-center">
                        {selectedLayer.type === 'image' && <Image className="h-10 w-10 text-muted-foreground/30 mb-3" />}
                        {selectedLayer.type === 'video' && <Film className="h-10 w-10 text-muted-foreground/30 mb-3" />}
                        {(selectedLayer.type === 'null' || selectedLayer.type === 'adjustment') && 
                          <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />}
                        <p className="text-xs text-muted-foreground font-medium">
                          {selectedLayer.type === 'image' && 'Image properties coming soon'}
                          {selectedLayer.type === 'video' && 'Video properties coming soon'}
                          {selectedLayer.type === 'null' && 'Null objects have no visual properties'}
                          {selectedLayer.type === 'adjustment' && 'Adjustment layers have no visual properties'}
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default CompositionInspector;
