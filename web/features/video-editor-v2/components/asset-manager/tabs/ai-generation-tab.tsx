'use client';

/**
 * AI Generation Tab
 * ============================================================================
 * Full-featured AI generation panel for the video editor's Assets sidebar.
 *
 * Sub-modes:
 *  - Image Generation (GPU or Replicate)
 *  - Image Editing     (GPU or Replicate)
 *  - Video Generation  (GPU or Replicate)
 *  - SFX Search        (Freesound CC0 library)
 *  - Audio Generation  (ACE-Step 1.5 via GPU)
 *
 *
 * Features:
 *  - Per-mode persistent form state (switching modes preserves inputs)
 *  - Model selector grouped by Local GPU / Replicate (from model-registry)
 *  - LoRA selector for image gen/edit (defaults to project's default LoRA)
 *  - AI prompt enhancement button (calls /api/video-editor/enhance-prompt)
 *  - Drag-and-drop generated results onto the timeline
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, DragEvent } from 'react';
import type { AIGenerationMode, GenerationResult } from '../../../stores/ai-generation-store';
import {
  Image as ImageIcon,
  Pencil,
  Video,
  Volume2,
  Music,
  Mic,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Wand2,
  AlertCircle,
  Bot,
  Lock,
  Cpu,
  Search,
  ExternalLink,
  Play,
  Pause,
  CloudOff,
  Info,
  Link2,
  MousePointerClick,
  Upload,
  History,
  X,
  Zap,
  ToggleLeft,
  ToggleRight,
  Camera,
  Clock,
} from 'lucide-react';
import { cn } from '../../../utils/general/utils';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { useAIGenerationStore } from '../../../stores/ai-generation-store';
import { useEditorContext } from '../../../contexts/editor-context';
import { useApiKeys } from '@/hooks/use-api-keys';
import { useProjectSettings } from '@/hooks/use-project-settings';
import {
  getModelsByCategory,
  getModelById,
  type ModelDefinition,
} from '@/lib/constants/model-registry';
import { startMediaDrag, endDrag, useVideoEditorStore } from '../../../stores/video-editor-store';
import { useGCPVM } from '@/providers/GCPVMProvider';
import { useVramMode } from '@/hooks/use-vram-mode';

// Lazy-load the MotionGraphicsTab (heavy: ~57KB)
const MotionGraphicsTab = React.lazy(() => import('./motion-graphics-tab').then(m => ({ default: m.MotionGraphicsTab })));
// Lazy-load the TtsGenerationForm
const TtsGenerationForm = React.lazy(() => import('./tts-generation-form').then(m => ({ default: m.TtsGenerationForm })));

// ============================================================================
// CONSTANTS
// ============================================================================

const SUB_TABS: Array<{
  id: AIGenerationMode;
  label: string;
  icon: React.ElementType;
  comingSoon?: boolean;
}> = [
  { id: 'image-gen', label: 'Image', icon: ImageIcon },
  { id: 'image-edit', label: 'Edit', icon: Pencil },
  { id: 'video-gen', label: 'Video', icon: Video },
  { id: 'motion', label: 'Motion', icon: Wand2 },
  { id: 'sfx', label: 'SFX', icon: Volume2 },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'tts', label: 'TTS', icon: Mic },
];

const ASPECT_RATIOS = [
  { value: '16-9', label: '16:9' },
  { value: '9-16', label: '9:16' },
  { value: '1-1', label: '1:1' },
  { value: '4-3', label: '4:3' },
  { value: '3-4', label: '3:4' },
];

const FPS_OPTIONS = [
  { value: 24, label: '24 fps' },
  { value: 30, label: '30 fps' },
];

// ============================================================================
// COMPACT MODEL DROPDOWN (reuses model-registry pattern from VisualsTab)
// ============================================================================

interface CompactModelSelectProps {
  category: 'image' | 'image_edit' | 'video';
  value: string;
  onChange: (value: string) => void;
  hasReplicateKey: boolean;
  /** When false, local GPU models are disabled with a tooltip. */
  isGpuOnline?: boolean;
}

