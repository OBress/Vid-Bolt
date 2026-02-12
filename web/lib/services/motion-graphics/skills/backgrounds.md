---
name: backgrounds
description: Animated background patterns for Remotion. Use when creating dynamic backgrounds, geometric patterns, wave animations, starfields, or grid effects.
tags: background, pattern, grid, wave, starfield, geometric, abstract, animated-background
---

# Animated Backgrounds

Frame-driven background patterns and effects.

## Rules

- ✅ Use `AbsoluteFill` as the base container with your background style
- ✅ Use `random()` for deterministic element placement
- ✅ Drive all motion from `useCurrentFrame()` and `interpolate()`
- ❌ NEVER use CSS animations or `@keyframes` for background motion

## Dot Grid

Subtle animated dot pattern:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const GRID = { spacing: 40, dotSize: 2, color: "rgba(255,255,255,0.15)" };
const cols = Math.ceil(width / GRID.spacing);
const rows = Math.ceil(height / GRID.spacing);

<svg width={width} height={height} style={{ position: "absolute" }}>
  {Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const pulse = Math.sin(frame * 0.05 + col * 0.3 + row * 0.3);
    const size = GRID.dotSize + pulse * 1;

    return (
      <circle
        key={i}
        cx={col * GRID.spacing + GRID.spacing / 2}
        cy={row * GRID.spacing + GRID.spacing / 2}
        r={Math.max(0.5, size)}
        fill={GRID.color}
      />
    );
  })}
</svg>;
```

## Wave Lines

Animated sine-wave lines:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const WAVE_COUNT = 6;

<svg width={width} height={height} style={{ position: "absolute" }}>
  {Array.from({ length: WAVE_COUNT }, (_, i) => {
    const baseY = (height / (WAVE_COUNT + 1)) * (i + 1);
    const amplitude = 20 + i * 5;
    const speed = 0.03 + i * 0.005;
    const opacity = 0.1 + i * 0.03;

    const points = Array.from({ length: 50 }, (_, j) => {
      const x = (j / 49) * width;
      const y = baseY + Math.sin(x * 0.01 + frame * speed) * amplitude;
      return `${j === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");

    return (
      <path
        key={i}
        d={points}
        fill="none"
        stroke={`rgba(255,255,255,${opacity})`}
        strokeWidth={1.5}
      />
    );
  })}
</svg>;
```

## Starfield / Deep Space

Stars that drift slowly, creating depth parallax:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const STAR_COUNT = 100;

const stars = Array.from({ length: STAR_COUNT }, (_, i) => {
  const layer = Math.floor(random("star-layer-" + i) * 3); // 0=far, 1=mid, 2=near
  const speed = (layer + 1) * 0.3;
  const size = 1 + layer * 1.5;
  const brightness = 0.3 + layer * 0.25;
  const x = (random("star-x-" + i) * width + frame * speed) % width;
  const y = random("star-y-" + i) * height;
  const twinkle =
    Math.sin(frame * 0.08 + random("star-t-" + i) * Math.PI * 2) * 0.3;

  return { x, y, size, opacity: brightness + twinkle };
});

<div style={{ position: "absolute", inset: 0, background: "#0A0A1A" }}>
  {stars.map((s, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        width: s.size,
        height: s.size,
        borderRadius: "50%",
        background: "#FFFFFF",
        opacity: Math.max(0, s.opacity),
      }}
    />
  ))}
</div>;
```

## Geometric Grid

Animated connected grid lines:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const GRID_SIZE = 60;
const cols = Math.ceil(width / GRID_SIZE) + 1;
const rows = Math.ceil(height / GRID_SIZE) + 1;

<svg
  width={width}
  height={height}
  style={{ position: "absolute", opacity: 0.15 }}
>
  {/* Vertical lines */}
  {Array.from({ length: cols }, (_, i) => (
    <line
      key={"v" + i}
      x1={i * GRID_SIZE}
      y1={0}
      x2={i * GRID_SIZE}
      y2={height}
      stroke="#FFFFFF"
      strokeWidth={0.5}
    />
  ))}
  {/* Horizontal lines */}
  {Array.from({ length: rows }, (_, i) => (
    <line
      key={"h" + i}
      x1={0}
      y1={i * GRID_SIZE}
      x2={width}
      y2={i * GRID_SIZE}
      stroke="#FFFFFF"
      strokeWidth={0.5}
    />
  ))}
  {/* Animated highlight dot traveling along grid */}
  {Array.from({ length: 3 }, (_, i) => {
    const t = (frame * 0.02 + i * 0.33) % 1;
    const gx = t * width;
    const gy = Math.sin(t * Math.PI * 2 + i) * height * 0.3 + height / 2;
    return (
      <circle
        key={"d" + i}
        cx={gx}
        cy={gy}
        r={4}
        fill="#3B82F6"
        opacity={0.6}
      />
    );
  })}
</svg>;
```

## Gradient Mesh Background

Multiple overlapping radial gradients:

```tsx
const frame = useCurrentFrame();

const blobs = [
  { x: "30%", y: "20%", color: "rgba(99,102,241,0.4)", size: 600 },
  { x: "70%", y: "60%", color: "rgba(236,72,153,0.3)", size: 500 },
  { x: "50%", y: "80%", color: "rgba(16,185,129,0.3)", size: 450 },
];

<AbsoluteFill style={{ background: "#0F172A" }}>
  {blobs.map((blob, i) => {
    const drift = Math.sin(frame * 0.01 + i * 2) * 30;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: blob.x,
          top: blob.y,
          width: blob.size,
          height: blob.size,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
          transform: `translate(-50%, -50%) translateX(${drift}px)`,
          filter: "blur(40px)",
        }}
      />
    );
  })}
</AbsoluteFill>;
```
