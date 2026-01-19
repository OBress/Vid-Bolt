"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Video, HardDrive } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AnalyticsData {
  total_users: number;
  active_users: number;
  pending_users: number;
  total_projects: number;
}

export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const { data, error } = await supabase.rpc("get_admin_analytics");
        if (error) throw error;
        setData(data as AnalyticsData);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-4 text-center text-neutral-400">
        Loading analytics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-red-400">
        Failed to load analytics
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-neutral-200">
            Total Users
          </CardTitle>
          <Users className="h-4 w-4 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {data.total_users}
          </div>
          <p className="text-xs text-neutral-400">
            {data.pending_users} pending approval
          </p>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-neutral-200">
            Active Projects
          </CardTitle>
          <Video className="h-4 w-4 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {data.total_projects}
          </div>
          <p className="text-xs text-neutral-400">Across all users</p>
        </CardContent>
      </Card>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-neutral-200">
            System Status
          </CardTitle>
          <HardDrive className="h-4 w-4 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">Operational</div>
          <p className="text-xs text-neutral-400">All systems normal</p>
        </CardContent>
      </Card>
    </div>
  );
}
