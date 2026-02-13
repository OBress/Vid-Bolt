import React, { useRef, useCallback, useState, useMemo } from 'react';
import { TrackWithClips as TimelineTrackType, TrackType } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import { GripVertical, Trash2, Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { TrackGroup } from '../../../types/timeline-v2';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../ui/alert-dialog';
import { buttonVariants } from '../../ui/button';

// ============================================================
// GROUP CONFIGURATION
// ============================================================

/** Ordered list of groups (top → bottom) */
const GROUP_ORDER: TrackGroup[] = ['video', 'overlays', 'text', 'effects', 'audio'];

/** Visual config for each group section header */
const GROUP_CONFIG: Record<TrackGroup, {
  label: string;
  icon: string;
  accentColor: string;
  bgClass: string;
  textClass: string;
  addLabel: string;
  trackType: TrackType;
}> = {
  video: {
    label: 'Video',
    icon: '🎬',
    accentColor: '#0891b2',
    bgClass: 'bg-cyan-900/20',
    textClass: 'text-cyan-400',
    addLabel: 'Add Video Track',
    trackType: 'video',
  },
  overlays: {
    label: 'Overlays',
    icon: '🎭',
    accentColor: '#7c3aed',
    bgClass: 'bg-violet-900/20',
    textClass: 'text-violet-400',
    addLabel: 'Add Overlay Track',
    trackType: 'video',
  },
  text: {
    label: 'Text',
    icon: '✏️',
    accentColor: '#d97706',
    bgClass: 'bg-amber-900/20',
    textClass: 'text-amber-400',
    addLabel: 'Add Text Track',
    trackType: 'video',
  },
  effects: {
    label: 'Effects',
    icon: '✨',
    accentColor: '#9333ea',
    bgClass: 'bg-purple-900/20',
    textClass: 'text-purple-400',
    addLabel: 'Add Effects Track',
    trackType: 'video',
  },
  audio: {
    label: 'Audio',
    icon: '🔊',
    accentColor: '#16a34a',
    bgClass: 'bg-green-900/20',
    textClass: 'text-green-400',
    addLabel: 'Add Audio Track',
    trackType: 'audio',
  },
};

// ============================================================
// COMPONENT
// ============================================================

interface TimelineTrackHandlesProps {
  tracks: TimelineTrackType[];
  onTrackReorder?: (...args: any[]) => void;
  onTrackDelete?: (trackId: string) => void;
  onToggleLock?: (trackId: string) => void;
  onToggleVisibility?: (trackId: string) => void;
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
  onAddTrack?: (type: TrackType, group?: TrackGroup) => void;
  enableTrackDrag?: boolean;
  enableTrackDelete?: boolean;
  scrollY?: number; // Virtual scroll Y offset (pixels)
  collapsedGroups: Set<TrackGroup>; // Which groups are collapsed
  onToggleGroupCollapse: (group: TrackGroup) => void; // Toggle a group
}

export const TimelineTrackHandles: React.FC<TimelineTrackHandlesProps> = ({
  tracks,
  onTrackReorder,
  onTrackDelete,
  onToggleLock,
  onToggleVisibility,
  onToggleMute,
  onToggleSolo,
  onAddTrack,
  enableTrackDrag = true,
  enableTrackDelete = true,
  scrollY = 0,
  collapsedGroups,
  onToggleGroupCollapse,
}) => {
  const dragIndexRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Drag handlers ──

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    dragIndexRef.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!isDragging) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, [isDragging]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((toIndex: number) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    const fromIndex = dragIndexRef.current ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onTrackReorder?.(fromIndex, toIndex);
    }
    dragIndexRef.current = null;
    setIsDragging(false);
    setDragOverIndex(null);
  }, [onTrackReorder, isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  // ── Group collapse — delegated to parent ──

  const toggleGroupCollapse = onToggleGroupCollapse;

  // ── Group tracks by group field ──

  const groupedTracks = useMemo(() => {
    const groups = new Map<TrackGroup, TimelineTrackType[]>();
    
    // Initialize all groups
    for (const g of GROUP_ORDER) {
      groups.set(g, []);
    }
    
    // Assign tracks to groups
    for (const track of tracks) {
      const group = track.group || (track.type === 'audio' ? 'audio' : 'video');
      const list = groups.get(group as TrackGroup);
      if (list) {
        list.push(track);
      } else {
        // Fallback to video group for unknown groups
        groups.get('video')!.push(track);
      }
    }
    
    return groups;
  }, [tracks]);

  // ── Build flat index for drag ──

  const flatTrackIndex = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [tracks]);

  // ── Rendering helpers ──

  const getTrackClasses = (index: number) => {
    const isBeingDragged = isDragging && dragIndexRef.current === index;
    const isDropTarget = dragOverIndex === index && dragIndexRef.current !== index;
    const baseClasses = "track flex items-center px-1 gap-0.5 border-b border-neutral-700";
    
    if (isBeingDragged) {
      return `${baseClasses} bg-muted border-l-[2px] border-l-neutral-500 transform scale-105 z-50 opacity-90`;
    } else if (isDropTarget) {
      return `${baseClasses} bg-[hsl(var(--primary)/0.1)] border-l-[2px] border-l-primary scale-102`;
    } else if (isDragging) {
      return `${baseClasses} bg-background opacity-70`;
    }
    return `${baseClasses} bg-background hover:bg-muted`;
  };

  return (
    <div 
      className="flex flex-col h-full bg-background border-r border-border border-l overflow-hidden"
      style={{ width: `${TIMELINE_CONSTANTS.HANDLE_WIDTH}px` }}
    >
      {/* Header spacer */}
      <div 
        className="flex-shrink-0 bg-background border-b border-neutral-700"
        style={{ height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px` }}
      />
      
      {/* Track handles with virtual scroll */}
      <div className="flex-1 overflow-hidden track-handles-scroll" style={{ overflowAnchor: 'none' }}>
        <div style={{ transform: `translateY(${-scrollY}px)`, overflowAnchor: 'none' }}>

          {GROUP_ORDER.map(groupKey => {
            const config = GROUP_CONFIG[groupKey];
            const groupTracks = groupedTracks.get(groupKey) || [];
            const isCollapsed = collapsedGroups.has(groupKey);
            const trackCount = groupTracks.length;

            // Always show all group categories (even with 0 tracks)

            return (
              <React.Fragment key={groupKey}>
                {/* ── Group Header ── */}
                <div
                  className={`flex items-center gap-1.5 px-2 border-b border-neutral-700 select-none ${config.bgClass}`}
                  style={{
                    height: `${TIMELINE_CONSTANTS.GROUP_HEADER_HEIGHT}px`,
                    borderLeft: `3px solid ${config.accentColor}`,
                  }}
                >
                  {/* Collapse chevron */}
                  <button
                    type="button"
                    className={`w-4 h-4 inline-flex items-center justify-center rounded hover:bg-white/10 ${config.textClass}`}
                    onClick={() => toggleGroupCollapse(groupKey)}
                    title={isCollapsed ? `Expand ${config.label}` : `Collapse ${config.label}`}
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                    }
                  </button>

                  {/* Group icon + label */}
                  <span className="text-[10px] leading-none">{config.icon}</span>
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${config.textClass}`}>
                    {config.label}
                  </span>

                  {/* Track count badge */}
                  {trackCount > 0 && (
                    <span className="text-[9px] text-neutral-500 ml-auto">{trackCount}</span>
                  )}

                  {/* Add track button */}
                  <button
                    type="button"
                    className={`w-4 h-4 inline-flex items-center justify-center rounded hover:bg-white/10 ${config.textClass} ${trackCount > 0 ? '' : 'ml-auto'}`}
                    onClick={() => onAddTrack?.(config.trackType, groupKey)}
                    title={config.addLabel}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* ── Tracks in this group (hidden when collapsed) ── */}
                {!isCollapsed && groupTracks.map(track => {
                  const globalIndex = flatTrackIndex.get(track.id) ?? 0;
                  const isVideoTrack = track.type === 'video';
                  const isAudioTrack = track.type === 'audio';

                  return (
                    <div
                      key={track.id}
                      className={getTrackClasses(globalIndex)}
                      style={{ height: 'var(--timeline-track-height, 3.5rem)' }}
                      onDragOver={handleDragOver(globalIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop(globalIndex)}
                    >
                      {/* Lock toggle */}
                      <button
                        type="button"
                        className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                          track.locked ? 'text-red-400' : 'text-muted-foreground'
                        }`}
                        onClick={() => onToggleLock?.(track.id)}
                        title={track.locked ? 'Unlock track' : 'Lock track'}
                      >
                        {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      </button>

                      {/* Visibility toggle (for video tracks) */}
                      {isVideoTrack && (
                        <button
                          type="button"
                          className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                            track.visible === false ? 'text-muted-foreground/50' : 'text-muted-foreground'
                          }`}
                          onClick={() => onToggleVisibility?.(track.id)}
                          title={track.visible === false ? 'Show track' : 'Hide track'}
                        >
                          {track.visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}

                      {/* Mute toggle (for audio tracks) */}
                      {isAudioTrack && (
                        <button
                          type="button"
                          className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                            track.muted ? 'text-red-400' : 'text-muted-foreground'
                          }`}
                          onClick={() => onToggleMute?.(track.id)}
                          title={track.muted ? 'Unmute track' : 'Mute track'}
                        >
                          {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        </button>
                      )}

                      {/* Track name */}
                      <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                        {track.name}
                      </span>

                      {/* Drag handle */}
                      {enableTrackDrag && (
                        <div
                          className={`flex items-center justify-center w-5 h-5 rounded select-none transition-all duration-150 ${
                            track.locked ? 'opacity-50 cursor-not-allowed' :
                            isDragging && dragIndexRef.current === globalIndex
                              ? 'bg-muted cursor-grabbing' 
                              : 'hover:bg-muted cursor-grab'
                          }`}
                          draggable={!track.locked && enableTrackDrag}
                          onDragStart={track.locked ? undefined : handleDragStart(globalIndex)}
                          onDragEnd={handleDragEnd}
                          title={track.locked ? 'Unlock track to reorder' : 'Reorder track'}
                        >
                          <GripVertical className={`w-3 h-3 ${isDragging && dragIndexRef.current === globalIndex ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                      )}

                      {/* Delete track */}
                      {enableTrackDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--destructive)/0.1)] text-muted-foreground hover:text-destructive"
                              title="Delete track"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Track</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &ldquo;{track.name}&rdquo;? All clips on this track will also be removed. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No</AlertDialogCancel>
                              <AlertDialogAction
                                className={buttonVariants({ variant: 'destructive' })}
                                onClick={() => onTrackDelete?.(track.id)}
                              >
                                Yes, Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Bottom padding spacer */}
          <div 
            className="bg-black" 
            style={{ height: 'calc(var(--timeline-track-height, 3.5rem) / 2)' }}
          />
        </div>
      </div>
    </div>
  );
};