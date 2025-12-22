"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  Settings2,
  ScrollText,
  MessageSquarePlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type View = "main" | "seed-prompts" | "advanced";

export function ScriptTab({ projectId }: { projectId?: string }) {
  const [view, setView] = useState<View>("main");
  const [pov, setPov] = useState<string>("1st");
  const [gender, setGender] = useState<string>("Any");

  if (view === "seed-prompts") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView("main")}
          className="text-neutral-400 hover:text-white gap-2 px-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Script Settings
        </Button>
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <MessageSquarePlus className="w-12 h-12 text-neutral-700 mx-auto" />
            <h3 className="text-lg font-bold text-neutral-400">
              Seed Prompts Placeholder
            </h3>
            <p className="text-neutral-500 max-w-xs mx-auto">
              This page will allow you to manage seed prompts for your scripts.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "advanced") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView("main")}
          className="text-neutral-400 hover:text-white gap-2 px-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Script Settings
        </Button>
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Settings2 className="w-12 h-12 text-neutral-700 mx-auto" />
            <h3 className="text-lg font-bold text-neutral-400">
              Advanced Settings Placeholder
            </h3>
            <p className="text-neutral-500 max-w-xs mx-auto">
              This page will contain advanced configuration for script
              generation.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        {/* Core Configuration */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ScrollText className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Core Configuration
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Point of View */}
            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Point of View
              </Label>
              <div className="flex flex-wrap gap-2">
                {["1st", "2nd", "3rd"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setPov(option)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all border",
                      pov === option
                        ? "bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)] scale-105"
                        : "bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                    )}
                  >
                    {option} Person
                  </button>
                ))}
              </div>
            </div>

            {/* Protagonist Gender */}
            <div className="space-y-4">
              <Label className="text-xs text-neutral-400 uppercase font-bold tracking-wider">
                Protagonist Gender
              </Label>
              <div className="flex flex-wrap gap-2">
                {["Male", "Female", "Any"].map((option) => (
                  <button
                    key={option}
                    onClick={() => setGender(option)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all border",
                      gender === option
                        ? "bg-orange-500 border-orange-400 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)] scale-105"
                        : "bg-black/40 border-neutral-800 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation & Advanced */}
        <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Settings2 className="text-orange-500 w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-neutral-200">
                Additional Settings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <button
              onClick={() => setView("seed-prompts")}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-neutral-800 hover:border-orange-500/50 hover:bg-neutral-900/60 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:bg-orange-500 group-hover:text-white transition-all">
                  <MessageSquarePlus className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
                    Seed Prompts
                  </div>
                  <div className="text-xs text-neutral-500">
                    Configure base instructions for AI
                  </div>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-neutral-700 rotate-180 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
            </button>

            <button
              onClick={() => setView("advanced")}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-neutral-800 hover:border-orange-500/50 hover:bg-neutral-900/60 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:bg-orange-500 group-hover:border-orange-400 group-hover:text-white transition-all">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
                    Advanced Settings
                  </div>
                  <div className="text-xs text-neutral-500">
                    Fine-tune script generation parameters
                  </div>
                </div>
              </div>
              <ArrowLeft className="w-5 h-5 text-neutral-700 rotate-180 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
