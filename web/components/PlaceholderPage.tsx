"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-orange-500 text-sm font-bold tracking-widest uppercase">
            System Implementation Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mb-4 border border-neutral-700">
              <span className="text-2xl text-orange-500">?</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Module Offline
            </h3>
            <p className="text-neutral-500 max-w-md">
              This tactical module is currently under development. Detailed
              analytics and control systems will be integrated in the next
              update cycle.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
