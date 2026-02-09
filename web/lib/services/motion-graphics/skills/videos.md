---
name: videos
description: Embedding videos in Remotion - trimming, volume, speed, looping
tags: video, media, trim, volume, speed, loop, embed
---

# Using Videos in Remotion

## Basic Usage

```tsx
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

export const MyComposition = () => {
  return <Video src={staticFile("video.mp4")} />;
};
```

Remote URLs are also supported:

```tsx
<Video src="https://example.com/video.mp4" />
```

## Trimming

Use `trimBefore` and `trimAfter` to remove portions. Values are in frames.

```tsx
const { fps } = useVideoConfig();

<Video
  src={staticFile("video.mp4")}
  trimBefore={2 * fps}  // Skip first 2 seconds
  trimAfter={10 * fps}  // End at 10 seconds
/>
```

## Delaying

Wrap in `<Sequence>` to delay appearance:

```tsx
import { Sequence, staticFile } from "remotion";
import { Video } from "@remotion/media";

const { fps } = useVideoConfig();

<Sequence from={1 * fps}>
  <Video src={staticFile("video.mp4")} />
</Sequence>
```

## Sizing and Position

```tsx
<Video
  src={staticFile("video.mp4")}
  style={{
    width: 500,
    height: 300,
    position: "absolute",
    top: 100,
    left: 50,
    objectFit: "cover",
  }}
/>
```

## Volume

Static volume (0 to 1):

```tsx
<Video src={staticFile("video.mp4")} volume={0.5} />
```

Dynamic volume:

```tsx
<Video
  src={staticFile("video.mp4")}
  volume={(f) =>
    interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })
  }
/>
```

Mute entirely:

```tsx
<Video src={staticFile("video.mp4")} muted />
```

## Playback Speed

```tsx
<Video src={staticFile("video.mp4")} playbackRate={2} />   {/* 2x speed */}
<Video src={staticFile("video.mp4")} playbackRate={0.5} /> {/* Half speed */}
```

## Looping

```tsx
<Video src={staticFile("video.mp4")} loop />
```
