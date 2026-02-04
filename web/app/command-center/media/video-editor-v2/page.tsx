"use client";

import React from "react";
import { ReactVideoEditorV2 } from "@/features/video-editor-v2/components/react-video-editor-v2";
import { HttpRenderer } from "@/features/video-editor-v2/utils/http-renderer";

// Import video editor styles
import "@/features/video-editor-v2/styles.css";
import "@/features/video-editor-v2/styles.utilities.css";


// Create a renderer instance for the editor
const httpRenderer = new HttpRenderer("/api/render", {
  type: "ssr",
  entryPoint: "/api/render",
});


export default function VideoEditorV2Page() {
  return (
    <div className="dark h-screen w-screen overflow-hidden bg-background">
      <ReactVideoEditorV2
        projectId="demo-project"
        renderer={httpRenderer}
        projectTitle="Video Editor V2"
        hideThemeToggle={true}
        defaultTheme="dark"
        fps={30}
        videoWidth={1920}
        videoHeight={1080}
      />
    </div>
  );
}
