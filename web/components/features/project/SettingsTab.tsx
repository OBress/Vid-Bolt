"use client";

export function SettingsTab() {
  const settings = [
    { title: "Project Resolution", value: "3840 x 2160 (4K)" },
    { title: "Target Frame Rate", value: "60 FPS" },
    { title: "Auto-Save Interval", value: "5 Minutes" },
    { title: "Export Format", value: "H.264 / MP4" },
  ];

  return (
    <div className="max-w-2xl bg-neutral-900/40 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
      {settings.map((setting, i) => (
        <div
          key={i}
          className="p-4 flex items-center justify-between hover:bg-neutral-800/20 transition-colors"
        >
          <span className="text-sm text-neutral-300">{setting.title}</span>
          <span className="text-xs text-orange-500 font-mono cursor-pointer hover:underline">
            {setting.value}
          </span>
        </div>
      ))}
    </div>
  );
}
