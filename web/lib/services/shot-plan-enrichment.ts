import type { GCMEntity, PlannedShot } from '@/lib/types/closed-loop';

export interface PlannerDiagnosticsSummary {
  fallback_scene_count?: number;
  fallback_scene_ids?: string[];
  scene_cluster_count: number;
  breakdown_sequence_count: number;
  linked_entity_count: number;
  linked_shot_count: number;
}

export interface EnrichShotPlanResult {
  shots: PlannedShot[];
  diagnostics: PlannerDiagnosticsSummary;
}

const ENTITY_TOKEN_STOP_WORDS = new Set([
  'the',
  'and',
  'of',
  'in',
  'at',
  'on',
  'for',
  'to',
  'de',
  'la',
  'le',
  'di',
  'ii',
  'iii',
  'iv',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
]);

const LOCATION_HINTS = new Set([
  'world',
  'globe',
  'empire',
  'region',
  'country',
  'city',
  'province',
  'state',
  'site',
  'building',
  'palace',
  'forum',
  'temple',
  'theater',
  'senate',
  'curia',
  'room',
  'hall',
  'interior',
  'exterior',
  'street',
  'map',
  'route',
  'location',
]);

const BREAKDOWN_KEYWORDS: Record<NonNullable<PlannedShot['breakdown_role']>, string[]> = {
  macro: [
    'world',
    'globe',
    'satellite',
    'map',
    'empire',
    'region',
    'country',
    'overview',
    'aerial',
    'wide establishing',
  ],
  mid: [
    'city',
    'building',
    'site',
    'forum',
    'temple',
    'theater',
    'street',
    'district',
    'route',
    'exterior',
  ],
  micro: [
    'room',
    'interior',
    'hall',
    'chamber',
    'corridor',
    'inside',
    'close interior',
    'overhead angle',
    'medium shot',
  ],
  detail: [
    'detail',
    'close-up',
    'close up',
    'document',
    'evidence',
    'dagger',
    'letter',
    'coin',
    'face',
    'eyes',
    'hands',
    'blood',
    'inscription',
    'object',
  ],
};

function normalizeText(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function intersectCount<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count++;
  }
  return count;
}

function extractEntityTokens(name: string): string[] {
  return unique(
    normalizeText(name)
      .split(' ')
      .filter(token => token.length >= 3 && !ENTITY_TOKEN_STOP_WORDS.has(token))
  );
}

function shotCorpus(shot: PlannedShot): string {
  return normalizeText([
    shot.text,
    shot.summary,
    shot.visual_description,
    shot.stock_search_query,
    shot.angle_change,
    shot.image_edit_instruction,
  ].filter(Boolean).join(' '));
}

function shotKeywordSet(shot: PlannedShot): Set<string> {
  return new Set(
    shotCorpus(shot)
      .split(' ')
      .filter(token => token.length >= 4)
  );
}

function entityMatchesShot(entity: GCMEntity, shot: PlannedShot): boolean {
  const corpus = shotCorpus(shot);
  if (!corpus) return false;

  const entityName = normalizeText(entity.name);
  if (entityName && corpus.includes(entityName)) return true;

  const tokens = extractEntityTokens(entity.name);
  if (tokens.length === 0) return false;

  const matchedTokens = tokens.filter(token => corpus.includes(token));
  if (tokens.length === 1) return matchedTokens.length === 1;

  return matchedTokens.length >= Math.min(2, tokens.length) &&
    matchedTokens.length / tokens.length >= 0.6;
}

function sharedSettingLanguage(previous: PlannedShot, current: PlannedShot): boolean {
  const previousKeywords = new Set(
    [...shotKeywordSet(previous)].filter(keyword => LOCATION_HINTS.has(keyword))
  );
  const currentKeywords = new Set(
    [...shotKeywordSet(current)].filter(keyword => LOCATION_HINTS.has(keyword))
  );

  return previousKeywords.size > 0 &&
    currentKeywords.size > 0 &&
    intersectCount(previousKeywords, currentKeywords) > 0;
}

function inferBreakdownRole(shot: PlannedShot): PlannedShot['breakdown_role'] | undefined {
  const corpus = shotCorpus(shot);
  if (!corpus) return undefined;

  for (const role of ['detail', 'micro', 'mid', 'macro'] as const) {
    if (BREAKDOWN_KEYWORDS[role].some(keyword => corpus.includes(keyword))) {
      return role;
    }
  }

  if (shot.narrative_beat === 'establishing' && shot.media_type !== 'motiongraphic') {
    return 'mid';
  }

  if (shot.narrative_beat === 'detail') {
    return 'detail';
  }

  return undefined;
}

