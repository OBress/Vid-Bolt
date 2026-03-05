"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Settings as SettingsIcon,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { useMediaProjects } from "@/hooks/use-media-projects";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Plus, Loader2 } from "lucide-react";
import { PROJECT_PRESETS } from "@/lib/constants/project-presets";

export function MediaProjectsTab() {
  const router = useRouter();
  const { projects, loading, createProject, deleteProject } =
    useMediaProjects();
  const { settings: userSettings, updateSettings: updateUserSettings } =
    useUserSettings();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState("preset:standard");
  const [creating, setCreating] = useState(false);

  const handleDeleteClick = (project: { id: string; name: string }) => {
    setProjectToDelete(project);
    setConfirmName("");
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (confirmName === projectToDelete?.name && projectToDelete) {
      await deleteProject(projectToDelete.id);
      setDeleteDialogOpen(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const newProject = await createProject(newProjectName, sourceProjectId);
      setCreateDialogOpen(false);
      setNewProjectName("");
      setSourceProjectId("preset:standard");
      router.push(`/command-center/media/${newProject.id}`);
    } catch (_err) {
      // error handled in hook
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 bg-neutral-900/40 border border-neutral-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  const thumbnailEnabled = userSettings.enableThumbnailGeneration ?? true;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Thumbnail Generation Toggle */}
      <div className="flex items-center justify-between bg-neutral-900/40 p-4 rounded-xl border border-neutral-800">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest leading-none">
            AI Video Thumbnails
          </h3>
          <p className="text-[10px] text-neutral-500 mt-1">
            Auto-generate SVG thumbnails for new videos using AI
          </p>
        </div>
        <button
          onClick={() =>
            updateUserSettings({
              enableThumbnailGeneration: !thumbnailEnabled,
            })
          }
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            thumbnailEnabled ? "bg-orange-500" : "bg-neutral-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              thumbnailEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="flex justify-between items-center bg-neutral-900/40 p-4 rounded-xl border border-neutral-800">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest leading-none">
            Your Projects
          </h3>
          <p className="text-[10px] text-neutral-500 mt-1 uppercase font-mono">
            Total Active: {projects.length}
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white border-none font-black text-[10px] tracking-widest px-4 h-9"
        >
          <Plus className="w-4 h-4 mr-2" />
          NEW PROJECT
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {projects.length === 0 ? (
          <div className="py-20 text-center bg-neutral-900/20 rounded-xl border border-dashed border-neutral-800">
            <p className="text-neutral-500 text-sm">No media projects found.</p>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="group flex items-center justify-between p-4 bg-neutral-900/40 border border-neutral-800 rounded-xl hover:bg-neutral-900/60 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <SettingsIcon className="text-orange-500 w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-tight text-white line-clamp-1">
                    {project.name}
                  </h3>
                  <p className="text-[10px] text-neutral-400 font-mono">
                    ID: {project.id.split("-")[0]}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/command-center/media/${project.id}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-neutral-400 hover:text-white hover:bg-neutral-800"
                    title="View Project"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href={`/command-center/media/${project.id}?tab=settings`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10"
                    title="Project Settings"
                  >
                    <SettingsIcon className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-400 hover:text-red-500 hover:bg-red-500/10"
                  onClick={() =>
                    handleDeleteClick({ id: project.id, name: project.name })
                  }
                  title="Delete Project"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase tracking-tighter">
              Create Project
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Enter a name for your new media project.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-neutral-500 uppercase">
                Project Name
              </Label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="E.g. Daily Tech News"
                className="bg-black border-neutral-800 text-white"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-neutral-500 uppercase">
                Import Settings From
              </Label>
              <Select
                value={sourceProjectId}
                onValueChange={setSourceProjectId}
              >
                <SelectTrigger className="bg-black border-neutral-800 text-white">
                  <SelectValue placeholder="Standard Settings" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800 text-white max-h-[280px]">
                  <div className="px-2 py-1.5">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                      Presets
                    </span>
                  </div>
                  {PROJECT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={`preset:${preset.id}`}>
                      <div className="flex flex-col">
                        <span>{preset.name}</span>
                        <span className="text-[10px] text-neutral-500">
                          {preset.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  {projects.length > 0 && (
                    <>
                      <div className="my-1 border-t border-neutral-800" />
                      <div className="px-2 py-1.5">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                          Your Projects
                        </span>
                      </div>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={creating || !newProjectName.trim()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/10 rounded-full">
                <AlertTriangle className="text-red-500 w-5 h-5" />
              </div>
              <DialogTitle className="text-xl font-bold uppercase tracking-tighter font-mono text-white">
                Delete Project
              </DialogTitle>
            </div>
            <DialogDescription className="text-neutral-300 font-medium">
              This action cannot be undone. This will permanently delete{" "}
              <strong className="text-white">{projectToDelete?.name}</strong>{" "}
              and all associated data.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-neutral-400 uppercase font-bold tracking-widest text-[10px]">
                Confirm Destruction
              </p>
              <p className="text-xs text-neutral-500">
                Type{" "}
                <span className="text-orange-500 font-bold">
                  &quot;{projectToDelete?.name}&quot;
                </span>{" "}
                exactly to confirm:
              </p>
            </div>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="bg-black border-neutral-800 focus:border-red-500/50 focus:ring-red-500/10 text-white"
              placeholder="Project Name"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              disabled={confirmName !== projectToDelete?.name}
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white border-none font-bold uppercase tracking-widest text-xs"
            >
              Confirm Destruction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
