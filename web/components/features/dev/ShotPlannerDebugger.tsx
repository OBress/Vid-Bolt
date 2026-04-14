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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsService } from "@/lib/services/settings-service";
import type { MediaProject } from "@/types/settings";

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
// CONSTANTS
// ============================================================================

const SAMPLE_SCRIPT = `The discovery of penicillin in 1928 changed the course of history. Alexander Fleming, a Scottish bacteriologist, noticed that a stray mold had contaminated his petri dish and killed the surrounding bacteria. That moment of observation — that flash of scientific curiosity — would eventually save hundreds of millions of lives.

But the road from discovery to widespread medicine was not simple. For years, penicillin remained a laboratory curiosity. It wasn't until Howard Florey and Ernst Boris Chain developed a method to purify and mass-produce it in the early 1940s that the antibiotic could become a weapon against infection.

World War Two accelerated everything. Allied forces needed to prevent soldiers from dying of infected wounds. The drug was rushed into production and deployed to the front lines. By 1945, enough penicillin was being produced to treat all the wounded Allied soldiers in Europe.

Today, antibiotics are so common that we forget what the world was like before them. Simple infections — a cut, a scratch, a tooth abscess — could be a death sentence. Pneumonia killed nearly a third of patients. Bacterial meningitis was almost always fatal.

The antibiotic era transformed not just medicine but society itself. It enabled complex surgeries, organ transplants, and cancer chemotherapy — procedures impossible without protection against infection. It drove up life expectancy across the developed world.

But now, we face a new crisis. Antibiotic resistance is rising. The very success of these drugs has driven their overuse, and bacteria evolve. The World Health Organization warns that we could be heading toward a post-antibiotic era — a world where common infections become untreatable again.`;

// ============================================================================
// HELPERS
// ============================================================================

