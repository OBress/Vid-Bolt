"use client";

import React, { useState } from "react";
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
import { NAV_GROUPS } from "@/app/command-center/navigation";

export function MediaProjectsTab() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const mediaProjects = NAV_GROUPS.find((g) => g.id === "media")?.items || [];

  const handleDeleteClick = (project: { id: string; label: string }) => {
    setProjectToDelete(project);
    setConfirmName("");
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (confirmName === projectToDelete?.label) {
      console.log("Deleting project:", projectToDelete.id);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 gap-3">
        {mediaProjects.map((project) => (
          <div
            key={project.id}
            className="group flex items-center justify-between p-4 bg-neutral-900/40 border border-neutral-800 rounded-xl hover:bg-neutral-900/60 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <SettingsIcon className="text-orange-500 w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-tight text-white">
                  {project.label}
                </h3>
                <p className="text-[10px] text-neutral-400 font-mono">
                  ID: {project.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={project.href}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-400 hover:text-white hover:bg-neutral-800"
                  title="View Project"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </Link>
              <Link href={`${project.href}?tab=settings`}>
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
                onClick={() => handleDeleteClick(project)}
                title="Delete Project"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

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
              <strong className="text-white">{projectToDelete?.label}</strong>{" "}
              and all associated data.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-neutral-400 uppercase font-bold tracking-widest">
                Confirm Destruction
              </p>
              <p className="text-xs text-neutral-500">
                Type{" "}
                <span className="text-orange-500 font-bold">
                  "{projectToDelete?.label}"
                </span>{" "}
                exactly as shown above to confirm:
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
              disabled={confirmName !== projectToDelete?.label}
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
