/**
 * Pipeline Step Configuration
 * ============================================================================
 * Step definitions matching the VideoCreationWizard's 8 steps.
 * Provides labels, icons, colors, and metadata keys for data extraction.
 */

import {
  FileText,
  Download,
  ScrollText,
  Mic,
  Camera,
  Eye,
  Film,
  Upload,
} from 'lucide-react';
import type { PipelineStep } from '../types/pipeline-debugger';

export interface StepConfig {
  step: PipelineStep;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof FileText;
  color: string; // Tailwind color class prefix (e.g., 'purple')
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeClass: string;
  /** Metadata keys that hold this step's output */
  outputKeys: string[];
  /** Metadata keys that this step reads as input */
  inputKeys: string[];
  /** Config keys relevant to this step */
  configKeys: string[];
}

export const STEP_CONFIGS: Record<PipelineStep, StepConfig> = {
  1: {
    step: 1,
    label: 'Outline',
    shortLabel: 'OUT',
    description: 'Research, scoping, spine generation, and asset registry',
    icon: FileText,
    color: 'violet',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-400',
    borderClass: 'border-violet-500/30',
    badgeClass: 'bg-violet-900/50 text-violet-300',
    outputKeys: ['outlineOutput', 'outlineConfig'],
    inputKeys: ['prompt'],
    configKeys: ['outlineConfig'],
  },
  2: {
    step: 2,
    label: 'Stock Media',
    shortLabel: 'STK',
    description: 'Stock media search and classification',
    icon: Download,
    color: 'blue',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/30',
    badgeClass: 'bg-blue-900/50 text-blue-300',
    outputKeys: ['stockMediaResults'],
    inputKeys: ['outlineOutput'],
    configKeys: ['stockMediaLevel'],
  },
  3: {
    step: 3,
    label: 'Script',
    shortLabel: 'SCR',
    description: 'Script expansion and assembly from outline beats',
    icon: ScrollText,
    color: 'emerald',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-900/50 text-emerald-300',
    outputKeys: ['scriptOutput', 'universalScriptOutput', 'script'],
    inputKeys: ['outlineOutput', 'scriptConfig'],
    configKeys: ['scriptConfig'],
  },
  4: {
    step: 4,
    label: 'Audio',
    shortLabel: 'AUD',
    description: 'TTS narration generation with word-level timestamps',
    icon: Mic,
    color: 'amber',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    badgeClass: 'bg-amber-900/50 text-amber-300',
    outputKeys: ['audioChunks', 'audioUrl'],
    inputKeys: ['script'],
    configKeys: ['voiceModel', 'speakingRate', 'temperature'],
  },
  5: {
    step: 5,
    label: 'Shot Creation',
    shortLabel: 'SHT',
    description: 'AV script generation, shot planning, visual/video prompts',
    icon: Camera,
    color: 'rose',
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/30',
    badgeClass: 'bg-rose-900/50 text-rose-300',
    outputKeys: ['avScriptPart1Output', 'assetReferenceImages'],
    inputKeys: ['audioChunks', 'script', 'outlineOutput'],
    configKeys: ['gpuEnabled', 'stockMediaOverride', 'visualStyle'],
  },
  6: {
    step: 6,
    label: 'Scene Review',
    shortLabel: 'SCN',
    description: 'Media generation (images, videos, motion graphics)',
    icon: Eye,
    color: 'cyan',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-900/50 text-cyan-300',
    outputKeys: ['generated_videos', 'generated_images', 'generated_motion_graphics'],
    inputKeys: ['avScriptPart1Output', 'assetReferenceImages', 'stockMediaResults'],
    configKeys: ['gpuEnabled'],
  },
  7: {
    step: 7,
    label: 'Editor',
    shortLabel: 'EDT',
    description: 'Video editor with timeline, EDL generation, and assembly',
    icon: Film,
    color: 'indigo',
    bgClass: 'bg-indigo-500/10',
    textClass: 'text-indigo-400',
    borderClass: 'border-indigo-500/30',
    badgeClass: 'bg-indigo-900/50 text-indigo-300',
    outputKeys: ['edl', 'agentEdl', 'editor_state'],
    inputKeys: ['generated_videos', 'generated_images', 'generated_motion_graphics', 'audioChunks'],
    configKeys: ['fps', 'editingStyle'],
  },
  8: {
    step: 8,
    label: 'Export',
    shortLabel: 'EXP',
    description: 'Final render via Remotion Lambda',
    icon: Upload,
    color: 'green',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/30',
    badgeClass: 'bg-green-900/50 text-green-300',
    outputKeys: ['renderUrl', 'renderJobId'],
    inputKeys: ['editor_state', 'edl'],
    configKeys: ['renderQuality', 'outputFormat'],
  },
};

export const ALL_STEPS: PipelineStep[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Map a video stage string to a pipeline step number.
 */
export function stageToStep(stage: string): PipelineStep {
  const mapping: Record<string, PipelineStep> = {
    idea: 1,
    outline: 1,
    stock: 2,
    script: 3,
    audio: 4,
    media: 5,
    shot_planning: 5,
    shot_creation: 5,
    production: 6,
    scene_review: 6,
    video: 6,
    editor: 7,
    edit: 7,
    export: 8,
    completed: 8,
  };
  return mapping[stage] || 1;
}

/**
 * Get the step config for a given step number.
 */
export function getStepConfig(step: PipelineStep): StepConfig {
  return STEP_CONFIGS[step];
}
