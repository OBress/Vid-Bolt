"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ApiKeyInputProps {
  label: string;
  value: string;
  onSave: (value: string) => Promise<boolean>;
  tooltip?: string;
  placeholder?: string;
}

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";

export default function ApiKeyInput({
  label,
  value,
  onSave,
  placeholder = "Enter API key...",
  tooltip,
}: ApiKeyInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isVisible, setIsVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const initialValueRef = useRef(value);

  useEffect(() => {
    setInputValue(value || "");
    initialValueRef.current = value || "";
  }, [value]);

  const handleSave = async () => {
    if (inputValue === initialValueRef.current) return;

    setStatus("saving");
    try {
      const success = await onSave(inputValue);
      if (success) {
        setStatus("success");
        initialValueRef.current = inputValue;
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Save error:", error);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-full">
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-400">{label}</label>
          {tooltip && (
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <CircleHelp
                    size={14}
                    className="text-slate-500 hover:text-slate-300 cursor-help transition-colors"
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-neutral-900 border-neutral-800 text-slate-300 max-w-[250px]"
                >
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <AnimatePresence>
          {status === "success" && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded"
            >
              Saved
            </motion.span>
          )}
          {status === "error" && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded"
            >
              Failed
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="relative flex items-center group">
        <input
          type={isVisible ? "text" : "password"}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "w-full bg-slate-900/40 border border-slate-800 rounded-xl py-3 pl-4 pr-24 outline-none focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/5 transition-all text-slate-200 placeholder:text-slate-600 font-mono text-sm",
            status === "error" &&
              "border-red-500/40 focus:border-red-500/40 focus:ring-red-500/5",
            status === "success" &&
              "border-emerald-500/40 focus:border-emerald-500/40 focus:ring-emerald-500/5",
          )}
        />

        <div className="absolute right-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all rounded-lg"
            title={isVisible ? "Hide API key" : "Show API key"}
          >
            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>

          <div className="w-6 flex justify-center">
            <AnimatePresence mode="wait">
              {status === "saving" && (
                <motion.div
                  key="saving"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Loader2
                    className="animate-spin text-blue-500/70"
                    size={16}
                  />
                </motion.div>
              )}
              {status === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <Check className="text-emerald-500" size={18} />
                </motion.div>
              )}
              {status === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                >
                  <X className="text-red-500" size={18} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
