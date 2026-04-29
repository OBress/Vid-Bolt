"use client";

/**
 * ShotPlannerDebugger
 * ============================================================================
 * Admin DevTool that runs the production shot-planning pipeline with full
 * prompt/response transparency via SSE streaming.
 *
 * Phases:
 *   1. Config Panel — Load channel settings or manual config, choose script
 *   2. Execution View — Live log of each SSE event as the pipeline runs
 *   3. Results View — 3-panel: scene list | shot cards | debug drawer
 *
 * Features:
 *   - Full VideoPreferencesPanel for all VideoCreativeOverrides fields
 *   - localStorage config persistence (auto-restore on re-open)
 *   - Side-by-side baseline comparison mode with per-shot diff badges
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft,
  Play,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Save,
  FolderOpen,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Terminal,
  Eye,
  EyeOff,
  Copy,
  Check,
  GitCompare,
  Youtube,
  Search,
  Filter,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsService } from "@/lib/services/settings-service";
import { VideoPreferencesPanel } from "@/components/features/project/settings/VideoPreferencesPanel";
import { useProjectSettings } from "@/hooks/use-project-settings";
import type { MediaProject } from "@/types/settings";
import type { VideoCreativeOverrides } from "@/lib/types/closed-loop";

// ============================================================================
// TYPES
// ============================================================================

interface DebugEvent {
  id: number;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: number;
}

interface SceneResult {
  scene_id: string;
  description: string;
  narrative_purpose: string;
  start_seconds: number;
  end_seconds: number;
  suggested_shot_count: number;
  pacing_intent: string;
  start_word_index: number;
  end_word_index: number;
}

interface ShotResult {
  segment_index: number;
  summary?: string;
  visual_description?: string;
  media_type?: string;
  narrative_beat?: string;
  camera_motion?: string;
  synthesis_mode?: string;
  continuity_from_previous?: boolean;
  stock_worthy?: boolean;
  stock_search_query?: string;
  visual_elements?: string[];
  angle_change?: string;
  duration_seconds?: number;
  [key: string]: unknown;
}

type DiffStatus = "new" | "changed" | "removed" | "same";

interface ShotResultWithDiff extends ShotResult {
  _diff?: DiffStatus;
}

interface DebugSnapshot {
  id: string;
  name: string;
  createdAt: string;
  config: {
    script: string;
    channelName?: string;
    projectSettingsId?: string;
    manualStyle?: string;
  };
  events: DebugEvent[];
  shots: ShotResult[];
  scenes: SceneResult[];
  manifestSnapshot: Record<string, unknown> | null;
  totalShots: number;
  totalDurationSeconds: number;
}

interface IssueFlag {
  severity: "error" | "warning" | "info";
  message: string;
}

// ============================================================================
// PERSISTENCE KEYS
// ============================================================================

const STORAGE_CONFIG_KEY = "vidbolt:shot-planner-config";
const STORAGE_SNAPSHOTS_KEY = "vidbolt:shot-planner-snapshots";

// ============================================================================
// CONSTANTS
// ============================================================================

const SAMPLE_SCRIPT = `The discovery of penicillin in 1928 changed the course of history. Alexander Fleming, a Scottish bacteriologist, noticed that a stray mold had contaminated his petri dish and killed the surrounding bacteria. That moment of observation — that flash of scientific curiosity — would eventually save hundreds of millions of lives.

But the road from discovery to widespread medicine was not simple. For years, penicillin remained a laboratory curiosity. It wasn't until Howard Florey and Ernst Boris Chain developed a method to purify and mass-produce it in the early 1940s that the antibiotic could become a weapon against infection.

World War Two accelerated everything. Allied forces needed to prevent soldiers from dying of infected wounds. The drug was rushed into production and deployed to the front lines. By 1945, enough penicillin was being produced to treat all the wounded Allied soldiers in Europe.

Today, antibiotics are so common that we forget what the world was like before them. Simple infections — a cut, a scratch, a tooth abscess — could be a death sentence. Pneumonia killed nearly a third of patients. Bacterial meningitis was almost always fatal.

The antibiotic era transformed not just medicine but society itself. It enabled complex surgeries, organ transplants, and cancer chemotherapy — procedures impossible without protection against infection. It drove up life expectancy across the developed world.

But now, we face a new crisis. Antibiotic resistance is rising. The very success of these drugs has driven their overuse, and bacteria evolve. The World Health Organization warns that we could be heading toward a post-antibiotic era — a world where common infections become untreatable again.`;

// ============================================================================
// PERSISTED CONFIG SCHEMA
// ============================================================================

interface PersistedConfig {
  configTab: "channel" | "manual";
  selectedChannel: string;
  scriptMode: "paste" | "import";
  selectedVideoId: string;
  script: string;
  manualStyle: string;
  manualAspectRatio: "16:9" | "9:16";
  manualGenre: string;
  manualTone: string;
  manualAudience: string;
  manualPrompt: string;
  advancedOpen: boolean;
  videoCreativeOverrides: VideoCreativeOverrides;
}

function loadPersistedConfig(): Partial<PersistedConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedConfig>) : {};
  } catch {
    return {};
  }
}

function savePersistedConfig(config: PersistedConfig) {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch { /* storage full or unavailable */ }
}

// ============================================================================
// SNAPSHOT HELPERS
// ============================================================================

function getSnapshots(): DebugSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_SNAPSHOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnapshot(snap: DebugSnapshot) {
  // Strip heavyweight events array before persisting — events contain full
  // LLM prompts/responses that easily exceed localStorage's ~5 MB quota.
  // Comparison mode only uses shots/scenes/manifest so nothing is lost.
  const liteSnap: DebugSnapshot = { ...snap, events: [] };

  const snaps = getSnapshots();
  const filtered = snaps.filter(s => s.id !== snap.id);
  let updated = [liteSnap, ...filtered].slice(0, 10);

  // Progressive eviction: if the serialized payload still exceeds quota,
  // keep removing the oldest snapshot until it fits.
  while (updated.length > 0) {
    try {
      localStorage.setItem(STORAGE_SNAPSHOTS_KEY, JSON.stringify(updated));
      return;
    } catch {
      updated = updated.slice(0, -1);
    }
  }
}

function deleteSnapshot(id: string) {
  const snaps = getSnapshots().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_SNAPSHOTS_KEY, JSON.stringify(snaps));
}

// ============================================================================
// DIFF UTILITY
// ============================================================================

function diffShots(
  baseline: ShotResult[],
  current: ShotResult[]
): { baselineAnnotated: ShotResultWithDiff[]; currentAnnotated: ShotResultWithDiff[] } {
  const baselineAnnotated: ShotResultWithDiff[] = baseline.map((shot, i) => {
    const counterpart = current[i];
    if (!counterpart) return { ...shot, _diff: "removed" };
    const changed =
      shot.media_type !== counterpart.media_type ||
      shot.synthesis_mode !== counterpart.synthesis_mode ||
      shot.stock_worthy !== counterpart.stock_worthy ||
      shot.narrative_beat !== counterpart.narrative_beat;
    return { ...shot, _diff: changed ? "changed" : "same" };
  });

  const currentAnnotated: ShotResultWithDiff[] = current.map((shot, i) => {
    if (i >= baseline.length) return { ...shot, _diff: "new" };
    const counterpart = baseline[i];
    const changed =
      shot.media_type !== counterpart.media_type ||
      shot.synthesis_mode !== counterpart.synthesis_mode ||
      shot.stock_worthy !== counterpart.stock_worthy ||
      shot.narrative_beat !== counterpart.narrative_beat;
    return { ...shot, _diff: changed ? "changed" : "same" };
  });

  return { baselineAnnotated, currentAnnotated };
}

function diffSummary(baseline: ShotResult[], current: ShotResult[]) {
  const { baselineAnnotated, currentAnnotated } = diffShots(baseline, current);
  const added = currentAnnotated.filter(s => s._diff === "new").length;
  const removed = baselineAnnotated.filter(s => s._diff === "removed").length;
  const changed = currentAnnotated.filter(s => s._diff === "changed").length;
  return { added, removed, changed };
}

