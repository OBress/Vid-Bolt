/**
 * Playhead Frame Bridge
 * ============================================================================
 * A lightweight, non-React mechanism for broadcasting frame updates
 * to the DOM/PixiJS playhead without triggering React re-renders.
 *
 * Architecture:
 *   Remotion frameupdate → setPlayheadFrame() → subscribers update DOM/PixiJS directly
 *   (Store writes are throttled to every ~10 frames for non-visual consumers)
 */

// Shared mutable frame value — written by useVideoPlayer, read by subscribers
let _currentFrame = 0;
let _fps = 30;

// Subscriber callbacks for imperative playhead updates
type FrameSubscriber = (frame: number, fps: number) => void;
const _subscribers = new Set<FrameSubscriber>();

/**
 * Write the current frame AND immediately notify all subscribers.
 * Called from useVideoPlayer on every Remotion frameupdate event.
 * No rAF loop needed — frameupdate already fires at the video framerate.
 */
export function setPlayheadFrame(frame: number, fps: number): void {
  _currentFrame = frame;
  _fps = fps;
  // Directly notify subscribers for immediate DOM/PixiJS updates
  for (const sub of _subscribers) {
    sub(frame, fps);
  }
}

/**
 * Subscribe to frame updates — returns an unsubscribe function.
 * Subscribers receive (frame, fps) on every Remotion frame during playback.
 */
export function subscribeToPlayhead(cb: FrameSubscriber): () => void {
  _subscribers.add(cb);
  // Immediately call with current value so the subscriber is in sync
  cb(_currentFrame, _fps);
  return () => {
    _subscribers.delete(cb);
  };
}

/**
 * Get the current frame (for one-off reads, e.g. on pause)
 */
export function getPlayheadFrame(): number {
  return _currentFrame;
}
