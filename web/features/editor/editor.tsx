"use client";
import Timeline from "./timeline";
import useStore from "./store/use-store";
import Navbar from "./navbar";
import useTimelineEvents from "./hooks/use-timeline-events";
import Scene from "./scene";
import { SceneRef } from "./scene/scene.types";
import StateManager, { DESIGN_LOAD } from "@designcombo/state";
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

const Editor = ({ tempId, id }: { tempId?: string; id?: string }) => {
  const [projectName, setProjectName] = useState<string>("Untitled video");
  const { scene } = useSceneStore();

  const sceneRef = useRef<SceneRef>(null);
  const { timeline, playerRef } = useStore();
  const { activeIds, trackItemsMap, transitionsMap } = useStore();
  const [loaded, setLoaded] = useState(false);
  const [trackItem, setTrackItem] = useState<ITrackItem | null>(null);
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