// ============================================================================
// YT PLAN → ShotResult MAPPER
// ============================================================================

interface YtShotPlanShot {
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
  suggested_media_type: string;
  production_notes: string;
}

function mapYtPlanToShotResults(shots: YtShotPlanShot[]): ShotResult[] {
  return shots.map(s => ({
    segment_index: s.shot_index,
    start_seconds: s.start_seconds,
    end_seconds: s.end_seconds,
    duration_seconds: s.duration_seconds,
    summary: `${s.subject} — ${s.action}`,
    visual_description: s.visual_description,
    media_type: s.suggested_media_type,
    narrative_beat: s.narrative_purpose,
    camera_motion: s.camera_motion,
    visual_elements: s.visual_elements,
    // Extras surfaced in the debugger's field view
    shot_type: s.shot_type,
    emotion_tone: s.emotion_tone,
    has_music: s.has_music,
    has_sfx: s.has_sfx,
    narration_excerpt: s.narration_excerpt,
    production_notes: s.production_notes,
  }));
}

// ============================================================================
// YT IMPORT MODAL
// ============================================================================

interface YtPlanSummary {
  id: string;
  video_title: string;
  channel_name: string;
  thumbnail_url: string | null;
  total_shots: number;
  duration_seconds: number | null;
  category: string | null;
  created_at: string;
}

