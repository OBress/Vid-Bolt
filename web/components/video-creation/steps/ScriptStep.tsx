"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  CheckCircle,
  Plus,
  Send,
  X,
  MessageSquare,
  Save,
  Pencil,
  PencilOff,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================================
// TYPES
// ============================================================================

type ViewState = "progress" | "output";

interface OutlineOutput {
  researchDossier?: any;
  durationDecision?: any;
  spine?: {
    title?: string;
    beatCount: number;
    totalDurationSeconds: number;
    sections: Array<{
      name: string;
      startBeatIndex: number;
      endBeatIndex: number;
    }>;
    beats: Array<{
      index: number;
      classification: { type: string; section: string };
      contentSummary: string;
      keyPoints: string[];
    }>;
  };
  assetRegistry?: {
    characters: Array<{ id: string; name: string; role: string }>;
    locations: Array<{ id: string; name: string; essence: string }>;
    objects: Array<{ id: string; name: string; type: string }>;
  };
}

interface ScriptOutput {
  expandedBeats: Array<{
    beatIndex: number;
    narration: string;
    wordCount: number;
    qualityScore?: number;
  }>;
  finalScript: string;
  qualityValidation: {
    passed: boolean;
    factualAccuracy?: { passed: boolean; issues: string[] };
    consistency?: { passed: boolean; issues: string[] };
    engagement?: { passed: boolean; issues: string[] };
  };
  beatTimingSheet?: Array<{
    beatIndex: number;
    startSeconds: number;
    endSeconds: number;
    type: string;
    summary: string;
  }>;
}

interface ScriptStepProps {
  videoId: string;
  projectId: string;
  outlineData: OutlineOutput | null;
  outlineConfig?: {
    topic: string;
    genre: string;
    angle?: string;
  } | null;
  initialScriptOutput?: ScriptOutput | null;
  isLoading?: boolean; // Auto-trigger flag from parent
  taskId?: string | null; // Task ID from parent for auto-generation
  onComplete: (script: string, output: ScriptOutput) => void;
  onSave: (script: string) => void;
  onScriptGenerated?: (script: string, output: ScriptOutput) => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface BeatSectionProps {
  beat: { beatIndex: number; narration: string };
  isEditing: boolean;
  activeBeatIndex: number | null;
  activeBeatStyles: string;
  isLast: boolean;
  onBeatClick: (index: number) => void;
  onEditBlur: (beatIndex: number, newNarration: string) => void;
  NarrationHighlight: React.ComponentType<{ text: string; context: string[] }>;
  chatContext: string[];
}

const BeatSection = memo(
  ({
    beat,
    isEditing,
    activeBeatIndex,
    activeBeatStyles,
    isLast,
    onBeatClick,
    onEditBlur,
    NarrationHighlight,
    chatContext,
  }: BeatSectionProps) => {
    return (
      <div
        id={`beat-${beat.beatIndex}`}
        onClick={() => onBeatClick(beat.beatIndex)}
        className={`py-2 px-3 -mx-3 rounded transition-colors ${
          activeBeatIndex === beat.beatIndex
            ? activeBeatStyles
            : "border-l-2 border-transparent hover:bg-neutral-800/30"
        }`}
      >
        {isEditing ? (
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              onEditBlur(beat.beatIndex, e.currentTarget.textContent || "");
            }}
            className="whitespace-pre-wrap text-neutral-300 outline-none cursor-text focus:bg-neutral-800/20 rounded p-1 -m-1"
          >
            {beat.narration}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-neutral-300 cursor-text select-text">
            <NarrationHighlight text={beat.narration} context={chatContext} />
          </pre>
        )}
        {!isLast && <div className="my-4 border-t border-neutral-800/50" />}
      </div>
    );
  },
);

BeatSection.displayName = "BeatSection";

// ============================================================================
// COMPONENT
// ============================================================================

