"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Video,
  Cpu,
  Download,
  Layers,
  Film,
  Music,
  Bug,
  Wrench,
  Settings,
  Youtube,
} from "lucide-react";
import { UniversalScriptTester } from "@/components/features/dev/UniversalScriptTester";
import { AVScriptTester } from "@/components/features/dev/AVScriptTester";
import { GPUApiTester } from "@/components/features/dev/GPUApiTester";
import { StockScraperTester } from "@/components/features/dev/StockScraperTester";
import { MotionGraphicsTester } from "@/components/features/dev/MotionGraphicsTester";
import { VideoEditorTester } from "@/components/features/dev/VideoEditorTester";
import { AudioCleaningTester } from "@/components/features/dev/AudioCleaningTester";
import { PipelineDebugger } from "@/components/features/pipeline-debugger/PipelineDebugger";
import { ShotPlannerDebugger } from "@/components/features/dev/ShotPlannerDebugger";
import { YoutubeShotPlanner } from "@/components/features/dev/YoutubeShotPlanner";

type ActiveTester =
  | "universal"
  | "av"
  | "gpu"
  | "stock"
  | "motion"
  | "video-editor"
  | "audio-cleaning"
  | "pipeline-debugger"
  | "shot-planner-debugger"
  | "yt-shot-scraper"
  | null;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

interface ToolCard {
  id: ActiveTester;
  name: string;
  description: string;
  icon: typeof FileText;
  color: string; // Tailwind color name
}

const PIPELINE_TOOLS: ToolCard[] = [
  {
    id: "universal",
    name: "Universal Script",
    description: "6-phase script generation pipeline with research, spine, and assets.",
    icon: FileText,
    color: "purple",
  },
  {
    id: "av",
    name: "Visual Director",
    description: "Visual director pipeline for scene planning, image gen, and video creation.",
    icon: Video,
    color: "teal",
  },
  {
    id: "motion",
    name: "Motion Graphics",
    description: "Create and test motion graphic templates and animations.",
    icon: Layers,
    color: "pink",
  },
  {
    id: "video-editor",
    name: "Video Editor",
    description: "Timeline-based video editor with tracks, clips, and playback.",
    icon: Film,
    color: "cyan",
  },
  {
    id: "shot-planner-debugger",
    name: "Shot Planner Debugger",
    description: "Full prompt/response transparency for every LLM call in the shot planning pipeline.",
    icon: Bug,
    color: "violet",
  },
  {
    id: "yt-shot-scraper",
    name: "YouTube Shot Scraper",
    description: "Analyze YouTube videos shot-by-shot with Gemini 2.5 Flash. Save plans by genre for pipeline benchmarking.",
    icon: Youtube,
    color: "red",
  },
];

