---
name: animations
description: Fundamental animation patterns for Remotion - useCurrentFrame, interpolation basics
tags: animations, transitions, frames, useCurrentFrame, basics
---

# Fundamental Animation Patterns

All animations MUST be driven by the `useCurrentFrame()` hook.
Write animations in seconds and multiply them by the `fps` value from `useVideoConfig()`.

```tsx
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const FadeIn = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 2 * fps], [0, 1], {
    extrapolateRight: 'clamp',
  });
 
  return (
    <div style={{ opacity }}>Hello World!</div>
  );
};
```

## Critical Rules

- CSS transitions are FORBIDDEN - they will not render correctly
- CSS animations are FORBIDDEN - they will not render correctly
- Tailwind animation classes are FORBIDDEN - they will not render correctly
- ALL motion must come from `useCurrentFrame()` + `interpolate()` or `spring()`

## Basic Animation Pattern

```tsx
const frame = useCurrentFrame();
const { fps, durationInFrames } = useVideoConfig();

// Fade in over 1 second
const fadeIn = interpolate(frame, [0, fps], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// Slide from left over 0.5 seconds
const slideX = interpolate(frame, [0, 0.5 * fps], [-100, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

## Frame-Based Timing

```tsx
// Convert seconds to frames
const startTimeInSeconds = 2;
const startFrame = startTimeInSeconds * fps;

// Animate only after start frame
const progress = interpolate(frame, [startFrame, startFrame + 30], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```
