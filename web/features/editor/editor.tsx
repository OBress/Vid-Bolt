"use client";
import Timeline from "./timeline";
import useStore from "./store/use-store";
import Navbar from "./navbar";
import useTimelineEvents from "./hooks/use-timeline-events";
import Scene from "./scene";
import { SceneRef } from "./scene/scene.types";
import StateManager, { DESIGN_LOAD, ADD_ITEMS } from "@designcombo/state";
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

const Editor = ({
  tempId,
  id,
  audioUrl,
  audioChunks,
}: {
  tempId?: string;
  id?: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
}) => {
  const [projectName, setProjectName] = useState<string>("Untitled video");
  const { scene } = useSceneStore();

  const sceneRef = useRef<SceneRef>(null);
  const { timeline, playerRef } = useStore();
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
  const [audioPlaced, setAudioPlaced] = useState(false);
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
    dispatch(DESIGN_LOAD, { payload: design });
  }, []);

  // Auto-place audio chunks on timeline when available
  useEffect(() => {
    console.log("[Editor Audio Debug] Effect triggered:", {
      audioPlaced,
      hasTimeline: !!timeline,
      audioChunksCount: audioChunks?.length || 0,
      audioUrl,
      trackItemsMapSize: Object.keys(trackItemsMap).length,
    });

    // Skip if already placed or timeline not ready
    if (audioPlaced) {
      console.log("[Editor Audio Debug] Skipping - audio already placed");
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

    // Mark as placed immediately to prevent duplicate attempts
    setAudioPlaced(true);

    // Wait for timeline to fully initialize, then add all audio items at once
    setTimeout(() => {
      // Create track items array with sequential positioning
      const trackItems: Array<{
        id: string;
        type: string;
        display: { from: number; to: number };
        trim: { from: number; to: number };
        details: { src: string };
        name: string;
        metadata: Record<string, unknown>;
      }> = [];
      const itemIds: string[] = [];
      let currentPosition = 0;

      for (const chunk of sortedChunks) {
        const id = generateId();
        const durationMs = (chunk.duration_seconds || 10) * 1000;

        trackItems.push({
          id,
          type: "audio",
          display: {
            from: currentPosition,
            to: currentPosition + durationMs,
          },
          trim: {
            from: 0,
            to: durationMs,
          },
          details: {
            src: chunk.url,
          },
          name: `Audio ${chunk.chapterNumber + 1}`,
          metadata: {
            text: chunk.text,
          },
        });

        itemIds.push(id);
        currentPosition += durationMs;
      }

      console.log(
        `[Editor Audio Debug] Adding ${trackItems.length} audio items to single track (total ${currentPosition}ms)`
      );

      // Use ADD_ITEMS to batch add all audio to ONE track
      dispatch(ADD_ITEMS, {
        payload: {
          trackItems,
          tracks: [
            {
              id: generateId(),
              items: itemIds,
              type: "audio",
              name: "Generated Audio",
            },
          ],
        },
      });

      console.log("[Editor Audio Debug] All audio items added to single track");
    }, 500);
  }, [audioChunks, audioUrl, timeline, trackItemsMap, audioPlaced]);

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
