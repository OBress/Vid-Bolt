---
name: social-media
description: Social media formats - Instagram stories, TikTok, YouTube shorts, reels, vertical video
tags: social-media, instagram, tiktok, youtube, shorts, reels, vertical, stories
---

# Social Media Format Patterns

## Aspect Ratios

```tsx
const { width, height } = useVideoConfig();

// Detect format from dimensions
const isVertical = height > width;
const isSquare = Math.abs(width - height) < 10;

// Common formats:
// - 9:16 (1080x1920) - TikTok, Reels, Stories
// - 1:1 (1080x1080) - Instagram Feed
// - 16:9 (1920x1080) - YouTube, Twitter
// - 4:5 (1080x1350) - Instagram Portrait
```

## Vertical Video Layout

Optimize content for vertical viewing.

```tsx
<AbsoluteFill
  style={{
    padding: "80px 40px", // Safe areas for UI elements
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  }}
>
  <div
    style={
      {
        /* Top section - title */
      }
    }
  />
  <div style={{ /* Middle section - main content */ flex: 1 }} />
  <div
    style={
      {
        /* Bottom section - CTA */
      }
    }
  />
</AbsoluteFill>
```

## Safe Zones

Account for platform UI overlays.

```tsx
const SAFE_TOP = 120; // Status bar, close button
const SAFE_BOTTOM = 150; // Comments, share buttons
const SAFE_SIDES = 40;

<AbsoluteFill style={{
  paddingTop: SAFE_TOP,
  paddingBottom: SAFE_BOTTOM,
  paddingLeft: SAFE_SIDES,
  paddingRight: SAFE_SIDES,
}}>
```

## Story-Style Text

Large, readable text for mobile viewing.

```tsx
<div
  style={{
    fontSize: 48,
    fontWeight: 800,
    textAlign: "center",
    lineHeight: 1.2,
    textShadow: "0 2px 10px rgba(0,0,0,0.5)",
    maxWidth: "90%",
  }}
>
  {TEXT}
</div>
```

## Progress Bar (Story Timer)

```tsx
const progress = frame / durationInFrames;

<div
  style={{
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  }}
>
  <div
    style={{
      width: `${progress * 100}%`,
      height: "100%",
      backgroundColor: "#fff",
      borderRadius: 2,
    }}
  />
</div>;
```

## Swipe Up CTA

> Remember to import `ChevronUp` from `lucide-react`.

```tsx
const bounce = Math.sin(frame * 0.15) * 8;

<div
  style={{
    position: "absolute",
    bottom: 100,
    left: "50%",
    transform: `translateX(-50%) translateY(${bounce}px)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  }}
>
  <ChevronUp size={32} color="#fff" />
  <span style={{ color: "#fff", fontSize: 14 }}>Swipe Up</span>
</div>;
```

## Sticker/Emoji Pop

```tsx
const stickers = ["🔥", "💯", "✨", "🎉"];

{
  stickers.map((emoji, i) => {
    const delay = i * 10;
    const scale = spring({
      frame: frame - delay,
      fps,
      config: { damping: 10, stiffness: 200 },
    });

    const rotation = interpolate(scale, [0, 1], [-30, 0]);

    return (
      <span
        style={{
          position: "absolute",
          fontSize: 48,
          transform: `scale(${Math.max(0, scale)}) rotate(${rotation}deg)`,
          left: POSITIONS[i].x,
          top: POSITIONS[i].y,
        }}
      >
        {emoji}
      </span>
    );
  });
}
```

## Poll/Question Sticker

```tsx
const OPTIONS = ["Yes! 🙌", "No way 😅"];

<div
  style={{
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 24,
    width: "80%",
  }}
>
  <h3 style={{ color: "#000", marginBottom: 16, textAlign: "center" }}>
    Do you agree?
  </h3>
  <div style={{ display: "flex", gap: 12 }}>
    {OPTIONS.map((opt, i) => (
      <button
        key={i}
        style={{
          flex: 1,
          padding: "16px 24px",
          borderRadius: 12,
          backgroundColor: i === 0 ? "#3B82F6" : "#EF4444",
          color: "#fff",
          fontSize: 18,
          fontWeight: 600,
          border: "none",
        }}
      >
        {opt}
      </button>
    ))}
  </div>
</div>;
```

## Username/Handle Display

> Remember to import `User` from `lucide-react`.

```tsx
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 12,
  }}
>
  <div
    style={{
      width: 40,
      height: 40,
      borderRadius: "50%",
      backgroundColor: "#3B82F6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <User size={20} color="#fff" />
  </div>
  <div>
    <div style={{ fontWeight: 600, color: "#fff" }}>@username</div>
    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Creator</div>
  </div>
</div>
```

## Gradient Background

Popular on social media content.

```tsx
<AbsoluteFill style={{
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
}}>
```

## Music Visualization Bar

```tsx
const BAR_COUNT = 5;

<div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 32 }}>
  {Array.from({ length: BAR_COUNT }).map((_, i) => {
    const phase = frame * 0.2 + i * 0.5;
    const height = 8 + Math.sin(phase) * 12;

    return (
      <div
        key={i}
        style={{
          width: 4,
          height,
          backgroundColor: "#fff",
          borderRadius: 2,
        }}
      />
    );
  })}
</div>;
```
