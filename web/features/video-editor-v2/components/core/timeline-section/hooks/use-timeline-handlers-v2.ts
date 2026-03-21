/**
 * Timeline V2 Handlers
 * 
 * Professional implementation using direct store actions
 * No transforms, no circular updates, just clean operations
 */

import React from 'react';
import { OverlayType } from '../../../../types';
import { TimelineTrack } from '../../../advanced-timeline/types';
import { FPS } from '../../../../constants';
import { useVideoEditorStore, getTypedState, useTypedStore } from '../../../../stores/video-editor-store';
import { useMediaAdaptors } from '../../../../contexts/media-adaptor-context';
import { calculateIntelligentAssetSize, getAssetDimensions } from '../../../../utils/asset-sizing';
import type { TimelineClip, ClipTransform } from '../../../../types/timeline-v2';
import {
  ensureNormalizedTimelineAudio,
  getMediaSourceUrl,
  getNormalizationBlockReason,
  getNormalizedAudioUrl,
} from '../../../../utils/audio-normalization';

interface UseTimelineHandlersProps {
  playerRef: React.RefObject<any>;
  setActivePanel: (panel: OverlayType) => void;
  setIsOpen: (open: boolean) => void;
}

/**
 * Timeline V2 Handlers - Direct store actions, no transforms
 */
