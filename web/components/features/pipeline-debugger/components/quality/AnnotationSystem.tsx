"use client";

/**
 * Annotation System
 * ============================================================================
 * Add persistent notes and comments to pipeline steps, media items,
 * or outputs. Supports threaded replies.
 */

import { useState, useMemo } from "react";
import {
  MessageSquare,
  Plus,
  X,
  Reply,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepIcon } from "../shared/StepIcon";
import { STEP_CONFIGS } from "../../utils/step-config";
import type {
  PipelineStep,
  PipelineAnnotation,
  PipelineRun,
} from "../../types/pipeline-debugger";

interface AnnotationSystemProps {
  run: PipelineRun | null;
  selectedStep: PipelineStep | null;
  className?: string;
}

const STORAGE_KEY = "pipeline-debugger-annotations";

function loadAnnotations(): PipelineAnnotation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function persistAnnotations(annotations: PipelineAnnotation[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
}

export function AnnotationSystem({
  run,
  selectedStep,
  className = "",
}: AnnotationSystemProps) {
  const [annotations, setAnnotations] = useState<PipelineAnnotation[]>(() => loadAnnotations());
  const [newContent, setNewContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  // Filter annotations for current context
  const contextAnnotations = useMemo(() => {
    if (!run) return [];
    return annotations
      .filter((a) => a.videoId === run.id)
      .filter((a) => !selectedStep || a.pipelineStep === selectedStep || a.pipelineStep === null)
      .filter((a) => !a.parentId); // Only top-level
  }, [annotations, run, selectedStep]);

  const getReplies = (parentId: string) =>
    annotations.filter((a) => a.parentId === parentId);

  const addAnnotation = (content: string, parentId?: string) => {
    if (!run || !content.trim()) return;
    const annotation: PipelineAnnotation = {
      id: crypto.randomUUID(),
      userId: "",
      videoId: run.id,
      pipelineStep: selectedStep,
      targetType: "step",
      targetId: null,
      content: content.trim(),
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
    };
    const updated = [annotation, ...annotations];
    setAnnotations(updated);
    persistAnnotations(updated);
    setNewContent("");
    setReplyingTo(null);
  };

  const deleteAnnotation = (id: string) => {
    // Delete annotation and all its replies
    const updated = annotations.filter((a) => a.id !== id && a.parentId !== id);
    setAnnotations(updated);
    persistAnnotations(updated);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-neutral-400" />
          <h3 className="text-xs font-semibold text-neutral-300 uppercase">
            Annotations
            {selectedStep && ` — Step ${selectedStep}: ${STEP_CONFIGS[selectedStep].label}`}
          </h3>
        </div>
        <span className="text-[10px] text-neutral-600">
          {contextAnnotations.length} note{contextAnnotations.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* New annotation input */}
      {run && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newContent.trim()) {
                addAnnotation(newContent);
              }
            }}
            placeholder={
              selectedStep
                ? `Add note for Step ${selectedStep}...`
                : "Add note for this video..."
            }
            className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-md text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <Button
            size="sm"
            onClick={() => addAnnotation(newContent)}
            disabled={!newContent.trim()}
            className="bg-neutral-700 hover:bg-neutral-600 text-xs gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>
      )}

      {/* Annotations list */}
      {contextAnnotations.length === 0 ? (
        <div className="text-center py-4 text-neutral-600 text-xs">
          {run ? "No annotations yet. Add one above." : "Select a video to view annotations."}
        </div>
      ) : (
        <div className="space-y-2">
          {contextAnnotations.map((annotation) => {
            const replies = getReplies(annotation.id);
            return (
              <div key={annotation.id}>
                <AnnotationCard
                  annotation={annotation}
                  onDelete={() => deleteAnnotation(annotation.id)}
                  onReply={() => setReplyingTo(replyingTo === annotation.id ? null : annotation.id)}
                  isReplyOpen={replyingTo === annotation.id}
                />

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1 border-l-2 border-neutral-800 pl-3">
                    {replies.map((reply) => (
                      <AnnotationCard
                        key={reply.id}
                        annotation={reply}
                        onDelete={() => deleteAnnotation(reply.id)}
                        isReply
                      />
                    ))}
                  </div>
                )}

                {/* Reply input */}
                {replyingTo === annotation.id && (
                  <ReplyInput
                    onSubmit={(content) => addAnnotation(content, annotation.id)}
                    onCancel={() => setReplyingTo(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ANNOTATION CARD
// ============================================================================

function AnnotationCard({
  annotation,
  onDelete,
  onReply,
  isReply = false,
  isReplyOpen = false,
}: {
  annotation: PipelineAnnotation;
  onDelete: () => void;
  onReply?: () => void;
  isReply?: boolean;
  isReplyOpen?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-neutral-800 bg-neutral-900/30 px-3 py-2 group ${
        isReply ? "text-[10px]" : "text-xs"
      }`}
    >
      <div className="flex items-start gap-2">
        {annotation.pipelineStep && !isReply && (
          <StepIcon step={annotation.pipelineStep} size="sm" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-neutral-300">{annotation.content}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-neutral-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {new Date(annotation.createdAt).toLocaleString()}
            </span>
            {annotation.pipelineStep && (
              <span className="text-neutral-600">
                Step {annotation.pipelineStep}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onReply && (
            <button
              onClick={onReply}
              className={`p-1 rounded hover:bg-neutral-800 ${
                isReplyOpen ? "text-blue-400" : "text-neutral-600 hover:text-neutral-300"
              }`}
              title="Reply"
            >
              <Reply className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-900/30 text-neutral-600 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// REPLY INPUT
// ============================================================================

function ReplyInput({
  onSubmit,
  onCancel,
}: {
  onSubmit: (content: string) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState("");

  return (
    <div className="ml-6 mt-1 flex gap-1.5">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && content.trim()) onSubmit(content);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Reply..."
        className="flex-1 px-2 py-1 text-[10px] bg-neutral-950 border border-neutral-700 rounded text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
        autoFocus
      />
      <button
        onClick={() => content.trim() && onSubmit(content)}
        className="text-[10px] px-2 py-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
      >
        Send
      </button>
      <button
        onClick={onCancel}
        className="text-[10px] px-1 py-1 text-neutral-600 hover:text-neutral-400"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
