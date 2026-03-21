"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  Settings2,
  ScrollText,
  Clock,
  Brain,
  ChevronRight,
  Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { SaveStatusIndicator } from "@/components/ui/SaveStatusIndicator";
import { ModelSelector } from "./ModelSelector";
import {
  normalizeResearchDepth,
  parseLineList,
  parseWordReplacementMap,
  stringifyLineList,
  stringifyWordReplacementMap,
} from "@/lib/script-config";
import type {
  ScriptPOV,
  ScriptGender,
  ScriptGenre,
  ResearchDepth,
} from "@/types/settings";

type View = "main" | "advanced";
type ModelSelectorType = "writing" | "review" | null;

export function ScriptTab({ projectId }: { projectId?: string }) {
  const [view, setView] = useState<View>("main");
  const [activeModelSelector, setActiveModelSelector] =
    useState<ModelSelectorType>(null);
  const { settings, loading, saveStatus, updateSettings } =
    useProjectSettings(projectId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
          <div className="h-64 bg-neutral-900/40 border border-neutral-800 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  // Provide defaults for existing projects that don't have script settings yet
  const script = settings.script || {
    pov: "1st" as const,
    protagonistGender: "any" as const,
    genre: "documentary" as const,
    researchDepth: "full" as const,
    openrouterModel: "google/gemini-3-flash-preview",
    qualityReviewModel: "google/gemini-3-pro-preview",
    contentNiche: "entertainment",
    favoriteModels: [],
  };
  const normalizedResearchDepth = normalizeResearchDepth(script.researchDepth);
  const advanced = script.advanced || {};
  const systemPrompts = advanced.systemPrompts || {};
  const bannedPhrasesText = stringifyLineList(advanced.bannedPhrases);
  const wordReplacementsText = stringifyWordReplacementMap(
    advanced.wordReplacements,
  );

  const updateAdvancedSettings = (
    partial: NonNullable<typeof script.advanced>,
  ) => {
    updateSettings({
      script: {
        ...script,
        advanced: {
          ...(script.advanced || {}),
          ...partial,
        },
      },
    });
  };

  // Favorite models (stored in script settings)
  const favoriteModels = script.favoriteModels || [];

  const handleToggleFavorite = (modelId: string) => {
    const newFavorites = favoriteModels.includes(modelId)
      ? favoriteModels.filter((id: string) => id !== modelId)
      : [...favoriteModels, modelId];
    updateSettings({
      script: { ...script, favoriteModels: newFavorites },
    });
  };

  // Get display name for selected model
  const getModelDisplayName = (modelId: string) => {
    const parts = modelId.split("/");
    const name = parts[1] || parts[0];
    return name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // Advanced Settings View
  if (view === "advanced") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView("main")}
          className="text-neutral-400 hover:text-white gap-2 px-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Script Settings
        </Button>

        <div className="flex justify-end">
          <SaveStatusIndicator status={saveStatus} />
        </div>

        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings2 className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Advanced Script Settings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tone/Style */}
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Tone & Style
              </Label>
              <Textarea
                placeholder="e.g., 'Professional but conversational, with a touch of humor. Avoid jargon.'"
                className="bg-black/40 border-neutral-800 min-h-[80px]"
                value={script.toneStyle || ""}
                onChange={(e) =>
                  updateSettings({
                    script: {
                      ...script,
                      toneStyle: e.target.value || undefined,
                    },
                  })
                }
              />
              <p className="text-[10px] text-neutral-500 italic">
                Describe the overall tone and style you want for your scripts.
              </p>
            </div>

            {/* Target Audience */}
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Target Audience
              </Label>
              <Textarea
                placeholder="e.g., 'Young professionals aged 25-35 interested in personal finance and self-improvement.'"
                className="bg-black/40 border-neutral-800 min-h-[80px]"
                value={script.targetAudience || ""}
                onChange={(e) =>
                  updateSettings({
                    script: {
                      ...script,
                      targetAudience: e.target.value || undefined,
                    },
                  })
                }
              />
              <p className="text-[10px] text-neutral-500 italic">
                Describe your target audience to help tailor the content.
              </p>
            </div>

            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Writing Prompt Overrides
              </Label>
              <p className="text-[10px] text-neutral-500 italic">
                These layer on top of the built-in genre preset. Leave blank to
                use the default behavior.
              </p>
              <div className="grid grid-cols-1 gap-4">
                {(
                  [
                    {
                      key: "expansion",
                      label: "Expansion Prompt",
                      placeholder:
                        "Add voice, pacing, or structure guidance for section writing.",
                    },
                    {
                      key: "quality",
                      label: "Quality Review Prompt",
                      placeholder:
                        "Add extra scoring criteria or quality standards.",
                    },
                    {
                      key: "rewrite",
                      label: "Rewrite Prompt",
                      placeholder:
                        "Guide how low-scoring sections should be rewritten.",
                    },
                    {
                      key: "transition",
                      label: "Transition Prompt",
                      placeholder:
                        "Set the style for smoothing transitions between sections.",
                    },
                  ] as const
                ).map((promptField) => (
                  <div key={promptField.key} className="space-y-2">
                    <Label className="text-[11px] text-neutral-400 uppercase font-bold tracking-wider">
                      {promptField.label}
                    </Label>
                    <Textarea
                      placeholder={promptField.placeholder}
                      className="bg-black/40 border-neutral-800 min-h-[88px]"
                      value={systemPrompts[promptField.key] || ""}
                      onChange={(e) =>
                        updateAdvancedSettings({
                          ...advanced,
                          systemPrompts: {
                            ...systemPrompts,
                            [promptField.key]: e.target.value || undefined,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Custom Banned Phrases
              </Label>
              <Textarea
                placeholder={`One per line, for example:\nLet's dive in\nNeedless to say`}
                className="bg-black/40 border-neutral-800 min-h-[96px] font-mono text-xs"
                value={bannedPhrasesText}
                onChange={(e) =>
                  updateAdvancedSettings({
                    ...advanced,
                    bannedPhrases: parseLineList(e.target.value),
                  })
                }
              />
              <p className="text-[10px] text-neutral-500 italic">
                Applied on top of the active genre defaults during script
                generation and validation.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Word Replacements
              </Label>
              <Textarea
                placeholder={`One rule per line, for example:\ntransformative => major, meaningful, significant\noptimize => improve, tighten, refine`}
                className="bg-black/40 border-neutral-800 min-h-[120px] font-mono text-xs"
                value={wordReplacementsText}
                onChange={(e) =>
                  updateAdvancedSettings({
                    ...advanced,
                    wordReplacements: parseWordReplacementMap(e.target.value),
                  })
                }
              />
              <p className="text-[10px] text-neutral-500 italic">
                Format each rule as `word =&gt; alternative 1, alternative 2`.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const researchOptions = [
    { value: "off", label: "Off", desc: "No research" },
    { value: "full", label: "Full", desc: "Comprehensive" },
  ] as const;

  const updateResearchDepth = (value: ResearchDepth) => {
    updateSettings({
      script: {
        ...script,
        researchDepth: value,
      },
    });
  };

  // Main Settings View
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      {/* Save Status */}
      <div className="flex justify-end">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Core Configuration */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ScrollText className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Narration Style
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Point of View */}
            <div className="space-y-3">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Point of View
              </Label>
              <div className="flex flex-wrap gap-2">
                {(["1st", "2nd", "3rd"] as ScriptPOV[]).map((option) => (
                  <button
                    key={option}
                    onClick={() =>
                      updateSettings({
                        script: { ...script, pov: option },
                      })
                    }
                    className={cn(
                      "px-5 py-2 rounded-xl text-sm font-bold transition-all border",
                      script.pov === option
                        ? "bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)] scale-105"
                        : "bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                    )}
                  >
                    {option} Person
                  </button>
                ))}
              </div>
            </div>

            {/* Protagonist Gender */}
            <div className="space-y-3">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Narrator Gender
              </Label>
              <div className="flex flex-wrap gap-2">
                {(["male", "female", "any"] as ScriptGender[]).map((option) => (
                  <button
                    key={option}
                    onClick={() =>
                      updateSettings({
                        script: { ...script, protagonistGender: option },
                      })
                    }
                    className={cn(
                      "px-5 py-2 rounded-xl text-sm font-bold transition-all border capitalize",
                      script.protagonistGender === option
                        ? "bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)] scale-105"
                        : "bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Genre */}
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Default Genre
              </Label>
              <Select
                value={script.genre}
                onValueChange={(val) =>
                  updateSettings({
                    script: { ...script, genre: val as ScriptGenre },
                  })
                }
              >
                <SelectTrigger className="bg-black/40 border-neutral-800">
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="narrative_fiction">
                    Narrative Fiction
                  </SelectItem>
                  <SelectItem value="historical_fiction">
                    Historical Fiction
                  </SelectItem>
                  <SelectItem value="opinion_essay">Opinion Essay</SelectItem>
                  <SelectItem value="tutorial">Tutorial</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* AI & Research Configuration */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Brain className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                AI Configuration
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Writing Model */}
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Writing Model
              </Label>
              <p className="text-[10px] text-neutral-500 -mt-1 mb-2">
                Used for research, spine generation, and script expansion
              </p>
              <button
                onClick={() => setActiveModelSelector("writing")}
                className="w-full p-3 rounded-xl bg-black/40 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/60 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:border-orange-500/50 transition-colors">
                      <Brain className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {getModelDisplayName(script.openrouterModel)}
                        </span>
                        {favoriteModels.includes(script.openrouterModel) && (
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {script.openrouterModel}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-orange-500 transition-colors" />
                </div>
              </button>
            </div>

            {/* Quality Review Model */}
            <div className="space-y-2">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Quality Review Model
              </Label>
              <p className="text-[10px] text-neutral-500 -mt-1 mb-2">
                Used for scoring and reviewing generated scripts
              </p>
              <button
                onClick={() => setActiveModelSelector("review")}
                className="w-full p-3 rounded-xl bg-black/40 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/60 transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:border-purple-500/50 transition-colors">
                      <Star className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {getModelDisplayName(
                            script.qualityReviewModel ||
                              "google/gemini-3-pro-preview"
                          )}
                        </span>
                        {favoriteModels.includes(
                          script.qualityReviewModel || ""
                        ) && (
                          <Star className="w-3 h-3 text-yellow-500 fill-current" />
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {script.qualityReviewModel ||
                          "google/gemini-3-pro-preview"}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-purple-500 transition-colors" />
                </div>
              </button>
            </div>

            {/* Model Selector Dialog */}
            <ModelSelector
              open={activeModelSelector !== null}
              onOpenChange={(open) => {
                if (!open) setActiveModelSelector(null);
              }}
              selectedModel={
                activeModelSelector === "review"
                  ? script.qualityReviewModel || "google/gemini-3-pro-preview"
                  : script.openrouterModel
              }
              onSelectModel={(modelId) => {
                if (activeModelSelector === "review") {
                  updateSettings({
                    script: { ...script, qualityReviewModel: modelId },
                  });
                } else {
                  updateSettings({
                    script: { ...script, openrouterModel: modelId },
                  });
                }
              }}
              favoriteModels={favoriteModels}
              onToggleFavorite={handleToggleFavorite}
            />
          </CardContent>
        </Card>
      </div>

      {/* Research Depth - Full Width Single Row */}
      <div className="space-y-2">
        <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
          Research Depth
        </Label>
        <div className="grid grid-cols-4 gap-2">
          {researchOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => updateResearchDepth(option.value as ResearchDepth)}
              className={cn(
                "p-3 rounded-xl text-center transition-all border",
                normalizedResearchDepth === option.value
                  ? "bg-orange-500/20 border-orange-500/50 text-white"
                  : "bg-neutral-900/40 border-neutral-800 text-neutral-500 hover:border-neutral-700"
              )}
            >
              <div className="text-sm font-bold">{option.label}</div>
              <div className="text-[10px] opacity-70">{option.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Duration and Advanced Settings - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Default Duration */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Clock className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Default Duration
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-500">Range for new videos</p>
                <div className="px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-500 font-mono">
                  {settings.basic_info?.videoDurationRange?.[0] || 5} -{" "}
                  {settings.basic_info?.videoDurationRange?.[1] || 15} MIN
                </div>
              </div>
              <Slider
                value={settings.basic_info?.videoDurationRange || [5, 15]}
                min={1}
                max={60}
                step={1}
                minStepsBetweenThumbs={1}
                onValueChange={(val) =>
                  updateSettings({
                    basic_info: {
                      ...settings.basic_info,
                      videoDurationRange: val,
                    },
                  })
                }
                className="py-2"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 px-1 select-none">
                <span>1m</span>
                <span>15m</span>
                <span>30m</span>
                <span>45m</span>
                <span>60m</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings Link */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardContent className="pt-6 h-full flex items-center">
            <button
              onClick={() => setView("advanced")}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-neutral-800 hover:border-orange-500/50 hover:bg-neutral-900/60 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:bg-orange-500 group-hover:border-orange-400 group-hover:text-white transition-all">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
                    Advanced Settings
                  </div>
                  <div className="text-xs text-neutral-500">
                    Tone, audience, and fine-tune parameters
                  </div>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-neutral-700 rotate-180 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
