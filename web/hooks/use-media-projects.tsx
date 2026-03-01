"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { SettingsService } from "@/lib/services/settings-service";
import { MediaProject, ProjectSettings } from "@/types/settings";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { resolvePresetSettings } from "@/lib/constants/project-presets";

interface MediaProjectsContextType {
  projects: MediaProject[];
  loading: boolean;
  error: string | null;
  createProject: (
    name: string,
    sourceProjectId?: string
  ) => Promise<MediaProject>;
  deleteProject: (projectId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const MediaProjectsContext = createContext<
  MediaProjectsContextType | undefined
>(undefined);

export function MediaProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Get user on mount
  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    }
    getUser();
  }, [supabase]);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const data = await SettingsService.getMediaProjects();
      setProjects(data);
    } catch (err: any) {
      console.error("Failed to fetch projects:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createProject = async (
    name: string,
    sourceProjectId?: string
  ): Promise<MediaProject> => {
    if (!userId) {
      toast.error("Not authenticated");
      throw new Error("Not authenticated");
    }

    try {
      const newProject = await SettingsService.createMediaProject(userId, name);

      let settingsToApply: ProjectSettings | null = null;

      // 1. Check for preset: prefixed IDs
      if (sourceProjectId?.startsWith("preset:")) {
        settingsToApply = resolvePresetSettings(sourceProjectId, name);
      }
      // 2. Check for existing project clone
      else if (sourceProjectId && sourceProjectId !== "default") {
        const sourceSettings = await SettingsService.getProjectSettings(
          sourceProjectId
        );
        if (sourceSettings) {
          settingsToApply = {
            ...sourceSettings,
            basic_info: {
              ...sourceSettings.basic_info,
              projectName: name, // Keep the new name
            },
          };
        }
      }

      // 3. Fallback to standard preset
      if (!settingsToApply) {
        settingsToApply = resolvePresetSettings("preset:standard", name);
      }

      if (settingsToApply) {
        await SettingsService.updateProjectSettings(
          newProject.id,
          settingsToApply
        );
      }

      setProjects((prev) => [newProject, ...prev]);
      toast.success(`Project "${name}" created`);
      return newProject;
    } catch (err: any) {
      console.error("Failed to create project:", err);
      toast.error("Failed to create project");
      throw err;
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      await SettingsService.deleteMediaProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      toast.success("Project deleted");
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      toast.error("Failed to delete project");
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <MediaProjectsContext.Provider
      value={{
        projects,
        loading,
        error,
        createProject,
        deleteProject,
        refresh: fetchProjects,
      }}
    >
      {children}
    </MediaProjectsContext.Provider>
  );
}

export function useMediaProjects() {
  const context = useContext(MediaProjectsContext);
  if (context === undefined) {
    throw new Error(
      "useMediaProjects must be used within a MediaProjectsProvider"
    );
  }
  return context;
}
