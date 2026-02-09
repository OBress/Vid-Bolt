---
name: audio-visualization
description: Create audio-reactive visualizations (spectrum bars, waveforms, bass effects)
keywords:
  [audio, spectrum, waveform, visualiz, bass, equalizer, frequency, beat]
---

# Audio Visualization in Remotion

## Using @remotion/media-utils

```tsx
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  interpolate,
} from "remotion";
import { Audio } from "@remotion/media";
import {
  getAudioData,
  useAudioData,
  visualizeAudio,
} from "@remotion/media-utils";
```

## Spectrum Bars Pattern

```tsx
export const SpectrumBars = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Simulate audio data with deterministic values
  import { random } from "remotion";

  const BAR_COUNT = 32;
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
    const baseHeight = random("bar-" + i) * 0.6 + 0.2;
    const pulse = Math.sin(
      (frame / fps) * Math.PI * 2 * (random("freq-" + i) * 2 + 1),
    );
    return baseHeight + pulse * 0.3;
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "flex-end",
        alignItems: "center",
        flexDirection: "row",
        padding: 40,
        gap: 4,
      }}
    >
      {bars.map((height, i) => (
        <div
          key={i}
          style={{
            width: `${100 / BAR_COUNT - 1}%`,
            height: `${Math.abs(height) * 60}%`,
            backgroundColor: `hsl(${(i / BAR_COUNT) * 120 + 200}, 80%, 60%)`,
            borderRadius: 4,
            transition: "none", // CSS transitions are FORBIDDEN in Remotion
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
```

## Rules

- ✅ Use `random()` from "remotion" for deterministic bar heights
- ✅ Use Math.sin/cos for smooth oscillation driven by frame
- ❌ NEVER use CSS transitions or animations for bar movement
- ❌ NEVER use Math.random() — renders differently each time
- ✅ Derive ALL visual changes from `useCurrentFrame()`
