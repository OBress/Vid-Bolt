# Video Editor V2 — Optimization Catalog

> A comprehensive, deep-dive document cataloging every performance optimization implemented across the Video Editor V2 codebase.  
> Each section explains **what** the optimization is, **where** it lives, and **why** it helps.

---

## Table of Contents

1. [State Management Optimizations](#1-state-management-optimizations)
2. [Selector & Subscription Optimizations](#2-selector--subscription-optimizations)
3. [Component Rendering Optimizations](#3-component-rendering-optimizations)
4. [Timeline Virtualization](#4-timeline-virtualization)
5. [Scrubbing & Playback Optimizations](#5-scrubbing--playback-optimizations)
6. [Web Worker Offloading](#6-web-worker-offloading)
7. [GPU / WebGL Acceleration](#7-gpu--webgl-acceleration)
8. [Canvas Effect Pipeline](#8-canvas-effect-pipeline)
9. [Audio System Optimizations](#9-audio-system-optimizations)
10. [Caching Architecture](#10-caching-architecture)
11. [Adaptive Quality System](#11-adaptive-quality-system)
12. [CSS Layout & Containment](#12-css-layout--containment)
13. [Utility-Level Optimizations](#13-utility-level-optimizations)
14. [Undo/Redo History Optimizations](#14-undoredo-history-optimizations)
15. [Persistence Optimizations](#15-persistence-optimizations)
16. [Event Handling Optimizations](#16-event-handling-optimizations)
17. [Remotion Layer Rendering Pipeline](#17-remotion-layer-rendering-pipeline)
18. [Selection Performance Optimizations](#18-selection-performance-optimizations)
19. [CSS/DOM Performance Optimizations](#19-cssdom-performance-optimizations)
20. [Canvas Timeline Optimizations](#20-canvas-timeline-optimizations)

---

## 1. State Management Optimizations

### 1.1 Zustand Middleware Stack

**File:** [video-editor-store.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts)

The store is constructed with a precise middleware order:

```
subscribeWithSelector → persist → mutative → temporal
```

| Middleware                           | Purpose                                                     | Optimization Benefit                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscribeWithSelector`              | Enables fine-grained subscriptions to specific state slices | Components only re-render when the exact slice they subscribe to changes, not on any store update                                                     |
| `persist`                            | Serializes selected state to localStorage                   | Only user preferences are persisted (not project data), keeping serialization fast                                                                    |
| `mutative` (from `zustand-mutative`) | Wraps Immer-style mutable draft updates                     | Uses structural sharing internally — unchanged portions of the state tree keep their reference identity, preventing unnecessary downstream re-renders |
| `temporal` (from `zundo`)            | Records state snapshots for undo/redo                       | Replaces a fully manual history implementation with an optimized middleware approach                                                                  |

> **Why this matters:** Without `mutative`, every `set()` call would need to manually spread nested objects to maintain immutability. With `mutative`, the code reads like mutations but produces structurally-shared immutable updates, which is both developer-friendly and performant.

### 1.2 Normalized Data Model

**File:** [video-editor-store.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts)

State is stored in **normalized records** (`Record<string, T>`) rather than arrays:

```typescript
tracks: Record<string, TimelineTrack>; // O(1) lookup by ID
clips: Record<string, TimelineClip>; // O(1) lookup by ID
transitions: Record<string, TransitionEntity>; // O(1) lookup by ID
```

> **Benefit:** Looking up a clip by ID is O(1) instead of O(N) with an array scan. This is critical during drag operations, selection changes, and rendering where clip lookups happen per-frame.

### 1.3 Type-Safe Store Wrappers

**File:** [video-editor-store.ts#L2675-L2691](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2675-L2691)

```typescript
export const getTypedState = (): VideoEditorStore =>
  useVideoEditorStore.getState() as unknown as VideoEditorStore;

export const useTypedStore = <T>(
  selector: (state: VideoEditorStore) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T => {
  return (useVideoEditorStore as any)(selector, equalityFn) as T;
};
```

> **Benefit:** The deep middleware stack causes TypeScript to lose type information. These wrappers restore it without runtime overhead — pure compile-time casts that keep consuming components type-safe and prevent accidental full-store subscriptions.

---

## 2. Selector & Subscription Optimizations

### 2.1 Memoized Computed Selectors (Reselect)

**File:** [memoized-selectors.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/memoized-selectors.ts)

All derived data that produces **new array/object references** uses `reselect`'s `createSelector` with `weakMapMemoize` (v5.0+):

| Selector                                             | What it Computes                        | Why Memoized                                                                                       |
| ---------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `selectTracksArray`                                  | `trackOrder.map(id => tracks[id])`      | Produces a new array every call — memoization returns the same reference if inputs haven't changed |
| `selectTracks`                                       | Sorted tracks by `track.order`          | Sort produces new array                                                                            |
| `selectVideoTracks` / `selectAudioTracks`            | Filtered + sorted tracks                | Filter + sort produces new arrays                                                                  |
| `selectClipsArray`                                   | `Object.values(clips)`                  | Produces new array                                                                                 |
| `selectClipIds`                                      | `Object.keys(clips)`                    | Produces new array                                                                                 |
| `selectClipPositions`                                | Position-only projections of clips      | Maps to new objects                                                                                |
| `selectClipsWithLinkGroups`                          | Clips with computed `linkGroup` field   | New objects per clip                                                                               |
| `selectClipsByTrackIndex`                            | Index: `{ [trackId]: TimelineClip[] }`  | Most expensive — builds a complete track-to-clips index, sorted                                    |
| `selectTransitionsByClipIndex`                       | Index: `{ [clipId]: { in?, out? } }`    | Builds a clip-to-transitions lookup table                                                          |
| `selectTracksWithClips`                              | Denormalized tracks with embedded items | The canonical "view model" for the timeline UI                                                     |
| `selectDurationInSeconds` / `selectDurationInFrames` | Total duration calculations             | Scans all clips to find max end time                                                               |

> **Key insight from code comment:** These use O(1) indexed lookups instead of O(N) linear scans per track/clip, only recomputing when the underlying `tracks`, `clips`, or `transitions` records change.

### 2.2 Render Pipeline Selectors

**File:** [memoized-render-selectors.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/memoized-render-selectors.ts)

```typescript
export const selectOverlays = createSelector(
  [
    selectClipsArray,
    selectTracksArray,
    selectFpsValue,
    selectTransitionsRecord,
  ],
  (clips, tracks, fps, transitions): Overlay[] =>
    clipsToOverlaysWithTracks(clips, tracks, fps, transitions),
);
```

> **Why this exists (from code comment):**
> _"Previously, this conversion happened inside VideoPlayer's useMemo and was busted by every store update that changed the clips reference (including selection changes), causing a ~97ms recomputation per click."_
>
> The memoized selector only recomputes when `clips`, `tracks`, `fps`, or `transitions` change — **not** on selection, playback, or UI state changes.

### 2.3 Atomic Selectors

**File:** [video-editor-store.ts#L2770-L2877](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2770-L2877)

Over 40 atomic selectors provide granular access to individual state properties:

```typescript
export const selectCurrentTime = (state: VideoEditorStore) =>
  state.playback.currentTime;
export const selectIsPlaying = (state: VideoEditorStore) =>
  state.playback.isPlaying;
export const selectEditMode = (state: VideoEditorStore) => state.editMode;
// ... etc
```

> **Benefit:** Components subscribe to exactly the state they need. A component that only needs `editMode` won't re-render when `currentTime` changes 10×/sec during playback.

### 2.4 Shallow Comparison Hooks

**File:** [video-editor-store.ts#L2900-L2955](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2900-L2955)

Pre-built hooks with `useShallow` for array-returning selectors:

```typescript
export const useClipIds = () => useVideoEditorStore(useShallow(selectClipIds));
export const useTrackIds = () =>
  useVideoEditorStore(useShallow(selectTrackIds));
export const useSelectedClipIds = () =>
  useVideoEditorStore(useShallow(selectSelectedClipIds));
export const useClipPositions = () =>
  useVideoEditorStore(useShallow(selectClipPositions));
```

> **Benefit:** `useShallow` performs shallow element-wise comparison of arrays/objects, preventing re-renders when the array reference changes but the contents are identical. Without this, `Object.values()` or `.map()` creates a new array reference every time, causing unnecessary component updates.

### 2.5 Cached Action Selector

**File:** [video-editor-store.ts#L2956-L3092](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2956-L3092)

```typescript
let _cachedActions: ReturnType<typeof _buildActions> | null = null;

export const selectActions = (state: VideoEditorStore) => {
  if (!_cachedActions) {
    _cachedActions = _buildActions(state);
  }
  return _cachedActions;
};

export const useVideoEditorActions = () => useVideoEditorStore(selectActions);
```

> **Why this matters:** Zustand action functions are stable references created once at store initialization — they never change. Without caching, `selectActions` would build a new ~80-property object on every render call, causing **every component using `useVideoEditorActions()`** to re-render on **any** state change (because the selector returns a new reference each time). The cache ensures the same object reference is returned forever.

### 2.6 Pure Function Selectors for Non-React Code

**File:** [video-editor-store.ts#L3238-L3268](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L3238-L3268)

```typescript
export function getClipTransitionsPure(
  clipId: string,
  transitions: Record<string, TransitionEntity>,
): { inTransition?: TransitionEntity; outTransition?: TransitionEntity };
```

> **Benefit:** Pure functions that accept state as arguments can be used in event handlers, utilities, and workers without hooking into React's lifecycle, avoiding unnecessary renders.

---

## 3. Component Rendering Optimizations

### 3.1 React.memo with Custom Comparators

**Key Components:**

#### MemoizedTimelineItem

**File:** [timeline-item.tsx#L1865-L1926](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-item.tsx#L1865-L1926)

```typescript
export const MemoizedTimelineItem = React.memo(
  TimelineItem,
  (prevProps, nextProps) => {
    // ~30 explicit property comparisons
    // ...
    return true; // Props are equal, skip re-render
  },
);
```

**Deliberate exclusions from comparison (from code comments):**

- **`currentFrame`**: _"It changes 10×/sec during playback and would bust the memo for ALL items."_
- **`selectedItemIds`**: _"Each item receives `isSelected` boolean for rendering, and context menu operations use a ref pattern. This prevents O(N×M) comparisons on every selection click."_

#### MemoizedTimelineTrack

**File:** [timeline-track.tsx#L400](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-track.tsx#L400)

Also uses `React.memo` with a custom comparator, following the same pattern.

#### Other Memoized Components

- `PropertyTrack`, `PropertyRow`, `LayerTrack`, `LayerRow`, `KeyframeDiamond` — all composition editor components
- `TextLayerRenderer`, `ShapeLayerRenderer`, `SolidLayerRenderer`, `ImageLayerRenderer`, `LayerRenderer`, `LayerRendererWithTiming` — all render pipeline components
- `TimelineItemFadeOverlays` — fade visual overlay
- `NoSelectionState`, `MultiSelectState` — inspector states

> **Pattern:** Components that appear in large lists or render per-frame are wrapped in `React.memo` with custom comparators that explicitly exclude rapidly-changing props that don't affect visual output.

### 3.2 Stable Callback References

**File:** [use-video-player.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/hooks/use-video-player.tsx)

```typescript
const isPlayingRef = useRef(isPlaying);
isPlayingRef.current = isPlaying;

const togglePlayPause = useCallback(() => {
  if (!isPlayingRef.current) {
    playerRef.current.play();
  } else {
    playerRef.current.pause();
  }
}, [playerRef]); // NOT dependent on isPlaying — stable forever
```

> **Benefit:** Without the ref pattern, `togglePlayPause` would be recreated every time `isPlaying` changes, causing all consumers (toolbar buttons, keyboard shortcuts) to re-render. The ref pattern gives a permanently stable function reference.

### 3.3 Event-Driven Frame Updates (No Polling)

**File:** [use-video-player.tsx#L53-L67](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/hooks/use-video-player.tsx#L53-L67)

```typescript
// Frame update via Remotion's frameupdate event (replaces rAF polling)
// This only fires when the frame actually changes — during playback or seeking
player.addEventListener("frameupdate", handleFrameUpdate);
```

> **Benefit:** Replaces a `requestAnimationFrame` polling loop that ran continuously (even when idle) with Remotion's event-based update that only fires when the frame actually changes. Eliminates idle CPU usage.

### 3.4 Selection-Decoupled Rendering (VideoPlayer ↔ SortedOutlines)

**Files:**

- [video-player.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/core/video-player.tsx)
- [sorted-outlines.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/selection/sorted-outlines.tsx)
- [main.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/main.tsx)

The canvas selection outlines (blue border + resize handles on the selected clip) are rendered by `SortedOutlines` inside Remotion's `Main` component. Previously, `selectedOverlayId` was prop-drilled through the chain:

```
VideoPlayer (Zustand subscription) → editorInputProps → Main → SortedOutlines
```

This caused `VideoPlayer` to re-render on every selection change, running ~15+ `useMemo`/`useCallback` hooks and re-rendering the entire Remotion `Player` JSX tree.

**The fix:** `SortedOutlines` now reads `selectedOverlayId` directly from the Zustand store:

```typescript
// sorted-outlines.tsx
const selectedOverlayId = useVideoEditorStore(selectSelectedOverlayId);
```

This eliminates `selectedOverlayId` from the `VideoPlayer → Main → SortedOutlines` prop chain entirely. `VideoPlayer` no longer subscribes to selection state, and `SortedOutlines` always gets the fresh value (fixing a prior stale-value bug where the memoized `editorInputProps` excluded `selectedOverlayId` from its dependency array).

> **Benefit:** Clicking a timeline clip no longer re-renders `VideoPlayer` or the Remotion `Player` component. Only `SortedOutlines` (a lightweight component rendering outlines and handles) re-renders — a ~10-100× reduction in work for selection interactions.

---

## 4. Timeline Virtualization

### 4.1 Horizontal Item Virtualization

**File:** [timeline-content.tsx#L732-L754](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-content.tsx#L732-L754)

```typescript
const virtualizedTracks = useMemo(() => {
  const visibleRange = getVisibleTimeRange();
  const buffer = (visibleRange.endTime - visibleRange.startTime) * 0.5;
  const bufferedStart = Math.max(0, visibleRange.startTime - buffer);
  const bufferedEnd = visibleRange.endTime + buffer;

  return tracks.map((track) => ({
    ...track,
    items: track.items.filter((item) => {
      return item.end >= bufferedStart && item.start <= bufferedEnd;
    }),
  }));
}, [tracks, getVisibleTimeRange, scrollX, zoomScale]);
```

**Key aspects:**

- **50% time-range buffer** on each side prevents items from "popping" into view
- Re-filters when scroll position or zoom level changes
- Only items overlapping the buffered visible range get rendered

> **Benefit:** For a timeline with 100+ clips, only the ~10-20 visible clips have DOM nodes. This dramatically reduces DOM size, style recalculation, and layout costs.

### 4.2 Overlay Virtualization (Remotion Player)

**File:** [main.tsx#L100-L111](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/main.tsx#L100-L111)

```typescript
const frame = useCurrentFrame();
const PREMOUNT_BUFFER = 30;
const visibleOverlays = useMemo(() => {
  return overlays.filter((overlay) => {
    if ((overlay as any).hidden) return false;
    const start = overlay.from - PREMOUNT_BUFFER;
    const end = overlay.from + overlay.durationInFrames;
    return frame >= start && frame < end;
  });
}, [overlays, frame]);
```

> **Benefit:** Only overlays visible at the current frame (plus a 30-frame premount buffer for smooth transitions) are rendered. In a project with 50 overlays, typically only 3-5 are active at any given frame, reducing the render tree by 90%+.

### 4.3 Virtual Scroll Transform Positioning

**File:** [timeline-content.tsx#L724-L730](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-content.tsx#L724-L730)

```typescript
const virtualTransform = useMemo(() => {
  if (getContentTransform) {
    return getContentTransform();
  }
  return { x: 0, y: 0 };
}, [getContentTransform, scrollX, scrollY, zoomScale]);
```

Content is positioned via CSS `transform: translate(X, Y)` rather than native scrolling:

```jsx
style={{
  transform: `translate(${virtualTransform.x}px, ${virtualTransform.y}px)`,
}}
```

> **Benefit:** Transform-based scrolling uses GPU compositing (no layout recalculation), making panning/zooming silky smooth. Native scrolling would trigger expensive layout and paint operations.

### 4.4 Deferred Mount Lazy Loading

**File:** [timeline-item-content.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-item/timeline-item-content.tsx)

```typescript
// Deferred mount: skip heavy work for first 150ms after mount
const [isSettled, setIsSettled] = useState(false);
useEffect(() => {
  const timer = setTimeout(() => setIsSettled(true), 150);
  return () => clearTimeout(timer);
}, []);

// Hooks receive null/undefined params until settled — no expensive work triggered
const waveformResult = useWaveformProcessor(
  type === TrackItemType.AUDIO && data?.src && isSettled ? data.src : undefined,
  audioContentStart, end - start
);

const thumbnailResult = useThumbnailGenerator(
  type === TrackItemType.VIDEO && isSettled
    ? { videoId: data?.content, videoSrc: data?.src || data?.originalUrl, ... }
    : { videoId: null, videoSrc: null, ... }
);
```

**How it works:**

- When virtualization scrolls an item into view, the component mounts but `isSettled = false`
- Expensive hooks (`useWaveformProcessor`, `useThumbnailGenerator`) receive null parameters and skip all work
- After 150ms, `isSettled` flips to `true` and the hooks begin loading
- Items that mount and unmount during fast scrolling (<150ms) **never trigger expensive work at all**

> **Benefit:** Fast scrolling no longer triggers audio decoding, sprite sheet loading, or ResizeObserver callbacks for transient items. Only items that remain in the viewport for 150ms+ load their media, dramatically reducing main-thread work during scroll.

### 4.5 Viewport-Relative Shift+Scroll

**File:** [use-virtual-scroll.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/hooks/use-virtual-scroll.ts)

```typescript
if (e.shiftKey) {
  const viewportFraction = 0.05;
  const scrollDelta =
    Math.sign(e.deltaY) *
    viewportFraction *
    (viewportDuration / scrollableDuration);
  const normalizedDelta =
    scrollableDuration > viewportDuration ? scrollDelta : 0;
  setScrollX(scrollX + normalizedDelta);
}
```

> **Benefit:** Each Shift+wheel notch scrolls a consistent 5% of the visible time range regardless of timeline length. The previous implementation divided by `maxScrollX` (pixels), which made scroll speed inversely proportional to timeline length — a 10-minute timeline was 90× slower to scroll than a 1-minute timeline.

### 4.6 Virtual Scroll Overflow Isolation

**Files:** [styles.css](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/styles.css), [timeline-content.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-content.tsx)

The timeline tracks scroll container uses `overflow: hidden` on all axes:

```css
.timeline-tracks-scroll-container {
  overflow: hidden !important;
}
```

Since virtual scroll positions all content via CSS `transform: translate(...)`, no native browser scrolling is needed. Setting `overflow: hidden` prevents the browser from rendering native scrollbars (which were redundant alongside the custom `TimelineNavigatorV2`) and avoids the browser performing any scroll-related layout calculations on the wide content div.

> **Benefit:** Eliminates duplicate scrollbars and prevents the browser from computing scroll positions for a 90,000px+ wide content div. All scrolling is handled by lightweight state updates (`scrollX: 0-1`) and GPU-composited transforms.

---

## 5. Scrubbing & Playback Optimizations

### 5.1 Split Update Rate Architecture

**File:** [use-optimized-scrubbing.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/hooks/use-optimized-scrubbing.ts)

```
┌─────────────────────┐     ┌──────────────────────┐
│  UI Playhead Update  │     │   Player Video Seek   │
│   (60fps via rAF)    │     │  (20fps via throttle) │
│                      │     │                       │
│  scheduleStoreUpdate │     │  scheduleVideoSeek    │
│  → setCurrentTime()  │     │  → player.seekTo()    │
└─────────────────────┘     └──────────────────────┘
```

Two independent update channels:

1. **Store/UI updates** at 60fps via `requestAnimationFrame` — the playhead visual moves instantly
2. **Remotion player seeks** throttled to every 50ms (~20fps) — the video preview updates at a sustainable rate

```typescript
const scheduleStoreUpdate = useCallback(
  (time: number) => {
    pendingStoreTimeRef.current = time;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (pendingStoreTimeRef.current !== null) {
        setCurrentTime(pendingStoreTimeRef.current);
        pendingStoreTimeRef.current = null;
      }
    });
  },
  [setCurrentTime],
);

const scheduleVideoSeek = useCallback(
  (time: number) => {
    // Throttled to VIDEO_SEEK_INTERVAL_MS (50ms)
    // ...
  },
  [seekPlayer],
);
```

> **Why this matters:** Video decoding is expensive. If player seeks matched the mouse movement rate (60fps), the decoder would fall behind, causing jank and dropped frames. The 20fps seek rate matches what the decoder can sustain while the 60fps UI update keeps the playhead feeling responsive.

### 5.2 Ref-Based State for Scrubbing

All scrubbing state uses `useRef` instead of `useState`:

```typescript
const localTimeRef = useRef(0);
const rafIdRef = useRef<number | null>(null);
const pendingStoreTimeRef = useRef<number | null>(null);
const lastSeekTimeRef = useRef(0);
const pendingSeekTimeRef = useRef<number | null>(null);
const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const wasPlayingRef = useRef(false);
```

> **Benefit:** Ref updates don't trigger React re-renders. During scrubbing (potentially hundreds of mouse events per second), this avoids cascading render cycles.

---

## 6. Web Worker Offloading

### 6.1 Canvas Effect Worker

**File:** [effect-worker.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/effect-worker.ts)

Heavy canvas operations (sharpen convolution, noise generation, glow/blur) are offloaded to a dedicated Web Worker:

```
Main Thread                    Worker Thread
────────────                   ─────────────
postMessage(ImageData) ──────► onmessage()
                               │ Apply effects
                               │ (Sharpen, Noise, Glow)
onmessage(result) ◄──────────  postMessage(processed ImageData)
```

**Communication protocol:**

- Sends `ImageData` (pixel buffer) + effect parameters
- Worker processes effects on its own thread
- Returns processed `ImageData` or error message

> **Benefit:** Canvas convolution (e.g., 3×3 kernel sharpen on a 1920×1080 frame = processing ~6.2 million pixel operations) would block the main thread for 50-200ms. Running in a worker keeps the UI responsive at 60fps.

### 6.2 Babel Compiler Worker

**File:** [babel-compiler-worker.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/babel-compiler-worker.ts)

JSX transpilation for dynamic motion graphics is offloaded to a Web Worker with several optimizations:

1. **Lazy Loading:** Babel is only loaded when first needed, not at page load
2. **Preloading during idle time:** `preloadBabelWorker()` loads Babel during `requestIdleCallback`
3. **Singleton pattern:** Single `BabelWorkerManager` instance shared across the app
4. **Pending request deduplication:** Map-based tracking prevents compiling the same code twice

```typescript
export function preloadBabelWorker() {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    requestIdleCallback(
      () => {
        babelWorker.preloadBabel();
      },
      { timeout: 5000 },
    );
  }
}
```

> **Benefit:** Babel standalone is ~2MB. Loading and initializing it on the main thread would freeze the UI. The worker + idle preload pattern makes it invisible to the user.

---

## 7. GPU / WebGL Acceleration

### 7.1 WebGL Effect Processing

**File:** [webgl-effects.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/webgl-effects.ts)

Three GPU-accelerated shader programs replace CPU canvas operations:

| Effect            | Shader                                                             | Performance Gain                                               |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Sharpen**       | 3×3 convolution kernel in fragment shader                          | 10-100× faster than CPU canvas convolution                     |
| **Noise/Grain**   | Deterministic pseudo-random in fragment shader                     | Real-time generation (60fps), CPU version causes frame drops   |
| **Color Grading** | Brightness/contrast/saturation/temperature/exposure in single pass | All adjustments in one GPU draw call vs. 5 separate CPU passes |

**Architecture:**

- **Single shared WebGL2 context** (`globalContext`) — avoids context creation overhead
- **Pre-compiled shader programs** stored in a `Map` — compile once, reuse forever
- **Texture recycling** — `uploadTexture` reuses texture objects via named slots
- **Automatic fallback** — if WebGL2 is unsupported, falls back to canvas processing

```typescript
const VERTEX_SHADER = `#version 300 es
precision highp float;
// ... shared vertex shader for all effects
`;
```

### 7.2 Performance Metrics Tracking

```typescript
interface PerformanceMetrics {
  webGLTime: number;
  canvasTime: number;
  effectType: string;
  pixelCount: number;
}

const metrics: PerformanceMetrics[] = [];
const MAX_METRICS = 50;
```

> **Benefit:** Capped metrics buffer (last 50 measurements) allows runtime comparison of WebGL vs. canvas performance without unbounded memory growth.

---

## 8. Canvas Effect Pipeline

### 8.1 Ordered Effect Pipeline

**File:** [effect-renderer.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/effect-renderer.ts)

Effects are applied in a deterministic order mimicking professional editing software:

```
CSS Filters → Canvas Effects → Overlays
```

Specific optimizations:

- **CSS filter string generation** — builds a single `filter:` string from all applicable effects, letting the browser's optimized compositor handle blur/brightness/contrast/etc.
- **Conditional canvas processing** — `requiresCanvasProcessing()` checks if any effects actually need pixel-level manipulation. If not, the expensive canvas pipeline is skipped entirely.
- **Blend mode normalization** — maps effect blend modes to CSS `mix-blend-mode` values, leveraging GPU compositing.

### 8.2 Deterministic Noise Generation

**File:** [canvas-effect-renderer.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/canvas-effect-renderer.ts)

```typescript
// Deterministic noise using frame number + effect ID as seed
const seed = hashString(effectId + frame.toString());
```

> **Why deterministic?** Random noise would produce different results between preview and final render. Using frame + effect ID as a seed ensures pixel-perfect reproducibility. This also enables **frame caching** — if the same frame with the same effects is requested again, the cached result can be returned.

### 8.3 Box Blur Approximation

For glow effects, instead of a true Gaussian blur (O(n²) per pixel):

```
3-pass box blur ≈ Gaussian blur
```

Each pass is O(n) per pixel, and 3 passes produce a visually identical result to Gaussian. Total: O(3n) vs O(n²).

---

## 9. Audio System Optimizations

### 9.1 Singleton AudioContext Manager

**File:** [audio-context-manager.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/audio-context-manager.ts)

```typescript
class AudioContextManager {
  private static instance: AudioContextManager;
  // ...
}
```

**Optimizations:**

- **Single shared AudioContext** — browsers limit the number of audio contexts (typically 6). Using a singleton prevents context exhaustion.
- **Analyzer pool** — pre-allocated `AnalyserNode` instances are reused across clips instead of creating/destroying them
- **Lazy context creation** — the context is only created when audio is first needed (required by browser autoplay policies anyway)
- **Suspend/Resume lifecycle** — context is suspended when not in use, freeing audio processing resources

### 9.2 Audio Effects Cache

**File:** [audio-effects-cache.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/audio-effects-cache.ts)

Pre-processes audio with effects and caches the results as WAV blobs:

```typescript
const cacheKey = `${clipId}_${sourceUrl}_${hashEffects(enabledEffects)}`;
```

**Optimizations:**

- **Effect hash-based cache keys** — only the enabled effects and their parameters contribute to the key, so changing a disabled effect doesn't invalidate the cache
- **Processing deduplication** — a `Set<string>` tracks in-progress operations. If two components request the same processing simultaneously, only one runs; the other waits for the same result.
- **Background processing** — audio is pre-processed when effects change, so playback starts instantly from cache

### 9.3 Audio Resource Lifecycle Manager

**File:** [audio-resource-manager.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/audio-resource-manager.ts)

Subscribes to store changes to detect clip deletions and automatically cleans up:

- Web Audio source nodes
- Effect chains (series of `AudioNode` instances)
- Cached audio blobs
- `HTMLAudioElement` instances

> **Benefit:** Prevents audio memory leaks. Without this, deleting a clip from the timeline would leave its audio resources alive, consuming memory and potentially causing AudioContext resource exhaustion.

### 9.4 Real-Time Audio Manager

**File:** [realtime-audio-manager.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/realtime-audio-manager.ts)

Manages audio playback **outside of React's lifecycle**:

- Creates stable `HTMLAudioElement` instances that persist across React re-renders
- Updates playback properties (time, volume, rate) imperatively
- Connects through the singleton `AudioContextManager` for effect chains

> **Benefit:** React re-renders don't interrupt audio playback. Audio elements are created once and updated via direct DOM manipulation, avoiding the overhead of React's reconciliation on audio nodes.

### 9.5 Offline Audio Rendering

**File:** [audio-offline-renderer.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/audio-offline-renderer.ts)

Uses `OfflineAudioContext` for export rendering:

```typescript
const offlineCtx = new OfflineAudioContext(
  numberOfChannels,
  Math.ceil(buffer.duration * sampleRate),
  sampleRate,
);
```

**Optimizations:**

- **Batch rendering** — `batchRenderAudio()` processes multiple clips with progress tracking
- **Audio mixing** — `mixAudioBuffers()` mixes multiple buffers at different start times and volumes into a single buffer
- **Deterministic output** — `OfflineAudioContext` processes at maximum speed (not real-time) and produces bit-exact results regardless of system performance

---

## 10. Caching Architecture

### 10.1 Generic IndexedDB Cache

**File:** [indexed-db-cache.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/general/indexed-db-cache.ts)

A reusable cache class with:

| Feature                      | Implementation                                                | Benefit                                                                                             |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Automatic purging**        | Records older than 30 days (configurable) are deleted         | Prevents unbounded storage growth                                                                   |
| **LRU-style tracking**       | `lastUsedAt` timestamp updated on every read                  | Purge targets least-recently-used entries first                                                     |
| **Operation deduplication**  | `ongoingOperations: Map<string, Promise>`                     | Two components requesting the same cache key simultaneously don't trigger duplicate IndexedDB reads |
| **Metadata separation**      | Data and metadata stored in separate object stores            | Metadata queries (for purging) don't need to load full blob data                                    |
| **Version upgrade handling** | Detects IndexedDB version conflicts and auto-recreates stores | Graceful recovery from browser extension interference                                               |

### 10.2 Media Cache

**File:** [media-cache.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/general/media-cache.ts)

Caches fetched media blobs in IndexedDB with:

- **Blob URL management** — creates blob URLs from cached data and tracks them in an in-memory `Map` for reverse lookup
- **Fetch deduplication** — `pendingFetches: Map<string, Promise>` prevents the same URL from being fetched twice simultaneously
- **CORS redirect handling** — automatically follows redirects and uses the final URL
- **Proper cleanup** — `revokeAllBlobUrls()` method prevents blob URL memory leaks on unmount

### 10.3 Thumbnail Sprite Cache

**File:** [thumbnail-cache.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/general/thumbnail-cache.ts)

Generates sprite sheets of video thumbnails for timeline display:

**Optimizations:**

- **Sprite packing** — multiple thumbnails packed into a single large image (CSS sprite technique) instead of individual images. One HTTP/IndexedDB request instead of dozens.
- **DPR-invariant rendering** — coordinates are in CSS pixels, stable across Windows scaling settings
- **Safety cap** — `MAX_TILES = 2000` prevents runaway sprite generation for very long videos
- **Concurrent request deduplication** — `ongoingRequests: Map` returns the same promise for identical generation parameters
- **Rect lookup function** — `buildRectForTime()` returns a stable function that maps timestamps to sprite coordinates in O(1)

---

## 11. Adaptive Quality System

### 11.1 Dynamic Preview Quality Manager

**File:** [adaptive-preview-quality.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/adaptive-preview-quality.ts)

A state machine that dynamically adjusts preview quality based on interaction type:

```
┌──────────┐    ┌───────────┐    ┌──────────┐
│   idle   │───►│ scrubbing │───►│ playback │
└──────────┘    └───────────┘    └──────────┘
     │               │               │
     ▼               ▼               ▼
  Full Quality   Reduced Scale   Balanced Quality
  All Effects    Skip Heavy FX   Adaptive Frame Skip
```

**Per-state quality settings:**

- **Idle** — full resolution, all effects, no frame skipping
- **Scrubbing** — reduced resolution scale, heavy effects skipped, frame skipping enabled
- **Playback** — moderate quality, auto-adjusted based on frame timing

**Performance monitoring:**

- Records frame times in a rolling buffer
- `autoAdjustQuality()` compares average frame time against target (16.67ms for 60fps)
- Automatically degrades or upgrades quality to maintain target framerate
- **Hysteresis** — quality doesn't upgrade immediately after a single good frame; it waits for sustained good performance

### 11.2 React Hook Integration

```typescript
export function useAdaptiveQuality(): {
  quality: QualitySettings;
  setState: (state: PreviewState) => void;
  recordFrame: (ms: number) => void;
};
```

> **Benefit:** Components don't need to implement their own quality management. They call `setState('scrubbing')` and receive the appropriate quality settings automatically.

---

## 12. CSS Layout & Containment

### 12.1 CSS Containment

**File:** [main.tsx#L54-L59](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/main.tsx#L54-L59)

```typescript
const layerContainer: React.CSSProperties = {
  overflow: "hidden",
  maxWidth: "3000px",
  contain: "layout style", // ← CSS Containment
};
```

**File:** [timeline-item.tsx#L1494](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-item.tsx#L1494)

```typescript
style={{
  contain: 'layout style',  // ← Each timeline item is isolated
}}
```

> **Benefit:** `contain: layout style` tells the browser that changes inside this element cannot affect layout or style outside it. This allows the browser to optimize by:
>
> - Skipping style recalculation of siblings
> - Limiting layout recalculation scope
> - Enabling parallel style resolution

### 12.2 Content Visibility

**File:** [timeline-content.tsx#L866-L868](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-content.tsx#L866-L868)

```jsx
<div className="timeline-tracks-container" style={{
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 500px',
}}>
```

> **Benefit:** `content-visibility: auto` allows the browser to skip rendering of off-screen tracks entirely. `containIntrinsicSize` provides a placeholder size so scrollbar calculations remain correct without rendering the content.

### 12.3 GPU-Composited Transforms

Timeline content uses `transform` for scrolling and `will-change` hints:

```typescript
const timelineContentStyle = useMemo(
  () => ({
    width: scrollableWidth,
    minWidth: "100%",
    willChange: "width" as const,
    transform: "translateZ(0)", // Force GPU layer
  }),
  [scrollableWidth],
);
```

> **Benefit:** `translateZ(0)` promotes the element to its own GPU compositing layer, making subsequent transforms (scroll, zoom) happen entirely on the GPU without triggering main thread layout.

### 12.4 Minimal Transition Properties

```typescript
style={{
  transition: 'opacity 0.1s ease-out', // ONLY opacity transitions
}}
```

> **Benefit:** Timeline items explicitly only animate `opacity`, avoiding expensive `transform` or `left` transitions during drag operations that would cause jank.

---

## 13. Utility-Level Optimizations

### 13.1 Throttle Utility

**File:** [video-editor-store.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts) — `createThrottle()`

```typescript
function createThrottle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): T {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    const now = Date.now();
    if (timer) clearTimeout(timer);
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    } else {
      timer = setTimeout(
        () => {
          lastCall = Date.now();
          fn(...args);
        },
        ms - (now - lastCall),
      );
    }
  }) as T;
}
```

**Used for:** Throttling undo/redo history snapshots during rapid operations (drag, resize, trim) at 500ms intervals. Without this, dragging a clip would create hundreds of undo states.

### 13.2 Debounce Utility

**File:** [debounce.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/general/debounce.ts)

Lightweight custom implementation (24 lines) replacing `lodash/debounce`:

> **Benefit:** Avoids importing the entire lodash library (or lodash/debounce sub-package) for a simple debounce. Reduces bundle size.

### 13.3 Split-Position Throttling with RAF

**File:** [timeline-item.tsx#L1149-L1172](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-item.tsx#L1149-L1172)

```typescript
const handleMouseMove = useCallback(
  (e: React.MouseEvent) => {
    if (splitThrottleRef.current) {
      cancelAnimationFrame(splitThrottleRef.current);
    }
    splitThrottleRef.current = requestAnimationFrame(() => {
      // Calculate and update split position
      // Only update if position changed significantly (>0.5%)
      if (Math.abs(percentage - lastSplitPositionRef.current) > 0.5) {
        setSplitPosition(percentage);
      }
    });
  },
  [splittingEnabled],
);
```

> **Benefit:** Double optimization — RAF-based throttling ensures at most one update per display frame, and the 0.5% threshold prevents updates for sub-pixel mouse movements.

### 13.4 Keyframe Interpolation Engine

**File:** [keyframe-interpolator.ts](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/keyframe-interpolator.ts)

Supports multiple interpolation types computed at render time:

| Type            | Algorithm                   |
| --------------- | --------------------------- |
| Linear          | Simple `lerp(a, b, t)`      |
| Ease In/Out     | Pre-computed bezier curves  |
| Bounce, Elastic | Mathematical spring physics |
| Step            | Binary threshold            |
| Custom Bezier   | User-defined control points |

**Optimization:** Binary search for keyframe lookup — `getInterpolatedValue()` finds the surrounding keyframes in O(log n) time, not O(n).

---

## 14. Undo/Redo History Optimizations

**File:** [video-editor-store.ts#L2622-L2644](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2622-L2644)

### 14.1 Partialized History

```typescript
partialize: (state: VideoEditorStore) => ({
  clips: state.clips,
  tracks: state.tracks,
  trackOrder: state.trackOrder,
  transitions: state.transitions,
}),
```

> **Benefit:** Only timeline-relevant state is tracked in history. UI state (selection, playback position, drag state, edit mode) is excluded. This reduces memory usage by 60-80% per history entry.

### 14.2 Reference Equality Skip

```typescript
equality: (pastState: any, currentState: any) =>
  pastState.clips === currentState.clips &&
  pastState.tracks === currentState.tracks &&
  pastState.trackOrder === currentState.trackOrder &&
  pastState.transitions === currentState.transitions,
```

> **Benefit:** Cheap reference comparison (4 `===` checks) determines if anything changed. Actions that only modify UI state (selection change, playback toggle) produce no history entry at all.

### 14.3 Throttled History Recording

```typescript
handleSet: (handleSet: any) =>
  createThrottle<typeof handleSet>((state: any) => {
    handleSet(state);
  }, 500),
```

> **Benefit:** During drag operations that fire dozens of state updates per second, only one history snapshot is recorded every 500ms. A 3-second drag produces ~6 history entries instead of ~180.

### 14.4 Bounded History Size

```typescript
limit: 50,
```

> **Benefit:** Hard cap at 50 history entries. For a typical state of ~50KB, this limits history memory to ~2.5MB instead of growing unbounded.

---

## 15. Persistence Optimizations

**File:** [video-editor-store.ts#L2647-L2665](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/stores/video-editor-store.ts#L2647-L2665)

### 15.1 Minimal Persistence

```typescript
partialize: (state) => ({
  snappingEnabled: state.snappingEnabled,
  editMode: state.editMode,
  showAlignmentGuides: state.showAlignmentGuides,
  trackHeight: state.trackHeight,
  clipHeight: state.clipHeight,
}),
```

> **Benefit:** Only 5 user preference fields are serialized to localStorage — not the entire project state. This keeps `JSON.stringify/parse` under 1ms. Project data is persisted separately to Supabase.

### 15.2 Safe State Merging

```typescript
merge: (persistedState: any, currentState: any) => ({
  ...currentState,
  ...(persistedState || {}),
}),
```

> **Benefit:** Gracefully handles schema changes — new fields from `currentState` are preserved, old persisted fields override defaults. No migration code needed.

---

## 16. Event Handling Optimizations

### 16.1 Global Event Delegation

**File:** [timeline-content.tsx#L472-L576](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/components/advanced-timeline/components/timeline-content.tsx#L472-L576)

Global mouse/touch listeners are attached **once on mount** with empty dependency arrays:

```typescript
useEffect(() => {
  const handleGlobalMouseMove = (e: MouseEvent) => {
    // Check drag state synchronously from store (not React state)
    const currentDragType = getDragTypeFromStore();
    if (currentDragType !== "item") return;
    // ...
  };

  document.addEventListener("mousemove", handleGlobalMouseMove);
  document.addEventListener("mouseup", handleGlobalMouseUp);
  return () => {
    document.removeEventListener("mousemove", handleGlobalMouseMove);
    document.removeEventListener("mouseup", handleGlobalMouseUp);
  };
}, []); // Empty deps — attach once
```

**Key pattern:** The handler reads drag state from the store synchronously via `useVideoEditorStore.getState()` rather than closing over React state. This:

1. Avoids constantly re-attaching listeners when state changes
2. Prevents the stale closure bug
3. Keeps exactly 2 global listeners (mouse + touch) regardless of how many timeline items exist

### 16.2 Ref-Based Handler Updates

```typescript
const handleDragRef = useRef(handleDrag);
const handleDragEndRef = useRef(handleDragEnd);

useEffect(() => {
  handleDragRef.current = handleDrag;
  handleDragEndRef.current = handleDragEnd;
}, [handleDrag, handleDragEnd]);
```

> **Benefit:** Global event listeners call through refs (`handleDragRef.current()`) instead of depending on the callback directly. This lets the handler logic update without removing and re-adding the event listener.

### 16.3 Coordinate Clamping for Out-of-Bounds Drag

```typescript
const clampedX = Math.max(
  timelineRect.left,
  Math.min(timelineRect.right, e.clientX),
);
const clampedY = Math.max(
  timelineRect.top,
  Math.min(timelineRect.bottom, e.clientY),
);
handleDragRef.current(clampedX, clampedY);
```

> **Benefit:** When the mouse leaves the timeline bounds during a drag, coordinates are clamped to the timeline edges. This prevents the drag state from entering impossible positions and avoids expensive error recovery logic.

### 16.4 Conditional Rendering of Interactive Elements

```typescript
{(isHovering || isSelected) && (
  <TimelineItemResizeHandles ... />
)}
```

```typescript
{isDraggingTransition && (
  <TimelineItemTransitionDropZones ... />
)}
```

```typescript
{splittingEnabled && isHovering && (
  <TimelineItemSplitLine ... />
)}
```

> **Benefit:** Interactive elements (resize handles, drop zones, split lines) are only mounted when needed. With 50 timeline items, this eliminates 100+ resize handle DOM nodes during normal viewing.

---

---

## 17. Multi-Tier Lazy Loading (Timeline Scroll Performance)

**Files:** `timeline-item-content.tsx`, `timeline-item-skeleton.tsx`, `timeline-item-content-factory.tsx`

Timeline items use a **3-phase progressive loading system** that delivers instant scrolling regardless of clip count:

### Phase 0 — Skeleton (0ms, during active scroll)

When items first mount or while the user is actively scrolling, a zero-cost skeleton component renders:

- Simple colored div with clip label + type icon (🎥, 🔊, Aa, etc.)
- **No hooks, no state, no effects, no Zustand subscriptions, no ResizeObserver**
- Mounts/unmounts in <1ms
- Uses `contain: strict` CSS for rendering isolation

### Phase 1 — Basic Content (scroll-stop + 100ms)

After the `ScrollStateContext` signals scroll has stopped and a 100ms settle delay passes:

- Full `TimelineItemContentFactory` renders (labels, badges, effects indicators, resize handles)
- `ResizeObserver` attaches for dimension measurement
- No expensive media processing yet

### Phase 2 — Full Content (via requestIdleCallback)

After Phase 1 completes, expensive hooks fire during browser idle time:

- `useWaveformProcessor` generates audio waveforms
- `useThumbnailGenerator` generates video sprite sheets
- Uses `requestIdleCallback` with 500ms deadline to never block the main thread
- `hasFullyLoadedRef` prevents re-skeletonizing on subsequent scrolls after full load

**Key design:** Items never regress to skeleton once fully loaded (`hasFullyLoadedRef`). The inner `TimelineItemContentInner` component separates expensive hooks from the phase-management component, ensuring Phase 0 never mounts those hooks at all.

---

## 18. Ref-Based Immediate Scroll (Zero React Work During Scroll)

**File:** `use-virtual-scroll.ts`

Scroll position updates **completely bypass React** during active scrolling. Instead of triggering `setState` (which causes full React reconciliation of the massive `TimelineContent` tree), `setScrollX` and `setScrollY` update a ref and mutate the DOM directly:

```typescript
const setScrollX = useCallback(
  (scrollX: number) => {
    liveScrollRef.current.x = clamped; // Update ref (no React!)
    stateRef.current = { ...stateRef.current, scrollX: clamped };
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(applyDOMTransform); // Direct DOM
    }
    // Periodic flush so virtualizedTracks recomputes during scroll
    startPeriodicFlush();
    // Final flush to React state when scrolling stops (150ms idle)
    if (scrollIdleTimerRef.current !== null)
      clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(flushScrollToState, 150);
  },
  [applyDOMTransform, flushScrollToState, startPeriodicFlush],
);
```

`applyDOMTransform` directly sets `element.style.transform` on both the content div and markers div via `scrollContentRef` and `scrollMarkersRef`:

- **During active scroll:** Near-zero React renders. CSS transform moves content at 60fps via rAF + direct DOM mutation. A periodic flush (every 200ms) updates React state so `virtualizedTracks` can recompute and mount newly-visible items.
- **On scroll stop (150ms idle):** `flushScrollToState` fires once → stops periodic flush → `setState` → React catches up → final `virtualizedTracks` recompute.
- Content div and markers header both receive refs for synchronized direct-DOM scroll.

### 18.1 Periodic Virtualization Flush (During Active Scroll)

**Problem:** The ref-based scroll system deferred all React state updates until scrolling stopped (150ms idle). This meant `virtualizedTracks` in `timeline-content.tsx` — which filters track items to only those in the visible viewport — never recomputed during active scrolling. Items beyond the initial viewport buffer stayed invisible until the user stopped scrolling.

**Fix:** Added a periodic `setInterval` (200ms) that flushes live scroll position to React state during active scrolling:

```typescript
const startPeriodicFlush = useCallback(() => {
  if (scrollFlushIntervalRef.current !== null) return; // Already running
  scrollFlushIntervalRef.current = setInterval(() => {
    const { x, y } = liveScrollRef.current;
    setState((prev) => {
      if (
        Math.abs(prev.scrollX - x) < 0.0001 &&
        Math.abs(prev.scrollY - y) < 0.0001
      )
        return prev;
      return { ...prev, scrollX: x, scrollY: y };
    });
  }, 200); // Every 200ms
}, []);
```

- **Starts** when `setScrollX` or `setScrollY` is called (i.e., user begins scrolling)
- **Stops** when `flushScrollToState` fires (scrolling has stopped for 150ms)
- **No-op guard** prevents multiple intervals from stacking
- React state updates every ~200ms, triggering `virtualizedTracks` to re-filter and mount/unmount items as the viewport slides

> **Benefit:** Items now appear within ~200ms of scrolling into the viewport, while still avoiding per-frame React reconciliation (the DOM transform remains ref-based at 60fps). This balances scrolling smoothness with virtualization correctness.

---

## 19. Scroll State Context (Isolated Scroll Signals)

**Files:** `scroll-state-context.tsx`, `use-scroll-velocity.ts`

Scroll velocity tracking and `isScrolling` / `isRapidScrolling` signals are provided via **React context** (not Zustand) for two reasons:

1. **Isolation:** Scroll state changes extremely frequently — using Zustand would trigger the global middleware stack (mutative, temporal, persist) on every scroll
2. **Scope:** Only timeline-internal components need scroll state; global store consumers don't

`useScrollVelocity` hook:

- Tracks `scrollX` deltas via `useEffect` to compute velocity
- `isScrolling = true` on any movement, reverts to `false` after 150ms idle (debounced `setTimeout`)
- `isRapidScrolling = true` when delta exceeds 0.008 normalized units/sample
- `ScrollStateProvider` wraps the timeline tracks area in `timeline-content.tsx`

---

## 20. Lazy Zustand Subscriptions (Timeline Items)

**File:** `timeline-item.tsx`

During fast scrolling, `TimelineItem` components mount and unmount within <100ms. Each mount previously created 3 Zustand subscriptions (`selectEditMode`, `selectDragState`, `selectDragVisuals`), causing significant subscribe/unsubscribe churn.

**Optimization:** Subscriptions are **deferred for 100ms after mount**:

```typescript
const [isStoreSubscribed, setIsStoreSubscribed] = React.useState(false);
React.useEffect(() => {
  const timer = setTimeout(() => setIsStoreSubscribed(true), 100);
  return () => clearTimeout(timer);
}, []);

const editMode = useTypedStore(
  isStoreSubscribed ? selectEditMode : () => getTypedState().editMode,
);
```

- Before 100ms: selectors read from `getTypedState()` (one-shot, zero subscription cost)
- After 100ms: normal reactive subscriptions activate
- Items that unmount within 100ms (scrolled away) never pay subscription setup/teardown cost
- Combined with Phase 0 skeleton rendering, this means scrolling items have near-zero mount cost

---

## 21. Component-Level Lazy Loading (React.lazy + Suspense)

Imports across the editor tree are converted from static `import { X } from '...'` to `React.lazy(() => import('...'))`, splitting each panel/section/tab into its own webpack chunk. Only the **currently active** component is loaded and mounted.

### Files & Scope

| File                  | Items Lazy-Loaded                                                                                                                                                                              | Est. Deferred Code |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `editor-panels.tsx`   | 10 overlay panels (Video, Text, Audio, Captions, Image, LocalMedia, Stickers, Templates, Transitions, Settings)                                                                                | ~300KB+            |
| `inspector-panel.tsx` | 14 inspector sections + AudioInspector (Transform, Appearance, Effects, Masks, Keyframes, ColorGrading, Text, Video, Image, Audio, Shape, MotionGraphics, TransitionInspector, AudioInspector) | ~500KB+            |
| `asset-manager.tsx`   | 5 tabs (Media, Text, Shapes, Effects, MotionGraphics)                                                                                                                                          | ~180KB+            |
| `editor-v2.tsx`       | CompositionEditor (full sub-application)                                                                                                                                                       | ~24KB+             |

### Pattern

**Named exports** (most components):

```ts
const TransformSection = React.lazy(() =>
  import("./sections/transform-section").then((m) => ({
    default: m.TransformSection,
  })),
);
```

**Default exports** (SoundsOverlayPanel, AudioInspector, etc.):

```ts
const AudioInspector = React.lazy(() => import("./audio-inspector"));
```

### Suspense Boundaries & Fallbacks

Each lazy-loaded region is wrapped in `<React.Suspense>` with a context-appropriate skeleton:

- **PanelSkeleton** — shimmer bars mimicking a panel layout (EditorPanels)
- **InspectorSkeleton** — shimmer bars mimicking inspector sections (InspectorPanel)
- **TabSkeleton** — shimmer grid mimicking media thumbnails (AssetManager)
- **Fullscreen spinner** — centered spinner for the CompositionEditor overlay

### Performance Impact

- **Initial JS parse/compile** — reduced by ~1MB+ of deferred chunks
- **First panel switch** — 50–150ms chunk load (then cached)
- **Subsequent switches** — instant (chunk in memory)
- **No functionality loss** — identical behavior, just loaded on-demand

---

## 17. Remotion Layer Rendering Pipeline

**File:** [layer.tsx](file:///c:/Users/owen/Desktop/Projects/Vid-Bolt/web/features/video-editor-v2/utils/remotion/layer.tsx)

The Remotion `Layer` component is the most performance-critical component in the editor — it renders every overlay (video, image, text, audio, shape, caption, motion graphic) on every frame. Three targeted optimizations reduce wasted work in this hot path.

### Rendering Pipeline Flow

```
selectOverlays (reselect) — only recomputes when clips/tracks/transitions/fps change
  ↓
VideoPlayer — does NOT re-render on every frame
  ↓ (passes overlays via inputProps)
Main — calls useCurrentFrame() → re-renders EVERY FRAME
  ↓ (creates visibleOverlays with useMemo([overlays, frame]))
Layer (memo + areLayerPropsEqual) — receives overlay + allOverlays as props
  ↓
areLayerPropsEqual runs per Layer per frame
  ↓
If returns true  → Layer STILL re-renders via useCurrentFrame() context
If returns false → Layer re-renders TWICE (context + parent prop-change)
```

> **Key insight:** `React.memo` does NOT block context-triggered re-renders. Since `Layer` calls `useCurrentFrame()`, it re-renders every frame regardless of what `areLayerPropsEqual` returns. The comparator only controls whether the parent's prop-change ALSO triggers a re-render (causing a duplicate).

### 17.1 Keyframe Re-render Deduplication

Previously, any overlay with active keyframes forced `areLayerPropsEqual` to return `false` unconditionally:

```typescript
// OLD: Caused duplicate re-render per frame per keyframed overlay
const nextKeyframes = (next as any).keyframes;
if (nextKeyframes && Array.isArray(nextKeyframes)) {
  const hasActiveKeyframes = nextKeyframes.some(
    (pk: any) => pk.enabled && pk.keyframes && pk.keyframes.length > 0,
  );
  if (hasActiveKeyframes) {
    return false; // Forces re-render from parent
  }
}
```

This caused every keyframed overlay to re-render **twice** per frame:

1. Once from Remotion's `useCurrentFrame()` context change (unavoidable, runs hooks)
2. Once from the parent's prop-based re-render (because comparator said props changed)

**Fix:** Removed the unconditional bail-out. The comparator now falls through to compare actual overlay data. Since overlay references are stable during playback (from memoized `selectOverlays`), the comparator returns `true`, and only the context-triggered re-render fires. The hooks (`useKeyframedTransform`, etc.) still execute on that single re-render.

> **Impact:** For N keyframed overlays at 30fps, eliminates N×30 duplicate re-renders per second.

### 17.2 Shallow Comparison in areLayerPropsEqual

The comparator previously used `JSON.stringify` at 7 sites (masks, effects, audioEffects, styles, greenscreen, keyframes, transitions) for deep comparison:

```typescript
// OLD: O(serialize_size) per property per overlay
if (prevMasks !== nextMasks) {
  if (JSON.stringify(prevMasks) !== JSON.stringify(nextMasks)) {
    return false;
  }
}
```

While guarded by reference checks (so they don't fire during pure playback), they fire during editing operations when `selectOverlays` recomputes and produces new overlay object references.

**Fix:** Replaced with `shallowArrayEqual` (for arrays: masks, effects, audioEffects, keyframes) and `shallowObjectEqual` (for objects: styles, greenscreen, inTransition, outTransition):

```typescript
// NEW: O(keys) comparison — handles common case of same item references
function shallowArrayEqual(
  a: any[] | undefined | null,
  b: any[] | undefined | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function shallowObjectEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
```

> **Impact:** During editing with 20+ overlays, replaces O(n×serialize_size) stringify with O(keys) shallow comparison. For style objects (~10 keys), this is ~10× faster. Safe: never misses real changes (false positives just cause a re-render that would have happened anyway).

### 17.3 Memoized renderContent

The Layer component previously created new JSX elements (`<LayerContent>`, `<TrackMatteLayer>`) via a `renderContent()` function on every render:

```typescript
// OLD: New elements created on every context-triggered re-render
const renderContent = () => {
  const content = <LayerContent overlay={overlay} ... />;
  if (trackMatte && matteSourceOverlay) {
    return <TrackMatteLayer ...>{content}</TrackMatteLayer>;
  }
  return content;
};
```

**Fix:** Replaced with `useMemo` so the JSX subtree is cached:

```typescript
// NEW: Cached — React reconciler sees same element refs and skips subtree diff
const renderedContent = useMemo(() => {
  const content = <LayerContent overlay={overlay} ... />;
  if (trackMatte && matteSourceOverlay) {
    return <TrackMatteLayer ...>{content}</TrackMatteLayer>;
  }
  return content;
}, [overlay, isEditing, baseUrl, fontInfos, trackMatte, matteSourceOverlay]);
```

During playback, `overlay` reference is stable (from memoized `selectOverlays`), so `useMemo` returns cached JSX. React's reconciler sees the same element references and skips diffing the entire `LayerContent` subtree.

> **Impact:** Avoids re-creating and re-diffing the entire layer content subtree (which dispatches to video/image/text/audio/caption/shape components) on every context-triggered re-render.

---

## Summary

The Video Editor V2 employs a **layered optimization strategy** touching every level of the stack:

| Layer            | Key Techniques                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **State**        | Normalized data, memoized selectors (reselect), shallow comparisons, cached actions, partialized history, lazy subscriptions                                               |
| **React**        | `React.memo` with custom comparators, stable callback refs, atomic selectors, conditional rendering, `useDeferredValue`                                                    |
| **DOM**          | Virtualization (timeline + overlays), CSS containment, multi-tier lazy loading (skeleton → basic → full), GPU-composited transforms                                        |
| **Lazy Loading** | `React.lazy` + `Suspense` for 30+ panels/sections/tabs, skeleton fallbacks, deferred chunk loading, composition editor on-demand                                           |
| **Scroll**       | rAF-coalesced state updates, scroll-velocity-aware rendering, isolated scroll context, deferred mount phases, periodic virtualization flush during active scroll           |
| **Computation**  | Web Workers (effects + Babel), WebGL shaders, split update rates, RAF throttling, requestIdleCallback for heavy content                                                    |
| **Audio**        | Singleton context, effect caching, resource lifecycle management, offline rendering                                                                                        |
| **Storage**      | IndexedDB with auto-purge, sprite caching, fetch deduplication, blob URL management                                                                                        |
| **Rendering**    | Adaptive quality, deterministic noise, box blur approximation, conditional canvas processing, Layer re-render deduplication, shallow prop comparison, memoized content JSX |
| **Selection**    | Per-track memo comparison, O(1) reverse clip lookup, direct store index access, ref-based callback decoupling                                                              |

These optimizations work together to achieve commercial-grade performance — the editor handles 50+ clips across multiple tracks with real-time effects, maintaining responsive scrubbing (<50ms frame times) and smooth 60fps playback. Timeline scrolling is instant regardless of clip count, with progressive content loading during idle time.

---

## 18. Selection Performance Optimizations

Optimizations targeting the click-to-selection-to-inspector-render path, eliminating O(N) operations and unnecessary re-renders when selecting clips.

### 18.1 Per-Track Selection Memo Comparison

**File:** `components/advanced-timeline/components/timeline-track.tsx` — `MemoizedTimelineTrack`

**Problem:** The `MemoizedTimelineTrack` comparison function compared the full `selectedItemIds` array. When any clip was selected, the array reference and content changed, causing **every track** to bust its memo and re-render — even tracks with zero selection state change.

With 10 tracks × 50 items = 500 elements being mapped and reconciled per selection click.

**Fix:** Instead of comparing the full `selectedItemIds` array, we now only check whether items **in this specific track** changed their selection status:

```typescript
// BEFORE: Compared full array — busted ALL tracks
const prevIds = prevProps.selectedItemIds || [];
const nextIds = nextProps.selectedItemIds || [];
if (prevIds.length !== nextIds.length) return false;
for (let i = 0; i < prevIds.length; i++) {
  if (prevIds[i] !== nextIds[i]) return false;
}

// AFTER: Per-track check — only busts affected tracks
const prevSelSet = new Set(prevProps.selectedItemIds || []);
const nextSelSet = new Set(nextProps.selectedItemIds || []);
const trackItems = nextProps.track.items;
for (let i = 0; i < trackItems.length; i++) {
  const itemId = trackItems[i].id;
  if (prevSelSet.has(itemId) !== nextSelSet.has(itemId)) return false;
}
```

> **Impact:** Reduces track re-renders from O(allTracks) to O(affectedTracks) — typically 1-2 tracks instead of all 10+.

### 18.2 O(1) handleChangeOverlay Reverse Lookup

**File:** `components/inspector/inspector-panel.tsx` — `handleChangeOverlay`

**Problem:** Every property edit in the inspector triggered:

1. `Object.values(state.clips)` — O(N) array materialization
2. `.find()` with `parseInt` + regex — O(N) linear scan per clip
3. `Object.values(state.tracks)` — O(N) array materialization
4. `.find()` for track — O(N) linear scan

Total: O(4N) per property change.

**Fix:** Use `activeClipRef` (a ref tracking the currently selected clip) for O(1) reverse lookup, and direct `state.tracks[clip.trackId]` for O(1) track access:

```typescript
// BEFORE: O(N) materialization + linear scan with regex
const timelineClips = Object.values(state.clips);
const clip = timelineClips.find((c) => {
  const clipNumericId = parseInt(c.id.replace(/\D/g, ""), 10) || 0;
  return clipNumericId === id;
});
const track = Object.values(state.tracks).find((t) => t.id === clip.trackId);

// AFTER: O(1) direct lookups
const clip =
  activeClipRef.current &&
  (parseInt(activeClipRef.current.id.replace(/\D/g, ""), 10) || 0) === id
    ? activeClipRef.current
    : null;
const track = state.tracks[clip.trackId];
```

> **Impact:** Eliminates O(4N) operations per inspector property edit, making edits instant regardless of clip count.

### 18.3 Debug Log Removal from Hot Path

**File:** `components/inspector/inspector-panel.tsx`

**Problem:** Unconditional `console.log` calls in the render path constructed objects on every render:

- Transition selection debug log (fires every render when a transition is selected)
- Motion graphics debug log (fires every render when a motion graphics clip is selected)
- Speed change debug log (fires on every speed edit)

**Fix:** Removed all three debug logs from the hot path.

> **Impact:** Eliminates object allocation and string serialization overhead during rendering.

### 18.4 Transition Lookup Pre-Computation — O(N×M) → O(N+M)

**Files:**

- `utils/clip-to-render-adapter.ts` — `buildTransitionLookup()`, `clipToOverlay()`, `clipsToOverlaysWithTracks()`, `clipsToRenderClips()`
- `components/inspector/inspector-panel.tsx` — `activeOverlay` useMemo, `handleChangeOverlay`

**Problem:** `getClipTransitionsPure()` performs `Object.values(transitions).forEach(...)` — an O(M) linear scan over all transitions. It was called **once per clip** from `clipToOverlay()` inside batch functions like `clipsToOverlaysWithTracks()`, creating an **O(N × M)** bottleneck.

Chrome DevTools profiler confirmed this consumed **10,807ms of self time (65.3%)** during a clip interaction under stress conditions (50+ clips), producing an **INP of 11,808ms**.

**Fix:** Introduced `buildTransitionLookup()` — a function that pre-builds a `Map<clipId, {inTransition, outTransition}>` in a **single O(M) pass**. The map is built once before the clip loop, and each clip performs an **O(1) `Map.get()`** instead of a full O(M) scan:

```typescript
// BEFORE: O(N × M) — getClipTransitionsPure called N times, each scanning M transitions
for (const clip of clips) {
  const overlay = clipToOverlay(clip, fps, trackIndex, transitions);
  // internally: getClipTransitionsPure(clip.id, transitions) → O(M) forEach
}

// AFTER: O(N + M) — build map once O(M), then O(1) per clip
const transitionLookup = buildTransitionLookup(transitions); // O(M) once
for (const clip of clips) {
  const overlay = clipToOverlay(
    clip,
    fps,
    trackIndex,
    transitions,
    transitionLookup,
  );
  // internally: transitionLookup.get(clip.id) → O(1)
}
```

`clipToOverlay()` accepts an optional `prebuiltLookup` parameter — when provided, it skips `getClipTransitionsPure` entirely. When not provided (single-clip use), it falls back to the O(M) scan for backward compatibility.

Applied to all batch call sites:

- `clipsToOverlaysWithTracks()` — feeds the Remotion rendering pipeline via `selectOverlays`
- `clipsToRenderClips()` — feeds the render clip pipeline
- `inspector-panel.tsx` — `activeOverlay` computation and `handleChangeOverlay`

**Measured Results:**

| Metric                             | Before    | After    | Improvement              |
| ---------------------------------- | --------- | -------- | ------------------------ |
| INP (Interaction to Next Paint)    | 11,808 ms | 872 ms   | **13.5× faster**         |
| `getClipTransitionsPure` self time | 10,807 ms | ~0 ms    | Eliminated from hot path |
| Complexity per batch operation     | O(N × M)  | O(N + M) | Algorithmic fix          |

> **Impact:** The single largest performance fix in the editor — reduced INP by 13.5× under stress conditions. The algorithmic improvement from O(N×M) to O(N+M) means performance scales linearly with content rather than quadratically.

---

## 19. CSS/DOM Performance Optimizations

After resolving the JavaScript bottlenecks in Section 18, the profiler revealed the performance bottleneck had shifted from JS to CSS/DOM rendering:

| Metric             | Before (§18.4)               | After (§19)                  | Improvement                               |
| ------------------ | ---------------------------- | ---------------------------- | ----------------------------------------- |
| INP                | 872 ms                       | **128 ms**                   | **6.8× faster** — now in "good" threshold |
| Recalculate style  | 7,283 ms                     | 6,947 ms                     | Reduced                                   |
| Event: pointerover | 634 ms self / 5,954 ms total | 408 ms self / 2,648 ms total | **2.2× less pointer overhead**            |

### 19.1 Shared ContextMenu — O(N) Radix Instances → O(1)

**Files:**

- `components/advanced-timeline/components/timeline-item.tsx` — removed per-item `<ContextMenu>` wrapper
- `components/advanced-timeline/components/timeline-track.tsx` — added single shared `<ContextMenu>` per track

**Problem:** Each of 50+ `TimelineItem` components was individually wrapped in a Radix `<ContextMenu>` + `<ContextMenuTrigger>`. Every instance created:

- A React context provider tree
- Event listeners on the trigger element
- Internal Radix state management
- Hidden DOM nodes for the menu portal

This created **O(N)** overhead where N = number of timeline items, contributing heavily to "Recalculate style" and pointer event costs.

**Fix:** Lifted the context menu to the `TimelineTrack` level:

1. Removed `<ContextMenu>` + `<ContextMenuTrigger>` from each `TimelineItem`
2. Added `onContextMenuRequest` callback prop — items pass their menu data (handlers, labels, state) to the parent on right-click
3. One `<ContextMenu>` wraps the entire track div, with a `<TimelineItemContextMenu>` that reads from the most recently right-clicked item's data
4. The native `contextmenu` event bubbles from the item through the track's `<ContextMenuTrigger>`, opening the shared menu

```typescript
// BEFORE: O(N) Radix instances — each item renders its own ContextMenu
<ContextMenu onOpenChange={onContextMenuOpenChange}>
  <ContextMenuTrigger asChild>
    <div>{/* item content */}</div>
  </ContextMenuTrigger>
  <TimelineItemContextMenu ... />
</ContextMenu>

// AFTER: O(1) — one shared ContextMenu per track
// In TimelineItem: just set data and let event bubble
const handleContextMenu = (e: React.MouseEvent) => {
  onContextMenuRequest?.({ itemId, handlers, labels });
  // Event bubbles to track-level <ContextMenuTrigger>
};

// In TimelineTrack: single shared instance
<ContextMenu>
  <ContextMenuTrigger asChild>{trackContent}</ContextMenuTrigger>
  <TimelineItemContextMenu {...contextMenuData} />
</ContextMenu>
```

> **Impact:** Eliminates ~50 Radix ContextMenu provider trees, event listener sets, and hidden DOM nodes. Reduces DOM node count and style recalculation scope.

### 19.2 CSS Hover & Transition Removal

**File:** `components/advanced-timeline/components/timeline-item.tsx`

**Problem:** Each timeline item had:

- `shadow-sm hover:shadow-md` — `box-shadow` changes on hover trigger paint for every item under the cursor
- `transition: 'opacity 0.1s ease-out'` — forces the browser to create a compositing layer per item

With 50+ items, pointer movement caused cascading paint operations.

**Fix:** Removed both `shadow-sm hover:shadow-md` from the className and the CSS `transition` property. Opacity changes are rare (only on locked/hidden tracks) and don't need animation.

> **Impact:** Reduces paint operations during pointer movement. The "Event: pointerover" self time dropped from 634ms to 408ms.

### 19.3 CSS Containment Upgrade — `layout style` → `strict`

**Files:**

- `components/advanced-timeline/components/timeline-item.tsx`
- `components/advanced-timeline/components/timeline-track.tsx`

**Problem:** Both timeline items and tracks used `contain: 'layout style'`, which isolates layout and style calculations but doesn't isolate paint or size.

**Fix:** Upgraded to `contain: 'strict'` (equivalent to `size layout paint style`) on both items and tracks. This is safe because:

- Items have explicit `width` (percentage) and `height` (`var(--timeline-item-height, 40px)`)
- Tracks have explicit `height` (`var(--timeline-track-height, 48px)`)

> **Impact:** The browser can now skip painting off-screen items entirely and doesn't cascade style recalculations across sibling items or tracks.

### 19.4 MasksSection Subscription Fix

**File:** `components/inspector/sections/masks-section.tsx`

**Problem:** `MasksSection` subscribed to `Object.values(state.clips)` directly, which creates a new array on every store change — triggering unnecessary re-renders and recomputing `clipToOverlay()` for every clip.

**Fix:** Subscribe to `state.clips` (the stable record reference) and derive overlays in `useMemo`:

```typescript
// BEFORE: new array on every store change → re-render every time
const clips = useVideoEditorStore((state) => Object.values(state.clips));
const overlays = clips.map((clip) => clipToOverlay(clip, fps));

// AFTER: stable reference → only re-renders when clips actually change
const clipsRecord = useVideoEditorStore((state) => state.clips);
const overlays = useMemo(
  () => Object.values(clipsRecord).map((clip) => clipToOverlay(clip, fps)),
  [clipsRecord, fps],
);
```

> **Impact:** Prevents unnecessary re-renders of the MasksSection panel when unrelated store state changes (e.g., playback position, selection).

---

## 20. Canvas Timeline Optimizations

The canvas timeline replaces the DOM-based track/item rendering tree with a PixiJS (WebGL) renderer. Instead of 1,250+ DOM nodes, the entire timeline is one `<canvas>` element — eliminating Recalculate Style entirely.

### 20.1 GPU-Accelerated Rendering (PixiJS)

**Files:** `canvas-timeline.tsx`, `canvas-timeline-track.tsx`, `canvas-timeline-item.tsx`

All timeline items are rendered as PixiJS `Graphics` draw calls (rounded rectangles, text, lines) on a single WebGL canvas. The GPU batches all draw commands into one pass — the cost of rendering 100 vs 1,000 items is nearly identical.

| Metric               | DOM Timeline | Canvas Timeline        |
| -------------------- | ------------ | ---------------------- |
| DOM nodes (50 items) | ~1,250       | **1** (canvas element) |
| Recalculate Style    | 5,602ms      | **0ms**                |
| Re-render on scroll  | ~50-200ms    | **~0.5ms**             |
| Memory per item      | ~2-5KB       | ~200 bytes             |

### 20.2 React.memo on Canvas Components

**Files:** `canvas-timeline-item.tsx`, `canvas-timeline-track.tsx`

Both components are wrapped in `React.memo`:

```typescript
export const CanvasTimelineItem = React.memo(function CanvasTimelineItem({ ... }) { ... });
export const CanvasTimelineTrack = React.memo(function CanvasTimelineTrack({ ... }) { ... });
```

> **Benefit:** Prevents re-renders of items/tracks when only sibling items change or when rapidly-changing props (like `currentFrame`) update. Combined with PixiJS's declarative `@pixi/react` bindings, only visually-changed items trigger GPU draw call updates.

### 20.3 Professional Keyboard Shortcuts (getState Pattern)

**File:** `use-canvas-keyboard.ts`

All keyboard shortcuts read store state via `useVideoEditorStore.getState()` inside the callback body — not via subscriptions:

```typescript
const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  const state = useVideoEditorStore.getState(); // No subscription, no re-render
  const { splitClip, deleteClips, togglePlayPause, ... } = state;
  // ...
}, [tracks, selectedItemIds]); // Minimal deps
```

> **Benefit:** The callback itself never causes component re-renders. It reads fresh state on-demand. This pattern is critical for the 30+ keyboard shortcuts — subscribing to `clips`, `playback`, `selection`, etc. would cause the containing component to re-render on every scrub/selection/edit.

**Shortcuts implemented:** JKL shuttle (1×→2×→4×→8×), frame stepping (←/→, ±1/±10 frames), edit point navigation (↑/↓), split at playhead (C/Ctrl+K), trim to playhead (Q/W), clip nudge (,/. ±1/±10 frames), duplicate (D), copy/paste/cut (Ctrl+C/V/X with relative offset preservation), select all (Ctrl+A), tool switching (V/B), snapping toggle (S/N), link/unlink (Ctrl+L), zoom (+/-/Shift+Z), undo/redo (Ctrl+Z/Y).

### 20.4 Playhead Auto-Scroll (RAF-Based)

**File:** `use-auto-scroll.ts`

During playback, a `requestAnimationFrame` loop monitors the playhead pixel position and smooth-scrolls the viewport:

```typescript
const newScrollX =
  lastScrollRef.current + (targetScrollX - lastScrollRef.current) * SCROLL_LERP;
```

- **Lerp factor (0.12)** — smooth interpolation, not jarring jumps
- **Subscribes to `playback.isPlaying`** via `subscribeWithSelector` — starts/stops the RAF loop automatically
- **Edge margin detection** — only scrolls when playhead approaches viewport edges (60px margin)

> **Benefit:** No React re-renders during auto-scroll — all state lives in refs, updates happen imperatively via the `onScrollChange` callback. The RAF loop self-terminates when playback stops.

### 20.5 ARIA Accessibility Mirror

**File:** `canvas-timeline-aria.tsx`

A hidden DOM `<ul role="listbox">` mirrors the canvas state for screen readers:

```tsx
<div style={VISUALLY_HIDDEN_STYLE} role="region" aria-label="Timeline items">
  <ul role="listbox" aria-label="Timeline clips" aria-multiselectable="true">
    {items.map((item) => (
      <li role="option" aria-selected={item.selected} aria-label={item.label} />
    ))}
  </ul>
</div>
```

**Optimizations:**

- `useMemo` derivation from `tracks` + `selectedItemIds` — zero overhead during playback
- Visually hidden via `clip: rect(0, 0, 0, 0)` — no layout/paint cost
- Only re-renders when selection or track data changes — not on scroll/zoom/playback

> **Benefit:** Screen readers (NVDA, VoiceOver) can navigate timeline clips via standard listbox patterns. The canvas container itself has `role="application"`, `aria-label="Timeline editor"`, and `tabIndex={0}` for focus management.

### 20.6 In-Memory Clipboard

**File:** `use-canvas-keyboard.ts` (inline), `use-clipboard.ts` (standalone)

Clip copy/paste uses an in-memory buffer rather than the OS clipboard:

```typescript
// Copy: store relative offsets from earliest selected clip
clipboardRef.current = selectedItemIds.map((id) => ({
  clipId: id,
  trackId: clip.trackId,
  offset: clip.startTime - earliest,
}));

// Paste: duplicate + reposition at playhead
const newId = duplicateClip(entry.clipId);
moveClip(newId, entry.trackId, currentTime + entry.offset);
```

> **Benefit:** Multi-clip paste preserves relative timing. No serialization overhead (refs hold plain objects). IDs are regenerated via `duplicateClip` — no ID collisions.
