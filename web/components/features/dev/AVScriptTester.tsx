"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Video,
  Image,
  Film,
  CheckCircle2,
  Play,
  ArrowLeft,
  X,
  Camera,
  Clapperboard,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface AVScriptTesterProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TaskStatus {
  status: "idle" | "generating" | "complete" | "error";
  progress: number;
  message: string;
}

interface ShotDetail {
  shotIndex: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  imagePrompt: string;
  imageEditPrompt: string | null;
  videoMotionPrompt: string;
  generationStrategy: "create_new" | "edit_existing";
}

interface SceneDetail {
  sceneIndex: number;
  sceneType: string;
  summary: string;
  narration: string;
  shots: ShotDetail[];
  duration: number;
}

interface GenerationStats {
  totalScenes: number;
  totalShots: number;
  newImagesNeeded: number;
  editsNeeded: number;
  videosToGenerate: number;
}

// ============================================================================
// DEFAULT SCRIPT
// ============================================================================

const DEFAULT_SCRIPT_INPUT = `In 2012, something extraordinary happened in the world of finance.

A trader named Bruno Iksil, working in JP Morgan's London office, made a bet so massive that it would eventually cost the bank over six billion dollars. They called him "The London Whale."

But here's what most people don't know: This wasn't just about one rogue trader. This was about a culture of risk-taking that had grown out of control.

Jamie Dimon, the CEO of JP Morgan, was initially dismissive. When reporters first asked about the trades, he called it "a tempest in a teapot."

He was wrong. So very wrong.

In the end, the bank lost $6.2 billion. Bruno Iksil was never charged. The traders who piled on against JP Morgan made fortunes.

And Jamie Dimon? He kept his job, though he had to face a very uncomfortable Senate hearing.`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AVScriptTester({ isOpen, onClose }: AVScriptTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [scriptInput, setScriptInput] = useState(DEFAULT_SCRIPT_INPUT);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>({
    status: "idle",
    progress: 0,
    message: "Ready to start",
  });
  const [scenes, setScenes] = useState<SceneDetail[]>([]);
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneDetail | null>(null);
  const [selectedShot, setSelectedShot] = useState<ShotDetail | null>(null);

  // Mount effect for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleStartPipeline = async () => {
    setError(null);
    setScenes([]);
    setStats(null);
    setSelectedScene(null);
    setSelectedShot(null);
    setTaskStatus({
      status: "generating",
      progress: 20,
      message: "Sending script to Visual Director...",
    });

    try {
      // Call the real API
      const response = await fetch("/api/visual-director/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptText: scriptInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate scenes");
      }

      // Update with real results
      setScenes(data.scenes);
      setStats(data.stats);
      setTaskStatus({
        status: "complete",
        progress: 100,
        message: "Visual director pipeline complete!",
      });
    } catch (err) {
      console.error("[AVScriptTester] Error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setTaskStatus({
        status: "error",
        progress: 0,
        message: "Pipeline failed",
      });
    }
  };

  const handleReset = () => {
    setTaskStatus({ status: "idle", progress: 0, message: "Ready to start" });
    setScenes([]);
    setStats(null);
    setError(null);
    setSelectedScene(null);
    setSelectedShot(null);
  };

  // Don't render on server or when not open
  if (!mounted || !isOpen) return null;

  // =========================================================================
  // RENDER
  // =========================================================================

  const content = (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-teal-500/20 rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              AV Script Tester (Visual Director)
            </h1>
            <p className="text-sm text-neutral-400">
              Test scene planning with Gemini 3 Flash
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-neutral-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Script Input */}
        <div className="w-80 border-r border-neutral-800 flex flex-col p-6 overflow-y-auto">
          <label className="text-sm font-medium text-neutral-400 mb-2">
            Script Input
          </label>
          <Textarea
            value={scriptInput}
            onChange={(e) => setScriptInput(e.target.value)}
            placeholder="Enter script text to generate visuals for..."
            className="flex-1 min-h-[200px] bg-neutral-900 border-neutral-700 text-neutral-200 resize-none text-sm"
            disabled={taskStatus.status === "generating"}
          />

          <div className="mt-4 space-y-4">
            {/* Action Button */}
            {taskStatus.status === "idle" ||
            taskStatus.status === "complete" ||
            taskStatus.status === "error" ? (
              <Button
                onClick={handleStartPipeline}
                className="w-full bg-teal-600 hover:bg-teal-700"
                disabled={!scriptInput.trim() || scriptInput.length < 50}
              >
                <Play className="w-4 h-4 mr-2" />
                Generate Scenes
              </Button>
            ) : (
              <Button className="w-full bg-neutral-700" disabled>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {taskStatus.message}
              </Button>
            )}

            {(taskStatus.status === "complete" ||
              taskStatus.status === "error") && (
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full border-neutral-700"
              >
                Reset
              </Button>
            )}

            {/* Progress Bar */}
            {taskStatus.status === "generating" && (
              <div>
                <div className="flex justify-between text-xs text-neutral-500 mb-1">
                  <span>{taskStatus.message}</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 animate-pulse"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div className="p-4 bg-neutral-900 border border-neutral-700 rounded-lg">
                <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Results
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Scenes:</span>
                    <span className="text-white font-medium">
                      {stats.totalScenes}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Shots:</span>
                    <span className="text-white font-medium">
                      {stats.totalShots}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">New Images:</span>
                    <span className="text-white font-medium">
                      {stats.newImagesNeeded}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Edits:</span>
                    <span className="text-white font-medium">
                      {stats.editsNeeded}
                    </span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-neutral-400">Videos:</span>
                    <span className="text-white font-medium">
                      {stats.videosToGenerate}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-neutral-500 border-t border-neutral-800 pt-4">
            <strong>Using:</strong> Gemini 3 Flash via OpenRouter
          </div>
        </div>

        {/* Middle Panel - Scene List */}
        <div className="w-80 border-r border-neutral-800 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="text-sm font-medium text-neutral-400">
              Scenes ({scenes.length})
            </h2>
          </div>
          <ScrollArea className="flex-1">
            {scenes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-500 text-sm p-6 text-center">
                {taskStatus.status === "generating"
                  ? "Generating scenes with AI..."
                  : "Click 'Generate Scenes' to analyze your script"}
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.sceneIndex}
                    onClick={() => {
                      setSelectedScene(scene);
                      setSelectedShot(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedScene?.sceneIndex === scene.sceneIndex
                        ? "bg-teal-500/10 border-teal-500/50"
                        : "bg-neutral-900 border-neutral-700 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white text-sm">
                        Scene {scene.sceneIndex}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 bg-teal-500/20 text-teal-400 rounded">
                          {scene.sceneType.replace(/_/g, " ")}
                        </span>
                        <ChevronRight className="w-3 h-3 text-neutral-500" />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-400 mb-1 line-clamp-2">
                      {scene.summary}
                    </p>
                    <div className="flex gap-3 text-[10px] text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        {scene.shots.length} shots
                      </span>
                      <span>{scene.duration}s</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel - Scene/Shot Details */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="text-sm font-medium text-neutral-400">
              {selectedShot
                ? `Shot ${selectedShot.shotIndex} Details`
                : selectedScene
                ? `Scene ${selectedScene.sceneIndex} Shots`
                : "Select a Scene"}
            </h2>
          </div>

          <ScrollArea className="flex-1">
            {!selectedScene ? (
              <div className="h-full flex items-center justify-center text-neutral-500 text-sm p-6">
                Click on a scene to see shot details
              </div>
            ) : selectedShot ? (
              // Shot Detail View
              <div className="p-6 space-y-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedShot(null)}
                  className="text-neutral-400 hover:text-white -ml-2"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Shots
                </Button>

                {/* Shot Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                    <span className="text-xs text-neutral-500">Shot Type</span>
                    <p className="text-white font-medium">
                      {selectedShot.shotType.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                    <span className="text-xs text-neutral-500">
                      Camera Angle
                    </span>
                    <p className="text-white font-medium">
                      {selectedShot.cameraAngle.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                    <span className="text-xs text-neutral-500">
                      Camera Movement
                    </span>
                    <p className="text-white font-medium">
                      {selectedShot.cameraMovement.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                    <span className="text-xs text-neutral-500">Duration</span>
                    <p className="text-white font-medium">
                      {selectedShot.duration}s
                    </p>
                  </div>
                </div>

                {/* Image Prompt */}
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Image className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white">
                      {selectedShot.generationStrategy === "create_new"
                        ? "Image Generation Prompt"
                        : "Image Edit Prompt"}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        selectedShot.generationStrategy === "create_new"
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {selectedShot.generationStrategy === "create_new"
                        ? "NEW"
                        : "EDIT"}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {selectedShot.imagePrompt}
                  </p>
                  {selectedShot.imageEditPrompt && (
                    <div className="mt-3 pt-3 border-t border-neutral-700">
                      <span className="text-xs text-amber-400 font-medium">
                        Edit Instructions:
                      </span>
                      <p className="text-sm text-neutral-300 mt-1">
                        {selectedShot.imageEditPrompt}
                      </p>
                    </div>
                  )}
                </div>

                {/* Video Motion Prompt */}
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Video className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-medium text-white">
                      Video Motion Prompt
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    {selectedShot.videoMotionPrompt}
                  </p>
                </div>
              </div>
            ) : (
              // Shot List View
              <div className="p-4 space-y-4">
                {/* Scene Summary */}
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Clapperboard className="w-4 h-4 text-teal-400" />
                    <span className="text-sm font-medium text-white">
                      Scene Summary
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400">
                    {selectedScene.summary}
                  </p>
                  {selectedScene.narration && (
                    <div className="mt-3 pt-3 border-t border-neutral-700">
                      <span className="text-xs text-neutral-500">Notes:</span>
                      <p className="text-sm text-neutral-300 mt-1">
                        {selectedScene.narration}
                      </p>
                    </div>
                  )}
                </div>

                {/* Shot List */}
                <div className="space-y-2">
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">
                    Shots ({selectedScene.shots.length})
                  </span>
                  {selectedScene.shots.map((shot) => (
                    <button
                      key={shot.shotIndex}
                      onClick={() => setSelectedShot(shot)}
                      className="w-full text-left p-4 bg-neutral-900 rounded-lg border border-neutral-700 hover:border-teal-500/50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-neutral-400" />
                          <span className="font-medium text-white">
                            Shot {shot.shotIndex}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              shot.generationStrategy === "create_new"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {shot.generationStrategy === "create_new"
                              ? "NEW"
                              : "EDIT"}
                          </span>
                          <ChevronRight className="w-4 h-4 text-neutral-500" />
                        </div>
                      </div>
                      <p className="text-xs text-neutral-400 line-clamp-2 mb-2">
                        {shot.imagePrompt.substring(0, 150)}...
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                        <span className="px-2 py-0.5 bg-neutral-800 rounded">
                          {shot.shotType.replace(/_/g, " ")}
                        </span>
                        <span className="px-2 py-0.5 bg-neutral-800 rounded">
                          {shot.cameraMovement.replace(/_/g, " ")}
                        </span>
                        <span className="px-2 py-0.5 bg-neutral-800 rounded">
                          {shot.duration}s
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
