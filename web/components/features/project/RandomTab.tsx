"use client";

import { Hash } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RandomTab() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-6 text-center">
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-red-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative p-6 bg-black rounded-full border border-neutral-800">
          <Hash className="w-12 h-12 text-orange-500 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-bold tracking-widest uppercase">
          Seed Generator
        </h3>
        <p className="text-xs text-neutral-500 max-w-[240px]">
          Initialize a new randomized project environment based on unique
          entropy seeds.
        </p>
      </div>
      <Button
        variant="outline"
        className="border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 uppercase tracking-widest text-[10px] font-bold"
      >
        Generate New Seed
      </Button>
    </div>
  );
}