const INFRA_TOOLS: ToolCard[] = [
  {
    id: "gpu",
    name: "GPU API",
    description: "Test individual GPU API endpoints (Image, Edit, Video).",
    icon: Cpu,
    color: "orange",
  },
  {
    id: "stock",
    name: "Stock Scraper",
    description: "Search and download stock assets from various sources.",
    icon: Download,
    color: "blue",
  },
  {
    id: "audio-cleaning",
    name: "Audio Cleaning",
    description: "Remove AI fingerprints, watermarks & metadata from audio.",
    icon: Music,
    color: "green",
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function DevToolsTab() {
  const [activeTester, setActiveTester] = useState<ActiveTester>(null);

  // ——— Active tester views ———

  if (activeTester === "pipeline-debugger") {
    return <PipelineDebugger onClose={() => setActiveTester(null)} />;
  }

  if (activeTester === "shot-planner-debugger") {
    return <ShotPlannerDebugger onClose={() => setActiveTester(null)} />;
  }

  if (activeTester === "yt-shot-scraper") {
    return (
      <div className="flex flex-col h-full">
        <YoutubeShotPlanner onClose={() => setActiveTester(null)} />
      </div>
    );
  }

  if (activeTester === "universal") {
    return (
      <UniversalScriptTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "av") {
    return (
      <AVScriptTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "gpu") {
    return (
      <GPUApiTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "stock") {
    return (
      <StockScraperTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "motion") {
    return (
      <MotionGraphicsTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "video-editor") {
    return (
      <VideoEditorTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  if (activeTester === "audio-cleaning") {
    return (
      <AudioCleaningTester
        isOpen={true}
        onClose={() => setActiveTester(null)}
        inline={true}
      />
    );
  }

  // ——— Default view: tool selection dashboard ———
  return (
    <div className="p-6 space-y-8">
      {/* ================================================================ */}
      {/* PIPELINE DEBUGGER — Hero card */}
      {/* ================================================================ */}
      <button
        onClick={() => setActiveTester("pipeline-debugger")}
        className="w-full p-5 rounded-xl border border-red-500/20 bg-gradient-to-r from-red-950/30 via-neutral-900/50 to-neutral-900/50 hover:from-red-950/40 hover:border-red-500/30 transition-all group text-left"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/15 transition-colors">
            <Bug className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Pipeline Debugger
            </h3>
            <p className="text-neutral-400 text-xs mt-0.5">
              Full-pipeline inspection, A/B comparison, breakpoints, snapshots, and quality scoring.
              Debug every step of video creation from Outline to Export.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold uppercase">
            Open
          </span>
        </div>
      </button>

      {/* ================================================================ */}
      {/* PIPELINE TOOLS */}
      {/* ================================================================ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-4 h-4 text-neutral-500" />
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
            Pipeline Tools
          </h2>
          <span className="text-[10px] text-neutral-600">
            — Video creation logic testers
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PIPELINE_TOOLS.map((tool) => (
            <ToolCardComponent
              key={tool.id}
              tool={tool}
              onClick={() => setActiveTester(tool.id)}
            />
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* INFRASTRUCTURE TOOLS */}
      {/* ================================================================ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-neutral-500" />
          <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
            Infrastructure Tools
          </h2>
          <span className="text-[10px] text-neutral-600">
            — Standalone utility testers
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {INFRA_TOOLS.map((tool) => (
            <ToolCardComponent
              key={tool.id}
              tool={tool}
              onClick={() => setActiveTester(tool.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOOL CARD
// ============================================================================

function ToolCardComponent({
  tool,
  onClick,
}: {
  tool: ToolCard;
  onClick: () => void;
}) {
  const Icon = tool.icon;
  const colorMap: Record<string, { bg: string; text: string; btn: string }> = {
    purple: { bg: "bg-purple-500/10", text: "text-purple-500", btn: "bg-purple-600 hover:bg-purple-700" },
    teal: { bg: "bg-teal-500/10", text: "text-teal-500", btn: "bg-teal-600 hover:bg-teal-700" },
    pink: { bg: "bg-pink-500/10", text: "text-pink-500", btn: "bg-pink-600 hover:bg-pink-700" },
    cyan: { bg: "bg-cyan-500/10", text: "text-cyan-500", btn: "bg-cyan-600 hover:bg-cyan-700" },
    orange: { bg: "bg-orange-500/10", text: "text-orange-500", btn: "bg-orange-600 hover:bg-orange-700" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", btn: "bg-blue-600 hover:bg-blue-700" },
    green: { bg: "bg-green-500/10", text: "text-green-500", btn: "bg-green-600 hover:bg-green-700" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-500", btn: "bg-violet-600 hover:bg-violet-700" },
    red: { bg: "bg-red-500/10", text: "text-red-500", btn: "bg-red-600 hover:bg-red-700" },
  };
  const colors = colorMap[tool.color] || colorMap.purple;

  return (
    <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-3">
      <div className={`h-9 w-9 rounded-full ${colors.bg} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${colors.text}`} />
      </div>
      <div>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-0.5">
          {tool.name}
        </h3>
        <p className="text-neutral-400 text-[11px] leading-relaxed h-8 line-clamp-2">
          {tool.description}
        </p>
      </div>
      <Button
        onClick={onClick}
        size="sm"
        className={`w-full ${colors.btn} text-xs`}
      >
        Open Tester
      </Button>
    </div>
  );
}
