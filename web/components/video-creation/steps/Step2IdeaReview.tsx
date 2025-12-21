"use client";

import { useState } from "react";
import { ArrowLeft, Check, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step2IdeaReviewProps {
  expandedIdea: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function Step2IdeaReview({
  expandedIdea,
  onChange,
  onConfirm,
  onBack,
  isLocked,
  lockedMessage,
}: Step2IdeaReviewProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
          <Edit3 className="w-3 h-3" />
          Step 3 of 10
        </div>
        <h2 className="text-3xl font-bold tracking-tight">
          Review Your Concept
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          The AI has expanded your idea. Review and edit before we write the
          full script.
        </p>
      </div>

      {/* Content area */}
      <div className="w-full">
        <div className="relative rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden">
          {/* Edit toggle */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-800/30">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
              Expanded Concept
            </span>
            {!isLocked && (
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
            )}
          </div>

          {/* Text content */}
          {isEditing ? (
            <textarea
              value={expandedIdea}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-64 p-4 bg-transparent text-white resize-none focus:outline-none text-sm leading-relaxed"
            />
          ) : (
            <div
              className={`p-4 h-64 overflow-y-auto ${
                isLocked ? "opacity-50" : ""
              }`}
            >
              <pre className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap font-sans">
                {expandedIdea}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 w-full">
        {isLocked ? (
          <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
            {lockedMessage}
          </div>
        ) : (
          <>
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
              Confirm & Write Script
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
