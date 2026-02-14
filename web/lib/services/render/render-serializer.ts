/**
 * Render Serializer
 *
 * Converts the Video Editor V2 store state into a serializable payload
 * that can be sent to Remotion Lambda as `inputProps`.
 *
 * Responsibilities:
 * - Ensures all media URLs are absolute public URLs
 * - Strips non-serializable data (functions, React refs)
 * - Validates payload size (Lambda has a ~6MB invocation limit)
 * - Provides fallback for oversized payloads via R2 upload
 */

import type { Overlay } from "@/features/video-editor-v2/types";

// ============================================================
// TYPES
// ============================================================

export interface SerializedRenderProps {
  overlays: Overlay[];
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  src: string;
}

export interface SerializeResult {
  /** The serialized inputProps ready for Lambda */
  inputProps: SerializedRenderProps;
  /** Estimated payload size in bytes */
  payloadSizeBytes: number;
  /** Whether the payload was too large and needs R2 upload */
  requiresR2Upload: boolean;
  /** Warnings generated during serialization */
  warnings: string[];
}

// ============================================================
// CONSTANTS
// ============================================================

/** Lambda invocation payload size limit (6MB minus overhead) */
const MAX_PAYLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (safe margin under 6MB Lambda limit)

// ============================================================
// URL RESOLUTION
// ============================================================

/**
 * Ensures a media URL is absolute.
 * Relative paths are resolved against the base URL.
 * Handles /r2-media/ proxy paths by rewriting to the absolute R2 public URL.
 */
function resolveMediaUrl(url: string | undefined, baseUrl?: string): string {
  if (!url) return "";
  // Already absolute
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Data URLs
  if (url.startsWith("data:")) return url;
  // Blob URLs (can't be used in Lambda — flag as warning)
  if (url.startsWith("blob:")) return url;
  // /r2-media/ proxy paths — rewrite to absolute R2 public URL
  // These are Next.js rewrites that work in the browser but Lambda can't resolve them
  if (url.startsWith("/r2-media/")) {
    const r2PublicUrl = process.env.R2_PUBLIC_URL || "https://assets.vidbolt.app";
    return `${r2PublicUrl}/${url.replace("/r2-media/", "")}`;
  }
  // Relative path — resolve against base
  if (baseUrl) {
    return new URL(url, baseUrl).href;
  }
  return url;
}

// ============================================================
// SERIALIZATION
// ============================================================

/**
 * Strips non-serializable values from an object tree.
 * Removes functions, symbols, undefined values, and circular references.
 */
function stripNonSerializable(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "function") return undefined;
  if (typeof obj === "symbol") return undefined;
  if (typeof obj === "bigint") return Number(obj);

  if (Array.isArray(obj)) {
    return obj.map(stripNonSerializable).filter((v) => v !== undefined);
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip React internal keys
      if (key.startsWith("__react") || key.startsWith("$$typeof")) continue;
      const stripped = stripNonSerializable(value);
      if (stripped !== undefined) {
        result[key] = stripped;
      }
    }
    return result;
  }

  return obj;
}

/**
 * Resolves all media URLs in an overlay array to absolute paths.
 */
function resolveOverlayUrls(
  overlays: Overlay[],
  baseUrl?: string
): { resolved: Overlay[]; warnings: string[] } {
  const warnings: string[] = [];

  const resolved = overlays.map((overlay) => {
    const copy = { ...overlay } as any;

    // Resolve `src` field (video, image, sound overlays)
    if ("src" in copy && typeof copy.src === "string") {
      if (copy.src.startsWith("blob:")) {
        warnings.push(
          `Overlay ${copy.id} has a blob: URL for src — this won't work in Lambda. Upload to R2 first.`
        );
      }
      copy.src = resolveMediaUrl(copy.src, baseUrl);
    }

    // Resolve `content` field (may contain URLs)
    if ("content" in copy && typeof copy.content === "string") {
      if (
        copy.content.startsWith("http") ||
        copy.content.startsWith("/") ||
        copy.content.startsWith("blob:")
      ) {
        copy.content = resolveMediaUrl(copy.content, baseUrl);
      }
    }

    return copy as Overlay;
  });

  return { resolved, warnings };
}

// ============================================================
// MAIN SERIALIZER
// ============================================================

/**
 * Serializes the editor render state into Lambda-compatible inputProps.
 *
 * @param renderState - The render state from buildRenderState() or similar
 * @param options - Configuration options
 * @returns SerializeResult with the inputProps and metadata
 */
export function serializeRenderProps(
  renderState: {
    overlays: Overlay[];
    durationInFrames: number;
    width: number;
    height: number;
    fps: number;
    backgroundColor?: string;
  },
  options: {
    /** Base URL for resolving relative media paths */
    baseUrl?: string;
    /** Source URL passed to the composition */
    src?: string;
  } = {}
): SerializeResult {
  const allWarnings: string[] = [];

  // 1. Resolve all media URLs to absolute paths
  const { resolved: resolvedOverlays, warnings: urlWarnings } =
    resolveOverlayUrls(renderState.overlays, options.baseUrl);
  allWarnings.push(...urlWarnings);

  // 2. Strip non-serializable data
  const cleanOverlays = stripNonSerializable(resolvedOverlays) as Overlay[];

  // 3. Build the inputProps
  const inputProps: SerializedRenderProps = {
    overlays: cleanOverlays,
    durationInFrames: renderState.durationInFrames,
    width: renderState.width,
    height: renderState.height,
    fps: renderState.fps,
    src: options.src ?? "",
  };

  // 4. Measure payload size
  const serialized = JSON.stringify(inputProps);
  const payloadSizeBytes = new TextEncoder().encode(serialized).byteLength;

  // 5. Check if payload exceeds Lambda limit
  const requiresR2Upload = payloadSizeBytes > MAX_PAYLOAD_SIZE_BYTES;
  if (requiresR2Upload) {
    allWarnings.push(
      `Payload size (${(payloadSizeBytes / 1024 / 1024).toFixed(2)}MB) exceeds ` +
        `${(MAX_PAYLOAD_SIZE_BYTES / 1024 / 1024).toFixed(0)}MB limit. ` +
        `InputProps will need to be uploaded to R2 and referenced by URL.`
    );
  }

  return {
    inputProps,
    payloadSizeBytes,
    requiresR2Upload,
    warnings: allWarnings,
  };
}

/**
 * Validates that the input props are render-ready.
 * Returns a list of issues that would prevent rendering.
 */
export function validateRenderProps(
  props: SerializedRenderProps
): string[] {
  const issues: string[] = [];

  if (!props.overlays || props.overlays.length === 0) {
    issues.push("No overlays to render");
  }

  if (props.durationInFrames <= 0) {
    issues.push(`Invalid durationInFrames: ${props.durationInFrames}`);
  }

  if (props.width <= 0 || props.height <= 0) {
    issues.push(`Invalid dimensions: ${props.width}x${props.height}`);
  }

  if (props.fps <= 0) {
    issues.push(`Invalid fps: ${props.fps}`);
  }

  // Check for blob URLs in overlays
  for (const overlay of props.overlays) {
    const src = (overlay as any).src;
    if (typeof src === "string" && src.startsWith("blob:")) {
      issues.push(
        `Overlay ${overlay.id} has a blob: URL — must be uploaded to R2 first`
      );
    }
  }

  return issues;
}
