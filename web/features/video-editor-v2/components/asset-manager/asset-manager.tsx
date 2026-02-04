/**
 * AssetManager - Professional media browser panel
 * 
 * Organized into tabs:
 * - Media: Videos, Images, Audio, and Uploads (with filter sub-tabs)
 * - Text: Text presets and templates
 * - Shapes: Shape elements
 * - Effects: Transitions and effects
 * 
 * Features:
 * - Search functionality
 * - Drag to timeline/canvas
 * - Grid/masonry layout
 */

import React, { useState } from "react";
import { cn } from "../../utils/general/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// Import tab content components
import { MediaTab } from "./tabs/media-tab";
import { TextTab } from "./tabs/text-tab";
import { EffectsTab } from "./tabs/effects-tab";
import { ShapesTab } from "./tabs/shapes-tab";
import { MotionGraphicsTab } from "./tabs/motion-graphics-tab";

import {
  ImageIcon,
  Type,
  Sparkles,
  PanelLeftClose,
  Shapes,
  Wand2,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

export type AssetManagerTab = 'media' | 'text' | 'shapes' | 'effects' | 'motion-graphics';

interface AssetManagerProps {
  /** Default active tab */
  defaultTab?: AssetManagerTab;
  /** Callback when tab changes */
  onTabChange?: (tab: AssetManagerTab) => void;
  /** Callback to collapse/close the panel */
  onClose?: () => void;
  /** Additional class names */
  className?: string;
}

// ==========================================
// TAB CONFIGURATION
// ==========================================

const TABS_CONFIG: Array<{
  id: AssetManagerTab;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'shapes', label: 'Shapes', icon: Shapes },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'motion-graphics', label: 'Motion', icon: Wand2 },
];

// ==========================================
// ASSET MANAGER COMPONENT
// ==========================================

export const AssetManager: React.FC<AssetManagerProps> = ({
  defaultTab = 'media',
  onTabChange,
  onClose,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<AssetManagerTab>(defaultTab);

  const handleTabChange = (value: string) => {
    const newTab = value as AssetManagerTab;
    setActiveTab(newTab);
    onTabChange?.(newTab);
  };

  return (
    <div 
      className={cn("relative h-full overflow-hidden", className)}
      style={{ padding: 0, margin: 0, height: '100%' }}
    >
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="h-full"
        style={{ padding: 0, margin: 0, height: '100%' }}
      >
        {/* Header with title and collapse button - spans full width */}
        <div 
          className="absolute top-0 z-10 flex items-center h-10 border-b border-border bg-muted/20"
          style={{ left: 0, right: 0, margin: 0, padding: 0 }}
        >
          <h3 className="text-sm font-medium flex-1 px-3">Assets</h3>
          {onClose && (
            <div className="pr-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={onClose}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse Panel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
        
        {/* Tab Headers - below title */}
        <div className="absolute top-10 left-0 right-0 z-10 border-b border-border bg-muted/10">
          <TabsList className="w-full h-9 bg-transparent p-0 rounded-none justify-start">
            {TABS_CONFIG.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Tab Content - absolute positioned below tabs (header 40px + tabs 36px = 76px) */}
        <div className="absolute top-[76px] left-0 right-0 bottom-0 overflow-hidden">
          <TabsContent value="media" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <MediaTab />
          </TabsContent>
          
          <TabsContent value="text" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <TextTab />
          </TabsContent>
          
          <TabsContent value="shapes" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <ShapesTab />
          </TabsContent>
          
          <TabsContent value="effects" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <EffectsTab />
          </TabsContent>
          
          <TabsContent value="motion-graphics" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <MotionGraphicsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default AssetManager;
