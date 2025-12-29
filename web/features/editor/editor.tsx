"use client";
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
import { useEffect, useRef, useState, useCallback } from "react";
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
    width: 1080,
    height: 1920,
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
  text: string;
  visual_prompt?: string;
}

const Editor = ({
  tempId,
  id,
  audioUrl,
  audioChunks,
  shotList,
}: {
  tempId?: string;
  id?: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
}) => {
  const [projectName, setProjectName] = useState<string>("Untitled video");
  const { scene } = useSceneStore();

  const sceneRef = useRef<SceneRef>(null);
  const { timeline, playerRef } = useStore();
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
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

  useEffect(() => {
    // Force a complete reset of the state manager before loading design
    // This clears any corrupted tracks from previous sessions/HMR
    dispatch(HISTORY_RESET);
    dispatch(DESIGN_LOAD, { payload: design });
  }, []);

  // Auto-place audio chunks on timeline when available
  useEffect(() => {
    console.log("[Editor Audio Debug] Effect triggered:", {
      audioPlaced: audioPlacedRef.current,
      hasTimeline: !!timeline,
      audioChunksCount: audioChunks?.length || 0,
      audioUrl,
      trackItemsMapSize: Object.keys(trackItemsMap).length,
    });

    // STABILIZATION FIX (V3 - FINAL):
    // 1. Get current tracks and items.
    // 2. Find audio tracks that actually have items.
    // 3. If at least one valid audio track with items exists, we are done. Skip init.
    // 4. If multiple audio tracks exist (even empty), skip init to avoid infinite loop.
    // 5. Only initialize if ZERO audio tracks exist.
    const { tracks } = useStore.getState();
    const audioTracks = tracks.filter((t) => t.type === "audio");

    // Check if ANY audio track has items
    const audioTracksWithItems = audioTracks.filter((t) => t.items.length > 0);

    console.log("[Editor Audio Debug] Audio State Check:", {
      audioTracksCount: audioTracks.length,
      audioTracksWithItems: audioTracksWithItems.length,
      trackItemsMapSize: Object.keys(trackItemsMap).length,
    });

    // If we have any audio tracks (with or without items), mark as placed and skip.
    // This breaks the infinite loop caused by empty track shells.
    // HOWEVER: On remount (step navigation), we need to re-dispatch items to the new canvas.
    if (audioTracks.length > 0) {
      // Check if we've already dispatched in THIS mount cycle
      if (audioPlacedRef.current) {
        console.log(
          "[Editor Audio Debug] Skipping - already dispatched in this session"
        );
        return;
      }

      // Mark as placed for this mount cycle
      audioPlacedRef.current = true;

      if (audioTracksWithItems.length > 0) {
        console.log(
          "[Editor Audio Debug] Store has audio track with",
          audioTracksWithItems[0].items.length,
          "items - re-dispatching to canvas"
        );

        // Re-dispatch existing items to the new canvas
        // Get the full track items from the store
        const existingAudioItems = Object.values(trackItemsMap).filter(
          (item) => item.type === "audio"
        );

        if (existingAudioItems.length > 0) {
          console.log(
            "[Editor Audio Debug] Re-dispatching",
            existingAudioItems.length,
            "audio items to canvas with ALL tracks"
          );

          // IMPORTANT: Include ALL tracks (audio + visual) to prevent overwriting
          dispatch(ADD_ITEMS, {
            payload: {
              trackItems: existingAudioItems,
              tracks: tracks.map((t) => ({
                id: t.id,
                items: t.items,
                type: t.type,
              })),
            },
          });
        }
      }
      return;
    }

    // Skip if already placed (local guard) or timeline not ready
    if (audioPlacedRef.current) {
      console.log(
        "[Editor Audio Debug] Skipping - audio already placed (local flag)"
      );
      return;
    }

    if (!timeline) {
      console.log("[Editor Audio Debug] Skipping - timeline not ready");
      return;
    }

    // Log existing audio tracks for debugging
    const existingAudioTracks = Object.values(trackItemsMap).filter(
      (item) => item.type === "audio"
    );
    console.log(
      "[Editor Audio Debug] Existing audio tracks:",
      existingAudioTracks.length,
      existingAudioTracks.map((t) => (t.details as any)?.src?.substring(0, 50))
    );
    // NOTE: We no longer skip here - we want to add our audio chunks even if there's existing audio

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

  // Visual placeholder placement ref
  const visualsPlacedRef = useRef(false);

  // Auto-place visual placeholders on timeline when shot list is available
  useEffect(() => {
    console.log("[Editor Visual DEBUG] Effect triggered:", {
      visualsPlaced: visualsPlacedRef.current,
      hasTimeline: !!timeline,
      shotListCount: shotList?.length || 0,
      shotListSample: shotList?.[0],
    });

    // Skip if already placed or no timeline
    if (visualsPlacedRef.current) {
      console.log(
        "[Editor Visual DEBUG] Skipping - visuals already placed (ref=true)"
      );
      return;
    }

    if (!timeline) {
      console.log("[Editor Visual DEBUG] Skipping - timeline not ready");
      return;
    }

    if (!shotList || shotList.length === 0) {
      console.log("[Editor Visual DEBUG] Skipping - no shot list available");
      return;
    }

    // Check if visual tracks already exist in store
    const { tracks, trackItemsMap: storeTrackItemsMap } = useStore.getState();
    console.log("[Editor Visual DEBUG] Current tracks in store:", {
      totalTracks: tracks.length,
      trackTypes: tracks.map((t) => t.type),
    });

    const visualTracks = tracks.filter(
      (t) => t.type === "image" || t.type === "video"
    );

    // If visual tracks exist, check if we need to re-dispatch
    if (visualTracks.length > 0) {
      // Check if we've already dispatched in THIS mount cycle
      if (visualsPlacedRef.current) {
        console.log(
          "[Editor Visual DEBUG] Skipping - already dispatched in this session"
        );
        return;
      }

      // Mark as placed for this mount cycle
      visualsPlacedRef.current = true;

      console.log(
        "[Editor Visual DEBUG] Store has visual tracks - re-dispatching to canvas"
      );

      // Re-dispatch existing items to the new canvas
      const existingVisualItems = Object.values(storeTrackItemsMap).filter(
        (item) => item.type === "image" || item.type === "video"
      );

      if (existingVisualItems.length > 0) {
        console.log(
          "[Editor Visual DEBUG] Re-dispatching",
          existingVisualItems.length,
          "visual items to canvas"
        );

        // Include all tracks (both audio and visual) to preserve them
        dispatch(ADD_ITEMS, {
          payload: {
            trackItems: existingVisualItems,
            tracks: tracks.map((t) => ({
              id: t.id,
              items: t.items,
              type: t.type,
            })),
          },
        });
      }
      return;
    }

    // Wait for audio track to be placed before adding visuals
    // This prevents race condition where visuals overwrite audio
    const audioTracks = tracks.filter((t) => t.type === "audio");
    if (audioTracks.length === 0 && audioChunks && audioChunks.length > 0) {
      console.log(
        "[Editor Visual DEBUG] Audio track not ready yet, waiting 500ms before retrying..."
      );
      // Don't mark as placed yet - schedule a retry
      setTimeout(() => {
        visualsPlacedRef.current = false; // Reset to allow retry
      }, 500);
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

    // Build visual track items from shot list
    const trackItems = shotList.map((shot) => {
      const id = generateId();
      const color = contentTypeColors[shot.content_type] || "#6b7280";

      // Create an SVG data URL as placeholder - much more reliable than external APIs
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect fill="${color}" width="1920" height="1080"/><text x="960" y="540" text-anchor="middle" fill="white" font-size="48" font-family="sans-serif">Shot ${shot.segment_index}</text></svg>`;
      const dataUrl = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

      return {
        id,
        type: "image" as const,
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
        details: {
          src: dataUrl,
        },
        metadata: {
          shotIndex: shot.segment_index,
          contentType: shot.content_type,
          visualPrompt: shot.visual_prompt || shot.text,
          text: shot.text,
        },
      };
    });

    // Dispatch visual placeholders to a new track
    // IMPORTANT: Include ALL existing tracks to prevent replacement
    const trackId = generateId();
    const existingTracks = tracks.map((t) => ({
      id: t.id,
      items: t.items,
      type: t.type,
    }));

    console.log("[Editor Visual DEBUG] ADD_ITEMS payload:", {
      trackItemsCount: trackItems.length,
      newTrackId: trackId,
      existingTracksCount: existingTracks.length,
      existingTrackTypes: existingTracks.map((t) => t.type),
    });

    // Combine existing tracks with new visual track
    const allTracks = [
      ...existingTracks,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotList, timeline]);

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
