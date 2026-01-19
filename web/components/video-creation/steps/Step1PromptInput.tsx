"use client";

import { useState } from "react";
import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step1PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function Step1PromptInput({
  value,
  onChange,
  onSubmit,
  isLocked,
  lockedMessage,
}: Step1PromptInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isLocked && !isSubmitting) {
      console.log("Step1PromptInput: handleSubmit called");
      setIsSubmitting(true);
      try {
        await onSubmit();
      } catch (error) {
        console.error("Step1PromptInput: onSubmit error:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const suggestions = [
    "How AI is changing the future of work",
    "5 productivity hacks for remote workers",
    "The science behind habit formation",
    "Beginner's guide to investing",
  ];

  return (
    <div className="flex flex-col items-center gap-8 pt-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold tracking-tight">
          What's your video about?
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Enter your video idea and our AI will expand it into a complete
          concept.
        </p>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <div
          className={`
            relative rounded-xl border-2 transition-all duration-300
            ${
              isLocked
                ? "border-neutral-800 bg-neutral-900/50 opacity-50 cursor-not-allowed"
                : isFocused
                  ? "border-orange-500 bg-orange-500/5"
                  : "border-neutral-800 bg-neutral-900/50"
            }
          `}
        >
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isLocked || isSubmitting}
            placeholder="Describe your video idea..."
            className="w-full h-32 p-4 bg-transparent text-white placeholder:text-neutral-600 resize-none focus:outline-none text-lg"
          />

          {/* Character count */}
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-neutral-600">
            {value.length} / 500
          </div>
        </div>

        {/* Suggestions */}
        {!isLocked && !isSubmitting && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-600 font-mono uppercase tracking-wider">
              Need inspiration? Try these:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onChange(suggestion)}
                  className="px-3 py-1.5 bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 hover:text-white transition-all duration-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          disabled={!value.trim() || isLocked || isSubmitting}
          className={`
            w-full h-12 text-white font-bold uppercase tracking-widest transition-all duration-300 gap-2
            ${
              isLocked || isSubmitting
                ? "bg-neutral-800 border border-neutral-700 text-neutral-500 cursor-not-allowed opacity-100"
                : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            }
          `}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Video...
            </>
          ) : isLocked ? (
            <span className="font-mono text-xs">{lockedMessage}</span>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Generate Idea
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
