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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import type { AIGenerationMode } from '../../../stores/ai-generation-store';
import { useEditorContext } from '../../../contexts/editor-context';
import { useApiKeys } from '@/hooks/use-api-keys';
import { useProjectSettings } from '@/hooks/use-project-settings';
import {
  getModelsByCategory,
  getModelById,
  type ModelDefinition,
} from '@/lib/constants/model-registry';
import { startMediaDrag, endDrag } from '../../../stores/video-editor-store';
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
}

function CompactModelSelect({
  category,
  value,
  onChange,
  hasReplicateKey,
}: CompactModelSelectProps) {
  const models = getModelsByCategory(category);
  const localModels = models.filter((m) => m.provider === 'local');
  const replicateModels = models.filter((m) => m.provider === 'replicate');
  const selectedModel = getModelById(value);

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
              Local GPU
            </SelectLabel>
            {localModels.map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-xs">
                {model.label}
              </SelectItem>
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
// AUDIO GENERATION RESULT (draggable)
// ============================================================================

function AudioResultPreview({ result }: { result: { url: string; prompt: string } }) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const dragData = {
        isNewItem: true,
        type: 'audio',
        label: 'AI Generated Music',
        duration: 30,
        data: {
          src: result.url,
          isAiGenerated: true,
        },
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));

      startMediaDrag('audio', result.url, {
        duration: 30,
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
  const { audioGen, updateAudioGen, isGenerating, lastResult, error, setGenerating, setResult, setError } =
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
          lyrics: audioGen.lyrics || '[Instrumental]',
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
      setResult({
        type: 'audio',
        url: data.url,
        mimeType: 'audio/wav',
        prompt: audioGen.prompt,
        modelId: 'acestep-v15-turbo',
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio generation failed');
    }
  }, [audioGen, setGenerating, setResult, setError]);

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

      {/* Lyrics Structure */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Energy Structure
        </label>
        <textarea
          value={audioGen.lyrics}
          onChange={(e) => updateAudioGen({ lyrics: e.target.value })}
          placeholder={'[Instrumental]\n[Intro]\n[Verse - gentle, atmospheric]\n[Chorus - intense, full]\n[Outro - fading]'}
          rows={3}
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
          disabled={isGenerating}
        />
        <p className="text-[9px] text-neutral-600 leading-tight">
          Section tags control energy dynamics. Use [Intro], [Verse], [Chorus], [Outro] with descriptors.
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
            onChange={(e) => updateAudioGen({ bpm: Math.max(40, Math.min(200, Number(e.target.value) || 100)) })}
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
}

function ImageGenForm({ hasReplicateKey, projectId, loraGroups, defaultLoraName }: ImageGenFormProps) {
  const { imageGen, updateImageGen, isGenerating, lastResult, error, setGenerating, setResult, setError } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!imageGen.prompt.trim()) return;

    setGenerating(true, 'Starting image generation...');
    try {
      const res = await fetch('/api/video-editor/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imageGen.prompt,
          model: imageGen.modelId,
          aspectRatio: imageGen.aspectRatio,
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
      setResult({
        type: 'image',
        url: data.url,
        mimeType: 'image/png',
        prompt: imageGen.prompt,
        modelId: imageGen.modelId,
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    }
  }, [imageGen, setGenerating, setResult, setError]);

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

      {/* Model */}
      <CompactModelSelect
        category="image"
        value={imageGen.modelId}
        onChange={(v) => updateImageGen({ modelId: v })}
        hasReplicateKey={hasReplicateKey}
      />

      {/* LoRA */}
      <LoRASelector
        value={imageGen.loraName}
        onChange={(v) => updateImageGen({ loraName: v })}
        groups={loraGroups}
        defaultLoraName={defaultLoraName}
      />

      {/* Aspect Ratio */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Aspect Ratio
        </label>
        <Select value={imageGen.aspectRatio} onValueChange={(v) => updateImageGen({ aspectRatio: v })}>
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
}

function ImageEditForm({ hasReplicateKey, projectId, loraGroups, defaultLoraName }: ImageEditFormProps) {
  const { imageEdit, updateImageEdit, isGenerating, lastResult, error, setGenerating, setResult, setError } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!imageEdit.prompt.trim() || !imageEdit.inputImageUrl.trim()) return;

    setGenerating(true, 'Starting image edit...');
    try {
      const res = await fetch('/api/video-editor/generate/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imageEdit.prompt,
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
      setResult({
        type: 'image',
        url: data.url,
        mimeType: 'image/png',
        prompt: imageEdit.prompt,
        modelId: imageEdit.modelId,
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image edit failed');
    }
  }, [imageEdit, setGenerating, setResult, setError]);

  return (
    <div className="space-y-3">
      {/* Input Image URL */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Input Image URL
        </label>
        <input
          type="url"
          value={imageEdit.inputImageUrl}
          onChange={(e) => updateImageEdit({ inputImageUrl: e.target.value })}
          placeholder="https://... or paste image URL"
          className="w-full h-8 bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

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
      />

      {/* LoRA */}
      <LoRASelector
        value={imageEdit.loraName}
        onChange={(v) => updateImageEdit({ loraName: v })}
        groups={loraGroups}
        defaultLoraName={defaultLoraName}
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
    </div>
  );
}

// ============================================================================
// VIDEO GENERATION FORM
// ============================================================================

interface VideoGenFormProps {
  hasReplicateKey: boolean;
  projectId: string;
}

function VideoGenForm({ hasReplicateKey, projectId }: VideoGenFormProps) {
  const { videoGen, updateVideoGen, isGenerating, lastResult, error, setGenerating, setResult, setError } =
    useAIGenerationStore();

  const handleGenerate = useCallback(async () => {
    if (!videoGen.prompt.trim()) return;

    setGenerating(true, 'Starting video generation...');
    try {
      const res = await fetch('/api/video-editor/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoGen.prompt,
          model: videoGen.modelId,
          startFrameUrl: videoGen.startFrameUrl || undefined,
          endFrameUrl: videoGen.endFrameUrl || undefined,
          durationSeconds: videoGen.durationSeconds,
          aspectRatio: videoGen.aspectRatio,
          fps: videoGen.fps,
          seed: videoGen.seed,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }

      const data = await res.json();
      setResult({
        type: 'video',
        url: data.url,
        mimeType: 'video/mp4',
        prompt: videoGen.prompt,
        modelId: videoGen.modelId,
        timestamp: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video generation failed');
    }
  }, [videoGen, setGenerating, setResult, setError]);

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

      {/* Model */}
      <CompactModelSelect
        category="video"
        value={videoGen.modelId}
        onChange={(v) => updateVideoGen({ modelId: v })}
        hasReplicateKey={hasReplicateKey}
      />

      {/* Start Frame URL */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          Start Frame URL (Optional)
        </label>
        <input
          type="url"
          value={videoGen.startFrameUrl}
          onChange={(e) => updateVideoGen({ startFrameUrl: e.target.value })}
          placeholder="https://... first frame image"
          className="w-full h-8 bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

      {/* End Frame URL */}
      <div className="space-y-1">
        <label className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
          End Frame URL (Optional)
        </label>
        <input
          type="url"
          value={videoGen.endFrameUrl}
          onChange={(e) => updateVideoGen({ endFrameUrl: e.target.value })}
          placeholder="https://... last frame image"
          className="w-full h-8 bg-neutral-900/60 border border-neutral-800 rounded-md px-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
          disabled={isGenerating}
        />
      </div>

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
          <Select value={videoGen.aspectRatio} onValueChange={(v) => updateVideoGen({ aspectRatio: v })}>
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
  const showGpuOverlay = !isGpuReady;

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

  // Auto-select the project's default LoRA on first load
  const { imageGen, updateImageGen } = useAIGenerationStore();
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && defaultLoraName && imageGen.loraName === null) {
      updateImageGen({ loraName: defaultLoraName });
      hasAutoSelectedRef.current = true;
    }
  }, [defaultLoraName, imageGen.loraName, updateImageGen]);

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
      {/* Sub-tab switcher */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
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
          />
        ) : activeMode === 'image-edit' ? (
          <ImageEditForm
            hasReplicateKey={hasReplicateKey}
            projectId={projectId}
            loraGroups={loraGroups}
            defaultLoraName={defaultLoraName}
          />
        ) : activeMode === 'video-gen' ? (
          <VideoGenForm
            hasReplicateKey={hasReplicateKey}
            projectId={projectId}
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
