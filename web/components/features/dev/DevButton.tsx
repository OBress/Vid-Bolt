"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Code2, FileText, Video, Cpu } from "lucide-react";
import { UniversalScriptTester } from "./UniversalScriptTester";
import { AVScriptTester } from "./AVScriptTester";
import { GPUApiTester } from "./GPUApiTester";

export function DevButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUniversalTester, setShowUniversalTester] = useState(false);
  const [showAVScriptTester, setShowAVScriptTester] = useState(false);
  const [showGPUApiTester, setShowGPUApiTester] = useState(false);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="bg-orange-500/10 border-orange-500/50 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400"
          >
            <Code2 className="w-4 h-4 mr-2" />
            DEV Button
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl bg-neutral-950 border-neutral-800">
          <DialogHeader>
            <DialogTitle className="text-white">Developer Tools</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Universal Script Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Universal Script Generator
              </h3>
              <p className="text-neutral-400 text-sm">
                Test the new 6-phase script generation pipeline with research,
                spine, assets, and more.
              </p>
              <Button
                onClick={() => {
                  setIsOpen(false);
                  setShowUniversalTester(true);
                }}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Open Universal Script Tester
              </Button>
            </div>

            {/* AV Script / Visual Director Section */}
            <div className="space-y-4 pt-4 border-t border-neutral-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Visual Director (AV Script)
              </h3>
              <p className="text-neutral-400 text-sm">
                Test the visual director pipeline for scene planning, image
                generation, and video creation from scripts.
              </p>
              <Button
                onClick={() => {
                  setIsOpen(false);
                  setShowAVScriptTester(true);
                }}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                <Video className="w-4 h-4 mr-2" />
                Open AV Script Tester
              </Button>
            </div>

            {/* GPU API Tester Section */}
            <div className="space-y-4 pt-4 border-t border-neutral-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                GPU API Tester
              </h3>
              <p className="text-neutral-400 text-sm">
                Test individual GPU API endpoints for image creation, image
                editing, and video generation.
              </p>
              <Button
                onClick={() => {
                  setIsOpen(false);
                  setShowGPUApiTester(true);
                }}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                <Cpu className="w-4 h-4 mr-2" />
                Open GPU API Tester
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
