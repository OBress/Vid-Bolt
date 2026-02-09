---
name: gifs
description: Displaying GIFs, APNG, AVIF and WebP animations in Remotion
tags: gif, animation, animated, apng, avif, webp
---

# Using Animated Images in Remotion

## Basic Usage

Use `<AnimatedImage>` to display a GIF, APNG, AVIF or WebP synchronized with Remotion's timeline:

```tsx
import { AnimatedImage, staticFile } from 'remotion';

export const MyComposition = () => {
  return <AnimatedImage src={staticFile('animation.gif')} width={500} height={500} />;
};
```

Remote URLs are also supported (must have CORS enabled):

```tsx
<AnimatedImage src="https://example.com/animation.gif" width={500} height={500} />
```

## Sizing and Fit

Control how the image fills its container:

```tsx
// Stretch to fill (default)
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="fill" />

// Maintain aspect ratio, fit inside container
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="contain" />

// Fill container, crop if needed
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="cover" />
```

## Playback Speed

```tsx
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={2} />   {/* 2x speed */}
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={0.5} /> {/* Half speed */}
```

## Looping Behavior

```tsx
// Loop indefinitely (default)
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="loop" />

// Play once, show final frame
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="pause-after-finish" />

// Play once, then clear
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="clear-after-finish" />
```

## Styling

```tsx
<AnimatedImage
  src={staticFile('animation.gif')}
  width={500}
  height={500}
  style={{
    borderRadius: 20,
    position: 'absolute',
    top: 100,
    left: 50,
  }}
/>
```

## Alternative: @remotion/gif

If `<AnimatedImage>` doesn't work (only Chrome/Firefox), use `<Gif>`:

```tsx
import { Gif } from '@remotion/gif';
import { staticFile } from 'remotion';

<Gif src={staticFile('animation.gif')} width={500} height={500} />
```