function YtImportModal({
  onClose,
  onLoadBaseline,
}: {
  onClose: () => void;
  onLoadBaseline: (shots: ShotResult[], label: string) => void;
}) {
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [plans, setPlans] = useState<YtPlanSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/shot-planner/categories")
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (activeCategory) params.set("category", activeCategory);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/admin/shot-planner/plans?${params}`)
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .finally(() => setLoading(false));
  }, [activeCategory, search]);

  const handleLoad = async (plan: YtPlanSummary) => {
    setLoadingId(plan.id);
    try {
      const r = await fetch(`/api/admin/shot-planner/plans/${plan.id}`);
      const d = await r.json();
      const shots = mapYtPlanToShotResults(d.plan?.shot_plan ?? []);
      onLoadBaseline(shots, `${plan.video_title} — ${plan.channel_name}`);
      onClose();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[640px] max-w-[95vw] max-h-[80vh] bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-800">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <Youtube className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">Import YT Plan as Baseline</h3>
            <p className="text-[11px] text-neutral-500">Load a saved YouTube shot analysis into the comparison baseline slot</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="px-5 py-3 border-b border-neutral-800 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search videos, channels…"
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3 h-3 text-neutral-600" />
              <button
                onClick={() => setActiveCategory(null)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                  !activeCategory ? "bg-red-600/20 border-red-500/40 text-red-400" : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                    activeCategory === cat.name ? "bg-red-600/20 border-red-500/40 text-red-400" : "bg-neutral-900 border-neutral-700 text-neutral-500 hover:border-neutral-600"
                  }`}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plan list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-neutral-600 animate-spin" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Youtube className="w-8 h-8 text-neutral-700 mb-2" />
              <p className="text-sm text-neutral-500">No saved plans found</p>
              <p className="text-xs text-neutral-600 mt-1">Analyze videos using DevTools → YouTube Shot Scraper first</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {plans.map(plan => (
                <div key={plan.id} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-900/50 transition-colors">
                  {/* Thumbnail */}
                  <div className="w-16 h-10 rounded-md bg-neutral-900 flex-shrink-0 overflow-hidden">
                    {plan.thumbnail_url
                      ? <img src={plan.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Youtube className="w-4 h-4 text-neutral-700" /></div>
                    }
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{plan.video_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neutral-500">{plan.channel_name}</span>
                      {plan.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{plan.category}</span>
                      )}
                      <span className="text-[10px] text-neutral-600">{plan.total_shots} shots</span>
                    </div>
                  </div>
                  {/* Load button */}
                  <button
                    onClick={() => handleLoad(plan)}
                    disabled={loadingId === plan.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {loadingId === plan.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Download className="w-3 h-3" />
                    }
                    Load as Baseline
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function detectIssues(shot: ShotResult, allShots: ShotResult[], index: number): IssueFlag[] {
  const flags: IssueFlag[] = [];
  if (!shot.visual_description || shot.visual_description.length < 20)
    flags.push({ severity: "error", message: "visual_description is empty or too short (< 20 chars)" });
  if (shot.media_type === "motiongraphic" && shot.duration_seconds && shot.duration_seconds < 1.5)
    flags.push({ severity: "warning", message: `motiongraphic shot is only ${shot.duration_seconds?.toFixed(1)}s — too short for MG rendering` });
  if (shot.continuity_from_previous && shot.synthesis_mode === "T2V")
    flags.push({ severity: "warning", message: "continuity_from_previous=true but synthesis_mode=T2V — these conflict" });
  if (shot.stock_worthy && !shot.stock_search_query)
    flags.push({ severity: "error", message: "stock_worthy=true but no stock_search_query provided" });
  if (index > 0 && allShots[index - 1]?.summary === shot.summary)
    flags.push({ severity: "warning", message: "This shot has the same summary as the previous shot — possible duplication" });
  if (!shot.visual_elements || shot.visual_elements.length === 0)
    flags.push({ severity: "info", message: "visual_elements array is empty — no routing tags set" });
  if (shot.segmentation_treatment && shot.continuity_from_previous)
    flags.push({ severity: "warning", message: "segmentation_treatment + continuity_from_previous=true conflict — segmentation runs after I2V generation; confirm this is intentional" });
  if (shot.segmentation_treatment && shot.media_type === "motiongraphic")
    flags.push({ severity: "warning", message: "segmentation_treatment on a motiongraphic shot is redundant — MG handles its own compositing" });
  return flags;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

// ============================================================================
// COPY SERIALIZERS
// ============================================================================

/** Clean human-readable shot plan — every field, nothing omitted. */
function serializeShotPlan({
  shots,
  scenes,
  manifestSnapshot,
  totalDuration,
  channelName,
}: {
  shots: ShotResult[];
  scenes: SceneResult[];
  manifestSnapshot: Record<string, unknown> | null;
  totalDuration: number;
  channelName?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Shot Plan \u2014 ${channelName ?? "Manual Config"}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total: ${shots.length} shots \u00b7 ${scenes.length} scenes \u00b7 ${formatDuration(totalDuration)}`);
  lines.push("");

  if (manifestSnapshot) {
    lines.push("## Manifest");
    for (const [k, v] of Object.entries(manifestSnapshot)) {
      if (v != null) lines.push(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    lines.push("");
  }

  if (scenes.length > 0) {
    lines.push("## Scenes");
    scenes.forEach((scene, i) => {
      lines.push(`\n### Scene ${i + 1}: ${scene.description}`);
      if (scene.narrative_purpose) lines.push(`  Purpose: ${scene.narrative_purpose}`);
      if (scene.start_seconds != null && scene.end_seconds != null) {
        lines.push(`  Timing: ${scene.start_seconds.toFixed(2)}s \u2013 ${scene.end_seconds.toFixed(2)}s (${formatDuration(scene.end_seconds - scene.start_seconds)})`);
      }
      if (scene.suggested_shot_count != null) lines.push(`  Suggested shots: ${scene.suggested_shot_count}`);
      if (scene.pacing_intent) lines.push(`  Pacing: ${scene.pacing_intent}`);
      if (scene.start_word_index != null) lines.push(`  Word range: ${scene.start_word_index} \u2013 ${scene.end_word_index}`);
    });
    lines.push("");
  }

  // Ordered rendering for known fields \u2014 printed first in a legible order
  const ORDERED_KEYS = [
    "segment_index", "narrative_beat", "media_type", "synthesis_mode",
    "camera_motion", "duration_seconds", "start_seconds", "end_seconds",
    "summary", "visual_description", "visual_elements",
    "stock_worthy", "stock_search_query",
    "angle_change", "continuity_from_previous", "directorial_note",
  ];
  const SKIP_KEYS = new Set(["_scene_id", "_diff"]);

  lines.push("## Shots");
  shots.forEach((shot, i) => {
    // Build multi-stage pipeline string for the shot header
    const pipelineParts: string[] = [];
    const rs = shot.render_strategy as string | undefined;
    const mt = shot.media_type as string | undefined;
    pipelineParts.push(rs || mt || "video");
    if ((shot.synthesis_mode as string) === "I2V" || ((shot.angle_change as string)?.length ?? 0) > 0) pipelineParts.push("I2V");
    if (((shot.image_edit_instruction as string)?.length ?? 0) > 0) pipelineParts.push("IMG-EDIT");
    if (shot.segmentation_treatment) {
      const seg = shot.segmentation_treatment as { preset?: string };
      pipelineParts.push(`SEG:${seg.preset || "custom"}`);
    }
    const tt = shot.template_type as string | undefined;
    if (tt && mt === "motiongraphic") pipelineParts.push(tt);
    const pipeline = pipelineParts.length > 1 ? ` [${pipelineParts.join(" · ")}]` : mt ? ` [${mt}]` : "";
    const dur = shot.duration_seconds != null ? ` ${(shot.duration_seconds as number).toFixed(1)}s` : "";
    lines.push(`\n### Shot ${i + 1}${pipeline}${dur}`);

    const rendered = new Set<string>(["media_type", "duration_seconds"]);

    for (const key of ORDERED_KEYS) {
      if (SKIP_KEYS.has(key) || rendered.has(key)) continue;
      const val = shot[key];
      if (val == null || val === false) { rendered.add(key); continue; }
      rendered.add(key);

      if (key === "visual_elements") {
        const arr = val as string[];
        if (arr.length > 0) lines.push(`  Tags: ${arr.join(", ")}`);
      } else if (key === "continuity_from_previous") {
        lines.push(`  Continuity: from previous`);
      } else if (key === "stock_worthy") {
        lines.push(`  Stock: worthy \u00b7 query=${shot.stock_search_query ?? "(none)"}`);
        rendered.add("stock_search_query");
      } else if (key === "duration_seconds") {
        lines.push(`  Duration: ${(val as number).toFixed(3)}s`);
      } else {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`  ${label}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
      }
    }

    // Any extra fields the API returned not in our ordered list
    for (const [key, val] of Object.entries(shot)) {
      if (rendered.has(key) || SKIP_KEYS.has(key)) continue;
      if (val == null || val === false) continue;
      const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const display = Array.isArray(val)
        ? (val as unknown[]).map(v => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ")
        : typeof val === "object"
        ? JSON.stringify(val)
        : String(val);
      lines.push(`  ${label}: ${display}`);
    }
  });

  return lines.join("\n");
}

/** Complete debug dump — manifest + all SSE events (prompts in/out, LLM responses) + full shot JSON. */
function serializeFullDebug({
  shots,
  scenes,
  events,
  manifestSnapshot,
  shotPlannerSystemPrompt,
  totalDuration,
  channelName,
}: {
  shots: ShotResult[];
  scenes: SceneResult[];
  events: DebugEvent[];
  manifestSnapshot: Record<string, unknown> | null;
  shotPlannerSystemPrompt: string | null;
  totalDuration: number;
  channelName?: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Full Debug Dump — ${channelName ?? "Manual Config"}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`${shots.length} shots · ${scenes.length} scenes · ${formatDuration(totalDuration)} · ${events.length} events`);
  lines.push("");

  if (manifestSnapshot) {
    lines.push("## Manifest Snapshot");
    lines.push(JSON.stringify(manifestSnapshot, null, 2));
    lines.push("");
  }

  if (shotPlannerSystemPrompt) {
    lines.push("## Shot Planner System Prompt");
    lines.push(shotPlannerSystemPrompt);
    lines.push("");
  }

  lines.push("## SSE Event Log");
  events.forEach((ev) => {
    const ts = new Date(ev.timestamp).toLocaleTimeString("en", { hour12: false });
    const d = ev.data;
    lines.push(`\n--- [${ts}] ${ev.eventType} / phase=${d.phase ?? "-"} type=${d.type ?? "-"} ---`);
    if (d.content) {
      lines.push(String(d.content));
    } else {
      lines.push(JSON.stringify(d, null, 2));
    }
  });

  lines.push("");
  lines.push("## Shot Results (Full JSON)");
  lines.push(JSON.stringify(shots, null, 2));

  lines.push("");
  lines.push("## Scene Results (Full JSON)");
  lines.push(JSON.stringify(scenes, null, 2));

  return lines.join("\n");
}

// ============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-2 p-1 rounded text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/** Labeled copy button for the results top bar. Uses a lazy getText() so serialization only runs on click. */
function CopyIconButton({
  label,
  title,
  getText,
  full = false,
}: {
  label: string;
  title: string;
  getText: () => string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = () => {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleClick}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
        copied
          ? "bg-green-500/20 text-green-400 border border-green-500/30"
          : full
          ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700"
          : "bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800 hover:text-white"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}


// ============================================================================
// COLLAPSIBLE PROMPT BLOCK
// ============================================================================

function PromptBlock({ label, content, colorClass }: { label: string; content: string; colorClass: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          <CopyButton text={content} />
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>
      {open && (
        <pre className="px-3 pb-3 text-[10px] whitespace-pre-wrap break-words leading-relaxed opacity-80 max-h-64 overflow-y-auto">
          {content}
        </pre>
      )}
    </div>
  );
}

// ============================================================================
// DIFF BADGE
// ============================================================================

function DiffBadge({ status }: { status: DiffStatus }) {
  if (status === "same") return null;
  const styles: Record<string, string> = {
    new: "bg-green-500/20 text-green-400 border-green-500/30",
    changed: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    removed: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = { new: "NEW", changed: "CHANGED", removed: "REMOVED" };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ============================================================================
// PIPELINE TAG HELPERS
// ============================================================================

interface PipelineTag {
  label: string;
  colorClasses: string;
}

function getPipelineTags(shot: ShotResult): PipelineTag[] {
  const tags: PipelineTag[] = [];
  const rs = shot.render_strategy as string | undefined;
  const mt = shot.media_type as string | undefined;
  const baseType = rs || mt || "";

  // Base lane
  if (baseType === "segment_animate") {
    tags.push({ label: "seg:animate", colorClasses: "bg-emerald-950/60 text-emerald-400" });
  } else if (baseType === "segment_video_fx") {
    tags.push({ label: "seg:video_fx", colorClasses: "bg-emerald-950/60 text-emerald-400" });
  } else if (baseType === "segment_mask_prep") {
    tags.push({ label: "seg:mask_prep", colorClasses: "bg-emerald-950/60 text-emerald-400" });
  } else if (mt === "motiongraphic" || baseType === "motiongraphic") {
    tags.push({ label: "MG", colorClasses: "bg-pink-950/60 text-pink-400" });
  } else if (mt === "stock_footage" || baseType === "stock") {
    tags.push({ label: "stock", colorClasses: "bg-amber-950/60 text-amber-400" });
  } else if (baseType === "ai_image" || mt === "image") {
    tags.push({ label: "ai_image", colorClasses: "bg-purple-950/60 text-purple-400" });
  } else {
    tags.push({ label: "ai_video", colorClasses: "bg-blue-950/60 text-blue-400" });
  }

  // I2V continuity
  if ((shot.synthesis_mode as string) === "I2V" || ((shot.angle_change as string)?.length ?? 0) > 0) {
    tags.push({ label: "I2V", colorClasses: "bg-cyan-950/60 text-cyan-400" });
  }

  // Image edit instruction
  if (((shot.image_edit_instruction as string)?.length ?? 0) > 0) {
    tags.push({ label: "img-edit", colorClasses: "bg-orange-950/60 text-orange-400" });
  }

  // Segmentation overlay (when it's a treatment on top rather than the base render strategy)
  if (
    shot.segmentation_treatment &&
    baseType !== "segment_animate" &&
    baseType !== "segment_video_fx" &&
    baseType !== "segment_mask_prep"
  ) {
    const seg = shot.segmentation_treatment as { preset?: string };
    tags.push({ label: `seg:${seg.preset || "custom"}`, colorClasses: "bg-emerald-950/60 text-emerald-400" });
  }

  // Stock source flag
  if (shot.stock_worthy) {
    tags.push({ label: "stock-src", colorClasses: "bg-amber-950/60 text-amber-400" });
  }

  // Template type for MG shots
  const tt = shot.template_type as string | undefined;
  if (tt && mt === "motiongraphic") {
    tags.push({ label: tt, colorClasses: "bg-fuchsia-950/60 text-fuchsia-400" });
  }

  // Persistent graphic
  if (shot.persistent_graphic_id) {
    tags.push({ label: "persist", colorClasses: "bg-teal-950/60 text-teal-400" });
  }

  return tags;
}

function PipelineTagRow({ shot }: { shot: ShotResult }) {
  const tags = getPipelineTags(shot);
  return (
    <>
      {tags.map((tag, i) => (
        <span key={i} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${tag.colorClasses}`}>
          {tag.label}
        </span>
      ))}
    </>
  );
}

// ============================================================================
// SHOT CARD (reusable for both single and comparison view)
// ============================================================================

function ShotCard({
  shot,
  realIndex,
  allShots,
  onClick,
  diffStatus,
}: {
  shot: ShotResult;
  realIndex: number;
  allShots: ShotResult[];
  onClick: () => void;
  diffStatus?: DiffStatus;
}) {
  const issues = detectIssues(shot, allShots, realIndex);
  const errorCount = issues.filter(x => x.severity === "error").length;
  const warnCount = issues.filter(x => x.severity === "warning").length;

  const borderColor = (() => {
    const rs = shot.render_strategy as string | undefined;
    const mt = shot.media_type as string | undefined;
    const base = rs || mt || "";
    if (base.startsWith("segment") || shot.segmentation_treatment) return "border-l-emerald-500";
    if (mt === "motiongraphic") return "border-l-pink-500";
    if (mt === "stock_footage" || base === "stock") return "border-l-amber-500";
    if (base === "ai_image" || mt === "image") return "border-l-purple-500";
    return "border-l-blue-500";
  })();
  const isRemoved = diffStatus === "removed";

  return (
    <button
      onClick={onClick}
      disabled={isRemoved}
      className={`w-full text-left p-3 rounded-lg bg-neutral-900 border border-neutral-800 border-l-2 ${borderColor} hover:border-neutral-600 transition-all group ${isRemoved ? "opacity-40 cursor-default" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-neutral-600">#{realIndex + 1}</span>
            {diffStatus && <DiffBadge status={diffStatus} />}
            {shot.narrative_beat && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400 font-medium">{shot.narrative_beat}</span>
            )}
            <PipelineTagRow shot={shot} />
            {shot.synthesis_mode && <span className="text-[9px] text-neutral-600">{shot.synthesis_mode}</span>}
            {shot.duration_seconds && <span className="text-[9px] text-neutral-600">{shot.duration_seconds.toFixed(1)}s</span>}
            {errorCount > 0 && <span className="text-[9px] text-red-400">⚠ {errorCount} error{errorCount > 1 ? "s" : ""}</span>}
            {warnCount > 0 && <span className="text-[9px] text-amber-400">⚠ {warnCount} warn{warnCount > 1 ? "s" : ""}</span>}
          </div>
          <div className="text-xs text-neutral-300 mt-1 line-clamp-2">{shot.summary}</div>
          {shot.visual_description && (
            <div className="text-[10px] text-neutral-600 mt-0.5 line-clamp-1">{shot.visual_description}</div>
          )}
        </div>
        {!isRemoved && <ChevronRight className="w-3.5 h-3.5 text-neutral-700 group-hover:text-neutral-400 transition-colors flex-shrink-0 mt-1" />}
      </div>
      {shot.visual_elements && shot.visual_elements.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {shot.visual_elements.map((tag, ti) => (
            <span key={ti} className="px-1.5 py-0.5 rounded-full bg-neutral-800 text-[9px] text-neutral-500">{tag}</span>
          ))}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// SHOT DRAWER
// ============================================================================

interface ShotDrawerProps {
  shot: ShotResult;
  allShots: ShotResult[];
  index: number;
  sceneEvents: DebugEvent[];
  onClose: () => void;
}

function ShotDrawer({ shot, allShots, index, sceneEvents, onClose }: ShotDrawerProps) {
  const issues = detectIssues(shot, allShots, index);
  const [tab, setTab] = useState<"fields" | "prompts" | "issues">("fields");

  const fieldKeys = Object.keys(shot).filter(k => !["_scene_id", "_diff"].includes(k));

  const relevantPrompts = sceneEvents.filter(ev => {
    const d = ev.data;
    return d.phase === "shot_planner" && (d.type === "system_prompt" || d.type === "user_prompt" || d.type === "llm_response");
  });

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-neutral-900 border-l border-neutral-800 flex flex-col z-50 shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <span className="text-sm font-bold text-white flex-1">Shot #{index + 1}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PipelineTagRow shot={shot} />
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex border-b border-neutral-800 flex-shrink-0">
        {(["fields", "prompts", "issues"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? "text-indigo-400 border-b-2 border-indigo-400" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            {t === "fields" ? "Fields" : t === "prompts" ? "Prompts" : `Issues${issues.length > 0 ? ` (${issues.length})` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === "fields" && (
          <div className="space-y-2">
            {fieldKeys.map(key => {
              const val = shot[key];
              if (val === undefined || val === null) return null;
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-neutral-600 uppercase tracking-wide font-mono">{key}</span>
                  <span className="text-xs text-neutral-300 font-mono break-all">
                    {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "prompts" && (
          <div className="space-y-2">
            {relevantPrompts.length === 0 ? (
              <div className="text-xs text-neutral-600">No prompts captured for this run.</div>
            ) : (
              relevantPrompts.map((ev, i) => (
                <PromptBlock
                  key={i}
                  label={`${ev.data.type === "system_prompt" ? "System" : ev.data.type === "user_prompt" ? "User" : "Response"} — attempt ${Number(ev.data.attempt ?? 0) + 1}`}
                  content={String(ev.data.content || "")}
                  colorClass={
                    ev.data.type === "system_prompt" ? "border-blue-500/20 text-blue-300" :
                    ev.data.type === "user_prompt" ? "border-green-500/20 text-green-300" :
                    "border-emerald-500/20 text-emerald-300"
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === "issues" && (
          <div className="space-y-2">
            {issues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                No issues detected for this shot.
              </div>
            ) : (
              issues.map((issue, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2.5 p-3 rounded-lg text-xs ${
                    issue.severity === "error" ? "bg-red-950/40 border border-red-500/20 text-red-300" :
                    issue.severity === "warning" ? "bg-amber-950/40 border border-amber-500/20 text-amber-300" :
                    "bg-blue-950/40 border border-blue-500/20 text-blue-300"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {issue.message}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface Props {
  onClose: () => void;
}

export function ShotPlannerDebugger({ onClose }: Props) {

  // ——— Load persisted config once (lazy initializer) ———
  const persisted = useRef<Partial<PersistedConfig> | null>(null);
  if (persisted.current === null) {
    persisted.current = loadPersistedConfig();
  }
  const p = persisted.current;

  // ——— Config state (hydrated from localStorage) ———
  const [configTab, setConfigTab] = useState<"channel" | "manual">(p.configTab ?? "channel");
  const [channels, setChannels] = useState<MediaProject[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>(p.selectedChannel ?? "");
  const [videoProjects, setVideoProjects] = useState<Array<{ id: string; title: string; hasTimestamps: boolean }>>([]);
  const [scriptMode, setScriptMode] = useState<"paste" | "import">(p.scriptMode ?? "paste");
  const [selectedVideoId, setSelectedVideoId] = useState<string>(p.selectedVideoId ?? "");
  const [script, setScript] = useState(p.script ?? SAMPLE_SCRIPT);
  const [manualStyle, setManualStyle] = useState(p.manualStyle ?? "cinematic, documentary");
  const [manualAspectRatio, setManualAspectRatio] = useState<"16:9" | "9:16">(p.manualAspectRatio ?? "16:9");
  const [manualGenre, setManualGenre] = useState(p.manualGenre ?? "");
  const [manualTone, setManualTone] = useState(p.manualTone ?? "");
  const [manualAudience, setManualAudience] = useState(p.manualAudience ?? "");
  const [manualPrompt, setManualPrompt] = useState(p.manualPrompt ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(p.advancedOpen ?? false);
  const [videoCreativeOverrides, setVideoCreativeOverrides] = useState<VideoCreativeOverrides>(p.videoCreativeOverrides ?? undefined);

  // ——— LoRA data for VideoPreferencesPanel ———
  const { settings: channelSettings } = useProjectSettings(selectedChannel || undefined);
  const availableLoras = channelSettings?.visuals?.creativeDirection?.loras ?? [];
  const channelDefaultLora = channelSettings?.visuals?.creativeDirection?.defaultLoraName;

  // ——— Execution state ———
  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [eventCounter, setEventCounter] = useState(0);
  const [logExpanded, setLogExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ——— Results state ———
  const [shots, setShots] = useState<ShotResult[]>([]);
  const [scenes, setScenes] = useState<SceneResult[]>([]);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [openShot, setOpenShot] = useState<ShotResult | null>(null);
  const [openShotIndex, setOpenShotIndex] = useState<number>(0);
  const [manifestSnapshot, setManifestSnapshot] = useState<Record<string, unknown> | null>(null);
  const [shotPlannerSystemPrompt, setShotPlannerSystemPrompt] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  const [mediaBreakdown, setMediaBreakdown] = useState<Record<string, number>>({});

  // ——— Snapshot state ———
  const [snapshots, setSnapshots] = useState<DebugSnapshot[]>([]);
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [savingName, setSavingName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  // ——— Comparison state ———
  // compareSnapshotId: the ID of the saved snapshot shown in the left column.
  // null = not in compare mode.
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);
  const [baselineDropdownOpen, setBaselineDropdownOpen] = useState(false);
  // YT import baseline — when set, overrides compareSnapshotId for the left column
  const [ytBaselineShots, setYtBaselineShots] = useState<ShotResult[] | null>(null);
  const [ytBaselineLabel, setYtBaselineLabel] = useState<string | null>(null);
  const [ytImportOpen, setYtImportOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMount = useRef(true);

  // ——— Load channels on mount ———
  useEffect(() => {
    SettingsService.getMediaProjects()
      .then(projects => {
        console.log("[ShotPlannerDebugger] Loaded channels:", projects.map(p => ({ id: p.id, name: p.name })));
        setChannels(projects);
      })
      .catch(err => { console.error("[ShotPlannerDebugger] Failed to load channels:", err); });
    setSnapshots(getSnapshots());
  }, []);

  // ——— Load video projects when channel changes ———
  useEffect(() => {
    if (!selectedChannel) { setVideoProjects([]); return; }
    const url = `/api/dev/shot-planner-debug/videos?projectId=${selectedChannel}`;
    console.log(`[ShotPlannerDebugger] Fetching videos — selectedChannel="${selectedChannel}" url=${url}`);
    fetch(url)
      .then(async r => {
        const raw = await r.json();
        console.log(`[ShotPlannerDebugger] Videos API response (status ${r.status}):`, raw);
        if (!raw.videos || raw.videos.length === 0) {
          console.warn("[ShotPlannerDebugger] API returned 0 videos.");
        }
        return raw;
      })
      .then(data => setVideoProjects(data.videos || []))
      .catch(err => {
        console.error("[ShotPlannerDebugger] Videos fetch error:", err);
        setVideoProjects([]);
      });
  }, [selectedChannel]);

  // ——— Persist config to localStorage (debounced, skip first mount) ———
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePersistedConfig({
        configTab, selectedChannel, scriptMode, selectedVideoId,
        script, manualStyle, manualAspectRatio, manualGenre,
        manualTone, manualAudience, manualPrompt, advancedOpen,
        videoCreativeOverrides,
      });
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [configTab, selectedChannel, scriptMode, selectedVideoId, script, manualStyle,
      manualAspectRatio, manualGenre, manualTone, manualAudience, manualPrompt,
      advancedOpen, videoCreativeOverrides]);

  // ——— Auto-scroll log ———
  useEffect(() => {
    if (phase === "running") {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, phase]);

  // ——— Auto-enter compare mode when a snapshot exists and a run just completed ———
  useEffect(() => {
    if (compareSnapshotId) {
      // Stay in compare mode on new run completion — comparison auto-refreshes since shots changed
      return;
    }
  }, [shots.length, compareSnapshotId]);

  // ——— Run the debug pipeline ———
  const handleRun = useCallback(async () => {
    if (!script.trim()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setPhase("running");
    setEvents([]);
    setShots([]);
    setScenes([]);
    setManifestSnapshot(null);
    setShotPlannerSystemPrompt(null);
    setMediaBreakdown({});
    setSelectedScene(null);
    setCompareSnapshotId(null);
    setBaselineDropdownOpen(false);

    let counter = 0;

    const addEvent = (type: string, data: Record<string, unknown>) => {
      const ev: DebugEvent = { id: counter++, eventType: type, data, timestamp: Date.now() };
      setEventCounter(counter);
      setEvents(prev => [...prev, ev]);
    };

    const body: Record<string, unknown> = { script };

    if (configTab === "channel" && selectedChannel) {
      body.projectSettingsId = selectedChannel;
      body.aspectRatio = manualAspectRatio;
      // Pass full VideoCreativeOverrides object (Option B — mirrors closed-loop route)
      if (videoCreativeOverrides && Object.keys(videoCreativeOverrides).length > 0) {
        body.videoCreativeOverrides = videoCreativeOverrides;
      }
      if (scriptMode === "import" && selectedVideoId) {
        body.importFromVideoId = selectedVideoId;
      }
    } else {
      body.creativeContext = {
        style: manualStyle,
        aspectRatio: manualAspectRatio,
        genre: manualGenre || undefined,
        tone: manualTone || undefined,
        targetAudience: manualAudience || undefined,
        masterCreativePrompt: manualPrompt || undefined,
      };
    }

    try {
      const resp = await fetch("/api/dev/shot-planner-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        addEvent("error", { phase: "http", message: err.error || resp.statusText });
        setPhase("done");
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "step";
          let dataStr = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr) as Record<string, unknown>;
            addEvent(eventType, parsed);

            if (eventType === "complete") {
              setShots((parsed.shots as ShotResult[]) || []);
              setScenes((parsed.scenes as SceneResult[]) || []);
              setManifestSnapshot(parsed.manifestSnapshot as Record<string, unknown> || null);
              setShotPlannerSystemPrompt(parsed.shotPlannerSystemPrompt as string || null);
              setTotalDuration(Number(parsed.totalDurationSeconds) || 0);
              setMediaBreakdown((parsed.mediaBreakdown as Record<string, number>) || {});
              setPhase("done");
            } else if (eventType === "error") {
              setPhase("done");
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        addEvent("error", { phase: "network", message: String(e) });
      }
      setPhase("done");
    }
  }, [script, configTab, selectedChannel, scriptMode, selectedVideoId,
    manualStyle, manualAspectRatio, manualGenre, manualTone, manualAudience,
    manualPrompt, videoCreativeOverrides]);

  const handleSaveSnapshot = () => {
    const snap: DebugSnapshot = {
      id: generateId(),
      name: savingName || `Run ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      config: {
        script,
        channelName: channels.find(c => c.id === selectedChannel)?.name,
        projectSettingsId: selectedChannel || undefined,
        manualStyle: configTab === "manual" ? manualStyle : undefined,
      },
      events,
      shots,
      scenes,
      manifestSnapshot,
      totalShots: shots.length,
      totalDurationSeconds: totalDuration,
    };
    saveSnapshot(snap);
    setSnapshots(getSnapshots());
    setShowSaveForm(false);
    setSavingName("");
  };

  const handleLoadSnapshot = (snap: DebugSnapshot) => {
    setShots(snap.shots);
    setScenes(snap.scenes);
    setEvents(snap.events);
    setManifestSnapshot(snap.manifestSnapshot);
    setTotalDuration(snap.totalDurationSeconds);
    setScript(snap.config.script);
    setPhase("done");
    setSnapshotPanelOpen(false);
    setCompareSnapshotId(null);
    setBaselineDropdownOpen(false);
  };

  const handleDeleteSnapshot = (id: string) => {
    deleteSnapshot(id);
    setSnapshots(getSnapshots());
  };

  const handleEnterCompare = () => {
    // Default to the most recently saved snapshot
    const latest = snapshots[0];
    if (latest) setCompareSnapshotId(latest.id);
  };

  const handleExitCompare = () => {
    setCompareSnapshotId(null);
    setBaselineDropdownOpen(false);
    setYtBaselineShots(null);
    setYtBaselineLabel(null);
  };

  const handleLoadYtBaseline = (shots: ShotResult[], label: string) => {
    setYtBaselineShots(shots);
    setYtBaselineLabel(label);
    setCompareSnapshotId(null); // clear snapshot-based compare
  };

  const handleDeleteCompareSnapshot = (id: string) => {
    deleteSnapshot(id);
    const updated = getSnapshots();
    setSnapshots(updated);
    // If the deleted snapshot was the selected baseline, switch to the next one
    if (compareSnapshotId === id) {
      setCompareSnapshotId(updated[0]?.id ?? null);
    }
  };

  // ——— Derived ———
  const filteredShots = selectedScene
    ? shots.filter((s) => (s as Record<string, unknown>)._scene_id === selectedScene)
    : shots;

  // ============================================================================
  // RENDER: Config
  // ============================================================================

  if (phase === "config") {
    return (
      <div className="flex flex-col h-full bg-neutral-950">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white">Shot Planner Debugger</h1>
            <p className="text-xs text-neutral-500">Full pipeline transparency: prompts, responses, issues</p>
          </div>
          {compareSnapshotId && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <GitCompare className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-medium">Side-by-side active</span>
              <button onClick={handleExitCompare} className="text-amber-600 hover:text-amber-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-2xl space-y-6">

            {/* Config mode tabs */}
            <div className="flex gap-2 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              {(["channel", "manual"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setConfigTab(tab)}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-semibold transition-all ${
                    configTab === tab
                      ? "bg-indigo-600 text-white shadow"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {tab === "channel" ? "📡 Load Channel Settings" : "✏️ Manual Config"}
                </button>
              ))}
            </div>

            {/* Channel mode */}
            {configTab === "channel" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                    Channel
                  </label>
                  <select
                    value={selectedChannel}
                    onChange={e => setSelectedChannel(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">— Select a channel —</option>
                    {channels.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {selectedChannel && (
                    <p className="mt-1.5 text-[10px] text-indigo-400">
                      ✓ Will use this channel&apos;s full ProjectSettings (visual style, pacing, MG theme, LoRA, etc.) — identical to production.
                    </p>
                  )}
                </div>

                {/* Script source */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                    Script Source
                  </label>
                  <div className="flex gap-2 mb-3">
                    {(["paste", "import"] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setScriptMode(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          scriptMode === mode
                            ? "bg-neutral-700 text-white"
                            : "text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {mode === "paste" ? "Paste Script" : "Import from Video"}
                      </button>
                    ))}
                  </div>

                  {scriptMode === "paste" ? (
                    <textarea
                      value={script}
                      onChange={e => setScript(e.target.value)}
                      rows={10}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Paste your script here..."
                    />
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={selectedVideoId}
                        onChange={e => setSelectedVideoId(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                        disabled={!selectedChannel}
                      >
                        <option value="">— Select a video (must have audio done) —</option>
                        {videoProjects.map(v => (
                          <option key={v.id} value={v.id} disabled={!v.hasTimestamps}>
                            {v.title}{!v.hasTimestamps ? " (no timestamps yet)" : ""}
                          </option>
                        ))}
                      </select>
                      {selectedVideoId && (
                        <p className="text-[10px] text-indigo-400">
                          ✓ Will use production-exact word timestamps from this video&apos;s TTS audio.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Aspect ratio (kept as separate top-level field) */}
                <div>
                  <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">
                    Aspect Ratio
                  </label>
                  <select
                    value={manualAspectRatio}
                    onChange={e => setManualAspectRatio(e.target.value as "16:9" | "9:16")}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Portrait</option>
                  </select>
                </div>

                {/* Advanced overrides — now using VideoPreferencesPanel */}
                <div>
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Advanced creative overrides (optional)
                    {videoCreativeOverrides && Object.values(videoCreativeOverrides).some(v => v !== undefined) && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 text-[9px] font-medium">
                        Active
                      </span>
                    )}
                  </button>
                  {advancedOpen && (
                    <div className="mt-3 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
                      <VideoPreferencesPanel
                        overrides={videoCreativeOverrides}
                        onChange={setVideoCreativeOverrides}
                        availableLoras={availableLoras}
                        channelDefaultLora={channelDefaultLora}
                        hideHeader
                        defaultExpanded
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual mode */}
            {configTab === "manual" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Script</label>
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    rows={10}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono resize-none focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="Paste your script here..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Visual Style</label>
                    <input value={manualStyle} onChange={e => setManualStyle(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="cinematic, documentary" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Aspect Ratio</label>
                    <select value={manualAspectRatio} onChange={e => setManualAspectRatio(e.target.value as "16:9" | "9:16")}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white">
                      <option value="16:9">16:9 Landscape</option>
                      <option value="9:16">9:16 Portrait</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Genre</label>
                    <input value={manualGenre} onChange={e => setManualGenre(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="documentary" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Tone</label>
                    <input value={manualTone} onChange={e => setManualTone(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="dramatic and informative" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Target Audience</label>
                    <input value={manualAudience} onChange={e => setManualAudience(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="general public interested in science history" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-neutral-500 uppercase tracking-wide mb-1.5">Master Creative Prompt (optional)</label>
                    <textarea value={manualPrompt} onChange={e => setManualPrompt(e.target.value)} rows={3}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white font-mono resize-none focus:outline-none focus:border-indigo-500"
                      placeholder="Channel-wide creative direction..." />
                  </div>
                </div>
              </div>
            )}

            {/* Run button */}
            <Button
              onClick={handleRun}
              disabled={!script.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11 text-sm rounded-xl disabled:opacity-40 flex items-center gap-2 justify-center"
            >
              <Play className="w-4 h-4" />
              Run Shot Planning Debug
            </Button>

            {/* Previous snapshots teaser */}
            {snapshots.length > 0 && (
              <button
                onClick={() => setSnapshotPanelOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {snapshots.length} saved snapshot{snapshots.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>

        {/* Snapshots panel */}
        {snapshotPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
            <div className="bg-neutral-900 border-t border-neutral-700 w-full max-w-2xl rounded-t-2xl max-h-[60vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                <h2 className="text-sm font-bold text-white">Saved Snapshots</h2>
                <button onClick={() => setSnapshotPanelOpen(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {snapshots.map(snap => (
                  <div key={snap.id} className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{snap.name}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        {new Date(snap.createdAt).toLocaleString()} · {snap.totalShots} shots · {formatDuration(snap.totalDurationSeconds)}
                        {snap.config.channelName && ` · ${snap.config.channelName}`}
                      </div>
                    </div>
                    <button onClick={() => handleLoadSnapshot(snap)} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-950/40 transition-colors">
                      Load
                    </button>
                    <button onClick={() => handleDeleteSnapshot(snap.id)} className="text-neutral-600 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: Running (live log)
  // ============================================================================

  if (phase === "running") {
    return (
      <div className="flex flex-col h-full bg-neutral-950">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
          <button onClick={() => { abortRef.current?.abort(); setPhase("config"); }}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-semibold text-white">Running Shot Planning Pipeline...</span>
          </div>
          <span className="text-xs text-neutral-500">{eventCounter} events</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-xs">
          {events.map(ev => {
            const d = ev.data;
            const isError = ev.eventType === "error" || d.type === "error";
            const isComplete = ev.eventType === "complete";
            const isPrompt = d.type === "system_prompt" || d.type === "user_prompt";
            const isResponse = d.type === "llm_response";

            let icon = "›";
            let textColor = "text-neutral-400";
            if (isError) { icon = "✕"; textColor = "text-red-400"; }
            else if (isComplete) { icon = "✓"; textColor = "text-green-400"; }
            else if (d.type === "system_prompt") { icon = "🔵"; textColor = "text-blue-400"; }
            else if (d.type === "user_prompt") { icon = "🟢"; textColor = "text-green-400"; }
            else if (isResponse) { icon = "✅"; textColor = "text-emerald-400"; }
            else if (d.type === "manifest_resolved") { icon = "⚙"; textColor = "text-indigo-400"; }
            else if (d.type === "start") { icon = "▶"; textColor = "text-indigo-300"; }
            else if (d.type === "result") { icon = "◆"; textColor = "text-purple-400"; }
            else if (d.type === "progress") { icon = "·"; textColor = "text-neutral-500"; }

            let label = `[${d.phase || ev.eventType}]`;
            if (d.attempt !== undefined) label += ` attempt ${Number(d.attempt) + 1}`;

            let preview = "";
            if (isPrompt) preview = ` — ${String(d.content || "").slice(0, 80)}…`;
            else if (d.type === "result") preview = ` — ${d.sceneCount || d.totalShots} ${d.sceneCount ? "scenes" : "shots"}`;
            else if (d.type === "manifest_resolved") preview = ` — ${String((d.manifest as Record<string, unknown>)?.visual_style || "")}`;
            else if (d.type === "progress") preview = ` ${d.content}`;
            else if (isComplete) preview = ` — done! ${d.totalShots} shots, ${d.totalScenes} scenes`;
            else if (isError) preview = ` — ${d.message}`;

            return (
              <div key={ev.id} className={`flex items-start gap-2 ${textColor}`}>
                <span className="flex-shrink-0 w-4 text-center">{icon}</span>
                <span className="flex-shrink-0 text-neutral-600">{new Date(ev.timestamp).toLocaleTimeString("en", { hour12: false })}</span>
                <span className="font-semibold">{label}</span>
                <span className="text-neutral-500 truncate">{preview}</span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: Done (results)
  // ============================================================================

  const errorCount = events.filter(e => e.eventType === "error" || e.data.type === "error").length;
  const sceneEvents = events.filter(e =>
    e.data.type === "system_prompt" || e.data.type === "user_prompt" || e.data.type === "llm_response"
  );

  const compareSnapshot = compareSnapshotId
    ? snapshots.find(s => s.id === compareSnapshotId) ?? null
    : null;

  // Active baseline: prefer YT plan, fall back to saved snapshot
  const activeBaselineShots: ShotResult[] | null =
    ytBaselineShots ?? (compareSnapshot?.shots ?? null);
  const activeBaselineLabel: string | null =
    ytBaselineLabel ?? (compareSnapshot?.name ?? null);
  const isComparing = activeBaselineShots !== null && shots.length > 0;

  // Comparison mode: compute diffs
  const { baselineAnnotated, currentAnnotated } = activeBaselineShots
    ? diffShots(activeBaselineShots, shots)
    : { baselineAnnotated: [] as ShotResultWithDiff[], currentAnnotated: [] as ShotResultWithDiff[] };
  const diff = activeBaselineShots ? diffSummary(activeBaselineShots, shots) : null;

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-800 flex-shrink-0">
        <button onClick={() => setPhase("config")} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold text-white">
            {isComparing ? "Shot Planning — Side-by-Side" : "Shot Planning Debug Results"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold">
            {shots.length} shots · {scenes.length} scenes · {formatDuration(totalDuration)}
          </span>
          {errorCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold">{errorCount} errors</span>
          )}
          {isComparing && ytBaselineLabel && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold">
              YT: {ytBaselineLabel.slice(0, 40)}{ytBaselineLabel.length > 40 ? "…" : ""}
            </span>
          )}
          {diff && (
            <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-semibold">
              +{diff.added} / -{diff.removed} / ~{diff.changed} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* ── Copy buttons ── */}
          {shots.length > 0 && (
            <>
              <CopyIconButton
                label="Copy Shot Plan"
                title="Copy a clean, human-readable shot plan to clipboard"
                getText={() => serializeShotPlan({
                  shots, scenes, manifestSnapshot, totalDuration,
                  channelName: channels.find(c => c.id === selectedChannel)?.name,
                })}
              />
              <CopyIconButton
                label="Copy Full Debug"
                title="Copy everything: manifest, all prompts/responses, and full shot JSON"
                getText={() => serializeFullDebug({
                  shots, scenes, events, manifestSnapshot, shotPlannerSystemPrompt,
                  totalDuration,
                  channelName: channels.find(c => c.id === selectedChannel)?.name,
                })}
                full
              />
            </>
          )}
          {/* Import YT Plan button — always visible when there are shots */}
          {shots.length > 0 && (
            <button
              onClick={() => setYtImportOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-500/20 transition-colors"
            >
              <Youtube className="w-3.5 h-3.5" />
              Import YT Baseline
            </button>
          )}
          {/* Side-by-Side view button */}
          {snapshots.length > 0 && shots.length > 0 && (
            <button
              onClick={isComparing && !ytBaselineShots ? handleExitCompare : handleEnterCompare}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isComparing && !ytBaselineShots
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {isComparing && !ytBaselineShots ? "Exit Side-by-Side" : "Side-by-Side View"}
            </button>
          )}
          {/* Exit compare when in YT baseline mode */}
          {isComparing && ytBaselineShots && (
            <button
              onClick={handleExitCompare}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Exit YT Comparison
            </button>
          )}
          <button
            onClick={() => setLogExpanded(!logExpanded)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            {logExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setShowSaveForm(!showSaveForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Snapshot
          </button>
          <Button onClick={() => { setPhase("config"); }} size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-xs h-7">
            <Play className="w-3 h-3 mr-1" />
            New Run
          </Button>
        </div>
      </div>


      {/* Save form */}
      {showSaveForm && (
        <div className="px-6 py-2 border-b border-neutral-800 flex items-center gap-3 bg-neutral-900/60">
          <input
            value={savingName}
            onChange={e => setSavingName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSaveSnapshot()}
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            placeholder={`Snapshot name (default: Run ${new Date().toLocaleString()})`}
            autoFocus
          />
          <button onClick={handleSaveSnapshot} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">Save</button>
          <button onClick={() => setShowSaveForm(false)} className="text-neutral-500 hover:text-neutral-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Collapsible event log */}
      {logExpanded && (
        <div className="border-b border-neutral-800 bg-neutral-950 max-h-48 overflow-y-auto px-6 py-2 font-mono text-[10px] space-y-0.5">
          {events.map(ev => {
            const d = ev.data;
            const isError = ev.eventType === "error" || d.type === "error";
            const isPrompt = d.type === "system_prompt" || d.type === "user_prompt";
            const isResponse = d.type === "llm_response";
            const textColor = isError ? "text-red-400" : isPrompt ? "text-blue-400" : isResponse ? "text-emerald-400" : "text-neutral-600";
            return (
              <div key={ev.id} className={`flex items-center gap-2 ${textColor}`}>
                <span className="text-neutral-700 flex-shrink-0">{new Date(ev.timestamp).toLocaleTimeString("en", { hour12: false })}</span>
                <span>[{String(d.phase || ev.eventType)}]</span>
                {d.type != null ? <span className="text-neutral-500">· {String(d.type)}</span> : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================
          COMPARISON VIEW
          ================================================================ */}
      {isComparing ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Baseline column */}
          <div className="flex-1 flex flex-col border-r border-amber-500/20 overflow-hidden">
            {/* Baseline column header */}
            <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2 flex-shrink-0 relative">
              {ytBaselineShots ? (
                <Youtube className="w-3 h-3 text-red-400 flex-shrink-0" />
              ) : (
                <GitCompare className="w-3 h-3 text-amber-400 flex-shrink-0" />
              )}
              <button
                onClick={() => !ytBaselineShots && setBaselineDropdownOpen(!baselineDropdownOpen)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider hover:text-amber-300 transition-colors"
              >
                {ytBaselineShots ? (ytBaselineLabel?.slice(0, 50) ?? "YouTube Baseline") : compareSnapshot?.name}
                {!ytBaselineShots && <ChevronDown className="w-3 h-3" />}
              </button>
              <span className="text-[10px] text-neutral-500">{activeBaselineShots?.length ?? 0} shots</span>
              {/* Snapshot selector dropdown */}
              {baselineDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setBaselineDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-neutral-800">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Select snapshot to compare</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {snapshots.length === 0 ? (
                        <div className="px-3 py-4 text-[10px] text-neutral-600 text-center">No saved snapshots</div>
                      ) : (
                        snapshots.map(snap => (
                          <div
                            key={snap.id}
                            className={`flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-800 transition-colors group ${
                              snap.id === compareSnapshotId ? "bg-amber-500/10" : ""
                            }`}
                          >
                            <button
                              onClick={() => { setCompareSnapshotId(snap.id); setBaselineDropdownOpen(false); }}
                              className="flex-1 text-left min-w-0"
                            >
                              <div className={`text-xs font-medium truncate ${
                                snap.id === compareSnapshotId ? "text-amber-400" : "text-white"
                              }`}>
                                {snap.id === compareSnapshotId && "✓ "}{snap.name}
                              </div>
                              <div className="text-[9px] text-neutral-500 mt-0.5">
                                {new Date(snap.createdAt).toLocaleString()} · {snap.totalShots} shots · {formatDuration(snap.totalDurationSeconds)}
                                {snap.config.channelName && ` · ${snap.config.channelName}`}
                              </div>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteCompareSnapshot(snap.id); }}
                              title="Delete snapshot"
                              className="flex-shrink-0 text-neutral-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {baselineAnnotated.map((shot, i) => (
                <ShotCard
                  key={i}
                  shot={shot}
                  realIndex={i}
                  allShots={activeBaselineShots ?? []}
                  onClick={() => {}}
                  diffStatus={shot._diff}
                />
              ))}
            </div>
          </div>

          {/* Current column */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 bg-indigo-500/5 border-b border-indigo-500/20 flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Current Run</span>
              <span className="text-[10px] text-neutral-500">{shots.length} shots</span>
              {diff && diff.added > 0 && <span className="text-[10px] text-green-400">+{diff.added} new</span>}
              {diff && diff.removed > 0 && <span className="text-[10px] text-red-400">-{diff.removed} removed</span>}
              {diff && diff.changed > 0 && <span className="text-[10px] text-amber-400">~{diff.changed} changed</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {currentAnnotated.map((shot, i) => (
                <ShotCard
                  key={i}
                  shot={shot}
                  realIndex={i}
                  allShots={shots}
                  onClick={() => { setOpenShot(shot); setOpenShotIndex(i); }}
                  diffStatus={shot._diff}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ================================================================
           STANDARD 3-PANEL VIEW
           ================================================================ */
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Scene list */}
          <div className="w-56 flex-shrink-0 border-r border-neutral-800 overflow-y-auto">
            <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Scenes</span>
              <button
                onClick={() => setSelectedScene(null)}
                className={`text-[10px] transition-colors ${!selectedScene ? "text-indigo-400" : "text-neutral-600 hover:text-neutral-400"}`}
              >
                All shots
              </button>
            </div>
            <div className="space-y-px p-1">
              {scenes.map((scene, i) => {
                const sceneShots = shots.filter(s => (s as Record<string, unknown>)._scene_id === scene.scene_id);
                const sceneIssues = sceneShots.flatMap((shot) => detectIssues(shot, shots, shots.indexOf(shot)));
                const hasErrors = sceneIssues.some(iss => iss.severity === "error");
                const hasWarnings = sceneIssues.some(iss => iss.severity === "warning");
                return (
                  <button
                    key={scene.scene_id}
                    onClick={() => setSelectedScene(selectedScene === scene.scene_id ? null : scene.scene_id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors group ${
                      selectedScene === scene.scene_id ? "bg-indigo-600/20 border border-indigo-500/30" : "hover:bg-neutral-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-neutral-600">S{i + 1}</span>
                      {hasErrors && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                      {!hasErrors && hasWarnings && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                    </div>
                    <div className="text-[10px] text-neutral-300 mt-0.5 line-clamp-2 leading-tight">{scene.description}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] text-neutral-600">{sceneShots.length} shots</span>
                      <span className="text-[9px] text-neutral-700">·</span>
                      <span className="text-[9px] text-neutral-600">{formatDuration(scene.end_seconds - scene.start_seconds)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Manifest snapshot */}
            {manifestSnapshot && (
              <div className="px-3 py-3 border-t border-neutral-800 mt-2">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Manifest</div>
                <div className="space-y-1">
                  {(["visual_style", "aspect_ratio", "format_profile", "pacing_preset"] as const).map(key => {
                    const val = manifestSnapshot[key];
                    if (val == null) return null;
                    return (
                      <div key={key}>
                        <div className="text-[9px] text-neutral-600 uppercase">{key}</div>
                        <div className="text-[10px] text-neutral-300">{String(val)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Media breakdown */}
            {Object.keys(mediaBreakdown).length > 0 && (
              <div className="px-3 py-3 border-t border-neutral-800">
                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Media Mix</div>
                {Object.entries(mediaBreakdown).map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400">{type}</span>
                    <span className="text-[10px] text-neutral-300 font-mono">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Center: Shot cards */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredShots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-neutral-600 gap-2">
                <Info className="w-8 h-8" />
                <span className="text-sm">No shots to display</span>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredShots.map((shot) => {
                  const realIndex = shots.indexOf(shot);
                  return (
                    <ShotCard
                      key={realIndex}
                      shot={shot}
                      realIndex={realIndex}
                      allShots={shots}
                      onClick={() => { setOpenShot(shot); setOpenShotIndex(realIndex); }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: System prompt panel */}
          {shotPlannerSystemPrompt && (
            <div className="w-80 flex-shrink-0 border-l border-neutral-800 overflow-y-auto p-3">
              <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Shot Planner System Prompt</div>
              <pre className="text-[9px] text-neutral-500 whitespace-pre-wrap break-words leading-relaxed">
                {shotPlannerSystemPrompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Shot drawer */}
      {openShot && (
        <ShotDrawer
          shot={openShot}
          allShots={shots}
          index={openShotIndex}
          sceneEvents={sceneEvents}
          onClose={() => setOpenShot(null)}
        />
      )}

      {/* YT Import Modal */}
      {ytImportOpen && (
        <YtImportModal
          onClose={() => setYtImportOpen(false)}
          onLoadBaseline={handleLoadYtBaseline}
        />
      )}
    </div>
  );
}
