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
import { Code2, FileText } from "lucide-react";
import { UniversalScriptTester } from "./UniversalScriptTester";

export function DevButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [showUniversalTester, setShowUniversalTester] = useState(false);

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
          </div>
        </DialogContent>
      </Dialog>

      {/* Universal Script Tester - Full Screen */}
      <UniversalScriptTester
        isOpen={showUniversalTester}
        onClose={() => setShowUniversalTester(false)}
      />
    </>
  );
}
