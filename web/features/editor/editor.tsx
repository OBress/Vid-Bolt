"use client";
import type { GeneratedMedia } from "@/types/video";
import Timeline from "./timeline";
import useStore from "./store/use-store";
import Navbar from "./navbar";
import useTimelineEvents from "./hooks/use-timeline-events";
import Scene from "./scene";
import { SceneRef } from "./scene/scene.types";
import StateManager, {
  DESIGN_LOAD,
  ADD_ITEMS,
  LAYER_DELETE,
  HISTORY_RESET,
} from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { getCompactFontData, loadFonts } from "./utils/fonts";
import { SECONDARY_FONT, SECONDARY_FONT_URL } from "./constants/constants";
import MenuList from "./menu-list";
import { MenuItem } from "./menu-item";
import { ControlItem } from "./control-item";
import CropModal from "./crop-modal/crop-modal";
import useDataState from "./store/use-data-state";
import { FONTS } from "./data/fonts";
import FloatingControl from "./control-item/floating-controls/floating-control";
import { useSceneStore } from "@/store/use-scene-store";
import { dispatch } from "@designcombo/events";
import MenuListHorizontal from "./menu-list-horizontal";
import { useIsLargeScreen } from "@/hooks/use-media-query";
import { ITrackItem } from "@designcombo/types";
import useLayoutStore from "./store/use-layout-store";
import ControlItemHorizontal from "./control-item-horizontal";
import { design } from "./mock";

const stateManager = new StateManager({
  size: {
    width: 1920,
    height: 1080,
  },
});

// Cookie helpers for panel size persistence
const COOKIE_NAME = "vidbolt-editor-layout";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function savePanelSizesToCookie(sceneSize: number, timelineSize: number) {
  const value = JSON.stringify({
    scenePanel: sceneSize,
    timelinePanel: timelineSize,
  });
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    value
  )}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function loadPanelSizesFromCookie(): {
  scenePanel: number;
  timelinePanel: number;
} {
  if (typeof document === "undefined") {
    return { scenePanel: 70, timelinePanel: 30 };
  }
  const match = document.cookie.match(
    new RegExp(`(^| )${COOKIE_NAME}=([^;]+)`)
  );
  if (match) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[2]));
      return {
        scenePanel: parsed.scenePanel ?? 70,
        timelinePanel: parsed.timelinePanel ?? 30,
      };
    } catch {
      return { scenePanel: 70, timelinePanel: 30 };
    }
  }
  return { scenePanel: 70, timelinePanel: 30 };
}

// Audio chunk type for timeline placement
interface AudioChunk {
  chapterNumber: number;
  url: string;
  duration_seconds?: number;
  text?: string;
}

// Shot event type for visual placeholders
interface ShotEvent {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type:
    | "list-item"
    | "comparison"
    | "concept"
    | "transition"
    | "emotional-beat";
  media_type?: "image" | "video";
  text: string;
  visual_prompt?: string;
}

