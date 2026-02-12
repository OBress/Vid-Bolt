---
name: icons
description: Using lucide-react icons and animated SVG icon patterns in Remotion. Use when displaying icons, animated icon entrances, icon grids, or icon-based infographics.
tags: icons, lucide, svg, icon-animation, icon-grid, infographic
---

# Icons in Remotion

Animated icon patterns using `lucide-react` (5000+ icons available).

## Rules

- ✅ Import icons from `lucide-react`: `import { Heart, Star, TrendingUp } from "lucide-react"`
- ✅ Use ONLY real lucide-react icon names
- ✅ Animate icon properties (scale, rotation, opacity, color) with `spring()` / `interpolate()`
- ❌ NEVER invent fake icon names — check lucide.dev for valid names
- ❌ NEVER create custom icon components — use lucide-react or draw with SVG

## Basic Icon with Animation

```tsx
import { Zap } from "lucide-react";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

<div style={{ transform: `scale(${scale})` }}>
  <Zap size={64} color="#F59E0B" strokeWidth={2.5} />
</div>;
```

## Icon with Staggered Entrance

Multiple icons appearing in sequence:

```tsx
import { Shield, Lock, Eye, Key, Fingerprint } from "lucide-react";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const ICONS = [
  { Icon: Shield, color: "#3B82F6", label: "Protection" },
  { Icon: Lock, color: "#8B5CF6", label: "Encryption" },
  { Icon: Eye, color: "#10B981", label: "Monitoring" },
  { Icon: Key, color: "#F59E0B", label: "Access" },
  { Icon: Fingerprint, color: "#EC4899", label: "Identity" },
];

<div
  style={{
    display: "flex",
    gap: 48,
    justifyContent: "center",
    alignItems: "center",
  }}
>
  {ICONS.map(({ Icon, color, label }, i) => {
    const delay = i * 8;
    const entrance = spring({
      frame: frame - delay,
      fps,
      config: { damping: 12, stiffness: 150 },
    });
    const y = interpolate(entrance, [0, 1], [30, 0]);

    return (
      <div
        key={i}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          opacity: entrance,
          transform: `translateY(${y}px)`,
        }}
      >
        <Icon size={48} color={color} strokeWidth={2} />
        <span style={{ fontSize: 16, color: "#94A3B8", fontWeight: 600 }}>
          {label}
        </span>
      </div>
    );
  })}
</div>;
```

## Icon Feature Grid

Grid layout of icons with labels:

```tsx
import { Cpu, Globe, Layers, Zap, Database, Cloud } from "lucide-react";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const FEATURES = [
  { Icon: Cpu, label: "Processing", color: "#6366F1" },
  { Icon: Globe, label: "Global", color: "#06B6D4" },
  { Icon: Layers, label: "Scalable", color: "#8B5CF6" },
  { Icon: Zap, label: "Fast", color: "#F59E0B" },
  { Icon: Database, label: "Storage", color: "#10B981" },
  { Icon: Cloud, label: "Cloud", color: "#3B82F6" },
];

<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 32,
    padding: 48,
  }}
>
  {FEATURES.map(({ Icon, label, color }, i) => {
    const delay = i * 6;
    const scale = spring({
      frame: frame - delay,
      fps,
      config: { damping: 12, stiffness: 120 },
    });

    return (
      <div
        key={i}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          transform: `scale(${Math.max(0, scale)})`,
        }}
      >
        <div
          style={{
            background: `${color}20`,
            borderRadius: 16,
            padding: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={36} color={color} strokeWidth={2} />
        </div>
        <span style={{ fontSize: 18, fontWeight: 600, color: "#E2E8F0" }}>
          {label}
        </span>
      </div>
    );
  })}
</div>;
```

## Animated Icon Rotation

Continuous spin or pendulum:

```tsx
import { Settings } from "lucide-react";

const frame = useCurrentFrame();

const rotation = interpolate(frame, [0, 120], [0, 360]);

<div style={{ transform: `rotate(${rotation}deg)` }}>
  <Settings size={64} color="#94A3B8" strokeWidth={1.5} />
</div>;
```

## Common Icon Names Reference

Frequently used lucide-react icons:

- **Arrows:** ArrowUp, ArrowRight, ArrowDown, ArrowLeft, ChevronRight, MoveRight
- **Actions:** Play, Pause, Download, Upload, Share, Send, Search, Plus, Minus, X
- **Status:** Check, CheckCircle, AlertTriangle, AlertCircle, Info, Ban
- **Media:** Image, Video, Music, Camera, Mic, Volume2
- **Social:** Heart, ThumbsUp, MessageCircle, UserPlus, Bell
- **Tech:** Cpu, Database, Cloud, Globe, Server, Wifi, Terminal, Code
- **Charts:** BarChart, LineChart, PieChart, TrendingUp, TrendingDown, Activity
- **UI:** Menu, Grid, List, LayoutGrid, Columns, Rows, Sidebar
