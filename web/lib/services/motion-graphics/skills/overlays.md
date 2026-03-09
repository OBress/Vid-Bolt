---
name: overlays
description: Visual overlay and compositing patterns for Remotion. Use when adding vignettes, scanlines, glitch effects, blend modes, transparent overlays on video/images, location tags, lower-thirds, badges, or any layered visual treatment.
tags: overlay, compositing, blend-mode, vignette, scanline, glitch, texture, layer, transparent, location, lower-third, badge, hud, border, lens, effect
---

# Visual Overlays & Compositing

Layered visual effects using CSS blend modes, gradients, and frame-driven patterns.

## Rules

- ✅ Use `mixBlendMode` for compositing overlays with content underneath
- ✅ Use `pointerEvents: 'none'` on overlay layers so they don't block interaction
- ✅ Use `position: 'absolute', inset: 0` for full-frame overlays
- ❌ NEVER use CSS transitions/animations for overlay effects

## Vignette

Dark edges that draw focus to the center:

```tsx
<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background:
      "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)",
  }}
/>
```

## Animated Vignette

Vignette that intensifies over time:

```tsx
const frame = useCurrentFrame();

const intensity = interpolate(frame, [0, 60], [0.3, 0.8], {
  extrapolateRight: "clamp",
});

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
  }}
/>;
```

## Scanline Overlay

CRT/retro scanline effect:

```tsx
const { height } = useVideoConfig();

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage: `repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.15) 2px,
    rgba(0,0,0,0.15) 4px
  )`,
    backgroundSize: "100% 4px",
  }}
/>;
```

## Color Tint Overlay

Apply a color wash with blend modes:

```tsx
const frame = useCurrentFrame();

const tintOpacity = interpolate(frame, [0, 30], [0, 0.3], {
  extrapolateRight: "clamp",
});

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    background: "#3B82F6",
    opacity: tintOpacity,
    mixBlendMode: "overlay",
  }}
/>;
```

## Glitch Effect

Horizontal slice displacement:

```tsx
const frame = useCurrentFrame();
const { height } = useVideoConfig();

const isGlitching = frame % 30 < 3; // Glitch for 3 frames every 30

const slices = isGlitching
  ? Array.from({ length: 5 }, (_, i) => ({
      top: random("glitch-y-" + i + "-" + frame) * height,
      height: 5 + random("glitch-h-" + i + "-" + frame) * 30,
      offset: (random("glitch-x-" + i + "-" + frame) - 0.5) * 40,
    }))
  : [];

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
  }}
>
  {slices.map((slice, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: slice.offset,
        top: slice.top,
        right: -slice.offset,
        height: slice.height,
        background: `rgba(255,0,0,0.1)`,
        mixBlendMode: "screen",
      }}
    />
  ))}
</div>;
```

## Gradient Border / Glow

Glowing border around the frame:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const glowOpacity = spring({ frame, fps, config: { damping: 20 } });

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    boxShadow: `inset 0 0 80px rgba(59,130,246,${glowOpacity * 0.5})`,
  }}
/>;
```

## Blend Mode Reference

Common `mixBlendMode` values for compositing:

- `"screen"` — brightens, good for light leaks and glows
- `"overlay"` — increases contrast, good for color tints
- `"multiply"` — darkens, good for shadows and textures
- `"color-dodge"` — intense brightening, good for highlights
- `"soft-light"` — subtle tinting, good for mood
