"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Task, TaskStatus } from "@/types/task";

interface UseTaskProgressOptions {
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Callback when task completes successfully */
  onComplete?: (task: Task) => void;
  /** Callback when task fails */
  onError?: (error: string) => void;
  /** Whether to start polling immediately (default: true) */
  autoStart?: boolean;
}

interface UseTaskProgressReturn {
  /** Current task data */
  task: Task | null;
  /** Whether polling is active */
  isPolling: boolean;
  /** Current progress percentage */
  progress: number;
  /** Current step description */
  currentStep: string | null;
  /** Task status */
  status: TaskStatus | null;
  /** Error message if any */
  error: string | null;
  /** Start polling manually */
  startPolling: () => void;
  /** Stop polling manually */
  stopPolling: () => void;
}

/**
 * Hook for polling task progress from the API.
 * Automatically polls until task completes, fails, or is cancelled.
 */
export function useTaskProgress(
  taskId: string | null,
  options: UseTaskProgressOptions = {}
): UseTaskProgressReturn {
  const {
    pollInterval = 2000,
    onComplete,
    onError,
    autoStart = true,
  } = options;

  const [task, setTask] = useState<Task | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Keep refs up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  const fetchTask = useCallback(async () => {
    if (!taskId) return null;

    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch task");
      }

      return data.task as Task;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return null;
    }
  }, [taskId]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    const fetchedTask = await fetchTask();
    
    if (!fetchedTask) {
      stopPolling();
      return;
    }

    setTask(fetchedTask);
    setError(null);

    // Check if task is complete
    if (fetchedTask.status === "completed") {
      stopPolling();
      onCompleteRef.current?.(fetchedTask);
      return;
    }

    // Check if task failed
    if (fetchedTask.status === "failed") {
      stopPolling();
      const errorMsg = fetchedTask.error_message || "Task failed";
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
      return;
    }

    // Check if task was cancelled
    if (fetchedTask.status === "cancelled") {
      stopPolling();
      setError("Task was cancelled");
      return;
    }
  }, [fetchTask, stopPolling]);

  const startPolling = useCallback(() => {
    if (!taskId || isPolling) return;

    setIsPolling(true);
    setError(null);
    
    // Fetch immediately
    poll();
    
    // Then poll at interval
    intervalRef.current = setInterval(poll, pollInterval);
  }, [taskId, isPolling, poll, pollInterval]);

  // Auto-start polling when taskId changes
  useEffect(() => {
    if (taskId && autoStart) {
      // Reset state for new task
      setTask(null);
      setError(null);
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [taskId, autoStart]); // Intentionally omit startPolling and stopPolling

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    task,
    isPolling,
    progress: task?.progress_percent ?? 0,
    currentStep: task?.current_step ?? null,
    status: task?.status ?? null,
    error,
    startPolling,
    stopPolling,
  };
}
