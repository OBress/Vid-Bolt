import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonitorPlay, Image as ImageIcon, Video, Ratio } from "lucide-react";

export function VisualsTab({ projectId }: { projectId?: string }) {
  const { settings, loading, saveStatus, updateSettings } =
    useProjectSettings(projectId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-[200px] bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const { visuals, basic_info } = settings;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual Intelligence Models */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <MonitorPlay className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Visual Intelligence Models
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-neutral-500" />
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Image Model
                </Label>
              </div>
              <Select
                value={visuals.imageModel}
                onValueChange={(val) =>
                  updateSettings({ visuals: { ...visuals, imageModel: val } })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800 h-11">
                  <SelectValue placeholder="Select image model" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="flux">
                    Flux.1 [dev] (Ultra Realistic)
                  </SelectItem>
                  <SelectItem value="sdxl">Stable Diffusion XL</SelectItem>
                  <SelectItem value="midjourney">
                    Midjourney v6.1 (API)
                  </SelectItem>
                  <SelectItem value="dalle3">DALL-E 3</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Used for generating background assets and concept art.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-neutral-500" />
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Video Model
                </Label>
              </div>
              <Select
                value={visuals.videoModel}
                onValueChange={(val) =>
                  updateSettings({ visuals: { ...visuals, videoModel: val } })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800 h-11">
                  <SelectValue placeholder="Select video model" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="luma">Luma Dream Machine</SelectItem>
                  <SelectItem value="runway">Runway Gen-3 Alpha</SelectItem>
                  <SelectItem value="kling">Kling AI (Pro)</SelectItem>
                  <SelectItem value="pika">Pika 1.5</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Used for cinematic B-roll and animation generation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Video Format */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Ratio className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Video Format
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Aspect Ratio
              </Label>
              <Select
                value={basic_info.aspectRatio}
                onValueChange={(val) =>
                  updateSettings({
                    basic_info: { ...basic_info, aspectRatio: val },
                  })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800 h-11">
                  <SelectValue placeholder="Select ratio" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="9-16">9:16 (TikTok/Shorts)</SelectItem>
                  <SelectItem value="16-9">16:9 (YouTube)</SelectItem>
                  <SelectItem value="1-1">1:1 (Instagram)</SelectItem>
                  <SelectItem value="4-3">4:3 (Standard)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Sets the default aspect ratio for all generated video content.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
