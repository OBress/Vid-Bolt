---
name: noise
description: Noise, grain, and organic texture patterns for Remotion using @remotion/noise. Use when creating procedural textures, film grain, organic movement, or noisy backgrounds.
tags: noise, grain, texture, organic, film, distortion, overlay, perlin
---

# Noise & Grain Effects

Procedural noise using `@remotion/noise` and deterministic grain patterns.

## Rules

- ✅ Use `noise2D()`, `noise3D()`, `noise4D()` from `@remotion/noise` for smooth procedural noise
- ✅ Use `random()` from `remotion` for static deterministic randomness
- ✅ Noise functions return values in `[-1, 1]` — scale/offset as needed
- ✅ Pass `frame` as one of the dimensions for animated noise
- ❌ NEVER use `Math.random()` — breaks rendering determinism

## Import

```tsx
import { noise2D, noise3D, noise4D } from "@remotion/noise";
```

## noise2D(seed, x, y)

Returns a value between -1 and 1 based on 2D coordinates:

```tsx
const value = noise2D("my-seed", x * 0.01, y * 0.01); // -1 to 1
```

- `seed` — string seed for reproducibility
- `x`, `y` — coordinates (scale them down for smoother noise, e.g. `* 0.01`)

## Animated Noise Field

Use `frame` as a dimension for smooth animation:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const GRID = { cols: 30, rows: 20, cellSize: 0 };
GRID.cellSize = width / GRID.cols;

const cells = Array.from({ length: GRID.cols * GRID.rows }, (_, i) => {
  const col = i % GRID.cols;
  const row = Math.floor(i / GRID.cols);
  const noiseVal = noise3D("field", col * 0.1, row * 0.1, frame * 0.02);
  const opacity = ((noiseVal + 1) / 2) * 0.5; // Map [-1,1] to [0, 0.5]

  return { col, row, opacity };
});

<svg width={width} height={height} style={{ position: "absolute" }}>
  {cells.map((c, i) => (
    <rect
      key={i}
      x={c.col * GRID.cellSize}
      y={c.row * GRID.cellSize}
      width={GRID.cellSize}
      height={GRID.cellSize}
      fill={`rgba(255,255,255,${c.opacity})`}
    />
  ))}
</svg>;
```

## Film Grain Overlay

Scattered dots with per-frame noise variation:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const GRAIN = { count: 200, maxOpacity: 0.08, size: 2 };

const grainDots = Array.from({ length: GRAIN.count }, (_, i) => {
  const x = random("grain-x-" + i) * width;
  const y = random("grain-y-" + i) * height;
  const flicker = noise2D("grain-flicker", i * 0.5, frame * 0.3);
  const alpha = Math.max(0, flicker * GRAIN.maxOpacity);

  return { x, y, alpha };
});

<div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
  <svg width={width} height={height}>
    {grainDots.map((dot, i) => (
      <circle
        key={i}
        cx={dot.x}
        cy={dot.y}
        r={GRAIN.size}
        fill={`rgba(255,255,255,${dot.alpha})`}
      />
    ))}
  </svg>
</div>;
```

## Organic Floating Movement

Smooth, Perlin-noise-driven drift:

```tsx
const frame = useCurrentFrame();

const x = noise2D("drift-x", frame * 0.015, 0) * 30;
const y = noise2D("drift-y", 0, frame * 0.012) * 20;

<div
  style={{
    transform: `translate(${x}px, ${y}px)`,
  }}
>
  {/* Content drifts organically */}
</div>;
```

## Noisy Color Variation

Use noise to create organic color shifts:

```tsx
const frame = useCurrentFrame();

const hueShift = noise2D("hue", frame * 0.01, 0) * 30; // ±30° hue shift
const lightnessShift = noise2D("light", 0, frame * 0.01) * 10; // ±10% lightness

<div
  style={{
    background: `hsl(${220 + hueShift}, 70%, ${50 + lightnessShift}%)`,
  }}
>
  {/* Element with organic color variation */}
</div>;
```

## Noise Scale Guide

- `* 0.001` — very smooth, slow changes (landscape-scale)
- `* 0.01` — smooth, moderate detail (typical usage)
- `* 0.1` — detailed, visible patterns
- `* 1.0` — very noisy, rapid variation
