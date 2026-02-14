/**
 * Lambda Video Renderer (Client-Side)
 *
 * Implements the VideoRenderer interface for Remotion Lambda rendering.
 * This renderer talks to the /api/render and /api/render/progress endpoints,
 * which queue jobs to BullMQ → Remotion Lambda → R2.
 */

import type {
  VideoRenderer,
  RenderParams,
  RenderResponse,
  ProgressParams,
  ProgressResponse,
} from "@/features/video-editor-v2/types/renderer";

export const lambdaVideoRenderer: VideoRenderer = {
  renderType: {
    type: "lambda",
    entryPoint: "/api/render",
  },

  async renderVideo(params: RenderParams): Promise<RenderResponse> {
    const { id, inputProps } = params;

    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: id,
        overlays: inputProps.overlays,
        durationInFrames: inputProps.durationInFrames,
        width: inputProps.width,
        height: inputProps.height,
        fps: inputProps.fps,
        src: inputProps.src,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.error ?? `Render request failed (${response.status})`
      );
    }

    const data = await response.json();

    return {
      renderId: data.jobId,
      bucketName: data.outputKey,
    };
  },

  async getProgress(params: ProgressParams): Promise<ProgressResponse> {
    const { id } = params;

    const response = await fetch(
      `/api/render/progress?jobId=${encodeURIComponent(id)}`
    );

    if (!response.ok) {
      return {
        type: "error",
        message: `Progress request failed (${response.status})`,
      };
    }

    return response.json();
  },
};
