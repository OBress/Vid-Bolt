import { IImage } from "@designcombo/types";
import { BaseSequence, SequenceItemOptions } from "../base-sequence";
import { BoxAnim, ContentAnim, MaskAnim } from "@designcombo/animations";
import { calculateContainerStyles, calculateMediaStyles } from "../styles";
import { getAnimations } from "../../utils/get-animations";
import { calculateFrames } from "../../utils/frames";
import { Img } from "remotion";
import { useState } from "react";

// Error fallback component for when image fails to load
const ImageErrorFallback = ({
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
      color: "#f59e0b",
      fontSize: "14px",
      textAlign: "center",
      padding: "20px",
      borderRadius: "8px",
      border: "1px solid #f59e0b33",
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
    <div style={{ fontWeight: 500, marginBottom: "8px" }}>
      Image not available
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

export default function Image({
  item,
  options,
}: {
  item: IImage;
  options: SequenceItemOptions;
}) {
  const { fps, frame } = options;
  const { details, animations } = item;
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
        transform: "scale(1)",
      })}
      animationIn={animationIn!}
      animationOut={animationOut!}
      frame={currentFrame}
      durationInFrames={durationInFrames}
    >
      <ContentAnim
        animationTimed={animationTimed!}
        durationInFrames={durationInFrames}
        frame={currentFrame}
      >
        <MaskAnim
          item={item}
          keyframeAnimations={animationTimed!}
          frame={frame || 0}
        >
          <div
            id={`${item.id}-reveal-mask`}
            style={calculateMediaStyles(details, crop)}
          >
            {!isValidSrc || hasError ? (
              <ImageErrorFallback
                src={src || "Unknown source"}
                width={details.width || 320}
                height={details.height || 180}
              />
            ) : (
              <Img
                data-id={item.id}
                src={src}
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
}
