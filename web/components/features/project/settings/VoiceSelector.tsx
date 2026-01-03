"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Check,
  ChevronsUpDown,
  Star,
  Loader2,
  Mic,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUserSettings } from "@/hooks/use-user-settings";
import { listInworldVoicesAction } from "@/app/actions/inworld-actions";
import { InworldVoice } from "@/lib/services/inworld-tts";

interface VoiceSelectorProps {
  selectedVoiceId: string;
  onSelect: (voiceId: string) => void;
  provider: "inworld" | "elevenlabs" | "genai";
  staticVoices?: { id: string; label: string }[]; // Fallback/Legacy voices
  disabled?: boolean;
}

export function VoiceSelector({
  selectedVoiceId,
  onSelect,
  provider,
  staticVoices = [],
  disabled = false,
}: VoiceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<InworldVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { userId, settings: userSettings, updateSettings } = useUserSettings();

  const favorites = useMemo(
    () => new Set(userSettings.favorite_voices || []),
    [userSettings.favorite_voices]
  );

  // Fetch voices if Inworld and user is logged in
  useEffect(() => {
    if (provider !== "inworld" || !userId || !open) return;

    // Simple cache: if we have voices, don't refetch
    if (voices.length > 0) return;

    let mounted = true;

    async function fetchVoices() {
      setLoading(true);
      try {
        const { voices: fetched, error } = await listInworldVoicesAction(
          userId!
        );
        if (mounted) {
          if (fetched) setVoices(fetched);
          if (error) console.error("Server action error:", error);
        }
      } catch (err) {
        console.error("Failed to fetch voices", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchVoices();

    return () => {
      mounted = false;
    };
  }, [provider, userId, open, voices.length]);

  const toggleFavorite = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    const newFavorites = new Set(favorites);
    if (newFavorites.has(voiceId)) {
      newFavorites.delete(voiceId);
    } else {
      newFavorites.add(voiceId);
    }
    await updateSettings({ favorite_voices: Array.from(newFavorites) });
  };

  const selectedInworldVoice = voices.find((v) => v.name === selectedVoiceId);
  const selectedStaticVoice = staticVoices.find(
    (v) => v.id === selectedVoiceId
  );

  const displayLabel =
    provider === "inworld"
      ? selectedInworldVoice?.name || selectedVoiceId
      : selectedStaticVoice?.label || selectedVoiceId;

  const isDynamic = provider === "inworld";

  // Filter and Group Logic
  const filteredAndGrouped = useMemo(() => {
    // 1. Static Mode
    if (!isDynamic) {
      let filteredStatic = staticVoices;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredStatic = staticVoices.filter(
          (v) =>
            v.label.toLowerCase().includes(q) || v.id.toLowerCase().includes(q)
        );
      }
      return { favorites: [], others: filteredStatic, isStatic: true };
    }

    // 2. Dynamic Mode (Inworld)
    let filtered = voices;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = voices.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.voiceMetadata.gender.toLowerCase().includes(q) ||
          v.voiceMetadata.accent.toLowerCase().includes(q)
      );
    }

    const favs: InworldVoice[] = [];
    const others: InworldVoice[] = [];

    filtered.forEach((v) => {
      if (favorites.has(v.name)) {
        favs.push(v);
      } else {
        others.push(v);
      }
    });

    return { favorites: favs, others, isStatic: false };
  }, [voices, staticVoices, favorites, isDynamic, searchQuery]);

  // Focus input on open
  // We can use the 'autoFocus' prop on Input, but sometimes in Popovers it's tricky.
  // shadcn Popover usually handles focus trap.

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setSearchQuery(""); // Reset search on close
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-black/40 border-neutral-800 h-12 focus:border-orange-500/50 hover:bg-neutral-900/60 transition-colors"
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            {isDynamic && <Mic className="w-4 h-4 text-neutral-500" />}
            <span className="truncate">
              {displayLabel || "Select voice..."}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0 bg-neutral-900 border-neutral-800 overflow-hidden"
        align="start"
      >
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="flex items-center border-b border-neutral-800 px-3 py-2">
            <Search className="w-4 h-4 text-neutral-500 mr-2 shrink-0" />
            <Input
              placeholder="Search voices..."
              className="border-0 bg-transparent h-8 p-0 focus-visible:ring-0 placeholder:text-neutral-500 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="ml-2">
                <X className="w-4 h-4 text-neutral-500 hover:text-white" />
              </button>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            {loading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="ml-2 text-xs text-neutral-500">
                  Loading voices...
                </span>
              </div>
            )}

            {!loading && (
              <div className="p-1">
                {/* Empty State */}
                {filteredAndGrouped.others.length === 0 &&
                  filteredAndGrouped.favorites.length === 0 && (
                    <div className="py-6 text-center text-sm text-neutral-500">
                      No voices found.
                    </div>
                  )}

                {/* Dynamic Content */}
                {!filteredAndGrouped.isStatic && (
                  <>
                    {filteredAndGrouped.favorites.length > 0 && (
                      <div className="mb-2">
                        <h4 className="px-2 py-1.5 text-xs font-medium text-neutral-500">
                          Favorites
                        </h4>
                        {filteredAndGrouped.favorites.map((voice) => (
                          <VoiceOption
                            key={(voice as InworldVoice).name}
                            voice={voice as InworldVoice}
                            isSelected={
                              selectedVoiceId === (voice as InworldVoice).name
                            }
                            isFavorite={true}
                            onSelect={() => {
                              onSelect((voice as InworldVoice).name);
                              setOpen(false);
                            }}
                            onToggleFavorite={(e) =>
                              toggleFavorite(e, (voice as InworldVoice).name)
                            }
                          />
                        ))}
                      </div>
                    )}

                    {filteredAndGrouped.others.length > 0 && (
                      <div>
                        <h4 className="px-2 py-1.5 text-xs font-medium text-neutral-500">
                          All Voices
                        </h4>
                        {filteredAndGrouped.others.map((voice) => (
                          <VoiceOption
                            key={(voice as InworldVoice).name}
                            voice={voice as InworldVoice}
                            isSelected={
                              selectedVoiceId === (voice as InworldVoice).name
                            }
                            isFavorite={false}
                            onSelect={() => {
                              onSelect((voice as InworldVoice).name);
                              setOpen(false);
                            }}
                            onToggleFavorite={(e) =>
                              toggleFavorite(e, (voice as InworldVoice).name)
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Static Content */}
                {filteredAndGrouped.isStatic && (
                  <div>
                    {filteredAndGrouped.others.map((voice: any) => (
                      <div
                        key={voice.id}
                        onClick={() => {
                          onSelect(voice.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between px-2 py-2 rounded-sm cursor-pointer text-sm hover:bg-neutral-800 transition-colors",
                          selectedVoiceId === voice.id &&
                            "bg-neutral-800 text-orange-500"
                        )}
                      >
                        <span className="font-medium">{voice.label}</span>
                        {selectedVoiceId === voice.id && (
                          <Check className="w-4 h-4 ml-2" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VoiceOption({
  voice,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  voice: InworldVoice;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between p-2 rounded-sm cursor-pointer group hover:bg-neutral-800 transition-colors",
        isSelected && "bg-neutral-800"
      )}
    >
      <div className="flex flex-col gap-1 overflow-hidden min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium truncate",
              isSelected ? "text-orange-500" : "text-white"
            )}
          >
            {voice.name}
          </span>
          {voice.languageCodes.includes("en-US") ? null : (
            <Badge
              variant="outline"
              className="text-[9px] h-4 px-1 border-neutral-700 shrink-0"
            >
              {voice.languageCodes[0]}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
          <span className="bg-neutral-800/50 px-1 py-0.5 rounded text-neutral-400">
            {voice.voiceMetadata.gender}
          </span>
          <span className="bg-neutral-800/50 px-1 py-0.5 rounded text-neutral-400">
            {voice.voiceMetadata.age.replace("AGE_", "")}
          </span>
          {voice.voiceMetadata.accent !== "ACCENT_UNSPECIFIED" && (
            <span className="bg-neutral-800/50 px-1 py-0.5 rounded text-neutral-400">
              {voice.voiceMetadata.accent.replace("ACCENT_", "")}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-2">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 transition-colors shrink-0",
            isFavorite
              ? "text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10"
              : "text-neutral-600 hover:text-neutral-400 hover:bg-neutral-700/50 opacity-0 group-hover:opacity-100"
          )}
          onClick={onToggleFavorite}
        >
          <Star className={cn("w-3.5 h-3.5", isFavorite && "fill-current")} />
        </Button>
      </div>
    </div>
  );
}
