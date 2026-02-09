---
name: shapes
description: Using @remotion/shapes for vector shapes - circles, rectangles, triangles, stars
tags: shapes, svg, circle, rect, triangle, star, polygon, vector
---

# Shapes in Remotion

Use `@remotion/shapes` for animated vector shapes.

## Available Shapes

```tsx
import { Circle, Rect, Triangle, Star, Ellipse, Pie, Polygon } from "@remotion/shapes";
```

## Circle

```tsx
<Circle
  radius={100}
  fill="#3B82F6"
  stroke="#1E40AF"
  strokeWidth={4}
/>
```

## Rectangle

```tsx
<Rect
  width={200}
  height={100}
  fill="#10B981"
  cornerRadius={12}
/>
```

## Triangle

```tsx
<Triangle
  length={150}
  direction="up"
  fill="#F59E0B"
/>
// Directions: "up", "down", "left", "right"
```

## Star

```tsx
<Star
  innerRadius={50}
  outerRadius={100}
  points={5}
  fill="#EF4444"
/>
```

## Ellipse

```tsx
<Ellipse
  rx={100}
  ry={60}
  fill="#8B5CF6"
/>
```

## Pie (Arc)

```tsx
<Pie
  radius={100}
  progress={0.75}
  fill="#EC4899"
  rotation={-90}  // Start from top
/>
```

## Animating Shapes

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 12, stiffness: 100 }
});

const rotation = interpolate(frame, [0, 60], [0, 360]);

<div style={{
  transform: `scale(${scale}) rotate(${rotation}deg)`,
  transformOrigin: 'center',
}}>
  <Star
    innerRadius={30}
    outerRadius={60}
    points={5}
    fill="#FFD700"
  />
</div>
```

## Staggered Shapes

```tsx
const SHAPES = [
  { Shape: Circle, color: '#EF4444', props: { radius: 40 } },
  { Shape: Triangle, color: '#3B82F6', props: { length: 80, direction: 'up' } },
  { Shape: Rect, color: '#10B981', props: { width: 80, height: 80 } },
];

{SHAPES.map(({ Shape, color, props }, i) => {
  const delay = i * 10;
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 }
  });
  
  return (
    <div style={{ transform: `scale(${Math.max(0, scale)})` }}>
      <Shape {...props} fill={color} />
    </div>
  );
})}
```

## SVG Path Alternative

For custom shapes, use SVG directly:

```tsx
<svg width={200} height={200} viewBox="0 0 200 200">
  <path
    d="M100 10 L190 190 L10 190 Z"
    fill="#3B82F6"
    stroke="#1E40AF"
    strokeWidth={2}
  />
</svg>
```
