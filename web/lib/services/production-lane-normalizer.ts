import type { PlannedShot, SegmentationTreatment } from '@/lib/types/closed-loop';

const MOTION_GRAPHIC_KEYWORDS = [
  'chart',
  'timeline',
  'map',
  'diagram',
  'infographic',
  'document',
  'dossier',
  'quote card',
  'quote-card',
  'lower third',
  'lower-third',
  'ui',
  'interface',
  'screen',
  'blueprint',
  'process',
  'comparison board',
  'evidence board',
  'route trace',
  'data',
  'stat',
  'text-led',
  'text overlay',
  'callout card',
];

const SEGMENTATION_DETAIL_KEYWORDS = [
  'document',
  'paper',
  'scroll',
  'letter',
  'evidence',
  'dagger',
  'coin',
  'seal',
  'map',
  'route',
  'chart',
  'graph',
  'timeline',
  'statue',
  'inscription',
  'face',
  'eyes',
  'hand',
  'artifact',
  'detail',
  'callout',
  'highlight',
  'spotlight',
  'annotat',
];

function normalizeWhitespace(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toSnakeCase(value: string): string {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'target';
}

function dedupeWords(words: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const word of words) {
    const key = word.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(word);
  }

  return deduped;
}

function truncateWords(value: string, maxWords: number): string {
  const words = normalizeWhitespace(value).split(' ').filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function buildFallbackPromptText(
  label: string,
  subjectFocus?: string,
  notes?: string,
): string {
  const pieces = dedupeWords([
    ...truncateWords(subjectFocus || '', 6).split(' '),
    ...truncateWords(notes || '', 4).split(' '),
  ].filter(Boolean));

  const candidate = truncateWords(pieces.join(' '), 8);
  return candidate || label.replace(/_/g, ' ');
}

function normalizePromptText(
  text: string | undefined,
  label: string,
  subjectFocus?: string,
  notes?: string,
): string {
  const source = normalizeWhitespace(text);
  if (!source) {
    return buildFallbackPromptText(label, subjectFocus, notes);
  }

  return truncateWords(source, 8) || buildFallbackPromptText(label, subjectFocus, notes);
}

function normalizeObjectPrompts(
  prompts: Array<{ label?: string; text?: string }> | undefined,
  subjectFocus?: string,
  notes?: string,
): Array<{ label: string; text: string }> {
  const usedLabels = new Set<string>();
  const normalized: Array<{ label: string; text: string }> = [];

  for (const prompt of prompts || []) {
    const baseLabel = toSnakeCase(prompt.label || prompt.text || subjectFocus || 'target');
    let label = baseLabel;
    let suffix = 2;
    while (usedLabels.has(label)) {
      label = `${baseLabel}_${suffix++}`;
    }

    usedLabels.add(label);
    normalized.push({
      label,
      text: normalizePromptText(prompt.text || prompt.label, label, subjectFocus, notes),
    });
  }

  if (normalized.length === 0 && subjectFocus) {
    normalized.push({
      label: toSnakeCase(subjectFocus),
      text: normalizePromptText(subjectFocus, toSnakeCase(subjectFocus), subjectFocus, notes),
    });
  }

  return normalized;
}

function normalizeSegmentationOperation(
  operation: NonNullable<NonNullable<SegmentationTreatment>['operations']>[number]
): NonNullable<NonNullable<SegmentationTreatment>['operations']>[number] {
  const objectLabel = operation.object_label
    ? toSnakeCase(operation.object_label)
    : undefined;

  return {
    ...operation,
    object_label: objectLabel,
    object_labels: operation.object_labels?.map(toSnakeCase),
  };
}

export function normalizeSegmentationTreatment(
  treatment: unknown,
  context?: {
    subjectFocus?: string;
    notes?: string;
  }
): PlannedShot['segmentation_treatment'] {
  if (!treatment || typeof treatment !== 'object') {
    return undefined;
  }

  const candidate = treatment as Partial<NonNullable<PlannedShot['segmentation_treatment']>>;
  if (!candidate.execution_mode) {
    return undefined;
  }

  const objectPrompts = normalizeObjectPrompts(
    candidate.object_prompts,
    candidate.subject_focus || context?.subjectFocus,
    candidate.notes || context?.notes,
  );
  const targetMode = objectPrompts.length > 0
    ? 'object_prompts'
    : (candidate.target_mode || 'text_prompt');
  const textPrompt = normalizeWhitespace(candidate.text_prompt)
    || normalizeWhitespace(candidate.subject_focus)
    || normalizeWhitespace(context?.subjectFocus)
    || undefined;

  return {
    execution_mode: candidate.execution_mode,
    preset: candidate.preset,
    target_mode: targetMode,
    text_prompt: targetMode === 'text_prompt' ? truncateWords(textPrompt || '', 8) || undefined : undefined,
    text_prompts: (candidate.text_prompts || []).map(prompt => truncateWords(prompt, 8)).filter(Boolean),
    point_prompts: candidate.point_prompts || [],
    point_labels: candidate.point_labels || [],
    box_prompts: candidate.box_prompts || [],
    box_labels: candidate.box_labels || [],
    box_prompts_labeled: candidate.box_prompts_labeled || [],
    object_prompts: objectPrompts,
    subject_focus: normalizeWhitespace(candidate.subject_focus) || context?.subjectFocus || undefined,
    notes: normalizeWhitespace(candidate.notes) || context?.notes || undefined,
    prompt_frame_index: candidate.prompt_frame_index,
    propagation_direction: candidate.propagation_direction,
    confidence_threshold: candidate.confidence_threshold,
    max_frames: candidate.max_frames,
    max_objects: candidate.max_objects,
    include_tracking_metadata: candidate.include_tracking_metadata ?? true,
    output_type: candidate.output_type,
    output_format: candidate.output_format,
    intensity: candidate.intensity || 'moderate',
    operations: (candidate.operations || []).map(normalizeSegmentationOperation),
    allow_background_desaturation: candidate.allow_background_desaturation ?? false,
    allow_guided_zoom: candidate.allow_guided_zoom ?? false,
    allow_tracked_annotation: candidate.allow_tracked_annotation ?? false,
    fallback_policy: candidate.fallback_policy || 'fallback_to_prompted_generation',
  };
}

function looksLikeMotionGraphic(shot: PlannedShot): boolean {
  if (shot.media_type === 'motiongraphic') return true;
  if (shot.render_strategy === 'motiongraphic') return true;
  if (shot.mg_mode || shot.template_type || shot.persistent_graphic_id || shot.persistent_graphic_type) {
    return true;
  }

  const corpus = normalizeWhitespace([
    shot.summary,
    shot.visual_description,
    shot.subject_focus,
    shot.bridge_subject,
    shot.visual_motif,
    shot.stock_search_query,
  ].join(' ')).toLowerCase();

  return MOTION_GRAPHIC_KEYWORDS.some(keyword => corpus.includes(keyword));
}

function shouldUseSegmentationAnimate(
  shot: PlannedShot,
  treatment: PlannedShot['segmentation_treatment'],
): boolean {
  if (treatment?.execution_mode === 'segment_animate') return true;
  if (!treatment) return false;
  if (treatment.execution_mode === 'segment_mask_prep') return false;
  if (shot.media_type !== 'image') return false;

  return Boolean(
    treatment.preset
    || treatment.object_prompts.length > 0
    || treatment.allow_guided_zoom
    || treatment.allow_background_desaturation
    || treatment.allow_tracked_annotation
    || treatment.operations.length > 0
  );
}

function normalizeAngleChange(
  enabled: boolean,
  angleChange: string | undefined,
): string | undefined {
  if (!enabled) return undefined;
  const normalized = truncateWords(normalizeWhitespace(angleChange), 12);
  return normalized || undefined;
}

function inferSegmentationSubject(shot: PlannedShot): string | undefined {
  const explicit = normalizeWhitespace(shot.subject_focus);
  if (explicit) return explicit;

  const fallback = normalizeWhitespace(
    shot.summary || shot.visual_description || shot.text || shot.bridge_subject || shot.visual_motif
  );
  return truncateWords(fallback, 6) || undefined;
}

function shouldAutoPromoteSegmentation(shot: PlannedShot): boolean {
  if (shot.media_type !== 'image') return false;
  if (shot.stock_worthy) return false;
  if (looksLikeMotionGraphic(shot)) return false;

  const beat = shot.narrative_beat || 'detail';
  const corpus = normalizeWhitespace(
    [
      shot.summary,
      shot.visual_description,
      shot.text,
      shot.subject_focus,
      shot.bridge_subject,
    ].filter(Boolean).join(' ')
  ).toLowerCase();
  const hasDirectiveCue = /\b(highlight|spotlight|isolate|callout|annotation|annotate|reveal|focus|zoom into)\b/.test(corpus);
  const hasDetailCue = SEGMENTATION_DETAIL_KEYWORDS.some((keyword) => corpus.includes(keyword));
  const hasSubject = Boolean(inferSegmentationSubject(shot));

  return hasSubject && (
    beat === 'detail'
    || beat === 'reveal'
    || beat === 'reaction'
    || hasDirectiveCue
    || hasDetailCue
  );
}

function buildAutoSegmentationTreatment(
  shot: PlannedShot,
): PlannedShot['segmentation_treatment'] {
  const subjectFocus = inferSegmentationSubject(shot);
  if (!subjectFocus) return undefined;

  const beat = shot.narrative_beat || 'detail';
  const preset = beat === 'detail'
    ? 'detail_callout'
    : beat === 'reveal' || beat === 'climax'
      ? 'focus_reveal'
      : 'subject_isolation';

  return normalizeSegmentationTreatment({
    execution_mode: 'segment_animate',
    preset,
    target_mode: 'object_prompts',
    object_prompts: [
      {
        label: subjectFocus,
        text: subjectFocus,
      },
    ],
    subject_focus: subjectFocus,
    notes: `Auto-promoted editorial emphasis for ${beat} beat`,
    intensity: beat === 'climax' ? 'strong' : 'moderate',
    allow_guided_zoom: true,
    allow_background_desaturation: beat !== 'detail',
    allow_tracked_annotation: beat === 'detail' || beat === 'reveal',
    fallback_policy: 'fallback_to_source_media',
  }, {
    subjectFocus,
    notes: shot.summary,
  });
}

export function normalizePlannedShotForProduction(shot: PlannedShot): PlannedShot {
  const explicitSegmentationTreatment = normalizeSegmentationTreatment(shot.segmentation_treatment, {
    subjectFocus: shot.subject_focus,
    notes: shot.summary,
  });
  const segmentationTreatment = explicitSegmentationTreatment
    || (shouldAutoPromoteSegmentation(shot) ? buildAutoSegmentationTreatment(shot) : undefined);

  let mediaType = shot.media_type;
  let renderStrategy = shot.render_strategy;
  let synthesisMode = shot.synthesis_mode;
  const continuityRequested = Boolean(shot.continuity_from_previous);
  let angleChange = normalizeAngleChange(continuityRequested, shot.angle_change);

  if (looksLikeMotionGraphic(shot)) {
    mediaType = 'motiongraphic';
    renderStrategy = 'motiongraphic';
    synthesisMode = undefined;
    angleChange = undefined;
  } else if (shot.media_type === 'image' || renderStrategy === 'ai_image') {
    if (shouldUseSegmentationAnimate(shot, segmentationTreatment)) {
      renderStrategy = 'segment_animate';
      mediaType = 'image';
      synthesisMode = undefined;
      angleChange = undefined;
    } else {
      mediaType = 'video';
      renderStrategy = 'ai_video';
      synthesisMode = continuityRequested && angleChange ? 'I2V' : 'T2V';
    }
  } else {
    mediaType = 'video';
    if (segmentationTreatment?.execution_mode === 'segment_video_fx') {
      renderStrategy = 'segment_video_fx';
    } else if (renderStrategy !== 'segment_video_fx' && renderStrategy !== 'motiongraphic') {
      renderStrategy = 'ai_video';
    }
    synthesisMode = continuityRequested && angleChange ? 'I2V' : (synthesisMode || 'T2V');
  }

  if (segmentationTreatment?.execution_mode === 'segment_mask_prep' && shot.render_strategy === 'segment_mask_prep') {
    renderStrategy = mediaType === 'motiongraphic' ? 'motiongraphic' : 'ai_video';
  }

  if (!continuityRequested || synthesisMode !== 'I2V') {
    angleChange = undefined;
  }

  return {
    ...shot,
    media_type: mediaType,
    render_strategy: renderStrategy,
    synthesis_mode: synthesisMode,
    continuity_from_previous: continuityRequested && synthesisMode === 'I2V',
    angle_change: angleChange,
    segmentation_treatment: segmentationTreatment,
  };
}
