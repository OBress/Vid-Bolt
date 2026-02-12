---
name: captions
description: Animated captions and subtitle patterns for Remotion. Use when creating word-by-word captions, subtitle overlays, karaoke-style text, or TikTok-style captions.
tags: captions, subtitles, text, word-by-word, karaoke, tiktok, srt
---

# Captions & Subtitles

Animated caption patterns for social media content, driven by `useCurrentFrame()`.

## Rules

- ✅ Define caption data as an array of `{ text, startFrame, endFrame }` objects
- ✅ Use `interpolate()` or `spring()` for entrance animations
- ✅ Highlight the current word with color/scale changes
- ✅ Position captions in the lower third (bottom 20%) with safe-zone padding
- ❌ NEVER use CSS transitions for caption reveal — use frame-driven opacity/transform

## Basic Caption Display

Show/hide text segments based on frame timing:

```tsx
const frame = useCurrentFrame();
const { fps, width, height } = useVideoConfig();

const CAPTIONS = [
  { text: "Welcome to", startFrame: 0, endFrame: 45 },
  { text: "the future of", startFrame: 30, endFrame: 75 },
  { text: "video creation", startFrame: 60, endFrame: 105 },
];

const activeCaptions = CAPTIONS.filter(
  (c) => frame >= c.startFrame && frame <= c.endFrame,
);

<div
  style={{
    position: "absolute",
    bottom: height * 0.12,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
  }}
>
  {activeCaptions.map((caption, i) => {
    const entrance = spring({
      frame: frame - caption.startFrame,
      fps,
      config: { damping: 15, stiffness: 150 },
    });
    return (
      <span
        key={i}
        style={{
          fontSize: 48,
          fontWeight: 800,
          color: "#FFFFFF",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          transform: `translateY(${interpolate(entrance, [0, 1], [20, 0])}px)`,
          opacity: entrance,
          padding: "0 8px",
        }}
      >
        {caption.text}
      </span>
    );
  })}
</div>;
```

## Word-by-Word Highlight

Highlight the current word in a sentence, TikTok/karaoke style:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const WORDS = ["This", "is", "an", "amazing", "story"];
const WORD_DURATION = 12; // frames per word

<div
  style={{
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  }}
>
  {WORDS.map((word, i) => {
    const wordStart = i * WORD_DURATION;
    const isActive = frame >= wordStart && frame < wordStart + WORD_DURATION;
    const isPast = frame >= wordStart + WORD_DURATION;

    const scale = isActive
      ? spring({
          frame: frame - wordStart,
          fps,
          config: { damping: 10, stiffness: 200 },
        })
      : 1;

    return (
      <span
        key={i}
        style={{
          fontSize: 56,
          fontWeight: 800,
          color: isActive
            ? "#FFD700"
            : isPast
              ? "#FFFFFF"
              : "rgba(255,255,255,0.4)",
          transform: `scale(${isActive ? 1 + scale * 0.15 : 1})`,
          transition: "none",
        }}
      >
        {word}
      </span>
    );
  })}
</div>;
```

## Lower Third Caption Bar

Stylized caption bar with background:

```tsx
const frame = useCurrentFrame();
const { fps, height } = useVideoConfig();

const entrance = spring({ frame, fps, config: { damping: 15 } });
const slideY = interpolate(entrance, [0, 1], [60, 0]);

<div
  style={{
    position: "absolute",
    bottom: height * 0.08,
    left: "5%",
    right: "5%",
    transform: `translateY(${slideY}px)`,
    opacity: entrance,
  }}
>
  <div
    style={{
      background: "rgba(0,0,0,0.75)",
      backdropFilter: "blur(10px)",
      borderRadius: 12,
      padding: "16px 24px",
      textAlign: "center",
    }}
  >
    <span
      style={{
        fontSize: 36,
        fontWeight: 700,
        color: "#FFFFFF",
      }}
    >
      Caption text here
    </span>
  </div>
</div>;
```

## Typing Caption

Caption text that types itself out character by character:

```tsx
const frame = useCurrentFrame();

const CAPTION_TEXT = "The quick brown fox jumps over the lazy dog";
const CHARS_PER_FRAME = 0.5;

const visibleChars = Math.min(
  Math.floor(frame * CHARS_PER_FRAME),
  CAPTION_TEXT.length,
);

<span style={{ fontSize: 40, fontWeight: 700, color: "#FFF" }}>
  {CAPTION_TEXT.slice(0, visibleChars)}
  <span style={{ opacity: Math.round(frame / 10) % 2 }}>|</span>
</span>;
```