export const ScriptStep = memo(
  forwardRef<any, ScriptStepProps>(
    (
      {
        videoId,
        projectId,
        outlineData,
        outlineConfig: _outlineConfig,
        initialScriptOutput,
        isLoading: isLoadingProp,
        taskId: taskIdProp,
        onComplete,
        onSave,
        onScriptGenerated,
        onBack: _onBack,
        isLocked: _isLocked,
        lockedMessage: _lockedMessage,
      },
      ref,
    ) => {
      // Determine initial view: output if we have script, otherwise progress (auto-start will trigger generation)
      const [view, setView] = useState<ViewState>(() => {
        if (initialScriptOutput) return "output";
        return "progress"; // Always go to progress - auto-start will trigger generation
      });

      const [taskId, setTaskId] = useState<string | null>(taskIdProp || null);
      const [taskStatus, setTaskStatus] = useState<string>(
        initialScriptOutput ? "completed" : "idle",
      );
      const [progress, setProgress] = useState(0);
      const [currentStep, setCurrentStep] = useState<string | null>(null);
      const [_error, setError] = useState<string | null>(null);
      const [output, setOutput] = useState<ScriptOutput | null>(
        initialScriptOutput || null,
      );
      const [isStarting, setIsStarting] = useState(false);
      const [_activeTab, _setActiveTab] = useState("script");

      // Editing state for script
      const [editingScript, setEditingScript] = useState<string>(
        initialScriptOutput?.finalScript || "",
      );
      const [isEditing, setIsEditing] = useState(false);
      const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
      const [isSaving, setIsSaving] = useState(false);
      const [originalScript, setOriginalScript] = useState<string>(
        initialScriptOutput?.finalScript || "",
      );
      const scriptContentRef = useRef<HTMLDivElement>(null);

      // Chat window state
      const [selectedText, setSelectedText] = useState<string>("");
      const [chatContext, setChatContext] = useState<string[]>([]);
      const [chatInput, setChatInput] = useState("");
      const [chatMessages, setChatMessages] = useState<
        Array<{ role: "user" | "assistant"; content: string }>
      >([]);
      const [isProcessingChat, setIsProcessingChat] = useState(false);
      const [selectionPosition, setSelectionPosition] = useState<{
        x: number;
        y: number;
      } | null>(null);
      const [activeBeatIndex, setActiveBeatIndex] = useState<number | null>(
        null,
      );

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      // Update editing script when output changes
      useEffect(() => {
        if (output?.finalScript) {
          setEditingScript(output.finalScript);
        }
      }, [output]);

      // Sync external taskId prop with internal state (for auto-generation from parent)
      useEffect(() => {
        if (taskIdProp && !taskId) {
          console.log("[Step3] Syncing external taskId:", taskIdProp);
          setTaskId(taskIdProp);
          setView("progress");
          setTaskStatus("pending");
        }
      }, [taskIdProp, taskId]);

      // Note: isLoading sync removed - no longer needed since we default to progress view

      // AUTO-START: If we're in progress view without a task, automatically trigger script generation
      const hasAutoStarted = useRef(false);
      useEffect(() => {
        if (
          view === "progress" &&
          !hasAutoStarted.current &&
          outlineData?.spine &&
          !initialScriptOutput &&
          !taskId &&
          !isLoadingProp &&
          !isStarting
        ) {
          console.log("[Step3] Auto-starting script generation");
          hasAutoStarted.current = true;
          setIsStarting(true);
          setProgress(0);
          
          fetch("/api/process/script-writing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.taskId) {
                console.log("[Step3] Script task created:", data.taskId);
                setTaskId(data.taskId);
                setTaskStatus("pending");
              } else {
                console.error("[Step3] Failed to create script task:", data);
                setError(data.error || "Failed to start script generation");
              }
              setIsStarting(false);
            })
            .catch((err) => {
              console.error("[Step3] Script generation failed:", err);
              setError("Failed to start script generation");
              setIsStarting(false);
            });
        }
      }, [view, outlineData, initialScriptOutput, taskId, isLoadingProp, isStarting, videoId]);

      // Click outside to exit edit mode (but not when clicking AI Rewrite or Beat Outline)
      useEffect(() => {
        if (!isEditing) return;

        const handleClickOutside = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          // Check if click is inside script content area
          if (scriptContentRef.current?.contains(target)) return;
          // Check if click is on sidebar elements (they have specific classes)
          if (target.closest("[data-sidebar]")) return;
          // Check if click is on toolbar (toggle button, save button)
          if (target.closest("[data-toolbar]")) return;
          // Otherwise, exit edit mode
          setIsEditing(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () =>
          document.removeEventListener("mousedown", handleClickOutside);
      }, [isEditing]);

      // Poll for task updates
      const fetchTaskStatus = useCallback(
        async (id: string) => {
          const { data: statusData, error: statusError } = await supabase
            .from("tasks")
            .select(
              "status, progress_percent, current_phase, current_step, error_message",
            )
            .eq("id", id)
            .single();

          if (statusError) {
            console.error("[Step3] Failed to fetch task status:", statusError);
            return;
          }

          setTaskStatus(statusData.status);
          setProgress(statusData.progress_percent || 0);
          setCurrentStep(statusData.current_step);

          if (
            statusData.status === "completed" ||
            statusData.progress_percent === 100
          ) {
            const { data: outputData, error: outputError } = await supabase
              .from("tasks")
              .select("output_data")
              .eq("id", id)
              .single();

            if (outputError) {
              console.error(
                "[Step3] Failed to fetch output data:",
                outputError,
              );
              return;
            }

            if (outputData?.output_data) {
              const newOutput = outputData.output_data as ScriptOutput;
              setOutput(newOutput);
              setView("output");
              setTaskStatus("completed");
              // Notify parent that script was generated so navigation can be enabled
              if (onScriptGenerated) {
                onScriptGenerated(newOutput.finalScript, newOutput);
              }
            }
          } else if (statusData.status === "failed") {
            setError(statusData.error_message || "Task failed");
            // Stay on progress view with error displayed
          }
        },
        [supabase],
      );

      // Polling effect
      useEffect(() => {
        if (view !== "progress" || !taskId) return;

        fetchTaskStatus(taskId);

        const interval = setInterval(() => {
          fetchTaskStatus(taskId);
        }, 2000);

        return () => clearInterval(interval);
      }, [view, taskId, fetchTaskStatus]);

      const _startGeneration = async () => {
        if (!outlineData?.spine) {
          setError("Outline data is missing. Please complete Step 1 first.");
          return;
        }

        // Immediately switch to progress view for instant feedback
        setError(null);
        setIsStarting(true);
        setProgress(0);
        setView("progress");

        try {
          const response = await fetch("/api/process/script-writing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Failed to start task");
          }

          setTaskId(data.taskId);
          setTaskStatus("pending");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unknown error");
          // Stay on progress view with error displayed
        } finally {
          setIsStarting(false);
        }
      };

      const handleConfirm = useCallback(() => {
        if (output) {
          const finalScript = isEditing ? editingScript : output.finalScript;
          onComplete(finalScript, output);
        }
      }, [output, isEditing, editingScript, onComplete]);

      // Expose methods to parent
      useImperativeHandle(ref, () => ({
        handleConfirm,
      }));

      const handleBeatEdit = useCallback(
        (beatIndex: number, newNarration: string) => {
          if (!output) return;
          const newScript = output.expandedBeats
            .map((b) =>
              b.beatIndex === beatIndex ? newNarration : b.narration,
            )
            .join("\n\n");
          setEditingScript(newScript);
          setHasUnsavedChanges(newScript !== originalScript);
        },
        [output, originalScript],
      );

      const handleSave = async () => {
        if (!hasUnsavedChanges || !videoId) return;

        setIsSaving(true);
        try {
          await fetch(`/api/videos/${videoId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script_content: editingScript }),
          });
          setOriginalScript(editingScript);
          setHasUnsavedChanges(false);
          onSave(editingScript);
        } catch (err) {
          console.error("Failed to save script:", err);
        } finally {
          setIsSaving(false);
        }
      };

      // Text selection handler - more robust version
      const handleTextSelection = useCallback(() => {
        // Small delay to ensure selection is finalized
        setTimeout(() => {
          const selection = window.getSelection();
          const text = selection?.toString().trim() || "";

          if (text.length > 0 && selection && selection.rangeCount > 0) {
            setSelectedText(text);

            // Auto-select beat based on selection
            try {
              let node = selection.anchorNode;
              while (node && node !== scriptContentRef.current) {
                const element =
                  node.nodeType === 1
                    ? (node as HTMLElement)
                    : node.parentElement;
                if (element) {
                  const id = element.closest("[id^='beat-']")?.id;
                  if (id) {
                    const index = parseInt(id.replace("beat-", ""));
                    if (!isNaN(index)) {
                      setActiveBeatIndex(index);
                    }
                    break;
                  }
                }
                node = node.parentElement;
              }

              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();

              // Use the container's boundaries to avoid scrollbar overlap
              const containerRect =
                scriptContentRef.current?.getBoundingClientRect();
              const containerWidth = scriptContentRef.current?.clientWidth || 0;

              if (containerRect && containerWidth > 0) {
                // Stay within the container's client area (excluding scrollbar)
                const maxX = containerRect.left + containerWidth - 45;
                setSelectionPosition({
                  x: Math.min(rect.right + 10, maxX),
                  y: Math.max(rect.top - 10, containerRect.top + 10),
                });
              } else {
                // Fallback
                setSelectionPosition({
                  x: Math.min(rect.right + 10, window.innerWidth - 80),
                  y: Math.max(rect.top - 10, 80),
                });
              }
            } catch (e) {
              console.error("Selection calculation error:", e);
              setSelectionPosition(null);
            }
          } else {
            setSelectedText("");
            setSelectionPosition(null);
          }
        }, 10);
      }, []);

      // Add selected text to context
      const addToContext = () => {
        if (selectedText && !chatContext.includes(selectedText)) {
          setChatContext([...chatContext, selectedText]);
        }
        // Don't clear selected text or position here, let user see it
        // window.getSelection()?.removeAllRanges(); // Removed per user request
      };

      // Remove context item
      const removeFromContext = (index: number) => {
        setChatContext(chatContext.filter((_, i) => i !== index));
      };

      // Send chat message - applies rewrite directly to script
      const handleChatSend = async () => {
        if (!chatInput.trim() || chatContext.length === 0) return;

        const userMessage = chatInput;
        setChatMessages([
          ...chatMessages,
          { role: "user", content: userMessage },
        ]);
        setChatInput("");
        setIsProcessingChat(true);

        try {
          const response = await fetch("/api/process/script-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              context: chatContext,
              message: userMessage,
              currentScript: editingScript,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const rewrittenText = data.rewrittenText;

            if (rewrittenText) {
              // Apply the rewrite directly to the script
              let newScript = editingScript;
              chatContext.forEach((ctx) => {
                // Replace the first occurrence of each context text
                newScript = newScript.replace(ctx, rewrittenText);
              });

              setEditingScript(newScript);
              setHasUnsavedChanges(true);

              // Show the explanation in chat (not the rewritten text)
              setChatMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `✓ ${data.explanation || "Changes applied to the script."}`,
                },
              ]);
            } else {
              setChatMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: "No rewrite was generated. Please try again.",
                },
              ]);
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error("Script chat API error:", response.status, errorData);
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Error: ${errorData.error || `API returned ${response.status}`}`,
              },
            ]);
          }
        } catch {
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Connection error. Please try again.",
            },
          ]);
        } finally {
          setIsProcessingChat(false);
        }
      };

      // Format time helper
      const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      };

      // Get quality color with smooth gradient (0=red, 5=yellow, 10=green)
      const getQualityColor = (score: number) => {
        // Clamp score between 0-10
        const s = Math.max(0, Math.min(10, score));
        // HSL: 0 = red, 60 = yellow, 120 = green
        // Map 0-10 to 0-120 hue
        const hue = (s / 10) * 120;
        return `hsl(${hue}, 70%, 50%)`;
      };

      // Handle beat click: select and smooth scroll (no deselect)
      const handleBeatClick = (beatIndex: number) => {
        // Always highlight and scroll
        setActiveBeatIndex(beatIndex);
        const beatElement = document.getElementById(`beat-${beatIndex}`);
        if (beatElement) {
          beatElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      // Escape HTML special characters
      const _escapeHtml = useCallback((text: string) => {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }, []);

      // Highlight text that's in the AI rewrite context using React nodes for persistence
      const NarrationHighlight = memo(
        ({ text, context }: { text: string; context: string[] }) => {
          if (context.length === 0) return <span>{text}</span>;

          // Build a regex for all context items
          const escapedContext = context.map((ctx) =>
            ctx.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          );
          const regex = new RegExp(`(${escapedContext.join("|")})`, "gi");

          const parts = text.split(regex);

          return (
            <>
              {parts.map((part, i) => {
                const isMatch = context.some(
                  (ctx) => ctx.toLowerCase() === part.toLowerCase(),
                );

                if (isMatch) {
                  return (
                    <mark
                      key={i}
                      className="bg-orange-500/30 text-orange-200 rounded px-0.5"
                    >
                      {part}
                    </mark>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </>
          );
        },
      );
      NarrationHighlight.displayName = "NarrationHighlight";

      // Phase mapping for progress display - matches backend progress updates
      const phases = [
        { key: "Expanding beat", label: "Writing Script", pattern: true },
        {
          key: "Rating script quality",
          label: "Quality Check",
          pattern: false,
        },
        { key: "Refining", label: "Refining Script", pattern: true },
        { key: "Smoothing", label: "Smoothing Transitions", pattern: true },
        { key: "Validating", label: "Validating Quality", pattern: true },
        { key: "Formatting", label: "Formatting Output", pattern: true },
        { key: "Saving", label: "Saving Script", pattern: true },
      ];

      const getCurrentPhaseIndex = () => {
        if (!currentStep) return 0;
        // Find matching phase using pattern matching
        const idx = phases.findIndex((p) =>
          p.pattern ? currentStep.includes(p.key) : currentStep === p.key,
        );
        return idx >= 0 ? idx : 0;
      };

      // =========================================================================
      // RENDER: PROGRESS VIEW
      // =========================================================================
      if (view === "progress") {
        const phaseIndex = getCurrentPhaseIndex();

        return (
          <div className="flex flex-col items-center gap-8 text-center pt-16">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute -inset-8 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                Writing Your Script
              </h2>
              <p className="text-neutral-500 text-sm">
                {currentStep || "Initializing..."}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-md">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
                <span>
                  {taskStatus === "running"
                    ? "Processing..."
                    : "Initializing..."}
                </span>
                <span>{progress}%</span>
              </div>
            </div>

            {/* Phase checklist */}
            <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
              <div className="space-y-3">
                {phases.map((phase, index) => {
                  const isCompleted = index < phaseIndex;
                  const isCurrent = index === phaseIndex;

                  return (
                    <div
                      key={phase.key}
                      className={`
                    flex items-center gap-3 text-sm transition-all duration-300
                    ${
                      isCompleted
                        ? "text-green-500"
                        : isCurrent
                          ? "text-orange-500"
                          : "text-neutral-600"
                    }
                  `}
                    >
                      <div
                        className={`
                      w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                      transition-all duration-300
                      ${
                        isCompleted
                          ? "bg-green-500/20 border border-green-500"
                          : isCurrent
                            ? "bg-orange-500/20 border border-orange-500"
                            : "bg-neutral-800 border border-neutral-700"
                      }
                    `}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : isCurrent ? (
                          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                        ) : (
                          <div className="w-2 h-2 bg-neutral-600 rounded-full" />
                        )}
                      </div>
                      <span className={isCurrent ? "font-medium" : ""}>
                        {phase.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-neutral-600 font-mono">
              Connected to AI workflow...
            </p>
          </div>
        );
      }

      // =========================================================================
      // RENDER: OUTPUT VIEW (Script Display & Editing)
      // =========================================================================
      const wordCount = editingScript.split(/\s+/).filter(Boolean).length;
      const estimatedDuration = Math.ceil(wordCount / 150);

      return (
        <div className="flex h-[calc(100vh-160px)] gap-4 w-full max-w-[98vw] mx-auto px-6 py-6">
          {/* LEFT SIDEBAR */}
          <div className="w-72 shrink-0 flex flex-col gap-4 h-full">
            {/* Header & Stats */}
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-mono uppercase tracking-widest">
                  <CheckCircle className="w-3 h-3" />
                  Complete
                </div>
                <h2 className="text-lg font-bold tracking-tight whitespace-nowrap">
                  Your Script
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-neutral-800/50 rounded-lg text-center">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                    Words
                  </div>
                  <div className="text-lg font-mono text-white">
                    {wordCount}
                  </div>
                </div>
                <div className="p-2.5 bg-neutral-800/50 rounded-lg text-center">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                    Est. Time
                  </div>
                  <div className="text-lg font-mono text-white">
                    ~{estimatedDuration}m
                  </div>
                </div>
              </div>
            </div>

            <div
              data-sidebar
              className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex-1 flex flex-col min-h-0"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-neutral-300 uppercase tracking-wider">
                    AI Rewrite
                  </span>
                </div>
                {(chatMessages.length > 0 || chatContext.length > 0) && (
                  <button
                    onClick={() => {
                      setChatMessages([]);
                      setChatContext([]);
                    }}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Context chips */}
              {chatContext.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {chatContext.map((text, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-400 text-[10px] rounded max-w-full"
                    >
                      <span className="truncate max-w-[120px]">
                        &quot;{text.substring(0, 30)}...&quot;
                      </span>
                      <button
                        onClick={() => removeFromContext(i)}
                        className="hover:text-orange-200 flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-0">
                {chatMessages.length === 0 ? (
                  <div className="text-xs text-neutral-500 text-center py-4">
                    Highlight text in the script, click + to add context, then
                    ask AI to rewrite.
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded-lg ${
                        msg.role === "user"
                          ? "bg-orange-500/20 text-orange-200 ml-4"
                          : "bg-neutral-800 text-neutral-300 mr-4"
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))
                )}
              </div>

              {/* Chat input */}
              <div className="flex gap-2 mt-auto">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleChatSend()
                  }
                  placeholder="Ask AI to rewrite..."
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                />
                <Button
                  onClick={handleChatSend}
                  disabled={isProcessingChat || !chatInput.trim()}
                  size="sm"
                  className="px-3 bg-orange-500 hover:bg-orange-400"
                >
                  {isProcessingChat ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* CENTER CONTENT AREA - Script */}
          <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full relative">
            <div className="h-full flex flex-col">
              {/* Toolbar */}
              <div
                data-toolbar
                className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-800/30 shrink-0"
              >
                <div className="flex items-center gap-3">
                  {/* Toggle Edit Button */}
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-1.5 rounded transition-colors ${
                      isEditing
                        ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                        : "bg-neutral-700/50 text-neutral-400 hover:bg-neutral-700"
                    }`}
                    title={isEditing ? "Exit edit mode" : "Enter edit mode"}
                  >
                    {isEditing ? (
                      <PencilOff className="w-4 h-4" />
                    ) : (
                      <Pencil className="w-4 h-4" />
                    )}
                  </button>
                  <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
                    {isEditing ? "Editing Script" : "Script Preview"}
                  </span>
                  {hasUnsavedChanges && (
                    <span className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded">
                      Unsaved
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 text-xs text-neutral-500">
                    <span>{wordCount} words</span>
                    <span>~{estimatedDuration} min read</span>
                  </div>
                  {hasUnsavedChanges && (
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      size="sm"
                      className="h-7 px-3 bg-orange-500 hover:bg-orange-400 text-white text-xs gap-1.5"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </Button>
                  )}
                </div>
              </div>

              {/* Script Content */}
              <div
                ref={scriptContentRef}
                className="flex-1 overflow-y-auto p-6 [&_*::selection]:bg-orange-500/40 [&_*::selection]:text-orange-100"
                onDoubleClick={() => !isEditing && setIsEditing(true)}
                onMouseUp={handleTextSelection}
              >
                {output?.expandedBeats && output.expandedBeats.length > 0 ? (
                  // Render with beat highlighting - works in both view and edit modes
                  <div className="text-sm leading-relaxed font-mono">
                    {output.expandedBeats.map((beat, i) => (
                      <BeatSection
                        key={`${beat.beatIndex}-${output.expandedBeats.length}`}
                        beat={beat}
                        isEditing={isEditing}
                        activeBeatIndex={activeBeatIndex}
                        activeBeatStyles="bg-neutral-700/10 border-l-2 border-orange-500"
                        isLast={i === output.expandedBeats.length - 1}
                        onBeatClick={(index) => {
                          // Only trigger click if no text is being selected
                          if (!window.getSelection()?.toString()) {
                            setActiveBeatIndex(index);
                          }
                        }}
                        onEditBlur={handleBeatEdit}
                        NarrationHighlight={NarrationHighlight}
                        chatContext={chatContext}
                      />
                    ))}
                  </div>
                ) : // Fallback: no beat data, use textarea for edit, pre for preview
                isEditing ? (
                  <Textarea
                    value={editingScript}
                    onChange={(e) => {
                      setEditingScript(e.target.value);
                      setHasUnsavedChanges(e.target.value !== originalScript);
                    }}
                    autoFocus
                    className="w-full h-full min-h-[500px] bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed font-mono text-white"
                  />
                ) : (
                  <pre
                    className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap font-mono cursor-text select-text [&::selection]:bg-orange-500/40 [&::selection]:text-orange-100"
                    onMouseUp={handleTextSelection}
                  >
                    {editingScript}
                  </pre>
                )}
              </div>
            </div>

            {/* Floating selection button */}
            {selectionPosition && selectedText && (
              <button
                onClick={addToContext}
                onMouseDown={(e) => e.preventDefault()} // CRITICAL: Prevent losing selection
                style={{
                  position: "fixed",
                  left: selectionPosition.x,
                  top: selectionPosition.y,
                  zIndex: 100,
                }}
                className="p-1.5 bg-orange-500 hover:bg-orange-400 rounded-full shadow-lg transition-colors animate-in zoom-in duration-200"
              >
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* RIGHT SIDEBAR - Beat Outline */}
          <div
            data-sidebar
            className="w-64 shrink-0 bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden h-full flex flex-col"
          >
            <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-800/30 shrink-0">
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
                Beat Outline
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {output?.beatTimingSheet && output.beatTimingSheet.length > 0
                ? output.beatTimingSheet.map((beat, _i) => {
                    const expandedBeat = output.expandedBeats?.find(
                      (eb) => eb.beatIndex === beat.beatIndex,
                    );
                    const qualityScore = expandedBeat?.qualityScore ?? 7;

                    return (
                      <div
                        key={beat.beatIndex}
                        onClick={() => handleBeatClick(beat.beatIndex)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border-l-2 ${
                          activeBeatIndex === beat.beatIndex
                            ? "border-orange-500 bg-neutral-800/70"
                            : "border-neutral-700 bg-neutral-800/30 hover:bg-neutral-800/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-neutral-400">
                            Beat {beat.beatIndex + 1}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 capitalize">
                            {beat.type}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-2">
                          <span>
                            {formatTime(beat.startSeconds)} -{" "}
                            {formatTime(beat.endSeconds)}
                          </span>
                          <span
                            className="font-medium"
                            style={{ color: getQualityColor(qualityScore) }}
                          >
                            {qualityScore}/10
                          </span>
                        </div>
                        {/* Quality bar */}
                        <div className="h-1 bg-neutral-700 rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${qualityScore * 10}%`,
                              backgroundColor: getQualityColor(qualityScore),
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-neutral-400 line-clamp-2">
                          {beat.summary}
                        </p>
                      </div>
                    );
                  })
                : // Fallback: show beats from outline if beatTimingSheet is not available
                  outlineData?.spine?.beats?.map((beat, i) => (
                    <div
                      key={i}
                      onClick={() => handleBeatClick(beat.index)}
                      className={`p-3 rounded-lg cursor-pointer transition-all border-l-2 ${
                        activeBeatIndex === beat.index
                          ? "border-orange-500 bg-neutral-800/70"
                          : "border-neutral-700 bg-neutral-800/30 hover:bg-neutral-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-neutral-400">
                          Beat {beat.index + 1}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300 capitalize">
                          {beat.classification?.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 line-clamp-2">
                        {beat.contentSummary}
                      </p>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      );
    },
  ),
);
