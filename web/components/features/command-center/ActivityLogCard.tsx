"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const logs = [
  {
    time: "25/06/2025 09:29",
    agent: "gh0st_Fire",
    action: "completed mission in",
    location: "Berlin",
    target: "zer0_Nigh",
  },
  {
    time: "25/06/2025 08:12",
    agent: "dr4g0n_V3in",
    action: "extracted high-value target in",
    location: "Cairo",
    target: null,
  },
  {
    time: "24/06/2025 22:55",
    agent: "sn4ke_Sh4de",
    action: "lost communication in",
    location: "Havana",
    target: null,
  },
  {
    time: "24/06/2025 21:33",
    agent: "ph4nt0m_R4ven",
    action: "initiated surveillance in",
    location: "Tokyo",
    target: null,
  },
  {
    time: "24/06/2025 19:45",
    agent: "v0id_Walk3r",
    action: "compromised security in",
    location: "Moscow",
    target: "d4rk_M4trix",
  },
];

export function ActivityLogCard() {
  return (
    <Card className="bg-neutral-900 border-neutral-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-neutral-300 tracking-wider">
          ACTIVITY LOG
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {logs.map((log, index) => (
            <div
              key={index}
              className="text-xs border-l-2 border-orange-500 pl-3 hover:bg-neutral-800 p-2 rounded transition-colors"
            >
              <div className="text-neutral-500 font-mono">{log.time}</div>
              <div className="text-white">
                Agent{" "}
                <span className="text-orange-500 font-mono">{log.agent}</span>{" "}
                {log.action}{" "}
                <span className="text-white font-mono">{log.location}</span>
                {log.target && (
                  <span>
                    {" "}
                    with agent{" "}
                    <span className="text-orange-500 font-mono">
                      {log.target}
                    </span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
