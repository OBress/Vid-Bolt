"use client";

import React from "react";
import { ApiKeysTab } from "@/components/features/settings/ApiKeysTab";

export default function ApiKeysPage() {
  return (
    <div className="flex flex-col h-full bg-black text-white">
      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
            <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
              API Infrastructure
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 lg:p-10 max-h-[calc(100vh-80px)]">
          <ApiKeysTab />
        </div>
      </div>
    </div>
  );
}
