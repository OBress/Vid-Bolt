/**
 * InspectorPanel - V2 Unified Inspector
 * 
 * Clean, professional inspector panel that works directly with timeline clips.
 * Supports single and multi-select editing with linked item tabs.
 * - Properties Tab: Transform (position, scale, rotation)
 * - Style Tab: Type-specific appearance and styling
 * - Effects Tab: Visual effects, filters, blend modes
 * - Color Tab: Professional color grading and correction
 * 
 * Supports multi-select: only shows shared properties when multiple items selected.
 * Also supports transition selection: shows transition properties when a transition is selected.
 * 
 * Uses VideoEditorStore directly for all state (single source of truth).
 */

import React, { useMemo, useEffect, useCallback, useState } from "react";
import { cn } from "../../utils/general/utils";
import { useEditorContext } from "../../contexts/editor-context";
import { useVideoEditorStore, useTypedStore, selectSelectedTransition } from "../../stores/video-editor-store";
import { useShallow } from 'zustand/react/shallow';
import { clipsToOverlays, clipToOverlay } from "../../utils/clip-to-render-adapter";
import { OverlayType, Overlay, VideoTransitionType, AudioTransitionType, TransitionEasing } from "../../types";
import type { TimelineClip } from "../../types/timeline-v2";

import { PanelRightClose, Layers, Info, Shuffle, Move, Palette, Sparkles, SlidersHorizontal, Clock, Wand2, Scan } from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

// Import inspector sections
import { TransformSection } from "./sections/transform-section";
import { AppearanceSection } from "./sections/appearance-section";
import { EffectsSection } from "./sections/effects-section";
import { MasksSection } from "./sections/masks-section";
import { TransitionInspector } from "./sections/transition-inspector";
import { ShapeSection } from "./sections/shape-section";
import { TextSection } from "./sections/text-section";
import { VideoSection } from "./sections/video-section";
import { ImageSection } from "./sections/image-section";
import { AudioSection } from "./sections/audio-section";
import { ColorGradingSection } from "./sections/color-grading-section";
import { KeyframesSection } from "./sections/keyframes-section";
import { AudioInspector } from "./audio-inspector";
import { MotionGraphicsSection } from "./sections/motion-graphics-section";
import type { MotionGraphicsOverlay } from "../../types/motion-graphics";

// ==========================================
// TYPES
// ==========================================

type SelectionType = 'none' | 'single' | 'multi';

