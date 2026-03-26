import { z } from 'zod';
import { callOpenRouterWithKey } from '@/lib/ai/openrouter';
import type {
  GraphicStatePatch,
  MotionGraphicsAssetBundleItem,
  MotionGraphicsMode,
  MotionGraphicsTemplateType,
  PersistentGraphicType,
  PersistentMotionGraphicState,
  RoutingTag,
} from '@/types/video';
import { MOTION_GRAPHICS_TEMPLATE_TYPES } from '@/types/video';
import {
  inferTemplateType,
  resolveMotionGraphicsMode,
  templateTypeFromPersistentGraphicType,
} from './strategy';

const OverlayModeSchema = z.enum(['standalone', 'image', 'video']);
const TemplateItemSchema = z.object({
  label: z.string(),
  detail: z.string().optional(),
  asset_index: z.number().int().min(0).optional(),
  emphasis: z.enum(['normal', 'highlighted', 'dim']).optional(),
});

const TimelineEntrySchema = z.object({
  label: z.string(),
  detail: z.string().optional(),
});

const TemplateSpecSchema = z.object({
  template_type: z.enum(MOTION_GRAPHICS_TEMPLATE_TYPES),
  overlay_mode: OverlayModeSchema.optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  caption: z.string().optional(),
  accent_color: z.string().optional(),
  notes: z.array(z.string()).optional(),
  items: z.array(TemplateItemSchema).optional(),
  timeline_entries: z.array(TimelineEntrySchema).optional(),
  location_labels: z.array(z.string()).optional(),
  highlight_label: z.string().optional(),
});

type TemplateSpec = z.infer<typeof TemplateSpecSchema>;

export interface TemplateLaneRequest {
  prompt: string;
  duration: number;
  shotIndex: number;
  apiKey: string;
  model: string;
  routingTags?: RoutingTag[];
  contextHint?: string;
  narrationText?: string;
  imageAssets?: Array<{
    url: string;
    description: string;
    suggestedUsage: string;
  }>;
  requestedMode?: MotionGraphicsMode;
  requestedTemplateType?: MotionGraphicsTemplateType;
  mgAssetBundle?: MotionGraphicsAssetBundleItem[];
  persistentGraphic?: {
    id: string;
    type: PersistentGraphicType;
    statePatch?: GraphicStatePatch;
    previousState?: PersistentMotionGraphicState;
  };
  simplifiedRetry?: boolean;
}

export interface TemplateLaneResult {
  success: boolean;
  remotionCode?: string;
  error?: string;
  templateType: MotionGraphicsTemplateType;
  mgMode: MotionGraphicsMode;
  persistentGraphicState?: PersistentMotionGraphicState;
}

function safeJsonParse<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        return null;
      }
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function inferOverlayMode(
  routingTags: RoutingTag[] = [],
  contextHint?: string,
): z.infer<typeof OverlayModeSchema> {
  const hint = contextHint || '';
  if (routingTags.includes('remotion_video_manipulation') || /video annotation|overlay/i.test(hint)) {
    return 'video';
  }
  if (routingTags.includes('remotion_image_manipulation') || /image manipulation/i.test(hint)) {
    return 'image';
  }
  return 'standalone';
}

