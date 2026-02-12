"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Star,
  Loader2,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: {
    promptPer1M: number;
    completionPer1M: number;
  };
  description?: string;
}

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  favoriteModels: string[];
  onToggleFavorite: (modelId: string) => void;
}

// Provider icons/colors
const PROVIDERS: Record<
  string,
  { name: string; color: string; icon?: string }
> = {
  openai: { name: "OpenAI", color: "text-green-400" },
  anthropic: { name: "Anthropic", color: "text-orange-400" },
  google: { name: "Google", color: "text-blue-400" },
  meta: { name: "Meta", color: "text-blue-500" },
  mistral: { name: "Mistral", color: "text-purple-400" },
  cohere: { name: "Cohere", color: "text-pink-400" },
  "x-ai": { name: "xAI", color: "text-white" },
  deepseek: { name: "DeepSeek", color: "text-cyan-400" },
};

function getProvider(modelId: string): string {
  const parts = modelId.split("/");
  return parts[0] || "other";
}

function formatPrice(price: number): string {
  if (price === 0) return "Free";
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

function formatContext(context: number): string {
  if (context >= 1000000) return `${(context / 1000000).toFixed(1)}M`;
  if (context >= 1000) return `${(context / 1000).toFixed(0)}K`;
  return context.toString();
}

export function ModelSelector({
  open,
  onOpenChange,
  selectedModel,
  onSelectModel,
  favoriteModels,
  onToggleFavorite,
}: ModelSelectorProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Fetch models
  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/openrouter/models");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch models");
        return;
      }

      setModels(data.models || []);
    } catch (_err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && models.length === 0) {
      fetchModels();
    }
  }, [open]);

  // Get unique providers with counts
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    models.forEach((m) => {
      const provider = getProvider(m.id);
      counts[provider] = (counts[provider] || 0) + 1;
    });
    return counts;
  }, [models]);

  // Filter models
  const filteredModels = useMemo(() => {
    let result = models;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(searchLower) ||
          m.id.toLowerCase().includes(searchLower)
      );
    }

    // Provider filter
    if (activeFilter === "favorites") {
      result = result.filter((m) => favoriteModels.includes(m.id));
    } else if (activeFilter !== "all") {
      result = result.filter((m) => getProvider(m.id) === activeFilter);
    }

    // Sort: favorites first, then by name
    result = [...result].sort((a, b) => {
      const aFav = favoriteModels.includes(a.id);
      const bFav = favoriteModels.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [models, search, activeFilter, favoriteModels]);

  // Provider tabs - only show specific providers
  const providerTabs = useMemo(() => {
    const allowedProviders = ["openai", "google", "anthropic"];
    const tabs = [
      { id: "favorites", label: "Favorites", count: favoriteModels.length },
    ];

    // Add only the allowed providers (in order)
    allowedProviders.forEach((provider) => {
      const info = PROVIDERS[provider];
      const count = providerCounts[provider] || 0;
      if (count > 0) {
        tabs.push({
          id: provider,
          label: info?.name || provider,
          count,
        });
      }
    });

    return tabs;
  }, [providerCounts, favoriteModels.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 bg-neutral-950 border-neutral-800 overflow-hidden flex flex-col">
        <DialogHeader className="p-5 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                Select AI Model
              </DialogTitle>
              <p className="text-xs text-neutral-500 mt-1">
                Choose a model for script generation
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchModels}
              disabled={loading}
              className="text-neutral-400 hover:text-white"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-5 pt-3 flex-shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <Input
              placeholder="Search models..."
              className="bg-neutral-900 border-neutral-800 pl-10 h-10 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Provider Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setActiveFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                activeFilter === "all"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                  : "text-neutral-500 hover:text-white hover:bg-neutral-800"
              )}
            >
              All ({models.length})
            </button>
            {providerTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5",
                  activeFilter === tab.id
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "text-neutral-500 hover:text-white hover:bg-neutral-800"
                )}
              >
                {tab.id === "favorites" && <Star className="w-3 h-3" />}
                {tab.label}
                <span className="text-neutral-600">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model List */}
        <div className="flex-1 overflow-hidden px-5 py-3">
          <ScrollArea className="h-full">
            {error ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <p className="text-sm text-red-400 text-center max-w-sm">
                  {error}
                </p>
                <Button variant="outline" size="sm" onClick={fetchModels}>
                  Try Again
                </Button>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <p className="text-sm text-neutral-500">Loading models...</p>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <p className="text-sm text-neutral-500">No models found</p>
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {filteredModels.map((model) => {
                  const provider = getProvider(model.id);
                  const providerInfo = PROVIDERS[provider];
                  const isFavorite = favoriteModels.includes(model.id);
                  const isSelected = selectedModel === model.id;

                  return (
                    <div
                      key={model.id}
                      onClick={() => {
                        onSelectModel(model.id);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all",
                        isSelected
                          ? "border-orange-500 bg-orange-500/10"
                          : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Provider */}
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              providerInfo?.color || "text-neutral-400"
                            )}
                          >
                            {providerInfo?.name || provider}
                          </span>
                          {/* Model Name */}
                          <h3 className="text-sm font-semibold text-white truncate">
                            {model.name}
                          </h3>
                          <p className="text-[10px] text-neutral-600 font-mono truncate">
                            {model.id}
                          </p>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-800 text-[9px] font-medium text-neutral-400">
                              <Hash className="w-2 h-2" />
                              {formatContext(model.contextLength)}
                            </span>
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-500/10 text-[9px] font-medium text-green-400">
                              <DollarSign className="w-2 h-2" />
                              {formatPrice(model.pricing.promptPer1M)}/M in
                            </span>
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-[9px] font-medium text-blue-400">
                              <DollarSign className="w-2 h-2" />
                              {formatPrice(model.pricing.completionPer1M)}/M out
                            </span>
                          </div>
                        </div>

                        {/* Favorite Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(model.id);
                          }}
                          className={cn(
                            "p-1.5 rounded-md transition-colors flex-shrink-0",
                            isFavorite
                              ? "text-yellow-500 hover:bg-yellow-500/10"
                              : "text-neutral-700 hover:text-yellow-500 hover:bg-neutral-800"
                          )}
                        >
                          <Star
                            className={cn(
                              "w-4 h-4",
                              isFavorite && "fill-current"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-800 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-neutral-500">
            {filteredModels.length} of {models.length} models
          </p>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
