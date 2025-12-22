"use client";

import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Mic2, Play, AudioLines, Settings2, Sparkles } from "lucide-react";

import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";

export function VoiceTab({ projectId }: { projectId?: string }) {
  const { settings, loading, saveStatus, updateSettings } =
    useProjectSettings(projectId);
  const [testText, setTestText] = useState(
    "Hello! This is a sample text to test the voice synchronization and quality. I hope you like how I sound!"
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-[400px] bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const { voice } = settings;

  const providers = [
    { id: "elevenlabs", label: "ElevenLabs", icon: Sparkles },
    { id: "genai", label: "GenAI", icon: Settings2 },
    { id: "inworld", label: "Inworld TTS", icon: Mic2 },
  ];

  const handleVoiceUpdate = (partial: Partial<typeof voice>) => {
    updateSettings({ voice: { ...voice, ...partial } });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AudioLines className="text-orange-500 w-5 h-5" />
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
              Voice Provider & Configuration
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs
            value={voice.provider}
            onValueChange={(val: any) => handleVoiceUpdate({ provider: val })}
            className="w-full"
          >
            <div className="px-6 border-b border-neutral-800">
              <TabsList className="bg-transparent h-12 p-0 grid grid-cols-3 w-full border-b-0">
                {providers.map((p) => (
                  <TabsTrigger
                    key={p.id}
                    value={p.id}
                    className="data-[state=active]:bg-transparent data-[state=active]:text-orange-500 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none bg-transparent px-0 h-full text-[10px] md:text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-all gap-2 border-b-2 border-transparent"
                  >
                    <p.icon className="w-3.5 h-3.5" />
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {providers.map((p) => (
              <TabsContent
                key={p.id}
                value={p.id}
                className="p-6 mt-0 space-y-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Model Selection */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                        Voice Model
                      </Label>
                      <Select
                        value={voice.model}
                        onValueChange={(val) =>
                          handleVoiceUpdate({ model: val })
                        }
                      >
                        <SelectTrigger className="bg-black/40 border-neutral-800">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800">
                          <SelectItem value="multilingual-v2">
                            Multilingual v2
                          </SelectItem>
                          <SelectItem value="v1">Standard v1</SelectItem>
                          <SelectItem value="turbo-v2">Turbo v2.5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                        Voice Name
                      </Label>
                      <Select
                        value={voice.voiceName}
                        onValueChange={(val) =>
                          handleVoiceUpdate({ voiceName: val })
                        }
                      >
                        <SelectTrigger className="bg-black/40 border-neutral-800">
                          <SelectValue placeholder="Select voice" />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800">
                          <SelectItem value="adam">
                            Adam (Deep/Narrative)
                          </SelectItem>
                          <SelectItem value="bella">
                            Bella (Soft/Whisper)
                          </SelectItem>
                          <SelectItem value="charlie">
                            Charlie (Energetic)
                          </SelectItem>
                          <SelectItem value="rachel">
                            Rachel (Professional)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-neutral-800/50">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium text-white">
                          Speaker Boost
                        </Label>
                        <p className="text-[10px] text-neutral-500 italic">
                          Enhance clarity and presence of the voice.
                        </p>
                      </div>
                      <Switch
                        checked={voice.speakerBoost}
                        onCheckedChange={(checked) =>
                          handleVoiceUpdate({ speakerBoost: checked })
                        }
                      />
                    </div>
                  </div>

                  {/* Voice Parameters */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                          Stability
                        </Label>
                        <span className="text-[10px] text-orange-500 font-mono">
                          {voice.stability}%
                        </span>
                      </div>
                      <Slider
                        value={[voice.stability]}
                        onValueChange={([val]) =>
                          handleVoiceUpdate({ stability: val })
                        }
                        max={100}
                        step={1}
                        className="[&_[role=slider]]:bg-orange-500"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                          Similarity Boost
                        </Label>
                        <span className="text-[10px] text-orange-500 font-mono">
                          {voice.similarityBoost}%
                        </span>
                      </div>
                      <Slider
                        value={[voice.similarityBoost]}
                        onValueChange={([val]) =>
                          handleVoiceUpdate({ similarityBoost: val })
                        }
                        max={100}
                        step={1}
                        className="[&_[role=slider]]:bg-orange-500"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                          Speaking Speed
                        </Label>
                        <span className="text-[10px] text-orange-500 font-mono">
                          {(voice.speakingSpeed / 100).toFixed(1)}x
                        </span>
                      </div>
                      <Slider
                        value={[voice.speakingSpeed]}
                        onValueChange={([val]) =>
                          handleVoiceUpdate({ speakingSpeed: val })
                        }
                        max={200}
                        step={5}
                        className="[&_[role=slider]]:bg-orange-500"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                          Voice Style
                        </Label>
                        <span className="text-[10px] text-orange-500 font-mono">
                          {voice.voiceStyle > 75
                            ? "Exaggerated"
                            : voice.voiceStyle > 40
                            ? "Natural"
                            : "Subtle"}{" "}
                          ({voice.voiceStyle}%)
                        </span>
                      </div>
                      <Slider
                        value={[voice.voiceStyle]}
                        onValueChange={([val]) =>
                          handleVoiceUpdate({ voiceStyle: val })
                        }
                        max={100}
                        step={1}
                        className="[&_[role=slider]]:bg-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Voice Testing */}
                <div className="pt-6 border-t border-neutral-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-neutral-400 uppercase font-bold">
                      Preview Script
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-orange-500 border-none text-white hover:bg-orange-600 transition-colors gap-2 h-8 px-4"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      GENERATE TEST AUDIO
                    </Button>
                  </div>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    className="bg-black/60 border-neutral-800 min-h-[100px] resize-none focus:ring-1 focus:ring-orange-500/20 text-white"
                    placeholder="Enter text to preview..."
                  />
                  <div className="h-12 w-full bg-black/40 rounded-lg border border-neutral-800 flex items-center px-4 gap-4">
                    <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-orange-500/50" />
                    </div>
                    <span className="text-[10px] font-mono text-neutral-500">
                      0:00 / 0:05
                    </span>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
