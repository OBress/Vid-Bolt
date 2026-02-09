---
name: lottie
description: Embedding Lottie animations in Remotion - loading, displaying, styling
tags: lottie, animation, json, after-effects, bodymovin
---

# Using Lottie Animations

Lottie is a format for vector animations exported from After Effects.

## Basic Usage

```tsx
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';

export const MyAnimation = () => {
  const [handle] = useState(() => delayRender('Loading Lottie animation'));
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    fetch('https://assets4.lottiefiles.com/packages/lf20_zyquagfl.json')
      .then((data) => data.json())
      .then((json) => {
        setAnimationData(json);
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });
  }, [handle]);

  if (!animationData) {
    return null;
  }

  return <Lottie animationData={animationData} />;
};
```

## Critical Pattern

Always use `delayRender()` and `continueRender()` when loading Lottie data:

1. `delayRender()` - Tells Remotion to wait before rendering
2. `continueRender()` - Tells Remotion the data is ready
3. `cancelRender()` - Handle errors gracefully

## Styling and Sizing

```tsx
<Lottie
  animationData={animationData}
  style={{
    width: 400,
    height: 400,
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }}
/>
```

## Playback Control

Control the playback progress based on Remotion's frame:

```tsx
const frame = useCurrentFrame();
const { durationInFrames } = useVideoConfig();

// Map frame to Lottie progress (0-1)
const progress = frame / durationInFrames;

<Lottie
  animationData={animationData}
  playbackRate={1}
  // You can also control specific segments
/>
```

## Local Lottie Files

For local files, place them in `public/` and use `staticFile()`:

```tsx
import { staticFile } from 'remotion';

fetch(staticFile('animation.json'))
  .then((data) => data.json())
  .then((json) => {
    setAnimationData(json);
    continueRender(handle);
  });
```

## Finding Lottie Animations

- LottieFiles: https://lottiefiles.com/
- IconScout: https://iconscout.com/lottie-animations
- LottieFlow: https://lottieflow.com/
