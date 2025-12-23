"use client";

export function AnalyticsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mb-2">
        <span className="text-2xl text-orange-500/50">📊</span>
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-bold tracking-widest uppercase text-neutral-400">
          Analytics System Pending
        </h3>
        <p className="text-xs text-neutral-500 font-mono tracking-tighter max-w-xs">
          STREAMS ARE CURRENTLY OFFLINE. DATA AGGREGATION AND PERFORMANCE
          METRICS WILL BE INITIALIZED IN A FUTURE UPDATE.
        </p>
      </div>
    </div>
  );
}
