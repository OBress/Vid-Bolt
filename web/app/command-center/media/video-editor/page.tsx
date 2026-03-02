"use client";

import dynamic from "next/dynamic";
import { HttpRenderer } from "@/features/video-editor-v2/utils/http-renderer";
import "@/features/video-editor-v2/styles/video-editor.css";

const ReactVideoEditor = dynamic(
  () =>
    import("@/features/video-editor-v2/components/react-video-editor-v2").then(
      (mod) => mod.ReactVideoEditorV2,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-neutral-400">Loading Video Editor...</div>
      </div>
    ),
  },
);

const httpRenderer = new HttpRenderer("/api/render", {
  type: "ssr",
  entryPoint: "/api/render",
});

export default function VideoEditorPage() {
  return (
    <div className="dark h-screen w-screen overflow-hidden bg-background">
      <ReactVideoEditor
        projectId="demo-project"
        renderer={httpRenderer}
        projectTitle="Video Editor"
        fps={30}
        videoWidth={1920}
        videoHeight={1080}
      />
    </div>
  );
}
