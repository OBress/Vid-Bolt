---
name: gradients
description: Animated gradient patterns for Remotion. Use when creating gradient backgrounds, color transitions, gradient text, or mesh gradient effects.
tags: gradients, gradient, color, background, mesh, linear-gradient, radial-gradient, conic-gradient
---

# Animated Gradients

Frame-driven gradient animations using CSS gradients and `interpolateColors()`.

## Rules

- ✅ Use `interpolateColors()` from `remotion` for smooth color transitions
- ✅ Drive gradient angle/position with `interpolate()` + `useCurrentFrame()`
- ✅ Use CSS `linear-gradient`, `radial-gradient`, or `conic-gradient`
- ❌ NEVER use CSS transitions or `@keyframes` for gradient animation
- ❌ NEVER use `background-size: 200%` + `animation` tricks

## Rotating Gradient Background

```tsx
const frame = useCurrentFrame();

const angle = interpolate(frame, [0, 120], [0, 360]);

<AbsoluteFill
  style={{
    background: `linear-gradient(${angle}deg, #667eea 0%, #764ba2 50%, #f093fb 100%)`,
  }}
/>;
```

## Color-Shifting Gradient

Smoothly transition between color palettes:

```tsx
const frame = useCurrentFrame();

const color1 = interpolateColors(
  frame,
  [0, 60, 120],
  ["#667eea", "#f093fb", "#43e97b"],
);
const color2 = interpolateColors(
  frame,
  [0, 60, 120],
  ["#764ba2", "#f5576c", "#38f9d7"],
);

<AbsoluteFill
  style={{
    background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
  }}
/>;
```

## Radial Gradient Pulse

Expanding/contracting radial gradient:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const pulse = spring({ frame, fps, config: { damping: 8, stiffness: 40 } });
const size = interpolate(pulse, [0, 1], [20, 80]);

<AbsoluteFill
  style={{
    background: `radial-gradient(circle at 50% 50%, #3B82F6 0%, #1E3A8A ${size}%, #0F172A 100%)`,
  }}
/>;
```

## Gradient Text

Apply gradient fill to text:

```tsx
<span
  style={{
    fontSize: 72,
    fontWeight: 900,
    background: "linear-gradient(90deg, #f97316, #ec4899, #8b5cf6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  }}
>
  Gradient Text
</span>
```

## Animated Gradient Text

Shift the gradient hue across text over time:

```tsx
const frame = useCurrentFrame();

const hue1 = interpolate(frame, [0, 90], [0, 360]);
const hue2 = hue1 + 60;

<span
  style={{
    fontSize: 72,
    fontWeight: 900,
    background: `linear-gradient(90deg, hsl(${hue1},80%,60%), hsl(${hue2},80%,60%))`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  }}
>
  Animated Gradient
</span>;
```

## Conic Gradient Spinner

Rotating conic gradient for loading or decorative effects:

```tsx
const frame = useCurrentFrame();
const angle = interpolate(frame, [0, 60], [0, 360]);

<div
  style={{
    width: 200,
    height: 200,
    borderRadius: "50%",
    background: `conic-gradient(from ${angle}deg, #3B82F6, #8B5CF6, #EC4899, #F59E0B, #3B82F6)`,
  }}
/>;
```

## Multi-Stop Moving Gradient

Animate the position of gradient stops:

```tsx
const frame = useCurrentFrame();
const shift = interpolate(frame, [0, 120], [0, 100]);

<AbsoluteFill
  style={{
    background: `linear-gradient(135deg,
    #0f0c29 ${shift - 50}%,
    #302b63 ${shift}%,
    #24243e ${shift + 50}%
  )`,
  }}
/>;
```
