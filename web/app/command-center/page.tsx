"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AgentAllocationCard } from "@/components/features/command-center/AgentAllocationCard";
import { ActivityLogCard } from "@/components/features/command-center/ActivityLogCard";
import { EncryptedChatCard } from "@/components/features/command-center/EncryptedChatCard";
import { useMediaProjects } from "@/hooks/use-media-projects";
import { Plus, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function CommandCenterPage() {
  const router = useRouter();
  const { projects, loading, createProject } = useMediaProjects();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const newProject = await createProject(newProjectName);
      setCreateDialogOpen(false);
      setNewProjectName("");
      router.push(`/command-center/media/${newProject.id}`);
    } catch (_err) {
      // Error handled in hook
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-3 md:p-6 space-y-6">
      {/* Quick Actions Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-white uppercase tracking-tighter">
            Command Center
          </h2>
          <p className="text-neutral-500 text-sm">
            Overview of your media operations
          </p>
        </div>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white border-none font-black text-xs tracking-widest px-6"
        >
          <Plus className="w-4 h-4 mr-2" />
          NEW PROJECT
        </Button>
      </div>

      {/* Recent Projects Section */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-orange-500" />
            Recent Projects
          </h3>
          <Link
            href="/command-center/settings/general?tab=projects"
            className="text-xs text-neutral-400 hover:text-orange-500 transition-colors"
          >
            View All
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-neutral-800 rounded-lg">
            <p className="text-neutral-500 text-sm mb-4">
              No projects yet. Create your first one!
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="outline"
              className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/command-center/media/${project.id}`}
                className="p-4 bg-black/40 border border-neutral-800 rounded-lg hover:border-orange-500/50 hover:bg-neutral-900/60 transition-all group"
              >
                <h4 className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors truncate">
                  {project.name}
                </h4>
                <p className="text-[10px] text-neutral-500 font-mono mt-1">
                  ID: {project.id.split("-")[0]}...
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <AgentAllocationCard />
        </div>
        <div className="lg:col-span-4">
          <ActivityLogCard />
        </div>
        <div className="lg:col-span-4">
          <EncryptedChatCard />
        </div>
      </div>

      {/* Create Project Dialog */}
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
          <div className="py-4">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="E.g. Daily Tech News"
              className="bg-black border-neutral-800 text-white"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            />
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
    </div>
  );
}
