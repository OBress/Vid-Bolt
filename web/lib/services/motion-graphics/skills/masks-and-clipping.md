---
name: masks-and-clipping
description: Mask, clip-path, and reveal animation patterns for Remotion. Use when creating circular reveals, text masks, shape wipes, or content clipping effects.
tags: mask, clip-path, clipping, reveal, wipe, circle-reveal, text-mask, svg-mask
---

# Masks & Clipping

Frame-driven mask and clip-path animations for reveals, wipes, and creative compositions.

## Rules

- ✅ Animate `clip-path` values with `interpolate()` for smooth reveals
- ✅ Use `clipPath: inset(...)`, `circle(...)`, or `polygon(...)` for CSS clip paths
- ✅ Use SVG `<clipPath>` and `<mask>` for complex shapes
- ❌ NEVER use CSS transitions to animate clip-path — use `useCurrentFrame()`

## Circular Reveal

Content revealed by an expanding circle from center:

```tsx
const frame = useCurrentFrame();
const { fps, width, height } = useVideoConfig();

const progress = spring({ frame, fps, config: { damping: 20 } });
const maxRadius = Math.sqrt(width * width + height * height) / 2;
const radius = interpolate(progress, [0, 1], [0, maxRadius]);
const radiusPercent = (radius / Math.max(width, height)) * 100;

<div
  style={{
    clipPath: `circle(${radiusPercent}% at 50% 50%)`,
  }}
>
  {/* Content revealed by circle */}
</div>;
```

## Inset Reveal (Box Wipe)

Content revealed by shrinking inset from edges:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const progress = spring({ frame, fps, config: { damping: 15 } });
const inset = interpolate(progress, [0, 1], [50, 0]);

<div
  style={{
    clipPath: `inset(${inset}%)`,
  }}
>
  {/* Content revealed from center outward */}
</div>;
```

## Directional Wipe

Left-to-right wipe reveal:

```tsx
const frame = useCurrentFrame();

const wipePercent = interpolate(frame, [0, 40], [0, 100], {
  extrapolateRight: "clamp",
});

<div
  style={{
    clipPath: `inset(0 ${100 - wipePercent}% 0 0)`,
  }}
>
  {/* Content wipes in from left */}
</div>;
```

## Diagonal Wipe

Reveal with a diagonal edge using `polygon()`:

```tsx
const frame = useCurrentFrame();

const progress = interpolate(frame, [0, 45], [0, 1], {
  extrapolateRight: "clamp",
});

const offset = interpolate(progress, [0, 1], [-20, 120]);

<div
  style={{
    clipPath: `polygon(0 0, ${offset}% 0, ${offset - 20}% 100%, 0 100%)`,
  }}
>
  {/* Content revealed diagonally */}
</div>;
```

## Text Mask

Use text as a mask to reveal an image or gradient:

```tsx
<div
  style={{
    fontSize: 120,
    fontWeight: 900,
    background: "linear-gradient(45deg, #f97316, #ec4899)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  }}
>
  MASKED
</div>
```

## SVG Clip Path

For complex animated shapes, use SVG clipPath:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const radius = interpolate(frame, [0, 60], [0, 50], {
  extrapolateRight: "clamp",
});

<svg width={0} height={0} style={{ position: "absolute" }}>
  <defs>
    <clipPath id="myClip">
      <circle cx={width / 2} cy={height / 2} r={`${radius}%`} />
    </clipPath>
  </defs>
</svg>

<div style={{ clipPath: "url(#myClip)" }}>
  {/* Complex shape mask */}
</div>
```

## Staggered Multi-Shape Reveal

Multiple clip regions revealing content in sequence:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const items = ["Section A", "Section B", "Section C"];

{
  items.map((item, i) => {
    const delay = i * 12;
    const progress = spring({
      frame: frame - delay,
      fps,
      config: { damping: 15 },
    });
    const wipe = interpolate(progress, [0, 1], [100, 0]);

    return (
      <div
        key={i}
        style={{
          clipPath: `inset(0 ${wipe}% 0 0)`,
        }}
      >
        {item}
      </div>
    );
  });
}
```
