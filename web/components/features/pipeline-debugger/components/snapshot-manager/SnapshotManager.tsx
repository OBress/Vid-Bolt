"use client";

/**
 * Snapshot Manager
 * ============================================================================
 * Browse, save, edit, import/export pipeline state snapshots.
 * Snapshots can capture full pipeline runs and be loaded into Inspect/Compare
 * modes as virtual videos.
 */

import { useState, useRef, useMemo, useCallback } from "react";
import {
  Database,
  Plus,
  Upload,
  Download,
  Trash2,
  Search,
  Tag,
  X,
  Copy,
  Edit3,
  PlayCircle,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSnapshots } from "../../hooks/use-snapshots";
import { usePipelineDebuggerStore } from "../../stores/pipeline-debugger-store";
import { JsonTreeViewer } from "../shared/JsonTreeViewer";
import { StepIcon } from "../shared/StepIcon";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import type { PipelineSnapshot, PipelineStep, PipelineRun } from "../../types/pipeline-debugger";

interface SnapshotManagerProps {
  /** Current inspector step data — used for "Save from current" */
  currentStepData?: {
    step: PipelineStep;
    label: string;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    config: Record<string, unknown>;
  } | null;
  /** Full pipeline run — used for "Save Full Pipeline" */
  currentRun?: PipelineRun | null;
  currentVideoId?: string | null;
  currentVideoName?: string;
  className?: string;
}

