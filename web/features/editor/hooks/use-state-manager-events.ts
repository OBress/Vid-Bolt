import { useEffect, useCallback, useRef } from "react";
import StateManager from "@designcombo/state";
import useStore from "../store/use-store";
import { IAudio, ITrackItem, IVideo } from "@designcombo/types";
import { audioDataManager } from "../player/lib/audio-data";

// Global registry to prevent duplicate subscriptions
const subscriptionRegistry = new WeakMap<StateManager, Set<string>>();

export const useStateManagerEvents = (stateManager: StateManager) => {
  const { setState } = useStore();
  const isSubscribedRef = useRef(false);

  // Handle track item updates
  const handleTrackItemUpdate = useCallback(() => {
    // NOTE: We removed the isRegenerating block because the timeline canvas
    // needs state manager updates to render. Instead, we rely on the corruption
    // guard below to skip only bad updates.
    
    const currentState = stateManager.getState();
    const mergedTrackItemsDeatilsMap = currentState.trackItemsMap;
    
    // DEBUG: Log what the state manager is returning
    console.log("[StateManager Debug] handleTrackItemUpdate called:", {
      duration: currentState.duration,
      trackItemsCount: Object.keys(mergedTrackItemsDeatilsMap).length,
      tracksCount: currentState.tracks?.length,
      trackItemIds: currentState.trackItemIds?.slice(0, 5),
    });
    
    // GUARD: Skip setState if state manager data is corrupted
    // This happens when EDIT_OBJECT or other events corrupt the internal state
    const itemCount = Object.keys(mergedTrackItemsDeatilsMap).length;
    const tracksCount = currentState.tracks?.length || 0;
    
    // Check for corruption indicators:
    // 1. NaN duration
    // 2. More tracks than items (should be 1 track with many items, not many tracks with 1 item each)
    // 3. Items with bad display properties
    const isCorrupted = 
      !Number.isFinite(currentState.duration) ||
      (tracksCount > 1 && tracksCount >= itemCount * 0.5);
    
    if (isCorrupted) {
      console.warn("[StateManager Debug] SKIPPING corrupted state update:", {
        duration: currentState.duration,
        tracksCount,
        itemCount,
        reason: !Number.isFinite(currentState.duration) ? "NaN duration" : "Too many tracks"
      });
      return; // Skip the setState to preserve current valid state
    }
    
    // Check for items with missing/bad display properties
    const allItems = Object.values(mergedTrackItemsDeatilsMap);
    const badItems = allItems.filter(item => 
      !item.display || 
      typeof item.display.from !== 'number' || 
      typeof item.display.to !== 'number'
    );
    if (badItems.length > 0) {
      console.warn("[StateManager Debug] SKIPPING - items have bad display properties:", badItems.length);
      return; // Skip the setState to preserve current valid state
    }
    
    const filterTrakcItems = Object.values(mergedTrackItemsDeatilsMap).filter(
      (item) => {
        return item.type === "video" || item.type === "audio";
      }
    );
    audioDataManager.setItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    audioDataManager.validateUpdateItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    
    // DEBUG: Log the actual data to understand corruption
    console.log("[StateManager Debug] Setting Zustand state with:", {
      duration: currentState.duration,
      trackItemsCount: Object.keys(currentState.trackItemsMap).length,
      tracks: currentState.tracks?.map(t => ({
        id: t.id,
        type: t.type,
        itemsCount: t.items?.length || 0,
      })),
      sampleItem: Object.values(currentState.trackItemsMap)[0],
    });
    
    setState({
      duration: currentState.duration,
      trackItemsMap: currentState.trackItemsMap
    });
  }, [stateManager, setState]);

  const handleAddRemoveItems = useCallback(() => {
    const currentState = stateManager.getState();
    const mergedTrackItemsDeatilsMap = currentState.trackItemsMap;

    // DEBUG: Log what we're receiving from state manager after ADD_ITEMS
    console.log("[StateManager Debug] handleAddRemoveItems called:", {
      tracksCount: currentState.tracks?.length,
      trackItemIdsCount: currentState.trackItemIds?.length,
      trackItemsMapCount: Object.keys(mergedTrackItemsDeatilsMap).length,
      tracks: currentState.tracks?.map(t => ({
        id: t.id,
        type: t.type,
        itemsCount: t.items?.length || 0,
      })),
    });

    const filterTrakcItems = Object.values(mergedTrackItemsDeatilsMap).filter(
      (item) => {
        return item.type === "video" || item.type === "audio";
      }
    );
    audioDataManager.validateUpdateItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    setState({
      trackItemsMap: currentState.trackItemsMap,
      trackItemIds: currentState.trackItemIds,
      tracks: currentState.tracks
    });
  }, [stateManager, setState]);

  const handleUpdateItemDetails = useCallback(() => {
    const currentState = stateManager.getState();
    setState({
      trackItemsMap: currentState.trackItemsMap
    });
  }, [stateManager, setState]);

  useEffect(() => {
    console.log("useStateManagerEvents", stateManager);
    // Check if we already have subscriptions for this stateManager
    if (!subscriptionRegistry.has(stateManager)) {
      subscriptionRegistry.set(stateManager, new Set());
    }

    const registry = subscriptionRegistry.get(stateManager);
    if (!registry) return;
    const hookId = "useStateManagerEvents";

    // Prevent duplicate subscriptions
    if (registry.has(hookId)) {
      return;
    }

    registry.add(hookId);
    isSubscribedRef.current = true;

    // Subscribe to state update details
    const resizeDesignSubscription = stateManager.subscribeToUpdateStateDetails(
      (newState) => {
        setState(newState);
      }
    );

    // Subscribe to scale changes
    const scaleSubscription = stateManager.subscribeToScale((newState) => {
      setState(newState);
    });

    // Subscribe to general state changes
    const tracksSubscription = stateManager.subscribeToState((newState) => {
      setState(newState);
    });

    // Subscribe to duration changes
    const durationSubscription = stateManager.subscribeToDuration(
      (newState) => {
        setState(newState);
      }
    );

    // Subscribe to track item updates
    const updateTrackItemsMap = stateManager.subscribeToUpdateTrackItem(
      handleTrackItemUpdate
    );

    // Subscribe to add/remove items
    const itemsDetailsSubscription =
      stateManager.subscribeToAddOrRemoveItems(handleAddRemoveItems);

    // Subscribe to item details updates
    const updateItemDetailsSubscription =
      stateManager.subscribeToUpdateItemDetails(handleUpdateItemDetails);

    // Cleanup function to unsubscribe from all events
    return () => {
      if (isSubscribedRef.current) {
        scaleSubscription.unsubscribe();
        tracksSubscription.unsubscribe();
        durationSubscription.unsubscribe();
        itemsDetailsSubscription.unsubscribe();
        updateTrackItemsMap.unsubscribe();
        updateItemDetailsSubscription.unsubscribe();
        resizeDesignSubscription.unsubscribe();

        // Remove from registry
        registry.delete(hookId);
        isSubscribedRef.current = false;
      }
    };
  }, [
    stateManager,
    setState,
    handleTrackItemUpdate,
    handleAddRemoveItems,
    handleUpdateItemDetails
  ]);
};
