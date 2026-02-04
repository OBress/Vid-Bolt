import { useCallback, useMemo } from 'react';
import { TrackWithClips, TimelineItem } from '../types';

/**
 * Hook for managing item linking/grouping (like Premiere Pro)
 * - Link multiple items to move them together as a group
 * - Visual indicators for linked items
 * - Preserve relative positions when moving
 */
export const useTimelineLinks = (
  tracks: TrackWithClips[],
  onTracksChange?: (tracks: TrackWithClips[]) => void
) => {
  /**
   * Generate a unique link group ID
   */
  const generateLinkGroupId = useCallback(() => {
    return `link-group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  /**
   * Check if items can be linked (must be multiple items selected and NOT already linked together)
   */
  const canLinkItems = useCallback((selectedItemIds: string[]) => {
    if (selectedItemIds.length < 2) return false;
    
    // Check if items are already linked together
    const items = tracks.flatMap(t => t.items).filter(i => selectedItemIds.includes(i.id));
    if (items.length !== selectedItemIds.length) return true; // Some items not found, allow linking
    
    // Get link groups of all selected items
    const linkGroups = items.map(i => i.linkGroup).filter(Boolean);
    
    // If no items have link groups, they can be linked
    if (linkGroups.length === 0) return true;
    
    // If not all items have link groups, they can be linked
    if (linkGroups.length !== items.length) return true;
    
    // If all items share the same link group, they're already linked - can't link again
    const firstGroup = linkGroups[0];
    const allSameGroup = linkGroups.every(group => group === firstGroup);
    
    return !allSameGroup; // Can link only if NOT all in same group
  }, [tracks]);

  /**
   * Check if selected items are already linked together
   */
  const areItemsLinked = useCallback((selectedItemIds: string[]): boolean => {
    if (selectedItemIds.length < 2) return false;

    const items = tracks.flatMap(t => t.items).filter(i => selectedItemIds.includes(i.id));
    if (items.length !== selectedItemIds.length) return false;

    // Check if all items share the same linkGroup
    const linkGroups = items.map(i => i.linkGroup).filter(Boolean);
    if (linkGroups.length === 0) return false;

    const firstGroup = linkGroups[0];
    return linkGroups.every(group => group === firstGroup);
  }, [tracks]);

  /**
   * Get all item IDs in the same link group as the given item
   */
  const getLinkedItemIds = useCallback((itemId: string): string[] => {
    const allItems = tracks.flatMap(t => t.items);
    const item = allItems.find(i => i.id === itemId);
    
    if (!item || !item.linkGroup) {
      return [itemId];
    }

    const linkedItems = allItems.filter(i => i.linkGroup === item.linkGroup);
    return linkedItems.map(i => i.id);
  }, [tracks]);

  /**
   * Link selected items together
   * After linking, all linked items remain selected (Premiere Pro behavior)
   */
  const linkItems = useCallback((selectedItemIds: string[]) => {
    if (!onTracksChange || !canLinkItems(selectedItemIds)) return;

    // Generate a new link group ID
    const linkGroupId = generateLinkGroupId();

    // Update all selected items with the link group
    const newTracks = tracks.map(track => ({
      ...track,
      items: track.items.map(item => {
        if (selectedItemIds.includes(item.id)) {
          return { ...item, linkGroup: linkGroupId };
        }
        return item;
      })
    }));

    onTracksChange(newTracks);
    // Note: selectedItemIds stay the same, so the linked items remain selected
  }, [tracks, onTracksChange, canLinkItems, generateLinkGroupId]);

  /**
   * Unlink selected items (remove from their link groups)
   */
  const unlinkItems = useCallback((selectedItemIds: string[]) => {
    if (!onTracksChange || selectedItemIds.length === 0) return;

    const newTracks = tracks.map(track => ({
      ...track,
      items: track.items.map(item => {
        if (selectedItemIds.includes(item.id)) {
          const { linkGroup, ...rest } = item;
          return rest as TimelineItem;
        }
        return item;
      })
    }));

    onTracksChange(newTracks);
  }, [tracks, onTracksChange]);

  /**
   * Get link groups with their member items
   */
  const linkGroups = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();

    tracks.forEach(track => {
      track.items.forEach(item => {
        if (item.linkGroup) {
          const existing = groups.get(item.linkGroup) || [];
          groups.set(item.linkGroup, [...existing, item]);
        }
      });
    });

    return groups;
  }, [tracks]);

  /**
   * Check if an item is part of a link group
   */
  const isItemLinked = useCallback((itemId: string): boolean => {
    const item = tracks.flatMap(t => t.items).find(i => i.id === itemId);
    return !!item?.linkGroup;
  }, [tracks]);

  /**
   * Get the number of items in an item's link group
   */
  const getLinkGroupSize = useCallback((itemId: string): number => {
    const item = tracks.flatMap(t => t.items).find(i => i.id === itemId);
    if (!item || !item.linkGroup) return 1;

    return tracks
      .flatMap(t => t.items)
      .filter(i => i.linkGroup === item.linkGroup)
      .length;
  }, [tracks]);

  /**
   * Move all linked items together
   * Called when one item in a link group is moved
   */
  const moveLinkedItems = useCallback((
    movedItemId: string,
    deltaStart: number,
    deltaEnd: number,
    deltaTrackIndex: number
  ) => {
    if (!onTracksChange) return;

    const linkedIds = getLinkedItemIds(movedItemId);
    if (linkedIds.length === 1) return; // No other linked items

    const newTracks = tracks.map((track, trackIndex) => ({
      ...track,
      items: track.items.map(item => {
        if (linkedIds.includes(item.id) && item.id !== movedItemId) {
          // Calculate new position
          const newStart = item.start + deltaStart;
          const newEnd = item.end + deltaEnd;
          const newTrackIndex = trackIndex + deltaTrackIndex;

          // Find the target track
          const targetTrack = tracks[newTrackIndex];
          if (!targetTrack) return item;

          return {
            ...item,
            start: newStart,
            end: newEnd,
            trackId: targetTrack.id
          };
        }
        return item;
      })
    }));

    onTracksChange(newTracks);
  }, [tracks, onTracksChange, getLinkedItemIds]);

  return {
    // State queries
    canLinkItems,
    areItemsLinked,
    isItemLinked,
    getLinkGroupSize,
    getLinkedItemIds,
    linkGroups,

    // Actions
    linkItems,
    unlinkItems,
    moveLinkedItems,
  };
};

export default useTimelineLinks;
