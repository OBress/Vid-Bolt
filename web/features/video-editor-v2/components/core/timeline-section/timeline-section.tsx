import React, { useCallback } from 'react';
import Timeline from '../../advanced-timeline/timeline';
import { TimelineTrack, TimelineRef } from '../../advanced-timeline/types';
import { TIMELINE_CONSTANTS } from '../../advanced-timeline/constants';

import { useEditorContext } from '../../../contexts/editor-context';
import { useEditorSidebar } from '../../../contexts/sidebar-context';

import { useTimelineHandlers } from './hooks/use-timeline-handlers-v2';
import { useTimelineResize } from './hooks/use-timeline-resize';
import { TimelineResizeHandle } from './components';
import { OverlayType } from '../../../types';
import { createEffect, EffectType } from '../../../types/effects';
import { FPS } from '../../../constants';
import { useVideoEditorStore } from '../../../stores/video-editor-store';
import { useCompositionEditorStore } from '../../../stores/composition-editor-store';
import { useShallow } from 'zustand/react/shallow';
import { clipsToOverlaysWithTracks } from '../../../utils/clip-to-render-adapter';
import { createComposition, createTextLayer, createShapeLayer } from '../../../types/composition';
import type { CompositionDefinition, CompositionLayer } from '../../../types/composition';

interface TimelineSectionProps {
  className?: string;
}

// Helper to get default color for clip type
const getDefaultColorForType = (type: string): string => {
  switch (type) {
    case 'video': return '#3b82f6';
    case 'audio': return '#22c55e';
    case 'image': return '#a855f7';
    case 'text': return '#f59e0b';
    case 'caption': return '#ec4899';
    case 'shape': return '#8b5cf6';
    case 'sticker': return '#14b8a6';
    default: return '#6b7280';
  }
};

/**
 * TimelineSection Component
 * 
 * Uses VideoEditorStore directly for all state management.
 * No backward compatibility - pure Timeline V2 architecture.
 */
