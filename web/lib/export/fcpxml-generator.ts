/**
 * FCPXML Generator for DaVinci Resolve Export
 * 
 * Generates Final Cut Pro XML (FCPXML) format which DaVinci Resolve
 * imports natively with full timeline support.
 */

import { ITrackItem, ITrack, ITransition } from "@designcombo/types";

export interface FCPXMLOptions {
  projectName: string;
  frameRate: number;
  width: number;
  height: number;
  duration: number; // in frames
  trackItems: Record<string, ITrackItem>;
  tracks: ITrack[];
  transitionsMap?: Record<string, ITransition>;
  mediaPathPrefix?: string; // Relative path prefix for media files
}

export interface MediaAsset {
  id: string;
  name: string;
  originalUrl: string;
  sanitizedName: string;
  type: "video" | "audio" | "image";
  folder: string;
  duration?: number; // in seconds
  hasVideo?: boolean;
  hasAudio?: boolean;
}

/**
 * Sanitize a filename to remove special characters that could cause import issues
 */
export function sanitizeFileName(name: string): string {
  // Remove or replace problematic characters
  return name
    .replace(/[<>:"/\\|?*]/g, "_") // Windows reserved characters
    .replace(/[\x00-\x1f\x80-\x9f]/g, "") // Control characters
    .replace(/^\.+/, "") // Leading dots
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/_+/g, "_") // Multiple underscores to single
    .replace(/^_|_$/g, "") // Leading/trailing underscores
    .slice(0, 200); // Limit length
}

/**
 * Convert frames to FCPXML time format (rational time)
 * FCPXML uses rational time format: "numerator/denominator s"
 */
function framesToFCPTime(frames: number, frameRate: number): string {
  // Convert frames to rational time (frames / frameRate seconds)
  const numerator = Math.round(frames * 1000);
  const denominator = Math.round(frameRate * 1000);
  return `${numerator}/${denominator}s`;
}

/**
 * Convert seconds to FCPXML time format
 */
function secondsToFCPTime(seconds: number, frameRate: number): string {
  const frames = Math.round(seconds * frameRate);
  return framesToFCPTime(frames, frameRate);
}

/**
 * Get file extension from URL or name
 */
function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase() || "";
    return ext;
  } catch {
    // If not a valid URL, try to extract extension directly
    return url.split(".").pop()?.toLowerCase() || "";
  }
}

/**
 * Determine media type from track item type and file extension
 */
function getMediaType(trackItem: ITrackItem): "video" | "audio" | "image" {
  switch (trackItem.type) {
    case "audio":
      return "audio";
    case "image":
      return "image";
    case "video":
    default:
      return "video";
  }
}

/**
 * Get the folder for a media type
 */
function getMediaFolder(type: "video" | "audio" | "image"): string {
  switch (type) {
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "image":
      return "Images";
  }
}

/**
 * Extract media assets from track items
 */
export function extractMediaAssets(
  trackItems: Record<string, ITrackItem>
): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const seenUrls = new Set<string>();

  for (const [id, item] of Object.entries(trackItems)) {
    // Skip non-media items (text, captions, shapes, etc.)
    if (!["video", "audio", "image"].includes(item.type)) {
      continue;
    }

    // Get the source URL
    const sourceUrl = (item as any).details?.src || (item as any).src;
    if (!sourceUrl || seenUrls.has(sourceUrl)) {
      continue;
    }
    seenUrls.add(sourceUrl);

    const mediaType = getMediaType(item);
    const folder = getMediaFolder(mediaType);
    
    // Generate sanitized filename
    const baseName = item.name || `${mediaType}_${id}`;
    const extension = getFileExtension(sourceUrl);
    const sanitizedName = sanitizeFileName(baseName) + (extension ? `.${extension}` : "");

    assets.push({
      id,
      name: item.name || id,
      originalUrl: sourceUrl,
      sanitizedName,
      type: mediaType,
      folder,
      duration: item.display ? (item.display.to - item.display.from) / 1000 : undefined,
      hasVideo: mediaType === "video" || mediaType === "image",
      hasAudio: mediaType === "audio" || mediaType === "video",
    });
  }

  return assets;
}

