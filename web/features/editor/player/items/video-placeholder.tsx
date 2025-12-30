import { IImage, ITrackItem, IVideo } from "@designcombo/types";
import { SequenceItemOptions } from "../base-sequence";
import { useMemo } from "react";
import { AbsoluteFill, Img } from "remotion";

interface VideoPlaceholderProps {
  item: ITrackItem & (IVideo | IImage);
  options: SequenceItemOptions;
}

export const VideoPlaceholder: React.FC<VideoPlaceholderProps> = ({
  item,
  options,
}) => {
  const { details } = item;
  const src = details.src;

  const containerStyle: React.CSSProperties = useMemo(() => {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000",
      opacity: details.opacity !== undefined ? details.opacity / 100 : 1,
      transform: `rotate(${(details as any).rotation || 0}deg)`,
    };
  }, [details]);

  return (
    <AbsoluteFill style={containerStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "60px",
          width: "90%",
          maxWidth: "1400px",
        }}
      >
        {/* Start Frame */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              backgroundColor: "#27272a",
              borderRadius: "12px",
              border: "2px solid #3f3f46",
              overflow: "hidden",
            }}
          >
            {src && (
              <img
                src={src}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                alt="Start Frame"
              />
            )}
          </div>
          <span
            style={{
              color: "#a1a1aa",
              fontSize: "32px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Start
          </span>
        </div>

        {/* Arrow */}
        <div
          style={{
            width: "100px",
            height: "4px",
            backgroundColor: "#52525b",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform:
                "translateY(-50%) rotate(-45deg) translate(-2px, -2px)",
              width: "24px",
              height: "24px",
              borderRight: "4px solid #52525b",
              borderBottom: "4px solid #52525b",
            }}
          />
        </div>

        {/* End Frame */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "16/9",
              backgroundColor: "#27272a",
              borderRadius: "12px",
              border: "2px solid #3f3f46",
              overflow: "hidden",
            }}
          >
            {src && (
              <img
                src={src}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                alt="End Frame"
              />
            )}
          </div>
          <span
            style={{
              color: "#a1a1aa",
              fontSize: "32px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            End
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
