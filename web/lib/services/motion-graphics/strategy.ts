import type {
  GraphicStatePatch,
  MotionGraphicsMode,
  MotionGraphicsTemplateType,
  PersistentGraphicType,
  RoutingTag,
} from '@/types/video';

export interface MotionGraphicsStrategyInput {
  prompt?: string;
  routingTags?: RoutingTag[];
  contextHint?: string;
  requestedMode?: MotionGraphicsMode;
  requestedTemplateType?: MotionGraphicsTemplateType;
  imageCount?: number;
  persistentGraphicType?: PersistentGraphicType;
}

const MAP_KEYWORDS = /\b(map|route|travel|location|geography|country|city|world|globe|border|capital)\b/i;
const TIMELINE_KEYWORDS = /\b(timeline|history|sequence|step|progression|before|after|then|event|era|phase)\b/i;
const DOCUMENT_KEYWORDS = /\b(document|memo|email|report|file|dossier|screenshot|headline|paper|article|record)\b/i;
const EVIDENCE_KEYWORDS = /\b(evidence|crime|investigation|suspect|clue|board|relationship|conspiracy|case|profile)\b/i;
const COMPARISON_KEYWORDS = /\b(compare|comparison|versus|vs\.?|before\/after|before and after|side by side|contrast)\b/i;
const QUOTE_KEYWORDS = /\b(quote|statement|said|says|according to|caption|callout)\b/i;
const LOWER_THIRD_KEYWORDS = /\b(lower third|location tag|name card|chapter slate|title card|overlay|badge|label)\b/i;
const PROCESS_KEYWORDS = /\b(process|pipeline|system|flow|mechanism|how it works|diagram|architecture)\b/i;
const MONTAGE_KEYWORDS = /\b(montage|collage|parallax|photo|gallery|album|evidence wall|scrapbook)\b/i;
const DOSSIER_KEYWORDS = /\b(dossier|character dossier|portrait card|profile card|status stamp|editorial stamp|character card)\b/i;
const TERRITORY_KEYWORDS = /\b(territory map|territory|faction map|faction zone|conquest|civil war zone|control zone|spread zone)\b/i;
const SLAP_ANNOTATION_KEYWORDS = /\b(slap annotation|annotation slam|masking tape|torn paper|stamp reveal|slap stamp|editorial overlay)\b/i;
const GHOST_FIGURE_KEYWORDS = /\b(ghost figure|ghost placeholder|translucent figure|silhouette|absent character|ghost reveal)\b/i;

/** Generic contextHint values that should NOT influence template type routing */
const GENERIC_CONTEXT_HINTS = new Set([
  'text/graphics overlay',
  'image manipulation with ken burns/montage',
  'video annotation/overlay',
]);

export function isTemplateCandidate(input: MotionGraphicsStrategyInput): boolean {
  if (input.requestedMode === 'template') return true;
  if (input.requestedMode === 'freeform') return false;
  if (input.requestedTemplateType) return true;
  if (input.persistentGraphicType) return true;

  // Filter out generic contextHint values that contain keywords like 'overlay'
  // which would incorrectly match LOWER_THIRD_KEYWORDS and mis-route the template
  const filteredHint = input.contextHint && !GENERIC_CONTEXT_HINTS.has(input.contextHint.toLowerCase())
    ? input.contextHint : undefined;
  const prompt = [input.prompt, filteredHint].filter(Boolean).join(' ');
  const routingTags = input.routingTags || [];

  if (routingTags.includes('remotion_image_manipulation')) return true;
  if (routingTags.includes('remotion_video_manipulation')) return true;
  if (routingTags.includes('remotion_overlay') && input.imageCount && input.imageCount > 0) return true;

  return (
    MAP_KEYWORDS.test(prompt) ||
    TERRITORY_KEYWORDS.test(prompt) ||
    DOSSIER_KEYWORDS.test(prompt) ||
    SLAP_ANNOTATION_KEYWORDS.test(prompt) ||
    GHOST_FIGURE_KEYWORDS.test(prompt) ||
    TIMELINE_KEYWORDS.test(prompt) ||
    DOCUMENT_KEYWORDS.test(prompt) ||
    EVIDENCE_KEYWORDS.test(prompt) ||
    COMPARISON_KEYWORDS.test(prompt) ||
    QUOTE_KEYWORDS.test(prompt) ||
    LOWER_THIRD_KEYWORDS.test(prompt) ||
    PROCESS_KEYWORDS.test(prompt) ||
    MONTAGE_KEYWORDS.test(prompt) ||
    (input.imageCount || 0) > 1
  );
}

