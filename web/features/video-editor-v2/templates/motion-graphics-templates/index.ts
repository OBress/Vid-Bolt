/**
 * Motion Graphics Templates Index
 * 
 * Exports all built-in motion graphics templates organized by category.
 */

import { MotionGraphicsTemplate, MotionGraphicsCategory } from '../../types/motion-graphics';
import { lowerThirdTemplates } from './lower-thirds';
import { titleCardTemplates } from './title-cards';
import { ctaTemplates } from './call-to-action';
import { mapAnimationTemplates } from './map-animations';

// ==========================================
// EXPORTS
// ==========================================

/**
 * All built-in templates combined
 */
export const builtInTemplates: MotionGraphicsTemplate[] = [
  ...lowerThirdTemplates,
  ...titleCardTemplates,
  ...ctaTemplates,
  ...mapAnimationTemplates,
];

/**
 * Get templates by category
 */
export const getTemplatesByCategory = (
  category: MotionGraphicsCategory
): MotionGraphicsTemplate[] => {
  return builtInTemplates.filter((t) => t.category === category);
};

/**
 * Get a template by ID
 */
export const getTemplateById = (id: string): MotionGraphicsTemplate | undefined => {
  return builtInTemplates.find((t) => t.id === id);
};

/**
 * Search templates by name, description, or tags
 */
export const searchTemplates = (query: string): MotionGraphicsTemplate[] => {
  const lowerQuery = query.toLowerCase();
  return builtInTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
};

// Re-export category-specific templates
export { lowerThirdTemplates } from './lower-thirds';
export { titleCardTemplates } from './title-cards';
export { ctaTemplates } from './call-to-action';
export { mapAnimationTemplates } from './map-animations';
