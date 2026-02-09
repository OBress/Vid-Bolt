---
name: measuring-text
description: Measure text dimensions, fit text to containers, detect overflow
keywords: [text, overflow, measure, fit, width, height, resize, truncate]
---

# Measuring Text in Remotion

## Using @remotion/layout-utils

```tsx
import { measureText, fillTextBox } from "@remotion/layout-utils";
```

## Measure Text Width

```tsx
const { width, height } = measureText({
  text: "Hello World",
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: "bold",
});
```

## Fit Text to Container

Use binary search to find the largest font size that fits:

```tsx
const fitText = (text: string, maxWidth: number, fontFamily: string) => {
  let lo = 10,
    hi = 200;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const { width } = measureText({ text, fontFamily, fontSize: mid });
    if (width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};
```

## Fill Text Box

```tsx
const { fontSize } = fillTextBox({
  maxLines: 3,
  maxBoxWidth: 800,
  maxFontSize: 72,
  text: "Your long text here that might need to wrap across multiple lines",
  fontFamily: "Inter",
});
```

## Rules

- ✅ Use `measureText()` for single-line text measurement
- ✅ Use `fillTextBox()` for multi-line text fitting
- ✅ Always specify fontFamily and fontSize for accurate measurements
- ❌ Don't rely on CSS for text fitting — Remotion needs deterministic layout
