"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Scissors } from "lucide-react";

export function EditingTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <Card className="bg-neutral-900/40 border-neutral-800 backdrop-blur-sm border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-full bg-neutral-800/50 flex items-center justify-center mb-4">
            <Scissors className="text-neutral-600 w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-neutral-300 mb-2 uppercase tracking-tighter">
            Editing Parameters
          </h3>
          <p className="text-sm text-neutral-500 max-w-sm">
            Advanced editing rules and template configurations will be available
            here soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