export const useTimelineHandlers = ({
  playerRef,
  setActivePanel,
  setIsOpen,
}: UseTimelineHandlersProps) => {
  const { videoAdaptors, imageAdaptors } = useMediaAdaptors();
  
  // Get actions from store
  const deleteClip = useTypedStore(s => s.deleteClip);
  const deleteClips = useTypedStore(s => s.deleteClips);
  const duplicateClip = useTypedStore(s => s.duplicateClip);
  const splitClip = useTypedStore(s => s.splitClip);
  const moveClip = useTypedStore(s => s.moveClip);
  const updateClip = useTypedStore(s => s.updateClip);
  const addClip = useTypedStore(s => s.addClip);
  const getLinkedClipIds = useTypedStore(s => s.getLinkedClipIds);
  const selectClips = useTypedStore(s => s.selectClips);
  
  // Helper to get aspect ratio dimensions
  const getAspectRatioDimensions = React.useCallback(() => {
    const state = getTypedState();
    const aspectRatio = state.aspectRatio || '16:9';
    const resolution = state.resolution || '1080p';
    
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
    
    const height = resolutionHeights[resolution] || 1080;
    const ratio = aspectRatios[aspectRatio] || 16/9;
    const width = Math.round(height * ratio);
    
    return { width, height };
  }, []);
  
  // Handler for tracks change (no-op in V2 - store manages tracks directly)
  const handleTracksChange = React.useCallback((newTracks: TimelineTrack[]) => {
    // No-op: In V2 architecture, tracks are managed directly through the store
  }, []);

  // Handler for frame changes from timeline
  const handleTimelineFrameChange = React.useCallback((frame: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(frame);
    }
    // Update the store's currentTime so text/shapes are added at the correct position
    const fps = getTypedState().fps || 30;
    const timeInSeconds = frame / fps;
    getTypedState().setCurrentTime(timeInSeconds);
  }, [playerRef]);

  // Handler for item selection
  const handleItemSelect = React.useCallback((itemId: string | null) => {
    if (itemId) {
      selectClips([itemId]);
      setIsOpen(true);
    } else {
      selectClips([]);
    }
  }, [selectClips, setIsOpen]);

  // Handler for multiselect changes
  const handleSelectedItemsChange = React.useCallback((itemIds: string[]) => {
    selectClips(itemIds);
    if (itemIds.length > 0) {
      setIsOpen(true);
    }
  }, [selectClips, setIsOpen]);

  // Handler for item deletion - also deletes linked items (Premiere Pro behavior)
  const handleDeleteItems = React.useCallback((itemIds: string[]) => {
    // Collect all items to delete, including linked items
    const allIdsToDelete = new Set<string>();
    
    for (const itemId of itemIds) {
      allIdsToDelete.add(itemId);
      // Get linked items and add them to the deletion set
      const linkedIds = getLinkedClipIds(itemId);
      linkedIds.forEach(linkedId => allIdsToDelete.add(linkedId));
    }
    
    deleteClips(Array.from(allIdsToDelete));
  }, [deleteClips, getLinkedClipIds]);

  // Handler for item duplication - also duplicates linked items together (Premiere Pro behavior)
  const handleDuplicateItems = React.useCallback((itemIds: string[]) => {
    // Collect all unique items to duplicate, including linked items
    const allIdsToDuplicate = new Set<string>();
    
    for (const itemId of itemIds) {
      allIdsToDuplicate.add(itemId);
      const linkedIds = getLinkedClipIds(itemId);
      linkedIds.forEach(linkedId => allIdsToDuplicate.add(linkedId));
    }
    
    // Duplicate each item and track the mapping of old ID -> new ID
    const idMapping = new Map<string, string>();
    
    allIdsToDuplicate.forEach(itemId => {
      const newId = duplicateClip(itemId);
      if (newId) {
        idMapping.set(itemId, newId);
      }
    });
    
    // Re-link the duplicated items to each other
    idMapping.forEach((newId, oldId) => {
      const originalClip = getTypedState().clips[oldId];
      if (originalClip?.linkedClipId && idMapping.has(originalClip.linkedClipId)) {
        const newLinkedId = idMapping.get(originalClip.linkedClipId);
        updateClip(newId, { linkedClipId: newLinkedId });
      }
    });
  }, [duplicateClip, getLinkedClipIds, updateClip]);

  // Handler for item splitting
  const handleSplitItems = React.useCallback((itemId: string, splitTime: number) => {
    splitClip(itemId, splitTime);
  }, [splitClip]);

  // Handler for item move
  const handleItemMove = React.useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    moveClip(itemId, newTrackId, newStart);
    
    // Handle linked clips (move horizontally together)
    const linkedIds = getLinkedClipIds(itemId);
    linkedIds.forEach(linkedId => {
      if (linkedId !== itemId) {
        const linkedClip = getTypedState().clips[linkedId];
        if (linkedClip) {
          moveClip(linkedId, linkedClip.trackId, newStart);
        }
      }
    });
  }, [moveClip, getLinkedClipIds]);

  // Handler for item resize
  const handleItemResize = React.useCallback((itemId: string, newStart: number, newEnd: number) => {
    const newDuration = newEnd - newStart;
    updateClip(itemId, {
      startTime: newStart,
      duration: newDuration,
    });
    
    // Handle linked clips
    const linkedIds = getLinkedClipIds(itemId);
    linkedIds.forEach(linkedId => {
      if (linkedId !== itemId) {
        updateClip(linkedId, {
          startTime: newStart,
          duration: newDuration,
        });
      }
    });
  }, [updateClip, getLinkedClipIds]);

  // Handler for new item drop from media panel
  const handleNewItemDrop = React.useCallback(
    async (
      itemType: string,
      trackIndex: number,
      startTime: number,
      itemData?: {
        duration?: number;
        label?: string;
        data?: any;
      }
    ) => {
      const tracksRecord = getTypedState().tracks || {};
      const tracksArr = Object.values(tracksRecord);
      
      // Sort tracks the same way they're displayed: video tracks first, then audio
      const sortedTracks = [...tracksArr].sort((a, b) => {
        if (a.type === 'video' && b.type === 'audio') return -1;
        if (a.type === 'audio' && b.type === 'video') return 1;
        return a.order - b.order;
      });
      
      const targetTrack = sortedTracks[trackIndex];
      
      if (!targetTrack) {
        return;
      }
      
      const canvasDimensions = getAspectRatioDimensions();
      const duration = itemData?.duration || 5;
      const projectId = getTypedState().projectId || undefined;
      
      if (itemType === 'video' && itemData?.data) {
        const video = itemData.data;
        const videoBlockReason = getNormalizationBlockReason({
          ...video,
          type: 'video',
        });

        if (videoBlockReason) {
          window.alert(videoBlockReason);
          return;
        }
        
        let videoUrl: string = '';
        
        // First, try local media source
        if (video._isLocalMedia && video.src) {
          videoUrl = video.src;
        } 
        // Second, try adaptor lookup
        else if (video._source) {
          const adaptor = videoAdaptors.find((a) => a.name === video._source);
          if (adaptor) {
            videoUrl = adaptor.getVideoUrl(video, "hd") || "";
          }
        }
        
        // Fallback: try common URL properties if adaptor lookup failed
        if (!videoUrl) {
          videoUrl = getMediaSourceUrl(video) || video.videoUrl || video.hd?.url || '';
        }

        const normalizedVideoAudioUrl = getNormalizedAudioUrl({
          ...video,
          type: 'video',
        });
        
        // Fill the entire canvas - standard NLE behavior
        const transform: ClipTransform = {
          x: 0,
          y: 0,
          width: canvasDimensions.width,
          height: canvasDimensions.height,
          rotation: 0,
          opacity: 1,
          zIndex: 100,
        };
        
        const videoClipId = addClip({
          trackId: targetTrack.id,
          startTime,
          duration,
          type: 'video',
          sourceId: videoUrl,
          label: video.name || video.filename || 'Video',
          transform,
          media: {
            mediaStartTime: 0,
            mediaDuration: duration,
            speed: 1,
            volume: 0,
          },
          thumbnailUrl: video.thumbnail || video.thumbnailUrl,
          styles: {
            objectFit: 'cover',
          },
          data: {
            src: videoUrl,
            originalUrl: videoUrl,
            content: video.thumbnail || video.thumbnailUrl,
            thumbnailUrl: video.thumbnail || video.thumbnailUrl,
            width: video.width,
            height: video.height,
            audioSourceMode: 'separate_normalized',
            audioNormalizationStatus: video.audioNormalizationStatus ?? 'completed',
            normalizedAudioUrl: normalizedVideoAudioUrl,
            hasEmbeddedAudio: video.hasEmbeddedAudio ?? false,
          },
        });
        
        // Middle-out track pairing:
        // V1 (bottom video, closest to middle) pairs with A1 (top audio, closest to middle)
        // V2 pairs with A2, V3 pairs with A3, etc.
        // 
        // Visual layout (video tracks now rendered with V1 at bottom):
        //   V3  ← top video (furthest from middle) - index 0 in videoTracks
        //   V2                                      - index 1 in videoTracks
        //   V1  ← bottom video (closest to middle) - index 2 in videoTracks (last)
        //   ──── MIDDLE DIVIDER ────
        //   A1  ← top audio (closest to middle)    - index 0 in audioTracks
        //   A2                                      - index 1 in audioTracks
        //   A3  ← bottom audio (furthest from middle)
        
        // Get video and audio tracks separately
        const videoTracks = sortedTracks.filter(t => t.type === 'video');
        const audioTracks = sortedTracks.filter(t => t.type === 'audio');
        
        // Find the video track's index (video tracks are sorted V3, V2, V1 with V1 at the end)
        const videoTrackIndex = videoTracks.findIndex(t => t.id === targetTrack.id);
        
        // Calculate position from middle (V1 at end = closest to middle = position 0)
        // Video: V3(idx 0) -> pos 2, V2(idx 1) -> pos 1, V1(idx 2) -> pos 0
        const videoPositionFromMiddle = videoTracks.length - 1 - videoTrackIndex;
        
        // The corresponding audio track has the SAME position from middle
        // Audio: A1(idx 0) = pos 0, A2(idx 1) = pos 1, A3(idx 2) = pos 2
        // So correspondingAudioIndex = videoPositionFromMiddle
        const correspondingAudioIndex = videoPositionFromMiddle;
        
        // Check if we need to create new audio tracks to match
        let audioTrack = audioTracks[correspondingAudioIndex];
        
        if (!audioTrack) {
          // Need to create audio tracks up to the corresponding position
          const tracksToCreate = correspondingAudioIndex - audioTracks.length + 1;
          
          const store = getTypedState();
          
          for (let i = 0; i < tracksToCreate; i++) {
            store.addTrack('audio');
          }
          
          // Re-fetch tracks after creation
          const updatedTracks = Object.values(getTypedState().tracks);
          const updatedAudioTracks = updatedTracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);
          audioTrack = updatedAudioTracks[correspondingAudioIndex];
        } else if (audioTrack.locked) {
          // If the corresponding track is locked, find the first unlocked one
          audioTrack = audioTracks.find(t => !t.locked) || audioTracks[0];
        }
        
        if (audioTrack && normalizedVideoAudioUrl) {
          const audioClipId = addClip({
            trackId: audioTrack.id,
            startTime,
            duration,
            type: 'audio',
            sourceId: normalizedVideoAudioUrl,
            label: 'Audio',
            transform: {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              rotation: 0,
            },
            media: {
              mediaStartTime: 0,
              mediaDuration: duration,
              speed: 1,
              volume: 1,
            },
            linkedClipId: videoClipId,
            data: {
              src: normalizedVideoAudioUrl,
              originalUrl: normalizedVideoAudioUrl,
              normalizedAudioUrl: normalizedVideoAudioUrl,
              audioNormalizationStatus: 'completed',
              requiresNormalizedAudio: true,
            },
          });
          
          // Link video to audio (bidirectional)
          updateClip(videoClipId, { linkedClipId: audioClipId });
          
          // Select both clips as a linked group
          selectClips([videoClipId, audioClipId]);
        } else {
          // If no audio track, just select the video clip
          selectClips([videoClipId]);
        }
      } else if (itemType === 'image' && itemData?.data) {
        const image = itemData.data;
        
        let imageUrl: string = '';
        
        // First, try local media source
        if (image._isLocalMedia && image.src) {
          imageUrl = image.src;
        }
        // Second, try adaptor lookup
        else if (image._source) {
          const adaptor = imageAdaptors.find((a) => a.name === image._source);
          if (adaptor) {
            imageUrl = adaptor.getImageUrl(image, "large") || "";
          }
        }
        
        // Fallback: try common URL properties if adaptor lookup failed
        if (!imageUrl) {
          imageUrl = image.src || image.url || image.imageUrl || image.file || image.hd?.url || image.thumbnail || '';
        }
        
        // Fill the entire canvas - standard NLE behavior
        const imageClipId = addClip({
          trackId: targetTrack.id,
          startTime,
          duration,
          type: 'image',
          sourceId: imageUrl,
          label: image.name || image.filename || 'Image',
          transform: {
            x: 0,
            y: 0,
            width: canvasDimensions.width,
            height: canvasDimensions.height,
            rotation: 0,
            opacity: 1,
            zIndex: 100,
          },
          thumbnailUrl: image.thumbnail || image.thumbnailUrl || imageUrl,
          styles: {
            objectFit: 'cover',
          },
          data: {
            src: imageUrl,
            originalUrl: imageUrl,
            content: image.thumbnail || image.thumbnailUrl || imageUrl,
            width: image.width,
            height: image.height,
          },
        });
        
        // Select the newly added image clip
        selectClips([imageClipId]);
      } else if (itemType === 'audio' && itemData?.data) {
        const audio = itemData.data;
        let normalizedAudio;
        try {
          normalizedAudio = await ensureNormalizedTimelineAudio(
            {
              ...audio,
              type: 'audio',
            },
            projectId,
          );
        } catch (error) {
          window.alert(
            error instanceof Error ? error.message : 'Failed to normalize audio',
          );
          return;
        }
        const audioUrl = normalizedAudio.url;
        
        const audioClipId = addClip({
          trackId: targetTrack.id,
          startTime,
          duration,
          type: 'audio',
          sourceId: audioUrl,
          label: audio.name || audio.filename || 'Audio',
          transform: {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
          },
          media: {
            mediaStartTime: 0,
            mediaDuration: duration,
            speed: 1,
            volume: 1,
          },
          data: {
            src: audioUrl,
            originalUrl: getMediaSourceUrl(audio) || audioUrl,
            normalizedAudioUrl: normalizedAudio.normalizedAudioUrl,
            audioNormalizationStatus: normalizedAudio.audioNormalizationStatus,
            requiresNormalizedAudio: true,
          },
        });
        
        // Select the newly added audio clip
        selectClips([audioClipId]);
      } else if (itemType === 'motion-graphics' && itemData?.data) {
        // Motion graphics drop from AI generation
        const mgData = itemData.data;
        const template = mgData.template;

        // Use propertyValues from drag data, or derive from template
        const propertyValues = mgData.propertyValues || 
          (template?.editableProperties || []).reduce((acc: Record<string, any>, prop: any) => {
            acc[prop.id] = prop.value;
            return acc;
          }, {} as Record<string, any>);

        const mgClipId = addClip({
          type: 'motion-graphics',
          sourceId: template?.id || mgData.id || `mg-${Date.now()}`,
          startTime,
          duration,
          trackId: targetTrack.id,
          name: template?.name || mgData.name || 'Motion Graphic',
          color: '#A855F7', // Purple for motion graphics
          properties: {
            template,
            propertyValues,
            mapboxConfig: template?.mapboxConfig,
          },
          // Match the same transform shape as handleAddToTimeline
          transform: {
            x: 0,
            y: 0,
            width: canvasDimensions.width,
            height: canvasDimensions.height,
            scale: 1,
            rotation: 0,
          },
        });

        selectClips([mgClipId]);
        console.log('[TimelineHandlers] Added motion graphics clip:', mgClipId, template?.name);
      } else if (itemType === 'text' && itemData?.data) {
        // Text preset drop from assets sidebar
        const textData = itemData.data;
        const presetStyles = textData.presetStyles || {};
        const content = textData.content || 'Text';
        const fontSize = presetStyles.fontSize 
          ? parseInt(String(presetStyles.fontSize).replace('px', ''))
          : 48;

        // Calculate intelligent text dimensions
        const avgCharWidth = fontSize * 0.6;
        const textWidth = content.length * avgCharWidth;
        const lineHeight = fontSize * 1.4;
        const maxWidth = Math.min(canvasDimensions.width * 0.8, textWidth + 40);
        const estimatedLines = Math.ceil(textWidth / (maxWidth - 40)) || 1;
        const totalHeight = (estimatedLines * lineHeight) + 40;
        const finalWidth = Math.max(300, Math.min(maxWidth, canvasDimensions.width * 0.9));
        const finalHeight = Math.max(80, Math.min(totalHeight, canvasDimensions.height * 0.5));

        const textClipId = addClip({
          trackId: targetTrack.id,
          startTime,
          duration,
          type: 'text' as const,
          sourceId: '',
          label: textData.name || 'Text',
          content,
          transform: {
            x: Math.round(canvasDimensions.width / 2 - finalWidth / 2),
            y: Math.round(canvasDimensions.height / 2 - finalHeight / 2),
            width: Math.round(finalWidth),
            height: Math.round(finalHeight),
            rotation: 0,
            opacity: 1,
            zIndex: 100,
          },
          text: {
            text: content,
            fontSize,
            fontFamily: presetStyles.fontFamily || 'Inter',
            color: presetStyles.color || '#ffffff',
            backgroundColor: presetStyles.backgroundColor || 'transparent',
            textAlign: (presetStyles.textAlign || 'center') as 'left' | 'center' | 'right',
          },
          styles: {
            ...presetStyles,
            fontSize: `${fontSize}px`,
            fontFamily: presetStyles.fontFamily || 'Inter',
          },
        });

        selectClips([textClipId]);
        console.log('[TimelineHandlers] Added text clip from drag:', textClipId, textData.name);
      } else if (itemType === 'shape' && itemData?.data) {
        // Shape preset drop from assets sidebar
        const shapeData = itemData.data;
        const shapeStyles = shapeData.shapeStyles || {};
        const shapeType = shapeData.shapeType || 'rectangle';
        const shapeSize = Math.min(canvasDimensions.width, canvasDimensions.height) * 0.3;

        const shapeClipId = addClip({
          trackId: targetTrack.id,
          startTime,
          duration,
          type: 'shape' as const,
          sourceId: '',
          label: shapeData.name || 'Shape',
          content: shapeType,
          transform: {
            x: Math.round(canvasDimensions.width / 2 - shapeSize / 2),
            y: Math.round(canvasDimensions.height / 2 - shapeSize / 2),
            width: Math.round(shapeType === 'line' ? shapeSize * 2 : shapeSize),
            height: Math.round(shapeType === 'line' ? 4 : shapeSize),
            rotation: 0,
            opacity: shapeStyles.opacity !== undefined ? shapeStyles.opacity : 1,
            zIndex: 100,
          },
          styles: {
            ...shapeStyles,
          },
        });

        selectClips([shapeClipId]);
        console.log('[TimelineHandlers] Added shape clip from drag:', shapeClipId, shapeType);
      }
    },
    [addClip, updateClip, getAspectRatioDimensions, videoAdaptors, imageAdaptors]
  );

  return {
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
  };
};
