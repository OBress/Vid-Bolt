/**
 * SkillLoader - Loads skill documentation from markdown files
 * 
 * Ported from gpt-story-writer-niche-sys/backend/src/services/motion-graphics/SkillLoader.js
 * 
 * Skills are markdown files with YAML frontmatter that provide
 * additional context to the AI for specific animation types.
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
}

interface SkillEntry {
  name: string;
  content: string;
  metadata: SkillMetadata;
}

class SkillLoader {
  private skills: Map<string, SkillEntry> = new Map();
  private initialized = false;
  private initializing: Promise<void> | null = null;

  /**
   * Initialize by loading all skill files from the skills directory.
   * Uses singleton pattern — safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Prevent concurrent initialization
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this._doInitialize();
    await this.initializing;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const skillsDir = path.join(process.cwd(), 'lib', 'services', 'motion-graphics', 'skills');
      
      let files: string[];
      try {
        files = await fs.readdir(skillsDir);
      } catch (err) {
        console.warn('[SkillLoader] Skills directory not found:', skillsDir);
        this.initialized = true;
        return;
      }

      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      for (const file of mdFiles) {
        try {
          const filePath = path.join(skillsDir, file);
          const raw = await fs.readFile(filePath, 'utf-8');
          const { data: frontmatter, content } = matter(raw);
          
          const name = path.basename(file, '.md');
          
          this.skills.set(name, {
            name,
            content: content.trim(),
            metadata: {
              name: frontmatter.name || name,
              description: frontmatter.description || '',
              tags: frontmatter.tags || [],
            },
          });
        } catch (err) {
          console.warn(`[SkillLoader] Failed to load skill: ${file}`, err);
        }
      }
      
      this.initialized = true;
      console.log(`[SkillLoader] Loaded ${this.skills.size} skills: ${Array.from(this.skills.keys()).join(', ')}`);
    } catch (err) {
      console.error('[SkillLoader] Initialization failed:', err);
      this.initialized = true; // Mark initialized even on error to prevent retries
    }
  }

  /**
   * Get metadata for all loaded skills
   */
  getAllSkillMetadata(): SkillMetadata[] {
    return Array.from(this.skills.values()).map(s => s.metadata);
  }

  /**
   * Get the content of a specific skill
   */
  getSkillContent(name: string): string | null {
    return this.skills.get(name)?.content || null;
  }

  /**
   * Get combined content of multiple skills
   */
  getCombinedSkillContent(names: string[]): string {
    const parts: string[] = [];
    
    for (const name of names) {
      const skill = this.skills.get(name);
      if (skill) {
        parts.push(`### ${skill.metadata.name}\n\n${skill.content}`);
      }
    }
    
    return parts.join('\n\n---\n\n');
  }

  /**
   * Check if a skill exists
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get statistics about loaded skills
   */
  getStats(): { total: number; names: string[] } {
    return {
      total: this.skills.size,
      names: Array.from(this.skills.keys()),
    };
  }
}

/** Singleton instance */
export const skillLoader = new SkillLoader();
