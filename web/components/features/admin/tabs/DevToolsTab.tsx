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
} from "lucide-react";
import { UniversalScriptTester } from "@/components/features/dev/UniversalScriptTester";
import { AVScriptTester } from "@/components/features/dev/AVScriptTester";
import { GPUApiTester } from "@/components/features/dev/GPUApiTester";
import { StockScraperTester } from "@/components/features/dev/StockScraperTester";
import { MotionGraphicsTester } from "@/components/features/dev/MotionGraphicsTester";
import { VideoEditorTester } from "@/components/features/dev/VideoEditorTester";
import { AudioCleaningTester } from "@/components/features/dev/AudioCleaningTester";

type ActiveTester = "universal" | "av" | "gpu" | "stock" | "motion" | "video-editor" | "audio-cleaning" | null;

export function DevToolsTab() {
  const [activeTester, setActiveTester] = useState<ActiveTester>(null);

  // Render the active tester inline
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

  // Default view - tool selection cards
  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Universal Script Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Universal Script
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            6-phase script generation pipeline with research, spine, and assets.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("universal")}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          Open Tester
        </Button>
      </div>

      {/* AV Script Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-teal-500/10 flex items-center justify-center">
          <Video className="w-5 h-5 text-teal-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Visual Director
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Visual director pipeline for scene planning, image gen, and video
            creation.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("av")}
          className="w-full bg-teal-600 hover:bg-teal-700"
        >
          Open Tester
        </Button>
      </div>

      {/* GPU API Tester Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            GPU API
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Test individual GPU API endpoints (Image, Edit, Video).
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("gpu")}
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          Open Tester
        </Button>
      </div>

      {/* Stock Scraper Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
          <Download className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Stock Scraper
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Search and download stock assets from various sources.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("stock")}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          Open Tester
        </Button>
      </div>

      {/* Motion Graphics Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-pink-500/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-pink-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Motion Graphics
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Create and test motion graphic templates and animations.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("motion")}
          className="w-full bg-pink-600 hover:bg-pink-700"
        >
          Open Tester
        </Button>
      </div>

      {/* Video Editor Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
          <Film className="w-5 h-5 text-cyan-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Video Editor
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Timeline-based video editor with tracks, clips, and playback.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("video-editor")}
          className="w-full bg-cyan-600 hover:bg-cyan-700"
        >
          Open Tester
        </Button>
      </div>

      {/* Audio Cleaning Section */}
      <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
        <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
          <Music className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Audio Cleaning
          </h3>
          <p className="text-neutral-400 text-xs h-10">
            Remove AI fingerprints, watermarks & metadata from audio.
          </p>
        </div>
        <Button
          onClick={() => setActiveTester("audio-cleaning")}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          Open Tester
        </Button>
      </div>
    </div>
  );
}
