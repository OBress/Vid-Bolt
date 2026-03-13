"use client";

/**
 * Step Inspector Panel
 * ============================================================================
 * Tabbed panel showing inputs, outputs, config, prompts, logs, and timing
 * for a selected pipeline step. Core inspection interface.
 */

import { useMemo } from "react";
import type { StepData, StepMedia } from "../../types/pipeline-debugger";
import { getStepConfig } from "../../utils/step-config";
import { JsonTreeViewer } from "../shared/JsonTreeViewer";
import { PipelineStatusBadge } from "../shared/PipelineStatusBadge";
import { StepIcon } from "../shared/StepIcon";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings2,
  MessageSquare,
  ScrollText,
  Clock,
  AlertTriangle,
  Image,
  Video,
  Music,
} from "lucide-react";

type InspectorTab = "inputs" | "outputs" | "config" | "prompts" | "logs" | "timing";

interface StepInspectorPanelProps {
  step: StepData;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  className?: string;
}

const TABS: Array<{ id: InspectorTab; label: string; icon: typeof ArrowDownToLine }> = [
  { id: "inputs", label: "Inputs", icon: ArrowDownToLine },
  { id: "outputs", label: "Outputs", icon: ArrowUpFromLine },
  { id: "config", label: "Config", icon: Settings2 },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "timing", label: "Timing", icon: Clock },
];

