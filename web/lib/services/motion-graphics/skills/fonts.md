---
name: fonts
description: Loading Google Fonts and local fonts in Remotion
tags: fonts, google-fonts, typography, text, loading
---

# Using Fonts in Remotion

## Google Fonts with @remotion/google-fonts

The recommended way to use Google Fonts. Type-safe and blocks rendering until ready.

```tsx
import { loadFont } from "@remotion/google-fonts/Lobster";

const { fontFamily } = loadFont();

export const MyComposition = () => {
  return <div style={{ fontFamily }}>Hello World</div>;
};
```

### Specify Weights and Subsets

Reduce file size by loading only what you need:

```tsx
import { loadFont } from "@remotion/google-fonts/Roboto";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});
```

### Waiting for Font Load

```tsx
import { loadFont } from "@remotion/google-fonts/Lobster";

const { fontFamily, waitUntilDone } = loadFont();

await waitUntilDone();
```

## Local Fonts with @remotion/fonts

For custom font files:

```tsx
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

await loadFont({
  family: "MyFont",
  url: staticFile("MyFont-Regular.woff2"),
});

<div style={{ fontFamily: "MyFont" }}>Hello World</div>
```

### Loading Multiple Weights

```tsx
await Promise.all([
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Regular.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Bold.woff2"),
    weight: "700",
  }),
]);
```

## Default Font

For most animations, use the Inter font which is widely available:

```tsx
<div style={{ fontFamily: 'Inter, sans-serif' }}>
  Your text here
</div>
```

## Common Font Combinations

```tsx
// Modern/Clean
fontFamily: 'Inter, sans-serif'

// Bold Headlines
fontFamily: 'Montserrat, sans-serif'

// Elegant/Serif
fontFamily: 'Playfair Display, serif'

// Technical/Mono
fontFamily: 'JetBrains Mono, monospace'
```
