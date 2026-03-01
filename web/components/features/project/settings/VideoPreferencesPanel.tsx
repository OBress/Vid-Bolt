'use client';

/**
 * VideoPreferencesPanel
 * ============================================================================
 * Per-video creative direction overrides panel.
 * Shown during Step 1 of video creation, allowing users to customize
 * settings that override the channel-level defaults for this specific video.
 *
 * Only fields that are set will override — unset fields inherit channel defaults.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, Palette, Layers, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPaletteEditor } from '@/components/features/project/settings/ColorPaletteEditor';
import type { VideoCreativeOverrides } from '@/lib/types/closed-loop';
import type { LoraConfig } from '@/types/settings';

interface VideoPreferencesPanelProps {
  overrides: VideoCreativeOverrides | undefined;
  onChange: (overrides: VideoCreativeOverrides) => void;
  /** Available LoRAs from channel settings */
  availableLoras?: LoraConfig[];
  /** Channel default LoRA name (for display) */
  channelDefaultLora?: string;
}

export function VideoPreferencesPanel({
  overrides,
  onChange,
  availableLoras = [],
  channelDefaultLora,
}: VideoPreferencesPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (partial: Partial<NonNullable<VideoCreativeOverrides>>) => {
    onChange({ ...overrides, ...partial });
  };

  const hasOverrides = overrides && Object.keys(overrides).some(
    (k) => overrides[k as keyof NonNullable<VideoCreativeOverrides>] !== undefined,
  );

  return (
    <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="text-orange-500 w-5 h-5" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
              Video Creative Direction
            </CardTitle>
            {hasOverrides && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">
                Customized
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-500" />
          )}
        </div>
        <p className="text-[10px] text-neutral-600 mt-1">
          Override channel defaults for this specific video. Leave blank to use channel settings.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 border-t border-neutral-800/50 pt-5">
          {/* Video Creative Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neutral-500" />
              <Label className="text-xs text-neutral-400 uppercase font-bold">
                Video-Specific Direction
              </Label>
            </div>
            <Textarea
              value={overrides?.videoCreativePrompt || ''}
              onChange={(e) =>
                update({
                  videoCreativePrompt: e.target.value || undefined,
                })
              }
              placeholder="Add creative direction specific to this video that supplements the channel prompt..."
              className="bg-black/40 border-neutral-800 text-sm min-h-[80px] resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Visual Style Override */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-neutral-500" />
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Visual Style Override
                </Label>
              </div>
              <Textarea
                value={overrides?.visualStyle || ''}
                onChange={(e) =>
                  update({ visualStyle: e.target.value || undefined })
                }
                placeholder="Override visual style for this video..."
                className="bg-black/40 border-neutral-800 text-sm min-h-[60px] resize-none"
              />

              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Lighting Mood Override
                </Label>
                <Textarea
                  value={overrides?.lightingMood || ''}
                  onChange={(e) =>
                    update({ lightingMood: e.target.value || undefined })
                  }
                  placeholder="Override lighting mood..."
                  className="bg-black/40 border-neutral-800 text-sm min-h-[50px] resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-neutral-400 uppercase font-bold">
                  Color Palette Override
                </Label>
                <ColorPaletteEditor
                  colors={overrides?.colorPalette || []}
                  onChange={(colors) =>
                    update({
                      colorPalette: colors.length > 0 ? colors : undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* LoRA & MG Override */}
            <div className="space-y-4">
              {/* LoRA selection override */}
              {availableLoras.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-neutral-500" />
                    <Label className="text-xs text-neutral-400 uppercase font-bold">
                      LoRA Override
                    </Label>
                  </div>
                  <Select
                    value={overrides?.loraName || '__channel_default__'}
                    onValueChange={(val) =>
                      update({
                        loraName:
                          val === '__channel_default__' ? undefined : val === '__none__' ? '' : val,
                      })
                    }
                  >
                    <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-neutral-800">
                      <SelectItem value="__channel_default__">
                        Channel Default{channelDefaultLora ? ` (${channelDefaultLora})` : ''}
                      </SelectItem>
                      <SelectItem value="__none__">No LoRA</SelectItem>
                      {availableLoras.map((l) => (
                        <SelectItem key={l.name} value={l.name}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* LoRA weight slider when overriding */}
                  {overrides?.loraName && overrides.loraName !== '' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] text-neutral-500 uppercase">
                          LoRA Weight
                        </Label>
                        <span className="text-xs text-orange-400 font-mono">
                          {(overrides.loraWeight ?? 0.8).toFixed(2)}
                        </span>
                      </div>
                      <Slider
                        value={[overrides.loraWeight ?? 0.8]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={([val]) =>
                          update({ loraWeight: val })
                        }
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* MG Theme Override */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-neutral-500" />
                  <Label className="text-xs text-neutral-400 uppercase font-bold">
                    MG Theme Override
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={overrides?.mgThemeOverride?.theme || '__default__'}
                    onValueChange={(val) =>
                      update({
                        mgThemeOverride: {
                          ...overrides?.mgThemeOverride,
                          theme:
                            val === '__default__'
                              ? undefined
                              : (val as 'dark' | 'light' | 'colorful' | 'minimal'),
                        },
                      })
                    }
                  >
                    <SelectTrigger className="bg-black/40 border-neutral-800 h-9 text-xs">
                      <SelectValue placeholder="Theme" />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-neutral-800">
                      <SelectItem value="__default__">Default</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="colorful">Colorful</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={overrides?.mgThemeOverride?.animationStyle || '__default__'}
                    onValueChange={(val) =>
                      update({
                        mgThemeOverride: {
                          ...overrides?.mgThemeOverride,
                          animationStyle:
                            val === '__default__'
                              ? undefined
                              : (val as 'smooth' | 'bouncy' | 'snappy' | 'gentle'),
                        },
                      })
                    }
                  >
                    <SelectTrigger className="bg-black/40 border-neutral-800 h-9 text-xs">
                      <SelectValue placeholder="Animation" />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-900 border-neutral-800">
                      <SelectItem value="__default__">Default</SelectItem>
                      <SelectItem value="smooth">Smooth</SelectItem>
                      <SelectItem value="bouncy">Bouncy</SelectItem>
                      <SelectItem value="snappy">Snappy</SelectItem>
                      <SelectItem value="gentle">Gentle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