function truncate(input: string | undefined, maxLength: number): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3).trim()}...`;
}

const GENERIC_CONTEXT_HINTS = new Set([
  'text/graphics overlay',
  'image manipulation with ken burns/montage',
  'video annotation/overlay',
]);

const LABEL_STOPWORDS = new Set([
  'Wide',
  'Close',
  'Medium',
  'Extreme',
  'Long',
  'Shot',
  'Angle',
  'Overlay',
  'Graphics',
  'Text',
  'Visual',
  'Temporary',
]);

function meaningfulContextHint(contextHint: string | undefined): string | undefined {
  if (!contextHint) return undefined;
  const trimmed = contextHint.trim();
  if (!trimmed) return undefined;
  return GENERIC_CONTEXT_HINTS.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

function extractLikelyLabels(text: string | undefined, maxCount: number = 4): string[] {
  if (!text) return [];

  const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [];
  const unique = new Set<string>();
  for (const label of capitalized) {
    const normalized = label.trim();
    if (normalized.length < 3) continue;
    if (LABEL_STOPWORDS.has(normalized)) continue;
    unique.add(normalized);
    if (unique.size >= maxCount) break;
  }
  return [...unique];
}

function splitIntoNotes(text: string | undefined, maxCount: number = 3): string[] {
  if (!text) return [];
  return text
    .split(/[.!?]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxCount)
    .map((part) => truncate(part, 72) || part);
}

function toAssetBundle(request: TemplateLaneRequest): MotionGraphicsAssetBundleItem[] {
  if (request.mgAssetBundle && request.mgAssetBundle.length > 0) {
    return request.mgAssetBundle;
  }

  const overlayMode = inferOverlayMode(request.routingTags, request.contextHint);

  return (request.imageAssets || []).map((asset, index) => {
    const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(asset.url);
    const isPlaceholder = asset.url.startsWith('placeholder://');
    const assetKind = isPlaceholder
      ? 'placeholder'
      : (overlayMode === 'video' && isVideo ? 'video_context' : (isVideo ? 'video' : 'image'));

    return {
      id: `asset-${index}`,
      url: asset.url,
      asset_kind: assetKind,
      label: truncate(asset.description, 48),
      usage: truncate(asset.suggestedUsage, 80),
      description: truncate(asset.description, 120),
      source: isPlaceholder ? 'placeholder' : 'generated',
    };
  });
}

function responseFormat() {
  const schema = z.toJSONSchema(TemplateSpecSchema);
  const { $schema: _, ...structuralSchema } = schema as Record<string, unknown>;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'motion_graphics_template_spec',
      strict: true,
      schema: structuralSchema,
    },
  };
}

async function generateTemplateSpec(
  request: TemplateLaneRequest,
  templateType: MotionGraphicsTemplateType,
  assetBundle: MotionGraphicsAssetBundleItem[],
  overlayMode: z.infer<typeof OverlayModeSchema>,
): Promise<TemplateSpec | null> {
  const previousState = request.persistentGraphic?.previousState;
  const statePatch = request.persistentGraphic?.statePatch;

  const systemPrompt = `You generate JSON specs for deterministic Remotion documentary templates.

Rules:
- Output ONLY JSON matching the provided schema.
- Keep text concise and production-friendly.
- Prefer the provided asset bundle over inventing new media.
- If overlay_mode is "video", DO NOT assume you should render the base video inside the template. The video already exists beneath the overlay.
- If a persistent graphic state is provided, evolve it rather than reinventing it.
- Reuse asset_index values from the provided asset bundle where helpful.
- The "Context hint" field is internal pipeline metadata about the type of graphic — NEVER use it as visible text in the title, subtitle, or any other user-facing field. Derive titles and subtitles from the narration text and prompt content instead.

