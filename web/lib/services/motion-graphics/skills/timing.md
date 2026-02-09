---
name: timing
description: Interpolation curves - linear, easing, spring animations, bezier curves
tags: spring, bounce, easing, interpolation, timing, curves
---

# Timing and Interpolation

## Linear Interpolation

Basic linear interpolation using the `interpolate` function:

```tsx
import { interpolate } from 'remotion';

// Going from 0 to 1 over 100 frames
const opacity = interpolate(frame, [0, 100], [0, 1]);
```

Always clamp values to prevent extrapolation issues:

```tsx
const opacity = interpolate(frame, [0, 100], [0, 1], {
  extrapolateRight: 'clamp',
  extrapolateLeft: 'clamp',
});
```

## Spring Animations

Spring animations have more natural, organic motion. They go from 0 to 1 over time.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({
  frame,
  fps,
});
```

### Spring Configuration

Default: `mass: 1, damping: 10, stiffness: 100` (slight bounce)

Common configurations:

```tsx
// Smooth, no bounce (subtle reveals)
const smooth = { damping: 200 };

// Snappy, minimal bounce (UI elements)
const snappy = { damping: 20, stiffness: 200 };

// Bouncy entrance (playful animations)
const bouncy = { damping: 8 };

// Heavy, slow, small bounce
const heavy = { damping: 15, stiffness: 80, mass: 2 };
```

### Spring with Delay

```tsx
const ENTRANCE_DELAY = 20;
const entrance = spring({
  frame: frame - ENTRANCE_DELAY,
  fps,
  config: { damping: 200 },
});
```

### Spring with Duration

```tsx
const spring = spring({
  frame,
  fps,
  durationInFrames: 40,
});
```

### Combining Spring with Interpolate

Map spring output (0-1) to custom ranges:

```tsx
const springProgress = spring({ frame, fps });

// Map to rotation
const rotation = interpolate(springProgress, [0, 1], [0, 360]);

// Map to position
const translateY = interpolate(springProgress, [0, 1], [50, 0]);

<div style={{ transform: `translateY(${translateY}px) rotate(${rotation}deg)` }} />
```

## Easing Functions

```tsx
import { interpolate, Easing } from 'remotion';

const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

Convexities:
- `Easing.in` - starts slow, accelerates
- `Easing.out` - starts fast, slows down
- `Easing.inOut` - slow start and end

Curves (most linear to most curved):
- `Easing.quad`
- `Easing.sin`
- `Easing.exp`
- `Easing.circle`

Cubic bezier:

```tsx
easing: Easing.bezier(0.8, 0.22, 0.96, 0.65)
```