export const TimelineSection: React.FC<TimelineSectionProps> = () => {
  // Get configuration from context
  const { playerRef, togglePlayPause } = useEditorContext();

  // Get all state from unified store with safe defaults
  const {
    timelineV2Tracks,
    timelineV2Clips,
    fps,
    isPlaying,
    currentFrame,
    selectedClipIds,
    playbackRate,
    aspectRatio,
    resolution,
  } = useVideoEditorStore(
    useShallow(state => ({
      timelineV2Tracks: state.tracks || [],
      timelineV2Clips: state.clips || [],
      fps: state.fps || 30,
      isPlaying: state.playback?.isPlaying || false,
      currentFrame: Math.round((state.playback?.currentTime || 0) * (state.fps || 30)),
      selectedClipIds: state.selection?.clipIds || [],
      playbackRate: state.playback?.playbackRate || 1,
      aspectRatio: state.aspectRatio || '16:9',
      resolution: state.resolution || '1080p',
    }))
  );
  
  // Separate subscription for transitions to ensure updates are detected
  // (useShallow can sometimes miss nested object changes)
  const transitions = useVideoEditorStore(state => state.transitions);
  
  // Calculate durationInFrames from actual clip content
  // For empty timelines, this is 0 - the scrollable area is handled separately by virtual scroll
  const durationInFrames = React.useMemo(() => {
    if (!timelineV2Clips || timelineV2Clips.length === 0) {
      return 0; // No content = 0 duration (scrollable area is separate)
    }
    const maxEndTime = Math.max(...timelineV2Clips.map(c => c.startTime + c.duration));
    return Math.ceil(maxEndTime * fps);
  }, [timelineV2Clips, fps]);

  // Get actions from store (with safe fallbacks)
  const selectClip = useVideoEditorStore(state => state.selectClip) || (() => {});
  const selectClips = useVideoEditorStore(state => state.selectClips) || (() => {});
  const updateClip = useVideoEditorStore(state => state.updateClip) || (() => {});
  const setPlaybackRate = useVideoEditorStore(state => state.setPlaybackRate) || (() => {});
  const setAspectRatio = useVideoEditorStore(state => state.setAspectRatio) || (() => {});
  const setResolution = useVideoEditorStore(state => state.setResolution) || (() => {});
  
  // Get sidebar context
  const { setActivePanel, setIsOpen } = useEditorSidebar();
  
  // Convert Timeline V2 clips to Timeline component format
  const timelineTracks = React.useMemo<TimelineTrack[]>(() => {
    if (!timelineV2Tracks || !timelineV2Clips) return [];
    
    // Helper to find transition entities for a clip using clipIds array
    const getClipTransitions = (clipId: string) => {
      let inTransition: any = undefined;
      let outTransition: any = undefined;
      
      Object.values(transitions).forEach(t => {
        const clipIds = t.clipIds;
        if (t.position === 'between') {
          // Between transition: first clip gets 'out', second clip gets 'in'
          if (clipIds[0] === clipId) outTransition = t;
          else if (clipIds[1] === clipId) inTransition = t;
        } else {
          if (clipIds[0] === clipId) {
            if (t.position === 'in') inTransition = t;
            else if (t.position === 'out') outTransition = t;
          }
        }
      });
      
      return { inTransition, outTransition };
    };
    
    // Sort tracks: video tracks first (by order), then audio tracks (by order)
    const sortedTracks = [...timelineV2Tracks].sort((a, b) => {
      if (a.type === 'video' && b.type === 'audio') return -1;
      if (a.type === 'audio' && b.type === 'video') return 1;
      return a.order - b.order;
    });
    
    return sortedTracks.map(track => {
      const clipsForTrack = timelineV2Clips.filter(c => c.trackId === track.id);
      
      const items = clipsForTrack.map(clip => {
        // Build the data object in the format expected by timeline-item-content
        // This includes src (from sourceId), thumbnails, etc.
        const itemData = {
          // Core properties needed by timeline item components
          src: clip.sourceId,
          originalUrl: clip.sourceId,
          content: clip.thumbnailUrl || clip.sourceId,
          
          // Preserve the original clip data
          ...clip.data,
          
          // Media properties
          startFromSound: clip.media?.mediaStartTime,
          mediaSrcDuration: clip.media?.mediaDuration,
          speed: clip.media?.speed,
          volume: clip.media?.volume,
          
          // Visual properties
          thumbnailUrl: clip.thumbnailUrl,
          width: clip.transform?.width,
          height: clip.transform?.height,
          
          // Effects
          effects: clip.effects,
          
          // Text properties (for text clips)
          text: clip.text?.text,
          fontSize: clip.text?.fontSize,
          fontFamily: clip.text?.fontFamily,
          color: clip.text?.color,
          textAlign: clip.text?.textAlign,
        };
        
        // Generate a stable link group for linked clips
        const linkGroup = clip.linkedClipId 
          ? `link-${[clip.id, clip.linkedClipId].sort().join('-')}`
          : undefined;
        
        // Get transition entities for this clip
        const { inTransition, outTransition } = getClipTransitions(clip.id);
        
        return {
        id: clip.id,
        trackId: track.id,
        start: clip.startTime,
        end: clip.startTime + clip.duration,
          label: clip.label || clip.name || clip.type,
        type: clip.type as any,
        color: clip.color || getDefaultColorForType(clip.type),
          data: itemData,
          linkedItemId: clip.linkedClipId,
          linkGroup,
        mediaStart: clip.media?.mediaStartTime,
        mediaSrcDuration: clip.media?.mediaDuration,
        speed: clip.media?.speed,
        inTransition,
        outTransition,
        };
      }).sort((a, b) => a.start - b.start);
      
      return {
        ...track,
        items,
      };
    });
  }, [timelineV2Tracks, timelineV2Clips, transitions]);

  // Convert clips to overlays for the Timeline component prop (still needed for some features)
  const overlays = React.useMemo(() => {
    return clipsToOverlaysWithTracks(timelineV2Clips, timelineV2Tracks, fps, transitions);
  }, [timelineV2Clips, timelineV2Tracks, fps, transitions]);

  /** State for timeline collapse */
  const [isTimelineCollapsed, setIsTimelineCollapsed] = React.useState(false);

  /** Ref to the Timeline component */
  const timelineRef = React.useRef<TimelineRef>(null);

  /** Ref to track previous clip IDs for detecting new items */
  const prevClipIdsRef = React.useRef<Set<string>>(new Set());

  // Scroll timeline when new items are added
  React.useEffect(() => {
    const currentIds = new Set(timelineV2Clips.map(c => c.id));
    const prevIds = prevClipIdsRef.current;
    
    const newClips = timelineV2Clips.filter(c => !prevIds.has(c.id));
    const removedIds = Array.from(prevIds).filter(id => !currentIds.has(id));
    
    const isLikelySplitOrReplace = removedIds.length > 0;
    
    if (newClips.length > 0 && prevIds.size > 0 && !isLikelySplitOrReplace) {
      const hasAudioItem = newClips.some(c => c.type === 'audio');
      
      if (hasAudioItem) {
        timelineRef.current?.scroll.scrollToBottom();
      } else {
        timelineRef.current?.scroll.scrollToTop();
      }
    }
    
    prevClipIdsRef.current = currentIds;
  }, [timelineV2Clips]);

  // Get Timeline V2 handlers
  const {
    handleTracksChange,
    handleTimelineFrameChange,
    handleItemSelect,
    handleSelectedItemsChange,
    handleDeleteItems,
    handleDuplicateItems,
    handleSplitItems,
    handleItemMove,
    handleItemResize,
    handleNewItemDrop,
  } = useTimelineHandlers({
    playerRef,
    setActivePanel,
    setIsOpen,
  });

  // Playback control handlers
  const handlePlay = React.useCallback(() => {
    if (!isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const handlePause = React.useCallback(() => {
    if (isPlaying) {
      togglePlayPause();
    }
  }, [isPlaying, togglePlayPause]);

  const handleSeekToStart = React.useCallback(() => {
    if (playerRef?.current) {
      playerRef.current.seekTo(0);
    }
  }, [playerRef]);

  const handleSeekToEnd = React.useCallback(() => {
    if (playerRef?.current) {
      const endFrame = Math.max(0, durationInFrames - 1);
      playerRef.current.seekTo(endFrame);
    }
  }, [playerRef, durationInFrames]);

  // Timeline resize
  const { 
    bottomHeight, 
    isResizing, 
    handleMouseDown, 
    handleTouchStart,
    isCompact,
    toggleCompactMode,
    currentTrackHeight,
    compactTrackItemHeight,
  } = useTimelineResize({
    trackCount: timelineTracks.length,
  });

  // Collapse handler
  const handleCollapseChange = React.useCallback((collapsed: boolean) => {
    setIsTimelineCollapsed(collapsed);
  }, []);

  // Effect drop handler
  const handleEffectDrop = React.useCallback((itemId: string, effectType: string, effectValue: string) => {
    const clip = timelineV2Clips.find(c => c.id === itemId);
    if (!clip) return;
    
    if (effectType === 'videoEffect' && effectValue) {
      const validEffectTypes = Object.values(EffectType);
      if (!validEffectTypes.includes(effectValue as EffectType)) return;
      
      const existingEffects = clip.effects || [];
      const newEffect = createEffect(effectValue as EffectType, existingEffects.length);
      
      if ('amount' in newEffect) {
        (newEffect as any).amount = 100;
      }
      if ('value' in newEffect && (newEffect as any).value === 0) {
        (newEffect as any).value = 50;
      }
      
      updateClip(itemId, {
        effects: [...existingEffects, newEffect],
      });
      
      selectClip(itemId);
      setActivePanel('inspector');
      setIsOpen(true);
    }
  }, [timelineV2Clips, updateClip, selectClip, setActivePanel, setIsOpen]);

  // Item selection handlers (convert string IDs to what Timeline expects)
  const handleItemSelectWrapper = React.useCallback((itemId: string | null) => {
    handleItemSelect(itemId);
  }, [handleItemSelect]);

  const handleSelectedItemsChangeWrapper = React.useCallback((itemIds: string[]) => {
    handleSelectedItemsChange(itemIds);
  }, [handleSelectedItemsChange]);

  // Composition editor
  const openCompositionEditor = useCompositionEditorStore((state) => state.openCompositionEditor);

  // Handler for opening the composition editor when double-clicking motion graphics
  // CompositionDefinition is the single source of truth - AI generates it directly
  const handleOpenCompositionEditor = useCallback((itemId: string) => {
    const clip = timelineV2Clips.find(c => c.id === itemId);
    if (!clip || clip.type !== 'motion-graphics') return;

    const template = clip.properties?.template;
    
    // Check if we have an existing composition definition
    // Priority order:
    // 1. clip.properties.compositionDefinition (edited in composition editor and saved back)
    // 2. clip.properties.template.compositionDefinition (AI-generated with the template)
    const existingComposition = (
      clip.properties?.compositionDefinition || 
      template?.compositionDefinition
    ) as CompositionDefinition | undefined;
    
    // Accept composition if it has layers OR JSX code (JSX-first compositions have empty layers)
    if (existingComposition && (existingComposition.layers?.length > 0 || existingComposition.originalRemotionCode)) {
      // Use existing composition - this is the single source of truth
      console.log('[TimelineSection] Opening existing composition:', {
        name: existingComposition.name,
        layerCount: existingComposition.layers?.length || 0,
        hasJSXCode: !!existingComposition.originalRemotionCode,
        jsxCodeLength: existingComposition.originalRemotionCode?.length || 0,
        layers: existingComposition.layers?.map(l => ({ id: l.id, name: l.name, type: l.type })) || [],
        source: clip.properties?.compositionDefinition ? 'clip.properties' : 'template',
      });
      openCompositionEditor(itemId, existingComposition);
      return;
    }
    
    // Fallback: Create a basic composition with one text layer
    // This only happens for legacy templates that don't have compositionDefinition
    console.log('[TimelineSection] No compositionDefinition found, creating default composition');
    const compositionName = template?.name || clip.label || 'Motion Graphic';
    const durationInFrames = Math.round(clip.duration * (fps || FPS));
    
    const composition = createComposition(compositionName, {
      duration: durationInFrames,
      fps: fps || FPS,
      width: 1920,
      height: 1080,
      backgroundColor: 'transparent',
      layers: [
        createTextLayer('Title Text', {
          startTime: 0,
          duration: durationInFrames,
          transform: {
            x: 960,
            y: 540,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
          },
          layerProperties: {
            type: 'text',
            properties: {
              text: template?.name || 'Title',
              fontFamily: 'Inter',
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: 0,
              color: '#FFFFFF',
              textAlign: 'center',
              verticalAlign: 'middle',
            },
          },
        }),
      ],
    });
    
    openCompositionEditor(itemId, composition);
    console.log('[TimelineSection] Opening composition editor for clip:', itemId);
  }, [timelineV2Clips, fps, openCompositionEditor]);

  // Calculate effective height based on collapse state
  const COLLAPSED_HEIGHT = TIMELINE_CONSTANTS.HEADER_HEIGHT;
  const effectiveHeight = isTimelineCollapsed ? COLLAPSED_HEIGHT : bottomHeight;

  return (
    <>
      <TimelineResizeHandle 
        onMouseDown={handleMouseDown} 
        onTouchStart={handleTouchStart}
        isResizing={isResizing} 
      />

      <div 
        style={{ height: `${effectiveHeight}px` }}
        className="flex flex-col overflow-hidden"
      >
        <Timeline
          ref={timelineRef}
          tracks={timelineTracks}
          totalDuration={durationInFrames / (fps || FPS)}
          currentFrame={currentFrame}
          fps={fps || FPS}
          onFrameChange={handleTimelineFrameChange}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onItemSelect={handleItemSelectWrapper}
          onSelectedItemsChange={handleSelectedItemsChangeWrapper}
          onDeleteItems={handleDeleteItems}
          onDuplicateItems={handleDuplicateItems}
          onSplitItems={handleSplitItems}
          selectedItemIds={selectedClipIds}
          onTracksChange={handleTracksChange}
          onNewItemDrop={handleNewItemDrop}
          showZoomControls={true}
          showTimelineGuidelines={true}
          enableTrackDrag={true}
          enableMagneticTrack={true}
          enableTrackDelete={true}
          showPlaybackControls={true}
          isPlaying={isPlaying}
          hideItemsOnDrag={true}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeekToStart={handleSeekToStart}
          onSeekToEnd={handleSeekToEnd}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          showUndoRedoControls={true}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio as any}
          resolution={resolution}
          onResolutionChange={setResolution as any}
          showAspectRatioControls={true}
          onCollapseChange={handleCollapseChange}
          overlays={overlays}
          isCompact={isCompact}
          onToggleCompact={toggleCompactMode}
          trackHeight={currentTrackHeight}
          trackItemHeight={compactTrackItemHeight}
          onEffectDrop={handleEffectDrop}
          onOpenCompositionEditor={handleOpenCompositionEditor}
        />
      </div>
    </>
  );
}; 
