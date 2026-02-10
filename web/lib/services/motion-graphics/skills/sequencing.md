---
name: sequencing
description: Timing and sequencing - staggered animations, choreographed entrances, timeline control
tags: sequencing, timing, stagger, choreography, delay, timeline, order
---

# Sequencing & Timing Patterns

Control the timing and order of animations for polished, professional results.

## Basic Sequence Component

Use Sequence to control when elements appear.

```tsx
import { Sequence } from "remotion";

<AbsoluteFill>
  <Sequence from={0} durationInFrames={60}>
    <Title />
  </Sequence>
  <Sequence from={30} durationInFrames={90}>
    <Subtitle />
  </Sequence>
  <Sequence from={60}>
    <MainContent />
  </Sequence>
</AbsoluteFill>;
```

## Stagger Pattern

Animate multiple items with consistent delays.

```tsx
const ITEMS = ["First", "Second", "Third", "Fourth"];
const STAGGER_FRAMES = 8;

{
  ITEMS.map((item, index) => {
    const startFrame = index * STAGGER_FRAMES;

    return (
      <Sequence from={startFrame} key={item}>
        <AnimatedItem text={item} />
      </Sequence>
    );
  });
}
```

## Calculated Delays

Calculate delays based on item properties.

```tsx
const ITEMS = [
  { text: "A", column: 0, row: 0 },
  { text: "B", column: 1, row: 0 },
  { text: "C", column: 0, row: 1 },
  { text: "D", column: 1, row: 1 },
];

// Diagonal wave pattern
{
  ITEMS.map((item, i) => {
    const delay = (item.column + item.row) * 5;
    const progress = spring({
      frame: frame - delay,
      fps,
      config: { damping: 15, stiffness: 100 },
    });

    return <div style={{ opacity: Math.max(0, progress) }}>{item.text}</div>;
  });
}
```

## Reverse Stagger (Exit Animation)

```tsx
const EXIT_START = 90;
const ITEMS_COUNT = 4;
const STAGGER = 5;

{
  ITEMS.map((item, i) => {
    // Reverse order: last item exits first
    const exitDelay = (ITEMS_COUNT - 1 - i) * STAGGER;
    const exitFrame = EXIT_START + exitDelay;

    const exitProgress = interpolate(
      frame,
      [exitFrame, exitFrame + 15],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );

    return <div style={{ opacity: exitProgress }}>{item}</div>;
  });
}
```

## Phase-Based Animation

Different animation phases with distinct behaviors.

```tsx
const PHASE_1_END = 30;
const PHASE_2_END = 90;
const PHASE_3_END = 120;

// Determine current phase
const phase =
  frame < PHASE_1_END
    ? 1
    : frame < PHASE_2_END
      ? 2
      : frame < PHASE_3_END
        ? 3
        : 4;

// Local frame within phase
const phaseFrame =
  phase === 1
    ? frame
    : phase === 2
      ? frame - PHASE_1_END
      : phase === 3
        ? frame - PHASE_2_END
        : frame - PHASE_3_END;

// Animate based on phase
const scale =
  phase === 1
    ? spring({ frame: phaseFrame, fps, config: { damping: 15 } })
    : phase === 3
      ? interpolate(phaseFrame, [0, 15], [1, 0])
      : 1;
```

## Entrance → Hold → Exit Pattern

Common pattern for temporary elements.

```tsx
const ENTRANCE_DURATION = 20;
const HOLD_DURATION = 60;
const EXIT_DURATION = 20;
const TOTAL = ENTRANCE_DURATION + HOLD_DURATION + EXIT_DURATION;

const entranceEnd = ENTRANCE_DURATION;
const exitStart = ENTRANCE_DURATION + HOLD_DURATION;

const opacity =
  frame < entranceEnd
    ? interpolate(frame, [0, entranceEnd], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : frame < exitStart
      ? 1
      : interpolate(frame, [exitStart, TOTAL], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

const translateY =
  frame < entranceEnd
    ? interpolate(frame, [0, entranceEnd], [30, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : frame < exitStart
      ? 0
      : interpolate(frame, [exitStart, TOTAL], [0, -30], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
```

## Parallel vs Sequential

### Parallel (all start together)

```tsx
{
  ITEMS.map((item, i) => <AnimatedItem key={i} startFrame={0} />);
}
```

### Sequential (one after another)

```tsx
{
  ITEMS.map((item, i) => (
    <AnimatedItem key={i} startFrame={i * ITEM_DURATION} />
  ));
}
```

### Overlapping (start before previous ends)

```tsx
const ITEM_DURATION = 30;
const OVERLAP = 10;

{
  ITEMS.map((item, i) => (
    <AnimatedItem key={i} startFrame={i * (ITEM_DURATION - OVERLAP)} />
  ));
}
```

## Series Component

Use Series for back-to-back sequences.

```tsx
import { Series } from "remotion";

<Series>
  <Series.Sequence durationInFrames={60}>
    <Intro />
  </Series.Sequence>
  <Series.Sequence durationInFrames={90}>
    <MainContent />
  </Series.Sequence>
  <Series.Sequence durationInFrames={30}>
    <Outro />
  </Series.Sequence>
</Series>;
```

## Loop-Based Timing

For repeating animations.

```tsx
const LOOP_DURATION = 60;
const loopFrame = frame % LOOP_DURATION;
const loopProgress = loopFrame / LOOP_DURATION;

// Ping-pong (0→1→0)
const pingPong = loopProgress < 0.5 ? loopProgress * 2 : 2 - loopProgress * 2;
```