Template families:
- map_focus: world/regional map backdrop with location chips and context labels
- route_trace: route/travel progression graphic with destination labels
- timeline: linear progression of events or beats
- evidence_board: board/wall/card layout with multiple evidence items
- document_callout: single doc/screenshot with annotations and side notes
- quote_card: typographic quote or statement card
- lower_third: transparent or semi-transparent title/location/identity overlay
- photo_montage: layered image composition using multiple stills
- comparison_board: side-by-side comparison with 2-3 key points
- process_diagram: boxes/arrows explaining a system or flow`;

  const userPrompt = [
    `Template type: ${templateType}`,
    `Overlay mode: ${overlayMode}`,
    `Prompt: ${request.prompt}`,
    meaningfulContextHint(request.contextHint) ? `Context hint: ${meaningfulContextHint(request.contextHint)}` : '',
    request.narrationText ? `Narration: ${request.narrationText}` : '',
    assetBundle.length > 0
      ? `Asset bundle:\n${assetBundle.map((asset, index) =>
          `- [${index}] ${asset.asset_kind}: ${asset.label || asset.id} | usage=${asset.usage || 'general'} | url=${asset.url}`
        ).join('\n')}`
      : 'Asset bundle: []',
    previousState
      ? `Previous persistent graphic state:\n${JSON.stringify(previousState, null, 2)}`
      : '',
    statePatch
      ? `Graphic state patch:\n${JSON.stringify(statePatch, null, 2)}`
      : '',
  ].filter(Boolean).join('\n\n');

  const response = await callOpenRouterWithKey(
    request.apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      model: request.model || 'google/gemini-3-flash-preview',
      temperature: 0.1,
      maxTokens: 65536,
      xTitle: 'Vid-Bolt MG Templates',
      responseFormat: responseFormat() as any,
    },
  );

  const parsed = safeJsonParse<unknown>(response.content);
  if (!parsed) return null;

  const result = TemplateSpecSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function heuristicTemplateSpec(
  request: TemplateLaneRequest,
  templateType: MotionGraphicsTemplateType,
  assetBundle: MotionGraphicsAssetBundleItem[],
  overlayMode: z.infer<typeof OverlayModeSchema>,
): TemplateSpec {
  const preferredContextHint = meaningfulContextHint(request.contextHint);
  const title = truncate(
    request.persistentGraphic?.statePatch?.headline ||
    request.persistentGraphic?.previousState?.title ||
    request.narrationText ||
    request.prompt ||
    preferredContextHint,
    overlayMode === 'video' ? 44 : 72,
  );

  const subtitle = truncate(
    request.persistentGraphic?.previousState?.subtitle ||
    request.prompt ||
    preferredContextHint,
    96,
  );

  const notes = [
    ...(request.persistentGraphic?.previousState?.notes || []),
    ...(request.persistentGraphic?.statePatch?.notes || []),
    ...splitIntoNotes(request.narrationText || request.prompt, 3),
  ].filter(Boolean).slice(0, 4);

  const priorItems = request.persistentGraphic?.previousState?.items || [];
  const assetItems = assetBundle.slice(0, 4).map((asset, index) => ({
    label: asset.label || `Asset ${index + 1}`,
    detail: truncate(asset.description || asset.usage, 56),
    asset_index: index,
    emphasis: index === 0 ? 'highlighted' as const : 'normal' as const,
  }));

  const mergedLabels = [
    ...(request.persistentGraphic?.statePatch?.add_labels || []),
    ...extractLikelyLabels(request.prompt, 3),
  ];

  const items = [...priorItems, ...assetItems]
    .map((item) => ({
      label: item.label,
      detail: item.detail,
      asset_index: item.asset_index,
      emphasis: item.emphasis || 'normal',
    }))
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.label === item.label) === index)
    .slice(0, 5);

  if (items.length === 0 && mergedLabels.length > 0) {
    items.push(...mergedLabels.map((label, index) => ({
      label,
      detail: undefined,
      asset_index: index < assetBundle.length ? index : undefined,
      emphasis: index === 0 ? 'highlighted' as const : 'normal' as const,
    })));
  }

  const timelineEntries = splitIntoNotes(request.narrationText || request.prompt, 4)
    .map((entry, index) => ({
      label: `Beat ${index + 1}`,
      detail: entry,
    }));

  const locationLabels = [
    ...(request.persistentGraphic?.previousState?.items || []).map((item) => item.label),
    ...extractLikelyLabels(request.prompt, 4),
  ].filter((value, index, arr) => arr.indexOf(value) === index).slice(0, 4);

  return {
    template_type: templateType,
    overlay_mode: overlayMode,
    title,
    subtitle,
    caption: truncate(request.narrationText || request.prompt, 110),
    accent_color: overlayMode === 'video' ? '#f59e0b' : '#7c3aed',
    notes,
    items,
    timeline_entries: timelineEntries,
    location_labels: locationLabels,
    highlight_label: request.persistentGraphic?.statePatch?.focus_label || locationLabels[0] || items[0]?.label,
  };
}

function escape(value: unknown): string {
  return JSON.stringify(value);
}

function backgroundForOverlayMode(overlayMode: z.infer<typeof OverlayModeSchema>): string {
  return overlayMode === 'standalone'
    ? "linear-gradient(135deg, #0b1020 0%, #111827 45%, #1f2937 100%)"
    : 'transparent';
}

function renderLowerThird(spec: TemplateSpec): string {
  const overlayMode = spec.overlay_mode || 'standalone';
  return `import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'Untitled')};
