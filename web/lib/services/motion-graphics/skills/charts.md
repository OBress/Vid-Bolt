---
name: charts
description: Data visualizations - bar charts, pie charts, line graphs, progress bars, statistics
tags: charts, data, visualization, bar-chart, pie-chart, graphs, statistics, progress
---

# Chart & Data Visualization Patterns

## Bar Chart Animations

Stagger bar entrances with 3-5 frame delays and use spring() for organic growth.

**Incorrect (all bars animate together):**
```tsx
const bars = data.map((item, i) => {
  const height = spring({ frame, fps });
  return <div style={{ height: height * item.value }} />;
});
```

**Correct (staggered entrances):**
```tsx
const STAGGER_DELAY = 5;

const bars = data.map((item, i) => {
  const delay = i * STAGGER_DELAY;
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 80 }
  });
  const height = progress * item.value;
  return <div style={{ height }} />;
});
```

## Always Include Axis Labels

Charts without axis labels are hard to read.

**Incorrect (no axis):**
```tsx
<div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
  {bars}
</div>
```

**Correct (with Y-axis):**
```tsx
const yAxisSteps = [0, 25, 50, 75, 100];

<div style={{ display: 'flex' }}>
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 8 }}>
    {yAxisSteps.reverse().map(step => (
      <span style={{ fontSize: 12, color: '#888' }}>{step}</span>
    ))}
  </div>
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, borderLeft: '1px solid #333' }}>
    {bars}
  </div>
</div>
```

## Value Labels

Show values inside or above bars, fading in after bar animates.

```tsx
const barHeight = normalizedHeight * progress;
const labelOpacity = interpolate(progress, [0.7, 1], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

<div style={{ height: barHeight, backgroundColor: COLOR_BAR, position: 'relative' }}>
  <span style={{
    position: 'absolute',
    top: -24,
    opacity: labelOpacity,
    fontSize: 12,
  }}>
    {item.value.toLocaleString()}
  </span>
</div>
```

## Pie Chart Animation

Animate segments using stroke-dashoffset, starting from 12 o'clock.

```tsx
const circumference = 2 * Math.PI * radius;
const segmentLength = (value / total) * circumference;

const progress = spring({ frame, fps, config: { damping: 200 } });
const offset = interpolate(progress, [0, 1], [segmentLength, 0]);

<circle
  r={radius}
  cx={center}
  cy={center}
  fill="none"
  stroke={color}
  strokeWidth={strokeWidth}
  strokeDasharray={`${segmentLength} ${circumference}`}
  strokeDashoffset={offset}
  transform={`rotate(-90 ${center} ${center})`}
/>
```

## Progress Bar Animation

Smooth progress bar with percentage counter.

```tsx
const progress = interpolate(frame, [0, 90], [0, targetPercent], {
  extrapolateRight: 'clamp',
});

const displayPercent = Math.round(progress);

<div style={{ width: '100%', height: 24, backgroundColor: '#333', borderRadius: 12 }}>
  <div style={{
    width: `${progress}%`,
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
  }} />
</div>
<span>{displayPercent}%</span>
```

## Line Graph Animation

Draw lines progressively using SVG path animation.

```tsx
const pathLength = calculatePathLength(points);
const drawProgress = interpolate(frame, [0, 60], [0, 1], {
  extrapolateRight: 'clamp',
});

<path
  d={pathData}
  fill="none"
  stroke="#3B82F6"
  strokeWidth={2}
  strokeDasharray={pathLength}
  strokeDashoffset={pathLength * (1 - drawProgress)}
/>
```

## Counter Animation

Animate numbers counting up.

```tsx
const progress = interpolate(frame, [0, 60], [0, 1], {
  extrapolateRight: 'clamp',
});
const displayValue = Math.round(progress * targetValue);

<span style={{ fontVariantNumeric: 'tabular-nums' }}>
  {displayValue.toLocaleString()}
</span>
```