function shouldContinueCluster(previous: PlannedShot, current: PlannedShot): boolean {
  if (previous.scene_id !== current.scene_id) return false;
  if (current.continuity_from_previous) return true;
  if (current.synthesis_mode === 'I2V' || previous.synthesis_mode === 'I2V') return true;

  const previousEntities = new Set(previous.entity_refs || []);
  const currentEntities = new Set(current.entity_refs || []);
  if (intersectCount(previousEntities, currentEntities) > 0) return true;

  return sharedSettingLanguage(previous, current);
}

function linkEntitiesToShots(shots: PlannedShot[], entities: GCMEntity[]): PlannedShot[] {
  if (entities.length === 0) return shots;

  return shots.map(shot => {
    const matchedIds = entities
      .filter(entity => entityMatchesShot(entity, shot))
      .map(entity => entity.entity_id);

    return {
      ...shot,
      entity_refs: unique([...(shot.entity_refs || []), ...matchedIds]),
    };
  });
}

function assignSceneClusters(shots: PlannedShot[]): PlannedShot[] {
  if (shots.length === 0) return shots;

  let clusterCounter = 1;
  const enriched: PlannedShot[] = [];

  for (const shot of shots) {
    const previous = enriched[enriched.length - 1];
    const reusePreviousCluster = previous && shouldContinueCluster(previous, shot);
    const sceneClusterId = reusePreviousCluster
      ? previous.scene_cluster_id
      : `scene-cluster-${clusterCounter++}`;

    enriched.push({
      ...shot,
      scene_cluster_id: sceneClusterId,
      synthesis_mode: shot.media_type === 'video'
        ? (shot.synthesis_mode || (shot.continuity_from_previous && shot.angle_change ? 'I2V' : 'T2V'))
        : shot.synthesis_mode,
    });
  }

  return enriched;
}

function assignBreakdownSequences(shots: PlannedShot[]): {
  shots: PlannedShot[];
  sequenceCount: number;
} {
  const enrichedShots = shots.map(shot => ({
    ...shot,
    breakdown_role: inferBreakdownRole(shot),
  }));

  let sequenceCounter = 1;
  let cursor = 0;

  while (cursor < enrichedShots.length) {
    const sceneId = enrichedShots[cursor].scene_id;
    let end = cursor + 1;
    while (end < enrichedShots.length && enrichedShots[end].scene_id === sceneId) {
      end++;
    }

    const sceneShots = enrichedShots.slice(cursor, end);
    const roles = sceneShots
      .map(shot => shot.breakdown_role)
      .filter((role): role is NonNullable<PlannedShot['breakdown_role']> => !!role);

    if (roles.length >= 2 && unique(roles).length >= 2) {
      const sequenceId = `breakdown-seq-${sequenceCounter++}`;
      for (let index = cursor; index < end; index++) {
        if (enrichedShots[index].breakdown_role) {
          enrichedShots[index] = {
            ...enrichedShots[index],
            breakdown_sequence_id: sequenceId,
          };
        }
      }
    }

    cursor = end;
  }

  return {
    shots: enrichedShots,
    sequenceCount: sequenceCounter - 1,
  };
}

export function enrichShotPlan(
  shots: PlannedShot[],
  entities: GCMEntity[],
  options?: {
    fallbackSceneCount?: number;
    fallbackSceneIds?: string[];
  },
): EnrichShotPlanResult {
  const entityLinkedShots = linkEntitiesToShots(shots, entities);
  const clusteredShots = assignSceneClusters(entityLinkedShots);
  const { shots: breakdownShots, sequenceCount } = assignBreakdownSequences(clusteredShots);

  const linkedShotCount = breakdownShots.filter(shot => (shot.entity_refs || []).length > 0).length;
  const linkedEntityCount = unique(
    breakdownShots.flatMap(shot => shot.entity_refs || [])
  ).length;
  const sceneClusterCount = unique(
    breakdownShots.map(shot => shot.scene_cluster_id).filter(Boolean)
  ).length;

  return {
    shots: breakdownShots,
    diagnostics: {
      fallback_scene_count: options?.fallbackSceneCount || 0,
      fallback_scene_ids: options?.fallbackSceneIds || [],
      scene_cluster_count: sceneClusterCount,
      breakdown_sequence_count: sequenceCount,
      linked_entity_count: linkedEntityCount,
      linked_shot_count: linkedShotCount,
    },
  };
}
