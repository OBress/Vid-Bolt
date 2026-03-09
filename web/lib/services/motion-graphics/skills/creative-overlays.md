---
name: creative-overlays
description: Creative overlay patterns for compositing over video/images in Remotion. Use when creating location tags, lower-thirds, info badges, HUDs, lens effects, borders, or any transparent overlay that sits on top of other content.
tags: overlay, location, lower-third, badge, hud, border, lens, tag, label, transparent, composite
---

# Creative Overlays & Compositing

Patterns for building broadcast-quality overlays that composite on top of video or image content.

## Rules

- ✅ ALWAYS use `background: 'transparent'` on AbsoluteFill when creating overlays
- ✅ Use semi-transparent backgrounds behind text for readability (rgba(0,0,0,0.6-0.7))
- ✅ Position persistent elements at screen edges/corners
- ✅ Use spring() for entrance animations — overlays should feel smooth and polished
- ❌ NEVER assume you know what the underlying video/image shows
- ❌ NEVER use opaque full-screen backgrounds in overlay mode

## Location Tag

Animated location indicator with pin icon and label:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const entrance = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
const slideX = interpolate(entrance, [0, 1], [-60, 0]);

<AbsoluteFill style={{ background: "transparent" }}>
  <div
    style={{
      position: "absolute",
      bottom: 80,
      left: 40,
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: "rgba(0,0,0,0.65)",
      padding: "10px 20px 10px 16px",
      borderRadius: 30,
      opacity: entrance,
      transform: `translateX(${slideX}px)`,
    }}
  >
    <MapPin size={18} color="#FF4444" />
    <span
      style={{
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: 600,
        fontFamily: "Inter, sans-serif",
        letterSpacing: 0.5,
      }}
    >
      New York City
    </span>
  </div>
</AbsoluteFill>;
```

## Lower-Third

Professional name/title bar at bottom of frame:

```tsx
const frame = useCurrentFrame();
const { fps, durationInFrames } = useVideoConfig();

const entrance = spring({
  frame,
  fps,
  config: { damping: 18, stiffness: 100 },
});
const exit =
  frame > durationInFrames - 20
    ? interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
const combined = entrance * exit;

<AbsoluteFill style={{ background: "transparent" }}>
  <div
    style={{
      position: "absolute",
      bottom: 60,
      left: 40,
      opacity: combined,
      transform: `translateY(${interpolate(combined, [0, 1], [20, 0])}px)`,
    }}
  >
    {/* Accent bar */}
    <div
      style={{
        width: 40,
        height: 3,
        background: "#3B82F6",
        borderRadius: 2,
        marginBottom: 8,
      }}
    />
    <div
      style={{
        background: "rgba(0,0,0,0.7)",
        padding: "14px 24px",
        borderRadius: 6,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          color: "#FFFFFF",
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "Inter, sans-serif",
        }}
      >
        Person Name
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: 14,
          fontWeight: 400,
          marginTop: 2,
        }}
      >
        Title or Role
      </div>
    </div>
  </div>
</AbsoluteFill>;
```

## Info Badge (Corner)

Compact info indicator in a corner:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const pop = spring({
  frame: frame - 10,
  fps,
  config: { damping: 10, stiffness: 120 },
});

<div
  style={{
    position: "absolute",
    top: 30,
    right: 30,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(0,0,0,0.6)",
    padding: "8px 16px",
    borderRadius: 20,
    opacity: pop,
    transform: `scale(${0.8 + pop * 0.2})`,
  }}
>
  <Clock size={14} color="#FFFFFF" />
  <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600 }}>2:45</span>
</div>;
```

## Animated Border Frame

Cinematic corner brackets that animate in:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const draw = spring({ frame, fps, config: { damping: 20, stiffness: 60 } });
const bracketSize = 40;
const bracketThickness = 2;
const offset = 30;
const cornerOpacity = draw;

const corners = [
  { top: offset, left: offset },
  { top: offset, right: offset },
  { bottom: offset, left: offset },
  { bottom: offset, right: offset },
];

<AbsoluteFill style={{ background: "transparent", pointerEvents: "none" }}>
  {corners.map((pos, i) => {
    const isTop = "top" in pos;
    const isLeft = "left" in pos;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          ...pos,
          width: bracketSize,
          height: bracketSize,
          opacity: cornerOpacity,
          borderTop: isTop
            ? `${bracketThickness}px solid rgba(255,255,255,0.8)`
            : "none",
          borderBottom: !isTop
            ? `${bracketThickness}px solid rgba(255,255,255,0.8)`
            : "none",
          borderLeft: isLeft
            ? `${bracketThickness}px solid rgba(255,255,255,0.8)`
            : "none",
          borderRight: !isLeft
            ? `${bracketThickness}px solid rgba(255,255,255,0.8)`
            : "none",
        }}
      />
    );
  })}
</AbsoluteFill>;
```

## Split-Screen Comparison

Side-by-side layout with animated reveal:

```tsx
const frame = useCurrentFrame();
const { fps, width, height } = useVideoConfig();

const reveal = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
const dividerX = interpolate(reveal, [0, 1], [0, width / 2]);

<AbsoluteFill>
  {/* Left side */}
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: width / 2,
      height,
      overflow: "hidden",
    }}
  >
    <Img src={LEFT_IMAGE_URL} style={{ width, height, objectFit: "cover" }} />
  </div>
  {/* Right side */}
  <div
    style={{
      position: "absolute",
      left: width / 2,
      top: 0,
      width: width / 2,
      height,
      overflow: "hidden",
      opacity: reveal,
    }}
  >
    <Img
      src={RIGHT_IMAGE_URL}
      style={{
        width,
        height,
        objectFit: "cover",
        marginLeft: -(width / 2),
      }}
    />
  </div>
  {/* Center divider */}
  <div
    style={{
      position: "absolute",
      left: dividerX - 1,
      top: 0,
      bottom: 0,
      width: 2,
      background: "rgba(255,255,255,0.8)",
    }}
  />
</AbsoluteFill>;
```
