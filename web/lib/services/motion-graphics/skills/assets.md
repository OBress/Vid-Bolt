---
name: assets
description: Import and use static assets (images, videos, fonts) in Remotion
keywords: [asset, import, static, font, image, video, staticFile]
---

# Assets in Remotion

## Static Files

Use `staticFile()` from "remotion" to reference files in the `public/` directory:

```tsx
import { staticFile, Img, Video, Audio } from "remotion";

// Images
<Img src={staticFile("logo.png")} />;

// Video (import from @remotion/media)
import { Video } from "@remotion/media";
<Video src={staticFile("background.mp4")} />;

// Audio (import from @remotion/media)
import { Audio } from "@remotion/media";
<Audio src={staticFile("music.mp3")} />;
```

## Remote URLs

You can use remote URLs directly:

```tsx
<Img src="https://example.com/image.jpg" />
```

## Fonts

Load Google Fonts using `@remotion/google-fonts`:

```tsx
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont();

<div style={{ fontFamily }}>Hello</div>;
```

Or use `@font-face` in a style tag for custom fonts:

```tsx
<style>{`@font-face { font-family: 'CustomFont'; src: url(${staticFile("font.woff2")}); }`}</style>
```

## Rules

- ✅ Use `staticFile()` for files in the `public/` directory
- ✅ Import Video/Audio from `@remotion/media`, NOT from `remotion`
- ❌ Don't use `require()` or relative paths for static files
- ❌ Don't use `fs` or Node.js-only APIs