export function inferTemplateType(input: MotionGraphicsStrategyInput): MotionGraphicsTemplateType {
  if (input.requestedTemplateType) return input.requestedTemplateType;

  const filteredHint = input.contextHint && !GENERIC_CONTEXT_HINTS.has(input.contextHint.toLowerCase())
    ? input.contextHint : undefined;
  const prompt = [input.prompt, filteredHint].filter(Boolean).join(' ');
  const persistentType = input.persistentGraphicType;

  if (persistentType) {
    const mapped = templateTypeFromPersistentGraphicType(persistentType);
    if (mapped) return mapped;
  }

  // New types take priority — check before general keyword rules to avoid mis-routing
  if (DOSSIER_KEYWORDS.test(prompt)) return 'character_dossier';
  if (TERRITORY_KEYWORDS.test(prompt)) return 'territory_map';
  if (SLAP_ANNOTATION_KEYWORDS.test(prompt)) return 'slap_annotation';
  if (GHOST_FIGURE_KEYWORDS.test(prompt)) return 'ghost_figure_reveal';

  if (MAP_KEYWORDS.test(prompt)) return /route|travel|path|journey|flight/i.test(prompt) ? 'route_trace' : 'map_focus';
  if (TIMELINE_KEYWORDS.test(prompt)) return 'timeline';
  if (PROCESS_KEYWORDS.test(prompt)) return 'process_diagram';
  if (COMPARISON_KEYWORDS.test(prompt)) return 'comparison_board';
  if (DOCUMENT_KEYWORDS.test(prompt)) return 'document_callout';
  if (EVIDENCE_KEYWORDS.test(prompt)) return 'evidence_board';
  if (QUOTE_KEYWORDS.test(prompt)) return 'quote_card';
  if (LOWER_THIRD_KEYWORDS.test(prompt)) return 'lower_third';
  if (MONTAGE_KEYWORDS.test(prompt) || (input.imageCount || 0) > 1) return 'photo_montage';

  if ((input.routingTags || []).includes('remotion_video_manipulation')) return 'lower_third';
  if ((input.routingTags || []).includes('remotion_overlay')) return 'lower_third';

  return 'photo_montage';
}

export function resolveMotionGraphicsMode(
  input: MotionGraphicsStrategyInput
): MotionGraphicsMode {
  if (input.requestedMode) return input.requestedMode;
  return isTemplateCandidate(input) ? 'template' : 'freeform';
}

export function templateTypeFromPersistentGraphicType(
  persistentGraphicType?: PersistentGraphicType
): MotionGraphicsTemplateType | undefined {
  switch (persistentGraphicType) {
    case 'crime_board':
    case 'relationship_board':
    case 'investigation_wall':
    case 'evidence_dossier':
      return 'evidence_board';
    case 'timeline_board':
    case 'state_of_story':
      return 'timeline';
    case 'route_map':
      return 'route_trace';
    case 'entity_comparison':
      return 'comparison_board';
    default:
      return undefined;
  }
}

export function getRecommendedPlaceholderCount(
  templateType: MotionGraphicsTemplateType,
  requestedImageCount: number = 1
): number {
  const requested = Math.max(1, requestedImageCount || 1);

  switch (templateType) {
    case 'comparison_board':
      return Math.max(2, requested);
    case 'evidence_board':
    case 'photo_montage':
      return Math.max(3, requested);
    case 'timeline':
    case 'document_callout':
    case 'route_trace':
    case 'map_focus':
    case 'territory_map':
      return Math.max(2, requested);
    case 'character_dossier':
    case 'slap_annotation':
    case 'ghost_figure_reveal':
      return Math.max(1, requested);
    default:
      return requested;
  }
}

export function hasMeaningfulGraphicPatch(
  patch?: GraphicStatePatch | null
): boolean {
  if (!patch) return false;
  return Boolean(
    patch.headline ||
    patch.focus_label ||
    patch.status ||
    (patch.notes && patch.notes.length > 0) ||
    (patch.add_labels && patch.add_labels.length > 0) ||
    (patch.remove_labels && patch.remove_labels.length > 0)
  );
}
