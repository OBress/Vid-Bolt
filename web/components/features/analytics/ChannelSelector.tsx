"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Layers } from "lucide-react";

export interface ChannelOption {
  id: string;
  channel_title: string;
  channel_handle?: string | null;
  thumbnail_url?: string | null;
  subscriber_count?: number;
}

interface ChannelSelectorProps {
  channels: ChannelOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Show "All Channels" aggregate option. Default: true */
  showAll?: boolean;
}

function formatSubs(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ChannelSelector({
  channels,
  selectedId,
  onSelect,
  showAll = true,
}: ChannelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Don't render if only 1 channel and no "All" option
  if (channels.length <= 1 && !showAll) return null;

  const selected = selectedId
    ? channels.find((c) => c.id === selectedId)
    : null;

  const displayLabel = selected
    ? selected.channel_title
    : "All Channels";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/40 bg-card/50 text-sm font-medium hover:bg-card/80 transition-colors backdrop-blur-sm min-w-[180px]"
      >
        {selected?.thumbnail_url ? (
          <img
            src={selected.thumbnail_url}
            alt=""
            className="w-5 h-5 rounded-full shrink-0"
          />
        ) : (
          <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="truncate max-w-[160px]">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-xl border border-border/40 bg-card shadow-xl backdrop-blur-md z-50 overflow-hidden">
          {/* All Channels option */}
          {showAll && (
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                !selectedId ? "bg-primary/10" : ""
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Layers className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="text-left min-w-0">
                <div className="font-medium">All Channels</div>
                <div className="text-[10px] text-muted-foreground">
                  Aggregate across {channels.length} channels
                </div>
              </div>
              {!selectedId && (
                <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
              )}
            </button>
          )}

          {showAll && channels.length > 0 && (
            <div className="h-px bg-border/30" />
          )}

          {/* Individual channels */}
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                onSelect(ch.id);
                setOpen(false);
              }}
              className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                selectedId === ch.id ? "bg-primary/10" : ""
              }`}
            >
              {ch.thumbnail_url ? (
                <img
                  src={ch.thumbnail_url}
                  alt=""
                  className="w-7 h-7 rounded-full border border-border/30 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-muted/50 shrink-0" />
              )}
              <div className="text-left min-w-0">
                <div className="font-medium truncate">{ch.channel_title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ch.channel_handle ? `@${ch.channel_handle}` : ""}
                  {ch.subscriber_count
                    ? `${ch.channel_handle ? " · " : ""}${formatSubs(ch.subscriber_count)} subs`
                    : ""}
                </div>
              </div>
              {selectedId === ch.id && (
                <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
