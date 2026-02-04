"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";

// Import video editor styles
import "@/features/video-editor-v2/styles.css";
import "@/features/video-editor-v2/styles.utilities.css";


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

export function VideoEditorTester({
  isOpen,
  onClose,
  inline = false,
}: VideoEditorTesterProps) {

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Header with back button */}
      <div className="flex-shrink-0 flex items-center gap-4 p-4 border-b border-neutral-800 bg-neutral-900/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dev Tools
        </Button>
        <div className="h-4 w-px bg-neutral-700" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
          Video Editor V2 Tester
        </h2>
        <span className="text-xs text-neutral-500">
          Full professional editor from source project
        </span>
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

