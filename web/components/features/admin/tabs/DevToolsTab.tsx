"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Video, Cpu } from "lucide-react";
import { UniversalScriptTester } from "@/components/features/dev/UniversalScriptTester";
import { AVScriptTester } from "@/components/features/dev/AVScriptTester";
import { GPUApiTester } from "@/components/features/dev/GPUApiTester";

export function DevToolsTab() {
  const [showUniversalTester, setShowUniversalTester] = useState(false);
  const [showAVScriptTester, setShowAVScriptTester] = useState(false);
  const [showGPUApiTester, setShowGPUApiTester] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              6-phase script generation pipeline with research, spine, and
              assets.
            </p>
          </div>
          <Button
            onClick={() => setShowUniversalTester(true)}
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
            onClick={() => setShowAVScriptTester(true)}
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
            onClick={() => setShowGPUApiTester(true)}
            className="w-full bg-orange-600 hover:bg-orange-700"
          >
            Open Tester
          </Button>
        </div>
      </div>

      {/* Universal Script Tester - Full Screen */}
      <UniversalScriptTester
        isOpen={showUniversalTester}
        onClose={() => setShowUniversalTester(false)}
      />

      {/* AV Script Tester - Full Screen */}
      <AVScriptTester
        isOpen={showAVScriptTester}
        onClose={() => setShowAVScriptTester(false)}
      />

      {/* GPU API Tester - Full Screen */}
      <GPUApiTester
        isOpen={showGPUApiTester}
        onClose={() => setShowGPUApiTester(false)}
      />
    </>
  );
}
