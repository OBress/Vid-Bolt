"use client";

export function AnalyticsTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Views", value: "12.4K", change: "+14.2%" },
          { label: "Avg. Duration", value: "01:24", change: "-2.1%" },
          { label: "Retention Rate", value: "68%", change: "+5.7%" },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-lg"
          >
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">
              {stat.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stat.value}</span>
              <span
                className={`text-[10px] ${
                  stat.change.startsWith("+")
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                {stat.change}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="h-64 bg-neutral-900/60 border border-neutral-800 rounded-lg flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 flex items-end">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-orange-500"
              style={{ height: `${Math.random() * 80 + 20}%` }}
            ></div>
          ))}
        </div>
        <p className="text-sm text-neutral-500 font-mono tracking-tighter text-center px-4">
          DATA VISUALIZATION STREAMING...
        </p>
      </div>
    </div>
  );
}
