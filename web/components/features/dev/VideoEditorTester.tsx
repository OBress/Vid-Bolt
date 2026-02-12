"use client";

import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flame, Loader2, Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useFocusMode } from "@/components/layout/FocusModeContext";

// Import video editor styles
import "@/features/video-editor-v2/styles.css";
import "@/features/video-editor-v2/styles.utilities.css";

// Stress test
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  type StressTestConfig,
  type StressTestDensity,
  type StressTestResult,
  DURATION_STEPS,
  estimateStressTest,
  populateStressTest,
} from "@/features/video-editor-v2/utils/populate-stress-test";

// Dynamic import to avoid SSR issues with Remotion
const ReactVideoEditorV2 = dynamic(
  () =>
    import("@/features/video-editor-v2/components/react-video-editor-v2").then(
      (mod) => mod.ReactVideoEditorV2
    ),
  { ssr: false, loading: () => <div className="p-6">Loading Video Editor...</div> }
);

// Create a mock renderer for testing
const createMockRenderer = () => ({
  renderVideo: async () => ({ renderId: "mock-render" }),
  getProgress: async () => ({ type: "progress" as const, progress: 0 }),
  renderType: { type: "ssr" as const, entryPoint: "/api/render" },
});


interface VideoEditorTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}

// ============================================================================
// STRESS TEST POPOVER
// ============================================================================

const DENSITY_OPTIONS: { value: StressTestDensity; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "8–15s clips, few transitions" },
  { value: "medium", label: "Medium", description: "4–8s clips, some transitions" },
  { value: "heavy", label: "Heavy", description: "2–5s clips, heavy transitions" },
  { value: "extreme", label: "Extreme", description: "1–3s clips, max everything" },
];

function StressTestPopover() {
  const [durationIndex, setDurationIndex] = useState(3); // default: 2 min
  const [density, setDensity] = useState<StressTestDensity>("medium");
  const [videoTracks, setVideoTracks] = useState(4);
  const [audioTracks, setAudioTracks] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<StressTestResult | null>(null);
  const [open, setOpen] = useState(false);

  const durationSeconds = DURATION_STEPS[durationIndex]?.value ?? 120;
  const durationLabel = DURATION_STEPS[durationIndex]?.label ?? "2 min";

  const config: StressTestConfig = useMemo(() => ({
    durationSeconds,
    density,
    videoTracks,
    audioTracks,
  }), [durationSeconds, density, videoTracks, audioTracks]);

  const estimate = useMemo(() => estimateStressTest(config), [config]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setLastResult(null);
    try {
      // Allow UI to update before heavy computation
      await new Promise((r) => setTimeout(r, 50));
      const result = await populateStressTest(config);
      setLastResult(result);
      setOpen(false);
    } catch (err) {
      console.error("[StressTest] Failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [config]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5"
        >
          <Flame className="w-3.5 h-3.5" />
          Stress Test
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 bg-neutral-900 border-neutral-700 text-white p-0"
        align="start"
        sideOffset={8}
      >
        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <h3 className="text-sm font-bold text-orange-400">🔥 Stress Test Configuration</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Populate the timeline to test editor performance
            </p>
          </div>

          {/* Duration slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-neutral-300">Duration</Label>
              <span className="text-xs font-mono text-cyan-400">{durationLabel}</span>
            </div>
            <Slider
              value={[durationIndex]}
              onValueChange={(v) => setDurationIndex(v[0])}
              min={0}
              max={DURATION_STEPS.length - 1}
              step={1}
              className="[&_[data-slot=slider-track]]:bg-neutral-700 [&_[data-slot=slider-range]]:bg-orange-500 [&_[data-slot=slider-thumb]]:bg-orange-400 [&_[data-slot=slider-thumb]]:border-orange-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>10s</span>
              <span>60m</span>
            </div>
          </div>

          {/* Density radio group */}
          <div className="space-y-2">
            <Label className="text-xs text-neutral-300">Edit Density</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDensity(opt.value)}
                  className={`px-2.5 py-2 rounded-md text-left transition-colors border ${
                    density === opt.value
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                      : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750 hover:border-neutral-600"
                  }`}
                >
                  <div className="text-xs font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Track counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-300">Video Tracks</Label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setVideoTracks(Math.max(1, videoTracks - 1))}
                  className="w-6 h-6 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs font-bold flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-sm font-mono text-cyan-400 w-6 text-center">
                  {videoTracks}
                </span>
                <button
                  onClick={() => setVideoTracks(Math.min(6, videoTracks + 1))}
                  className="w-6 h-6 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-300">Audio Tracks</Label>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAudioTracks(Math.max(1, audioTracks - 1))}
                  className="w-6 h-6 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs font-bold flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-sm font-mono text-cyan-400 w-6 text-center">
                  {audioTracks}
                </span>
                <button
                  onClick={() => setAudioTracks(Math.min(4, audioTracks + 1))}
                  className="w-6 h-6 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 text-xs font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Estimate preview */}
          <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-md px-3 py-2">
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Estimate</div>
            <div className="text-xs text-neutral-300">
              ~{estimate.estimatedClips.toLocaleString()} clips, ~{estimate.estimatedTransitions.toLocaleString()} transitions across {estimate.estimatedTracks} tracks
            </div>
          </div>

          {/* Last result */}
          {lastResult && (
            <div className="bg-green-900/20 border border-green-700/30 rounded-md px-3 py-2">
              <div className="text-[10px] text-green-500 uppercase tracking-wider mb-1">Last Run</div>
              <div className="text-xs text-green-300">
                {lastResult.totalClips} clips, {lastResult.totalTransitions} transitions in {lastResult.generationTimeMs}ms
              </div>
            </div>
          )}

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium"
            size="sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5 mr-2" />
                Generate Stress Test
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VideoEditorTester({
  isOpen,
  onClose,
  inline: _inline = false,
}: VideoEditorTesterProps) {
  const { isFocusMode, toggleFocusMode, exitFocusMode } = useFocusMode();

  if (!isOpen) return null;

  const handleClose = () => {
    // Always exit focus mode when leaving the editor
    if (isFocusMode) exitFocusMode();
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Header with back button */}
      <div className="flex-shrink-0 flex items-center gap-4 p-4 border-b border-neutral-800 bg-neutral-900/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className="text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dev Tools
        </Button>
        <div className="h-4 w-px bg-neutral-700" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
          Video Editor V2 Tester
        </h2>
        <div className="h-4 w-px bg-neutral-700" />
        <StressTestPopover />
        <div className="flex-1" />
        {/* Focus mode toggle — unmounts Sidebar/TopBar for max performance */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFocusMode}
          className={`gap-1.5 ${
            isFocusMode
              ? "text-cyan-400 hover:text-cyan-300 bg-cyan-400/10"
              : "text-neutral-400 hover:text-white"
          }`}
          title={isFocusMode ? "Exit focus mode (Restore sidebar & topbar)" : "Focus mode (Hide sidebar & topbar for performance)"}
        >
          {isFocusMode ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
          {isFocusMode ? "Exit Focus" : "Focus Mode"}
        </Button>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        <ReactVideoEditorV2
          projectId="devtools-test"
          renderer={createMockRenderer()}
          projectTitle="Dev Tools Test"
          hideThemeToggle={true}
          defaultTheme="dark"
          fps={30}
          videoWidth={1920}
          videoHeight={1080}
        />
      </div>
    </div>
  );
}
