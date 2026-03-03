"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { TaskPanel } from "./TaskPanel";
import type { TaskData } from "./TaskCard";

export function TaskStatusButton() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [clearedTaskIds, setClearedTaskIds] = useState<Set<string>>(new Set());

  // Memoize Supabase client
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

      if (authError || !user) return;

      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, name, type, status, current_phase, current_step, progress_percent, error_message, steps, created_at, updated_at, started_at, completed_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Failed to fetch tasks:", error);
        return;
      }

      setTasks((data as TaskData[]) || []);
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

  // Real-time subscription
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

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending" || t.status === "running"),
    [tasks]
  );

  const handleClearHistory = useCallback(() => {
    const finishedIds = tasks
      .filter(
        (t) =>
          t.status === "completed" ||
          t.status === "failed" ||
          t.status === "cancelled"
      )
      .map((t) => t.id);

    setClearedTaskIds((prev) => {
      const next = new Set(prev);
      finishedIds.forEach((id) => next.add(id));
      return next;
    });
  }, [tasks]);

  const hasRunning = activeTasks.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-neutral-400 hover:text-orange-500"
        >
          <ListChecks className="w-4 h-4" />

          {/* Active task count badge */}
          {activeTasks.length > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center">
              {/* Pulse ring animation */}
              <span className="absolute inline-flex h-4 w-4 rounded-full bg-orange-500/40 animate-ping" />
              <span className="relative inline-flex items-center justify-center w-4 h-4 bg-orange-500 rounded-full text-[9px] text-white font-bold tabular-nums">
                {activeTasks.length}
              </span>
            </span>
          )}

          {/* Subtle glow ring when tasks are running */}
          {hasRunning && (
            <span className="absolute inset-0 rounded-md ring-1 ring-orange-500/30 pointer-events-none" />
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-neutral-950 border-neutral-800 p-0 [&>button:last-child]:hidden"
      >
        <VisuallyHidden>
          <SheetTitle>Tasks Panel</SheetTitle>
        </VisuallyHidden>
        <TaskPanel
          tasks={tasks}
          loading={loading}
          clearedTaskIds={clearedTaskIds}
          onClearHistory={handleClearHistory}
          onClose={() => setIsOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
