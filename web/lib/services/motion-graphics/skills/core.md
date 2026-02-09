---
name: core
description: Core Remotion patterns and best practices - always included in every generation
tags: core, fundamentals, basics, patterns, required
---

# Core Animation Patterns

These patterns apply to ALL motion graphics. Follow them for consistent, high-quality animations.

## Component Structure

```tsx
export const MyAnimation = () => {
  /**
   * Brief description of what this animation does
   * and its visual style/purpose.
   */
  
  // 1. Hooks first
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  
  // 2. Constants (UPPER_SNAKE_CASE, inside component)
  const COLOR_PRIMARY = "#3B82F6";
  const COLOR_BACKGROUND = "#0F172A";
  const FADE_DURATION = 20;
  const PADDING = 40;
  
  // 3. Calculations and animations
  const fadeIn = interpolate(frame, [0, FADE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // 4. Return JSX
  return (
    <AbsoluteFill style={{ backgroundColor: COLOR_BACKGROUND }}>
      {/* Content */}
    </AbsoluteFill>
  );
};
```

## Animation Rules

### Spring for Organic Motion

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 18, stiffness: 80 }
});
```

### Interpolate for Linear Progress

```tsx
const progress = interpolate(frame, [0, 60], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

## Always Clamp Interpolations

**Incorrect:**
```tsx
const opacity = interpolate(frame, [0, 30], [0, 1]);
```

**Correct:**
```tsx
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

## Stagger Pattern

Animate multiple elements with consistent delays:

```tsx
const ITEMS = ['A', 'B', 'C', 'D'];
const STAGGER_DELAY = 5; // frames between items

{ITEMS.map((item, i) => {
  const delay = i * STAGGER_DELAY;
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 }
  });
  
  return (
    <div style={{ opacity: Math.max(0, progress) }}>
      {item}
    </div>
  );
})}
```

## Layout Pattern

Always use AbsoluteFill as root with proper styling:

```tsx
<AbsoluteFill style={{
  backgroundColor: '#0F172A',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
}}>
```

## Entrance Animation Pattern

Standard pattern for elements appearing:

```tsx
const entranceProgress = spring({
  frame,
  fps,
  config: { damping: 18, stiffness: 80 }
});

const opacity = entranceProgress;
const translateY = interpolate(entranceProgress, [0, 1], [30, 0]);

<div style={{
  opacity,
  transform: `translateY(${translateY}px)`,
}}>
  Content
</div>
```

## Color Interpolation

For smooth color transitions:

```tsx
import { interpolateColors } from 'remotion';

const backgroundColor = interpolateColors(
  frame,
  [0, 60],
  ['#3B82F6', '#8B5CF6']
);
```

## Time Conversions

```tsx
const { fps, durationInFrames } = useVideoConfig();

// Seconds to frames
const oneSecond = fps;
const halfSecond = fps * 0.5;

// Progress through video (0 to 1)
const videoProgress = frame / durationInFrames;

// Midpoint frame
const midpoint = durationInFrames / 2;
```

## Reserved Names - NEVER Use as Variables

These names shadow imports and will cause errors:
- `spring`
- `interpolate`
- `interpolateColors`
- `useCurrentFrame`
- `useVideoConfig`
- `AbsoluteFill`
- `Sequence`

## Styling Rules

- Use inline styles only (no CSS imports)
- Use `fontFamily: 'Inter, sans-serif'` unless specific font requested
- Keep colors minimal (2-4 max)
- Always set backgroundColor on AbsoluteFill from frame 0
- Use consistent spacing (multiples of 8px)
