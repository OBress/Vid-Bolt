"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ListTodo,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

interface Task {
  id: string;
  name: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_phase: string | null;
  current_step: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

export function TaskStatusButton() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Memoize Supabase client to prevent recreation on every render
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const fetchTasks = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error("Auth error in TaskStatusButton:", authError);
        return;
      }

      if (!user) {
        console.log("No user in TaskStatusButton");
        return;
      }

      console.log("Fetching tasks for user:", user.id);

      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, name, type, status, current_phase, current_step, progress_percent, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Failed to fetch tasks:", error);
        return;
      }

      console.log("Fetched tasks:", data?.length || 0, data);
      setTasks(data || []);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-time subscription for task updates
  useEffect(() => {
    const channel = supabase
      .channel("tasks-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchTasks]);

  // Auto-refresh for running tasks
  useEffect(() => {
    const hasRunningTasks = tasks.some((t) => t.status === "running");
    if (!hasRunningTasks) return;

    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [tasks, fetchTasks]);

  const activeTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "running"
  );
  const recentTasks = tasks.filter(
    (t) =>
      t.status === "completed" ||
      t.status === "failed" ||
      t.status === "cancelled"
  );

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-4 h-4 animate-spin text-orange-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-neutral-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-neutral-400" />;
      default:
        return <Clock className="w-4 h-4 text-neutral-400" />;
    }
  };

  const getPhaseLabel = (phase: string | null) => {
    switch (phase) {
      case "preprocessing":
        return "Pre-processing";
      case "writing":
        return "Writing";
      case "postprocessing":
        return "Post-processing";
      default:
        return "Initializing";
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-neutral-400 hover:text-orange-500"
        >
          <ListTodo className="w-4 h-4" />
          {activeTasks.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
              {activeTasks.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 bg-neutral-950 border-neutral-800 p-0"
        align="end"
      >
        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Tasks
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-neutral-400 hover:text-orange-500"
            onClick={() => fetchTasks()}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ScrollArea className="h-80 overflow-hidden">
          {loading && tasks.length === 0 ? (
            <div className="p-4 text-center text-neutral-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-4 text-center text-neutral-500 text-sm">
              No tasks yet
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {/* Active Tasks */}
              {activeTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-2">
                    Active
                  </p>
                  {activeTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-neutral-900/50 rounded-lg border border-neutral-800"
                    >
                      <div className="flex items-start gap-2">
                        {getStatusIcon(task.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {task.name}
                          </p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            {getPhaseLabel(task.current_phase)}
                          </p>
                          {task.current_step && (
                            <p className="text-[10px] text-orange-500/80 mt-0.5 truncate">
                              {task.current_step}
                            </p>
                          )}
                        </div>
                      </div>
                      {task.status === "running" && (
                        <div className="mt-2">
                          <Progress
                            value={task.progress_percent}
                            className="h-1"
                          />
                          <p className="text-[10px] text-neutral-500 mt-1 text-right">
                            {task.progress_percent}%
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Tasks */}
              {recentTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider px-2 mt-3">
                    Recent
                  </p>
                  {recentTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="p-2 bg-neutral-900/30 rounded-lg border border-neutral-800/50 flex items-center gap-2"
                    >
                      {getStatusIcon(task.status)}
                      <p className="text-xs text-neutral-300 truncate flex-1">
                        {task.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
