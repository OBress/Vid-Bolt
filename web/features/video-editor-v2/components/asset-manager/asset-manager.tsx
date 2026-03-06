/**
 * AssetManager - Professional media browser panel
 * 
 * Organized into tabs:
 * - Media: Videos, Images, Audio, and Uploads (with filter sub-tabs)
 * - Text: Text presets and templates
 * - Shapes: Shape elements
 * - Effects: Transitions and effects
 * - AI: AI-powered image/video generation, editing, and future audio/SFX
 * 
 * Features:
 * - Search functionality
 * - Drag to timeline/canvas
 * - Grid/masonry layout
 * - Horizontally scrollable tab bar for narrow viewports
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

// PERF: Lazy-loaded asset manager tabs — only the active tab's code is loaded.
// Heaviest tabs: MotionGraphicsTab (~57KB), MediaTab (~49KB), EffectsTab (~47KB).
const MediaTab = React.lazy(() => import("./tabs/media-tab").then(m => ({ default: m.MediaTab })));
const TextTab = React.lazy(() => import("./tabs/text-tab").then(m => ({ default: m.TextTab })));
const EffectsTab = React.lazy(() => import("./tabs/effects-tab").then(m => ({ default: m.EffectsTab })));
const ShapesTab = React.lazy(() => import("./tabs/shapes-tab").then(m => ({ default: m.ShapesTab })));
const AIGenerationTab = React.lazy(() => import("./tabs/ai-generation-tab").then(m => ({ default: m.AIGenerationTab })));

/** Lightweight skeleton shown while tab chunks are loading */
const TabSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 p-3 animate-pulse">
    <div className="h-8 bg-muted/40 rounded-md w-full" />
    <div className="grid grid-cols-2 gap-2">
      <div className="h-20 bg-muted/20 rounded-md" />
      <div className="h-20 bg-muted/20 rounded-md" />
      <div className="h-20 bg-muted/20 rounded-md" />
      <div className="h-20 bg-muted/20 rounded-md" />
    </div>
  </div>
);

import {
  ImageIcon,
  Type,
  Sparkles,
  PanelLeftClose,
  Shapes,
  Bot,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

export type AssetManagerTab = 'media' | 'text' | 'shapes' | 'effects' | 'ai';

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
  { id: 'ai', label: 'AI', icon: Bot },
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
        {/* Tab Headers - horizontally scrollable on narrow viewports */}
        <div className="absolute top-10 left-0 right-0 z-10 border-b border-border bg-muted/10 overflow-x-auto scrollbar-hide">
          <TabsList className="h-9 bg-transparent p-0 rounded-none justify-start inline-flex min-w-full">
            {TABS_CONFIG.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className={cn(
                  "flex-1 min-w-0 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1 px-2 whitespace-nowrap"
                )}
              >
                {React.createElement(Icon, { className: "h-3.5 w-3.5 shrink-0" })}
                <span className="text-xs">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Tab Content - absolute positioned below tabs (header 40px + tabs 36px = 76px) */}
        <div className="absolute top-[76px] left-0 right-0 bottom-0 overflow-hidden">
          <TabsContent value="media" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <React.Suspense fallback={<TabSkeleton />}>
              <MediaTab />
            </React.Suspense>
          </TabsContent>
          
          <TabsContent value="text" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <React.Suspense fallback={<TabSkeleton />}>
              <TextTab />
            </React.Suspense>
          </TabsContent>
          
          <TabsContent value="shapes" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <React.Suspense fallback={<TabSkeleton />}>
              <ShapesTab />
            </React.Suspense>
          </TabsContent>
          
          <TabsContent value="effects" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <React.Suspense fallback={<TabSkeleton />}>
              <EffectsTab />
            </React.Suspense>
          </TabsContent>
          
          <TabsContent value="ai" className="h-full m-0 p-0 overflow-hidden data-[state=inactive]:hidden">
            <React.Suspense fallback={<TabSkeleton />}>
              <AIGenerationTab />
            </React.Suspense>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default AssetManager;
