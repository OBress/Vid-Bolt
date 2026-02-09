---
name: transitions
description: Scene transitions - fades, slides, wipes, crossfades between scenes
tags: transitions, fade, slide, wipe, crossfade, scenes, cuts
---

# Scene Transition Patterns

## Using TransitionSeries

TransitionSeries is the preferred way to handle multi-scene animations with transitions.

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={60}>
    <Scene1 />
  </TransitionSeries.Sequence>
  
  <TransitionSeries.Transition
    timing={linearTiming({ durationInFrames: 15 })}
    presentation={fade()}
  />
  
  <TransitionSeries.Sequence durationInFrames={60}>
    <Scene2 />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

## Available Transition Effects

### Fade
```tsx
import { fade } from "@remotion/transitions/fade";
<TransitionSeries.Transition
  timing={linearTiming({ durationInFrames: 20 })}
  presentation={fade()}
/>
```

### Slide
```tsx
import { slide } from "@remotion/transitions/slide";
<TransitionSeries.Transition
  timing={linearTiming({ durationInFrames: 20 })}
  presentation={slide({ direction: 'from-left' })}
/>
// Directions: 'from-left', 'from-right', 'from-top', 'from-bottom'
```

### Wipe
```tsx
import { wipe } from "@remotion/transitions/wipe";
<TransitionSeries.Transition
  timing={linearTiming({ durationInFrames: 20 })}
  presentation={wipe({ direction: 'from-left' })}
/>
```

### Flip
```tsx
import { flip } from "@remotion/transitions/flip";
<TransitionSeries.Transition
  timing={linearTiming({ durationInFrames: 20 })}
  presentation={flip({ direction: 'from-left' })}
/>
```

### Clock Wipe
```tsx
import { clockWipe } from "@remotion/transitions/clock-wipe";
<TransitionSeries.Transition
  timing={linearTiming({ durationInFrames: 30 })}
  presentation={clockWipe()}
/>
```

## Spring Timing

Use spring timing for more organic transitions.

```tsx
import { springTiming } from "@remotion/transitions";

<TransitionSeries.Transition
  timing={springTiming({
    config: { damping: 200, stiffness: 100 }
  })}
  presentation={slide({ direction: 'from-bottom' })}
/>
```

## Manual Crossfade

When not using TransitionSeries, implement crossfade manually.

```tsx
const SCENE_1_END = 60;
const TRANSITION_DURATION = 15;

const scene1Opacity = interpolate(
  frame,
  [SCENE_1_END - TRANSITION_DURATION, SCENE_1_END],
  [1, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

const scene2Opacity = interpolate(
  frame,
  [SCENE_1_END - TRANSITION_DURATION, SCENE_1_END],
  [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
);

<AbsoluteFill>
  <AbsoluteFill style={{ opacity: scene1Opacity }}>
    <Scene1 />
  </AbsoluteFill>
  <AbsoluteFill style={{ opacity: scene2Opacity }}>
    <Scene2 />
  </AbsoluteFill>
</AbsoluteFill>
```

## Zoom Transition

Zoom into scene 1, zoom out into scene 2.

```tsx
const MIDPOINT = 60;

const scale = frame < MIDPOINT
  ? interpolate(frame, [MIDPOINT - 20, MIDPOINT], [1, 3])
  : interpolate(frame, [MIDPOINT, MIDPOINT + 20], [3, 1]);

const opacity = frame < MIDPOINT
  ? interpolate(frame, [MIDPOINT - 10, MIDPOINT], [1, 0])
  : interpolate(frame, [MIDPOINT, MIDPOINT + 10], [0, 1]);

<AbsoluteFill style={{
  transform: `scale(${scale})`,
  opacity,
}}>
  {frame < MIDPOINT ? <Scene1 /> : <Scene2 />}
</AbsoluteFill>
```

## Slide with Scale

Combine slide with scale for dynamic entrance.

```tsx
const enterProgress = spring({
  frame,
  fps,
  config: { damping: 18, stiffness: 80 }
});

const translateX = interpolate(enterProgress, [0, 1], [100, 0]);
const scale = interpolate(enterProgress, [0, 1], [0.8, 1]);
const opacity = enterProgress;

<div style={{
  transform: `translateX(${translateX}%) scale(${scale})`,
  opacity,
}}>
```

## Multiple Scenes with Sequence

Use Sequence for timed scene changes without transitions.

```tsx
<AbsoluteFill>
  <Sequence from={0} durationInFrames={60}>
    <Scene1 />
  </Sequence>
  <Sequence from={60} durationInFrames={60}>
    <Scene2 />
  </Sequence>
  <Sequence from={120}>
    <Scene3 />
  </Sequence>
</AbsoluteFill>
```
