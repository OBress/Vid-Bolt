"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EncryptedChatCard() {
  return (
    <Card className="bg-neutral-900 border-neutral-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-neutral-300 tracking-wider">
          ENCRYPTED CHAT ACTIVITY
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        {/* Wireframe Sphere */}
        <div className="relative w-32 h-32 mb-4">
          <div className="absolute inset-0 border-2 border-white rounded-full opacity-60 animate-pulse"></div>
          <div className="absolute inset-2 border border-white rounded-full opacity-40"></div>
          <div className="absolute inset-4 border border-white rounded-full opacity-20"></div>
          {/* Grid lines */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-white opacity-30"></div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-white opacity-30"></div>
          </div>
        </div>

        <div className="text-xs text-neutral-500 space-y-1 w-full font-mono">
          <div className="flex justify-between">
            <span># 2025-06-17 14:23 UTC</span>
          </div>
          <div className="text-white">
            {"> [AGT:gh0stfire] ::: INIT >> ^^^ loading secure channel"}
          </div>
          <div className="text-orange-500">
            {"> CH#2 | 1231.9082464.500...xR3"}
          </div>
          <div className="text-white">{"> KEY LOCKED"}</div>
          <div className="text-neutral-400">
            {
              '> MSG >> "...mission override initiated... awaiting delta node clearance"'
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
