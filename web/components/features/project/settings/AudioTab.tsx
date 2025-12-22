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
import { Mic2, Play, Settings2, Sparkles, Music, Speaker } from "lucide-react";

import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";

export function AudioTab({ projectId }: { projectId?: string }) {
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <Tabs defaultValue="voice" className="w-full">
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm shadow-xl overflow-hidden">
          <CardHeader className="p-0 border-b border-neutral-800">
            <TabsList className="bg-transparent h-14 p-0 grid grid-cols-2 w-full rounded-none">
              <TabsTrigger
                value="voice"
                className="data-[state=active]:bg-neutral-800/40 data-[state=active]:text-orange-500 rounded-none bg-transparent px-6 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-all gap-3 border-r border-neutral-800"
              >
                <Speaker className="w-4 h-4" />
                Voice
              </TabsTrigger>
              <TabsTrigger
                value="background"
                className="data-[state=active]:bg-neutral-800/40 data-[state=active]:text-orange-500 rounded-none bg-transparent px-6 py-2 text-[10px] md:text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-all gap-3"
              >
                <Music className="w-4 h-4" />
                Background Audio
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-0">
            <TabsContent
              value="voice"
              className="mt-0 focus-visible:outline-none w-full"
            >
              <div className="p-6 md:p-8 space-y-8 w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
                  {/* Model Selection */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                        Voice Provider
                      </Label>
                      <Select
                        value={voice.provider}
                        onValueChange={(val: any) =>
                          handleVoiceUpdate({ provider: val })
                        }
                      >
                        <SelectTrigger className="bg-black/40 border-neutral-800 h-12 focus:border-orange-500/50 transition-colors">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800">
                          {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                <p.icon className="w-3.5 h-3.5" />
                                {p.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                        Voice Model
                      </Label>
                      <Select
                        value={voice.model}
                        onValueChange={(val) =>
                          handleVoiceUpdate({ model: val })
                        }
                      >
                        <SelectTrigger className="bg-black/40 border-neutral-800 h-12 focus:border-orange-500/50 transition-colors">
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

                    <div className="space-y-3">
                      <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                        Voice Name
                      </Label>
                      <Select
                        value={voice.voiceName}
                        onValueChange={(val) =>
                          handleVoiceUpdate({ voiceName: val })
                        }
                      >
                        <SelectTrigger className="bg-black/40 border-neutral-800 h-12 focus:border-orange-500/50 transition-colors">
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

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-neutral-800/50 hover:border-orange-500/20 transition-all group">
                      <div className="space-y-1">
                        <Label className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
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
                        className="data-[state=checked]:bg-orange-500"
                      />
                    </div>
                  </div>

                  {/* Voice Parameters */}
                  <div className="space-y-8">
                    {[
                      {
                        label: "Stability",
                        key: "stability",
                        max: 100,
                        step: 1,
                        val: voice.stability,
                        suffix: "%",
                      },
                      {
                        label: "Similarity Boost",
                        key: "similarityBoost",
                        max: 100,
                        step: 1,
                        val: voice.similarityBoost,
                        suffix: "%",
                      },
                      {
                        label: "Speaking Speed",
                        key: "speakingSpeed",
                        max: 200,
                        step: 5,
                        val: voice.speakingSpeed,
                        suffix: "x",
                        format: (v: number) => (v / 100).toFixed(1),
                      },
                      {
                        label: "Voice Style",
                        key: "voiceStyle",
                        max: 100,
                        step: 1,
                        val: voice.voiceStyle,
                        format: (v: number) =>
                          `${
                            v > 75
                              ? "Exaggerated"
                              : v > 40
                              ? "Natural"
                              : "Subtle"
                          } (${v}%)`,
                      },
                    ].map((param) => (
                      <div key={param.key} className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">
                            {param.label}
                          </Label>
                          <span className="text-xs text-orange-500 font-mono font-bold px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
                            {param.format
                              ? param.format(param.val)
                              : `${param.val}${param.suffix}`}
                          </span>
                        </div>
                        <Slider
                          value={[param.val]}
                          onValueChange={([v]) =>
                            handleVoiceUpdate({ [param.key]: v })
                          }
                          max={param.max}
                          step={param.step}
                          className="[&_[role=slider]]:bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voice Testing */}
                <div className="pt-10 border-t border-neutral-800 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-xs text-neutral-400 uppercase font-black tracking-widest">
                        Preview Script
                      </Label>
                      <p className="text-[10px] text-neutral-500 italic">
                        Preview how your current settings will sound.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-orange-500 border-none text-white hover:bg-orange-600 shadow-[0_4px_15px_rgba(249,115,22,0.4)] transition-all gap-2 h-10 px-8 font-bold uppercase tracking-tighter"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      GENERATE TEST AUDIO
                    </Button>
                  </div>
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    className="bg-black/40 border-neutral-800 min-h-[140px] resize-none focus:ring-1 focus:ring-orange-500/20 focus:border-orange-500/40 text-white rounded-2xl transition-all p-6 text-sm leading-relaxed"
                    placeholder="Enter text to preview..."
                  />
                  <div className="h-16 w-full bg-black/40 rounded-2xl border border-neutral-800 flex items-center px-8 gap-8 shadow-inner">
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 shadow-inner">
                      <Speaker className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="flex-1 h-2 bg-neutral-800/50 rounded-full overflow-hidden">
                      <div className="h-full w-1/3 bg-gradient-to-r from-orange-600 to-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]" />
                    </div>
                    <span className="text-xs font-mono font-bold text-neutral-400 tracking-widest bg-neutral-900/50 px-3 py-1 rounded-lg border border-neutral-800">
                      0:00 / 0:05
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="background"
              className="mt-0 focus-visible:outline-none w-full"
            >
              <div className="p-12 min-h-[500px] flex items-center justify-center">
                <div className="text-center space-y-6 max-w-sm">
                  <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-neutral-800 to-black border border-neutral-700/50 shadow-2xl flex items-center justify-center mx-auto mb-4 animate-in zoom-in duration-500">
                    <Music className="w-10 h-10 text-neutral-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                      Background Symphony
                    </h3>
                    <p className="text-neutral-500 text-sm leading-relaxed">
                      We're building an intelligent background audio engine.
                      Soon you'll be able to generate context-aware music,
                      ambient layers, and procedural sound effects.
                    </p>
                  </div>
                  <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-orange-500/5 border border-orange-500/20 text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                    Coming Soon
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
