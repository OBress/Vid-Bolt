"use client";

import { useEffect, useState } from "react";
import { X, Zap, Layers, Sparkles, ChevronRight } from "lucide-react";

interface VideoCreationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VideoCreationOverlay({
  isOpen,
  onClose,
}: VideoCreationOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setLoadingPhase(0);

      // Simulate loading phases for the game-like effect
      const phase1 = setTimeout(() => setLoadingPhase(1), 300);
      const phase2 = setTimeout(() => setLoadingPhase(2), 600);
      const phase3 = setTimeout(() => setLoadingPhase(3), 900);

      return () => {
        clearTimeout(phase1);
        clearTimeout(phase2);
        clearTimeout(phase3);
      };
    } else {
      const timer = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!mounted && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop with animated grid */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl">
        {/* Animated grid background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(249, 115, 22, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(249, 115, 22, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
            animation: "gridMove 20s linear infinite",
          }}
        />

        {/* Radial glow effect */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.15) 0%, transparent 60%)",
          }}
        />

        {/* Scan lines effect */}
        <div
          className="absolute inset-0 pointer-events-none opacity-5"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
          }}
        />
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 p-3 rounded-full bg-neutral-900/80 border border-neutral-700 hover:border-orange-500 hover:bg-neutral-800 transition-all duration-300 group"
      >
        <X className="w-6 h-6 text-neutral-400 group-hover:text-orange-500 transition-colors" />
      </button>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-12 px-8">
        {/* Logo / Title Section */}
        <div
          className={`text-center transition-all duration-700 ${
            loadingPhase >= 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <div className="relative inline-block mb-6">
            {/* Glowing orb behind text */}
            <div className="absolute -inset-8 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -inset-4 bg-orange-500/10 rounded-full blur-xl" />

            <h1 className="relative text-6xl md:text-7xl font-black uppercase tracking-tighter">
              <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
                CREATE
              </span>
            </h1>
          </div>

          <p className="text-neutral-500 text-sm md:text-base font-mono tracking-widest uppercase">
            Initialize New Video Project
          </p>
        </div>

        {/* Loading indicators */}
        <div
          className={`flex items-center gap-8 transition-all duration-700 delay-100 ${
            loadingPhase >= 2
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          {[
            { icon: Layers, label: "Systems", status: loadingPhase >= 2 },
            { icon: Zap, label: "Engine", status: loadingPhase >= 2 },
            { icon: Sparkles, label: "AI Ready", status: loadingPhase >= 3 },
          ].map(({ icon: Icon, label, status }, i) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div
                className={`relative p-4 rounded-xl border transition-all duration-500 ${
                  status
                    ? "bg-orange-500/10 border-orange-500/50"
                    : "bg-neutral-900/50 border-neutral-800"
                }`}
              >
                <Icon
                  className={`w-6 h-6 transition-colors duration-300 ${
                    status ? "text-orange-500" : "text-neutral-600"
                  }`}
                />
                {status && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
              </div>
              <span
                className={`text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  status ? "text-orange-500" : "text-neutral-600"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div
          className={`flex flex-col items-center gap-4 transition-all duration-700 delay-200 ${
            loadingPhase >= 3
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          <button className="group relative px-12 py-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg font-bold uppercase tracking-widest text-sm text-white hover:from-orange-400 hover:to-orange-500 transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40">
            <span className="flex items-center gap-3">
              Start Creating
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>

            {/* Button glow effect */}
            <div className="absolute inset-0 rounded-lg bg-orange-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          <p className="text-neutral-600 text-xs font-mono">
            Press{" "}
            <kbd className="px-2 py-0.5 bg-neutral-800 rounded text-neutral-400 mx-1">
              ESC
            </kbd>{" "}
            to cancel
          </p>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/4 left-1/4 w-1 h-32 bg-gradient-to-b from-orange-500/50 to-transparent rotate-45 blur-sm" />
        <div className="absolute bottom-1/4 right-1/4 w-1 h-32 bg-gradient-to-t from-orange-500/50 to-transparent -rotate-45 blur-sm" />
      </div>

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-orange-500/30" />
      <div className="absolute top-0 right-0 w-32 h-32 border-r-2 border-t-2 border-orange-500/30" />
      <div className="absolute bottom-0 left-0 w-32 h-32 border-l-2 border-b-2 border-orange-500/30" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-orange-500/30" />

      {/* CSS for grid animation */}
      <style jsx>{`
        @keyframes gridMove {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(50px, 50px);
          }
        }
      `}</style>
    </div>
  );
}