interface SelectionInfo {
  type: SelectionType;
  clips: TimelineClip[];
  overlays: Overlay[]; // Converted for inspector sections
  commonType: OverlayType | null;
  hasVisualClips: boolean;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getClipOverlayType(clip: TimelineClip): OverlayType {
  switch (clip.type) {
    case 'video': return OverlayType.VIDEO;
    case 'audio': return OverlayType.SOUND;
    case 'image': return OverlayType.IMAGE;
    case 'text': return OverlayType.TEXT;
    case 'shape': return OverlayType.SHAPE;
    case 'caption': return OverlayType.CAPTION;
    case 'sticker': return OverlayType.STICKER;
    case 'motion-graphics': return OverlayType.MOTION_GRAPHICS;
    default: return OverlayType.VIDEO;
  }
}

function getSelectionInfo(
  selectedClipIds: string[],
  clips: TimelineClip[],
  fps: number
): SelectionInfo {
  // Guard against undefined/null
  if (!selectedClipIds || !clips || selectedClipIds.length === 0) {
    return {
      type: 'none',
      clips: [],
      overlays: [],
      commonType: null,
      hasVisualClips: false,
    };
  }

  const selectedClips = clips.filter(c => selectedClipIds.includes(c.id));
  
  if (selectedClips.length === 0) {
    return {
      type: 'none',
      clips: [],
      overlays: [],
      commonType: null,
      hasVisualClips: false,
    };
  }

  const types = new Set(selectedClips.map(c => getClipOverlayType(c)));
  const commonType = types.size === 1 ? getClipOverlayType(selectedClips[0]) : null;
  
  const hasVisualClips = selectedClips.every(c => c.type !== 'audio');
  
  // Convert clips to overlays for inspector sections
  const overlays = clipsToOverlays(selectedClips, fps);

  return {
    type: selectedClips.length === 1 ? 'single' : 'multi',
    clips: selectedClips,
    overlays,
    commonType,
    hasVisualClips,
  };
}

function getOverlayTypeName(type: OverlayType): string {
  switch (type) {
    case OverlayType.VIDEO: return 'Video';
    case OverlayType.IMAGE: return 'Image';
    case OverlayType.TEXT: return 'Text';
    case OverlayType.SHAPE: return 'Shape';
    case OverlayType.SOUND: return 'Audio';
    case OverlayType.CAPTION: return 'Caption';
    case OverlayType.STICKER: return 'Sticker';
    case OverlayType.MOTION_GRAPHICS: return 'Motion Graphics';
    default: return 'Unknown';
  }
}

// ==========================================
// COLLAPSIBLE SECTION COMPONENT
// ==========================================

interface InspectorSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const InspectorSection: React.FC<InspectorSectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  children,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors group">
        <div className={cn(
          "w-4 h-4 flex items-center justify-center transition-transform",
          isOpen && "rotate-90"
        )}>
          <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="text-muted-foreground">
            <path d="M1 1L5 5L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-sm font-medium flex-1 text-left">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className="px-3 pb-3"
          style={{
            contentVisibility: isOpen ? 'visible' : 'auto',
            containIntrinsicSize: '0 200px',
          }}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ==========================================
// EMPTY STATE COMPONENT
// ==========================================

const EmptyState: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
      <Layers className="w-6 h-6 text-muted-foreground" />
    </div>
    <h3 className="text-sm font-medium mb-1">No Selection</h3>
    <p className="text-xs text-muted-foreground max-w-[200px]">
      Select an element on the canvas or timeline to edit its properties.
    </p>
  </div>
);

// ==========================================
// TRANSITION SELECTION INFO COMPONENT
// ==========================================

interface TransitionSelectionInfoProps {
  position: "start" | "end";
  clipType: string;
}

const TransitionSelectionInfo: React.FC<TransitionSelectionInfoProps> = ({ position, clipType }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-border">
    <Shuffle className="w-4 h-4 text-primary" />
    <span className="text-xs text-foreground">
      {position === "start" ? "In" : "Out"} Transition
      <span className="text-muted-foreground ml-1">
        ({clipType === "audio" ? "Audio" : "Video"})
      </span>
    </span>
  </div>
);

// ==========================================
// MULTI-SELECT INFO COMPONENT
// ==========================================

interface MultiSelectInfoProps {
  count: number;
  commonType: OverlayType | null;
}

const MultiSelectInfo: React.FC<MultiSelectInfoProps> = ({ count, commonType }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
    <Info className="w-4 h-4 text-muted-foreground" />
    <span className="text-xs text-muted-foreground">
      {count} items selected
      {commonType && ` (${getOverlayTypeName(commonType)})`}
      {!commonType && ' (mixed types)'}
    </span>
  </div>
);

// ==========================================
// LINKED ITEM TABS COMPONENT
// ==========================================

interface LinkedItemTabsProps {
  clips: TimelineClip[];
  activeClipId: string;
  onSelectClip: (id: string) => void;
}