/**
 * Generate the FCPXML document
 */
export function generateFCPXML(options: FCPXMLOptions): string {
  const {
    projectName,
    frameRate,
    width,
    height,
    duration,
    trackItems,
    tracks,
    mediaPathPrefix = "",
  } = options;

  // Extract media assets
  const assets = extractMediaAssets(trackItems);
  
  // Create asset ID map for referencing
  const assetIdMap = new Map<string, string>();
  assets.forEach((asset, index) => {
    assetIdMap.set(asset.id, `r${index + 2}`); // r1 is reserved for format
  });

  // Calculate duration in FCPXML time format
  const durationTime = framesToFCPTime(duration, frameRate);
  
  // Build resources section
  let resourcesXml = `    <resources>\n`;
  resourcesXml += `        <format id="r1" name="FFVideoFormat${height}p${frameRate}" width="${width}" height="${height}" frameDuration="${framesToFCPTime(1, frameRate)}"/>\n`;
  
  for (const asset of assets) {
    const assetId = assetIdMap.get(asset.id)!;
    const relativePath = mediaPathPrefix 
      ? `${mediaPathPrefix}/${asset.folder}/${asset.sanitizedName}`
      : `${asset.folder}/${asset.sanitizedName}`;
    
    resourcesXml += `        <asset id="${assetId}" name="${escapeXml(asset.name)}" src="${escapeXml(relativePath)}"`;
    if (asset.hasVideo) resourcesXml += ` hasVideo="1"`;
    if (asset.hasAudio) resourcesXml += ` hasAudio="1"`;
    if (asset.duration) resourcesXml += ` duration="${secondsToFCPTime(asset.duration, frameRate)}"`;
    resourcesXml += `/>\n`;
  }
  resourcesXml += `    </resources>\n`;

  // Map items to lanes based on tracks
  const itemLaneMap = new Map<string, number>();
  let videoLaneCount = 0;
  let audioLaneCount = 0;

  // We assign lanes based on track type and order
  tracks.forEach((track) => {
    if (track.type === "video" || track.type === "image") {
      videoLaneCount++;
      track.items.forEach((itemId) => itemLaneMap.set(itemId, videoLaneCount));
    } else if (track.type === "audio") {
      audioLaneCount++;
      track.items.forEach((itemId) => itemLaneMap.set(itemId, -audioLaneCount));
    }
  });

  // Build spine (timeline) with a baseline gap
  // Using a gap at lane 0 that spans the whole project duration provides a consistent anchor
  // for all other clips, ensuring they stay on their assigned lanes.
  let spineXml = `                    <spine>\n`;
  spineXml += `                        <gap offset="0s" duration="${durationTime}" name="Baseline">\n`;

  // Filter and sort track items that actually exist in the mapping
  const itemsToExport = Object.entries(trackItems)
    .filter(([id, item]) => ["video", "audio", "image"].includes(item.type) && itemLaneMap.has(id));

  for (const [id, item] of itemsToExport) {
    const assetId = assetIdMap.get(id);
    const lane = itemLaneMap.get(id);
    if (!assetId || lane === undefined) continue;

    const startTime = (item.display?.from || 0) / 1000;
    const endTime = (item.display?.to || 0) / 1000;
    const clipDuration = endTime - startTime;
    const trimStart = (item.trim?.from || 0) / 1000;

    spineXml += `                            <asset-clip ref="${assetId}" lane="${lane}" offset="${secondsToFCPTime(
      startTime,
      frameRate
    )}" duration="${secondsToFCPTime(clipDuration, frameRate)}" start="${secondsToFCPTime(
      trimStart,
      frameRate
    )}" name="${escapeXml(item.name || id)}"/>\n`;
  }

  spineXml += `                        </gap>\n`;
  spineXml += `                    </spine>\n`;

  // Build full FCPXML document
  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
${resourcesXml}
    <library>
        <event name="${escapeXml(projectName)}">
            <project name="${escapeXml(projectName)}">
                <sequence format="r1" tcStart="0s" duration="${durationTime}">
${spineXml}
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;

  return fcpxml;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
