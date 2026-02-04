"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Upload,
  Download,
  Loader2,
  Music,
  Check,
  X,
  Zap,
  Shield,
  FileAudio,
} from "lucide-react";

interface AudioCleaningTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}

type CleaningLevel = "gentle" | "moderate" | "aggressive" | "paranoid" | "ffmpeg-only";

interface CleaningResult {
  success: boolean;
  originalSize?: number;
  cleanedSize?: number;
  processingTime?: number;
  downloadUrl?: string;
  filename?: string;
  error?: string;
}

export function AudioCleaningTester({
  isOpen,
  onClose,
  inline = false,
}: AudioCleaningTesterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CleaningLevel>("paranoid");
  const [turboMode, setTurboMode] = useState(true);
  const [verify, setVerify] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CleaningResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validTypes = ["audio/mpeg", "audio/wav", "audio/flac", "audio/aiff", "audio/x-wav"];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(mp3|wav|flac|aiff)$/i)) {
      setResult({ success: false, error: "Invalid file type. Please upload MP3, WAV, FLAC, or AIFF." });
      return;
    }
    setFile(selectedFile);
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClean = async () => {
    if (!file) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("level", level);
      formData.append("turbo", String(turboMode));
      formData.append("verify", String(verify));

      const response = await fetch("/api/admin/audio-clean", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Processing failed: ${response.status}`);
      }

      // Get the blob and create download URL
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      // Extract filename from content-disposition header or generate one
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `cleaned_${file.name}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      // Get processing info from headers
      const processingTime = parseFloat(response.headers.get("x-processing-time") || "0");
      const originalSize = parseInt(response.headers.get("x-original-size") || "0");
      const cleanedSize = blob.size;

      setResult({
        success: true,
        originalSize,
        cleanedSize,
        processingTime,
        downloadUrl,
        filename,
      });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (result?.downloadUrl && result.filename) {
      const a = document.createElement("a");
      a.href = result.downloadUrl;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 p-4 border-b border-neutral-800 bg-neutral-900/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dev Tools
        </Button>
        <div className="h-4 w-px bg-neutral-700" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
            <Music className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-green-400">
              Audio Cleaning
            </h2>
            <span className="text-xs text-neutral-500">
              Remove AI fingerprints, watermarks & metadata
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* File Upload */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
              ${dragOver 
                ? "border-green-500 bg-green-500/10" 
                : file 
                  ? "border-green-600 bg-green-900/20" 
                  : "border-neutral-700 hover:border-neutral-600 bg-neutral-900/50"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.flac,.aiff,audio/*"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileAudio className="w-8 h-8 text-green-500" />
                <div className="text-left">
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-neutral-400 text-sm">{formatBytes(file.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setResult(null);
                  }}
                  className="text-neutral-400 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-neutral-500 mx-auto mb-3" />
                <p className="text-neutral-300 font-medium">Drop audio file here or click to upload</p>
                <p className="text-neutral-500 text-sm mt-1">Supports MP3, WAV, FLAC, AIFF</p>
              </>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            {/* Level Select */}
            <div className="space-y-2">
              <Label className="text-neutral-400 text-sm">Cleaning Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as CleaningLevel)}>
                <SelectTrigger className="bg-neutral-900 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gentle">Gentle - Minimal processing</SelectItem>
                  <SelectItem value="moderate">Moderate - Balanced</SelectItem>
                  <SelectItem value="aggressive">Aggressive - Thorough</SelectItem>
                  <SelectItem value="paranoid">Paranoid - Maximum (MMM + FFmpeg)</SelectItem>
                  <SelectItem value="ffmpeg-only">FFmpeg Only - Pitch/Tempo Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <Label className="text-neutral-400 text-sm">GPU Turbo</Label>
                </div>
                <Switch checked={turboMode} onCheckedChange={setTurboMode} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  <Label className="text-neutral-400 text-sm">Verify Removal</Label>
                </div>
                <Switch checked={verify} onCheckedChange={setVerify} />
              </div>
            </div>
          </div>

          {/* Process Button */}
          <Button
            onClick={handleClean}
            disabled={!file || isProcessing}
            className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Music className="w-5 h-5 mr-2" />
                Clean Audio
              </>
            )}
          </Button>

          {/* Result */}
          {result && (
            <div className={`
              rounded-lg border p-4
              ${result.success 
                ? "border-green-600 bg-green-900/20" 
                : "border-red-600 bg-red-900/20"
              }
            `}>
              {result.success ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-400">
                    <Check className="w-5 h-5" />
                    <span className="font-medium">Audio cleaned successfully!</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-neutral-500">Original</p>
                      <p className="text-white">{formatBytes(result.originalSize || 0)}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Cleaned</p>
                      <p className="text-white">{formatBytes(result.cleanedSize || 0)}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Time</p>
                      <p className="text-white">{(result.processingTime || 0).toFixed(2)}s</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Cleaned Audio
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-400">
                  <X className="w-5 h-5" />
                  <span>{result.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-neutral-500 space-y-1 border-t border-neutral-800 pt-4">
            <p><strong>Powered by MMM (Melodic Metadata Massacrer)</strong></p>
            <p>• Removes ID3, RIFF INFO, FLAC tags, and custom chunks</p>
            <p>• Detects and removes AI watermarks (spread spectrum, echo-based, statistical)</p>
            <p>• GPU acceleration provides 700x+ speedup when available</p>
          </div>
        </div>
      </div>
    </div>
  );
}
