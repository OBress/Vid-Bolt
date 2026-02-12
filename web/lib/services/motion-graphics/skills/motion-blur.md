---
name: motion-blur
description: Motion blur and trail effects for Remotion. Use when adding speed trails, blur on fast-moving elements, or directional blur effects.
tags: motion-blur, blur, trail, speed, streak, smear
---

# Motion Blur & Trail Effects

Speed trails and directional blur using CSS filters and layered opacity, driven by `useCurrentFrame()`.

## Rules

- ✅ Use CSS `filter: blur()` for simple directional blur
- ✅ Layer multiple offset copies with decreasing opacity for trail effects
- ✅ Drive blur amount from velocity (frame delta) for realistic motion blur
- ❌ NEVER use CSS transitions for blur — drive all values from `useCurrentFrame()`

## Speed Trail

Layered copies of an element trailing behind its current position:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const TRAIL_COUNT = 5;
const x = interpolate(frame, [0, 60], [-200, 800], {
  extrapolateRight: "clamp",
});

<div style={{ position: "relative" }}>
  {Array.from({ length: TRAIL_COUNT }, (_, i) => {
    const trailOffset = (i + 1) * 15;
    const trailOpacity = interpolate(i, [0, TRAIL_COUNT], [0.3, 0.05]);

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          transform: `translateX(${x - trailOffset}px)`,
          opacity: trailOpacity,
          filter: `blur(${i * 2}px)`,
        }}
      >
        {/* Trailing copy of element */}
      </div>
    );
  })}

  {/* Main element */}
  <div style={{ transform: `translateX(${x}px)` }}>{/* Primary element */}</div>
</div>;
```

## Directional Blur

Apply blur in the direction of movement:

```tsx
const frame = useCurrentFrame();

const speed = interpolate(frame, [0, 30, 60], [0, 1, 0], {
  extrapolateRight: "clamp",
});

const blurAmount = speed * 12;

<div
  style={{
    filter: `blur(${blurAmount}px)`,
    transform: `scaleX(${1 + speed * 0.1})`,
  }}
>
  {/* Element blurs when moving fast */}
</div>;
```

## Zoom Blur (Radial Speed)

Simulate camera zoom speed burst:

```tsx
const frame = useCurrentFrame();

const zoomSpeed = interpolate(frame, [20, 30], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
const zoomBlur = zoomSpeed * 8;
const zoomScale = 1 + zoomSpeed * 0.05;

<div
  style={{
    filter: `blur(${zoomBlur}px)`,
    transform: `scale(${zoomScale})`,
    transformOrigin: "center",
  }}
>
  {/* Content with zoom blur */}
</div>;
```

## Ghost Trail (Fading Afterimages)

Multiple afterimages at previous positions:

```tsx
const frame = useCurrentFrame();

const GHOST_COUNT = 4;
const currentX = interpolate(frame, [0, 90], [0, 600]);
const currentY = interpolate(frame, [0, 90], [300, 100]);

{
  Array.from({ length: GHOST_COUNT }, (_, i) => {
    const ghostFrame = Math.max(0, frame - (i + 1) * 3);
    const gx = interpolate(ghostFrame, [0, 90], [0, 600]);
    const gy = interpolate(ghostFrame, [0, 90], [300, 100]);

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: gx,
          top: gy,
          opacity: 0.3 - i * 0.06,
          filter: `blur(${(i + 1) * 1.5}px)`,
        }}
      >
        {/* Ghost copy */}
      </div>
    );
  });
}
```
