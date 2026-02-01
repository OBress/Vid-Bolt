"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Image,
  RefreshCw,
  Check,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KeyframeData } from "@/types/video";

interface KeyframeEditPopupProps {
  isOpen: boolean;
  onClose: () => void;
  frameType: "start" | "end";
  keyframeData?: KeyframeData;
  onSave: (data: KeyframeData) => void;
  onRegenerate: (data: KeyframeData) => void;
  isRegenerating?: boolean;
  availableLoras?: string[];
}

/**
 * Popup dialog for editing keyframe generation parameters
 * Allows users to configure prompt, LORA, seed, and aspect ratio
 */
export function KeyframeEditPopup({
  isOpen,
  onClose,
  frameType,
  keyframeData,
  onSave,
  onRegenerate,
  isRegenerating = false,
  availableLoras = [],
}: KeyframeEditPopupProps) {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [loraName, setLoraName] = useState<string>("none");
  const [loraWeight, setLoraWeight] = useState(1.0);
  const [seed, setSeed] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");

  // Initialize form when keyframeData changes
  useEffect(() => {
    if (keyframeData) {
      setPrompt(keyframeData.prompt || "");
      setLoraName(keyframeData.generation_params?.lora_name || "none");
      setLoraWeight(keyframeData.generation_params?.lora_weight || 1.0);
      setSeed(keyframeData.generation_params?.seed?.toString() || "");
      setAspectRatio(keyframeData.generation_params?.aspect_ratio || "16:9");
    } else {
      // Reset to defaults
      setPrompt("");
      setLoraName("none");
      setLoraWeight(1.0);
      setSeed("");
      setAspectRatio("16:9");
    }
  }, [keyframeData, isOpen]);

  const buildKeyframeData = (): KeyframeData => ({
    image_url: keyframeData?.image_url,
    prompt,
    generation_status: keyframeData?.generation_status || "pending",
    generation_params: {
      seed: seed ? parseInt(seed, 10) : undefined,
      lora_name: loraName !== "none" ? loraName : undefined,
      lora_weight: loraName !== "none" ? loraWeight : undefined,
      aspect_ratio: aspectRatio,
    },
    error_message: keyframeData?.error_message,
    created_at: keyframeData?.created_at,
    updated_at: new Date().toISOString(),
  });

  const handleSave = () => {
    onSave(buildKeyframeData());
    onClose();
  };

  const handleRegenerate = () => {
    onRegenerate(buildKeyframeData());
  };

  const hasImage =
    keyframeData?.image_url &&
    keyframeData?.generation_status === "completed";
  const isFailed = keyframeData?.generation_status === "failed";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-orange-500" />
            <span>Edit {frameType === "start" ? "Start" : "End"} Frame</span>
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            Configure the keyframe image for video generation.
            {frameType === "end" && " End frame is optional for smoother transitions."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 my-4">
          {/* Preview and Generate */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Preview */}
            <div className="space-y-2">
              <Label className="text-neutral-400 text-xs uppercase tracking-wide">
                Preview
              </Label>
              <div className="aspect-video bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden relative flex items-center justify-center">
                {hasImage ? (
                  <img
                    src={keyframeData.image_url}
                    alt={`${frameType} frame`}
                    className="w-full h-full object-cover"
                  />
                ) : isFailed ? (
                  <div className="flex flex-col items-center gap-2 text-red-400">
                    <AlertTriangle className="w-8 h-8" />
                    <span className="text-xs text-center px-4">
                      {keyframeData?.error_message || "Generation failed"}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-neutral-600">
                    <Image className="w-8 h-8" />
                    <span className="text-xs">Not Generated</span>
                  </div>
                )}
                {isRegenerating && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Generate Panel */}
            <div className="space-y-2">
              <Label className="text-neutral-400 text-xs uppercase tracking-wide">
                Generate
              </Label>
              <div className="aspect-video bg-neutral-900/50 rounded-lg border border-dashed border-neutral-700 flex flex-col items-center justify-center gap-3 p-4">
                <Button
                  variant="secondary"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={handleRegenerate}
                  disabled={isRegenerating || !prompt.trim()}
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {hasImage ? "Regenerate" : "Generate"} Frame
                    </>
                  )}
                </Button>
                <p className="text-xs text-neutral-500 text-center">
                  {!prompt.trim()
                    ? "Enter a prompt below first"
                    : `Generate ${frameType} frame image`}
                </p>
              </div>
            </div>
          </div>

          {/* Keyframe Prompt */}
          <div className="space-y-2">
            <Label htmlFor="keyframe-prompt" className="text-neutral-300">
              Keyframe Prompt
            </Label>
            <Textarea
              id="keyframe-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-neutral-900 border-neutral-800 min-h-[100px] focus:ring-orange-600 text-white resize-none"
              placeholder="Describe the static image for this keyframe... (e.g., 'A wide shot of a city skyline at sunset with warm golden lighting')"
            />
            <p className="text-xs text-neutral-500">
              This prompt is for the static image. Video motion is controlled separately.
            </p>
          </div>

          {/* Generation Settings */}
          <div className="space-y-4 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
            <Label className="text-neutral-300 text-sm font-medium">
              Generation Settings
            </Label>

            {/* LORA Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">Style LORA</Label>
                <Select value={loraName} onValueChange={setLoraName}>
                  <SelectTrigger className="bg-neutral-900 border-neutral-700 text-white">
                    <SelectValue placeholder="Select LORA..." />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-700">
                    <SelectItem value="none" className="text-neutral-300">
                      None (Default)
                    </SelectItem>
                    {availableLoras.map((lora) => (
                      <SelectItem key={lora} value={lora} className="text-white">
                        {lora}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* LORA Weight (only shown when LORA selected) */}
              {loraName !== "none" && (
                <div className="space-y-2">
                  <Label className="text-neutral-400 text-xs">
                    LORA Weight: {loraWeight.toFixed(1)}
                  </Label>
                  <Slider
                    value={[loraWeight]}
                    onValueChange={([val]) => setLoraWeight(val)}
                    min={0.1}
                    max={2.0}
                    step={0.1}
                    className="mt-3"
                  />
                </div>
              )}
            </div>

            {/* Seed and Aspect Ratio */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">
                  Seed (optional)
                </Label>
                <Input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className="bg-neutral-900 border-neutral-700 text-white"
                  placeholder="Random"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-neutral-400 text-xs">Aspect Ratio</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={aspectRatio === "16:9" ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "flex-1",
                      aspectRatio === "16:9"
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "border-neutral-700 text-neutral-400",
                    )}
                    onClick={() => setAspectRatio("16:9")}
                  >
                    16:9
                  </Button>
                  <Button
                    type="button"
                    variant={aspectRatio === "9:16" ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "flex-1",
                      aspectRatio === "9:16"
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "border-neutral-700 text-neutral-400",
                    )}
                    onClick={() => setAspectRatio("9:16")}
                  >
                    9:16
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end pt-4 border-t border-neutral-800">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-neutral-300 hover:bg-neutral-800"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