export function StepInspectorPanel({
  step,
  activeTab,
  onTabChange,
  className = "",
}: StepInspectorPanelProps) {
  const config = getStepConfig(step.step);

  const mediaCount = step.media.length;
  const errorCount = step.errors.length;

  return (
    <div className={`rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <StepIcon step={step.step} size="md" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              Step {step.step}: {step.label}
            </h3>
            <p className="text-xs text-neutral-500">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {mediaCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <Image className="w-3 h-3" />
              {mediaCount} media
            </span>
          )}
          <PipelineStatusBadge status={step.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-950/30">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                isActive
                  ? `border-${config.color}-500 text-white`
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {activeTab === "inputs" && (
          <JsonTreeViewer data={step.inputs} label="inputs" />
        )}
        {activeTab === "outputs" && (
          <JsonTreeViewer data={step.outputs} label="outputs" />
        )}
        {activeTab === "config" && (
          <JsonTreeViewer data={step.config} label="config" />
        )}
        {activeTab === "prompts" && (
          <PromptTab prompts={step.prompts} />
        )}
        {activeTab === "logs" && (
          <LogsTab errors={step.errors} logs={step.logs} />
        )}
        {activeTab === "timing" && (
          <TimingTab timing={step.timing} />
        )}
      </div>

      {/* Media preview strip (always visible if media exists) */}
      {step.media.length > 0 && (
        <div className="border-t border-neutral-800 px-4 py-3">
          <MediaStrip media={step.media} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function PromptTab({ prompts }: { prompts: StepData["prompts"] }) {
  if (prompts.length === 0) {
    return (
      <div className="text-neutral-500 text-sm italic">
        No prompt data available for this step. Prompt extraction is available
        when viewing recent runs with task data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prompts.map((prompt) => (
        <div key={prompt.id} className="space-y-2">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
            {prompt.label}
          </h4>
          {prompt.systemPrompt && (
            <div>
              <span className="text-[10px] text-neutral-500 uppercase">System</span>
              <pre className="mt-1 p-2 rounded bg-neutral-950 text-xs text-neutral-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {prompt.systemPrompt}
              </pre>
            </div>
          )}
          {prompt.userPrompt && (
            <div>
              <span className="text-[10px] text-neutral-500 uppercase">User</span>
              <pre className="mt-1 p-2 rounded bg-neutral-950 text-xs text-neutral-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {prompt.userPrompt}
              </pre>
            </div>
          )}
          {prompt.tokenCount && (
            <span className="text-[10px] text-neutral-600">
              ~{prompt.tokenCount.toLocaleString()} tokens
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function LogsTab({ errors, logs }: { errors: StepData["errors"]; logs: StepData["logs"] }) {
  const hasLogs = logs.length > 0;
  const hasErrors = errors.length > 0;

  if (!hasLogs && !hasErrors) {
    return (
      <div className="text-neutral-500 text-sm italic">
        No logs or errors recorded for this step.
      </div>
    );
  }

  const levelStyles: Record<string, { bg: string; text: string; label: string }> = {
    info: { bg: "bg-blue-950/20", text: "text-blue-400", label: "INFO" },
    warning: { bg: "bg-amber-950/20", text: "text-amber-400", label: "WARN" },
    error: { bg: "bg-red-950/20", text: "text-red-400", label: "ERR" },
    debug: { bg: "bg-neutral-900/50", text: "text-neutral-500", label: "DBG" },
  };

  return (
    <div className="space-y-3">
      {/* Activity logs */}
      {hasLogs && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] uppercase text-neutral-500 font-semibold">
            Activity Log ({logs.length})
          </h4>
          {logs.map((log, i) => {
            const style = levelStyles[log.level] || levelStyles.debug;
            return (
              <div
                key={i}
                className={`p-2 rounded ${style.bg} border border-neutral-800/50 text-xs`}
              >
                <div className="flex items-start gap-2">
                  <span className={`text-[9px] font-mono font-bold ${style.text} flex-shrink-0 mt-0.5`}>
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-300">{log.message}</span>
                      <span className="text-[9px] text-neutral-600 flex-shrink-0">
                        {log.phase}
                      </span>
                    </div>
                    {log.timestamp && (
                      <span className="text-[9px] text-neutral-600 block mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                    {log.detail && (
                      <pre className="mt-1 text-[10px] text-neutral-500 whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {log.detail}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] uppercase text-red-500 font-semibold">
            Errors ({errors.length})
          </h4>
          {errors.map((error, i) => (
            <div
              key={i}
              className="p-2 rounded bg-red-950/20 border border-red-900/30 text-sm"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-300">{error.message}</p>
                  {error.code && (
                    <span className="text-[10px] text-red-500">Code: {error.code}</span>
                  )}
                  {error.stack && (
                    <pre className="mt-1 text-[10px] text-red-600 whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {error.stack}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimingTab({ timing }: { timing: StepData["timing"] }) {
  if (!timing) {
    return (
      <div className="text-neutral-500 text-sm italic">
        No timing data available. Timing is populated from BullMQ task records
        when available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <TimingCard
          label="Duration"
          value={timing.durationMs ? `${(timing.durationMs / 1000).toFixed(1)}s` : "N/A"}
        />
        <TimingCard
          label="Queue Wait"
          value={timing.queueWaitMs ? `${(timing.queueWaitMs / 1000).toFixed(1)}s` : "N/A"}
        />
        <TimingCard
          label="Retries"
          value={String(timing.retryCount)}
        />
        <TimingCard
          label="Started"
          value={timing.startedAt ? new Date(timing.startedAt).toLocaleTimeString() : "N/A"}
        />
      </div>
    </div>
  );
}

function TimingCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-neutral-950 border border-neutral-800">
      <div className="text-[10px] text-neutral-500 uppercase">{label}</div>
      <div className="text-sm font-medium text-neutral-200">{value}</div>
    </div>
  );
}

function MediaStrip({ media }: { media: StepMedia[] }) {
  const getIcon = (type: StepMedia["type"]) => {
    switch (type) {
      case "image": return Image;
      case "video": return Video;
      case "audio": return Music;
      default: return Image;
    }
  };

  return (
    <div>
      <h4 className="text-[10px] uppercase text-neutral-500 mb-2 font-medium">
        Media ({media.length})
      </h4>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {media.slice(0, 12).map((item) => {
          const Icon = getIcon(item.type);
          return (
            <div
              key={item.id}
              className="flex-shrink-0 w-16 h-16 rounded border border-neutral-700 bg-neutral-950 overflow-hidden relative group"
              title={item.label}
            >
              {item.type === "image" && item.url ? (
                <img
                  src={item.url}
                  alt={item.label}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon className="w-5 h-5 text-neutral-600" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5">
                <span className="text-[9px] text-neutral-400 truncate block">
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
        {media.length > 12 && (
          <div className="flex-shrink-0 w-16 h-16 rounded border border-neutral-700 bg-neutral-950 flex items-center justify-center">
            <span className="text-xs text-neutral-500">+{media.length - 12}</span>
          </div>
        )}
      </div>
    </div>
  );
}
