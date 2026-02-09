/**
 * VideoThumbnailPreview — renders the first frame of a video as a thumbnail.
 *
 * Optimizations:
 *  - IntersectionObserver: only begins loading when the element scrolls into view
 *  - Concurrency queue: limits simultaneous video loads (MAX_CONCURRENT)
 *  - URL cache: re-mounts (e.g. after hover) skip the queue and load instantly
 *  - No CORS issues: uses a native <video> element instead of canvas capture
 *  - Timeout fallback: gives up after TIMEOUT_MS
 */

import React, { useRef, useState, useEffect, useCallback, memo } from "react";
import { Film, Loader2 } from "lucide-react";

// ─── Concurrency control (shared across all instances) ──────────

const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 10_000;

let activeCount = 0;
const waitQueue: Array<() => void> = [];

/** URLs that have successfully loaded at least once (browser cache will serve them fast on re-mount) */
const loadedUrls = new Set<string>();

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  activeCount--;
  if (waitQueue.length > 0) {
    activeCount++;
    const next = waitQueue.shift()!;
    next();
  }
}

// ─── Component ──────────────────────────────────────────────────

type Phase = "idle" | "queued" | "loading" | "done" | "error";

interface VideoThumbnailPreviewProps {
  /** Video source URL */
  src: string;
}

/**
 * Renders a first-frame thumbnail for a video URL.
 * Handles its own lifecycle: visibility detection → queue for load slot → load video → display.
 */
export const VideoThumbnailPreview = memo(
  function VideoThumbnailPreview({ src }: VideoThumbnailPreviewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const slotHeld = useRef(false);
    const srcSet = useRef(false);

    // If URL was previously loaded successfully, skip queue (browser cache)
    const [phase, setPhase] = useState<Phase>(
      loadedUrls.has(src) ? "loading" : "idle"
    );

    // ── 1. IntersectionObserver ─ mark as "queued" when scrolled into view ──
    useEffect(() => {
      if (phase !== "idle") return;
      const el = containerRef.current;
      if (!el || !src) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setPhase("queued");
            observer.disconnect();
          }
        },
        { rootMargin: "200px 0px" } // preload slightly before visible
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, [phase, src]);

    // ── 2. Concurrency queue ─ wait for a load slot ──
    useEffect(() => {
      if (phase !== "queued" || !src) return;

      let cancelled = false;

      acquireSlot().then(() => {
        if (cancelled) {
          releaseSlot();
          return;
        }
        slotHeld.current = true;
        setPhase("loading");
      });

      return () => {
        cancelled = true;
      };
    }, [phase, src]);

    // ── 3. Set video src when loading ──
    useEffect(() => {
      if (phase !== "loading" || !src) return;
      const video = videoRef.current;
      if (video && !srcSet.current) {
        srcSet.current = true;
        video.src = src;
      }
    }, [phase, src]);

    // ── 4. Timeout fallback ──
    useEffect(() => {
      if (phase !== "loading") return;

      const id = setTimeout(() => {
        setPhase("error");
        if (slotHeld.current) {
          releaseSlot();
          slotHeld.current = false;
        }
      }, TIMEOUT_MS);

      return () => clearTimeout(id);
    }, [phase]);

    // ── 5. Cleanup on unmount ──
    useEffect(() => {
      return () => {
        if (slotHeld.current) {
          releaseSlot();
          slotHeld.current = false;
        }
      };
    }, []);

    // ── Event handlers ──

    const handleLoadedData = useCallback(() => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0.1; // seek to guarantee a visible frame
      }
    }, []);

    const handleSeeked = useCallback(() => {
      loadedUrls.add(src);
      setPhase("done");
      if (slotHeld.current) {
        releaseSlot();
        slotHeld.current = false;
      }
    }, [src]);

    const handleError = useCallback(() => {
      setPhase("error");
      if (slotHeld.current) {
        releaseSlot();
        slotHeld.current = false;
      }
    }, []);

    // ── Render ──

    return (
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        {/* Placeholder / loading / error states */}
        {(phase === "idle" || phase === "error") && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-neutral-800">
            <Film className="h-8 w-8 text-neutral-700" />
          </div>
        )}
        {(phase === "queued" || phase === "loading") && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-neutral-800">
            <Loader2 className="h-6 w-6 text-neutral-500 animate-spin" />
          </div>
        )}

        {/* Video element — only created when we have a load slot or are done */}
        {(phase === "loading" || phase === "done") && (
          <video
            ref={videoRef}
            muted
            playsInline
            preload="metadata"
            onLoadedData={handleLoadedData}
            onSeeked={handleSeeked}
            onError={handleError}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              opacity: phase === "done" ? 1 : 0,
              transition: "opacity 0.15s ease-in",
            }}
          />
        )}
      </div>
    );
  }
);