function CompactModelSelect({
  category,
  value,
  onChange,
  hasReplicateKey,
  isGpuOnline = true,
}: CompactModelSelectProps) {
  const models = getModelsByCategory(category);
  const localModels = models.filter((m) => m.provider === 'local');
  const replicateModels = models.filter((m) => m.provider === 'replicate');
  const selectedModel = getModelById(value);

  // Auto-switch away from a local model when GPU goes offline
  useEffect(() => {
    if (!isGpuOnline && selectedModel?.provider === 'local') {
      const firstReplicate = replicateModels.find((m) => hasReplicateKey || true);
      if (firstReplicate) {
        onChange(firstReplicate.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGpuOnline]);

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Model
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent className="bg-neutral-900 border-neutral-800">
          {/* Local GPU Models */}
          <SelectGroup>
            <SelectLabel className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold px-2">
              Local GPU{!isGpuOnline && ' (Offline)'}
            </SelectLabel>
            {localModels.map((model) => (
              <TooltipProvider key={model.id}>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span>
                      <SelectItem
                        value={model.id}
                        disabled={!isGpuOnline}
                        className={cn('text-xs', !isGpuOnline && 'opacity-50')}
                      >
                        <span className="flex items-center gap-1.5">
                          {model.label}
                          {!isGpuOnline && <CloudOff className="h-2.5 w-2.5 text-neutral-500" />}
                        </span>
                      </SelectItem>
                    </span>
                  </TooltipTrigger>
                  {!isGpuOnline && (
                    <TooltipContent
                      side="right"
                      className="bg-neutral-800 border-neutral-700 text-neutral-200 text-[10px] max-w-[200px]"
                    >
                      GPU is offline — start the VM to use local models
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ))}
          </SelectGroup>

          {/* Replicate Models */}
          <SelectGroup>
            <SelectLabel className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold px-2 mt-1">
              Replicate
            </SelectLabel>
            {replicateModels.map((model) => (
              <TooltipProvider key={model.id}>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span>
                      <SelectItem
                        value={model.id}
                        disabled={!hasReplicateKey}
                        className={cn('text-xs', !hasReplicateKey && 'opacity-50')}
                      >
                        <span className="flex items-center gap-1.5">
                          {model.label}
                          {model.pricing && (
                            <span className="text-[9px] text-orange-400/80 font-mono">
                              {model.pricing}
                            </span>
                          )}
                          {!hasReplicateKey && <Lock className="h-2.5 w-2.5 text-neutral-500" />}
                        </span>
                      </SelectItem>
                    </span>
                  </TooltipTrigger>
                  {!hasReplicateKey && (
                    <TooltipContent
                      side="right"
                      className="bg-neutral-800 border-neutral-700 text-neutral-200 text-[10px] max-w-[200px]"
                    >
                      Configure Replicate API key in Settings → API Keys
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {selectedModel && (
        <p className="text-[9px] text-neutral-500 leading-tight">{selectedModel.description}</p>
      )}
    </div>
  );
}

// ============================================================================
// LORA SELECTOR
// ============================================================================

interface LoRAGroup {
  label: string;
  items: Array<{ name: string; displayName?: string }>;
}

interface LoRASelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  groups: LoRAGroup[];
  defaultLoraName?: string;
}

function LoRASelector({ value, onChange, groups, defaultLoraName }: LoRASelectorProps) {
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
  if (totalItems === 0) return null;

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        LoRA Style
      </label>
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? null : v)}>
        <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent className="bg-neutral-900 border-neutral-800">
          <SelectItem value="__none__" className="text-xs">
            None
          </SelectItem>
          {groups.map((group) => (
            group.items.length > 0 && (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold px-2 mt-1">
                  {group.label}
                </SelectLabel>
                {group.items.map((lora) => (
                  <SelectItem key={lora.name} value={lora.name} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      {lora.displayName || lora.name}
                      {lora.name === defaultLoraName && (
                        <span className="text-[8px] bg-primary/20 text-primary px-1 rounded">
                          Default
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// PROMPT ENHANCE BUTTON
// ============================================================================

interface PromptEnhanceButtonProps {
  prompt: string;
  onEnhanced: (enhanced: string) => void;
  generationType: 'image' | 'image-edit' | 'video';
  projectId: string;
  disabled?: boolean;
}

function PromptEnhanceButton({
  prompt,
  onEnhanced,
  generationType,
  projectId,
  disabled,
}: PromptEnhanceButtonProps) {
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim() || isEnhancing) return;

    setIsEnhancing(true);
    try {
      const res = await fetch('/api/video-editor/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, generationType, projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }

      const data = await res.json();
      if (data.enhancedPrompt) {
        onEnhanced(data.enhancedPrompt);
      }
    } catch (error) {
      console.error('[AI Enhance] Failed:', error);
    } finally {
      setIsEnhancing(false);
    }
  }, [prompt, generationType, projectId, isEnhancing, onEnhanced]);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
            onClick={handleEnhance}
            disabled={disabled || !prompt.trim() || isEnhancing}
          >
            {isEnhancing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isEnhancing ? 'Enhancing...' : 'AI Enhance'}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="bg-neutral-800 border-neutral-700 text-[10px] max-w-[200px]"
        >
          Enhance your prompt using the project&apos;s visual style. Requires OpenRouter API key.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// GENERATION RESULT (draggable)
// ============================================================================

interface GenerationResultPreviewProps {
  result: { type: string; url: string; mimeType: string; prompt: string };
}

function GenerationResultPreview({ result }: GenerationResultPreviewProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const isVideo = result.type === 'video';
      const dragData = {
        isNewItem: true,
        type: isVideo ? 'video' : 'image',
        label: `AI Generated ${isVideo ? 'Video' : 'Image'}`,
        duration: isVideo ? 5 : 5,
        data: {
          src: result.url,
          thumbnail: result.url,
          isAiGenerated: true,
        },
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));

      startMediaDrag(
        isVideo ? 'video' : 'image',
        result.url,
        {
          duration: isVideo ? 5 : 5,
          name: `AI Generated ${isVideo ? 'Video' : 'Image'}`,
          thumbnailUrl: result.url,
        }
      );
    },
    [result]
  );

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, []);

  return (
    <div className="mt-3 space-y-1.5">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Result
      </label>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          'relative group cursor-grab active:cursor-grabbing rounded-lg overflow-hidden',
          'border border-neutral-800 hover:border-primary/50 transition-colors'
        )}
      >
        {result.type === 'video' ? (
          <video
            src={result.url}
            className="w-full aspect-video object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <img
            src={result.url}
            alt="AI Generated"
            className="w-full aspect-video object-cover"
          />
        )}
        {/* Drag indicator overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-white text-[10px] bg-black/60 px-2 py-1 rounded">
            <GripVertical className="h-3 w-3" />
            Drag to timeline
          </div>
        </div>
      </div>
      <p className="text-[9px] text-neutral-600 truncate" title={result.prompt}>
        {result.prompt}
      </p>
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE ADVANCED SECTION
// ============================================================================

function AdvancedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-neutral-800/50 pt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors w-full"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// INLINE NUMBER INPUT
// ============================================================================

function InlineNumberInput({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-neutral-500 min-w-[40px]">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Number(v));
        }}
        placeholder={placeholder || 'Random'}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-7 bg-neutral-900/60 border border-neutral-800 rounded px-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    </div>
  );
}

// ============================================================================
// MEDIA INPUT WIDGET (tri-path: paste URL | drag-from-timeline | use selected)
// ============================================================================

interface MediaInputWidgetProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  accept?: 'image' | 'video' | 'any';
  disabled?: boolean;
  placeholder?: string;
}

function MediaInputWidget({
  label,
  value,
  onChange,
  accept = 'any',
  disabled,
  placeholder,
}: MediaInputWidgetProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Read selected clip from the timeline
  const selectedClipId = useVideoEditorStore((s) => s.selection.clipIds[0] ?? null);
  const selectedClip = useVideoEditorStore((s) =>
    selectedClipId ? s.clips[selectedClipId] : null
  );

  const canUseSelectedClip = useMemo(() => {
    if (!selectedClip) return false;
    const clipType = selectedClip.type;
    if (accept === 'image') return clipType === 'image';
    if (accept === 'video') return clipType === 'video';
    return clipType === 'image' || clipType === 'video';
  }, [selectedClip, accept]);

  const handleUseSelected = useCallback(() => {
    if (!selectedClip) return;
    const url = selectedClip.media?.src || selectedClip.thumbnailUrl || '';
    if (url) onChange(url);
  }, [selectedClip, onChange]);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const json = e.dataTransfer.getData('application/json');
      if (json) {
        try {
          const data = JSON.parse(json);
          const src = data.data?.src || data.src || '';
          if (src) { onChange(src); return; }
        } catch {}
      }
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (text?.startsWith('http')) onChange(text.trim());
    },
    [onChange]
  );

  const hasUrl = value.trim().length > 0;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        {label}
      </label>

      {/* Drop zone + URL input */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-md border transition-colors',
          isDragOver
            ? 'border-primary/70 bg-primary/5'
            : hasUrl
              ? 'border-neutral-700 bg-neutral-900/60'
              : 'border-neutral-800 border-dashed bg-neutral-900/40'
        )}
      >
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || `Paste URL or drop a clip here…`}
          disabled={disabled}
          className="w-full h-8 bg-transparent px-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
        />
        {/* Thumbnail preview when URL is set */}
        {hasUrl && (accept === 'image' || accept === 'any') && (
          <div className="absolute right-2 top-1 h-6 w-10 rounded overflow-hidden border border-neutral-700">
            <img
              src={value}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        {/* Clear button */}
        {hasUrl && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1 top-1.5 text-neutral-600 hover:text-neutral-300 transition-colors p-0.5"
            title="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Action pills */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleUseSelected}
                disabled={!canUseSelectedClip || disabled}
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                  canUseSelectedClip && !disabled
                    ? 'bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30'
                    : 'bg-neutral-800/60 text-neutral-600 border border-neutral-800 cursor-not-allowed'
                )}
              >
                <MousePointerClick className="h-2.5 w-2.5" />
                Use Selected
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-neutral-800 border-neutral-700 text-[10px]">
              {canUseSelectedClip
                ? 'Use the currently selected timeline clip'
                : selectedClip
                  ? `Selected clip type (${selectedClip.type}) doesn't match — need ${accept}`
                  : 'Select a clip on the timeline first'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span className="text-[9px] text-neutral-700">·</span>
        <span className="text-[9px] text-neutral-600 flex items-center gap-1">
          <Upload className="h-2.5 w-2.5" /> Drop from timeline
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// RESOLUTION PRESET SELECTOR (LTX-2 64px-aligned)
// ============================================================================

// LTX-2 requires dimensions that are multiples of 32; prefer 64px-aligned.
// These presets cover the main production use-cases.
const LTX_RESOLUTION_PRESETS: Record<string, Array<{ label: string; w: number; h: number }>> = {
  '16-9': [
    { label: '1280×720', w: 1280, h: 720 },
    { label: '960×544',  w: 960,  h: 544 },
    { label: '768×432',  w: 768,  h: 432 },
  ],
  '9-16': [
    { label: '720×1280', w: 720, h: 1280 },
    { label: '544×960',  w: 544, h: 960  },
    { label: '432×768',  w: 432, h: 768  },
  ],
  '1-1': [
    { label: '768×768',  w: 768, h: 768  },
    { label: '512×512',  w: 512, h: 512  },
  ],
  '4-3': [
    { label: '1024×768', w: 1024, h: 768 },
    { label: '768×576',  w: 768,  h: 576 },
  ],
  '3-4': [
    { label: '768×1024', w: 768, h: 1024 },
    { label: '576×768',  w: 576, h: 768  },
  ],
};

// Fallback presets for image gen (not constrained to LTX multiples)
const IMAGE_RESOLUTION_PRESETS: Record<string, Array<{ label: string; w: number; h: number }>> = {
  '16-9': [
    { label: '1920×1080', w: 1920, h: 1080 },
    { label: '1280×720',  w: 1280, h: 720  },
    { label: '854×480',   w: 854,  h: 480  },
  ],
  '9-16': [
    { label: '1080×1920', w: 1080, h: 1920 },
    { label: '720×1280',  w: 720,  h: 1280 },
  ],
  '1-1': [
    { label: '1024×1024', w: 1024, h: 1024 },
    { label: '768×768',   w: 768,  h: 768  },
    { label: '512×512',   w: 512,  h: 512  },
  ],
  '4-3': [
    { label: '1024×768',  w: 1024, h: 768  },
  ],
  '3-4': [
    { label: '768×1024',  w: 768,  h: 1024 },
  ],
};

interface ResolutionPresetSelectorProps {
  aspectRatio: string;
  value: string | null; // key like '1280x720'
  onChange: (key: string | null) => void;
  mode: 'video' | 'image';
  disabled?: boolean;
}

function ResolutionPresetSelector({
  aspectRatio,
  value,
  onChange,
  mode,
  disabled,
}: ResolutionPresetSelectorProps) {
  const presets =
    mode === 'video'
      ? LTX_RESOLUTION_PRESETS[aspectRatio] || LTX_RESOLUTION_PRESETS['16-9']
      : IMAGE_RESOLUTION_PRESETS[aspectRatio] || IMAGE_RESOLUTION_PRESETS['16-9'];

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Resolution {mode === 'video' && <span className="text-[9px] text-neutral-600 normal-case font-normal">(64px-aligned)</span>}
      </label>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={cn(
            'px-2 py-0.5 rounded text-[10px] border transition-colors',
            value === null
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-neutral-800 bg-neutral-900/60 text-neutral-500 hover:text-neutral-300'
          )}
        >
          Auto
        </button>
        {presets.map((p) => {
          const key = `${p.w}x${p.h}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              disabled={disabled}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] border font-mono transition-colors',
                value === key
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-neutral-800 bg-neutral-900/60 text-neutral-500 hover:text-neutral-300'
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {mode === 'video' && (
        <p className="text-[9px] text-neutral-600">
          LTX-2 requires multiples of 32. "Auto" uses the aspect ratio default.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// GENERATION HISTORY GALLERY (per-mode, draggable)
// ============================================================================

function HistoryThumb({ item, index }: { item: GenerationResult; index: number }) {
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      const isVideo = item.type === 'video';
      const isAudio = item.type === 'audio';
      const dragData = {
        isNewItem: true,
        type: item.type,
        label: `AI ${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`,
        duration: item.durationSeconds || (isVideo ? 5 : 5),
        data: {
          src: item.normalizedAudioUrl || item.url,
          thumbnail: isAudio ? undefined : item.url,
          isAiGenerated: true,
        },
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));

      startMediaDrag(
        item.type as 'image' | 'video' | 'audio',
        item.normalizedAudioUrl || item.url,
        {
          duration: item.durationSeconds || 5,
          name: `AI ${item.type}`,
          thumbnailUrl: isAudio ? undefined : item.url,
        }
      );
    },
    [item]
  );

  const handleDragEnd = useCallback(() => endDrag(), []);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={item.prompt}
      className={cn(
        'relative group cursor-grab active:cursor-grabbing shrink-0 rounded overflow-hidden border',
        'border-neutral-800 hover:border-primary/50 transition-colors',
        item.type === 'audio' ? 'w-14 h-14 bg-neutral-800/60' : 'w-14 h-10'
      )}
    >
      {item.type === 'video' ? (
        <video src={item.url} className="w-full h-full object-cover" muted playsInline />
      ) : item.type === 'image' ? (
        <img src={item.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5">
          <Music className="h-4 w-4 text-primary" />
          <span className="text-[8px] text-neutral-500 font-mono">
            {item.durationSeconds ? `${item.durationSeconds}s` : 'audio'}
          </span>
        </div>
      )}
      {/* Index badge */}
      <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-sm bg-black/70 flex items-center justify-center">
        <span className="text-[7px] text-white font-bold">{index + 1}</span>
      </div>
      {/* Drag hint */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <GripVertical className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

function GenerationHistoryGallery({ mode }: { mode: AIGenerationMode }) {
  const { history, clearHistory } = useAIGenerationStore();
  const items = history[mode] ?? [];

  if (items.length === 0) return null;

  return (
    <div className="space-y-1 mt-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1 text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          <History className="h-2.5 w-2.5" /> History
        </label>
        <button
          type="button"
          onClick={() => clearHistory(mode)}
          className="text-[9px] text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {items.map((item, i) => (
          <HistoryThumb key={item.timestamp} item={item} index={i} />
        ))}
      </div>
      <p className="text-[9px] text-neutral-600">
        Drag any result back to the timeline
      </p>
    </div>
  );
}

// ============================================================================
// CAMERA ANGLE PANEL (for multiple-angles LoRA)
// ============================================================================

const ANGLE_PRESETS = [
  { label: 'Front',      suffix: 'front view, straight-on angle' },
  { label: 'Side',       suffix: 'side profile, 90° lateral view' },
  { label: '3/4 Front',  suffix: 'three-quarter front view' },
  { label: '3/4 Back',   suffix: 'three-quarter rear view' },
  { label: 'Over Shoulder', suffix: 'over-the-shoulder perspective' },
  { label: 'Low Angle',  suffix: 'low-angle shot, looking up' },
  { label: 'High Angle', suffix: 'high-angle bird\'s eye shot' },
  { label: 'Back',       suffix: 'rear view, facing away from camera' },
] as const;

interface CameraAnglePanelProps {
  prompt: string;
  onPromptChange: (p: string) => void;
  loraName: string | null;
}

function CameraAnglePanel({ prompt, onPromptChange, loraName }: CameraAnglePanelProps) {
  const isAnglesLora = loraName === 'multiple-angles';
  if (!isAnglesLora) return null;

  const applyAngle = (suffix: string) => {
    // Remove any existing angle suffix first, then append
    const base = prompt
      .replace(/,?\s*(front|side|rear|back|low-angle|high-angle|bird|over-the-shoulder|three-quarter|lateral|straight-on|looking up|facing away)[^,]*/gi, '')
      .replace(/,\s*$/, '')
      .trim();
    onPromptChange(base ? `${base}, ${suffix}` : suffix);
  };

  return (
    <div className="space-y-1 p-2 rounded-md border border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-1 mb-1.5">
        <Camera className="h-2.5 w-2.5 text-amber-400" />
        <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">
          Camera Angles
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {ANGLE_PRESETS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => applyAngle(a.suffix)}
            className="px-1.5 py-0.5 rounded text-[10px] border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-amber-400/60">
        Appends the camera orientation to your prompt
      </p>
    </div>
  );
}

// ============================================================================
// AUDIO GENERATION RESULT (draggable)
// ============================================================================

function AudioResultPreview({
  result,
}: {
  result: {
    url: string;
    prompt: string;
    durationSeconds?: number;
    audioNormalizationStatus?: 'completed';
    normalizedAudioUrl?: string | null;
  };
}) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const audioUrl = result.normalizedAudioUrl || result.url;
      const dragData = {
        isNewItem: true,
        type: 'audio',
        label: 'AI Generated Music',
        duration: result.durationSeconds || 30,
        data: {
          src: audioUrl,
          originalUrl: result.url,
          normalizedAudioUrl: audioUrl,
          audioNormalizationStatus: result.audioNormalizationStatus || 'completed',
          isAiGenerated: true,
        },
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));

      startMediaDrag('audio', audioUrl, {
        duration: result.durationSeconds || 30,
        name: 'AI Generated Music',
      });
    },
    [result]
  );

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, []);

  return (
    <div className="mt-3 space-y-1.5">
      <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Generated Audio
      </label>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          'relative group cursor-grab active:cursor-grabbing rounded-lg overflow-hidden',
          'border border-neutral-800 hover:border-primary/50 transition-colors p-3'
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <Music className="h-4 w-4 text-primary" />
          <span className="text-xs text-neutral-300 font-medium">Background Music</span>
        </div>
        <audio
          src={result.url}
          controls
          className="w-full h-8"
          controlsList="nodownload"
        />
        <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-neutral-400">
          <GripVertical className="h-3 w-3" />
          Drag to timeline
        </div>
      </div>
      <p className="text-[9px] text-neutral-600 truncate" title={result.prompt}>
        {result.prompt}
      </p>
    </div>
  );
}

// ============================================================================
// SFX SEARCH FORM (Freesound)
// ============================================================================

const MAX_DURATION_OPTIONS = [
  { value: 5, label: '≤ 5s' },
  { value: 10, label: '≤ 10s' },
  { value: 30, label: '≤ 30s' },
  { value: 60, label: '≤ 60s' },
];

const SORT_OPTIONS: Array<{ value: 'score' | 'downloads_desc' | 'rating_desc'; label: string }> = [
  { value: 'score', label: 'Relevance' },
  { value: 'downloads_desc', label: 'Most Downloads' },
  { value: 'rating_desc', label: 'Highest Rated' },
];

interface SfxSearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  file: string;
  thumbnail?: string;
  attribution?: {
    author: string;
    source: string;
    license: string;
    url: string;
  };
  _rating?: number;
  _downloads?: number;
}

function SfxSearchForm() {
  const { sfxSearch, updateSfxSearch } = useAIGenerationStore();
  const [results, setResults] = useState<SfxSearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Handle search
  const handleSearch = useCallback(async (page = 1, append = false) => {
    if (!sfxSearch.query.trim()) return;

    if (page === 1) {
      setIsSearching(true);
    } else {
      setIsLoadingMore(true);
    }
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        q: sfxSearch.query.trim(),
        page: String(page),
        per_page: '20',
        max_duration: String(sfxSearch.maxDuration),
        sort: sfxSearch.sort,
      });

      const res = await fetch(`/api/audio/search?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Search failed (${res.status})`);
      }

      const data = await res.json();
      const newResults: SfxSearchResult[] = data.items || [];

      if (append) {
        setResults(prev => [...prev, ...newResults]);
      } else {
        setResults(newResults);
      }
      setTotalCount(data.totalCount || 0);
      setHasMore(data.hasMore || false);
      setCurrentPage(page);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [sfxSearch.query, sfxSearch.maxDuration, sfxSearch.sort]);

  // Handle Enter key in search input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(1, false);
    }
  }, [handleSearch]);

  // Handle Load More
  const handleLoadMore = useCallback(() => {
    handleSearch(currentPage + 1, true);
  }, [handleSearch, currentPage]);

  // Audio preview playback
  const handleTogglePlay = useCallback((resultId: string, fileUrl: string) => {
    if (playingId === resultId) {
      // Stop current
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // Play new
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(fileUrl);
    audio.addEventListener('ended', () => setPlayingId(null));
    audio.addEventListener('error', () => setPlayingId(null));
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(resultId);
  }, [playingId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Drag handler for SFX results
  const handleDragStart = useCallback((e: React.DragEvent, result: SfxSearchResult) => {
    const dragData = {
      isNewItem: true,
      type: 'audio',
      label: result.title,
      duration: result.duration,
      data: {
        src: result.file,
        file: result.file,
        name: result.title,
        filename: `${result.title}.mp3`,
        artist: result.artist,
        thumbnail: result.thumbnail,
        isFreesound: true,
      },
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));

    startMediaDrag('audio', result.file, {
      duration: result.duration,
      name: result.title,
      thumbnailUrl: result.thumbnail,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, []);

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Search Freesound
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={sfxSearch.query}
            onChange={(e) => updateSfxSearch({ query: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="whoosh, door slam, explosion..."
            className="flex-1 h-8 bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
            disabled={isSearching}
          />
          <Button
            className="h-8 px-3 gap-1.5 text-xs"
            onClick={() => handleSearch(1, false)}
            disabled={isSearching || !sfxSearch.query.trim()}
          >
            {isSearching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Search
          </Button>
        </div>
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Max Duration
          </label>
          <Select
            value={String(sfxSearch.maxDuration)}
            onValueChange={(v) => updateSfxSearch({ maxDuration: Number(v) })}
          >
            <SelectTrigger className="h-7 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {MAX_DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Sort By
          </label>
          <Select
            value={sfxSearch.sort}
            onValueChange={(v) => updateSfxSearch({ sort: v as 'score' | 'downloads_desc' | 'rating_desc' })}
          >
            <SelectTrigger className="h-7 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error */}
      {searchError && (
        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {searchError}
        </div>
      )}

      {/* Results count */}
      {results.length > 0 && (
        <p className="text-[10px] text-neutral-500">
          Showing {results.length} of {totalCount.toLocaleString()} results
        </p>
      )}

      {/* Results list */}
      {isSearching ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1 -mr-1">
          {results.map((result) => (
            <div
              key={result.id}
              draggable
              onDragStart={(e) => handleDragStart(e, result)}
              onDragEnd={handleDragEnd}
              className={cn(
                'group relative flex items-center gap-2 p-2 rounded-lg',
                'border border-neutral-800/60 hover:border-primary/40',
                'bg-neutral-900/40 hover:bg-neutral-900/70',
                'cursor-grab active:cursor-grabbing transition-colors'
              )}
            >
              {/* Waveform thumbnail or play button */}
              <button
                type="button"
                onClick={() => handleTogglePlay(result.id, result.file)}
                className={cn(
                  'shrink-0 w-9 h-9 rounded-md flex items-center justify-center transition-colors',
                  playingId === result.id
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200'
                )}
              >
                {playingId === result.id ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 ml-0.5" />
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-neutral-200 font-medium truncate" title={result.title}>
                  {result.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-neutral-500 truncate">{result.artist}</span>
                  <span className="text-[9px] text-neutral-600">·</span>
                  <span className="text-[9px] text-neutral-500 font-mono">
                    {result.duration.toFixed(1)}s
                  </span>
                  {result._rating != null && result._rating > 0 && (
                    <>
                      <span className="text-[9px] text-neutral-600">·</span>
                      <span className="text-[9px] text-amber-500/80">
                        ★ {result._rating.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Drag hint + Freesound link */}
              <div className="shrink-0 flex items-center gap-1">
                {result.attribution?.url && (
                  <a
                    href={result.attribution.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
                    title="View on Freesound"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-3.5 w-3.5 text-neutral-600" />
                </div>
              </div>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-[10px] text-neutral-400 hover:text-neutral-200 gap-1.5 mt-1"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Load More
            </Button>
          )}
        </div>
      ) : totalCount === 0 && !isSearching && sfxSearch.query.trim() && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Volume2 className="h-5 w-5 text-neutral-600 mb-2" />
          <p className="text-[10px] text-neutral-500">No sounds found</p>
          <p className="text-[9px] text-neutral-600 mt-0.5">Try different keywords or filters</p>
        </div>
      ) : !sfxSearch.query.trim() ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Search className="h-5 w-5 text-neutral-600 mb-2" />
          <p className="text-[10px] text-neutral-500">Search 500k+ CC0 sound effects</p>
          <p className="text-[9px] text-neutral-600 mt-0.5">
            Powered by Freesound.org — free to use
          </p>
        </div>
      ) : null}

      {/* CC0 notice */}
      {results.length > 0 && (
        <p className="text-[9px] text-neutral-600 text-center leading-tight">
          All sounds are CC0 licensed — free for any use, no attribution required
        </p>
      )}
    </div>
  );
}

// ============================================================================
// AUDIO GENERATION FORM (ACE-Step 1.5)
// ============================================================================

const KEY_SCALE_OPTIONS = [
  'C Major', 'D Major', 'E Major', 'F Major', 'G Major', 'A Major', 'B Major',
  'A Minor', 'B Minor', 'C Minor', 'D Minor', 'E Minor', 'F Minor', 'G Minor',
];

const DURATION_OPTIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1.5 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
];

function AudioGenForm() {
  const { audioGen, updateAudioGen, isGenerating, lastResult, error, setGenerating, setResult, setError, pushToHistory, activeMode } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!audioGen.prompt.trim()) return;

    setGenerating(true, 'Generating music...');
    try {
      const res = await fetch('/api/video-editor/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: audioGen.prompt,
          ...(audioGen.lyrics.trim() ? { lyrics: audioGen.lyrics } : {}),
          durationSeconds: audioGen.durationSeconds,
          seed: audioGen.seed,
          bpm: audioGen.bpm,
          keyScale: audioGen.keyScale,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      const result = {
        mode: activeMode,
        type: 'audio' as const,
        url: data.url,
        mimeType: 'audio/wav',
        prompt: audioGen.prompt,
        modelId: 'acestep-v15-turbo',
        timestamp: Date.now(),
        durationSeconds: audioGen.durationSeconds,
        normalizedAudioUrl: data.normalizedUrl || null,
      };
      setResult(result);
      pushToHistory(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio generation failed');
    }
  }, [audioGen, setGenerating, setResult, setError, pushToHistory, activeMode]);

  return (
    <div className="space-y-3">
      {/* Caption / Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Style Description
        </label>
        <textarea
          value={audioGen.prompt}
          onChange={(e) => updateAudioGen({ prompt: e.target.value })}
          placeholder="dark ambient electronic, deep synthesizer pads, subtle string textures, slow atmospheric drone, melancholic, warm mix"
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
        <p className="text-[9px] text-neutral-600 leading-tight">
          Comma-separated tags: genre, instruments, mood, tempo feel, production style
        </p>
      </div>

      {/* Optional Lyrics */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Lyrics
        </label>
        <textarea
          value={audioGen.lyrics}
          onChange={(e) => updateAudioGen({ lyrics: e.target.value })}
          placeholder={'Leave empty for instrumental background music.\nOptional vocal lines or sections only if you intentionally want vocals.'}
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
          disabled={isGenerating}
        />
        <p className="text-[9px] text-neutral-600 leading-tight">
          Leave blank for subtle instrumental beds. Only fill this in if you deliberately want vocal music.
        </p>
      </div>

      {/* Duration & BPM */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Duration
          </label>
          <Select
            value={String(audioGen.durationSeconds)}
            onValueChange={(v) => updateAudioGen({ durationSeconds: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)} className="text-xs">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            BPM
          </label>
          <input
            type="number"
            value={audioGen.bpm}
            onChange={(e) => updateAudioGen({ bpm: Math.max(40, Math.min(200, Number(e.target.value) || 85)) })}
            min={40}
            max={200}
            className="w-full h-8 bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-primary/50"
            disabled={isGenerating}
          />
        </div>
      </div>

      {/* Key Scale */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Key / Scale
        </label>
        <Select value={audioGen.keyScale} onValueChange={(v) => updateAudioGen({ keyScale: v })}>
          <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-800">
            {KEY_SCALE_OPTIONS.map((ks) => (
              <SelectItem key={ks} value={ks} className="text-xs">
                {ks}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[9px] text-neutral-600 leading-tight">
          Major keys: bright, uplifting · Minor keys: darker, emotional
        </p>
      </div>

      {/* Advanced */}
      <AdvancedSection>
        <InlineNumberInput
          label="Seed"
          value={audioGen.seed}
          onChange={(v) => updateAudioGen({ seed: v })}
          placeholder="Random"
          min={0}
        />
      </AdvancedSection>

      {/* Generate Button */}
      <Button
        className="w-full h-9 gap-2 text-xs font-medium"
        onClick={handleGenerate}
        disabled={isGenerating || !audioGen.prompt.trim()}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating Music...
          </>
        ) : (
          <>
            <Music className="h-3.5 w-3.5" />
            Generate Music
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {lastResult && lastResult.type === 'audio' && (
        <AudioResultPreview result={lastResult} />
      )}

      <GenerationHistoryGallery mode="audio" />
    </div>
  );
}

// ============================================================================
// IMAGE GENERATION FORM
// ============================================================================

interface ImageGenFormProps {
  hasReplicateKey: boolean;
  projectId: string;
  loraGroups: LoRAGroup[];
  defaultLoraName?: string;
  isGpuOnline: boolean;
}

function ImageGenForm({ hasReplicateKey, projectId, loraGroups, defaultLoraName, isGpuOnline }: ImageGenFormProps) {
  const { imageGen, updateImageGen, isGenerating, lastResult, error, setGenerating, setResult, setError, autoEnhance, pushToHistory, activeMode } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!imageGen.prompt.trim()) return;

    setGenerating(true, 'Starting image generation...');
    try {
      // Auto-enhance if enabled
      let finalPrompt = imageGen.prompt;
      if (autoEnhance) {
        try {
          const enhRes = await fetch('/api/video-editor/enhance-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: imageGen.prompt, generationType: 'image', projectId }),
          });
          if (enhRes.ok) {
            const enhData = await enhRes.json();
            if (enhData.enhancedPrompt) finalPrompt = enhData.enhancedPrompt;
          }
        } catch {}
      }

      const res = await fetch('/api/video-editor/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          negativePrompt: imageGen.negativePrompt || undefined,
          model: imageGen.modelId,
          aspectRatio: imageGen.aspectRatio,
          ...(imageGen.resolutionPreset
            ? {
                width: parseInt(imageGen.resolutionPreset.split('x')[0], 10),
                height: parseInt(imageGen.resolutionPreset.split('x')[1], 10),
              }
            : {}),
          loraName: imageGen.loraName,
          loraStrength: imageGen.loraStrength,
          seed: imageGen.seed,
          steps: imageGen.steps,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      const result = {
        mode: activeMode,
        type: 'image' as const,
        url: data.url,
        mimeType: 'image/png',
        prompt: finalPrompt,
        modelId: imageGen.modelId,
        timestamp: Date.now(),
      };
      setResult(result);
      pushToHistory(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    }
  }, [imageGen, autoEnhance, projectId, setGenerating, setResult, setError, pushToHistory, activeMode]);

  return (
    <div className="space-y-3">
      {/* Prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Prompt
          </label>
          <PromptEnhanceButton
            prompt={imageGen.prompt}
            onEnhanced={(p) => updateImageGen({ prompt: p })}
            generationType="image"
            projectId={projectId}
            disabled={isGenerating}
          />
        </div>
        <textarea
          value={imageGen.prompt}
          onChange={(e) => updateImageGen({ prompt: e.target.value })}
          placeholder="Describe the image you want to generate..."
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* Negative Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Negative Prompt
        </label>
        <textarea
          value={imageGen.negativePrompt}
          onChange={(e) => updateImageGen({ negativePrompt: e.target.value })}
          placeholder="blurry, watermark, low quality, distorted…"
          rows={2}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* Model */}
      <CompactModelSelect
        category="image"
        value={imageGen.modelId}
        onChange={(v) => updateImageGen({ modelId: v })}
        hasReplicateKey={hasReplicateKey}
        isGpuOnline={isGpuOnline}
      />

      {/* LoRA */}
      <LoRASelector
        value={imageGen.loraName}
        onChange={(v) => updateImageGen({ loraName: v })}
        groups={loraGroups}
        defaultLoraName={defaultLoraName}
      />

      {/* Aspect Ratio + Resolution */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Aspect Ratio
        </label>
        <Select
          value={imageGen.aspectRatio}
          onValueChange={(v) => updateImageGen({ aspectRatio: v, resolutionPreset: null })}
        >
          <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-800">
            {ASPECT_RATIOS.map((ar) => (
              <SelectItem key={ar.value} value={ar.value} className="text-xs">
                {ar.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ResolutionPresetSelector
        aspectRatio={imageGen.aspectRatio}
        value={imageGen.resolutionPreset}
        onChange={(k) => updateImageGen({ resolutionPreset: k })}
        mode="image"
        disabled={isGenerating}
      />

      {/* Advanced */}
      <AdvancedSection>
        <InlineNumberInput
          label="Steps"
          value={imageGen.steps}
          onChange={(v) => updateImageGen({ steps: v ?? 4 })}
          min={1}
          max={50}
        />
        <InlineNumberInput
          label="Seed"
          value={imageGen.seed}
          onChange={(v) => updateImageGen({ seed: v })}
          placeholder="Random"
          min={0}
        />
        {imageGen.loraName && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-neutral-500 min-w-[40px]">Strength</label>
            <input
              type="range"
              value={imageGen.loraStrength}
              onChange={(e) => updateImageGen({ loraStrength: parseFloat(e.target.value) })}
              min={0}
              max={1}
              step={0.05}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-[10px] text-neutral-400 font-mono w-8 text-right">
              {imageGen.loraStrength.toFixed(2)}
            </span>
          </div>
        )}
      </AdvancedSection>

      {/* Generate Button */}
      <Button
        className="w-full h-9 gap-2 text-xs font-medium"
        onClick={handleGenerate}
        disabled={isGenerating || !imageGen.prompt.trim()}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Bot className="h-3.5 w-3.5" />
            Generate Image
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {lastResult && lastResult.type === 'image' && (
        <GenerationResultPreview result={lastResult} />
      )}

      <GenerationHistoryGallery mode="image-gen" />
    </div>
  );
}

// ============================================================================
// IMAGE EDIT FORM
// ============================================================================

interface ImageEditFormProps {
  hasReplicateKey: boolean;
  projectId: string;
  loraGroups: LoRAGroup[];
  defaultLoraName?: string;
  isGpuOnline: boolean;
}

function ImageEditForm({ hasReplicateKey, projectId, loraGroups, defaultLoraName, isGpuOnline }: ImageEditFormProps) {
  const { imageEdit, updateImageEdit, isGenerating, lastResult, error, setGenerating, setResult, setError, autoEnhance, pushToHistory, activeMode } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!imageEdit.prompt.trim() || !imageEdit.inputImageUrl.trim()) return;

    setGenerating(true, 'Starting image edit...');
    try {
      let finalPrompt = imageEdit.prompt;
      if (autoEnhance) {
        try {
          const enhRes = await fetch('/api/video-editor/enhance-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: imageEdit.prompt, generationType: 'image-edit', projectId }),
          });
          if (enhRes.ok) {
            const enhData = await enhRes.json();
            if (enhData.enhancedPrompt) finalPrompt = enhData.enhancedPrompt;
          }
        } catch {}
      }

      const res = await fetch('/api/video-editor/generate/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          model: imageEdit.modelId,
          inputImageUrl: imageEdit.inputImageUrl,
          maskImageUrl: imageEdit.maskImageUrl || undefined,
          loraName: imageEdit.loraName,
          loraStrength: imageEdit.loraStrength,
          seed: imageEdit.seed,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Edit failed (${res.status})`);
      }

      const data = await res.json();
      const result = {
        mode: activeMode,
        type: 'image' as const,
        url: data.url,
        mimeType: 'image/png',
        prompt: finalPrompt,
        modelId: imageEdit.modelId,
        timestamp: Date.now(),
      };
      setResult(result);
      pushToHistory(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image edit failed');
    }
  }, [imageEdit, autoEnhance, projectId, setGenerating, setResult, setError, pushToHistory, activeMode]);

  return (
    <div className="space-y-3">
      {/* Input Image — tri-path widget */}
      <MediaInputWidget
        label="Input Image"
        value={imageEdit.inputImageUrl}
        onChange={(url) => updateImageEdit({ inputImageUrl: url })}
        accept="image"
        disabled={isGenerating}
        placeholder="Paste URL or drop a clip from the timeline…"
      />

      {/* Prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Edit Prompt
          </label>
          <PromptEnhanceButton
            prompt={imageEdit.prompt}
            onEnhanced={(p) => updateImageEdit({ prompt: p })}
            generationType="image-edit"
            projectId={projectId}
            disabled={isGenerating}
          />
        </div>
        <textarea
          value={imageEdit.prompt}
          onChange={(e) => updateImageEdit({ prompt: e.target.value })}
          placeholder="Describe the changes to make..."
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* Model */}
      <CompactModelSelect
        category="image_edit"
        value={imageEdit.modelId}
        onChange={(v) => updateImageEdit({ modelId: v })}
        hasReplicateKey={hasReplicateKey}
        isGpuOnline={isGpuOnline}
      />

      {/* LoRA */}
      <LoRASelector
        value={imageEdit.loraName}
        onChange={(v) => updateImageEdit({ loraName: v })}
        groups={loraGroups}
        defaultLoraName={defaultLoraName}
      />

      {/* Camera Angle panel — only shown for multiple-angles LoRA */}
      <CameraAnglePanel
        prompt={imageEdit.prompt}
        onPromptChange={(p) => updateImageEdit({ prompt: p })}
        loraName={imageEdit.loraName}
      />

      {/* Advanced */}
      <AdvancedSection>
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Mask Image URL (Optional)
          </label>
          <input
            type="url"
            value={imageEdit.maskImageUrl}
            onChange={(e) => updateImageEdit({ maskImageUrl: e.target.value })}
            placeholder="Optional mask URL for inpainting"
            className="w-full h-7 bg-neutral-900/60 border border-neutral-800 rounded px-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
        <InlineNumberInput
          label="Seed"
          value={imageEdit.seed}
          onChange={(v) => updateImageEdit({ seed: v })}
          placeholder="Random"
          min={0}
        />
      </AdvancedSection>

      {/* Generate Button */}
      <Button
        className="w-full h-9 gap-2 text-xs font-medium"
        onClick={handleGenerate}
        disabled={isGenerating || !imageEdit.prompt.trim() || !imageEdit.inputImageUrl.trim()}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Editing...
          </>
        ) : (
          <>
            <Pencil className="h-3.5 w-3.5" />
            Edit Image
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {lastResult && lastResult.type === 'image' && (
        <GenerationResultPreview result={lastResult} />
      )}

      <GenerationHistoryGallery mode="image-edit" />
    </div>
  );
}

// ============================================================================
// VIDEO GENERATION FORM
// ============================================================================

interface VideoGenFormProps {
  hasReplicateKey: boolean;
  projectId: string;
  isGpuOnline: boolean;
}

function VideoGenForm({ hasReplicateKey, projectId, isGpuOnline, loraGroups, defaultLoraName }: VideoGenFormProps & { loraGroups: LoRAGroup[]; defaultLoraName?: string }) {
  const { videoGen, updateVideoGen, isGenerating, lastResult, error, setGenerating, setResult, setError, autoEnhance, pushToHistory, activeMode } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!videoGen.prompt.trim()) return;

    setGenerating(true, 'Starting video generation...');
    try {
      let finalPrompt = videoGen.prompt;
      if (autoEnhance) {
        try {
          const enhRes = await fetch('/api/video-editor/enhance-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: videoGen.prompt, generationType: 'video', projectId }),
          });
          if (enhRes.ok) {
            const enhData = await enhRes.json();
            if (enhData.enhancedPrompt) finalPrompt = enhData.enhancedPrompt;
          }
        } catch {}
      }

      const res = await fetch('/api/video-editor/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          negativePrompt: videoGen.negativePrompt || undefined,
          model: videoGen.modelId,
          startFrameUrl: videoGen.startFrameUrl || undefined,
          endFrameUrl: videoGen.endFrameUrl || undefined,
          durationSeconds: videoGen.durationSeconds,
          aspectRatio: videoGen.aspectRatio,
          ...(videoGen.resolutionPreset
            ? {
                width: parseInt(videoGen.resolutionPreset.split('x')[0], 10),
                height: parseInt(videoGen.resolutionPreset.split('x')[1], 10),
              }
            : {}),
          loraName: videoGen.loraName,
          loraStrength: videoGen.loraStrength,
          fps: videoGen.fps,
          seed: videoGen.seed,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      const result = {
        mode: activeMode,
        type: 'video' as const,
        url: data.url,
        mimeType: 'video/mp4',
        prompt: finalPrompt,
        modelId: videoGen.modelId,
        timestamp: Date.now(),
        durationSeconds: videoGen.durationSeconds,
      };
      setResult(result);
      pushToHistory(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed');
    }
  }, [videoGen, autoEnhance, projectId, setGenerating, setResult, setError, pushToHistory, activeMode]);

  return (
    <div className="space-y-3">
      {/* Prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Prompt
          </label>
          <PromptEnhanceButton
            prompt={videoGen.prompt}
            onEnhanced={(p) => updateVideoGen({ prompt: p })}
            generationType="video"
            projectId={projectId}
            disabled={isGenerating}
          />
        </div>
        <textarea
          value={videoGen.prompt}
          onChange={(e) => updateVideoGen({ prompt: e.target.value })}
          placeholder="Describe the video scene, camera movement, and action..."
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* Negative Prompt */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Negative Prompt
        </label>
        <textarea
          value={videoGen.negativePrompt}
          onChange={(e) => updateVideoGen({ negativePrompt: e.target.value })}
          placeholder="blurry, flickering, low quality, duplicate, distorted…"
          rows={2}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* Model */}
      <CompactModelSelect
        category="video"
        value={videoGen.modelId}
        onChange={(v) => updateVideoGen({ modelId: v })}
        hasReplicateKey={hasReplicateKey}
        isGpuOnline={isGpuOnline}
      />

      {/* LoRA */}
      <LoRASelector
        value={videoGen.loraName}
        onChange={(v) => updateVideoGen({ loraName: v })}
        groups={loraGroups}
        defaultLoraName={defaultLoraName}
      />

      {/* Start Frame URL — tri-path widget */}
      <MediaInputWidget
        label="Start Frame (Optional)"
        value={videoGen.startFrameUrl}
        onChange={(url) => updateVideoGen({ startFrameUrl: url })}
        accept="image"
        disabled={isGenerating}
        placeholder="First frame image URL…"
      />

      {/* End Frame URL — tri-path widget */}
      <MediaInputWidget
        label="End Frame (Optional)"
        value={videoGen.endFrameUrl}
        onChange={(url) => updateVideoGen({ endFrameUrl: url })}
        accept="image"
        disabled={isGenerating}
        placeholder="Last frame image URL…"
      />

      {/* Duration & Aspect Ratio */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Duration
          </label>
          <Select
            value={String(videoGen.durationSeconds)}
            onValueChange={(v) => updateVideoGen({ durationSeconds: Number(v) })}
          >
            <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {[2, 3, 5, 8, 10].map((d) => (
                <SelectItem key={d} value={String(d)} className="text-xs">
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            Aspect Ratio
          </label>
          <Select
            value={videoGen.aspectRatio}
            onValueChange={(v) => updateVideoGen({ aspectRatio: v, resolutionPreset: null })}
          >
            <SelectTrigger className="h-8 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {ASPECT_RATIOS.map((ar) => (
                <SelectItem key={ar.value} value={ar.value} className="text-xs">
                  {ar.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resolution Presets (LTX-2 64px-aligned) */}
      <ResolutionPresetSelector
        aspectRatio={videoGen.aspectRatio}
        value={videoGen.resolutionPreset}
        onChange={(k) => updateVideoGen({ resolutionPreset: k })}
        mode="video"
        disabled={isGenerating}
      />

      {/* Advanced */}
      <AdvancedSection>
        <div className="space-y-1">
          <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
            FPS
          </label>
          <Select value={String(videoGen.fps)} onValueChange={(v) => updateVideoGen({ fps: Number(v) })}>
            <SelectTrigger className="h-7 text-xs bg-neutral-900/60 border-neutral-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800">
              {FPS_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={String(f.value)} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InlineNumberInput
          label="Seed"
          value={videoGen.seed}
          onChange={(v) => updateVideoGen({ seed: v })}
          placeholder="Random"
          min={0}
        />
      </AdvancedSection>

      {/* Generate Button */}
      <Button
        className="w-full h-9 gap-2 text-xs font-medium"
        onClick={handleGenerate}
        disabled={isGenerating || !videoGen.prompt.trim()}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Bot className="h-3.5 w-3.5" />
            Generate Video
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 p-2 bg-destructive/10 border border-destructive/20 rounded text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {lastResult && lastResult.type === 'video' && (
        <GenerationResultPreview result={lastResult} />
      )}

      <GenerationHistoryGallery mode="video-gen" />
    </div>
  );
}

// ============================================================================
// MAIN AI GENERATION TAB
// ============================================================================

export function AIGenerationTab() {
  const { activeMode, setActiveMode } = useAIGenerationStore();
  const { projectId } = useEditorContext();
  const { availability, loading: keysLoading } = useApiKeys();
  const { settings, loading: settingsLoading } = useProjectSettings(projectId);

  const hasReplicateKey = availability.replicate_key;

  // ── VM & VRAM mode state for GPU-dependent features ──
  const { displayStatus, apiReady } = useGCPVM();
  const { currentMode, isSwitching, switchToAll, isGpuReady } = useVramMode(apiReady);
  const vmIsOn = displayStatus === "ON";

  // Modes that never need the GPU (browser-based or use external APIs)
  const GPU_FREE_MODES: AIGenerationMode[] = useMemo(() => ['motion', 'tts', 'sfx'], []);
  // Modes that can fallback to Replicate cloud when GPU is offline
  const REPLICATE_FALLBACK_MODES: AIGenerationMode[] = useMemo(() => ['image-gen', 'image-edit', 'video-gen'], []);

  // Only show the blocking GPU overlay for modes that strictly require the GPU (audio)
  const showGpuOverlay = useMemo(() => {
    if (isGpuReady) return false;
    if (GPU_FREE_MODES.includes(activeMode)) return false;
    if (REPLICATE_FALLBACK_MODES.includes(activeMode)) return false;
    return true; // audio-gen → requires GPU
  }, [isGpuReady, activeMode, GPU_FREE_MODES, REPLICATE_FALLBACK_MODES]);

  // Show an info banner for modes that work but only with Replicate (GPU offline)
  const showReplicateOnlyBanner = useMemo(() => {
    if (isGpuReady) return false;
    return REPLICATE_FALLBACK_MODES.includes(activeMode);
  }, [isGpuReady, activeMode, REPLICATE_FALLBACK_MODES]);

  // Get LoRA info from project creative direction
  const projectLoras = useMemo(
    () => settings?.visuals?.creativeDirection?.loras || [],
    [settings]
  );
  const defaultLoraName = settings?.visuals?.creativeDirection?.defaultLoraName;

  // Fetch built-in LoRAs from /api/loras
  const [builtInLoras, setBuiltInLoras] = useState<{
    style: Array<{ name: string; label: string; category: string }>;
    mood: Array<{ name: string; label: string; category: string }>;
  }>({ style: [], mood: [] });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/loras')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.categories) {
          setBuiltInLoras(data.categories);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Channel defaults seeding — runs once per session on first mount
  const {
    imageGen, updateImageGen, updateVideoGen,
    autoEnhance, setAutoEnhance,
    channelDefaultsSeeded, markChannelDefaultsSeeded,
  } = useAIGenerationStore();

  useEffect(() => {
    if (channelDefaultsSeeded || settingsLoading || !settings) return;

    // Seed default LoRA from project creative direction
    if (defaultLoraName && imageGen.loraName === null) {
      updateImageGen({ loraName: defaultLoraName });
      updateVideoGen({ loraName: defaultLoraName });
    }

    // Seed aspect ratio from project basic info (already in '16-9' dash format)
    const projectAspect = settings?.basic_info?.aspectRatio;
    if (projectAspect) {
      updateImageGen({ aspectRatio: projectAspect });
      updateVideoGen({ aspectRatio: projectAspect });
    }

    markChannelDefaultsSeeded();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelDefaultsSeeded, settingsLoading, settings]);

  // Build grouped LoRA list for the selector
  const loraGroups = useMemo((): Array<{ label: string; items: Array<{ name: string; displayName?: string }> }> => {
    const groups: Array<{ label: string; items: Array<{ name: string; displayName?: string }> }> = [];

    // Project LoRAs (user-uploaded)
    if (projectLoras.length > 0) {
      groups.push({
        label: 'Project LoRAs',
        items: projectLoras.map((l) => ({ name: l.name, displayName: l.name })),
      });
    }

    // Built-in style LoRAs
    if (builtInLoras.style.length > 0) {
      groups.push({
        label: 'Style',
        items: builtInLoras.style.map((l) => ({ name: l.name, displayName: l.label })),
      });
    }

    // Built-in mood LoRAs
    if (builtInLoras.mood.length > 0) {
      groups.push({
        label: 'Mood',
        items: builtInLoras.mood.map((l) => ({ name: l.name, displayName: l.label })),
      });
    }

    return groups;
  }, [projectLoras, builtInLoras]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab switcher + Auto-Enhance toggle */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="flex flex-wrap gap-1">
          {SUB_TABS.map(({ id, label, icon: Icon, comingSoon }) => (
            <button
              key={id}
              onClick={() => !comingSoon && setActiveMode(id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all',
                activeMode === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : comingSoon
                    ? 'bg-neutral-800/40 text-neutral-600 cursor-default'
                    : 'bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
              )}
            >
              {React.createElement(Icon, { className: "h-3 w-3" })}
              {label}
              {comingSoon && (
                <span className="text-[7px] bg-orange-500/20 text-orange-400 px-1 rounded font-semibold leading-tight">
                  SOON
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Auto-Enhance toggle (only relevant for gen modes) */}
        {['image-gen', 'image-edit', 'video-gen'].includes(activeMode) && (
          <div className="flex items-center justify-between">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setAutoEnhance(!autoEnhance)}
                    className={cn(
                      'flex items-center gap-1.5 text-[10px] font-medium transition-colors',
                      autoEnhance
                        ? 'text-orange-400'
                        : 'text-neutral-500 hover:text-neutral-300'
                    )}
                  >
                    {autoEnhance ? (
                      <Zap className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Auto-Enhance
                    <span
                      className={cn(
                        'ml-0.5 px-1 rounded text-[8px] font-semibold',
                        autoEnhance
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-neutral-800 text-neutral-600'
                      )}
                    >
                      {autoEnhance ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-neutral-800 border-neutral-700 text-[10px] max-w-[220px]">
                  Automatically enhance prompts with project style before each generation. Requires OpenRouter key.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-hide relative">
        {/* GPU not-ready overlay */}
        {showGpuOverlay && (
          <div className="absolute inset-0 z-10 flex items-center justify-center
            bg-background/70 backdrop-blur-[2px] rounded-md">
            <div className="flex flex-col items-center gap-3 px-6 py-5 text-center max-w-[260px]">
              <div className="w-10 h-10 rounded-full bg-neutral-800/80 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-neutral-400" />
              </div>
              {!vmIsOn ? (
                <>
                  <p className="text-xs font-medium text-neutral-300">GPU is offline</p>
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    Start your VM to use AI generation features.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-neutral-300">
                    VRAM mode: <span className="font-mono text-amber-400">{currentMode || '...'}</span>
                  </p>
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    Switch to <span className="font-semibold text-neutral-400">All Models</span> to use AI generation.
                  </p>
                  <button
                    onClick={() => switchToAll()}
                    disabled={isSwitching}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                      bg-primary text-primary-foreground text-[11px] font-semibold
                      hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSwitching ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Switching…
                      </>
                    ) : (
                      'Switch to All Models'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Actual content (grayed out when overlay is showing) */}
        <div className={showGpuOverlay ? 'opacity-40 pointer-events-none select-none' : ''}>
        {/* GPU offline info banner for Replicate-fallback modes */}
        {showReplicateOnlyBanner && (
          <div className="flex items-start gap-2 p-2.5 mb-3 rounded-md border border-amber-500/30 bg-amber-500/5">
            <Info className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-300/90 leading-relaxed">
              GPU is offline — only <span className="font-semibold text-amber-200">Replicate</span> (cloud) models are available. Start the VM to use local models.
            </p>
          </div>
        )}
        {(keysLoading || settingsLoading) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
          </div>
        ) : activeMode === 'image-gen' ? (
          <ImageGenForm
            hasReplicateKey={hasReplicateKey}
            projectId={projectId}
            loraGroups={loraGroups}
            defaultLoraName={defaultLoraName}
            isGpuOnline={isGpuReady}
          />
        ) : activeMode === 'image-edit' ? (
          <ImageEditForm
            hasReplicateKey={hasReplicateKey}
            projectId={projectId}
            loraGroups={loraGroups}
            defaultLoraName={defaultLoraName}
            isGpuOnline={isGpuReady}
          />
        ) : activeMode === 'video-gen' ? (
          <VideoGenForm
            hasReplicateKey={hasReplicateKey}
            projectId={projectId}
            isGpuOnline={isGpuReady}
            loraGroups={loraGroups}
            defaultLoraName={defaultLoraName}
          />
        ) : activeMode === 'motion' ? (
          <React.Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          }>
            <MotionGraphicsTab />
          </React.Suspense>
        ) : activeMode === 'sfx' ? (
          <SfxSearchForm />
        ) : activeMode === 'audio' ? (
          <AudioGenForm />
        ) : activeMode === 'tts' ? (
          <React.Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          }>
            <TtsGenerationForm />
          </React.Suspense>
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default AIGenerationTab;
