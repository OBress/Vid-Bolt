---
name: compositions
description: Defining compositions, stills, folders, default props in Remotion
tags: composition, still, folder, props, structure, setup
---

# Compositions in Remotion

A `<Composition>` defines the component, width, height, fps and duration of a renderable video.

## Basic Composition

```tsx
import { Composition } from 'remotion';
import { MyAnimation } from './MyAnimation';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyAnimation"
      component={MyAnimation}
      durationInFrames={100}
      fps={30}
      width={1080}
      height={1080}
    />
  );
};
```

## Default Props

Pass `defaultProps` to provide initial values:

```tsx
<Composition
  id="MyAnimation"
  component={MyAnimation}
  durationInFrames={100}
  fps={30}
  width={1080}
  height={1080}
  defaultProps={{
    title: 'Hello World',
    color: '#ff0000',
  }}
/>
```

## Common Dimensions

```tsx
// Square (Instagram, etc.)
width: 1080, height: 1080

// Landscape (YouTube, etc.)
width: 1920, height: 1080

// Vertical (TikTok, Stories, Reels)
width: 1080, height: 1920

// Portrait (Instagram Portrait)
width: 1080, height: 1350
```

## Frame Rates

```tsx
// Standard
fps: 30

// Smooth/Cinematic
fps: 60

// Film-like
fps: 24
```

## Using useVideoConfig()

Inside your component, get composition settings:

```tsx
import { useVideoConfig } from 'remotion';

const { width, height, fps, durationInFrames } = useVideoConfig();

// Calculate timing
const halfwayPoint = durationInFrames / 2;
const oneSecondInFrames = fps;
```

## Stills

For single-frame images (thumbnails), use `<Still>`:

```tsx
import { Still } from 'remotion';

<Still
  id="Thumbnail"
  component={Thumbnail}
  width={1280}
  height={720}
/>
```
