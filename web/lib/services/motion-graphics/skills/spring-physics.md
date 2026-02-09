---
name: spring-physics
description: Spring animations - bouncy motion, elastic effects, natural physics, organic movement
tags: spring, physics, bounce, elastic, organic, natural, motion
---

# Spring Physics Patterns

Spring animations create natural, organic motion that feels alive. Use springs for entrances, interactions, and any motion that should feel physical.

## Spring Configuration Guide

### Presets

```tsx
// Smooth entrance (default feel)
const SMOOTH = { damping: 18, stiffness: 80 };

// Snappy/quick (UI interactions)
const SNAPPY = { damping: 200, stiffness: 300 };

// Bouncy (playful, attention-grabbing)
const BOUNCY = { damping: 10, stiffness: 100 };

// Gentle (slow, elegant)
const GENTLE = { damping: 30, stiffness: 40 };

// Wobbly (cartoon-like)
const WOBBLY = { damping: 8, stiffness: 150 };
```

### Parameter Effects

- **damping**: Higher = less oscillation, lower = more bounce
- **stiffness**: Higher = faster initial movement, lower = slower start

## Basic Spring Entrance

```tsx
const progress = spring({
  frame,
  fps,
  config: { damping: 18, stiffness: 80 }
});

const translateY = interpolate(progress, [0, 1], [50, 0]);
const opacity = progress;

<div style={{
  transform: `translateY(${translateY}px)`,
  opacity,
}}>
```

## Scale Bounce

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 10, stiffness: 100 }
});

<div style={{ transform: `scale(${scale})` }}>
```

## Delayed Spring (Stagger)

```tsx
const ITEMS = ['A', 'B', 'C', 'D'];
const STAGGER = 5;

{ITEMS.map((item, i) => {
  const delay = i * STAGGER;
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 }
  });
  
  // Clamp to prevent negative values
  const safeProgress = Math.max(0, progress);
  
  return (
    <div style={{
      opacity: safeProgress,
      transform: `scale(${safeProgress})`,
    }}>
      {item}
    </div>
  );
})}
```

## Overshoot Effect

Low damping creates overshoot (goes past target then settles).

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 8, stiffness: 150 }
});

// Scale will briefly exceed 1.0 before settling
<div style={{ transform: `scale(${scale})` }}>
```

## Chained Springs

Animate multiple properties with different spring configs for richness.

```tsx
const scaleProgress = spring({
  frame,
  fps,
  config: { damping: 12, stiffness: 100 }
});

const rotateProgress = spring({
  frame: frame - 5, // Slight delay
  fps,
  config: { damping: 18, stiffness: 80 }
});

const rotation = interpolate(rotateProgress, [0, 1], [-15, 0]);

<div style={{
  transform: `scale(${Math.max(0, scaleProgress)}) rotate(${rotation}deg)`,
}}>
```

## Shake/Wiggle Effect

Use sin wave modulated by spring decay.

```tsx
const decayProgress = spring({
  frame,
  fps,
  config: { damping: 20, stiffness: 200 }
});

const shakeIntensity = interpolate(decayProgress, [0, 1], [15, 0]);
const shake = Math.sin(frame * 0.5) * shakeIntensity;

<div style={{ transform: `translateX(${shake}px)` }}>
```

## Elastic Pull and Release

```tsx
const PULL_END = 30;
const RELEASE_START = 30;

const pullX = frame < PULL_END
  ? interpolate(frame, [0, PULL_END], [0, -50])
  : 0;

const releaseProgress = spring({
  frame: frame - RELEASE_START,
  fps,
  config: { damping: 8, stiffness: 200 }
});

const releaseX = frame >= RELEASE_START
  ? interpolate(releaseProgress, [0, 1], [-50, 0])
  : 0;

<div style={{
  transform: `translateX(${pullX + releaseX}px)`,
}}>
```

## Spring-Driven Counter

```tsx
const progress = spring({
  frame,
  fps,
  config: { damping: 100, stiffness: 50 }
});

const value = Math.round(progress * TARGET_VALUE);

<span style={{ fontVariantNumeric: 'tabular-nums' }}>
  {value.toLocaleString()}
</span>
```

## Attention Bounce

Quick bounce to draw attention.

```tsx
const BOUNCE_START = 30;
const bounceProgress = spring({
  frame: frame - BOUNCE_START,
  fps,
  config: { damping: 10, stiffness: 300 }
});

const scale = frame >= BOUNCE_START
  ? 1 + interpolate(bounceProgress, [0, 0.5, 1], [0, 0.2, 0], {
      extrapolateRight: 'clamp'
    })
  : 1;

<div style={{ transform: `scale(${scale})` }}>
```