const LinkedItemTabs: React.FC<LinkedItemTabsProps> = ({ clips, activeClipId, onSelectClip }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'video':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M10 9l5 3-5 3V9z" />
          </svg>
        );
      case 'audio':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );
      case 'image':
        return (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        );
      default:
        return <Layers className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 border-b border-border overflow-x-auto">
      {clips.map((clip, index) => {
        const isActive = clip.id === activeClipId;
        const typeName = clip.type.charAt(0).toUpperCase() + clip.type.slice(1);
        const label = clip.name || `${typeName} ${index + 1}`;
        
        return (
          <button
            key={clip.id}
            onClick={() => onSelectClip(clip.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
              "hover:bg-muted/80",
              isActive 
                ? "bg-primary/20 text-primary border border-primary/30" 
                : "bg-muted/50 text-muted-foreground border border-transparent"
            )}
          >
            {getIcon(clip.type)}
            <span className="truncate max-w-[80px]">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ==========================================
// INSPECTOR PANEL PROPS
// ==========================================

export interface InspectorPanelProps {
  onClose?: () => void;
  className?: string;
}

// ==========================================
// INSPECTOR PANEL COMPONENT
// ==========================================

type InspectorTab = 'properties' | 'style' | 'effects' | 'color' | 'animation';

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  onClose,
  className,
}) => {
  // Get config from context
  const { fps: contextFps } = useEditorContext();
  
  // Get state directly from the unified store
  // PERF: Only subscribe reactively to selectedClipIds, fps, and actions.
  // Clips/tracks/transitions are read on-demand via getState() to avoid
  // re-rendering when unrelated clips change.
  const selectedClipIds = useTypedStore(useShallow(state => state.selection?.clipIds)) || [];
  const storeFps = useTypedStore(state => state.fps);
  const fps = storeFps || contextFps || 30;
  const updateClip = useTypedStore(state => state.updateClip);
  const selectClip = useTypedStore(state => state.selectClip);
  const getLinkedClipIds = useTypedStore(state => state.getLinkedClipIds);

  // Track active tab
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');
  
  // Track which clip is being edited in multi-select
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  
  // Keyboard shortcuts for tab switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            setActiveTab('properties');
            break;
          case '2':
            e.preventDefault();
            setActiveTab('style');
            break;
          case '3':
            e.preventDefault();
            setActiveTab('effects');
            break;
          case '4':
            e.preventDefault();
            setActiveTab('color');
            break;
          case '5':
            e.preventDefault();
            setActiveTab('animation');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // === STORE INTEGRATION ===
  const storeSelectedTransition = useVideoEditorStore(selectSelectedTransition);
  
  const handleStoreTransitionUpdate = useCallback((updates: {
    type?: VideoTransitionType | AudioTransitionType;
    duration?: number;
    easing?: TransitionEasing;
  }) => {
    if (storeSelectedTransition) {
      useVideoEditorStore.getState().updateTransition(storeSelectedTransition.id, updates);
    }
  }, [storeSelectedTransition]);

  const handleStoreTransitionRemove = useCallback(() => {
    if (storeSelectedTransition) {
      useVideoEditorStore.getState().removeTransition(storeSelectedTransition.id);
    }
  }, [storeSelectedTransition]);

  // Get selection info — direct O(K) lookup by ID instead of O(N) materialization
  const selectionInfo = useMemo(() => {
    if (!selectedClipIds || selectedClipIds.length === 0) {
      return { type: 'none' as const, clips: [], overlays: [], commonType: null, hasVisualClips: false };
    }
    const state = useVideoEditorStore.getState();
    const selectedClips = selectedClipIds
      .map(id => state.clips[id])
      .filter(Boolean) as TimelineClip[];
    if (selectedClips.length === 0) {
      return { type: 'none' as const, clips: [], overlays: [], commonType: null, hasVisualClips: false };
    }
    const types = new Set(selectedClips.map(c => getClipOverlayType(c)));
    const commonType = types.size === 1 ? getClipOverlayType(selectedClips[0]) : null;
    const hasVisualClips = selectedClips.every(c => c.type !== 'audio');
    const overlays = clipsToOverlays(selectedClips, fps);
    return {
      type: (selectedClips.length === 1 ? 'single' : 'multi') as 'single' | 'multi',
      clips: selectedClips,
      overlays,
      commonType,
      hasVisualClips,
    };
  }, [selectedClipIds, fps]);

  // Sync activeClipId when selection changes
  useEffect(() => {
    if (selectionInfo.clips.length > 0) {
      if (!selectionInfo.clips.some(c => c.id === activeClipId)) {
        setActiveClipId(selectionInfo.clips[0].id);
      }
    } else {
      setActiveClipId(null);
    }
  }, [selectionInfo.clips, activeClipId]);

  // Get the currently active clip and its overlay representation
  const activeClip = useMemo(() => {
    if (selectionInfo.type === 'single') {
      return selectionInfo.clips[0];
    }
    if (selectionInfo.type === 'multi' && activeClipId !== null) {
      return selectionInfo.clips.find(c => c.id === activeClipId) || selectionInfo.clips[0];
    }
    return null;
  }, [selectionInfo, activeClipId]);

  // Convert active clip to overlay for inspector sections
  const activeOverlay = useMemo(() => {
    if (!activeClip) {
      return null;
    }
    // Read tracks and transitions on-demand via getState()
    const state = useVideoEditorStore.getState();
    const tracks = Object.values(state.tracks) as any[];
    const transitions = state.transitions || {};
    const track = tracks.find((t: any) => t.id === activeClip.trackId);
    const trackIndex = track ? track.order : 0;
    const overlay = clipToOverlay(activeClip, fps, trackIndex, transitions);
    
    // Debug logging for motion graphics
    if (activeClip.type === 'motion-graphics') {
      console.log('[InspectorPanel] Motion graphics clip selected:', {
        clipId: activeClip.id,
        clipType: activeClip.type,
        overlayType: overlay.type,
        hasProperties: !!activeClip.properties,
        hasTemplate: !!activeClip.properties?.template,
      });
    }
    
    return overlay;
  }, [activeClip, fps]);

  // Find clip for selected transition
  const transitionClip = useMemo(() => {
    if (!storeSelectedTransition) return null;
    const clipId = storeSelectedTransition.clipIds?.[0];
    if (!clipId) return null;
    // Read clips on-demand
    const state = useVideoEditorStore.getState();
    const clip = state.clips[clipId] as TimelineClip | undefined;
    return clip || null;
  }, [storeSelectedTransition]);

  const isTransitionSelected = storeSelectedTransition !== null && transitionClip !== null;
  
  // Debug log for transition selection
  if (storeSelectedTransition) {
    console.log('[InspectorPanel] Transition selection:', {
      storeSelectedTransition: storeSelectedTransition ? storeSelectedTransition.id : null,
      transitionClip: transitionClip ? transitionClip.id : null,
      isTransitionSelected,
    });
  }

  // Handler to update clip properties (converts overlay format back to clip format)
  const handleChangeOverlay = useCallback((id: number, updater: (prev: Overlay) => any) => {
    // Read clips and tracks on-demand via getState()
    const state = useVideoEditorStore.getState();
    const timelineClips = Object.values(state.clips) as TimelineClip[];
    const timelineTracks = Object.values(state.tracks) as any[];
    const transitions = state.transitions || {};

    // Find the clip by numeric ID (converted from overlay)
    // The overlay ID is created by: parseInt(clip.id.replace(/\D/g, ''), 10)
    // So we need to use the same logic to match
    const clip = timelineClips.find(c => {
      const clipNumericId = parseInt(c.id.replace(/\D/g, ''), 10) || 0;
      return clipNumericId === id;
    });
    if (!clip) {
      return;
    }
    
    // Find the track index for this clip
    const track = timelineTracks.find((t: any) => t.id === clip.trackId);
    const trackIndex = track ? track.order : 0;
    
    // Get current overlay representation
    const currentOverlay = clipToOverlay(clip, fps, trackIndex, transitions);
    
    // Apply updates
    const updatedOverlay = updater(currentOverlay);
    
    // Convert overlay updates back to clip format
    const clipUpdates: Partial<TimelineClip> = {};
    
    // Check for transform property changes - these go into clip.transform
    const transformChanged = 
      updatedOverlay.left !== currentOverlay.left ||
      updatedOverlay.top !== currentOverlay.top ||
      updatedOverlay.width !== currentOverlay.width ||
      updatedOverlay.height !== currentOverlay.height ||
      updatedOverlay.rotation !== currentOverlay.rotation;
    
    if (transformChanged) {
      clipUpdates.transform = {
        ...(clip.transform || { x: 0, y: 0, width: 100, height: 100, rotation: 0 }),
        x: updatedOverlay.left,
        y: updatedOverlay.top,
        width: updatedOverlay.width,
        height: updatedOverlay.height,
        rotation: updatedOverlay.rotation,
      };
    }
    
    // Check for style property changes - these go into clip.styles
    // This includes: opacity, mixBlendMode, filter, borderRadius, crop settings, colorGrading, etc.
    const updatedStyles = (updatedOverlay as any).styles || {};
    const currentStyles = (currentOverlay as any).styles || {};
    
    // Compare entire styles object - simpler and catches all style changes
    const stylesChanged = JSON.stringify(updatedStyles) !== JSON.stringify(currentStyles);
    
    if (stylesChanged) {
      clipUpdates.styles = {
        ...(clip.styles || {}),
        ...updatedStyles,
      };
      
      // Also update top-level opacity for backward compatibility
      if (updatedStyles.opacity !== undefined) {
        clipUpdates.opacity = updatedStyles.opacity;
      }
    }
    
    // Copy content and other properties
    if ((updatedOverlay as any).content !== (currentOverlay as any).content) {
      clipUpdates.content = (updatedOverlay as any).content;
    }
    
    // Volume for audio/video
    if ((updatedOverlay as any).volume !== undefined && (updatedOverlay as any).volume !== (currentOverlay as any).volume) {
      clipUpdates.volume = (updatedOverlay as any).volume;
      }
    
    // Text properties
    if ((updatedOverlay as any).text !== undefined) {
      clipUpdates.text = (updatedOverlay as any).text;
    }
    
    // Data properties (for shapes, stickers, etc.)
    if ((updatedOverlay as any).data !== undefined) {
      clipUpdates.data = {
        ...(clip.data || {}),
        ...(updatedOverlay as any).data,
      };
    }
    
    // Effects array
    const updatedEffects = (updatedOverlay as any).effects;
    const currentEffects = (currentOverlay as any).effects;
    if (updatedEffects !== undefined && JSON.stringify(updatedEffects) !== JSON.stringify(currentEffects)) {
      clipUpdates.effects = updatedEffects;
    }
    
    // Masks array (for masking/cropping)
    const updatedMasks = (updatedOverlay as any).masks;
    const currentMasks = (currentOverlay as any).masks;
    if (updatedMasks !== undefined && JSON.stringify(updatedMasks) !== JSON.stringify(currentMasks)) {
      clipUpdates.masks = updatedMasks;
    }
    
    // Greenscreen settings
    const updatedGreenscreen = (updatedOverlay as any).greenscreen;
    const currentGreenscreen = (currentOverlay as any).greenscreen;
    if (updatedGreenscreen !== undefined && JSON.stringify(updatedGreenscreen) !== JSON.stringify(currentGreenscreen)) {
      clipUpdates.greenscreen = updatedGreenscreen;
    }
    
    // Detect speed changes - apply to all linked clips
    const speedChanged = (updatedOverlay as any).speed !== undefined && 
                        (updatedOverlay as any).speed !== (currentOverlay as any).speed;
    
    if (speedChanged) {
      const newSpeed = (updatedOverlay as any).speed;
      const linkedClipIds = getLinkedClipIds(clip.id);
      
      console.log('[InspectorPanel] Speed change detected, applying to linked clips:', linkedClipIds);
      
      // Update all linked clips
      linkedClipIds.forEach(linkedId => {
        const linkedClip = timelineClips.find((c: TimelineClip) => c.id === linkedId);
        if (linkedClip) {
          const originalDuration = linkedClip.media?.mediaDuration || linkedClip.duration;
          const newDuration = originalDuration / newSpeed;
          
          updateClip(linkedId, {
            media: {
              ...(linkedClip.media as any),
              speed: newSpeed,
            },
            duration: newDuration,
          } as any);
        }
      });
      
      // Don't update the original clip again since we just did all linked clips
      return;
    }
    
    // Only update if there are actual changes
    if (Object.keys(clipUpdates).length > 0) {
    updateClip(clip.id, clipUpdates);
    }
  }, [fps, updateClip, getLinkedClipIds]);

  return (
    <div 
      data-inspector-panel
      className={cn("relative h-full overflow-hidden", className)}
      style={{ padding: 0, margin: 0, height: '100%' }}
    >
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as InspectorTab)} 
        className="h-full"
        style={{ padding: 0, margin: 0, height: '100%' }}
      >
        {/* Header */}
        <div 
          className="absolute top-0 z-10 flex items-center h-10 border-b border-border bg-muted/20"
          style={{ left: 0, right: 0, margin: 0, padding: 0 }}
        >
          <h3 className="text-sm font-medium flex-1 px-3">Inspector</h3>
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
                      <PanelRightClose className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Collapse Panel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Transition Selection View */}
        {isTransitionSelected && transitionClip && storeSelectedTransition ? (
        <>
          <div className="absolute top-10 left-0 right-0 bottom-0 overflow-hidden">
            <ScrollArea className="h-full w-full inspector-scrollbar" style={{ height: '100%' }}>
              <TransitionInspector
                transition={storeSelectedTransition}
                onUpdate={(updates) => {
                  handleStoreTransitionUpdate(updates as {
                    type?: VideoTransitionType | AudioTransitionType;
                    duration?: number;
                    easing?: TransitionEasing;
                      });
                }}
                onRemove={handleStoreTransitionRemove}
                />
            </ScrollArea>
          </div>
        </>
      ) : selectionInfo.type === 'none' ? (
        <div className="absolute top-10 left-0 right-0 bottom-0 overflow-hidden">
          <EmptyState />
        </div>
      ) : activeClip?.type === 'audio' && activeOverlay ? (
        /* Audio Clip - Use dedicated AudioInspector */
        <>
          {/* Multi-select: Show item tabs for audio clips too */}
          {selectionInfo.type === 'multi' && activeClipId !== null && (
            <div className="absolute top-10 left-0 right-0 z-10">
              <LinkedItemTabs
                clips={selectionInfo.clips}
                activeClipId={activeClipId}
                onSelectClip={setActiveClipId}
              />
            </div>
          )}
          
          {/* AudioInspector positioned below tabs if multi-select */}
          <div className={cn(
            "absolute left-0 right-0 bottom-0 overflow-hidden",
            selectionInfo.type === 'multi' ? "top-[76px]" : "top-10"
          )}>
            <AudioInspector
              clip={activeClip}
              overlay={activeOverlay as import("../../types").SoundOverlay}
              onUpdateOverlay={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
            />
          </div>
        </>
      ) : (
        <>
            {/* Multi-select: Show item tabs */}
            {selectionInfo.type === 'multi' && activeClipId !== null && (
            <div className="absolute top-10 left-0 right-0 z-10">
              <LinkedItemTabs
                  clips={selectionInfo.clips}
                  activeClipId={activeClipId}
                  onSelectClip={setActiveClipId}
              />
            </div>
          )}

            {/* Tab Headers - For non-audio clips */}
          <div className={cn(
            "absolute left-0 right-0 z-10 border-b border-border bg-muted/10",
            selectionInfo.type === 'multi' ? "top-[76px]" : "top-10"
          )}>
            <TabsList className="w-full h-9 bg-transparent p-0 rounded-none justify-start">
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
                <span className="text-xs">Properties</span>
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
                <Palette className="h-3.5 w-3.5" />
                <span className="text-xs">Style</span>
              </TabsTrigger>
              <TabsTrigger
                value="effects"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-xs">Effects</span>
              </TabsTrigger>
              <TabsTrigger
                value="color"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="text-xs">Color</span>
              </TabsTrigger>
              <TabsTrigger
                value="animation"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                  "data-[state=active]:shadow-none",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs">Animate</span>
              </TabsTrigger>
            </TabsList>
          </div>

            {/* Tab Content */}
          <div className={cn(
            "absolute left-0 right-0 bottom-0 overflow-hidden",
            selectionInfo.type === 'multi' ? "top-[112px]" : "top-[76px]"
          )}>
            {/* Properties Tab - Transform + Keyframes */}
            {activeTab === 'properties' && (
            <TabsContent value="properties" className="h-full m-0 p-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-left-1 duration-200" forceMount>
              <ScrollArea className="h-full inspector-scrollbar">
                  <div className="p-2 space-y-2">
                    {activeOverlay && activeOverlay.type !== OverlayType.SOUND && (
                      <TransformSection
                        selectedOverlays={[activeOverlay]}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                        onUpdateIndividual={handleChangeOverlay}
                      />
                    )}

                  {activeOverlay && activeOverlay.type === OverlayType.SOUND && (
                    <AudioSection
                      overlay={activeOverlay as import("../../types").SoundOverlay}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                    />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            )}

              {/* Style Tab */}
            {activeTab === 'style' && (
            <TabsContent value="style" className="h-full m-0 p-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-1 duration-200" forceMount>
              <ScrollArea className="h-full inspector-scrollbar">
                <div className="p-2 space-y-4">
                  {activeOverlay && activeOverlay.type !== OverlayType.SOUND && (
                    <AppearanceSection
                      selectedOverlays={[activeOverlay]}
                      onUpdateStyles={(styleUpdates) => {
                        if ('styles' in activeOverlay) {
                            handleChangeOverlay(activeOverlay.id, (prev) => ({
                            ...prev,
                            styles: {
                              ...(prev as any).styles,
                              ...styleUpdates,
                            },
                          }));
                        }
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.SHAPE && (
                    <ShapeSection
                      overlay={activeOverlay as import("../../types").ShapeOverlay}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                      onUpdateStyles={(styleUpdates) => {
                          handleChangeOverlay(activeOverlay.id, (prev) => ({
                          ...prev,
                          styles: { ...(prev as any).styles, ...styleUpdates },
                        }));
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.TEXT && (
                    <TextSection
                      overlay={activeOverlay as import("../../types").TextOverlay}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                      onUpdateStyles={(styleUpdates) => {
                          handleChangeOverlay(activeOverlay.id, (prev) => ({
                          ...prev,
                          styles: { ...(prev as any).styles, ...styleUpdates },
                        }));
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.VIDEO && (
                    <VideoSection
                      overlay={activeOverlay as import("../../types").ClipOverlay}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                      onUpdateStyles={(styleUpdates) => {
                          handleChangeOverlay(activeOverlay.id, (prev) => ({
                          ...prev,
                          styles: { ...(prev as any).styles, ...styleUpdates },
                        }));
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.IMAGE && (
                    <ImageSection
                      overlay={activeOverlay as import("../../types").ImageOverlay}
                        onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                      onUpdateStyles={(styleUpdates) => {
                          handleChangeOverlay(activeOverlay.id, (prev) => ({
                          ...prev,
                          styles: { ...(prev as any).styles, ...styleUpdates },
                        }));
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.MOTION_GRAPHICS && (
                    <MotionGraphicsSection
                      overlay={activeOverlay as MotionGraphicsOverlay}
                      onUpdateProperty={(propertyId, value) => {
                        handleChangeOverlay(activeOverlay.id, (prev) => ({
                          ...prev,
                          propertyValues: {
                            ...(prev as any).propertyValues,
                            [propertyId]: value,
                          },
                        }));
                      }}
                    />
                  )}

                  {activeOverlay && activeOverlay.type === OverlayType.SOUND && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Palette className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No style options for audio clips
                      </p>
                    </div>
                  )}

                  {activeOverlay && 
                   activeOverlay.type !== OverlayType.SHAPE &&
                   activeOverlay.type !== OverlayType.TEXT &&
                   activeOverlay.type !== OverlayType.VIDEO &&
                   activeOverlay.type !== OverlayType.IMAGE &&
                   activeOverlay.type !== OverlayType.SOUND &&
                   activeOverlay.type !== OverlayType.MOTION_GRAPHICS && (
                    <div className="text-xs text-muted-foreground py-2">
                      {getOverlayTypeName(activeOverlay.type)} styles coming soon.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            )}

            {/* Effects Tab */}
            {activeTab === 'effects' && (
            <TabsContent value="effects" className="h-full m-0 p-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-1 duration-200" forceMount>
              <ScrollArea className="h-full inspector-scrollbar">
                <div className="p-2 space-y-3">
                  {activeOverlay && activeOverlay.type !== OverlayType.SOUND ? (
                    <>
                      {/* Effects Section Card */}
                      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
                        {/* Effects Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Effects
                            </span>
                          </div>
                        </div>
                        {/* Effects Content */}
                        <EffectsSection
                          overlay={activeOverlay}
                          onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                        />
                      </div>
                      
                      {/* Masks Section Card - for video and image overlays */}
                      {(activeOverlay.type === OverlayType.VIDEO || activeOverlay.type === OverlayType.IMAGE) && (
                        <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
                          {/* Masks Header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Scan className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Masks
                              </span>
                            </div>
                          </div>
                          {/* Masks Content */}
                          <MasksSection
                            overlay={activeOverlay}
                            onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates }))}
                          />
                        </div>
                      )}
                    </>
                  ) : activeOverlay && activeOverlay.type === OverlayType.SOUND ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Sparkles className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No visual effects available for audio clips
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Sparkles className="h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-xs text-muted-foreground">
                        Select an item to edit effects
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            )}

              {/* Color Tab */}
            {activeTab === 'color' && (
            <TabsContent value="color" className="h-full m-0 p-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-1 duration-200" forceMount>
              {activeOverlay && activeOverlay.type !== OverlayType.SOUND ? (
                <ColorGradingSection
                  overlay={activeOverlay}
                    onUpdate={(updates) => handleChangeOverlay(activeOverlay.id, (prev) => ({ ...prev, ...updates } as any))}
                />
              ) : activeOverlay && activeOverlay.type === OverlayType.SOUND ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <SlidersHorizontal className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Color grading is not available for audio clips
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <SlidersHorizontal className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Select a video or image to edit color grading
                  </p>
                </div>
              )}
            </TabsContent>
            )}

            {/* Animation Tab - Keyframe Animation (Premiere Pro style) */}
            {activeTab === 'animation' && (
            <TabsContent value="animation" className="h-full m-0 p-0 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-right-1 duration-200" forceMount>
              {activeClip && activeClip.type !== 'audio' ? (
                <KeyframesSection
                  clip={activeClip}
                  currentTime={useVideoEditorStore.getState().playback?.currentTime ?? 0}
                />
              ) : activeClip && activeClip.type === 'audio' ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">
                    No Animation for Audio
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Audio clips don't have visual properties to animate
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">
                    Select a Clip to Animate
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-2 max-w-[220px] leading-relaxed">
                    Add keyframes to animate position, scale, rotation, and opacity over time
                  </p>
                </div>
              )}
            </TabsContent>
            )}
          </div>
        </>
      )}
      </Tabs>
    </div>
  );
};

export default InspectorPanel;
