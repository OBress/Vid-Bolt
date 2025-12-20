"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Target, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export function StatsOverview() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-neutral-900 border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400 tracking-wider">
                ACTIVE OPS
              </p>
              <p className="text-2xl font-bold text-white font-mono">23</p>
            </div>
            <Target className="w-8 h-8 text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400 tracking-wider">
                COMPLETED
              </p>
              <p className="text-2xl font-bold text-white font-mono">156</p>
            </div>
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400 tracking-wider">
                COMPROMISED
              </p>
              <p className="text-2xl font-bold text-red-500 font-mono">2</p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400 tracking-wider">
                SUCCESS RATE
              </p>
              <p className="text-2xl font-bold text-white font-mono">94%</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
