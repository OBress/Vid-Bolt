"use client";

import { User, MapPin, Box } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntityType = "character" | "location" | "object";

interface EntityBadgeProps {
  type: EntityType;
  name: string;
  image?: string;
  className?: string;
}

const TYPE_STYLES: Record<EntityType, { bg: string; icon: typeof User }> = {
  character: { bg: "bg-amber-900/40 border-amber-700/50", icon: User },
  location: { bg: "bg-teal-900/40 border-teal-700/50", icon: MapPin },
  object: { bg: "bg-slate-800/60 border-slate-600/50", icon: Box },
};

export function EntityBadge({
  type,
  name,
  image,
  className,
}: EntityBadgeProps) {
  const { bg, icon: Icon } = TYPE_STYLES[type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-sm font-medium",
        bg,
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          className="w-4 h-4 rounded-full object-cover"
        />
      ) : (
        <Icon className="w-3.5 h-3.5 opacity-70" />
      )}
      <span className="text-neutral-200">{name}</span>
    </span>
  );
}
