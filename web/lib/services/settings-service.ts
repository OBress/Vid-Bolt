import { createClient } from '@/lib/supabase/client';
import { ProjectSettings, UserSettings, MediaProject } from '@/types/settings';

export const SettingsService = {
  /**
   * Fetch all media projects for the current user
   */
  async getMediaProjects(): Promise<MediaProject[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('media_projects')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error("Error fetching projects:", error);
      throw error;
    }
    return (data || []) as MediaProject[];
  },

  /**
   * Fetch settings for a specific project
   */
  async getProjectSettings(projectId: string): Promise<ProjectSettings | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('project_settings')
      .select('settings')
      .eq('project_id', projectId)
      .maybeSingle(); // Use maybeSingle to avoid 406 when no row exists

    if (error) {
      console.error("Error fetching project settings:", error);
      return null;
    }
    return data?.settings as ProjectSettings || null;
  },

  /**
   * Update settings for a specific project (merges with existing)
   */
  async updateProjectSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<void> {
    const supabase = createClient();
    // First get current settings to merge
    const current = await this.getProjectSettings(projectId);
    const merged = {
      ...(current || {}),
      ...settings,
    };

    const { error } = await supabase
      .from('project_settings')
      .upsert(
        { project_id: projectId, settings: merged },
        { onConflict: 'project_id' }
      );

    if (error) {
      console.error("Error updating project settings:", error);
      throw error;
    }
  },

  /**
   * Fetch general user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle(); // Use maybeSingle to avoid 406 when no row exists

    if (error) {
      console.error("Error fetching user settings:", error);
      return null;
    }
    return data?.settings as UserSettings || null;
  },

  /**
   * Update general user settings
   */
  async updateUserSettings(
    userId: string,
    settings: Partial<UserSettings>
  ): Promise<void> {
    const supabase = createClient();
    const current = await this.getUserSettings(userId);
    const merged = {
      ...(current || {}),
      ...settings,
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, settings: merged },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error("Error updating user settings:", error);
      throw error;
    }
  },

  /**
   * Create a new media project
   */
  async createMediaProject(userId: string, name: string): Promise<MediaProject> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('media_projects')
      .insert({ user_id: userId, name })
      .select()
      .single();

    if (error) {
      console.error("Error creating project:", error);
      throw error;
    }
    return data as MediaProject;
  },

  /**
   * Delete a media project
   */
  async deleteMediaProject(projectId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from("media_projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      console.error("Error deleting project:", error);
      throw error;
    }
  }
};
