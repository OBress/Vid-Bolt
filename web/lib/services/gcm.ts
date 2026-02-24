/**
 * Global Context Manager (GCM) CRUD Service
 * ============================================================================
 * Data layer for managing canonical entity references (characters, settings,
 * props, styles) used to enforce visual consistency across the closed-loop
 * production pipeline.
 *
 * Entities are stored in the `project_entities` Supabase table and referenced
 * by all downstream workers via entity_id.
 */

import { getSupabaseServiceClient } from '@/lib/queues/shared';
import type { GCMEntity } from '@/lib/types/closed-loop';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/** Input for creating a new GCM entity. */
export interface CreateEntityInput {
  project_id: string;
  entity_type: GCMEntity['entity_type'];
  name: string;
  reference_url?: string;
  text_description: string;
  attributes?: GCMEntity['attributes'];
}

/** Input for updating an existing GCM entity. */
export interface UpdateEntityInput {
  name?: string;
  reference_url?: string;
  text_description?: string;
  attributes?: Partial<GCMEntity['attributes']>;
}

/** Row shape from the `project_entities` Supabase table. */
interface EntityRow {
  id: string;
  project_id: string;
  entity_type: string;
  name: string;
  reference_url: string | null;
  text_description: string;
  attributes: Record<string, unknown>;
  appearance_count: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Convert a Supabase row to a GCMEntity. */
function rowToEntity(row: EntityRow): GCMEntity {
  return {
    entity_id: row.id,
    entity_type: row.entity_type as GCMEntity['entity_type'],
    name: row.name,
    reference_url: row.reference_url || '',
    text_description: row.text_description,
    attributes: (row.attributes || {}) as GCMEntity['attributes'],
    last_updated: new Date(row.updated_at).getTime(),
    appearance_count: row.appearance_count,
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * List all entities for a video project.
 */
export async function listEntities(projectId: string): Promise<GCMEntity[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('project_entities')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[GCM] Failed to list entities:', error);
    throw error;
  }

  return (data || []).map(rowToEntity);
}

/**
 * Get a single entity by ID.
 */
export async function getEntity(entityId: string): Promise<GCMEntity | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('project_entities')
    .select('*')
    .eq('id', entityId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[GCM] Failed to get entity:', error);
    throw error;
  }

  return data ? rowToEntity(data) : null;
}

/**
 * Create a new entity for a project.
 */
export async function createEntity(input: CreateEntityInput): Promise<GCMEntity> {
  const supabase = getSupabaseServiceClient();

  const id = uuidv4();
  const { data, error } = await supabase
    .from('project_entities')
    .insert({
      id,
      project_id: input.project_id,
      entity_type: input.entity_type,
      name: input.name,
      reference_url: input.reference_url || null,
      text_description: input.text_description,
      attributes: input.attributes || {},
      appearance_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[GCM] Failed to create entity:', error);
    throw error;
  }

  return rowToEntity(data);
}

/**
 * Update an existing entity.
 */
export async function updateEntity(
  entityId: string,
  input: UpdateEntityInput
): Promise<GCMEntity> {
  const supabase = getSupabaseServiceClient();

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updatePayload.name = input.name;
  if (input.reference_url !== undefined) updatePayload.reference_url = input.reference_url;
  if (input.text_description !== undefined) updatePayload.text_description = input.text_description;
  if (input.attributes !== undefined) {
    // Merge attributes rather than replacing
    const existing = await getEntity(entityId);
    updatePayload.attributes = {
      ...(existing?.attributes || {}),
      ...input.attributes,
    };
  }

  const { data, error } = await supabase
    .from('project_entities')
    .update(updatePayload)
    .eq('id', entityId)
    .select()
    .single();

  if (error) {
    console.error('[GCM] Failed to update entity:', error);
    throw error;
  }

  return rowToEntity(data);
}

/**
 * Delete an entity.
 */
export async function deleteEntity(entityId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from('project_entities')
    .delete()
    .eq('id', entityId);

  if (error) {
    console.error('[GCM] Failed to delete entity:', error);
    throw error;
  }
}

/**
 * Increment the appearance count for an entity (called after a shot passes
 * verification that references this entity).
 */
export async function incrementAppearance(entityId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.rpc('increment_entity_appearance', {
    p_entity_id: entityId,
  });

  // Fallback: if the RPC doesn't exist yet, do a manual update
  if (error) {
    console.warn('[GCM] RPC not available, using manual increment');
    const entity = await getEntity(entityId);
    if (entity) {
      await supabase
        .from('project_entities')
        .update({
          appearance_count: entity.appearance_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId);
    }
  }
}

/**
 * Bulk create entities for a project (e.g., when seeding from outline assets).
 */
export async function bulkCreateEntities(
  projectId: string,
  inputs: Omit<CreateEntityInput, 'project_id'>[]
): Promise<GCMEntity[]> {
  const supabase = getSupabaseServiceClient();

  const rows = inputs.map((input) => ({
    id: uuidv4(),
    project_id: projectId,
    entity_type: input.entity_type,
    name: input.name,
    reference_url: input.reference_url || null,
    text_description: input.text_description,
    attributes: input.attributes || {},
    appearance_count: 0,
  }));

  const { data, error } = await supabase
    .from('project_entities')
    .insert(rows)
    .select();

  if (error) {
    console.error('[GCM] Failed to bulk create entities:', error);
    throw error;
  }

  return (data || []).map(rowToEntity);
}

/**
 * Get entities referenced by a shot (by entity IDs).
 * Returns only the entities that match the given IDs, useful for
 * enriching prompts with only the relevant entity context.
 */
export async function getEntitiesByIds(entityIds: string[]): Promise<GCMEntity[]> {
  if (entityIds.length === 0) return [];

  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('project_entities')
    .select('*')
    .in('id', entityIds);

  if (error) {
    console.error('[GCM] Failed to get entities by IDs:', error);
    throw error;
  }

  return (data || []).map(rowToEntity);
}
