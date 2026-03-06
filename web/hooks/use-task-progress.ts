"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Task, TaskStatus, ActivityEvent } from "@/types/task";

interface UseTaskProgressOptions {
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Callback when task completes successfully */
  onComplete?: (task: Task) => void;
  /** Callback when task fails */
  onError?: (error: string) => void;
  /** Whether to start polling immediately (default: true) */
  autoStart?: boolean;
  /** Maximum retries for transient errors (default: 5) */
  maxRetries?: number;
}

interface UseTaskProgressReturn {
  /** Current task data */
  task: Task | null;
  /** Whether polling is active */
  isPolling: boolean;
  /** Current progress percentage (monotonic — never decreases) */
  progress: number;
  /** Current step description */
  currentStep: string | null;
  /** Task status */
  status: TaskStatus | null;
  /** Error message if any */
  error: string | null;
  /** Activity events from the orchestrator */
  activityEvents: ActivityEvent[];
  /** Start polling manually */
  startPolling: () => void;
  /** Stop polling manually */
  stopPolling: () => void;
}

/**
 * Hook for polling task progress from the API.
 * Automatically polls until task completes, fails, or is cancelled.
 * Includes retry logic for transient errors.
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
    maxRetries = 5,
  } = options;

  const [task, setTask] = useState<Task | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use refs to avoid stale closures
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const taskIdRef = useRef(taskId);
  
  // Client-side monotonic guard: progress can never decrease
  const maxProgressRef = useRef(0);
  
  // Keep refs up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    taskIdRef.current = taskId;
  }, [onComplete, onError, taskId]);

  const fetchTask = useCallback(async (): Promise<Task | null> => {
    const currentTaskId = taskIdRef.current;
    if (!currentTaskId) return null;

    try {
      const response = await fetch(`/api/tasks/${currentTaskId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch task");
      }

      return data.task as Task;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.warn(`Task fetch error (will retry): ${errorMessage}`);
      return null;
    }
  }, []);

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
      // Transient error - increment retry count instead of stopping
      setRetryCount((prev) => {
        const newCount = prev + 1;
        if (newCount >= maxRetries) {
          console.error(`Max retries (${maxRetries}) reached, stopping polling`);
          setError("Failed to fetch task after multiple retries");
          stopPolling();
        }
        return newCount;
      });
      return;
    }

    // Reset retry count on successful fetch
    setRetryCount(0);
    setTask(fetchedTask);
    setError(null);

    // Update monotonic progress (only goes up)
    if (fetchedTask.progress_percent > maxProgressRef.current) {
      maxProgressRef.current = fetchedTask.progress_percent;
    }

    // Check if task is complete
    if (fetchedTask.status === "completed") {
      maxProgressRef.current = 100;
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
  }, [fetchTask, stopPolling, maxRetries]);

  const startPolling = useCallback(() => {
    const currentTaskId = taskIdRef.current;
    if (!currentTaskId) return;

    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsPolling(true);
    setError(null);
    setRetryCount(0);
    
    // Fetch immediately
    poll();
    
    // Then poll at interval
    intervalRef.current = setInterval(poll, pollInterval);
  }, [poll, pollInterval]);

  // Auto-start polling when taskId changes
  useEffect(() => {
    if (taskId && autoStart) {
      // Reset state for new task
      setTask(null);
      setError(null);
      setRetryCount(0);
      maxProgressRef.current = 0; // Reset monotonic guard for new task
      
      // Stop any existing polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Start polling with a small delay to ensure state is settled
      const startTimer = setTimeout(() => {
        setIsPolling(true);
        poll();
        intervalRef.current = setInterval(poll, pollInterval);
      }, 50);

      return () => {
        clearTimeout(startTimer);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsPolling(false);
      };
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsPolling(false);
    };
  }, [taskId, autoStart, poll, pollInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Monotonic progress: return the highest value seen
  const rawProgress = task?.progress_percent ?? 0;
  const progress = Math.max(rawProgress, maxProgressRef.current);

  return {
    task,
    isPolling,
    progress,
    currentStep: task?.current_step ?? null,
    status: task?.status ?? null,
    error,
    activityEvents: task?.activity_events ?? [],
    startPolling,
    stopPolling,
  };
}
