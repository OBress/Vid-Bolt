import { ScrollArea } from "@/components/ui/scroll-area";
import { IAudio, ITrackItem } from "@designcombo/types";
import Volume from "./common/volume";
import Speed from "./common/speed";
import React, { useState, useEffect } from "react";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT, LAYER_REPLACE } from "@designcombo/state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const BasicAudio = ({
  trackItem,
  type,
}: {
  trackItem: ITrackItem & IAudio;
  type?: string;
}) => {
  const showAll = !type;
  const [properties, setProperties] = useState(trackItem);

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
            onClick={() => {
              // TODO: Implement regeneration logic
              console.log(
                "Regenerating audio for text:",
                properties.metadata?.text
              );
            }}
          >
            Regenerate Audio
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
