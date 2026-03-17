'use client';

/**
 * ModelSelectorDialog - Select OpenRouter AI models for motion graphics generation
 * 
 * Adapted from gpt-story-writer-niche-sys ModelSelectorDialog.
 * Uses Vid-Bolt's existing /api/openrouter/models endpoint.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Star, Zap, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { getProviderLogo } from './provider-logos';

// ============================================================
// TYPES
// ============================================================

interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  createdAt: number;
  pricing: {
    promptPer1M: number;
    completionPer1M: number;
  };
}

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectModel: (modelId: string, modelName: string) => void;
  selectedModelId: string;
}

// ============================================================
// CURATED POPULAR MODELS
// ============================================================

const POPULAR_MODELS: Array<{
  id: string;
  name: string;
  provider: string;
  badge?: string;
  description: string;
}> = [
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    badge: 'Default',
    description: 'Latest Gemini — fast, high-quality code generation',
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    badge: 'Fast',
    description: 'Best balance of speed and quality for code generation',
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    badge: 'Pro',
    description: 'Highest quality for complex animations',
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    badge: 'Recommended',
    description: 'Excellent for creative, well-structured code',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Strong coding model, good for animations',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI\'s most capable multimodal model',
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    badge: 'Budget',
    description: 'Fast and affordable, great for simple animations',
  },
  {
    id: 'x-ai/grok-3-mini-beta',
    name: 'Grok 3 Mini',
    provider: 'x-ai',
    description: 'Fast reasoning model from xAI',
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek Chat V3',
    provider: 'deepseek',
    badge: 'Value',
    description: 'High quality at very low cost',
  },
];

// ============================================================
// HELPERS
// ============================================================

function formatPrice(pricePer1M: number): string {
  if (pricePer1M === 0) return 'Free';
  if (pricePer1M < 0.01) return '<$0.01';
  if (pricePer1M < 1) return `$${pricePer1M.toFixed(2)}`;
  return `$${pricePer1M.toFixed(2)}`;
}

function formatContextLength(length: number): string {
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
  return String(length);
}

function getModelDisplayName(modelId: string): string {
  const popular = POPULAR_MODELS.find(m => m.id === modelId);
  if (popular) return popular.name;
  
  // Format from model ID: "provider/model-name" → "Model Name"
  const parts = modelId.split('/');
  const name = parts[parts.length - 1];
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================
// MODEL CARD COMPONENT
// ============================================================

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    provider?: string;
    badge?: string;
    description?: string;
    contextLength?: number;
    pricing?: { promptPer1M: number; completionPer1M: number };
  };
  isSelected: boolean;
  isFavorite?: boolean;
  onSelect: () => void;
  onToggleFavorite?: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) => {
  const provider = model.provider || model.id.split('/')[0];
  const LogoComponent = getProviderLogo(model.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-150 hover:bg-accent/50 group cursor-pointer ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Provider Logo */}
        <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded flex items-center justify-center bg-muted">
          {LogoComponent ? (
            <LogoComponent className="h-4 w-4" />
          ) : (
            <span className="text-xs font-medium text-muted-foreground">
              {provider.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Model Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm truncate">{model.name}</span>
            {model.badge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {model.badge}
              </Badge>
            )}
            {isSelected && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">
                Selected
              </Badge>
            )}
          </div>
          
          {model.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mb-1">
              {model.description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="font-mono text-muted-foreground/70">{model.id}</span>
            {model.contextLength && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatContextLength(model.contextLength)}
              </span>
            )}
            {model.pricing && model.pricing.promptPer1M > 0 && (
              <span className="flex items-center gap-0.5">
                <Zap className="h-2.5 w-2.5" />
                {formatPrice(model.pricing.promptPer1M)}/1M
              </span>
            )}
          </div>
        </div>

        {/* Favorite & Arrow */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="p-1 rounded hover:bg-muted"
            >
              <Star
                className={`h-3.5 w-3.5 ${
                  isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                }`}
              />
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN DIALOG
// ============================================================

export function ModelSelectorDialog({
  open,
  onOpenChange,
  onSelectModel,
  selectedModelId,
}: ModelSelectorDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);
  const [activeTab, setActiveTab] = useState('popular');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Favorites from localStorage
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('openrouter-favorite-models');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery('');
    }
  }, [open]);

  // Load all models when "All Models" tab is selected
  const loadAllModels = useCallback(async () => {
    if (hasLoadedAll || isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/openrouter/models');
      if (response.ok) {
        const data = await response.json();
        setAllModels(data.models || []);
        setHasLoadedAll(true);
      }
    } catch (error) {
      console.error('[ModelSelector] Failed to load models:', error);
    } finally {
      setIsLoading(false);
    }
  }, [hasLoadedAll, isLoading]);

  useEffect(() => {
    if (activeTab === 'all' && !hasLoadedAll) {
      loadAllModels();
    }
  }, [activeTab, hasLoadedAll, loadAllModels]);

  // Toggle favorite
  const toggleFavorite = useCallback((modelId: string) => {
    setFavorites(prev => {
      const next = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem('openrouter-favorite-models', JSON.stringify(next));
      return next;
    });
  }, []);

  // Filter popular models
  const filteredPopular = useMemo(() => {
    if (!searchQuery) return POPULAR_MODELS;
    const q = searchQuery.toLowerCase();
    return POPULAR_MODELS.filter(
      m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Filter all models
  const filteredAll = useMemo(() => {
    if (!searchQuery) return allModels;
    const q = searchQuery.toLowerCase();
    return allModels.filter(
      m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
  }, [searchQuery, allModels]);

  // Favorite models
  const favoriteModels = useMemo(() => {
    const fromPopular = POPULAR_MODELS.filter(m => favorites.includes(m.id));
    const fromAll = allModels.filter(m => favorites.includes(m.id) && !fromPopular.some(p => p.id === m.id));
    return [
      ...fromPopular,
      ...fromAll.map(m => ({
        id: m.id,
        name: m.name,
        provider: m.id.split('/')[0],
        contextLength: m.contextLength,
        pricing: m.pricing,
      })),
    ];
  }, [favorites, allModels]);

  const handleSelect = useCallback((modelId: string) => {
    const displayName = getModelDisplayName(modelId);
    onSelectModel(modelId, displayName);
    onOpenChange(false);
  }, [onSelectModel, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">Select AI Model</DialogTitle>
          <DialogDescription className="sr-only">
            Choose an AI model for motion graphics generation
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mb-2 w-auto">
            <TabsTrigger value="popular" className="text-xs">
              Popular
            </TabsTrigger>
            <TabsTrigger value="favorites" className="text-xs">
              Favorites ({favorites.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              All Models
            </TabsTrigger>
          </TabsList>

          {/* Popular Models */}
          <TabsContent value="popular" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-1.5 pr-3">
                {filteredPopular.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    isSelected={model.id === selectedModelId}
                    isFavorite={favorites.includes(model.id)}
                    onSelect={() => handleSelect(model.id)}
                    onToggleFavorite={() => toggleFavorite(model.id)}
                  />
                ))}
                {filteredPopular.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No models match &quot;{searchQuery}&quot;
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Favorites */}
          <TabsContent value="favorites" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-1.5 pr-3">
                {favoriteModels.length === 0 ? (
                  <div className="text-center py-8">
                    <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No favorites yet. Star models to add them here.
                    </p>
                  </div>
                ) : (
                  favoriteModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isSelected={model.id === selectedModelId}
                      isFavorite={true}
                      onSelect={() => handleSelect(model.id)}
                      onToggleFavorite={() => toggleFavorite(model.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* All Models */}
          <TabsContent value="all" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-1.5 pr-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading models...</p>
                  </div>
                ) : filteredAll.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {searchQuery ? `No models match "${searchQuery}"` : 'No models available'}
                  </p>
                ) : (
                  filteredAll.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={{
                        id: model.id,
                        name: model.name,
                        provider: model.id.split('/')[0],
                        contextLength: model.contextLength,
                        pricing: model.pricing,
                      }}
                      isSelected={model.id === selectedModelId}
                      isFavorite={favorites.includes(model.id)}
                      onSelect={() => handleSelect(model.id)}
                      onToggleFavorite={() => toggleFavorite(model.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export { getModelDisplayName, POPULAR_MODELS };
export type { OpenRouterModel };
