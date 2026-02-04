import React, { useState } from "react";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";
import { CaptionSettings } from "./caption-settings";
import { CaptionsErrorDisplay } from "./captions-error-display";
import { useCaptions } from "../../../hooks/use-captions";
import { Upload, FileText, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "../../ui/alert";

/**
 * CaptionsOverlayPanel Component
 *
 * Clean interface for managing captions in the video editor.
 * Provides functionality for:
 * - Uploading SRT caption files with validation
 * - Manual script entry with automatic timing
 * - Caption editing and styling
 * - Error handling and user guidance
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
export const CaptionsOverlayPanel: React.FC = () => {
  const [script, setScript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  
  // Use VideoEditorStore for state - get selected caption clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips.find(c => c.id === ids[0]);
    return clip?.type === 'caption' ? clip : null;
  }) as TimelineClip | null;
  
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  const {
    isProcessing,
    isError,
    error,
    lastParseResult,
    handleFileUpload,
    generateFromText,
    createCaptionOverlay,
    reset,
  } = useCaptions();

  const handleSRTFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    reset(); // Clear any previous errors

    try {
      const result = await handleFileUpload(file);
      
      if (result.success && result.captions) {
        createCaptionOverlay(result.captions);
        setScript(""); // Clear text input
      }
    } catch (error) {
      console.error('File upload error:', error);
    }

    // Clear the input value to allow re-uploading the same file
    event.target.value = '';
  };

  const handleGenerateFromText = async () => {
    if (!script.trim()) return;

    try {
      const captions = await generateFromText({ text: script });
      createCaptionOverlay(captions);
      setScript("");
      reset(); // Clear any previous errors
    } catch (error) {
      console.error('Text generation error:', error);
    }
  };

  const handleRetry = () => {
    reset();
    setFileName(null);
    setScript("");
  };

  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2 [&_[data-radix-scroll-area-viewport]]:!scrollbar-none">
      {!selectedClip ? (
        <div className="flex flex-col gap-4">
            {/* Show errors if any */}
            {lastParseResult && !lastParseResult.success && lastParseResult.errors && (
              <CaptionsErrorDisplay
                errors={lastParseResult.errors}
                fileName={fileName || undefined}
                onRetry={handleRetry}
              />
            )}

            {/* SRT File Upload */}
            <div className="flex flex-col gap-2 rounded-sm">
              <Button
                variant="outline"
                className="w-full border-2 border-dashed border-sidebar-border
                hover:border-primary/50 bg-muted
                hover:bg-muted/80 h-28 
                flex flex-col items-center justify-center gap-3 text-sm group transition-all duration-200"
                onClick={() => document.getElementById("srt-file-upload")?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 text-foreground animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 text-foreground" />
                )}
                <div className="flex flex-col items-center font-extralight">
                  <span className="text-foreground">
                    {isProcessing ? 'Processing SRT File...' : 'Upload SRT File'}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Standard SubRip subtitle format (.srt)
                  </span>
                </div>
              </Button>
              <input
                id="srt-file-upload"
                type="file"
                accept=".srt"
                className="hidden"
                onChange={handleSRTFileUpload}
                disabled={isProcessing}
              />
            </div>

            {/* Divider */}
            <div className="relative flex items-center">
              <div className="grow border-t border-border"></div>
              <span className="mx-4 px-3 py-1 text-xs font-extralight text-muted-foreground bg-background border border-border rounded-full">
                or
              </span>
              <div className="grow border-t border-border"></div>
            </div>
            
            {/* Text Input */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-extralight text-foreground">Generate from Text</span>
              </div>
              <Textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Type your script here. Sentences will be automatically split into timed captions..."
                rows={8}
                className="bg-input border-gray-300 font-extralight"
                disabled={isProcessing}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleGenerateFromText}
                className="flex-1"
                size="sm"
                disabled={!script.trim() || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Generate Captions'
                )}
              </Button>
              {script && (
                <Button
                  variant="ghost"
                  className="text-sm"
                  onClick={() => setScript("")}
                  disabled={isProcessing}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* General Error Display */}
            {isError && error && !lastParseResult?.errors && (
              <Alert className="border-destructive/50 bg-destructive/5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <AlertDescription className="text-destructive">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </div>
      ) : (
        <CaptionSettings
          clip={selectedClip}
          currentFrame={Math.round(currentTime * fps)}
        />
      )}
    </div>
  );
};