function detectIssues(shot: ShotResult, allShots: ShotResult[], index: number): IssueFlag[] {
  const flags: IssueFlag[] = [];

  if (!shot.visual_description || shot.visual_description.length < 20) {
    flags.push({ severity: "error", message: "visual_description is empty or too short (< 20 chars)" });
  }
  if (shot.media_type === "motiongraphic" && shot.duration_seconds && shot.duration_seconds < 1.5) {
    flags.push({ severity: "warning", message: `motiongraphic shot is only ${shot.duration_seconds?.toFixed(1)}s — too short for MG rendering` });
  }
  if (shot.continuity_from_previous && shot.synthesis_mode === "T2V") {
    flags.push({ severity: "warning", message: "continuity_from_previous=true but synthesis_mode=T2V — these conflict" });
  }
  if (shot.stock_worthy && !shot.stock_search_query) {
    flags.push({ severity: "error", message: "stock_worthy=true but no stock_search_query provided" });
  }
  if (index > 0 && allShots[index - 1]?.summary === shot.summary) {
    flags.push({ severity: "warning", message: "This shot has the same summary as the previous shot — possible duplication" });
  }
  if (!shot.visual_elements || shot.visual_elements.length === 0) {
    flags.push({ severity: "info", message: "visual_elements array is empty — no routing tags set" });
  }

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

function getSnapshots(): DebugSnapshot[] {
  try {
    const raw = localStorage.getItem("vidbolt:shot-planner-snapshots");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnapshot(snap: DebugSnapshot) {
  const snaps = getSnapshots();
  const filtered = snaps.filter(s => s.id !== snap.id);
  const updated = [snap, ...filtered].slice(0, 20);
  localStorage.setItem("vidbolt:shot-planner-snapshots", JSON.stringify(updated));
}

function deleteSnapshot(id: string) {
  const snaps = getSnapshots().filter(s => s.id !== id);
  localStorage.setItem("vidbolt:shot-planner-snapshots", JSON.stringify(snaps));
}

// ============================================================================
// COPY BUTTON (inline helper)
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
        <div className="px-3 pb-3">
          <pre className="text-[10px] text-neutral-300 whitespace-pre-wrap break-words leading-relaxed max-h-80 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHOT DEBUG DRAWER
// ============================================================================

function ShotDrawer({
  shot,
  allShots,
  index,
  sceneEvents,
  onClose,
}: {
  shot: ShotResult;
  allShots: ShotResult[];
  index: number;
  sceneEvents: DebugEvent[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"inspector" | "data" | "issues">("inspector");
  const issues = detectIssues(shot, allShots, index);
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warnCount = issues.filter(i => i.severity === "warning").length;

  // Find the events for this shot's parent scene
  const sceneId = (shot as Record<string, unknown>)._scene_id as string;
  const systemPromptEvent = sceneEvents.find(
    e => e.data.type === "system_prompt" && String(e.data.phase || "").includes(sceneId || "")
  );
  const userPromptEvent = sceneEvents.find(
    e => e.data.type === "user_prompt" && String(e.data.phase || "").includes(sceneId || "")
  );
  const responseEvent = sceneEvents.find(
    e => e.data.type === "llm_response" && String(e.data.phase || "").includes(sceneId || "")
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Shot #{index + 1}</div>
            <div className="text-sm text-white font-medium mt-0.5">{shot.summary || "Untitled shot"}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 border-b border-neutral-800">
          {[
            { id: "inspector" as const, label: "LLM Call Inspector", icon: Terminal },
            { id: "data" as const, label: "Shot Data", icon: Eye },
            { id: "issues" as const, label: `Issues ${errorCount + warnCount > 0 ? `(${errorCount + warnCount})` : ""}`, icon: AlertTriangle },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                tab === id
                  ? "text-white bg-neutral-800 border-t border-x border-neutral-700"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {tab === "inspector" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                These are the exact prompts sent to the LLM for the scene that contains this shot.
              </p>
              {systemPromptEvent ? (
                <PromptBlock
                  label="🔵 System Prompt"
                  content={String(systemPromptEvent.data.content || "")}
                  colorClass="border-blue-500/20 bg-blue-950/20"
                />
              ) : (
                <div className="text-xs text-neutral-600 italic">System prompt not captured for this scene.</div>
              )}
              {userPromptEvent ? (
                <PromptBlock
                  label="🟢 User Prompt"
                  content={String(userPromptEvent.data.content || "")}
                  colorClass="border-green-500/20 bg-green-950/20"
                />
              ) : (
                <div className="text-xs text-neutral-600 italic">User prompt not captured for this scene.</div>
              )}
              {responseEvent && (
                <PromptBlock
                  label="✅ Raw LLM Response"
                  content={JSON.stringify(responseEvent.data.content, null, 2)}
                  colorClass="border-emerald-500/20 bg-emerald-950/20"
                />
              )}
            </div>
          )}

          {tab === "data" && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(shot).map(([key, val]) => {
                if (key === "segment_index" || key === "_scene_id") return null;
                const strVal = Array.isArray(val) ? val.join(", ") : String(val ?? "—");
                const isHighlight = ["media_type", "narrative_beat", "synthesis_mode"].includes(key);
                return (
                  <div key={key} className={`p-2.5 rounded-lg ${isHighlight ? "bg-indigo-950/40 border border-indigo-500/20" : "bg-neutral-800/50"}`}>
                    <div className="text-[10px] text-neutral-500 font-mono uppercase tracking-wide">{key}</div>
                    <div className="text-xs text-neutral-200 mt-0.5 break-words">{strVal || "—"}</div>
                  </div>
                );
              })}
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
  // ——— Config state ———
  const [configTab, setConfigTab] = useState<"channel" | "manual">("channel");
  const [channels, setChannels] = useState<MediaProject[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [videoProjects, setVideoProjects] = useState<Array<{ id: string; title: string; hasTimestamps: boolean }>>([]);
  const [scriptMode, setScriptMode] = useState<"paste" | "import">("paste");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [manualStyle, setManualStyle] = useState("cinematic, documentary");
  const [manualAspectRatio, setManualAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [manualGenre, setManualGenre] = useState("");
  const [manualTone, setManualTone] = useState("");
  const [manualAudience, setManualAudience] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ——— Execution state ———
  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [eventCounter, setEventCounter] = useState(0);
  const [logExpanded, setLogExpanded] = useState(true);
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

  const abortRef = useRef<AbortController | null>(null);

  // Load channels on mount
  useEffect(() => {
    SettingsService.getMediaProjects()
      .then(setChannels)
      .catch(console.error);
    setSnapshots(getSnapshots());
  }, []);

  // Load video projects when channel changes
  useEffect(() => {
    if (!selectedChannel) { setVideoProjects([]); return; }
    // Fetch videos for this channel that have word_timestamps
    fetch(`/api/dev/shot-planner-debug/videos?projectId=${selectedChannel}`)
      .then(r => r.json())
      .then(data => setVideoProjects(data.videos || []))
      .catch(() => setVideoProjects([]));
  }, [selectedChannel]);

  // Auto-scroll log
  useEffect(() => {
    if (phase === "running") {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, phase]);

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

    let counter = 0;

    const addEvent = (type: string, data: Record<string, unknown>) => {
      const ev: DebugEvent = { id: counter++, eventType: type, data, timestamp: Date.now() };
      setEventCounter(counter);
      setEvents(prev => [...prev, ev]);
    };

    const body: Record<string, unknown> = { script };

    if (configTab === "channel" && selectedChannel) {
      body.projectSettingsId = selectedChannel;
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
    manualStyle, manualAspectRatio, manualGenre, manualTone, manualAudience, manualPrompt]);

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
  };

  const handleDeleteSnapshot = (id: string) => {
    deleteSnapshot(id);
    setSnapshots(getSnapshots());
  };

  // ——— Derived ———
  const filteredShots = selectedScene
    ? shots.filter((s) => (s as Record<string, unknown>)._scene_id === selectedScene)
    : shots;

  const shotsByScene = scenes.map(scene => ({
    scene,
    shots: shots.filter(s => (s as Record<string, unknown>)._scene_id === scene.scene_id),
  }));

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
          <div>
            <h1 className="text-sm font-bold text-white">Shot Planner Debugger</h1>
            <p className="text-xs text-neutral-500">Full pipeline transparency: prompts, responses, issues</p>
          </div>
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

                {/* Advanced overrides */}
                <div>
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Advanced field overrides (optional)
                  </button>
                  {advancedOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-3 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
                      <div>
                        <label className="block text-[10px] text-neutral-500 mb-1">Aspect Ratio Override</label>
                        <select
                          value={manualAspectRatio}
                          onChange={e => setManualAspectRatio(e.target.value as "16:9" | "9:16")}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                        >
                          <option value="16:9">16:9 (Landscape)</option>
                          <option value="9:16">9:16 (Portrait)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-500 mb-1">Visual Style Override</label>
                        <input
                          value={manualStyle}
                          onChange={e => setManualStyle(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-xs text-white"
                          placeholder="cinematic, documentary"
                        />
                      </div>
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
            else if (d.type === "manifest_resolved") preview = ` — ${String((d.manifest as Record<string,unknown>)?.visual_style || "")}`;
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
  // RENDER: Done (3-panel results)
  // ============================================================================

  const errorCount = events.filter(e => e.eventType === "error" || e.data.type === "error").length;
  const sceneEvents = events.filter(e =>
    e.data.type === "system_prompt" || e.data.type === "user_prompt" || e.data.type === "llm_response"
  );

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-neutral-800 flex-shrink-0">
        <button onClick={() => setPhase("config")} className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm font-bold text-white">Shot Planning Debug Results</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold">{shots.length} shots · {scenes.length} scenes · {formatDuration(totalDuration)}</span>
          {errorCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold">{errorCount} errors</span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => { setPhase("config"); setScript(SAMPLE_SCRIPT); }} size="sm"
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

      {/* 3-panel body */}
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
              const sceneIssues = sceneShots.flatMap((shot, idx) => detectIssues(shot, shots, shots.indexOf(shot)));
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
              {filteredShots.map((shot, i) => {
                const realIndex = shots.indexOf(shot);
                const issues = detectIssues(shot, shots, realIndex);
                const errorCount = issues.filter(x => x.severity === "error").length;
                const warnCount = issues.filter(x => x.severity === "warning").length;

                const mediaColors: Record<string, string> = {
                  ai_video: "border-l-blue-500",
                  motiongraphic: "border-l-pink-500",
                  stock_footage: "border-l-amber-500",
                  ai_image_static: "border-l-purple-500",
                };
                const borderColor = mediaColors[shot.media_type || ""] || "border-l-neutral-600";

                return (
                  <button
                    key={realIndex}
                    onClick={() => { setOpenShot(shot); setOpenShotIndex(realIndex); }}
                    className={`w-full text-left p-3 rounded-lg bg-neutral-900 border border-neutral-800 border-l-2 ${borderColor} hover:border-neutral-600 transition-all group`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-neutral-600">#{realIndex + 1}</span>
                          {shot.narrative_beat && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-800 text-neutral-400 font-medium">{shot.narrative_beat}</span>
                          )}
                          {shot.media_type && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              shot.media_type === "ai_video" ? "bg-blue-950/60 text-blue-400" :
                              shot.media_type === "motiongraphic" ? "bg-pink-950/60 text-pink-400" :
                              shot.media_type === "stock_footage" ? "bg-amber-950/60 text-amber-400" :
                              "bg-purple-950/60 text-purple-400"
                            }`}>{shot.media_type}</span>
                          )}
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
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-700 group-hover:text-neutral-400 transition-colors flex-shrink-0 mt-1" />
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
    </div>
  );
}
