import { IVideo } from "@designcombo/types";
import { BaseSequence, SequenceItemOptions } from "../base-sequence";
import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import { calculateContainerStyles, calculateMediaStyles } from "../styles";
import { getAnimations } from "../../utils/get-animations";
import { calculateFrames } from "../../utils/frames";
import { OffthreadVideo, useVideoConfig, Img } from "remotion";
import { useState } from "react";

// Error fallback component for when video fails to load
const VideoErrorFallback = ({
  src,
  width,
  height,
}: {
  src: string;
  width: number | string;
  height: number | string;
}) => (
  <div
    style={{
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#1a1a1a",
      color: "#ff6b6b",
      fontSize: "14px",
      textAlign: "center",
      padding: "20px",
      borderRadius: "8px",
      border: "1px solid #ff6b6b33",
    }}
  >
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ marginBottom: "12px", opacity: 0.8 }}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
    <div style={{ fontWeight: 500, marginBottom: "8px" }}>
      Video not available
    </div>
    <div
      style={{
        fontSize: "11px",
        color: "#888",
        wordBreak: "break-all",
        maxWidth: "200px",
      }}
    >
      {src.length > 50 ? `${src.substring(0, 50)}...` : src}
    </div>
  </div>
);

export const Video = ({
  item,
  options,
}: {
  item: IVideo;
  options: SequenceItemOptions;
}) => {
  const { fps, frame } = options;
  const { details, animations } = item;
  const playbackRate = item.playbackRate || 1;
  const [hasError, setHasError] = useState(false);

  const { animationIn, animationOut, animationTimed } = getAnimations(
    animations!,
    item,
    frame,
    fps
  );
  const crop = details?.crop || {
    x: 0,
    y: 0,
    width: details.width,
    height: details.height,
  };
  const { durationInFrames } = calculateFrames(item.display, fps);
  const currentFrame = (frame || 0) - (item.display.from * fps) / 1000;

  // Validate src exists and is a string
  const src = details.src;
  const isValidSrc = src && typeof src === "string" && src.trim() !== "";

  const children = (
    <BoxAnim
      style={calculateContainerStyles(details, crop, {
        overflow: "hidden",
      })}
      animationIn={animationIn}
      animationOut={animationOut}
      frame={currentFrame}
      durationInFrames={durationInFrames}
    >
      <ContentAnim
        animationTimed={animationTimed}
        durationInFrames={durationInFrames}
        frame={currentFrame}
      >
        <MaskAnim
          item={item}
          keyframeAnimations={animationTimed}
          frame={frame || 0}
        >
          <div style={calculateMediaStyles(details, crop)}>
            {!isValidSrc || hasError ? (
              <VideoErrorFallback
                src={src || "Unknown source"}
                width={details.width || 320}
                height={details.height || 180}
              />
            ) : (
              <OffthreadVideo
                startFrom={(item.trim?.from! / 1000) * fps}
                endAt={(item.trim?.to! / 1000) * fps || 1 / fps}
                playbackRate={playbackRate}
                src={src}
                volume={(details.volume ?? 100) / 100}
                onError={() => setHasError(true)}
              />
            )}
          </div>
        </MaskAnim>
      </ContentAnim>
    </BoxAnim>
  );

  return (
    <BaseSequence item={item} options={options}>
      {children}
    </BaseSequence>
  );
};

export default Video;
