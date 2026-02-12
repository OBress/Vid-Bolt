/**
 * DaVinci Resolve Export Service
 * 
 * Client-side service to package video project for DaVinci Resolve import.
 * Creates a ZIP file containing organized media folders and FCPXML timeline.
 */

import * as JSZip from "jszip";
import { ITrackItem, ITrack, ITransition } from "@designcombo/types";
import { 
  generateFCPXML, 
  extractMediaAssets, 
  sanitizeFileName,
} from "./fcpxml-generator";

export interface DaVinciExportOptions {
  projectName: string;
  frameRate: number;
  width: number;
  height: number;
  duration: number; // in frames
  trackItems: Record<string, ITrackItem>;
  tracks: ITrack[];
  transitionsMap?: Record<string, ITransition>;
  includeUnusedMedia?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

export interface ExportResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  assetCount: number;
  error?: string;
}

/**
 * Generate README content with import instructions
 */
function generateReadme(projectName: string): string {
  return `# ${projectName} - DaVinci Resolve Import Instructions

## How to Import

1. Open DaVinci Resolve
2. Go to File > Import > Timeline
3. Select the "${projectName}.fcpxml" file from this folder
4. In the import dialog:
   - Choose your destination project/bin
   - Check "Link to source media" to use the files in this folder
5. Click Import

## Folder Structure

- /Video    - Video clips used in the timeline
- /Audio    - Audio files (narration, music, etc.)
- /Images   - Still images used in the project
- /Graphics - Overlays and graphic elements (if any)
- ${projectName}.fcpxml - Timeline file for DaVinci Resolve

## Notes

- Keep all files in the same relative folder structure
- If media appears offline after import, right-click > Relink Media
- The timeline was exported from Vid-Bolt video editor

---
Exported: ${new Date().toISOString()}
`;
}

/**
 * Fetch a media file as a blob
 */
async function fetchMediaBlob(url: string): Promise<Blob | null> {
  try {
    // Handle data URLs
    if (url.startsWith("data:")) {
      const response = await fetch(url);
      return await response.blob();
    }
    
    // Handle regular URLs
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch media: ${url} - ${response.status}`);
      return null;
    }
    
    return await response.blob();
  } catch (error) {
    console.warn(`Error fetching media: ${url}`, error);
    return null;
  }
}

/**
 * Create DaVinci Resolve export package
 */
export async function createDaVinciExport(
  options: DaVinciExportOptions
): Promise<ExportResult> {
  const {
    projectName,
    frameRate,
    width,
    height,
    duration,
    trackItems,
    tracks,
    transitionsMap,
    onProgress,
  } = options;

  const sanitizedProjectName = sanitizeFileName(projectName) || "project";
  const zip = new JSZip.default();
  const projectFolder = zip.folder(sanitizedProjectName)!;

  try {
    // Step 1: Extract media assets
    onProgress?.(5, "Analyzing timeline...");
    const assets = extractMediaAssets(trackItems);
    const totalSteps = assets.length + 3; // assets + FCPXML + README + finalize
    let currentStep = 0;

    // Step 2: Create folder structure
    onProgress?.(10, "Creating folder structure...");
    const videoFolder = projectFolder.folder("Video")!;
    const audioFolder = projectFolder.folder("Audio")!;
    const imagesFolder = projectFolder.folder("Images")!;
    const graphicsFolder = projectFolder.folder("Graphics")!;

    // Step 3: Fetch and add media files
    const assetPathMap = new Map<string, string>();
    
    for (const asset of assets) {
      currentStep++;
      const progressPercent = 10 + (currentStep / totalSteps) * 70;
      onProgress?.(progressPercent, `Downloading ${asset.name}...`);

      const blob = await fetchMediaBlob(asset.originalUrl);
      if (blob) {
        const targetFolder = 
          asset.folder === "Video" ? videoFolder :
          asset.folder === "Audio" ? audioFolder :
          asset.folder === "Images" ? imagesFolder :
          graphicsFolder;
        
        targetFolder.file(asset.sanitizedName, blob);
        assetPathMap.set(asset.id, `${asset.folder}/${asset.sanitizedName}`);
      } else {
        console.warn(`Skipping asset ${asset.name} - could not fetch`);
      }
    }

    // Step 4: Generate FCPXML
    currentStep++;
    onProgress?.(85, "Generating timeline file...");
    
    const fcpxml = generateFCPXML({
      projectName: sanitizedProjectName,
      frameRate,
      width,
      height,
      duration,
      trackItems,
      tracks,
      transitionsMap,
    });
    
    projectFolder.file(`${sanitizedProjectName}.fcpxml`, fcpxml);

    // Step 5: Add README
    currentStep++;
    onProgress?.(90, "Adding documentation...");
    
    const readme = generateReadme(sanitizedProjectName);
    projectFolder.file("README.txt", readme);

    // Step 6: Generate ZIP
    onProgress?.(95, "Creating ZIP archive...");
    
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Step 7: Trigger download
    onProgress?.(100, "Starting download...");
    
    const fileName = `${sanitizedProjectName}_davinci.zip`;
    downloadBlob(zipBlob, fileName);

    return {
      success: true,
      fileName,
      fileSize: zipBlob.size,
      assetCount: assets.length,
    };

  } catch (error) {
    console.error("DaVinci export failed:", error);
    return {
      success: false,
      fileName: "",
      fileSize: 0,
      assetCount: 0,
      error: error instanceof Error ? error.message : "Export failed",
    };
  }
}

/**
 * Trigger browser download of a blob
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Calculate estimated export size based on media assets
 */
export function estimateExportSize(
  trackItems: Record<string, ITrackItem>
): { totalBytes: number; formatted: string } {
  const assets = extractMediaAssets(trackItems);
  
  // Rough estimate: we can't know actual file sizes without fetching
  // Estimate based on typical file sizes per media type
  let totalBytes = 0;
  
  for (const asset of assets) {
    switch (asset.type) {
      case "video":
        // Estimate 5MB per video clip
        totalBytes += 5 * 1024 * 1024;
        break;
      case "audio":
        // Estimate 1MB per audio clip
        totalBytes += 1 * 1024 * 1024;
        break;
      case "image":
        // Estimate 500KB per image
        totalBytes += 500 * 1024;
        break;
    }
  }
  
  // Add overhead for FCPXML and README (negligible, ~10KB)
  totalBytes += 10 * 1024;
  
  return {
    totalBytes,
    formatted: formatBytes(totalBytes),
  };
}

/**
 * Get asset counts by type
 */
export function getAssetCounts(
  trackItems: Record<string, ITrackItem>
): { video: number; audio: number; image: number; total: number } {
  const assets = extractMediaAssets(trackItems);
  
  return {
    video: assets.filter(a => a.type === "video").length,
    audio: assets.filter(a => a.type === "audio").length,
    image: assets.filter(a => a.type === "image").length,
    total: assets.length,
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
