"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  Search,
  Plus,
  ArrowLeft,
  Trash2,
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
type UiPhase = "library" | "detail" | "input" | "analyzing" | "done" | "error";

interface ShotPlanSummary {
  id: string;
  created_at: string;
  youtube_video_id: string;
  youtube_url: string;
  video_title: string;
  channel_name: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  summary: string;
  total_shots: number;
  category: string | null;
  notes: string | null;
  source_type: string;
}

interface ShotPlanFull extends ShotPlanSummary {
  shot_plan: ShotPlanShot[];
  channel_id: string | null;
  batch_id: string | null;
}

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

// ============================================================================
// VID-BOLT GENRES (mirrors ScriptGenre in types/settings.ts)
// ============================================================================

const VIDBOLT_GENRES: { value: string; label: string }[] = [
  { value: "documentary",        label: "Documentary" },
  { value: "educational",        label: "Educational" },
  { value: "narrative_fiction",  label: "Narrative Fiction" },
  { value: "historical_fiction", label: "Historical Fiction" },
  { value: "opinion_essay",      label: "Opinion Essay" },
  { value: "tutorial",           label: "Tutorial" },
  { value: "news",               label: "News" },
];
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
            <span className="text-[10px] text-neutral-500">{(shot.duration_seconds ?? 0).toFixed(1)}s</span>
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

  // ── LIBRARY STATE ─────────────────────────────────────────────────────────
  const [libPlans, setLibPlans] = useState<ShotPlanSummary[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libSearch, setLibSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"channel" | "category">("channel");
  const [detailPlan, setDetailPlan] = useState<ShotPlanFull | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const r = await fetch("/api/admin/shot-planner/plans?limit=200");
      const d = await r.json();
      setLibPlans(d.plans ?? []);
    } finally {
      setLibLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailPlan(null);
    setPhase("detail");
    try {
      const r = await fetch(`/api/admin/shot-planner/plans/${id}`);
      const d = await r.json();
      setDetailPlan(d.plan ?? null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const deleteFromLib = useCallback(async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/admin/shot-planner/plans?id=${id}`, { method: "DELETE" });
    setLibPlans(prev => prev.filter(p => p.id !== id));
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  // ── SCRAPER STATE ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<UiPhase>("library");
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Elapsed timer for the analyzing phase
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisStartRef = useRef<number>(0);

  // Start/stop elapsed timer when phase changes
  useEffect(() => {
    if (phase === "analyzing") {
      analysisStartRef.current = Date.now();
      setElapsedSec(0);
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - analysisStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

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
    setStatusMsg(`Sending ${estimated} video${estimated > 1 ? "s" : ""} to Gemini 3 Flash for analysis…`);

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
    setPhase("library");
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
            <p className="text-[11px] text-neutral-500">Gemini 3 Flash shot-by-shot analysis</p>
          </div>
        </div>
        {/* back-button in header when not on library */}
        {(phase !== "library") && (
          <button onClick={() => setPhase("library")} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── LIBRARY PHASE ─────────────────────────────────────────────────── */}
        {phase === "library" && (() => {
          const q = libSearch.toLowerCase();
          const filtered = libPlans.filter(p =>
            !q || p.video_title.toLowerCase().includes(q) || p.channel_name.toLowerCase().includes(q)
          );
          const groups: Record<string, ShotPlanSummary[]> = {};
          for (const p of filtered) {
            const key = groupBy === "channel"
              ? (p.channel_name || "Unknown Channel")
              : (p.category || "Uncategorized");
            (groups[key] ??= []).push(p);
          }
          const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
          return (
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-neutral-800 flex-shrink-0">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
                  <input value={libSearch} onChange={e => setLibSearch(e.target.value)}
                    placeholder="Search videos, channels…"
                    className="w-full pl-8 pr-3 h-8 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-500" />
                </div>
                <div className="flex items-center bg-neutral-900 border border-neutral-700 rounded-lg overflow-hidden">
                  {(["channel", "category"] as const).map(g => (
                    <button key={g} onClick={() => setGroupBy(g)}
                      className={`px-3 h-8 text-[11px] font-medium capitalize transition-colors ${groupBy === g ? "bg-red-600 text-white" : "text-neutral-500 hover:text-white"}`}>{g}</button>
                  ))}
                </div>
                <button onClick={() => setPhase("input")}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors">
                  <Plus className="w-3.5 h-3.5" /> New Analysis
                </button>
              </div>
              {/* Groups */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {libLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-neutral-600 animate-spin" /></div>
                ) : sortedKeys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
                      <Film className="w-7 h-7 text-neutral-700" />
                    </div>
                    <p className="text-sm font-semibold text-neutral-400 mb-1">{libSearch ? "No results" : "No plans yet"}</p>
                    <p className="text-xs text-neutral-600 mb-4">{libSearch ? "Try a different search term." : "Click \"New Analysis\" to scrape your first video."}</p>
                    {!libSearch && <button onClick={() => setPhase("input")} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">New Analysis</button>}
                  </div>
                ) : sortedKeys.map(key => (
                  <div key={key}>
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">
                      {key} <span className="text-neutral-700 normal-case font-normal">· {groups[key].length} plan{groups[key].length !== 1 ? "s" : ""}</span>
                    </p>
                    <div className="space-y-1">
                      {groups[key].map(plan => (
                        <div key={plan.id} onClick={() => openDetail(plan.id)}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 cursor-pointer transition-all group">
                          {plan.thumbnail_url
                            ? <img src={plan.thumbnail_url} alt="" className="w-20 h-12 rounded object-cover flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                            : <div className="w-20 h-12 rounded bg-neutral-800 flex items-center justify-center flex-shrink-0"><Youtube className="w-4 h-4 text-neutral-700" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate leading-snug">{plan.video_title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-neutral-500"><Camera className="w-3 h-3 inline mr-0.5" />{plan.total_shots} shots</span>
                              {plan.duration_seconds && <span className="text-[10px] text-neutral-600">{Math.floor(plan.duration_seconds/60)}m {plan.duration_seconds%60}s</span>}
                              {plan.category && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/20">{plan.category}</span>}
                              <span className="text-[10px] text-neutral-700">{new Date(plan.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={e=>{e.stopPropagation();window.open(plan.youtube_url,"_blank");}} className="p-1.5 rounded hover:bg-neutral-700 text-neutral-600 hover:text-neutral-300"><ExternalLink className="w-3.5 h-3.5" /></button>
                            <button onClick={e=>{e.stopPropagation();deleteFromLib(plan.id,plan.video_title);}} className="p-1.5 rounded hover:bg-red-500/10 text-neutral-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── DETAIL PHASE ──────────────────────────────────────────────────── */}
        {phase === "detail" && (
          <div className="flex flex-col h-full">
            {(detailLoading || !detailPlan) ? (
              <div className="flex justify-center items-center flex-1 py-20"><Loader2 className="w-6 h-6 text-neutral-600 animate-spin" /></div>
            ) : (() => {
              const typeDist: Record<string,number> = {};
              for (const s of detailPlan.shot_plan) typeDist[s.suggested_media_type] = (typeDist[s.suggested_media_type]||0)+1;
              return (
                <div className="flex flex-col h-full">
                  {/* Detail banner */}
                  <div className="flex border-b border-neutral-800 flex-shrink-0">
                    {detailPlan.thumbnail_url && <img src={detailPlan.thumbnail_url} alt="" className="w-40 h-24 object-cover flex-shrink-0" />}
                    <div className="flex-1 px-5 py-3 space-y-1.5 min-w-0">
                      <p className="text-sm font-bold text-white leading-snug truncate">{detailPlan.video_title}</p>
                      <div className="flex items-center gap-1.5">
                        <Youtube className="w-3 h-3 text-red-500 flex-shrink-0" />
                        <a href={detailPlan.youtube_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="text-[11px] text-neutral-400 hover:text-white truncate">{detailPlan.channel_name}</a>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-neutral-500 flex-wrap">
                        <span><Camera className="w-3 h-3 inline mr-0.5" />{detailPlan.total_shots} shots</span>
                        {detailPlan.duration_seconds && <span><Clock className="w-3 h-3 inline mr-0.5" />{Math.floor(detailPlan.duration_seconds/60)}m {detailPlan.duration_seconds%60}s</span>}
                        {detailPlan.category && <span className="px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/20 text-[9px] font-semibold">{detailPlan.category}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {Object.entries(typeDist).sort(([,a],[,b])=>b-a).map(([t,c])=>(
                          <span key={t} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${MEDIA_TYPE_COLORS[t]??""}`}>{c}× {t.replace(/_/g," ")}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 p-3 flex-shrink-0 border-l border-neutral-800">
                      <button onClick={()=>window.open(detailPlan.youtube_url,"_blank")} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-600 hover:text-neutral-300 transition-colors"><ExternalLink className="w-4 h-4" /></button>
                      <button onClick={()=>deleteFromLib(detailPlan.id,detailPlan.video_title).then(()=>setPhase("library"))} className="p-1.5 rounded hover:bg-red-500/10 text-neutral-600 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {/* Summary */}
                  <div className="px-5 py-3 border-b border-neutral-800 flex-shrink-0">
                    <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">Summary</p>
                    <p className="text-xs text-neutral-400 leading-relaxed">{detailPlan.summary}</p>
                  </div>
                  {/* Shot list */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                    <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3">Shot-by-Shot · {detailPlan.shot_plan.length} shots</p>
                    {detailPlan.shot_plan.map(shot => <ShotCard key={shot.shot_index} shot={shot} />)}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

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
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 bg-neutral-900 border border-neutral-700 rounded-md px-3 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                >
                  <option value="">— Select genre —</option>
                  {VIDBOLT_GENRES.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
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
        {phase === "analyzing" && (() => {
          const estimatedTotal = (mode === "channel_batch" ? videoCount : 1) * 90; // ~90s per video
          const pct = Math.min(95, Math.round((elapsedSec / estimatedTotal) * 100)); // cap at 95 until done
          const elapsedMin = Math.floor(elapsedSec / 60);
          const elapsedS = elapsedSec % 60;
          const elapsedLabel = elapsedMin > 0
            ? `${elapsedMin}m ${elapsedS.toString().padStart(2, "0")}s`
            : `${elapsedS}s`;

          return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-6">
              {/* Spinning icon */}
              <div className="relative">
                <div className="absolute -inset-4 bg-red-500/10 rounded-full blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
                </div>
              </div>

              {/* Title */}
              <div>
                <h3 className="text-base font-bold text-white mb-1">Analyzing with Gemini 3 Flash</h3>
                <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">{statusMsg}</p>
              </div>

              {/* Progress bar + timer */}
              <div className="w-full max-w-sm space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-neutral-500">
                    <Clock className="w-3 h-3 inline mr-1 text-neutral-600" />
                    {elapsedLabel} elapsed
                  </span>
                  <span className="text-red-400">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-600 text-center">
                  Gemini is reading every frame of the video — typically 30–90s per video
                </p>
              </div>
            </div>
          );
        })()}


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
                <Button variant="outline" size="sm" onClick={() => setPhase("input")} className="border-neutral-700 text-neutral-300 hover:text-white text-xs">Analyze More</Button>
                <Button size="sm" onClick={() => { fetchLibrary(); setPhase("library"); }} className="bg-red-600 hover:bg-red-700 text-white text-xs">View in Library</Button>
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
