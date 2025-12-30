import { ScrollArea } from "@/components/ui/scroll-area";
import { IBoxShadow, ITrackItem, IVideo } from "@designcombo/types";
import Outline from "./common/outline";
import Shadow from "./common/shadow";
import Opacity from "./common/opacity";
import Rounded from "./common/radius";
import AspectRatio from "./common/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Crop, RefreshCcw } from "lucide-react";
import Volume from "./common/volume";
import React, { useEffect, useState } from "react";
import { dispatch } from "@designcombo/events";
import { EDIT_OBJECT } from "@designcombo/state";
import Speed from "./common/speed";
import useLayoutStore from "../store/use-layout-store";
import { Label } from "@/components/ui/label";
import { Animations } from "./common/animations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const BasicVideo = ({
  trackItem,
  type,
}: {
  trackItem: ITrackItem & IVideo;
  type?: string;
}) => {
  const showAll = !type;
  const [properties, setProperties] = useState(trackItem);
  const { setCropTarget } = useLayoutStore();

  // Local state for the media tab
  const [prompt, setPrompt] = useState(
    trackItem.metadata?.visualPrompt || trackItem.metadata?.text || ""
  );

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

  const onChangeBorderWidth = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            borderWidth: v,
          },
        },
      },
    });
    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          borderWidth: v,
        },
      };
    });
  };

  const onChangeBorderColor = (v: string) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            borderColor: v,
          },
        },
      },
    });
    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          borderColor: v,
        },
      };
    });
  };

  const handleChangeOpacity = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            opacity: v,
          },
        },
      },
    });
    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          opacity: v,
        },
      };
    });
  };

  const onChangeBorderRadius = (v: number) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            borderRadius: v,
          },
        },
      },
    });
    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          borderRadius: v,
        },
      };
    });
  };

  const onChangeBoxShadow = (boxShadow: IBoxShadow) => {
    dispatch(EDIT_OBJECT, {
      payload: {
        [trackItem.id]: {
          details: {
            boxShadow: boxShadow,
          },
        },
      },
    });

    setProperties((prev) => {
      return {
        ...prev,
        details: {
          ...prev.details,
          boxShadow,
        },
      };
    });
  };
  useEffect(() => {
    setProperties(trackItem);
    setPrompt(
      trackItem.metadata?.visualPrompt || trackItem.metadata?.text || ""
    );
  }, [trackItem]);

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
      key: "crop",
      component: (
        <div className="mb-4">
          <Button
            variant={"secondary"}
            size={"icon"}
            onClick={() => {
              setCropTarget(trackItem);
            }}
          >
            <Crop size={18} />
          </Button>
        </div>
      ),
    },
    {
      key: "basic",
      component: (
        <div className="flex flex-col gap-2">
          <Label className="font-sans text-xs font-semibold text-primary">
            Basic
          </Label>
          <AspectRatio />
          <Volume
            onChange={(v: number) => handleChangeVolume(v)}
            value={properties.details.volume ?? 100}
          />
          <Opacity
            onChange={(v: number) => handleChangeOpacity(v)}
            value={properties.details.opacity ?? 100}
          />
          <Speed
            value={properties.playbackRate ?? 1}
            onChange={handleChangeSpeed}
          />
          <Rounded
            onChange={(v: number) => onChangeBorderRadius(v)}
            value={properties.details.borderRadius as number}
          />
        </div>
      ),
    },
    {
      key: "animations",
      component: <Animations trackItem={trackItem} properties={properties} />,
    },
    {
      key: "outline",
      component: (
        <Outline
          onChageBorderWidth={(v: number) => onChangeBorderWidth(v)}
          onChangeBorderColor={(v: string) => onChangeBorderColor(v)}
          valueBorderWidth={properties.details.borderWidth as number}
          valueBorderColor={properties.details.borderColor as string}
          label="Outline"
        />
      ),
    },
    {
      key: "shadow",
      component: (
        <Shadow
          onChange={(v: IBoxShadow) => onChangeBoxShadow(v)}
          value={
            properties.details.boxShadow ?? {
              color: "transparent",
              x: 0,
              y: 0,
              blur: 0,
            }
          }
          label="Shadow"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-1 flex-col h-full">
      <Tabs defaultValue="media" className="w-full flex-1 flex flex-col">
        <div className="px-4 pt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="media">Video</TabsTrigger>
            <TabsTrigger value="properties">Properties</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="media" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 px-4 py-4">
              {/* Frame Visualization */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-16 h-9 bg-muted rounded border border-border overflow-hidden relative">
                      {((trackItem.metadata as any)?.startImage ||
                        trackItem.details.src) && (
                        <img
                          src={
                            (trackItem.metadata as any)?.startImage ||
                            trackItem.details.src
                          }
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Start
                    </span>
                  </div>
                  <div className="h-[1px] flex-1 bg-border mx-2 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t border-r border-border rotate-45" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-16 h-9 bg-muted rounded border border-border overflow-hidden relative">
                      {((trackItem.metadata as any)?.endImage ||
                        trackItem.details.src) && (
                        <img
                          src={
                            (trackItem.metadata as any)?.endImage ||
                            trackItem.details.src
                          }
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      End
                    </span>
                  </div>
                </div>

                <div className="grid grid-rows-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Start Frame
                    </Label>
                    <div
                      className="w-full aspect-video rounded-md border border-dashed border-border flex items-center justify-center bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer min-h-[100px] overflow-hidden relative group"
                      onClick={() =>
                        document.getElementById("start-frame-upload")?.click()
                      }
                    >
                      {(trackItem.metadata as any)?.startImage ? (
                        <img
                          src={(trackItem.metadata as any)?.startImage}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Select Start Frame
                        </span>
                      )}
                      <input
                        id="start-frame-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = URL.createObjectURL(file);
                            dispatch(EDIT_OBJECT, {
                              payload: {
                                [trackItem.id]: {
                                  metadata: {
                                    ...trackItem.metadata,
                                    startImage: url,
                                  },
                                },
                              },
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      End Frame
                    </Label>
                    <div
                      className="w-full aspect-video rounded-md border border-dashed border-border flex items-center justify-center bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer min-h-[100px] overflow-hidden relative group"
                      onClick={() =>
                        document.getElementById("end-frame-upload")?.click()
                      }
                    >
                      {(trackItem.metadata as any)?.endImage ? (
                        <img
                          src={(trackItem.metadata as any)?.endImage}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Select End Frame
                        </span>
                      )}
                      <input
                        id="end-frame-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = URL.createObjectURL(file);
                            dispatch(EDIT_OBJECT, {
                              payload: {
                                [trackItem.id]: {
                                  metadata: {
                                    ...trackItem.metadata,
                                    endImage: url,
                                  },
                                },
                              },
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Prompt Section */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Prompt
                </Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[100px] resize-none text-xs"
                  placeholder="Describe the video..."
                />
              </div>

              {/* Regenerate Button */}
              <Button className="w-full gap-2">
                <RefreshCcw size={16} />
                Regenerate
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="properties" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-2 px-4 py-4">
              {components
                .filter((comp) => showAll || comp.key === type)
                .map((comp) => (
                  <React.Fragment key={comp.key}>
                    {comp.component}
                  </React.Fragment>
                ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BasicVideo;
