---
name: audio
description: Using audio and sound in Remotion - importing, trimming, volume, speed
tags: audio, media, sound, music, sfx, volume
---

# Using Audio in Remotion

## Basic Usage

```tsx
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";

export const MyComposition = () => {
  return <Audio src={staticFile("audio.mp3")} />;
};
```

Remote URLs are also supported:

```tsx
<Audio src="https://example.com/audio.mp3" />
```

Multiple audio tracks can be layered by adding multiple `<Audio>` components.

## Trimming

Use `trimBefore` and `trimAfter` to play only a portion. Values are in frames.

```tsx
const { fps } = useVideoConfig();

<Audio
  src={staticFile("audio.mp3")}
  trimBefore={2 * fps}  // Skip first 2 seconds
  trimAfter={10 * fps}  // End at 10 seconds
/>
```

## Delaying

Wrap in `<Sequence>` to delay when audio starts:

```tsx
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";

const { fps } = useVideoConfig();

<Sequence from={1 * fps}>
  <Audio src={staticFile("audio.mp3")} />
</Sequence>
```

## Volume

Static volume (0 to 1):

```tsx
<Audio src={staticFile("audio.mp3")} volume={0.5} />
```

Dynamic volume (fade in):

```tsx
<Audio
  src={staticFile("audio.mp3")}
  volume={(f) =>
    interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })
  }
/>
```

## Muting

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

<Audio
  src={staticFile("audio.mp3")}
  muted={frame >= 2 * fps && frame <= 4 * fps}  // Mute between 2s and 4s
/>
```

## Playback Speed

```tsx
<Audio src={staticFile("audio.mp3")} playbackRate={2} />   {/* 2x speed */}
<Audio src={staticFile("audio.mp3")} playbackRate={0.5} /> {/* Half speed */}
```

## Looping

```tsx
<Audio src={staticFile("audio.mp3")} loop />
```
