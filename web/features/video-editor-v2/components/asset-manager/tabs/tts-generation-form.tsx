'use client';

/**
 * TTS Generation Form
 * ============================================================================
 * Form for generating Text-to-Speech audio in the editor.
 * 
 * Supports multiple providers (Inworld active, ElevenLabs + GenAI as placeholders).
 * Includes voice selection, model, speaking rate, temperature, and text input.
 * Generated audio can be previewed and dragged to the timeline.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic,
  Loader2,
  Play,
  Pause,
  GripVertical,
  AlertCircle,
  Lock,
  Check,
  ChevronDown,
  Volume2,
  Settings2,
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
import { Slider } from '../../ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { useAIGenerationStore } from '../../../stores/ai-generation-store';
import { useApiKeys } from '@/hooks/use-api-keys';
import { startMediaDrag, endDrag } from '../../../stores/video-editor-store';

// ============================================================================
// TYPES
// ============================================================================

interface Voice {
  voiceId: string;
  displayName: string;
  languages?: string[];
  tags?: string[];
  isCustom?: boolean;
}

interface TtsResult {
  url: string;
  duration: number;
  mimeType: string;
  wordTimestamps?: Array<{ word: string; start_seconds: number; end_seconds: number }>;
  audioNormalizationStatus?: 'completed';
  normalizedAudioUrl?: string | null;
  originalLufs?: number | null;
  normalizedLufs?: number | null;
  truePeakDbtp?: number | null;
}

// ============================================================================
// PROVIDER CONFIG
// ============================================================================

const PROVIDERS = [
  { 
    id: 'inworld' as const, 
    label: 'Inworld AI', 
    keyField: 'inworld_tts_key' as const,
    models: [
      { id: 'inworld-tts-1.5-max', label: 'TTS 1.5 Max (8B)' },
      { id: 'inworld-tts-1.5-mini', label: 'TTS 1.5 Mini (1B)' },
    ],
  },
  { 
    id: 'elevenlabs' as const, 
    label: 'ElevenLabs', 
    keyField: 'elevenlabs_key' as const,
    models: [
      { id: 'eleven_multilingual_v2', label: 'Multilingual v2' },
      { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
    ],
  },
  { 
    id: 'genai' as const, 
    label: 'Google GenAI', 
    keyField: 'genai_key' as const,
    models: [
      { id: 'genai-tts-default', label: 'Default' },
    ],
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TtsGenerationForm: React.FC = () => {
  const { ttsForm, updateTtsForm, isGenerating, setGenerating, setError, error } = useAIGenerationStore();
  const { availability, loading: keysLoading } = useApiKeys();

  // Voice list
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  // Result
  const [result, setResult] = useState<TtsResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Current provider config
  const currentProvider = PROVIDERS.find(p => p.id === ttsForm.provider) || PROVIDERS[0];
  const isProviderConfigured = !keysLoading && availability[currentProvider.keyField];
  const isInworldSelected = ttsForm.provider === 'inworld';
  const isProviderImplemented = ttsForm.provider === 'inworld'; // Only Inworld is implemented

  // Fetch voices when provider changes (only for Inworld)
  useEffect(() => {
    if (ttsForm.provider !== 'inworld' || !isProviderConfigured) {
      setVoices([]);
      return;
    }

    let cancelled = false;
    setVoicesLoading(true);

    fetch('/api/tts/voices')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setVoices(data.voices || []);
      })
      .catch(() => {
        if (cancelled) return;
        setVoices([]);
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });

    return () => { cancelled = true; };
  }, [ttsForm.provider, isProviderConfigured]);

  // Generate TTS
  const handleGenerate = useCallback(async () => {
    if (!ttsForm.text.trim() || isGenerating) return;

    setGenerating(true, 'Generating speech...');
    setResult(null);

    try {
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsForm.text.trim(),
          voiceId: ttsForm.voiceId,
          modelId: ttsForm.modelId,
          speakingRate: ttsForm.speakingRate,
          temperature: ttsForm.temperature,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      const data = await res.json() as TtsResult;
      setResult(data);
      setGenerating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  }, [ttsForm, isGenerating, setGenerating, setError]);

  // Audio playback
  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !result) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, result]);

  // Handle audio end
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [result]);

  // Drag to timeline
  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!result) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      isNewItem: true,
      type: 'audio',
      label: `TTS - ${ttsForm.voiceId}`,
      duration: result.duration,
      data: {
        src: result.normalizedAudioUrl || result.url,
        originalUrl: result.url,
        normalizedAudioUrl: result.normalizedAudioUrl || result.url,
        audioNormalizationStatus: result.audioNormalizationStatus || 'completed',
        name: `TTS - ${ttsForm.voiceId}`,
      },
    }));

    startMediaDrag('audio', result.normalizedAudioUrl || result.url, {
      name: `TTS - ${ttsForm.voiceId}`,
      duration: result.duration,
    });
  }, [result, ttsForm.voiceId]);

  const handleDragEnd = useCallback(() => {
    endDrag();
  }, []);

  // Character count
  const charCount = ttsForm.text.length;
  const charLimit = 10000;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Provider Selector */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
          Provider
        </label>
        <Select
          value={ttsForm.provider}
          onValueChange={(v) => updateTtsForm({ provider: v as 'inworld' | 'elevenlabs' | 'genai' })}
        >
          <SelectTrigger className="h-8 text-xs bg-black/30 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(provider => {
              const hasKey = !keysLoading && availability[provider.keyField];
              const isImplemented = provider.id === 'inworld';
              return (
                <SelectItem 
                  key={provider.id} 
                  value={provider.id}
                  disabled={!isImplemented && !hasKey}
                  className="text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span>{provider.label}</span>
                    {!hasKey && (
                      <Lock className="h-3 w-3 text-white/30" />
                    )}
                    {!isImplemented && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/30">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* API Key Warning */}
      {!keysLoading && !isProviderConfigured && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/80 leading-relaxed">
            <strong>{currentProvider.label}</strong> API key not configured.
            Go to <strong>Settings → API Keys</strong> to add it.
          </div>
        </div>
      )}

      {/* Not Implemented Notice */}
      {!isProviderImplemented && isProviderConfigured && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <AlertCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-200/80 leading-relaxed">
            <strong>{currentProvider.label}</strong> TTS is coming soon.
            Only Inworld AI is available for now.
          </div>
        </div>
      )}

      {/* Controls — grayed out if no API key or not implemented */}
      <div className={cn(
        "space-y-3 transition-opacity",
        (!isProviderConfigured || !isProviderImplemented) && "opacity-40 pointer-events-none"
      )}>
        {/* Voice Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
            Voice
          </label>
          <Select
            value={ttsForm.voiceId}
            onValueChange={(v) => updateTtsForm({ voiceId: v })}
            disabled={voicesLoading}
          >
            <SelectTrigger className="h-8 text-xs bg-black/30 border-white/10">
              <SelectValue placeholder={voicesLoading ? 'Loading voices...' : 'Select voice'} />
            </SelectTrigger>
            <SelectContent>
              {voices.length > 0 ? (
                voices.map(voice => (
                  <SelectItem key={voice.voiceId} value={voice.voiceId} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span>{voice.displayName}</span>
                      {voice.tags && voice.tags.length > 0 && (
                        <span className="text-[9px] text-white/30">
                          {voice.tags.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={ttsForm.voiceId} className="text-xs">
                  {ttsForm.voiceId}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Model Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
            Model
          </label>
          <Select
            value={ttsForm.modelId}
            onValueChange={(v) => updateTtsForm({ modelId: v })}
          >
            <SelectTrigger className="h-8 text-xs bg-black/30 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProvider.models.map(model => (
                <SelectItem key={model.id} value={model.id} className="text-xs">
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Speaking Rate */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
              Speaking Rate
            </label>
            <span className="text-[10px] font-mono text-white/40">{ttsForm.speakingRate.toFixed(1)}x</span>
          </div>
          <Slider
            value={[ttsForm.speakingRate]}
            onValueChange={([v]) => updateTtsForm({ speakingRate: v })}
            min={0.5}
            max={2.0}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Temperature */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
              Temperature
            </label>
            <span className="text-[10px] font-mono text-white/40">{ttsForm.temperature.toFixed(1)}</span>
          </div>
          <Slider
            value={[ttsForm.temperature]}
            onValueChange={([v]) => updateTtsForm({ temperature: v })}
            min={0.1}
            max={2.0}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Text Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
              Text
            </label>
            <span className={cn(
              "text-[10px] font-mono",
              charCount > charLimit * 0.9 ? "text-amber-400" : "text-white/30"
            )}>
              {charCount.toLocaleString()}/{charLimit.toLocaleString()}
            </span>
          </div>
          <textarea
            value={ttsForm.text}
            onChange={(e) => updateTtsForm({ text: e.target.value })}
            placeholder="Enter text to convert to speech..."
            rows={5}
            maxLength={charLimit}
            className={cn(
              "w-full resize-none rounded-lg px-3 py-2.5 text-xs leading-relaxed",
              "bg-black/30 border border-white/10",
              "text-white placeholder:text-white/30",
              "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
              "transition-colors"
            )}
          />
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !ttsForm.text.trim() || !isProviderConfigured}
          className="w-full h-9 text-xs font-medium gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Generate Speech
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-200/80 leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      {/* Result Preview */}
      {result && (
        <div
          className="bg-black/30 rounded-xl border border-white/10 p-3 space-y-2"
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayback}
                className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 text-primary" />
                ) : (
                  <Play className="h-4 w-4 text-primary ml-0.5" />
                )}
              </button>
              <div>
                <p className="text-xs text-white/80 font-medium">Generated Audio</p>
                <p className="text-[10px] text-white/40">
                  {result.duration.toFixed(1)}s • {ttsForm.voiceId}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-white/30">
              <GripVertical className="h-4 w-4" />
              <span className="text-[9px]">Drag to timeline</span>
            </div>
          </div>
          <audio ref={audioRef} src={result.url} preload="auto" />
        </div>
      )}
    </div>
  );
};

export default TtsGenerationForm;
