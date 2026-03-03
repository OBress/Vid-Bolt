"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Trash2,
  Loader2,
  ListChecks,
  Inbox,
  X,
} from "lucide-react";
import { TaskCard, type TaskData } from "./TaskCard";

interface TaskPanelProps {
  tasks: TaskData[];
  loading: boolean;
  clearedTaskIds: Set<string>;
  onClearHistory: () => void;
  onClose: () => void;
}

export function TaskPanel({
  tasks,
  loading,
  clearedTaskIds,
  onClearHistory,
  onClose,
}: TaskPanelProps) {
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === "pending" || t.status === "running"),
    [tasks]
  );

  const historyTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (t.status === "completed" ||
            t.status === "failed" ||
            t.status === "cancelled") &&
          !clearedTaskIds.has(t.id)
      ),
    [tasks, clearedTaskIds]
  );

  const isEmpty = activeTasks.length === 0 && historyTasks.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <ListChecks className="w-4.5 h-4.5 text-orange-500" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Tasks
          </h2>
          {activeTasks.length > 0 && (
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-full tabular-nums">
              {activeTasks.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Clear History */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-neutral-500"
            onClick={onClearHistory}
            disabled={historyTasks.length === 0}
            title="Clear finished tasks"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-white"
            onClick={onClose}
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 overflow-hidden">
        {loading && tasks.length === 0 ? (
          // Loading skeleton
          <div className="p-6 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500/60" />
            <p className="text-xs text-neutral-500">Loading tasks…</p>
          </div>
        ) : isEmpty ? (
          // Empty state
          <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center">
              <Inbox className="w-6 h-6 text-neutral-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-400 font-medium">No tasks</p>
              <p className="text-xs text-neutral-600 mt-0.5">
                Tasks will appear here when you start generating content
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Active Tasks Section */}
            {activeTasks.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    Active · {activeTasks.length}
                  </p>
                </div>
                <div className="space-y-2">
                  {activeTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            {activeTasks.length > 0 && historyTasks.length > 0 && (
              <Separator className="bg-neutral-800/60" />
            )}

            {/* History Section */}
            {historyTasks.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    History · {historyTasks.length}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {historyTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
