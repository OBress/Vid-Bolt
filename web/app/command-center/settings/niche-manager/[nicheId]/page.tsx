"use client";

import React, { use, useState } from "react";
import { ArrowLeft, Save, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ALL_NICHES } from "../data";

export default function NicheDetailPage({
  params,
}: {
  params: Promise<{ nicheId: string }>;
}) {
  const { nicheId } = use(params);
  const router = useRouter();

  // Find initial data
  const initialData = ALL_NICHES.find((n) => n.id === nicheId);

  // State for form fields
  // In a real app, this would be initialized possibly from a DB or via useEffect if data is fetched async
  const [formData, setFormData] = useState(
    initialData || {
      title: "",
      description: "",
      model: "",
      client: "",
      prompts: 0,
    }
  );

  if (!initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <p>Niche not found</p>
        <Link
          href="/command-center/settings/niche-manager"
          className="mt-4 text-emerald-500 hover:text-emerald-400"
        >
          Return to Niche Manager
        </Link>
      </div>
    );
  }

  const handleSave = () => {
    // TODO: Implement save logic
    console.log("Saving niche:", formData);
    router.push("/command-center/settings/niche-manager");
  };

  const handleDelete = () => {
    // TODO: Implement delete logic
    if (confirm("Are you sure you want to delete this niche?")) {
      console.log("Deleting niche:", nicheId);
      router.push("/command-center/settings/niche-manager");
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/50 text-white overflow-hidden">
      <PageHeader
        title={formData.title || "Edit Niche"}
        breadcrumbs={[
          {
            label: "Niche Manager",
            href: "/command-center/settings/niche-manager",
          },
          { label: formData.title || "Niche Details" },
        ]}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg font-bold text-sm transition-all border border-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-sm transition-all shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto px-6 py-4 pb-20">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Main Settings Section */}
          <section className="bg-black/20 border border-neutral-800/50 rounded-3xl p-8 space-y-6 backdrop-blur-sm">
            <h2 className="text-xl font-bold text-white tracking-tight border-b border-neutral-800/50 pb-4">
              General Settings
            </h2>

            <div className="grid gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-400">
                  Niche Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder:text-neutral-600"
                  placeholder="e.g. Folklore Horror"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-400">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                  className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder:text-neutral-600 resize-none"
                  placeholder="Describe the focus of this niche..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">
                    AI Model
                  </label>
                  <select
                    value={formData.model}
                    onChange={(e) =>
                      setFormData({ ...formData, model: e.target.value })
                    }
                    className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="anthropic/claude-sonnet-4.5">
                      Claude 3.5 Sonnet
                    </option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="openai/gpt-4-turbo">GPT-4 Turbo</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">
                    Client Provider
                  </label>
                  <select
                    value={formData.client}
                    onChange={(e) =>
                      setFormData({ ...formData, client: e.target.value })
                    }
                    className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all appearance-none cursor-pointer"
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI Direct</option>
                    <option value="anthropic">Anthropic Direct</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Prompts Placeholder */}
          <section className="bg-black/20 border border-neutral-800/50 rounded-3xl p-8 space-y-6 backdrop-blur-sm opacity-50 cursor-not-allowed relative overflow-hidden">
            <div className="absolute inset-0 bg-neutral-950/20 z-10 flex items-center justify-center">
              <div className="bg-neutral-900 border border-neutral-800 rounded-full px-4 py-1.5 text-xs font-medium text-neutral-400 shadow-lg">
                Coming Soon
              </div>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800/50 pb-4">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Prompt Templates
              </h2>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm transition-colors">
                <Plus className="w-4 h-4" />
                Add Prompt
              </button>
            </div>

            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-neutral-900/30 border border-neutral-800/50 rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="h-4 w-32 bg-neutral-800 rounded"></div>
                    <div className="h-3 w-48 bg-neutral-800/50 rounded"></div>
                  </div>
                  <div className="h-8 w-8 bg-neutral-800 rounded"></div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
