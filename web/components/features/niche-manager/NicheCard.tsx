"use client";

import React from "react";
import { Globe, MoreVertical } from "lucide-react";

interface NicheCardProps {
  title: string;
  description: string;
  model: string;
  client: string;
  prompts: number;
  isGlobal?: boolean;
}

export const NicheCard: React.FC<NicheCardProps> = ({
  title,
  description,
  model,
  client,
  prompts,
  isGlobal,
}) => {
  return (
    <div className="group relative bg-neutral-950/40 border border-neutral-800/50 rounded-2xl p-6 transition-all duration-300 hover:bg-neutral-900/60 hover:border-neutral-700/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-white group-hover:text-orange-500 transition-colors">
          {title}
        </h3>
        <button className="text-neutral-500 hover:text-white transition-colors">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      <p className="text-neutral-400 text-sm mb-6 line-clamp-2 leading-relaxed">
        {description}
      </p>

      <div className="space-y-2">
        <div className="flex items-center text-xs">
          <span className="w-16 text-neutral-500 font-medium">Model:</span>
          <span className="text-neutral-300 font-mono bg-neutral-800/50 px-2 py-0.5 rounded border border-neutral-700/30 truncate">
            {model}
          </span>
        </div>
        <div className="flex items-center text-xs">
          <span className="w-16 text-neutral-500 font-medium">Client:</span>
          <span className="text-neutral-300 font-mono bg-neutral-800/50 px-2 py-0.5 rounded border border-neutral-700/30 truncate">
            {client}
          </span>
        </div>
        <div className="flex items-center text-xs">
          <span className="w-16 text-neutral-500 font-medium">Prompts:</span>
          <span className="text-orange-500 font-mono px-2 py-0.5">
            {prompts}
          </span>
        </div>
      </div>

      {isGlobal && (
        <div className="mt-6 flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <Globe className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
              Global Niche
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
