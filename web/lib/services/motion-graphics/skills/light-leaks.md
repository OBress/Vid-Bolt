---
name: light-leaks
description: Light leak overlay effects for Remotion using @remotion/light-leaks. Use when adding cinematic light effects, warm glows, or transition overlays.
tags: light-leaks, lens-flare, glow, cinematic, overlay, warm, webgl
---

# Light Leak Effects

WebGL-based light leak overlays using `@remotion/light-leaks`.

## Rules

- ✅ Import `LightLeak` from `@remotion/light-leaks`
- ✅ `<LightLeak>` reveals during the first half of its duration, retracts during the second half
- ✅ Use inside `TransitionSeries.Overlay` for scene transitions
- ✅ Use standalone as a decorative overlay in any composition
- ✅ Use `pointerEvents: 'none'` when layering over interactive content

## Import

```tsx
import { LightLeak } from "@remotion/light-leaks";
```

## Basic Usage with TransitionSeries

Play a light leak effect over the cut point between two scenes:

```tsx
import { TransitionSeries } from "@remotion/transitions";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneA />
  </TransitionSeries.Sequence>
  <TransitionSeries.Overlay durationInFrames={30}>
    <LightLeak />
  </TransitionSeries.Overlay>
  <TransitionSeries.Sequence durationInFrames={60}>
    <SceneB />
  </TransitionSeries.Sequence>
</TransitionSeries>;
```

## Props

- `durationInFrames?` — defaults to parent sequence/composition duration. Reveals first half, retracts second half.
- `seed?` — determines the shape of the light leak pattern. Different seeds = different patterns. Default: `0`.
- `hueShift?` — rotates the hue in degrees (`0`–`360`). Default: `0` (yellow-orange). `120` = green, `240` = blue.

## Customizing the Look

```tsx
// Blue-tinted light leak with a different pattern
<LightLeak seed={5} hueShift={240} />

// Green-tinted light leak
<LightLeak seed={2} hueShift={120} />

// Warm pink/red
<LightLeak seed={3} hueShift={340} />
```

## Standalone Overlay

Use as a decorative overlay on any composition:

```tsx
<AbsoluteFill>
  {/* Your content */}
  <MyContent />

  {/* Light leak overlay */}
  <LightLeak durationInFrames={60} seed={3} />
</AbsoluteFill>
```

## Multiple Light Leaks

Layer several leaks with different timings for a rich effect:

```tsx
<AbsoluteFill>
  <MyContent />

  <Sequence from={0} durationInFrames={45}>
    <LightLeak seed={1} hueShift={20} />
  </Sequence>
  <Sequence from={30} durationInFrames={45}>
    <LightLeak seed={4} hueShift={50} />
  </Sequence>
</AbsoluteFill>
```

## CSS Fallback — Radial Gradient Light Leak

For simpler effects without WebGL, use CSS radial gradients:

```tsx
const frame = useCurrentFrame();
const { durationInFrames } = useVideoConfig();

const midpoint = durationInFrames / 2;
const progress =
  frame < midpoint
    ? interpolate(frame, [0, midpoint], [0, 1], { extrapolateRight: "clamp" })
    : interpolate(frame, [midpoint, durationInFrames], [1, 0], {
        extrapolateRight: "clamp",
      });

<div
  style={{
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    mixBlendMode: "screen",
    opacity: progress * 0.7,
  }}
>
  <div
    style={{
      position: "absolute",
      top: "30%",
      left: "60%",
      width: "80%",
      height: "80%",
      borderRadius: "50%",
      background:
        "radial-gradient(circle, rgba(255,200,50,0.8) 0%, rgba(255,120,20,0.4) 40%, transparent 70%)",
      transform: `scale(${0.3 + progress * 1.2})`,
      filter: "blur(40px)",
    }}
  />
</div>;
```