export function SnapshotManager({
  currentStepData,
  currentRun,
  currentVideoId,
  currentVideoName,
  className = "",
}: SnapshotManagerProps) {
  const store = usePipelineDebuggerStore();
  const {
    snapshots,
    allTags,
    saveSnapshot,
    saveFullPipelineSnapshot,
    deleteSnapshot,
    updateSnapshot,
    clearAll,
    addTag,
    removeTag,
    exportSnapshots,
    importSnapshots,
    filterSnapshots,
  } = useSnapshots();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStep, setFilterStep] = useState<PipelineStep | undefined>();
  const [filterTag, setFilterTag] = useState<string | undefined>();
  const [selectedSnapshot, setSelectedSnapshot] = useState<PipelineSnapshot | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState<"step" | "full" | null>(null);
  const [showEditDialog, setShowEditDialog] = useState<PipelineSnapshot | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredSnapshots = useMemo(
    () => filterSnapshots({ step: filterStep, tag: filterTag, search: searchQuery }),
    [filterSnapshots, filterStep, filterTag, searchQuery]
  );

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const count = importSnapshots(reader.result as string);
        if (count > 0) {
          console.log(`[SnapshotManager] Imported ${count} snapshots`);
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [importSnapshots]
  );

  const handleLoadAsVideo = useCallback(
    (snapshot: PipelineSnapshot) => {
      if (snapshot.fullRun) {
        store.loadSnapshotAsRun(snapshot);
        store.setMode("inspect");
      }
    },
    [store]
  );

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ================================================================ */}
      {/* TOOLBAR */}
      {/* ================================================================ */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search snapshots..."
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
            />
          </div>

          {/* Step filter */}
          <select
            value={filterStep ?? ""}
            onChange={(e) => setFilterStep(e.target.value ? (Number(e.target.value) as PipelineStep) : undefined)}
            className="text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-300 px-2 py-1.5 focus:outline-none"
          >
            <option value="">All Steps</option>
            {ALL_STEPS.map((s) => (
              <option key={s} value={s}>
                Step {s}: {STEP_CONFIGS[s].label}
              </option>
            ))}
          </select>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <select
              value={filterTag ?? ""}
              onChange={(e) => setFilterTag(e.target.value || undefined)}
              className="text-xs bg-neutral-900 border border-neutral-800 rounded-md text-neutral-300 px-2 py-1.5 focus:outline-none"
            >
              <option value="">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Save Full Pipeline */}
          {currentRun && (
            <Button
              size="sm"
              onClick={() => setShowSaveDialog("full")}
              className="bg-blue-600 hover:bg-blue-700 text-xs gap-1"
            >
              <Save className="w-3 h-3" /> Save Full Pipeline
            </Button>
          )}
          {/* Save Current Step */}
          {currentStepData && (
            <Button
              size="sm"
              onClick={() => setShowSaveDialog("step")}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-1"
            >
              <Plus className="w-3 h-3" /> Save Step
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportSnapshots()}
            disabled={snapshots.length === 0}
            className="text-xs gap-1 border-neutral-700"
          >
            <Download className="w-3 h-3" /> Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs gap-1 border-neutral-700"
          >
            <Upload className="w-3 h-3" /> Import
          </Button>
          {/* Clear All */}
          {snapshots.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs gap-1 border-red-800/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              <Trash2 className="w-3 h-3" /> Clear All
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* CONTENT */}
      {/* ================================================================ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Snapshot list */}
        <div className="w-80 border-r border-neutral-800 overflow-y-auto flex-shrink-0">
          {filteredSnapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Database className="w-10 h-10 text-neutral-700 mb-3" />
              <p className="text-sm text-neutral-400 mb-1">No snapshots yet</p>
              <p className="text-xs text-neutral-600">
                {snapshots.length === 0
                  ? "Select a video in Inspect mode, then come here and click 'Save Full Pipeline' to snapshot it."
                  : "No snapshots match your current filters."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {filteredSnapshots.map((snapshot) => (
                <SnapshotListItem
                  key={snapshot.id}
                  snapshot={snapshot}
                  isSelected={selectedSnapshot?.id === snapshot.id}
                  onClick={() => setSelectedSnapshot(snapshot)}
                  onDelete={() => {
                    deleteSnapshot(snapshot.id);
                    if (selectedSnapshot?.id === snapshot.id) setSelectedSnapshot(null);
                  }}
                  onEdit={() => setShowEditDialog(snapshot)}
                  onLoadAsVideo={snapshot.fullRun ? () => handleLoadAsVideo(snapshot) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail view */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedSnapshot ? (
            <SnapshotDetail
              snapshot={selectedSnapshot}
              onAddTag={(tag) => addTag(selectedSnapshot.id, tag)}
              onRemoveTag={(tag) => removeTag(selectedSnapshot.id, tag)}
              onCopyJson={() => {
                const dataToCopy = selectedSnapshot.fullRun || selectedSnapshot.data;
                navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
              }}
              onLoadAsVideo={
                selectedSnapshot.fullRun
                  ? () => handleLoadAsVideo(selectedSnapshot)
                  : undefined
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
              Select a snapshot to view its data
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SAVE DIALOG */}
      {/* ================================================================ */}
      {showSaveDialog === "step" && currentStepData && (
        <SaveSnapshotDialog
          title="Save Step Snapshot"
          defaultName={`Step ${currentStepData.step} — ${currentStepData.label}`}
          onSave={(formData) => {
            saveSnapshot(
              currentStepData.step,
              currentStepData.label,
              {
                inputs: currentStepData.inputs,
                outputs: currentStepData.outputs,
                config: currentStepData.config,
              },
              formData,
              currentVideoId || undefined,
              currentVideoName,
              currentRun,
            );
            setShowSaveDialog(null);
          }}
          onClose={() => setShowSaveDialog(null)}
        />
      )}

      {showSaveDialog === "full" && currentRun && (
        <SaveSnapshotDialog
          title="Save Full Pipeline Snapshot"
          defaultName={currentRun.videoName || "Pipeline Snapshot"}
          description="Saves all 8 steps of the pipeline. Can be loaded back into Inspect or Compare modes as a virtual video."
          onSave={(formData) => {
            saveFullPipelineSnapshot(
              currentRun,
              formData,
              currentVideoId || undefined,
              currentVideoName,
            );
            setShowSaveDialog(null);
          }}
          onClose={() => setShowSaveDialog(null)}
        />
      )}

      {/* ================================================================ */}
      {/* EDIT DIALOG */}
      {/* ================================================================ */}
      {showEditDialog && (
        <EditSnapshotDialog
          snapshot={showEditDialog}
          onSave={(updates) => {
            updateSnapshot(showEditDialog.id, updates);
            setShowEditDialog(null);
            if (selectedSnapshot?.id === showEditDialog.id) {
              setSelectedSnapshot({ ...showEditDialog, ...updates });
            }
          }}
          onClose={() => setShowEditDialog(null)}
        />
      )}

      {/* ================================================================ */}
      {/* CLEAR CONFIRM DIALOG */}
      {/* ================================================================ */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-red-800/50 bg-neutral-900 shadow-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-red-400">Clear All Snapshots</h3>
            <p className="text-xs text-neutral-400">
              This will permanently delete all {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} from localStorage.
              This cannot be undone.
            </p>
            <p className="text-[10px] text-neutral-600">
              Tip: Export your snapshots first if you want to keep a backup.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  clearAll();
                  setSelectedSnapshot(null);
                  setShowClearConfirm(false);
                }}
                className="bg-red-600 hover:bg-red-700 text-xs"
              >
                Delete All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SNAPSHOT LIST ITEM
// ============================================================================

function SnapshotListItem({
  snapshot,
  isSelected,
  onClick,
  onDelete,
  onEdit,
  onLoadAsVideo,
}: {
  snapshot: PipelineSnapshot;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onLoadAsVideo?: () => void;
}) {
  const isFullPipeline = snapshot.isFullPipeline && snapshot.fullRun;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 transition-colors ${
        isSelected ? "bg-neutral-800" : "hover:bg-neutral-800/30"
      }`}
    >
      <div className="flex items-start gap-2">
        {isFullPipeline ? (
          <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Database className="w-3 h-3 text-blue-400" />
          </div>
        ) : snapshot.pipelineStep ? (
          <StepIcon step={snapshot.pipelineStep} size="sm" />
        ) : (
          <div className="w-5 h-5 rounded bg-neutral-700/30 flex items-center justify-center flex-shrink-0">
            <Database className="w-3 h-3 text-neutral-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-neutral-200 truncate">
            {snapshot.name}
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">
            {isFullPipeline ? (
              <span className="text-blue-400">Full Pipeline</span>
            ) : snapshot.pipelineStep ? (
              `Step ${snapshot.pipelineStep}: ${snapshot.stepLabel}`
            ) : (
              snapshot.stepLabel
            )}
          </div>
          {snapshot.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {snapshot.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-neutral-600 mt-1">
            {new Date(snapshot.createdAt).toLocaleDateString()}
            {snapshot.sourceVideoName && ` · ${snapshot.sourceVideoName}`}
          </div>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {onLoadAsVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); onLoadAsVideo(); }}
              className="p-1 rounded hover:bg-blue-900/30 text-neutral-600 hover:text-blue-400"
              title="Load as Video"
            >
              <PlayCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded hover:bg-neutral-700 text-neutral-600 hover:text-neutral-300"
            title="Edit"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-red-900/30 text-neutral-600 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// SNAPSHOT DETAIL
// ============================================================================

function SnapshotDetail({
  snapshot,
  onAddTag,
  onRemoveTag,
  onCopyJson,
  onLoadAsVideo,
}: {
  snapshot: PipelineSnapshot;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onCopyJson: () => void;
  onLoadAsVideo?: () => void;
}) {
  const [newTag, setNewTag] = useState("");
  const isFullPipeline = snapshot.isFullPipeline && snapshot.fullRun;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{snapshot.name}</h3>
          {snapshot.description && (
            <p className="text-xs text-neutral-400 mt-1">{snapshot.description}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-1">
            {isFullPipeline ? (
              <span className="text-blue-400 font-semibold">Full Pipeline Snapshot</span>
            ) : snapshot.pipelineStep ? (
              <span>Step {snapshot.pipelineStep}: {snapshot.stepLabel}</span>
            ) : (
              <span>{snapshot.stepLabel}</span>
            )}
            <span>·</span>
            <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
            {snapshot.sourceVideoName && (
              <>
                <span>·</span>
                <span>From: {snapshot.sourceVideoName}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onLoadAsVideo && (
            <Button
              size="sm"
              onClick={onLoadAsVideo}
              className="bg-blue-600 hover:bg-blue-700 text-xs gap-1"
            >
              <PlayCircle className="w-3 h-3" /> Load as Video
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onCopyJson}
            className="text-xs gap-1 border-neutral-700"
          >
            <Copy className="w-3 h-3" /> Copy JSON
          </Button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="w-3 h-3 text-neutral-500" />
        {snapshot.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/50"
          >
            {tag}
            <button onClick={() => onRemoveTag(tag)} className="hover:text-red-400">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newTag.trim()) {
              onAddTag(newTag.trim());
              setNewTag("");
            }
          }}
          className="inline-flex"
        >
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="+ add tag"
            className="w-16 text-[10px] bg-transparent border-b border-neutral-700 text-neutral-400 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 px-0.5"
          />
        </form>
      </div>

      {/* Data sections */}
      {isFullPipeline && snapshot.fullRun ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-500/20 bg-blue-950/10 p-3">
            <h4 className="text-[10px] uppercase font-semibold text-blue-400 mb-2">Pipeline Overview</h4>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-neutral-500">Video:</span>{" "}
                <span className="text-neutral-200">{snapshot.fullRun.videoName}</span>
              </div>
              <div>
                <span className="text-neutral-500">Stage:</span>{" "}
                <span className="text-neutral-200">{snapshot.fullRun.currentStage}</span>
              </div>
              <div>
                <span className="text-neutral-500">Steps:</span>{" "}
                <span className="text-neutral-200">
                  {snapshot.fullRun.steps.filter(s => s.status === "complete").length}/8
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Created:</span>{" "}
                <span className="text-neutral-200">
                  {new Date(snapshot.fullRun.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {snapshot.fullRun.steps.map((step) => (
            <div key={step.step} className="rounded-lg border border-neutral-800 overflow-hidden">
              <div className="px-3 py-1.5 bg-neutral-900/50 border-b border-neutral-800 flex items-center gap-2">
                <StepIcon step={step.step} size="sm" />
                <h4 className="text-[10px] uppercase font-semibold text-neutral-400">
                  Step {step.step}: {step.label}
                </h4>
                <span className={`text-[9px] px-1 py-0.5 rounded ml-auto ${
                  step.status === "complete" ? "bg-green-900/30 text-green-400" :
                  step.status === "error" ? "bg-red-900/30 text-red-400" :
                  "bg-neutral-800 text-neutral-500"
                }`}>
                  {step.status}
                </span>
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
                <JsonTreeViewer data={{ inputs: step.inputs, outputs: step.outputs, config: step.config }} defaultExpanded={false} maxDepth={2} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <DataSection label="Inputs" data={snapshot.data.inputs} />
          <DataSection label="Outputs" data={snapshot.data.outputs} />
          <DataSection label="Config" data={snapshot.data.config} />
        </div>
      )}
    </div>
  );
}

function DataSection({ label, data }: { label: string; data: Record<string, unknown> }) {
  const isEmpty = Object.keys(data).length === 0;
  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="px-3 py-1.5 bg-neutral-900/50 border-b border-neutral-800">
        <h4 className="text-[10px] uppercase font-semibold text-neutral-500">{label}</h4>
      </div>
      <div className="p-3">
        {isEmpty ? (
          <span className="text-xs text-neutral-600 italic">Empty</span>
        ) : (
          <JsonTreeViewer data={data} defaultExpanded={false} maxDepth={4} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SAVE DIALOG
// ============================================================================

function SaveSnapshotDialog({
  title,
  defaultName,
  description: descriptionHint,
  onSave,
  onClose,
}: {
  title: string;
  defaultName: string;
  description?: string;
  onSave: (formData: { name: string; description: string; tags: string[] }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {descriptionHint && (
          <p className="text-xs text-neutral-500">{descriptionHint}</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase text-neutral-500 font-semibold">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase text-neutral-500 font-semibold">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:border-neutral-500 resize-none"
              placeholder="Optional description..."
            />
          </div>

          <div>
            <label className="text-[10px] uppercase text-neutral-500 font-semibold">Tags</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/50">
                  {t}
                  <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    setTags([...tags, tagInput.trim()]);
                    setTagInput("");
                  }
                }}
                placeholder="Type + enter..."
                className="flex-1 min-w-[80px] text-xs bg-transparent text-neutral-300 placeholder-neutral-600 focus:outline-none"
              />
            </div>
            <div className="flex gap-1 mt-1.5">
              {["baseline", "known-good", "regression", "experiment"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => !tags.includes(preset) && setTags([...tags, preset])}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    tags.includes(preset)
                      ? "border-neutral-600 bg-neutral-800 text-neutral-400"
                      : "border-neutral-800 text-neutral-600 hover:border-neutral-700 hover:text-neutral-400"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave({ name, description, tags })}
            disabled={!name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
          >
            Save Snapshot
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDIT DIALOG
// ============================================================================

function EditSnapshotDialog({
  snapshot,
  onSave,
  onClose,
}: {
  snapshot: PipelineSnapshot;
  onSave: (updates: Partial<PipelineSnapshot>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(snapshot.name);
  const [description, setDescription] = useState(snapshot.description || "");
  const [dataJson, setDataJson] = useState(
    JSON.stringify(snapshot.fullRun || snapshot.data, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(dataJson);
      setJsonError(null);
      // If it has a fullRun shape (has steps array), save as fullRun
      if (parsed.steps && Array.isArray(parsed.steps)) {
        onSave({ name, description: description || null, fullRun: parsed });
      } else {
        onSave({ name, description: description || null, data: parsed });
      }
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-bold text-white">Edit Snapshot</h3>

        <div className="space-y-3 flex-shrink-0">
          <div>
            <label className="text-[10px] uppercase text-neutral-500 font-semibold">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:border-neutral-500"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-neutral-500 font-semibold">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 text-sm bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:border-neutral-500"
              placeholder="Optional..."
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <label className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">
            Snapshot Data (JSON)
          </label>
          <textarea
            value={dataJson}
            onChange={(e) => {
              setDataJson(e.target.value);
              setJsonError(null);
            }}
            className="flex-1 font-mono text-xs bg-neutral-950 border border-neutral-700 rounded-md text-neutral-300 p-3 focus:outline-none focus:border-neutral-500 resize-none min-h-[200px]"
            spellCheck={false}
          />
          {jsonError && (
            <span className="text-xs text-red-400 mt-1">{jsonError}</span>
          )}
        </div>

        <div className="flex gap-2 justify-end flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