const Editor = ({
  tempId,
  id,
  audioUrl,
  audioChunks,
  shotList,
  generatedMedia,
}: {
  tempId?: string;
  id?: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
}) => {
  const [projectName, setProjectName] = useState<string>("Untitled video");
  const { scene } = useSceneStore();

  const sceneRef = useRef<SceneRef>(null);
  const { timeline, playerRef } = useStore();
  // IMPORTANT: Subscribe to 'tracks' so we re-render when tracks are added/removed
  // This fixes the race condition where Visual effect runs before Audio effect's dispatch updates the store
  const { activeIds, trackItemsMap, transitionsMap, tracks } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  // Use ref instead of state to prevent race conditions - refs update synchronously
  const audioPlacedRef = useRef(false);
  const {
    setTrackItem: setLayoutTrackItem,
    setFloatingControl,
    setLabelControlItem,
    setTypeControlItem,
  } = useLayoutStore();
  const isLargeScreen = useIsLargeScreen();

  // Panel sizes - loaded from cookie on mount only
  const initialSizes = useRef(loadPanelSizesFromCookie());

  useTimelineEvents();

  const { setCompactFonts, setFonts } = useDataState();

  // Use ref instead of state to prevent race conditions
  const visualsPlacedRef = useRef(false);
  const syncedRef = useRef(false);

  // Build a shot_index → media info map from generatedMedia
  // Rewrite R2 URLs to same-origin /r2-media/ path to avoid canvas CORS tainting
  const mediaUrlMap = useMemo(() => {
    const map = new Map<number, { url: string; type: 'image' | 'video' }>();
    if (!generatedMedia) return map;
    const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://assets.vidbolt.app';
    for (const media of generatedMedia) {
      if (media.generation_status === 'completed' && media.media_url) {
        const type = media.media_type === 'video' ? 'video' : 'image';
        // Rewrite external R2 URL to same-origin path via Next.js rewrite
        const url = media.media_url.startsWith(r2PublicUrl)
          ? media.media_url.replace(r2PublicUrl, '/r2-media')
          : media.media_url;
        map.set(media.shot_index, { url, type });
      }
    }
    return map;
  }, [generatedMedia]);

  // SYNC FIX: Restoration of persistent state on remount
  // This replaces the manual reset + re-dispatch logic which was causing duplicates
  useEffect(() => {
    if (!timeline) return;

    // Check if we have persistent state
    const state = useStore.getState();
    const hasTracks = state.tracks && state.tracks.length > 0;

    if (hasTracks && !syncedRef.current) {
      console.log(
        "[Editor Sync] Persistent state found, reloading design to ensure canvas sync..."
      );

      // Construct design object from current persistent state
      // We use DESIGN_LOAD because it fully replaces the state, preventing duplication
      const designToLoad = {
        id: design.id,
        fps: state.fps,
        duration: state.duration,
        size: state.size,
        tracks: state.tracks,
        trackItemsMap: state.trackItemsMap,
        transitionsMap: state.transitionsMap,
        trackItemIds: state.trackItemIds,
      };

      dispatch(DESIGN_LOAD, { payload: designToLoad });

      // Mark as synced and placed so other effects don't duplicate
      syncedRef.current = true;
      audioPlacedRef.current = true;
      visualsPlacedRef.current = true;
    }
  }, [timeline]);

  // Auto-place audio chunks on timeline when available
  useEffect(() => {
    // If we already synced from persistent state, skip placement
    if (syncedRef.current) return;

    console.log("[Editor Audio Debug] Effect triggered:", {
      audioPlaced: audioPlacedRef.current,
      hasTimeline: !!timeline,
      audioChunksCount: audioChunks?.length || 0,
      tracksCount: Object.keys(trackItemsMap).length,
    });

    const { tracks } = useStore.getState();
    const audioTracks = tracks.filter((t) => t.type === "audio");

    // Check if audio tracks already exist (and we missed the sync?)
    if (audioTracks.length > 0) {
      if (!audioPlacedRef.current) {
        console.log(
          "[Editor Audio Debug] Audio tracks exist, marking as placed."
        );
        audioPlacedRef.current = true;
      }
      return;
    }

    // Skip if already placed (local guard) or timeline not ready
    if (audioPlacedRef.current) {
      return;
    }

    if (!timeline) {
      console.log("[Editor Audio Debug] Skipping - timeline not ready");
      return;
    }

    // Build the audio track items from chunks
    if (!audioChunks || audioChunks.length === 0) {
      if (!audioUrl) {
        console.log("[Editor Audio Debug] No audio chunks or URL, exiting");
        return;
      }
      // Fallback to single audio clip
      console.log("[Editor Audio Debug] Using single audioUrl fallback");
    }

    // Sort chunks by chapter number
    const sortedChunks =
      audioChunks && audioChunks.length > 0
        ? [...audioChunks].sort((a, b) => a.chapterNumber - b.chapterNumber)
        : audioUrl
        ? [{ chapterNumber: 0, url: audioUrl, duration_seconds: 30 }]
        : [];

    if (sortedChunks.length === 0) {
      console.log("[Editor Audio Debug] No chunks to place, exiting");
      return;
    }

    console.log(
      "[Editor Audio Debug] Building track items for",
      sortedChunks.length,
      "chunks"
    );

    // Mark as placed immediately to prevent duplicate attempts (ref is synchronous)
    audioPlacedRef.current = true;

    // Build all track items with sequential timing based on duration_seconds
    let currentTime = 0;
    const trackItems = sortedChunks.map((chunk, index) => {
      const id = generateId();
      const durationMs = (chunk.duration_seconds || 5) * 1000; // Default 5 seconds if no duration
      const item = {
        id,
        type: "audio" as const,
        name: `Audio ${chunk.chapterNumber + 1}`,
        display: {
          from: currentTime,
          to: currentTime + durationMs,
        },
        // trim is required by the timeline Audio class
        trim: {
          from: 0,
          to: durationMs,
        },
        // duration is required by the timeline Audio class
        duration: durationMs,
        details: {
          src: chunk.url,
        },
        metadata: {
          text: chunk.text,
        },
      };
      console.log(
        `[Editor Audio Debug] Building audio chunk ${index + 1}/${
          sortedChunks.length
        }: from=${currentTime}ms, to=${currentTime + durationMs}ms`
      );
      currentTime += durationMs;
      return item;
    });

    // DEBUG: Log full structure of first item to understand expected format
    if (trackItems.length > 0) {
      console.log(
        "[Editor Audio Debug] First trackItem full structure:",
        JSON.stringify(trackItems[0], null, 2)
      );
    }

    // Dispatch single ADD_ITEMS with one track containing all audio items
    const trackId = generateId();

    // DEBUG: Log the full payload being sent
    console.log("[Editor Audio Debug] ADD_ITEMS payload:", {
      trackItemsCount: trackItems.length,
      trackId: trackId,
      firstItemId: trackItems[0]?.id,
      lastItemId: trackItems[trackItems.length - 1]?.id,
    });

    dispatch(ADD_ITEMS, {
      payload: {
        trackItems,
        tracks: [
          {
            id: trackId,
            items: trackItems.map((item) => item.id),
            type: "audio",
            name: "Audio",
          },
        ],
      },
    });

    console.log(
      `[Editor Audio Debug] Added ${sortedChunks.length} audio items to single track ${trackId}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioChunks, audioUrl, timeline]);

  // Auto-place visual placeholders on timeline when shot list is available
  useEffect(() => {
    // If we already synced from persistent state, skip placement
    if (syncedRef.current) return;

    console.log("[Editor Visual DEBUG] Effect triggered:", {
      visualsPlaced: visualsPlacedRef.current,
      hasTimeline: !!timeline,
      shotListCount: shotList?.length || 0,
      tracksCount: tracks.length, // Log tracks count from prop
    });

    if (!timeline) {
      console.log("[Editor Visual DEBUG] Skipping - timeline not ready");
      return;
    }

    if (!shotList || shotList.length === 0) {
      console.log("[Editor Visual DEBUG] Skipping - no shot list available");
      return;
    }

    // Check if visual tracks ALREADY exist
    const visualTracks = tracks.filter(
      (t) => t.type === "image" || t.type === "video"
    );

    if (visualTracks.length > 0) {
      // If tracks exist, we assume they are correct (either from Sync or previous placement)
      // Just update our ref to match reality
      if (!visualsPlacedRef.current) {
        console.log(
          "[Editor Visual DEBUG] Visual tracks found, marking as placed."
        );
        visualsPlacedRef.current = true;
      }
      return;
    }

    // If we have a local ref saying we placed them, but they aren't in the store...
    // Then something went wrong (e.g. state reset), so we should probably allow placement again?
    // BUT we must be careful of race conditions.
    // For now, respect the ref to avoid infinite loops, unless we are sure.
    if (visualsPlacedRef.current) {
      // double check if maybe they were just added?
      // If they are missing key logic, we might need to reset ref?
      // For safety, let's Stick to "skip if ref is true" to prevent dups.
      return;
    }

    // Wait for audio track to be placed before adding visuals
    // This prevents race condition where visuals overwrite audio
    const audioTracks = tracks.filter((t) => t.type === "audio");

    // Only wait if there are actual audio chunks/url we expect to place
    const expectingAudio =
      (audioChunks && audioChunks.length > 0) || !!audioUrl;

    if (audioTracks.length === 0 && expectingAudio) {
      console.log(
        "[Editor Visual DEBUG] Audio track not ready yet. Waiting for store update..."
      );
      // No timeout needed! React will re-render this effect when 'tracks' changes
      return;
    }

    // Mark as placed immediately
    visualsPlacedRef.current = true;

    console.log(
      `[Editor Visual DEBUG] Placing ${shotList.length} visual placeholders`
    );

    // Color mapping for content types
    const contentTypeColors: Record<string, string> = {
      "list-item": "#f97316", // orange
      comparison: "#8b5cf6", // purple
      concept: "#3b82f6", // blue
      transition: "#22c55e", // green
      "emotional-beat": "#ef4444", // red
    };

    // Content type to visual type mapping
    // If media_type is provided (from new API), use it. Otherwise fallback to basic mapping.
    const getVisualType = (shot: ShotEvent): "image" | "video" => {
      // Use explicit media_type if available
      if (shot.media_type === "image" || shot.media_type === "video") {
        return shot.media_type;
      }

      // Fallback based on content type if no media_type provided
      switch (shot.content_type) {
        case "transition":
        case "emotional-beat":
          return "video";
        default:
          return "image";
      }
    };

    // Build visual track items from shot list
    const trackItems = shotList.map((shot) => {
      const id = generateId();
      const color = contentTypeColors[shot.content_type] || "#6b7280";

      // Look up real generated media for this shot
      const realMedia = mediaUrlMap.get(shot.segment_index);
      const visualType = realMedia?.type || getVisualType(shot);

      // Use real media URL if available, otherwise transparent placeholder
      const transparentPng =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const source = realMedia?.url || transparentPng;

      const itemDetails: any = {
        src: source,
      };

      // Add specific details for video to ensure player can initialize
      if (visualType === "video") {
        itemDetails.volume = 0;
        itemDetails.width = 1920;
        itemDetails.height = 1080;
      }

      return {
        id,
        type: visualType,
        name: `Shot ${shot.segment_index}`,
        display: {
          from: shot.start_seconds * 1000,
          to: shot.end_seconds * 1000,
        },
        trim: {
          from: 0,
          to: shot.duration_seconds * 1000,
        },
        duration: shot.duration_seconds * 1000,
        details: itemDetails,
        metadata: {
          shotIndex: shot.segment_index,
          contentType: shot.content_type,
          mediaType: visualType,
          color: color,
          visualPrompt: shot.visual_prompt || shot.text,
          text: shot.text,
        },
      };
    });

    // Group items by type to put on separate tracks if desired, OR keep on one track
    // For now, keep on one track but setting correct type allows the Sidebar to show correct tabs
    // Note: Timeline might need mixed track support or we separate them?
    // The current implementation puts them all on one track defined as "image" type
    // We should probably verify if we can mix types on a track.
    // If not, we might need multiple tracks or a generic "visual" track type.
    // Let's assume for now we put them on a single track but the ITEM ID determines the control

    // IMPORTANT: The track definition below sets type: "image".
    // If we have mixed content, this "track type" usually defaults the behavior.
    // However, the *item* type (`visualType`) is what `ActiveControlItem` uses to render components.
    // Let's check if we need to change the track type to something generic or if "image" is fine for mixed.
    // Looking at Timeline implementation usually tracks are typed, but items override.
    // Let's stick to adding them to the track, but update the track logic if needed.

    // If we need strict track separation:
    const imageItems = trackItems.filter((i) => i.type === "image");
    const videoItems = trackItems.filter((i) => i.type === "video");

    // Logic below dispatches them all together.
    // Let's update the track type to be generic if possible, or just keep "image" as the container
    // usually "visual" or "video" is the generic type.

    // We will dispatch them all on one track for layout stability,
    // assuming the renderer handles mixed item types on a track (standard in many timelines).

    // Dispatch visual placeholders to a new track
    // IMPORTANT: Include ALL existing tracks to prevent replacement
    // We re-read tracks from store to ensure we have the absolute latest state (including just-added audio)
    const trackId = generateId();
    // Use the tracks from prop which is latest from store
    const existingTracksPayload = tracks.map((t) => ({
      id: t.id,
      items: t.items,
      type: t.type,
    }));

    console.log("[Editor Visual DEBUG] ADD_ITEMS payload:", {
      trackItemsCount: trackItems.length,
      newTrackId: trackId,
      existingTracksCount: existingTracksPayload.length,
      existingTrackTypes: existingTracksPayload.map((t) => t.type),
    });

    // Combine existing tracks with new visual track
    const allTracks = [
      ...existingTracksPayload,
      {
        id: trackId,
        items: trackItems.map((item) => item.id),
        type: "image",
      },
    ];

    dispatch(ADD_ITEMS, {
      payload: {
        trackItems,
        tracks: allTracks,
      },
    });

    console.log(
      `[Editor Visual DEBUG] Added ${shotList.length} visual placeholders to track ${trackId}. Total tracks now: ${allTracks.length}`
    );
    // Add 'tracks' and 'mediaUrlMap' to dependency array to trigger re-run when Audio effect adds tracks
  }, [shotList, timeline, tracks, audioChunks, audioUrl, mediaUrlMap]);

  useEffect(() => {
    setCompactFonts(getCompactFontData(FONTS));
    setFonts(FONTS);
  }, []);

  useEffect(() => {
    loadFonts([
      {
        name: SECONDARY_FONT,
        url: SECONDARY_FONT_URL,
      },
    ]);
  }, []);

  const handleTimelineResize = useCallback(() => {
    const timelineContainer = document.getElementById("timeline-container");
    if (!timelineContainer) return;

    timeline?.resize(
      {
        height: timelineContainer.clientHeight - 90,
        width: timelineContainer.clientWidth - 40,
      },
      {
        force: true,
      }
    );

    // Trigger zoom recalculation when timeline is resized
    setTimeout(() => {
      sceneRef.current?.recalculateZoom();
    }, 100);
  }, [timeline]);

  // Save panel sizes to cookie when layout changes
  const handleLayoutChange = useCallback(
    (sizes: Record<string, number>) => {
      const sceneSize = sizes["scene-panel"];
      const timelineSize = sizes["timeline-panel"];
      if (sceneSize !== undefined && timelineSize !== undefined) {
        savePanelSizesToCookie(sceneSize, timelineSize);
      }
      // Call resize after layout change
      handleTimelineResize();
    },
    [handleTimelineResize]
  );

  useEffect(() => {
    const onResize = () => handleTimelineResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [handleTimelineResize]);

  useEffect(() => {
    if (activeIds.length === 1) {
      const [id] = activeIds;
      const trackItem = trackItemsMap[id];
      if (trackItem) {
        setTrackItem(trackItem);
        setLayoutTrackItem(trackItem);
      } else console.log(transitionsMap[id]);
    } else {
      setTrackItem(null);
      setLayoutTrackItem(null);
    }
  }, [activeIds, trackItemsMap]);

  useEffect(() => {
    setFloatingControl("");
    setLabelControlItem("");
    setTypeControlItem("");
  }, [isLargeScreen]);

  useEffect(() => {
    setLoaded(true);
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <Navbar
        projectName={projectName}
        user={null}
        stateManager={stateManager}
        setProjectName={setProjectName}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Fixed width, not resizable */}
        {isLargeScreen && (
          <div className="bg-muted flex flex-none border-r border-border/80 h-full">
            <MenuList />
            <MenuItem />
          </div>
        )}

        {/* Main Content Area with vertical resizable panels */}
        <ResizablePanelGroup
          style={{ flex: 1 }}
          direction="vertical"
          onLayoutChange={handleLayoutChange}
        >
          <ResizablePanel
            id="scene-panel"
            className="relative"
            defaultSize={initialSizes.current.scenePanel}
            minSize={30}
          >
            <FloatingControl />
            <div className="flex h-full flex-1">
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  position: "relative",
                  flex: 1,
                  overflow: "hidden",
                }}
              >
                <CropModal />
                <Scene ref={sceneRef} stateManager={stateManager} />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle direction="vertical" withHandle />
          <ResizablePanel
            id="timeline-panel"
            className="min-h-[50px]"
            defaultSize={initialSizes.current.timelinePanel}
            minSize={15}
          >
            {playerRef && <Timeline stateManager={stateManager} />}
          </ResizablePanel>
          {!isLargeScreen && !trackItem && loaded && <MenuListHorizontal />}
          {!isLargeScreen && trackItem && <ControlItemHorizontal />}
        </ResizablePanelGroup>

        {/* Right Sidebar - Fixed, not resizable */}
        <ControlItem />
      </div>
    </div>
  );
};

export default Editor;
