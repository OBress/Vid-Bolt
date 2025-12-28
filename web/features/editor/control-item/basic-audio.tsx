import { ScrollArea } from "@/components/ui/scroll-area";
import { IAudio, ITrackItem } from "@designcombo/types";
import Volume from "./common/volume";
import Speed from "./common/speed";
import React, { useState, useEffect } from "react";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { regenerateAudioClip } from "@/app/actions/audio-actions";
import { Loader2 } from "lucide-react";
import useStore from "@/features/editor/store/use-store";
import { audioDataManager } from "@/features/editor/player/lib/audio-data";

const BasicAudio = ({
  trackItem,
  type,
}: {
  trackItem: ITrackItem & IAudio;
  type?: string;
}) => {
  const showAll = !type;
  const [properties, setProperties] = useState(trackItem);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setProperties(trackItem);
  }, [trackItem]);

  const handleChangeVolume = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            volume: v,
          },
        },
      },
    });

    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          volume: v,
        },
      };
    });
  };

  const handleChangeSpeed = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          playbackRate: v,
        },
      },
    });

    setProperties((prev) => {
      return {
        ...prev,
        playbackRate: v,
      };
    });
  };

  const handleRegenerate = async () => {
    const text = properties.metadata?.text as string;
    if (!text) return;

    // Use tempId (which holds videoId) or assume we can find it
    // The editor component usually receives videoId as tempId
    // We might need to find where videoId is stored.
    // basic-audio doesn't receive videoId directly as prop.
    // However, the clip resource URL usually contains the videoId: .../audio/{userId}/{videoId}/...
    // We can extract it, OR ask store if it has project info.
    // useStore doesn't seem to hold videoId explicitly in the root.

    // Fallback: Parsing from current resource URL if available
    // OR: Check if trackItem.metadata has videoId

    // Let's look at the AudioChunk structure or URL.
    // URL: .../audio/USER_ID/VIDEO_ID/...

    let videoId: string | null = null;
    let userId: string | null = null;
    let chunkIndex: number = -1;

    // IAudio usually stores the source URL in details.src
    const sourceUrl =
      (properties.details as any).src || (properties as any).resource;

    // Try to extract from metadata first if we put it there
    // If not, try URL parsing.

    const parts = sourceUrl?.split("/");
    // Expected: .../audio/{userId}/{videoId}/{timestamp}_chunk_{index}.mp3
    if (parts && parts.length >= 4) {
      // This is a bit fragile but workable for now given lack of props
      // We might need to look for "audio" segment
      const audioIdx = parts.indexOf("audio");
      if (audioIdx !== -1 && parts.length > audioIdx + 2) {
        userId = parts[audioIdx + 1];
        videoId = parts[audioIdx + 2];

        // Extract chunk index from filename
        const filename = parts[parts.length - 1]; // timestamp_chunk_001.mp3
        const match = filename.match(/chunk_(\d+)/);
        if (match) {
          chunkIndex = parseInt(match[1], 10);
        }
      }
    }

    if (!videoId || !userId || chunkIndex === -1) {
      console.error(
        "Could not extract video information from audio clip URL",
        sourceUrl
      );
      // Fallback or alert?
      // We will try to rely on metadata if available, otherwise fail
      // Assuming the current implementation works with the URL structure we defined in r2-storage.ts
      if (!videoId) {
        alert(
          "Could not identify video project. Please save/refresh and try again."
        );
        return;
      }
    }

    console.log("Regenerating audio...", {
      videoId,
      userId,
      chunkIndex,
      currentFrom: properties.display.from,
      currentTo: properties.display.to,
    });

    setIsRegenerating(true);

    // CRITICAL: Block state manager updates during regeneration to prevent corruption
    useStore.getState().setIsRegenerating(true);

    try {
      const currentDurationSec =
        (properties.display.to - properties.display.from) / 1000;

      const result = await regenerateAudioClip(
        userId!,
        videoId!,
        chunkIndex,
        text,
        currentDurationSec
      );

      console.log("Regeneration result:", result);

      if (
        result.success &&
        result.audioUrl &&
        typeof result.duration === "number"
      ) {
        // 1. Define currentFrom SAFELY in scope
        let currentFrom = Number(properties.display.from);
        if (!Number.isFinite(currentFrom)) {
          console.error(
            "Invalid 'from' timestamp in local state:",
            properties.display.from
          );
          currentFrom = 0;
        }

        const newDurationMs = Math.round(result.duration * 1000);
        const currentDurationMs =
          properties.display.to - properties.display.from;
        const deltaMs = newDurationMs - currentDurationMs;

        if (!Number.isFinite(newDurationMs) || !Number.isFinite(deltaMs)) {
          console.error("Invalid duration calculated:", {
            newDurationMs,
            deltaMs,
            resultDuration: result.duration,
          });
          alert("Error calculating new audio duration.");
          return;
        }

        // 2. Add Cache Busting
        const freshAudioUrl = `${result.audioUrl}?t=${Date.now()}`;

        console.log("Applying updates:", {
          newDurationMs,
          deltaMs,
          audioUrl: freshAudioUrl,
          currentFrom,
        });

        // 3. Update Current Clip
        const updatedItem = {
          ...trackItem,
          resource: freshAudioUrl,
          duration: newDurationMs,
          details: {
            ...trackItem.details,
            src: freshAudioUrl,
            duration: newDurationMs,
          },
          display: {
            from: currentFrom,
            to: currentFrom + newDurationMs,
          },
          metadata: {
            ...properties.metadata,
            word_timestamps: result.wordTimestamps,
          },
        } as ITrackItem & IAudio;

        // DEBUG: Log current store state before update
        const preDispatchState = useStore.getState();
        console.log("[Audio Regen Debug] PRE-UPDATE State:", {
          trackItemId: trackItem.id,
          trackItemInStore: preDispatchState.trackItemsMap[trackItem.id],
          tracksCount: preDispatchState.tracks.length,
          trackItemIdsCount: preDispatchState.trackItemIds.length,
          duration: preDispatchState.duration,
        });

        // WORKAROUND: Instead of using EDIT_OBJECT which corrupts state,
        // we'll update the Zustand store directly
        const currentStoreState = useStore.getState();
        const currentTrackItemsMap = { ...currentStoreState.trackItemsMap };

        // Get the existing item and merge with updates
        const existingItem = currentTrackItemsMap[trackItem.id];
        if (existingItem) {
          currentTrackItemsMap[trackItem.id] = {
            ...existingItem,
            // Note: 'resource' is not a valid ITrackItem property, only update valid fields
            details: {
              ...existingItem.details,
              src: freshAudioUrl,
            },
            display: {
              from: currentFrom,
              to: currentFrom + newDurationMs,
            },
            metadata: {
              ...existingItem.metadata,
              ...properties.metadata,
              word_timestamps: result.wordTimestamps,
            },
          };
        }

        // Calculate new duration based on all items
        let newProjectDuration = 0;
        Object.values(currentTrackItemsMap).forEach((item) => {
          const itemTo = Number(item.display?.to);
          if (Number.isFinite(itemTo) && itemTo > newProjectDuration) {
            newProjectDuration = itemTo;
          }
        });

        console.log("[Audio Regen Debug] Direct store update:", {
          updatedItemId: trackItem.id,
          newDisplay: currentTrackItemsMap[trackItem.id]?.display,
          newProjectDuration,
        });

        // Update the Zustand store directly (bypass EDIT_OBJECT which corrupts state)
        currentStoreState.setState({
          trackItemsMap: currentTrackItemsMap,
          duration: newProjectDuration,
        });

        // NOTE: We intentionally DO NOT dispatch EDIT_OBJECT here because it
        // corrupts all other items in the state manager (sets their display to undefined,
        // duration to NaN, and creates duplicate tracks). The direct Zustand store update
        // above should trigger React re-renders for components that subscribe to the store.

        // NOTE: We also DO NOT call audioDataManager.updateItem() here because it
        // triggers state manager events that overwrite our Zustand update with corrupted
        // data (1 track → 25 tracks, duration → NaN). The audio will still load when
        // the Remotion player component re-renders with the new src URL.
        console.log(
          "[Audio Regen Debug] Skipping audioDataManager.updateItem to prevent state corruption"
        );

        // NOTE: We removed the ripple edit logic here because dispatch(EDIT_OBJECT)
        // corrupts the entire state manager. Subsequent items won't shift automatically,
        // but at least the timeline won't break.

        // 5. Update local state
        setProperties((prev) => ({
          ...prev,
          resource: freshAudioUrl,
          duration: newDurationMs,
          details: {
            ...prev.details,
            src: freshAudioUrl,
            duration: newDurationMs,
          },
          display: {
            from: currentFrom,
            to: currentFrom + newDurationMs,
          },
          metadata: {
            ...prev.metadata,
            word_timestamps: result.wordTimestamps,
          },
        }));

        // NOTE: Duration is already correctly set via the direct store update above.
        // We no longer need to recalculate - that was causing issues by finding
        // only the regenerated clip instead of all clips.
        console.log(
          "[Audio Regen] Regeneration complete, duration preserved:",
          newProjectDuration
        );
      } else {
        console.error("Regeneration failed or invalid result:", result);
        alert(`Regeneration failed: ${result.error || "Invalid response"}`);
      }
    } catch (err) {
      console.error("Regeneration error:", err);
      alert("An unexpected error occurred during regeneration.");
    } finally {
      setIsRegenerating(false);
      // Unblock state manager updates after a delay to let our direct update settle
      setTimeout(() => {
        useStore.getState().setIsRegenerating(false);
        console.log("[Audio Regen] Unblocked state manager updates");
      }, 500);
    }
  };

  const components = [
    {
      key: "speed",
      component: (
        <Speed
          value={properties.playbackRate ?? 1}
          onChange={handleChangeSpeed}
        />
      ),
    },
    {
      key: "volume",
      component: (
        <Volume
          onChange={(v: number) => handleChangeVolume(v)}
          value={properties.details.volume ?? 100}
        />
      ),
    },
    {
      key: "transcript",
      component: (
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Transcript
            </span>
            <Textarea
              className="min-h-[120px] resize-none text-xs leading-relaxed"
              placeholder="Enter text to generate speech..."
              value={(properties.metadata?.text as string) || ""}
              onChange={(e) => {
                const newText = e.target.value;
                setProperties((prev) => ({
                  ...prev,
                  metadata: {
                    ...prev.metadata,
                    text: newText,
                  },
                }));
                // Dispatch update to store
                dispatch(EDIT_OBJECT, {
                  payload: {
                    [trackItem.id]: {
                      metadata: {
                        ...trackItem.metadata,
                        text: newText,
                      },
                    },
                  },
                });
              }}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Regenerating...
              </>
            ) : (
              "Regenerate Audio"
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="text-text-primary flex h-12 flex-none items-center px-4 text-sm font-medium">
        Audio
      </div>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-2 px-4 py-4">
          {components
            .filter((comp) => showAll || comp.key === type)
            .map((comp) => (
              <React.Fragment key={comp.key}>{comp.component}</React.Fragment>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BasicAudio;
