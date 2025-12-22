"use client";

import React from "react";
import { Plus, Globe } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { NicheCard } from "@/components/features/niche-manager/NicheCard";

const CUSTOM_NICHES = [
  {
    id: "1",
    title: "Folklore Horror",
    description: "Horror stories focusing on folklore type protagonists.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 24,
  },
  {
    id: "2",
    title: "BL Stories 1",
    description: "BL Stories focusing on romantic and dramatic narratives.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 10,
  },
  {
    id: "3",
    title: "Horror Ocean",
    description:
      "Horror stories focusing on things happening in or above the oceans.",
    model: "anthropic/claude-sonnet-4.5",
    client: "openrouter",
    prompts: 25,
  },
];

const GLOBAL_NICHES = [
  {
    id: "g1",
    title: "Horror (strange rules)",
    description:
      "Horror stories featuring bizarre rules that characters must follow to survive.",
    model: "ft:gpt-4o-2024-08-06:personal:horror-ideas2:AJPp...",
    client: "openai",
    prompts: 36,
    isGlobal: true,
  },
  {
    id: "g2",
    title: "Horror",
    description:
      "Standard horror stories featuring supernatural elements and scary situations.",
    model: "ft:gpt-4o-2024-08-06:personal:horror-ideas2:AJPp...",
    client: "openai",
    prompts: 17,
    isGlobal: true,
  },
];

export default function NicheManagerPage() {
  return (
    <div className="flex flex-col h-full bg-neutral-900/50 text-white overflow-hidden">
      <PageHeader title="Niche Manager">
        <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition-all shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95">
          <Plus className="w-4 h-4" />
          Create New Niche
        </button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-8 pb-20">
        <div className="space-y-1">
          <p className="text-neutral-500 text-sm font-medium">
            Create and manage AI content generation niches with custom prompts
          </p>
        </div>

        {/* Custom Niches Section */}
        <section className="bg-black/20 border border-neutral-800/50 rounded-3xl p-8 space-y-8 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Your Custom Niches
              </h2>
              <p className="text-sm text-neutral-500">
                Niches you've created for your channels
              </p>
            </div>
            <div className="px-4 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-400 uppercase tracking-widest shadow-inner">
              {CUSTOM_NICHES.length}{" "}
              {CUSTOM_NICHES.length === 1 ? "niche" : "niches"}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {CUSTOM_NICHES.map((niche) => (
              <NicheCard key={niche.id} {...niche} />
            ))}
          </div>
        </section>

        {/* Global Niches Section */}
        <section className="bg-black/20 border border-neutral-800/50 rounded-3xl p-8 space-y-8 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Global Niches
                </h2>
              </div>
              <p className="text-sm text-neutral-500">
                System-managed niches available to all users. Duplicate to
                customize.
              </p>
            </div>
            <div className="px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-bold text-purple-400 uppercase tracking-widest shadow-inner">
              {GLOBAL_NICHES.length}{" "}
              {GLOBAL_NICHES.length === 1 ? "niche" : "niches"}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {GLOBAL_NICHES.map((niche) => (
              <NicheCard key={niche.id} {...niche} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
