---
name: trimming
description: Trim animation start and end points, control playback ranges
keywords: [trim, cut, shorten, clip, range, start, end, offset]
---

# Trimming in Remotion

## Trim Animations with Sequence

Use `<Sequence>` to control when elements appear and disappear:

```tsx
import {
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";

export const TrimmedAnimation = () => {
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/* Show only from frame 30 to frame 90 */}
      <Sequence from={30} durationInFrames={60}>
        <MyElement />
      </Sequence>

      {/* Show from frame 60 until end */}
      <Sequence from={60}>
        <AnotherElement />
      </Sequence>
    </AbsoluteFill>
  );
};
```

## Trim with interpolate() Clamping

```tsx
const frame = useCurrentFrame();

// Only animate between frames 20-50, clamped outside
const opacity = interpolate(frame, [20, 50], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

## Exit Animations

```tsx
const { durationInFrames } = useVideoConfig();
const exitStart = durationInFrames - 30; // 30 frames before end

const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

## Rules

- ✅ Use Sequence for mounting/unmounting elements at specific times
- ✅ Always clamp interpolate() to prevent values outside intended range
- ✅ Use spring() with frame offset for natural entrances/exits
- ❌ Don't use setTimeout or setInterval for timing
