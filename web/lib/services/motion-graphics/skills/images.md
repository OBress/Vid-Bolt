---
name: images
description: Embedding images in Remotion using the Img component
tags: images, img, staticFile, png, jpg, svg, webp
---

# Using Images in Remotion

## The `<Img>` Component

Always use `<Img>` from `remotion` to display images:

```tsx
import { Img, staticFile } from "remotion";

export const MyComposition = () => {
  return <Img src={staticFile("photo.png")} />;
};
```

## Critical Rules

**You MUST use the `<Img>` component from `remotion`.** Do NOT use:

- Native HTML `<img>` elements
- Next.js `<Image>` component
- CSS `background-image`

The `<Img>` component ensures images are fully loaded before rendering.

## Local Images

Place images in the `public/` folder and use `staticFile()`:

```tsx
<Img src={staticFile("logo.png")} />
```

## Remote Images

Remote URLs can be used directly:

```tsx
<Img src="https://example.com/image.png" />
```

Ensure remote images have CORS enabled.

## Sizing and Positioning

```tsx
<Img
  src={staticFile("photo.png")}
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

## Dynamic Image Paths

```tsx
const frame = useCurrentFrame();

// Image sequence
<Img src={staticFile(`frames/frame${frame}.png`)} />

// Conditional images
<Img src={staticFile(`icons/${isActive ? "active" : "inactive"}.svg`)} />
```

## Animating Images

```tsx
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }
});

<Img
  src={staticFile("logo.png")}
  style={{
    transform: `scale(${scale})`,
    width: 200,
    height: 200,
  }}
/>
```
