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
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  MonitorPlay,
  Image as ImageIcon,
  Video,
  Ratio,
  Palette,
  Sparkles,
  Gauge,
  Layers,
  Wand2,
} from "lucide-react";
import { ColorPaletteEditor } from "./ColorPaletteEditor";
import { LoraUploadCard } from "./LoraUploadCard";
import type {
  CreativeDirectionDefaults,
  MgThemeDefaults,
  PacingPreset,
} from "@/types/settings";

// ============================================================================
// DEFAULT CREATIVE DIRECTION
// ============================================================================

const DEFAULT_CREATIVE_DIRECTION: CreativeDirectionDefaults = {
  visualStyle: "cinematic, documentary",
  colorPalette: [],
  lightingMood: "",
  qualityAnchors: [],
  imageConstraints: [],
  loras: [],
  mgTheme: {
    theme: "dark",
    colorPalette: [],
    animationStyle: "smooth",
  },
  mediaWeighting: {
    stockFootage: 0.3,
    aiVideo: 0.4,
    motionGraphics: 0.2,
    aiImageStatic: 0.1,
  },
  pacingPreset: "documentary",
  masterCreativePrompt: "",
};

// ============================================================================
// COMPONENT
// ============================================================================

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
  const cd: CreativeDirectionDefaults =
    visuals.creativeDirection || DEFAULT_CREATIVE_DIRECTION;

  // Helper to update creative direction
  const updateCD = (partial: Partial<CreativeDirectionDefaults>) => {
    updateSettings({
      visuals: {
        ...visuals,
        creativeDirection: { ...cd, ...partial },
      },
    });
  };

  // Helper to update MG theme
  const updateMgTheme = (partial: Partial<MgThemeDefaults>) => {
    updateCD({ mgTheme: { ...cd.mgTheme, ...partial } });
  };

  // Constrained media weight handler — always sums to 100%
  const MEDIA_KEYS = ['stockFootage', 'aiVideo', 'motionGraphics', 'aiImageStatic'] as const;
  const handleMediaWeightChange = (
    changedKey: (typeof MEDIA_KEYS)[number],
    newValue: number,
  ) => {
    const clamped = Math.min(1, Math.max(0, newValue));
    const otherKeys = MEDIA_KEYS.filter((k) => k !== changedKey);
    const remaining = Math.max(0, 1 - clamped);
    const otherSum = otherKeys.reduce(
      (sum, k) => sum + cd.mediaWeighting[k],
      0,
    );

    const updated = { ...cd.mediaWeighting, [changedKey]: clamped };

    if (otherSum > 0) {
      // Proportional redistribution
      const scale = remaining / otherSum;
      otherKeys.forEach((k) => {
        updated[k] = Math.round(cd.mediaWeighting[k] * scale * 20) / 20; // snap to 0.05
      });
    } else {
      // All others are 0 — distribute evenly
      const even = Math.round((remaining / otherKeys.length) * 20) / 20;
      otherKeys.forEach((k) => {
        updated[k] = even;
      });
    }

    // Fix rounding drift so total = 1.0 exactly
    const total = MEDIA_KEYS.reduce((s, k) => s + updated[k], 0);
    if (Math.abs(total - 1) > 0.001) {
      const largest = otherKeys.reduce((a, b) =>
        updated[a] >= updated[b] ? a : b,
      );
      updated[largest] = Math.round((updated[largest] + (1 - total)) * 100) / 100;
    }

    updateCD({ mediaWeighting: updated });
  };

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
                  <SelectItem value="local-z-image">
                    Z-Image Turbo (Local GPU)
                  </SelectItem>
                  <SelectItem value="flux" disabled>
                    Flux.1 [dev] — Premium (Coming Soon)
                  </SelectItem>
                  <SelectItem value="sdxl" disabled>Stable Diffusion XL — Premium (Coming Soon)</SelectItem>
                  <SelectItem value="midjourney" disabled>
                    Midjourney v6.1 — Premium (Coming Soon)
                  </SelectItem>
                  <SelectItem value="dalle3" disabled>DALL-E 3 — Premium (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Generates keyframe images using your local GPU API.
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
                  <SelectItem value="local-ltx2">
                    LTX-2 19B (Local GPU)
                  </SelectItem>
                  <SelectItem value="luma" disabled>Luma Dream Machine — Premium (Coming Soon)</SelectItem>
                  <SelectItem value="runway" disabled>Runway Gen-3 Alpha — Premium (Coming Soon)</SelectItem>
                  <SelectItem value="kling" disabled>Kling AI (Pro) — Premium (Coming Soon)</SelectItem>
                  <SelectItem value="pika" disabled>Pika 1.5 — Premium (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Generates video clips using your local GPU API.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-neutral-500" />
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Image Editing Model
                </Label>
              </div>
              <Select
                value={visuals.imageEditModel}
                onValueChange={(val) =>
                  updateSettings({ visuals: { ...visuals, imageEditModel: val } })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800 h-11">
                  <SelectValue placeholder="Select image editing model" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="local-qwen-edit">
                    Qwen Image Edit (Local GPU)
                  </SelectItem>
                  <SelectItem value="replicate-qwen-edit" disabled>
                    Qwen Image Edit — Premium (Coming Soon)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Edits generated images for GCM consistency using your local GPU API.
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
                  <SelectItem value="16-9">16:9 (YouTube)</SelectItem>
                  <SelectItem value="9-16">9:16 (TikTok/Shorts)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Sets the default aspect ratio for all generated video content.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* CREATIVE DIRECTION */}
      {/* ================================================================== */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          Creative Direction
        </h3>
        <p className="text-[10px] text-neutral-600">
          These defaults apply to all videos in this channel. Override per-video in Step 1.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual Style & Palette */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Palette className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Visual Style
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Style Description
              </Label>
              <Textarea
                value={cd.visualStyle}
                onChange={(e) => updateCD({ visualStyle: e.target.value })}
                placeholder="cinematic, documentary, warm tones"
                className="bg-black/40 border-neutral-800 text-sm min-h-[80px] resize-none"
              />
              <p className="text-[10px] text-neutral-500 italic">
                Describes the overall aesthetic applied to all generated visuals.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Lighting / Mood
              </Label>
              <Textarea
                value={cd.lightingMood}
                onChange={(e) => updateCD({ lightingMood: e.target.value })}
                placeholder="warm golden hour, soft backlit, natural daylight"
                className="bg-black/40 border-neutral-800 text-sm min-h-[60px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Color Palette
              </Label>
              <ColorPaletteEditor
                colors={cd.colorPalette}
                onChange={(colors) => updateCD({ colorPalette: colors })}
              />
            </div>
          </CardContent>
        </Card>

        {/* LoRA Management */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Wand2 className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                LoRA Styles
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {projectId && (
              <LoraUploadCard
                loras={cd.loras}
                defaultLoraName={cd.defaultLoraName}
                onLorasChange={(loras) => updateCD({ loras })}
                onDefaultChange={(name) => updateCD({ defaultLoraName: name })}
                projectId={projectId}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Motion Graphics Theme */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Layers className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Motion Graphics Theme
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Theme Mode
                </Label>
                <Select
                  value={cd.mgTheme.theme}
                  onValueChange={(val: MgThemeDefaults["theme"]) =>
                    updateMgTheme({ theme: val })
                  }
                >
                  <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="colorful">Colorful</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Animation Style
                </Label>
                <Select
                  value={cd.mgTheme.animationStyle}
                  onValueChange={(
                    val: MgThemeDefaults["animationStyle"],
                  ) => updateMgTheme({ animationStyle: val })}
                >
                  <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    <SelectItem value="smooth">Smooth</SelectItem>
                    <SelectItem value="bouncy">Bouncy</SelectItem>
                    <SelectItem value="snappy">Snappy</SelectItem>
                    <SelectItem value="gentle">Gentle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Font Family
                </Label>
                <Select
                  value={cd.mgTheme.fontFamily || "Inter"}
                  onValueChange={(val) =>
                    updateMgTheme({ fontFamily: val })
                  }
                >
                  <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    <SelectItem value="Inter">Inter</SelectItem>
                    <SelectItem value="Roboto">Roboto</SelectItem>
                    <SelectItem value="Outfit">Outfit</SelectItem>
                    <SelectItem value="Space Grotesk">Space Grotesk</SelectItem>
                    <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Border Style
                </Label>
                <Select
                  value={cd.mgTheme.borderStyle || "rounded"}
                  onValueChange={(
                    val: "rounded" | "sharp" | "pill",
                  ) => updateMgTheme({ borderStyle: val })}
                >
                  <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    <SelectItem value="rounded">Rounded (12px)</SelectItem>
                    <SelectItem value="sharp">Sharp (0px)</SelectItem>
                    <SelectItem value="pill">Pill (999px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                MG Color Palette
              </Label>
              <ColorPaletteEditor
                colors={cd.mgTheme.colorPalette}
                onChange={(colors) =>
                  updateMgTheme({ colorPalette: colors })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Pacing & Media Weighting */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Gauge className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Pacing & Media Balance
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Pacing Preset
              </Label>
              <Select
                value={cd.pacingPreset}
                onValueChange={(val: PacingPreset) =>
                  updateCD({ pacingPreset: val })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="fast-paced">Fast-Paced</SelectItem>
                  <SelectItem value="cinematic">Cinematic</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-500 italic">
                Controls hook duration, shot frequency, and MG density.
              </p>
            </div>

            {/* Media Weighting sliders */}
            <div className="space-y-3">
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Media Type Balance
              </Label>
              {[
                { key: "stockFootage" as const, label: "Stock Footage", color: "text-blue-400" },
                { key: "aiVideo" as const, label: "AI Video", color: "text-purple-400" },
                { key: "motionGraphics" as const, label: "Motion Graphics", color: "text-green-400" },
                { key: "aiImageStatic" as const, label: "AI Image (Static)", color: "text-yellow-400" },
              ].map(({ key, label, color }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] ${color}`}>{label}</span>
                    <span className="text-xs text-neutral-500 font-mono">
                      {Math.round(cd.mediaWeighting[key] * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[cd.mediaWeighting[key]]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([val]) =>
                      handleMediaWeightChange(key, val)
                    }
                    className="w-full"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
                <span className="text-[10px] text-neutral-500 italic">
                  Target distribution of media types across video shots.
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  Total: {Math.round(MEDIA_KEYS.reduce((s, k) => s + cd.mediaWeighting[k], 0) * 100)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Master Creative Prompt — full width */}
      <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="text-orange-500 w-5 h-5" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
              Master Creative Prompt
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={cd.masterCreativePrompt}
            onChange={(e) =>
              updateCD({ masterCreativePrompt: e.target.value })
            }
            placeholder="Add a channel-wide creative direction that will be injected into every worker prompt. Describe your brand aesthetic, recurring visual motifs, thematic preferences, or any specific instructions that should apply to all videos produced for this channel."
            className="bg-black/40 border-neutral-800 text-sm min-h-[120px] resize-y"
          />
          <p className="text-[10px] text-neutral-500 italic mt-2">
            This prompt is added to every worker in the pipeline — shot planner,
            image generator, video generator, MG designer, and more.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
