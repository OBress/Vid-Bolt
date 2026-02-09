---
name: parameters
description: Make videos parametrizable with input props and Zod schemas
keywords: [parameter, schema, configurable, props, input, customize]
---

# Parameters in Remotion

## Input Props

Components can receive dynamic props using `getInputProps()`:

```tsx
import { getInputProps } from "remotion";

// Define expected props
interface MyProps {
  title: string;
  color: string;
  duration: number;
}

export const MyAnimation = () => {
  const props = getInputProps() as MyProps;
  const title = props.title || "Default Title";
  const color = props.color || "#3B82F6";

  // Use props in your animation...
};
```

## Zod Schemas (Recommended)

Use Zod schemas for type-safe, validated input props:

```tsx
import { z } from "zod";

export const mySchema = z.object({
  title: z.string().default("Hello World"),
  primaryColor: z.string().default("#3B82F6"),
  duration: z.number().min(30).max(300).default(90),
  showSubtitle: z.boolean().default(true),
});

type MyProps = z.infer<typeof mySchema>;
```

## Rules

- ✅ Always provide default values for all props
- ✅ Use Zod schemas for validation when possible
- ✅ Keep props simple (strings, numbers, booleans, arrays)
- ❌ Don't use complex objects or functions as props
