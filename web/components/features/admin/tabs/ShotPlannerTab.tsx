"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Film, Search, Tag, Trash2, ExternalLink, Camera,
  Clock, ChevronRight, X, Loader2, AlertCircle, Youtube,
  ArrowLeft, Edit2, Check, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ShotPlanShot } from "@/components/features/dev/YoutubeShotPlanner";

// ============================================================================
// TYPES
// ============================================================================

interface ShotPlanSummary {
  id: string;
  created_at: string;
  youtube_video_id: string;
  youtube_url: string;
  video_title: string;
  channel_name: string;
  channel_id: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  summary: string;
  total_shots: number;
  category: string | null;
  notes: string | null;
  source_type: string;
  batch_id: string | null;
}

interface ShotPlanFull extends ShotPlanSummary {
  shot_plan: ShotPlanShot[];
}

interface Category { name: string; count: number; }

// ============================================================================
// HELPERS
// ============================================================================

function fmtDuration(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtSeconds(s: number) {
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const MEDIA_COLORS: Record<string, string> = {
  ai_video: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  stock_video: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  ai_image: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  stock_image: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  screen_recording: "text-green-400 bg-green-500/10 border-green-500/20",
  talking_head: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  motion_graphic: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
};

// ============================================================================
// SHOT CARD (expandable row in detail view)
// ============================================================================

function ShotRow({ shot }: { shot: ShotPlanShot }) {
  const [open, setOpen] = useState(false);
  const color = MEDIA_COLORS[shot.suggested_media_type] ?? "text-neutral-400 bg-neutral-800 border-neutral-700";
  return (
    <div className="border border-neutral-800 rounded-lg bg-neutral-900/40 hover:border-neutral-700 transition-colors">
      <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-neutral-300">{shot.shot_index}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-mono text-neutral-500">{fmtSeconds(shot.start_seconds)} → {fmtSeconds(shot.end_seconds)}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-[10px] text-neutral-500">{shot.duration_seconds.toFixed(1)}s</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
              {shot.suggested_media_type.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-neutral-300 font-medium truncate">{shot.shot_type} · {shot.camera_motion}</p>
          <p className="text-[11px] text-neutral-500 truncate">{shot.subject}</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-neutral-600 flex-shrink-0 mt-1 transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="px-3 pb-3 border-t border-neutral-800/60 pt-3 space-y-2.5">
          <p className="text-xs text-neutral-300 leading-relaxed">{shot.visual_description}</p>
          {shot.visual_elements.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {shot.visual_elements.map((el, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">{el}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-[10px] font-semibold text-neutral-600 uppercase mb-0.5">Narrative</p><p className="text-neutral-400">{shot.narrative_purpose}</p></div>
            <div><p className="text-[10px] font-semibold text-neutral-600 uppercase mb-0.5">Tone</p><p className="text-neutral-400">{shot.emotion_tone}</p></div>
          </div>
          {shot.narration_excerpt && (
            <p className="text-xs text-neutral-500 italic">"{shot.narration_excerpt}"</p>
          )}
          <div className="bg-neutral-800/60 rounded p-2 border border-neutral-700/50">
            <p className="text-[10px] font-semibold text-amber-500 uppercase mb-0.5">📽 Director's Note</p>
            <p className="text-xs text-neutral-300 leading-relaxed">{shot.production_notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PLAN CARD (in library grid)
// ============================================================================

function PlanCard({ plan, onOpen, onDelete }: {
  plan: ShotPlanSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-neutral-800 rounded-xl bg-neutral-900/50 hover:border-neutral-700 transition-all group overflow-hidden">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-neutral-900 overflow-hidden">
        {plan.thumbnail_url ? (
          <img src={plan.thumbnail_url} alt={plan.video_title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Youtube className="w-8 h-8 text-neutral-700" />
          </div>
        )}
        {plan.duration_seconds && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
            {fmtDuration(plan.duration_seconds)}
          </span>
        )}
        {plan.category && (
          <span className="absolute top-1.5 left-1.5 bg-red-600/90 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            {plan.category}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-xs font-semibold text-white leading-snug mb-0.5 line-clamp-2">{plan.video_title}</h3>
        <p className="text-[11px] text-neutral-500 mb-2">{plan.channel_name}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500">
              <Camera className="w-3 h-3 inline mr-0.5" />{plan.total_shots} shots
            </span>
            <span className="text-[10px] text-neutral-600">{fmtDate(plan.created_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.open(plan.youtube_url, "_blank"); }}
              className="h-6 w-6 p-0 text-neutral-600 hover:text-neutral-300">
              <ExternalLink className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="h-6 w-6 p-0 text-neutral-600 hover:text-red-400">
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button size="sm" onClick={onOpen}
              className="h-6 px-2 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px]">
              View
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DETAIL SHEET
// ============================================================================

function PlanDetailSheet({ planId, onClose, onDeleted }: {
  planId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [plan, setPlan] = useState<ShotPlanFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/shot-planner/plans/${planId}`)
      .then(r => r.json())
      .then(d => { setPlan(d.plan); setCategoryInput(d.plan?.category ?? ""); })
      .finally(() => setLoading(false));
  }, [planId]);

  const saveCategory = async () => {
    if (!plan) return;
    await fetch(`/api/admin/shot-planner/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: categoryInput }),
    });
    setPlan(p => p ? { ...p, category: categoryInput || null } : p);
    setEditingCategory(false);
  };

  const handleDelete = async () => {
    if (!plan || !confirm(`Delete shot plan for "${plan.video_title}"?`)) return;
    await fetch(`/api/admin/shot-planner/plans?id=${plan.id}`, { method: "DELETE" });
    onDeleted();
    onClose();
  };

  // Compute media type distribution
  const typeDist: Record<string, number> = {};
  for (const shot of plan?.shot_plan ?? []) {
    typeDist[shot.suggested_media_type] = (typeDist[shot.suggested_media_type] || 0) + 1;
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <div className="w-[640px] max-w-[90vw] bg-neutral-950 border-l border-neutral-800 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-neutral-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            {loading ? <div className="h-4 bg-neutral-800 rounded w-48 animate-pulse" /> : (
              <p className="text-sm font-semibold text-white truncate">{plan?.video_title}</p>
            )}
          </div>
          {plan && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => window.open(plan.youtube_url, "_blank")}
                className="text-neutral-500 hover:text-white p-1">
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDelete}
                className="text-neutral-600 hover:text-red-400 p-1">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-neutral-600 animate-spin" />
          </div>
        ) : plan ? (
          <div className="flex-1 overflow-y-auto">
            {/* Metadata banner */}
            <div className="flex gap-0 border-b border-neutral-800">
              {plan.thumbnail_url && (
                <img src={plan.thumbnail_url} alt="" className="w-40 h-24 object-cover flex-shrink-0" />
              )}
              <div className="flex-1 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Youtube className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <a href={plan.youtube_url} target="_blank" rel="noreferrer"
                    className="text-xs text-neutral-300 hover:text-white truncate">{plan.channel_name}</a>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                  <span><Camera className="w-3 h-3 inline mr-0.5" />{plan.total_shots} shots</span>
                  <span><Clock className="w-3 h-3 inline mr-0.5" />{fmtDuration(plan.duration_seconds)}</span>
                  <span>{fmtDate(plan.created_at)}</span>
                </div>
                {/* Category editor */}
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-neutral-600" />
                  {editingCategory ? (
                    <>
                      <Input value={categoryInput} onChange={e => setCategoryInput(e.target.value)}
                        className="h-6 text-[11px] bg-neutral-800 border-neutral-700 text-white px-2 w-28" />
                      <Button size="sm" onClick={saveCategory} className="h-6 px-2 bg-emerald-700 hover:bg-emerald-600 text-white">
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCategory(false)} className="h-6 px-2 text-neutral-500">
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <button onClick={() => setEditingCategory(true)} className="flex items-center gap-1 group">
                      <span className={`text-[11px] ${plan.category ? "text-red-400" : "text-neutral-600 italic"}`}>
                        {plan.category ?? "Add category…"}
                      </span>
                      <Edit2 className="w-3 h-3 text-neutral-700 group-hover:text-neutral-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="px-5 py-4 border-b border-neutral-800">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Summary</p>
              <p className="text-xs text-neutral-400 leading-relaxed">{plan.summary}</p>
            </div>

            {/* Media type distribution */}
            {Object.keys(typeDist).length > 0 && (
              <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap gap-1.5">
                {Object.entries(typeDist).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <span key={type} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${MEDIA_COLORS[type] ?? "text-neutral-400 bg-neutral-800 border-neutral-700"}`}>
                    {count}× {type.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            {/* Shot plan */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Shot-by-Shot Breakdown · {plan.shot_plan.length} shots
              </p>
              {plan.shot_plan.map(shot => (
                <ShotRow key={shot.shot_index} shot={shot} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-neutral-500">Plan not found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN TAB COMPONENT
// ============================================================================

export function ShotPlannerTab() {
  const [plans, setPlans] = useState<ShotPlanSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Detail sheet
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const r = await fetch("/api/admin/shot-planner/categories");
    if (r.ok) { const d = await r.json(); setCategories(d.categories ?? []); }
  }, []);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (activeCategory) params.set("category", activeCategory);
    if (search.trim()) params.set("search", search.trim());
    try {
      const r = await fetch(`/api/admin/shot-planner/plans?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPlans(d.plans ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleDelete = async (id: string) => {
    const plan = plans.find(p => p.id === id);
    if (!confirm(`Delete shot plan for "${plan?.video_title}"?`)) return;
    await fetch(`/api/admin/shot-planner/plans?id=${id}`, { method: "DELETE" });
    setPlans(prev => prev.filter(p => p.id !== id));
    fetchCategories();
  };

  // ── LIBRARY VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search videos, channels…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 bg-neutral-900 border-neutral-700 text-white text-xs h-8"
          />
        </div>
        <p className="text-[11px] text-neutral-600 italic">Open DevTools → YouTube Shot Scraper to analyze new videos</p>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Filter className="w-3 h-3 text-neutral-600" />
        <button
          onClick={() => setActiveCategory(null)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
            !activeCategory
              ? "bg-red-600/20 border-red-500/40 text-red-400"
              : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600"
          }`}
        >
          All ({plans.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              activeCategory === cat.name
                ? "bg-red-600/20 border-red-500/40 text-red-400"
                : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600"
            }`}
          >
            {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* Plans grid */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-neutral-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
            <p className="text-sm text-neutral-400">{error}</p>
            <Button onClick={fetchPlans} className="mt-4 bg-neutral-800 hover:bg-neutral-700 text-white text-xs">Retry</Button>
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
              <Film className="w-7 h-7 text-neutral-700" />
            </div>
            <p className="text-sm font-semibold text-neutral-400 mb-1">No shot plans yet</p>
            <p className="text-xs text-neutral-600 mb-4">Use DevTools → YouTube Shot Scraper to analyze videos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onOpen={() => setOpenPlanId(plan.id)}
                onDelete={() => handleDelete(plan.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      {openPlanId && (
        <PlanDetailSheet
          planId={openPlanId}
          onClose={() => setOpenPlanId(null)}
          onDeleted={() => { setPlans(prev => prev.filter(p => p.id !== openPlanId)); fetchCategories(); }}
        />
      )}
    </div>
  );
}
