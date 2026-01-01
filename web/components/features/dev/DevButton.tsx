"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Code2,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  BookOpen,
  FileText,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import type { Task, TaskStep, WritingTaskOutput } from "@/types/task";
import { UniversalScriptTester } from "./UniversalScriptTester";

// Simplified Task interface for UI (subset of full Task type)
interface TaskDisplay {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  current_phase: string | null;
  current_step: string | null;
  progress_percent: number;
  error_message: string | null;
  steps: TaskStep[];
}

export function DevButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTask, setCurrentTask] = useState<TaskDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showStory, setShowStory] = useState(false);
  const [storyContent, setStoryContent] = useState<{
    chapters: Array<{ chapterNumber: number; title: string; content: string }>;
    finalScript: string | null;
  } | null>(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [showUniversalTester, setShowUniversalTester] = useState(false);

  // Form state
  const [idea, setIdea] = useState(
    "A mystery story about a detective solving a case in a haunted mansion"
  );
  const [scriptType, setScriptType] = useState<
    "top_10" | "long_form" | "kitcon"
  >("long_form");
  const [numberOfChapters, setNumberOfChapters] = useState(3);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchTaskDetails = useCallback(
    async (taskId: string) => {
      // Fetch task with embedded steps
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select(
          "id, name, status, current_phase, current_step, progress_percent, error_message, steps"
        )
        .eq("id", taskId)
        .single();

      if (taskError) {
        console.error("Failed to fetch task:", taskError);
        return;
      }

      // Steps are now embedded in the task
      setCurrentTask({
        ...task,
        steps: task.steps || [],
      });

      // Stop polling if completed or failed
      if (task.status === "completed" || task.status === "failed") {
        setIsGenerating(false);
      }
    },
    [supabase]
  );

  // Poll for updates when generating
  useEffect(() => {
    if (!isGenerating || !currentTask?.id) return;

    const interval = setInterval(() => {
      fetchTaskDetails(currentTask.id);
    }, 2000);

    return () => clearInterval(interval);
  }, [isGenerating, currentTask?.id, fetchTaskDetails]);

  // Real-time subscription - now only subscribing to tasks table
  useEffect(() => {
    if (!currentTask?.id) return;

    const channel = supabase
      .channel(`task-${currentTask.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `id=eq.${currentTask.id}`,
        },
        () => fetchTaskDetails(currentTask.id)
      )
      // No more task_steps subscription needed!
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentTask?.id, fetchTaskDetails]);

  const startStoryGeneration = async () => {
    setError(null);
    setIsGenerating(true);
    setCurrentTask(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptType,
          idea,
          researchEnabled: false,
          numberOfChapters,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start task");
      }

      // Start polling for this task
      setCurrentTask({ ...data.task, status: "pending", steps: [] });
      fetchTaskDetails(data.task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsGenerating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-4 h-4 animate-spin text-orange-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-neutral-600" />;
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

  const viewStory = async () => {
    if (!currentTask?.id) return;

    setLoadingStory(true);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("output_data")
        .eq("id", currentTask.id)
        .single();

      if (error) throw error;

      // Extract from output_data (new schema)
      const outputData = data.output_data as WritingTaskOutput | null;

      setStoryContent({
        chapters: (outputData?.chapters || []) as Array<{
          chapterNumber: number;
          title: string;
          content: string;
        }>,
        finalScript: outputData?.final_script || null,
      });
      setShowStory(true);
    } catch (err) {
      console.error("Failed to fetch story:", err);
      setError("Failed to load story content");
    } finally {
      setLoadingStory(false);
    }
  };

  // Sort steps by order for display
  const sortedSteps = [...(currentTask?.steps || [])].sort(
    (a, b) => a.order - b.order
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="bg-orange-500/10 border-orange-500/50 text-orange-500 hover:bg-orange-500/20 hover:text-orange-400"
          >
            <Code2 className="w-4 h-4 mr-2" />
            DEV Button
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl bg-neutral-950 border-neutral-800">
          <DialogHeader>
            <DialogTitle className="text-white">Developer Tools</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Universal Script Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Universal Script Generator
              </h3>
              <p className="text-neutral-400 text-sm">
                Test the new 6-phase script generation pipeline with research,
                spine, assets, and more.
              </p>
              <Button
                onClick={() => {
                  setIsOpen(false);
                  setShowUniversalTester(true);
                }}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Open Universal Script Tester
              </Button>
            </div>

            <div className="border-t border-neutral-800" />

            {/* Story Generation Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Story Generation Test (Legacy)
              </h3>

              {/* Form */}
              {!currentTask && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="idea" className="text-neutral-400">
                      Story Idea
                    </Label>
                    <Input
                      id="idea"
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder="Enter your story idea..."
                      className="bg-neutral-900 border-neutral-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-neutral-400">Script Type</Label>
                      <Select
                        value={scriptType}
                        onValueChange={(v) =>
                          setScriptType(v as typeof scriptType)
                        }
                      >
                        <SelectTrigger className="bg-neutral-900 border-neutral-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="long_form">Long Form</SelectItem>
                          <SelectItem value="top_10">Top 10</SelectItem>
                          <SelectItem value="kitcon">Kitcon</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-neutral-400">Chapters</Label>
                      <Select
                        value={String(numberOfChapters)}
                        onValueChange={(v) => setNumberOfChapters(Number(v))}
                      >
                        <SelectTrigger className="bg-neutral-900 border-neutral-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 Chapters</SelectItem>
                          <SelectItem value="3">3 Chapters</SelectItem>
                          <SelectItem value="5">5 Chapters</SelectItem>
                          <SelectItem value="10">10 Chapters</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    onClick={startStoryGeneration}
                    disabled={isGenerating || !idea}
                    className="w-full bg-orange-500 hover:bg-orange-600"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Story Gen
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Progress Display */}
              {currentTask && (
                <div className="space-y-4">
                  <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-800">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(currentTask.status)}
                        <span className="text-sm font-medium text-white">
                          {currentTask.status === "completed"
                            ? "Completed!"
                            : currentTask.status === "failed"
                            ? "Failed"
                            : getPhaseLabel(currentTask.current_phase)}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {currentTask.progress_percent}%
                      </span>
                    </div>

                    <Progress
                      value={currentTask.progress_percent}
                      className="h-2 mb-2"
                    />

                    {currentTask.current_step &&
                      currentTask.status === "running" && (
                        <p className="text-xs text-orange-500/80 truncate">
                          {currentTask.current_step}
                        </p>
                      )}

                    {currentTask.error_message && (
                      <p className="text-xs text-red-400 mt-2">
                        Error: {currentTask.error_message}
                      </p>
                    )}
                  </div>

                  {/* Steps List - Now reading from task.steps */}
                  {sortedSteps.length > 0 && (
                    <ScrollArea className="h-48">
                      <div className="space-y-1">
                        {sortedSteps.map((step) => (
                          <div
                            key={step.id}
                            className="flex items-center gap-2 p-2 bg-neutral-900/50 rounded text-xs"
                          >
                            {getStatusIcon(step.status)}
                            <span className="text-neutral-400">
                              [{step.phase}]
                            </span>
                            <span className="text-neutral-300 flex-1">
                              {step.name}
                            </span>
                            {step.token_count && (
                              <span className="text-neutral-600 text-[10px]">
                                {step.token_count.toLocaleString()} tokens
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  {/* Action Buttons */}
                  {(currentTask.status === "completed" ||
                    currentTask.status === "failed") && (
                    <div className="flex gap-2">
                      {currentTask.status === "completed" && (
                        <Button
                          onClick={viewStory}
                          disabled={loadingStory}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {loadingStory ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <BookOpen className="w-4 h-4 mr-2" />
                          )}
                          View Story
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCurrentTask(null);
                          setError(null);
                          setShowStory(false);
                          setStoryContent(null);
                        }}
                        className="flex-1"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Start New
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>

        {/* Story Viewer - Separate Dialog */}
        <Dialog open={showStory} onOpenChange={setShowStory}>
          <DialogContent className="max-w-4xl max-h-[90vh] bg-neutral-950 border-neutral-800 flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-green-500" />
                Generated Story
              </DialogTitle>
            </DialogHeader>

            <div
              className="flex-1 overflow-y-auto pr-2"
              style={{ maxHeight: "calc(90vh - 120px)" }}
            >
              <div className="prose prose-invert max-w-none py-4">
                {storyContent?.finalScript ? (
                  <div>
                    <h2 className="text-orange-500 mb-4 text-xl font-bold">
                      Final Script
                    </h2>
                    <div className="whitespace-pre-wrap text-neutral-300 text-sm leading-relaxed">
                      {storyContent.finalScript}
                    </div>
                  </div>
                ) : storyContent?.chapters &&
                  storyContent.chapters.length > 0 ? (
                  <div className="space-y-8">
                    {storyContent.chapters
                      .sort((a, b) => a.chapterNumber - b.chapterNumber)
                      .map((chapter) => (
                        <div
                          key={chapter.chapterNumber}
                          className="border-b border-neutral-800 pb-6 last:border-0"
                        >
                          <h2 className="text-orange-500 mb-3 text-lg font-bold">
                            Chapter {chapter.chapterNumber}: {chapter.title}
                          </h2>
                          <div className="whitespace-pre-wrap text-neutral-300 text-sm leading-relaxed">
                            {chapter.content}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-neutral-500">No story content found.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Dialog>

      {/* Universal Script Tester - Full Screen */}
      <UniversalScriptTester
        isOpen={showUniversalTester}
        onClose={() => setShowUniversalTester(false)}
      />
    </>
  );
}
