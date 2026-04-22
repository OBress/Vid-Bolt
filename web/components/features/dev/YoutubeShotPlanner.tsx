"use client";

import { useState, useCallback } from "react";
import {
  Film,
  Youtube,
  Users,
  Hash,
  ChevronRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Camera,
  Play,
  ExternalLink,
  X,
  Tag,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// TYPES
// ============================================================================

export interface ShotPlanShot {
  shot_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  shot_type: string;
  camera_motion: string;
  subject: string;
  action: string;
  narrative_purpose: string;
  emotion_tone: string;
  visual_description: string;
  visual_elements: string[];
  narration_excerpt?: string;
  has_music: boolean;
  has_sfx: boolean;
  audio_notes?: string;
  suggested_media_type:
    | "ai_video"
    | "stock_video"
    | "ai_image"
    | "stock_image"
    | "screen_recording"
    | "talking_head"
    | "motion_graphic";
  production_notes: string;
}

type AnalysisMode = "single_video" | "channel_batch";
type UiPhase = "input" | "analyzing" | "done" | "error";

interface AnalysisResult {
  createdIds: string[];
  totalAnalyzed: number;
  totalFailed: number;
  errors?: { videoId: string; error: string }[];
}

interface Props {
  onClose: () => void;
  onPlanSaved?: () => void; // callback to refresh library
}

// ============================================================================
// HELPERS
// ============================================================================

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const MEDIA_TYPE_COLORS: Record<string, string> = {
  ai_video: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  stock_video: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  ai_image: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  stock_image: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  screen_recording: "text-green-400 bg-green-500/10 border-green-500/20",
  talking_head: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  motion_graphic: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ShotCard({ shot }: { shot: ShotPlanShot }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = MEDIA_TYPE_COLORS[shot.suggested_media_type] ?? "text-neutral-400 bg-neutral-500/10 border-neutral-500/20";

  return (
    <div
      className="border border-neutral-800 rounded-lg bg-neutral-900/50 hover:border-neutral-700 transition-colors cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-3">
        {/* Shot number */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
          <span className="text-[10px] font-bold text-neutral-300">{shot.shot_index}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Timecode + type row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-neutral-500">
              {formatSeconds(shot.start_seconds)} → {formatSeconds(shot.end_seconds)}
            </span>
            <span className="text-[10px] text-neutral-600">·</span>
            <span className="text-[10px] text-neutral-500">{shot.duration_seconds.toFixed(1)}s</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>
              {shot.suggested_media_type.replace(/_/g, " ")}
            </span>
          </div>

          {/* Shot type + camera motion */}
          <div className="flex items-center gap-1.5 mb-1">
            <Camera className="w-3 h-3 text-neutral-500 flex-shrink-0" />
            <span className="text-xs text-neutral-300 font-medium truncate">{shot.shot_type}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-xs text-neutral-500 truncate">{shot.camera_motion}</span>
          </div>

          {/* Subject / action */}
          <p className="text-xs text-neutral-400 truncate">{shot.subject} — {shot.action}</p>
        </div>

        <ChevronRight
          className={`w-4 h-4 text-neutral-600 flex-shrink-0 mt-1 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-neutral-800/60 pt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Visual description */}
          <div>
            <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Visual</p>
            <p className="text-xs text-neutral-300 leading-relaxed">{shot.visual_description}</p>
          </div>

          {/* Elements */}
          {shot.visual_elements.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {shot.visual_elements.map((el, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                  {el}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Narrative */}
            <div>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Narrative Purpose</p>
              <p className="text-xs text-neutral-400 leading-relaxed">{shot.narrative_purpose}</p>
            </div>
            {/* Tone */}
            <div>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Tone</p>
              <p className="text-xs text-neutral-400">{shot.emotion_tone}</p>
            </div>
          </div>

          {/* Audio */}
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${shot.has_music ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-neutral-600 bg-neutral-800 border-neutral-700"}`}>
              🎵 Music {shot.has_music ? "Yes" : "No"}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${shot.has_sfx ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-neutral-600 bg-neutral-800 border-neutral-700"}`}>
              🔊 SFX {shot.has_sfx ? "Yes" : "No"}
            </span>
            {shot.audio_notes && (
              <span className="text-[10px] text-neutral-500 italic">{shot.audio_notes}</span>
            )}
          </div>

          {/* Narration */}
          {shot.narration_excerpt && (
            <div>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Narration</p>
              <p className="text-xs text-neutral-400 italic">"{shot.narration_excerpt}"</p>
            </div>
          )}

          {/* Production notes */}
          <div className="bg-neutral-800/50 rounded-lg p-2.5 border border-neutral-700/50">
            <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider mb-1">📽 Director's Note</p>
            <p className="text-xs text-neutral-300 leading-relaxed">{shot.production_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function YoutubeShotPlanner({ onClose, onPlanSaved }: Props) {
  const [mode, setMode] = useState<AnalysisMode>("single_video");
  const [videoUrl, setVideoUrl] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [videoCount, setVideoCount] = useState(5);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  const [phase, setPhase] = useState<UiPhase>("input");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // For previewing the last analyzed plan inline
  const [previewShots, setPreviewShots] = useState<ShotPlanShot[] | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const canSubmit =
    phase === "input" &&
    (mode === "single_video" ? videoUrl.trim().length > 0 : channelUrl.trim().length > 0);

  const handleAnalyze = useCallback(async () => {
    setPhase("analyzing");
    setError(null);
    setResult(null);
    setPreviewShots(null);

    const body =
      mode === "single_video"
        ? { mode, videoUrl: videoUrl.trim(), category: category.trim() || undefined, notes: notes.trim() || undefined }
        : { mode, channelUrl: channelUrl.trim(), videoCount, category: category.trim() || undefined, notes: notes.trim() || undefined };

    const estimated = mode === "channel_batch" ? videoCount : 1;
    setStatusMsg(`Sending ${estimated} video${estimated > 1 ? "s" : ""} to Gemini 2.5 Flash for analysis…`);

    try {
      const res = await fetch("/api/admin/shot-planner/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setResult(data as AnalysisResult);
      setPhase("done");

      // Fetch first created plan for inline preview
      if (data.createdIds?.length > 0) {
        const firstId = data.createdIds[0];
        const detailRes = await fetch(`/api/admin/shot-planner/plans/${firstId}`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          setPreviewShots(detailData.plan?.shot_plan ?? null);
          setPreviewTitle(detailData.plan?.video_title ?? "");
        }
      }

      onPlanSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase("error");
    }
  }, [mode, videoUrl, channelUrl, videoCount, category, notes, onPlanSaved]);

  const handleReset = () => {
    setPhase("input");
    setError(null);
    setResult(null);
    setPreviewShots(null);
    setPreviewTitle("");
    setStatusMsg("");
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Film className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">YouTube Shot Planner</h2>
            <p className="text-[11px] text-neutral-500">Gemini 2.5 Flash shot-by-shot analysis</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-neutral-500 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── INPUT PHASE ─────────────────────────────────────────────────── */}
        {phase === "input" && (
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Mode toggle */}
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Analysis Mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(["single_video", "channel_batch"] as AnalysisMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${
                      mode === m
                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                        : "border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    {m === "single_video" ? <Youtube className="w-4 h-4 flex-shrink-0" /> : <Users className="w-4 h-4 flex-shrink-0" />}
                    <div>
                      <p className="text-xs font-semibold">{m === "single_video" ? "Single Video" : "Channel Batch"}</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">
                        {m === "single_video" ? "Paste a YouTube URL or video ID" : "Analyze last N videos from a channel"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* URL input */}
            {mode === "single_video" ? (
              <div>
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                  YouTube Video URL / ID
                </label>
                <Input
                  placeholder="https://www.youtube.com/watch?v=... or video ID"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                    Channel URL / Handle / ID
                  </label>
                  <Input
                    placeholder="https://www.youtube.com/@channelname or @handle or UCxxxxxxx"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                    Number of Recent Videos: <span className="text-red-400">{videoCount}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={videoCount}
                    onChange={(e) => setVideoCount(parseInt(e.target.value))}
                    className="w-full accent-red-500"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
                    <span>1 video</span>
                    <span>25 videos</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1">
                    ⚠ Each video runs a separate Gemini call (~30–90s each). Cost scales linearly.
                  </p>
                </div>
              </div>
            )}

            {/* Category + Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                  <Tag className="w-3 h-3 inline mr-1" />
                  Category / Genre
                </label>
                <Input
                  placeholder="e.g. Finance, Tech, Documentary"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                  <FileText className="w-3 h-3 inline mr-1" />
                  Notes (optional)
                </label>
                <Input
                  placeholder="Research context, observations..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-600 text-sm"
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 disabled:opacity-40"
            >
              <Play className="w-4 h-4 mr-2" />
              {mode === "single_video" ? "Analyze Video" : `Analyze ${videoCount} Videos`}
            </Button>
          </div>
        )}

        {/* ── ANALYZING PHASE ─────────────────────────────────────────────── */}
        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
              <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Analyzing with Gemini 2.5 Flash</h3>
            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">{statusMsg}</p>
            <p className="text-xs text-neutral-600 mt-4">This may take 30–90 seconds per video. Please wait…</p>
          </div>
        )}

        {/* ── ERROR PHASE ─────────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Analysis Failed</h3>
            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">{error}</p>
            <Button onClick={handleReset} className="mt-6 bg-neutral-800 hover:bg-neutral-700 text-white">
              Try Again
            </Button>
          </div>
        )}

        {/* ── DONE PHASE ──────────────────────────────────────────────────── */}
        {phase === "done" && result && (
          <div className="p-6 space-y-6">
            {/* Result summary banner */}
            <div className="flex items-center gap-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {result.totalAnalyzed} video{result.totalAnalyzed !== 1 ? "s" : ""} analyzed successfully
                </p>
                {result.totalFailed > 0 && (
                  <p className="text-xs text-red-400 mt-0.5">{result.totalFailed} video{result.totalFailed !== 1 ? "s" : ""} failed</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} className="border-neutral-700 text-neutral-300 hover:text-white text-xs">
                  Analyze More
                </Button>
                <Button variant="outline" size="sm" onClick={onClose} className="border-neutral-700 text-neutral-300 hover:text-white text-xs">
                  Go to Library
                </Button>
              </div>
            </div>

            {/* Errors list */}
            {result.errors && result.errors.length > 0 && (
              <div className="space-y-2">
                {result.errors.map((err) => (
                  <div key={err.videoId} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-mono text-neutral-400">{err.videoId}</p>
                      <p className="text-xs text-red-400">{err.error}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inline shot plan preview */}
            {previewShots && previewShots.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Shot Plan Preview</h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-sm">{previewTitle}</p>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {previewShots.length} shots
                  </span>
                </div>
                <div className="space-y-2">
                  {previewShots.map((shot) => (
                    <ShotCard key={shot.shot_index} shot={shot} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