const SUBTITLE = ${escape(spec.subtitle || spec.caption || '')};
const ACCENT = ${escape(spec.accent_color || '#f59e0b')};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const translateY = 80 - progress * 80;
  const opacity = Math.max(0, Math.min(1, progress));

  return (
    <AbsoluteFill style={{ background: ${escape(backgroundForOverlayMode(overlayMode))} }}>
      <div
        style={{
          position: 'absolute',
          left: Math.max(48, width * 0.06),
          bottom: Math.max(44, height * 0.08),
          minWidth: Math.min(width * 0.52, 760),
          padding: '18px 22px',
          borderRadius: 20,
          background: 'rgba(7, 12, 24, 0.78)',
          border: \`1px solid \${ACCENT}\`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          transform: \`translateY(\${translateY}px)\`,
          opacity,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ width: 64, height: 4, borderRadius: 999, background: ACCENT, marginBottom: 12 }} />
        <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>{TITLE}</div>
        {SUBTITLE ? (
          <div style={{ color: 'rgba(226,232,240,0.88)', fontSize: 18, lineHeight: 1.35, marginTop: 6 }}>{SUBTITLE}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function deriveQuoteCategory(spec: TemplateSpec): string {
  // Derive a meaningful category label from the spec data
  // instead of hardcoding a generic label
  const notes = spec.notes || [];
  if (notes.length > 0) {
    // Use first note as category if short enough
    const firstNote = notes[0].trim();
    if (firstNote.length <= 30) return firstNote.toUpperCase();
  }
  // Derive from highlight_label if available
  if (spec.highlight_label) return spec.highlight_label.toUpperCase();
  // Fallback to a generic but contextual label
  return '✦';
}

function renderQuoteCard(spec: TemplateSpec): string {
  const overlayMode = spec.overlay_mode || 'standalone';
  const cardBackground =
    overlayMode === 'standalone' ? 'rgba(15,23,42,0.88)' : 'rgba(15,23,42,0.74)';
  const category = deriveQuoteCategory(spec);
  return `import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || spec.caption || 'Quote')};
const SUBTITLE = ${escape(spec.subtitle || '')};
const ACCENT = ${escape(spec.accent_color || '#7c3aed')};
const CATEGORY = ${escape(category)};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const opacity = interpolate(progress, [0, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(progress, [0, 1], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: ${escape(backgroundForOverlayMode(overlayMode))},
        alignItems: 'center',
        justifyContent: 'center',
        padding: 64,
      }}
    >
      <div
        style={{
          width: Math.min(width * 0.78, 900),
          padding: '34px 40px',
          borderRadius: 28,
          background: ${escape(cardBackground)},
          border: \`1px solid \${ACCENT}\`,
          boxShadow: '0 18px 48px rgba(0,0,0,0.26)',
          opacity,
          transform: \`translateY(\${y}px)\`,
        }}
      >
        <div style={{ fontSize: 20, color: ACCENT, fontWeight: 700, marginBottom: 18 }}>{CATEGORY}</div>
        <div style={{ fontSize: 42, lineHeight: 1.2, color: '#f8fafc', fontWeight: 700, letterSpacing: '-0.03em' }}>{TITLE}</div>
        {SUBTITLE ? (
          <div style={{ marginTop: 18, fontSize: 20, lineHeight: 1.45, color: 'rgba(226,232,240,0.88)' }}>{SUBTITLE}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderPhotoMontage(spec: TemplateSpec, assetBundle: MotionGraphicsAssetBundleItem[]): string {
  const items = (spec.items || []).slice(0, 4).map((item, index) => ({
    label: item.label,
    detail: item.detail || '',
    url: assetBundle[item.asset_index ?? index]?.url || assetBundle[index]?.url || '',
  }));

  return `import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const ITEMS = ${escape(items)};
const TITLE = ${escape(spec.title || 'Visual Montage')};
const SUBTITLE = ${escape(spec.subtitle || spec.caption || '')};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const titleProgress = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #111827 52%, #1e293b 100%)',
        padding: 42,
      }}
    >
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700, marginBottom: 12, opacity: titleProgress }}>{TITLE}</div>
      {SUBTITLE ? <div style={{ color: 'rgba(226,232,240,0.82)', fontSize: 18, marginBottom: 18 }}>{SUBTITLE}</div> : null}
      {ITEMS.map((item, index) => {
        const progress = spring({
          frame: frame - index * 5,
          fps,
          config: { damping: 16, stiffness: 110 },
        });
        const cardWidth = width * 0.32;
        const cardHeight = height * 0.48;
        const positions = [
          { left: width * 0.06, top: height * 0.18, rotate: -6 },
          { left: width * 0.36, top: height * 0.12, rotate: 4 },
          { left: width * 0.58, top: height * 0.26, rotate: -3 },
          { left: width * 0.18, top: height * 0.56, rotate: 3 },
        ];
        const pos = positions[index % positions.length];
        const scale = interpolate(progress, [0, 1], [0.92, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div
            key={item.label + index}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: cardWidth,
              height: cardHeight,
              transform: \`scale(\${scale}) rotate(\${pos.rotate}deg)\`,
              opacity: progress,
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 18px 48px rgba(0,0,0,0.34)',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(15,23,42,0.9)',
            }}
          >
            {item.url ? <Img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '14px 16px',
                background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.92) 100%)',
              }}
            >
              <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 700 }}>{item.label}</div>
              {item.detail ? <div style={{ color: 'rgba(226,232,240,0.86)', fontSize: 14, marginTop: 4 }}>{item.detail}</div> : null}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderComparisonBoard(spec: TemplateSpec, assetBundle: MotionGraphicsAssetBundleItem[]): string {
  const items = (spec.items || []).slice(0, 2).map((item, index) => ({
    label: item.label,
    detail: item.detail || '',
    url: assetBundle[item.asset_index ?? index]?.url || assetBundle[index]?.url || '',
  }));

  return `import React from 'react';
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const ITEMS = ${escape(items)};
const TITLE = ${escape(spec.title || 'Comparison')};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #0b1220 0%, #111827 100%)', padding: 42 }}>
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700, marginBottom: 24 }}>{TITLE}</div>
      <div style={{ display: 'flex', gap: 22, height: height - 140 }}>
        {ITEMS.map((item, index) => (
          <div
            key={item.label + index}
            style={{
              flex: 1,
              borderRadius: 28,
              overflow: 'hidden',
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(255,255,255,0.08)',
              transform: \`translateY(\${(1 - progress) * 18}px)\`,
              opacity: progress,
            }}
          >
            {item.url ? (
              <Img src={item.url} style={{ width: '100%', height: '70%', objectFit: 'cover' }} />
            ) : (
              <div style={{ height: '70%', background: 'linear-gradient(135deg, #1e293b, #334155)' }} />
            )}
            <div style={{ padding: 20 }}>
              <div style={{ color: '#f8fafc', fontSize: 24, fontWeight: 700 }}>{item.label}</div>
              {item.detail ? <div style={{ color: 'rgba(226,232,240,0.86)', fontSize: 16, lineHeight: 1.4, marginTop: 8 }}>{item.detail}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderDocumentCallout(spec: TemplateSpec, assetBundle: MotionGraphicsAssetBundleItem[]): string {
  const primaryUrl = assetBundle[spec.items?.[0]?.asset_index ?? 0]?.url || assetBundle[0]?.url || '';
  const notes = (spec.notes || []).slice(0, 3);

  return `import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'Document Analysis')};
const SUBTITLE = ${escape(spec.subtitle || spec.caption || '')};
const PRIMARY_URL = ${escape(primaryUrl)};
const NOTES = ${escape(notes)};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const scanX = interpolate(frame, [0, Math.max(1, Math.round(fps * 2))], [width * 0.12, width * 0.48], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #111827 0%, #0f172a 100%)', padding: 34 }}>
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700 }}>{TITLE}</div>
      {SUBTITLE ? <div style={{ color: 'rgba(226,232,240,0.84)', fontSize: 18, marginTop: 8 }}>{SUBTITLE}</div> : null}
      <div style={{ display: 'flex', gap: 26, marginTop: 26, height: height - 140 }}>
        <div style={{ flex: 1.3, position: 'relative', borderRadius: 26, overflow: 'hidden', background: '#0b1220' }}>
          {PRIMARY_URL ? <Img src={PRIMARY_URL} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          <div style={{ position: 'absolute', left: scanX, top: height * 0.18, width: Math.max(18, width * 0.01), height: height * 0.38, background: 'rgba(245,158,11,0.16)', border: '2px solid rgba(245,158,11,0.8)', borderRadius: 16, opacity: progress }} />
        </div>
        <div style={{ flex: 0.9, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {NOTES.map((note, index) => {
            const cardProgress = spring({ frame: frame - index * 5, fps, config: { damping: 18, stiffness: 110 } });
            return (
              <div
                key={note + index}
                style={{
                  padding: '18px 20px',
                  borderRadius: 20,
                  background: 'rgba(15,23,42,0.88)',
                  border: '1px solid rgba(245,158,11,0.35)',
                  opacity: cardProgress,
                  transform: \`translateY(\${(1 - cardProgress) * 18}px)\`,
                }}
              >
                <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>CALLOUT {index + 1}</div>
                <div style={{ color: '#f8fafc', fontSize: 18, lineHeight: 1.4, marginTop: 8 }}>{note}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderEvidenceBoard(spec: TemplateSpec, assetBundle: MotionGraphicsAssetBundleItem[]): string {
  const items = (spec.items || []).slice(0, 5).map((item, index) => ({
    label: item.label,
    detail: item.detail || '',
    url: assetBundle[item.asset_index ?? index]?.url || assetBundle[index]?.url || '',
    emphasis: item.emphasis || 'normal',
  }));

  return `import React from 'react';
import { AbsoluteFill, Img, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'Evidence Board')};
const ITEMS = ${escape(items)};
const NOTES = ${escape((spec.notes || []).slice(0, 3))};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const boardColor = '#2b2118';
  const positions = [
    { left: width * 0.06, top: height * 0.16, rotate: -6 },
    { left: width * 0.36, top: height * 0.14, rotate: 3 },
    { left: width * 0.62, top: height * 0.2, rotate: -3 },
    { left: width * 0.2, top: height * 0.52, rotate: 4 },
    { left: width * 0.54, top: height * 0.56, rotate: -4 },
  ];

  return (
    <AbsoluteFill style={{ background: boardColor, padding: 32 }}>
      <div style={{ color: '#fef3c7', fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }}>{TITLE}</div>
      {ITEMS.map((item, index) => {
        const progress = spring({ frame: frame - index * 4, fps, config: { damping: 16, stiffness: 110 } });
        const pos = positions[index % positions.length];
        const widthPx = width * 0.24;
        const heightPx = height * 0.28;
        const isHighlighted = item.emphasis === 'highlighted';

        return (
          <div
            key={item.label + index}
            style={{
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: widthPx,
              height: heightPx,
              padding: 12,
              background: isHighlighted ? '#fef3c7' : '#faf5e4',
              borderRadius: 12,
              boxShadow: '0 18px 30px rgba(0,0,0,0.28)',
              transform: \`scale(\${0.94 + progress * 0.06}) rotate(\${pos.rotate}deg)\`,
              opacity: progress,
            }}
          >
            {item.url ? <Img src={item.url} style={{ width: '100%', height: '74%', objectFit: 'cover', borderRadius: 8 }} /> : null}
            <div style={{ color: '#111827', fontSize: 16, fontWeight: 700, marginTop: 10 }}>{item.label}</div>
            {item.detail ? <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.35, marginTop: 4 }}>{item.detail}</div> : null}
          </div>
        );
      })}
      {NOTES.map((note, index) => (
        <div
          key={note + index}
          style={{
            position: 'absolute',
            right: width * 0.05,
            top: height * (0.18 + index * 0.12),
            width: width * 0.22,
            padding: '12px 14px',
            background: '#fde68a',
            color: '#111827',
            borderRadius: 12,
            transform: \`rotate(\${index % 2 === 0 ? -2 : 2}deg)\`,
            boxShadow: '0 10px 24px rgba(0,0,0,0.24)',
            fontSize: 14,
            lineHeight: 1.35,
          }}
        >
          {note}
        </div>
      ))}
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderTimeline(spec: TemplateSpec): string {
  const entries = (spec.timeline_entries || []).slice(0, 4);
  const accent = spec.accent_color || '#38bdf8';

  return `import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'Story Progression')};
const ENTRIES = ${escape(entries)};
const ACCENT = ${escape(accent)};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)', padding: 48 }}>
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700 }}>{TITLE}</div>
      <div style={{ position: 'absolute', left: width * 0.1, right: width * 0.1, top: height * 0.55, height: 4, background: 'rgba(148,163,184,0.24)', borderRadius: 999 }} />
      {ENTRIES.map((entry, index) => {
        const progress = spring({ frame: frame - index * 5, fps, config: { damping: 18, stiffness: 120 } });
        const x = width * 0.14 + index * (width * 0.2);
        return (
          <div key={entry.label + index} style={{ position: 'absolute', left: x, top: height * 0.42, width: width * 0.18, opacity: progress }}>
            <div style={{ width: 20, height: 20, borderRadius: 999, background: ACCENT, boxShadow: '0 0 0 6px rgba(56,189,248,0.12)' }} />
            <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700, marginTop: 18 }}>{entry.label}</div>
            {entry.detail ? <div style={{ color: 'rgba(226,232,240,0.84)', fontSize: 15, lineHeight: 1.4, marginTop: 8 }}>{entry.detail}</div> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderMap(spec: TemplateSpec): string {
  const overlayMode = spec.overlay_mode || 'standalone';
  const labels = (spec.location_labels || []).slice(0, 4);
  const accent = spec.accent_color || '#22c55e';

  return `import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'Geographic Context')};
const SUBTITLE = ${escape(spec.subtitle || spec.caption || '')};
const LABELS = ${escape(labels)};
const ACCENT = ${escape(accent)};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const projection = geoNaturalEarth1().fitSize([width * 0.72, height * 0.62], WorldLand);
  const path = geoPath(projection);
  const glow = interpolate(frame, [0, 24, 48], [0.25, 0.9, 0.45], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: ${escape(backgroundForOverlayMode(overlayMode))}, padding: 34 }}>
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700 }}>{TITLE}</div>
      {SUBTITLE ? <div style={{ color: 'rgba(226,232,240,0.82)', fontSize: 18, marginTop: 8 }}>{SUBTITLE}</div> : null}
      <div style={{ position: 'absolute', left: width * 0.06, top: height * 0.18, width: width * 0.68, height: height * 0.66, borderRadius: 28, background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <svg width={width * 0.68} height={height * 0.66}>
          <g transform={\`translate(\${width * 0.02}, \${height * 0.03})\`}>
            {WorldLand.features.map((feature, index) => (
              <path
                key={index}
                d={path(feature) || ''}
                fill="rgba(30,41,59,0.92)"
                stroke="rgba(148,163,184,0.18)"
                strokeWidth={0.8}
              />
            ))}
          </g>
        </svg>
        <div style={{ position: 'absolute', inset: 0, background: \`radial-gradient(circle at 32% 34%, rgba(34,197,94,\${glow * 0.18}), transparent 32%)\` }} />
      </div>
      <div style={{ position: 'absolute', right: width * 0.05, top: height * 0.24, width: width * 0.22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {LABELS.map((label, index) => (
          <div
            key={label + index}
            style={{
              padding: '12px 14px',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.86)',
              border: \`1px solid \${ACCENT}\`,
              color: '#f8fafc',
              fontSize: 16,
              fontWeight: index === 0 ? 700 : 600,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderProcessDiagram(spec: TemplateSpec): string {
  const entries = (spec.timeline_entries || []).slice(0, 4);
  return `import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const TITLE = ${escape(spec.title || 'System Flow')};
const ENTRIES = ${escape(entries)};

export const DynamicAnimation = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)', padding: 42 }}>
      <div style={{ color: '#f8fafc', fontSize: 34, fontWeight: 700 }}>{TITLE}</div>
      {ENTRIES.map((entry, index) => {
        const progress = spring({ frame: frame - index * 6, fps, config: { damping: 18, stiffness: 115 } });
        const top = height * 0.24 + index * 112;
        return (
          <React.Fragment key={entry.label + index}>
            <div
              style={{
                position: 'absolute',
                left: width * 0.12,
                top,
                width: width * 0.32,
                padding: '18px 22px',
                borderRadius: 20,
                background: 'rgba(15,23,42,0.9)',
                border: '1px solid rgba(96,165,250,0.42)',
                color: '#f8fafc',
                opacity: progress,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700 }}>{entry.label}</div>
              {entry.detail ? <div style={{ fontSize: 15, color: 'rgba(226,232,240,0.84)', marginTop: 6 }}>{entry.detail}</div> : null}
            </div>
            {index < ENTRIES.length - 1 ? (
              <div style={{ position: 'absolute', left: width * 0.47, top: top + 36, width: width * 0.12, height: 4, background: 'linear-gradient(90deg, #38bdf8, #60a5fa)', borderRadius: 999 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

export default DynamicAnimation;`;
}

function renderTemplate(spec: TemplateSpec, assetBundle: MotionGraphicsAssetBundleItem[]): string {
  switch (spec.template_type) {
    case 'lower_third':
      return renderLowerThird(spec);
    case 'quote_card':
      return renderQuoteCard(spec);
    case 'comparison_board':
      return renderComparisonBoard(spec, assetBundle);
    case 'document_callout':
      return renderDocumentCallout(spec, assetBundle);
    case 'evidence_board':
      return renderEvidenceBoard(spec, assetBundle);
    case 'timeline':
      return renderTimeline(spec);
    case 'map_focus':
    case 'route_trace':
      return renderMap(spec);
    case 'process_diagram':
      return renderProcessDiagram(spec);
    case 'photo_montage':
    default:
      return renderPhotoMontage(spec, assetBundle);
  }
}

function mergePersistentState(
  request: TemplateLaneRequest,
  templateType: MotionGraphicsTemplateType,
  spec: TemplateSpec,
): PersistentMotionGraphicState | undefined {
  if (!request.persistentGraphic) return undefined;

  const previous = request.persistentGraphic.previousState;
  const currentItems = (spec.items || []).map((item) => ({
    label: item.label,
    detail: item.detail,
    asset_index: item.asset_index,
    emphasis: item.emphasis || 'normal',
  }));

  const mergedNotes = [
    ...(previous?.notes || []),
    ...(spec.notes || []),
  ].filter((note, index, arr) => arr.indexOf(note) === index).slice(0, 6);

  return {
    id: request.persistentGraphic.id,
    type: request.persistentGraphic.type,
    template_type: templateType,
    title: spec.title || previous?.title,
    subtitle: spec.subtitle || previous?.subtitle,
    focus_label: spec.highlight_label || request.persistentGraphic.statePatch?.focus_label || previous?.focus_label,
    notes: mergedNotes,
    items: currentItems.length > 0 ? currentItems : previous?.items,
    updated_at_shot: request.shotIndex,
  };
}

export async function generateTemplateMotionGraphic(
  request: TemplateLaneRequest,
): Promise<TemplateLaneResult> {
  const assetBundle = toAssetBundle(request);
  const mgMode = resolveMotionGraphicsMode({
    prompt: request.prompt,
    routingTags: request.routingTags,
    contextHint: request.contextHint,
    requestedMode: request.requestedMode,
    requestedTemplateType: request.requestedTemplateType,
    imageCount: Math.max(assetBundle.length, request.imageAssets?.length || 0),
    persistentGraphicType: request.persistentGraphic?.type,
  });

  const templateType = inferTemplateType({
    prompt: request.prompt,
    routingTags: request.routingTags,
    contextHint: request.contextHint,
    requestedTemplateType: request.requestedTemplateType || templateTypeFromPersistentGraphicType(request.persistentGraphic?.type),
    imageCount: Math.max(assetBundle.length, request.imageAssets?.length || 0),
    persistentGraphicType: request.persistentGraphic?.type,
  });

  const overlayMode = inferOverlayMode(request.routingTags, request.contextHint);

  try {
    const spec = request.simplifiedRetry
      ? heuristicTemplateSpec(request, templateType, assetBundle, overlayMode)
      : (await generateTemplateSpec(request, templateType, assetBundle, overlayMode))
        || heuristicTemplateSpec(request, templateType, assetBundle, overlayMode);

    const normalizedSpec: TemplateSpec = {
      ...spec,
      template_type: templateType,
      overlay_mode: spec.overlay_mode || overlayMode,
    };

    const remotionCode = renderTemplate(normalizedSpec, assetBundle);
    const persistentGraphicState = mergePersistentState(request, templateType, normalizedSpec);

    return {
      success: true,
      remotionCode,
      templateType,
      mgMode,
      persistentGraphicState,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Template motion graphic generation failed',
      templateType,
      mgMode,
    };
  }
}
