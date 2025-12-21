"use client";

import { useState } from "react";
import { ArrowLeft, Check, Edit3, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step3ScriptReviewProps {
  script: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function Step3ScriptReview({
  script,
  onChange,
  onConfirm,
  onBack,
}: Step3ScriptReviewProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Calculate script stats
  const wordCount = script.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 150); // ~150 words per minute

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
          <FileText className="w-3 h-3" />
          Step 5 of 10
        </div>
        <h2 className="text-3xl font-bold tracking-tight">
          Review Your Script
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Here's your complete video script. Edit as needed before we generate
          the audio.
        </p>
      </div>

      {/* Script stats */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg">
          <span className="text-xs text-neutral-500">Words:</span>
          <span className="text-xs font-mono text-white">{wordCount}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded-lg">
          <span className="text-xs text-neutral-500">Est. Duration:</span>
          <span className="text-xs font-mono text-white">
            ~{estimatedDuration} min
          </span>
        </div>
      </div>

      {/* Script content */}
      <div className="w-full">
        <div className="relative rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-800/30">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
              Video Script
            </span>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
                  isEditing
                    ? "bg-orange-500 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }
              `}
            >
              <Edit3 className="w-3 h-3" />
              {isEditing ? "Editing" : "Edit"}
            </button>
          </div>

          {/* Script text */}
          {isEditing ? (
            <textarea
              value={script}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-72 p-4 bg-transparent text-white resize-none focus:outline-none text-sm leading-relaxed font-mono"
            />
          ) : (
            <div className="p-4 h-72 overflow-y-auto">
              <pre className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap font-mono">
                {script}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 w-full">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-[2] h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
        >
          <Check className="w-4 h-4" />
          Confirm & Generate Audio
        </Button>
      </div>
    </div>
  );
}
