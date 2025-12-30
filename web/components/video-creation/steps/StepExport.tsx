"use client";

import { useState } from "react";
import {
  Share2,
  Clapperboard,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import useStore from "@/features/editor/store/use-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import {
  createDaVinciExport,
  getAssetCounts,
  estimateExportSize,
} from "@/lib/export";

// DaVinci Resolve icon
const DaVinciIcon = () => <Clapperboard className="w-5 h-5" />;

interface StepExportProps {
  videoId: string;
  projectId: string;
  onBack: () => void;
  onClose: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

type ExportStatus = "idle" | "exporting" | "success" | "error";

export function StepExport({
  videoId,
  projectId,
  onBack,
  onClose,
  isLocked,
  lockedMessage,
}: StepExportProps) {
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);

  // Get timeline data from editor store
  const { trackItemsMap, tracks, duration, fps, size } = useStore();

  // Get video name from navigation store
  const { currentVideoName } = useNavigationStore();

  // Calculate asset counts and estimated size
  const assetCounts = getAssetCounts(trackItemsMap);
  const estimatedSize = estimateExportSize(trackItemsMap);

  const exportOptions = [
    {
      id: "davinci",
      label: "Export to DaVinci Resolve",
      description: `${assetCounts.total} assets • ~${estimatedSize.formatted}`,
      icon: DaVinciIcon,
      color: "from-orange-500 to-amber-600",
      hoverColor: "hover:from-orange-400 hover:to-amber-500",
    },
  ];

  const handleExport = async (platformId: string) => {
    if (isLocked || exportStatus === "exporting") return;

    if (platformId === "davinci") {
      await handleDaVinciExport();
    } else {
      console.log(`Exporting to ${platformId}`, { videoId, projectId });
      // TODO: Implement other export options
    }
  };

  const handleDaVinciExport = async () => {
    setExportStatus("exporting");
    setExportProgress(0);
    setExportMessage("Preparing export...");
    setExportError(null);

    try {
      // Use video name if available, fallback to a generic name
      const projectName = currentVideoName || `Video_Project`;

      const result = await createDaVinciExport({
        projectName,
        frameRate: fps,
        width: size.width,
        height: size.height,
        duration: Math.round((duration * fps) / 1000), // Convert ms to frames
        trackItems: trackItemsMap,
        tracks: tracks,
        onProgress: (progress, message) => {
          setExportProgress(progress);
          setExportMessage(message);
        },
      });

      if (result.success) {
        setExportStatus("success");
        setExportMessage(
          `Downloaded ${result.fileName} (${formatBytes(result.fileSize)})`
        );
      } else {
        setExportStatus("error");
        setExportError(result.error || "Export failed");
        setExportMessage("Export failed");
      }
    } catch (error) {
      setExportStatus("error");
      setExportError(error instanceof Error ? error.message : "Export failed");
      setExportMessage("Export failed");
    }
  };

  const resetExportState = () => {
    setExportStatus("idle");
    setExportProgress(0);
    setExportMessage("");
    setExportError(null);
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
          <Share2 className="w-3 h-3" />
          Export
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Export Your Video</h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Download your video or share it directly to your favorite platforms.
        </p>
      </div>

      {/* Export Progress Modal */}
      {exportStatus !== "idle" && (
        <div className="w-full max-w-md p-6 bg-neutral-900 border border-neutral-800 rounded-xl space-y-4">
          {exportStatus === "exporting" && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="text-sm font-medium">{exportMessage}</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
              <p className="text-xs text-neutral-500">
                {Math.round(exportProgress)}% complete
              </p>
            </>
          )}

          {exportStatus === "success" && (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">
                  Export Complete!
                </span>
              </div>
              <p className="text-xs text-neutral-400">{exportMessage}</p>
              <Button
                onClick={resetExportState}
                variant="outline"
                size="sm"
                className="w-full border-neutral-700"
              >
                Export Another Format
              </Button>
            </>
          )}

          {exportStatus === "error" && (
            <>
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  Export Failed
                </span>
              </div>
              <p className="text-xs text-red-400">{exportError}</p>
              <Button
                onClick={resetExportState}
                variant="outline"
                size="sm"
                className="w-full border-neutral-700"
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      )}

      {/* Export options grid */}
      {exportStatus === "idle" && (
        <div
          className={`w-full grid grid-cols-1 sm:grid-cols-2 gap-3 ${
            isLocked ? "opacity-50" : ""
          }`}
        >
          {exportOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => handleExport(option.id)}
                disabled={isLocked}
                className={`group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${
                  option.color
                } ${
                  option.hoverColor
                } text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                  isLocked ? "cursor-not-allowed" : ""
                }`}
              >
                <div className="p-2 bg-white/20 rounded-lg">
                  <Icon />
                </div>
                <div className="text-left">
                  <p className="font-semibold">{option.label}</p>
                  <p className="text-xs opacity-80">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Asset Summary for DaVinci */}
      {exportStatus === "idle" && assetCounts.total > 0 && (
        <div className="w-full p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <p className="text-xs text-neutral-400 mb-2">Project Summary</p>
          <div className="flex justify-center gap-6 text-sm">
            {assetCounts.video > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {assetCounts.video}
                </span>{" "}
                video{assetCounts.video !== 1 ? "s" : ""}
              </span>
            )}
            {assetCounts.audio > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {assetCounts.audio}
                </span>{" "}
                audio
              </span>
            )}
            {assetCounts.image > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {assetCounts.image}
                </span>{" "}
                image{assetCounts.image !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 w-full pt-4">
        {isLocked ? (
          <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
            {lockedMessage}
          </div>
        ) : (
          <>
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800"
              disabled={exportStatus === "exporting"}
            >
              Back to Editor
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest"
              disabled={exportStatus === "exporting"}
            >
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
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
