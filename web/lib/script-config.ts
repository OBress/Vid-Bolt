import type {
  ProjectSettings,
  ScriptAdvancedSettings,
  ScriptGender,
  ScriptGenre,
  ScriptPOV,
} from "@/types/settings";
import type {
  ResearchToggle,
  ScriptStyleConfig,
} from "@/lib/queues/writing/types";

export const DEFAULT_WRITING_MODEL = "google/gemini-3-flash-preview";
export const DEFAULT_QUALITY_MODEL = "google/gemini-3-pro-preview";

export interface ScriptRunOverrides {
  toneStyle?: string;
  targetAudience?: string;
  pov?: ScriptPOV;
  protagonistGender?: ScriptGender;
  openrouterModel?: string;
  qualityReviewModel?: string;
  contentNiche?: string;
  advanced?: ScriptAdvancedSettings;
}

export interface ResolvedWritingConfig {
  topic: string;
  genre: ScriptGenre;
  researchToggle: ResearchToggle;
  angle?: string;
  sourcePreferences?: string;
  toneStyle?: string;
  targetAudience?: string;
  pov: ScriptPOV;
  protagonistGender: ScriptGender;
  openrouterModel: string;
  qualityReviewModel: string;
  contentNiche?: string;
  styleConfig?: ScriptStyleConfig;
}

export function normalizeResearchDepth(
  value: string | null | undefined
): ResearchToggle {
  return value === "off" ? "off" : "full";
}

export function parseLineList(value: string): string[] | undefined {
  const items = value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

export function stringifyLineList(values?: string[]): string {
  return values?.filter(Boolean).join("\n") || "";
}

export function parseWordReplacementMap(
  value: string
): Record<string, string[]> | undefined {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return undefined;

  const entries = lines.flatMap((line) => {
    const [rawWord, rawAlternatives] = line.split("=>").map((part) => part?.trim());
    if (!rawWord || !rawAlternatives) return [];

    const alternatives = rawAlternatives
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (alternatives.length === 0) return [];
    return [[rawWord, alternatives] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function stringifyWordReplacementMap(
  replacements?: Record<string, string[]>
): string {
  if (!replacements) return "";

  return Object.entries(replacements)
    .filter(([word, alternatives]) => word && alternatives?.length)
    .map(([word, alternatives]) => `${word} => ${alternatives.join(", ")}`)
    .join("\n");
}

function mergeSystemPromptOverrides(
  projectPrompts?: ScriptAdvancedSettings["systemPrompts"],
  overridePrompts?: ScriptAdvancedSettings["systemPrompts"]
): ScriptStyleConfig["systemPromptOverrides"] | undefined {
  const merged = {
    expansion: overridePrompts?.expansion ?? projectPrompts?.expansion,
    quality: overridePrompts?.quality ?? projectPrompts?.quality,
    rewrite: overridePrompts?.rewrite ?? projectPrompts?.rewrite,
    transition: overridePrompts?.transition ?? projectPrompts?.transition,
  };

  return Object.values(merged).some(Boolean) ? merged : undefined;
}

function mergeAdvancedSettings(
  projectAdvanced?: ScriptAdvancedSettings,
  overrideAdvanced?: ScriptAdvancedSettings
): ScriptStyleConfig | undefined {
  const customBannedPhrases =
    overrideAdvanced?.bannedPhrases ??
    projectAdvanced?.bannedPhrases;
  const customWordReplacements = {
    ...(projectAdvanced?.wordReplacements || {}),
    ...(overrideAdvanced?.wordReplacements || {}),
  };
  const systemPromptOverrides = mergeSystemPromptOverrides(
    projectAdvanced?.systemPrompts,
    overrideAdvanced?.systemPrompts
  );

  const styleConfig: ScriptStyleConfig = {
    customBannedPhrases,
    customWordReplacements:
      Object.keys(customWordReplacements).length > 0
        ? customWordReplacements
        : undefined,
    systemPromptOverrides,
  };

  return Object.values(styleConfig).some(Boolean) ? styleConfig : undefined;
}

export function resolveWritingConfig(options: {
  topic: string;
  genre: ScriptGenre;
  researchToggle?: string | null;
  angle?: string;
  sourcePreferences?: string;
  projectSettings?: ProjectSettings | null;
  overrides?: ScriptRunOverrides | null;
}): ResolvedWritingConfig {
  const {
    topic,
    genre,
    researchToggle,
    angle,
    sourcePreferences,
    projectSettings,
    overrides,
  } = options;

  const projectScript = projectSettings?.script;
  const resolvedResearchToggle = normalizeResearchDepth(
    researchToggle ?? projectScript?.researchDepth
  );

  return {
    topic,
    genre,
    researchToggle: resolvedResearchToggle,
    angle,
    sourcePreferences,
    toneStyle: overrides?.toneStyle ?? projectScript?.toneStyle,
    targetAudience: overrides?.targetAudience ?? projectScript?.targetAudience,
    pov: overrides?.pov ?? projectScript?.pov ?? "1st",
    protagonistGender:
      overrides?.protagonistGender ??
      projectScript?.protagonistGender ??
      "any",
    openrouterModel:
      overrides?.openrouterModel ??
      projectScript?.openrouterModel ??
      DEFAULT_WRITING_MODEL,
    qualityReviewModel:
      overrides?.qualityReviewModel ??
      projectScript?.qualityReviewModel ??
      DEFAULT_QUALITY_MODEL,
    contentNiche:
      overrides?.contentNiche ??
      projectScript?.contentNiche ??
      projectSettings?.basic_info?.contentNiche,
    styleConfig: mergeAdvancedSettings(
      projectScript?.advanced,
      overrides?.advanced
    ),
  };
}
