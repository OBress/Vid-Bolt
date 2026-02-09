---
name: transparent-videos
description: Render videos with transparent backgrounds for overlay use
keywords: [transparent, alpha, overlay, green screen, compositing, chroma]
---

# Transparent Videos in Remotion

## Creating Transparent Compositions

To render with transparency, don't set a background color on AbsoluteFill:

```tsx
import {
  AbsoluteFill,
  useCurrentFrame,
  spring,
  useVideoConfig,
} from "remotion";

export const TransparentOverlay = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill>
      {/* NO backgroundColor = transparent */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${scale})`,
          fontSize: 72,
          fontWeight: "bold",
          color: "white",
          textShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        Hello World
      </div>
    </AbsoluteFill>
  );
};
```

## Rendering with Transparency

Render using ProRes with alpha or WebM:

```bash
# ProRes 4444 (highest quality, large file)
npx remotion render --codec=prores --prores-profile=4444

# WebM VP8 with alpha
npx remotion render --codec=vp8
```

## Rules

- ✅ Omit `backgroundColor` on root AbsoluteFill for transparency
- ✅ Use ProRes 4444 or VP8 codec for alpha channel support
- ❌ H.264 (MP4) does NOT support transparency
- ✅ Use `textShadow` or `boxShadow` for visibility on any background
