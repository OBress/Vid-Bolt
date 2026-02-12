---
name: particles
description: Deterministic particle system patterns for Remotion. Use when creating confetti, snow, stars, bubbles, dust, sparkles, or floating elements.
tags: particles, confetti, snow, stars, bubbles, dust, sparkles, floating, rain
---

# Particle Systems

Deterministic particle effects using `random()` seeds and `useCurrentFrame()`.

## Rules

- ✅ Use `random("seed-" + i)` for position, size, speed — deterministic across renders
- ✅ Use `frame` for movement — particles advance smoothly each frame
- ✅ Use modulo (`%`) for looping particles back to start positions
- ❌ NEVER use `Math.random()` — breaks rendering determinism
- ❌ NEVER use `useState()` for particle state — derive everything from frame

## Floating Particles

Gently rising particles (bubbles, dust, embers):

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const PARTICLE_COUNT = 40;

const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const x = random("p-x-" + i) * width;
  const speed = 0.5 + random("p-speed-" + i) * 1.5;
  const size = 3 + random("p-size-" + i) * 6;
  const opacity = 0.2 + random("p-alpha-" + i) * 0.5;
  const drift =
    Math.sin(frame * 0.02 + random("p-phase-" + i) * Math.PI * 2) * 20;

  const y =
    height -
    ((frame * speed + random("p-offset-" + i) * height) % (height + 40));

  return { x: x + drift, y, size, opacity };
});

<div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
  {particles.map((p, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        width: p.size,
        height: p.size,
        borderRadius: "50%",
        background: `rgba(255,255,255,${p.opacity})`,
      }}
    />
  ))}
</div>;
```

## Confetti Burst

Confetti pieces that explode from a point and fall with gravity:

```tsx
const frame = useCurrentFrame();
const { fps, width, height } = useVideoConfig();

const CONFETTI_COUNT = 60;
const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#FFA07A",
  "#98D8C8",
  "#F7DC6F",
];

const progress = spring({ frame, fps, config: { damping: 30, stiffness: 80 } });

const confetti = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
  const angle = random("c-angle-" + i) * Math.PI * 2;
  const velocity = 200 + random("c-vel-" + i) * 400;
  const rotSpeed = (random("c-rot-" + i) - 0.5) * 20;
  const gravity = 0.15;
  const t = frame / fps;

  const x = width / 2 + Math.cos(angle) * velocity * progress * t * 0.3;
  const y =
    height / 2 +
    Math.sin(angle) * velocity * progress * t * 0.3 +
    gravity * t * t * 200;
  const rotation = frame * rotSpeed;
  const color = COLORS[i % COLORS.length];
  const scaleX = Math.cos(frame * 0.1 + random("c-flip-" + i) * Math.PI * 2);

  return { x, y, rotation, color, scaleX };
});

<div
  style={{
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
  }}
>
  {confetti.map((c, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: c.x,
        top: c.y,
        width: 10,
        height: 14,
        borderRadius: 2,
        background: c.color,
        transform: `rotate(${c.rotation}deg) scaleX(${c.scaleX})`,
      }}
    />
  ))}
</div>;
```

## Snow / Rain

Falling particles with drift:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const FLAKE_COUNT = 50;

const flakes = Array.from({ length: FLAKE_COUNT }, (_, i) => {
  const x = random("snow-x-" + i) * width;
  const speed = 0.8 + random("snow-speed-" + i) * 1.2;
  const size = 3 + random("snow-size-" + i) * 5;
  const drift =
    Math.sin(frame * 0.015 + random("snow-phase-" + i) * Math.PI * 2) * 30;

  const y =
    ((frame * speed + random("snow-start-" + i) * height) % (height + 20)) - 10;

  return { x: x + drift, y, size };
});

<div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
  {flakes.map((f, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: f.x,
        top: f.y,
        width: f.size,
        height: f.size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.8)",
      }}
    />
  ))}
</div>;
```

## Sparkle / Twinkle

Stars that fade in and out at random intervals:

```tsx
const frame = useCurrentFrame();
const { width, height } = useVideoConfig();

const SPARKLE_COUNT = 30;

const sparkles = Array.from({ length: SPARKLE_COUNT }, (_, i) => {
  const x = random("spark-x-" + i) * width;
  const y = random("spark-y-" + i) * height;
  const phase = random("spark-phase-" + i) * Math.PI * 2;
  const speed = 0.05 + random("spark-speed-" + i) * 0.1;
  const opacity = Math.max(0, Math.sin(frame * speed + phase));
  const size = 2 + random("spark-size-" + i) * 4;

  return { x, y, opacity, size };
});

<div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
  {sparkles.map((s, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: s.x,
        top: s.y,
        width: s.size,
        height: s.size,
        borderRadius: "50%",
        background: "#FFD700",
        boxShadow: `0 0 ${s.size * 2}px #FFD700`,
        opacity: s.opacity,
      }}
    />
  ))}
</div>;
```
