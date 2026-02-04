/**
 * AI Settings Dialog
 * 
 * Allows users to configure:
 * - AI model selection (loaded from OpenRouter)
 * - Streaming preferences
 * 
 * Uses the user's OpenRouter API key from user settings.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { Badge } from "../../ui/badge";
import { ScrollArea } from "../../ui/scroll-area";
import { useAISettingsStore } from "../../../stores/ai-settings-store";
// TODO: These hooks/services don't exist in Vid-Bolt - AI settings disabled
// import { useUserSettings } from "@/hooks/use-settings";
// import { openRouterModelService, type OpenRouterModel } from "@/services/OpenRouterModelService";
type OpenRouterModel = { id: string; name: string; description?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } };
import {
  Settings,
  Sparkles,
  Check,
  Loader2,
  ExternalLink,
  Search,
  Cpu,
  Zap,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface AISettingsDialogProps {
  trigger?: React.ReactNode;
}

interface ModelsByProvider {
  [provider: string]: OpenRouterModel[];
}

// Provider display names and colors
const PROVIDER_INFO: Record<string, { name: string; color: string; bgColor: string }> = {
  anthropic: { name: 'Anthropic', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  openai: { name: 'OpenAI', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  google: { name: 'Google', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
};

// ==========================================
// MODEL CARD COMPONENT
// ==========================================

interface ModelCardProps {
  model: OpenRouterModel;
  isSelected: boolean;
  onSelect: (modelId: string) => void;
}

const ModelCard: React.FC<ModelCardProps> = ({ model, isSelected, onSelect }) => {
  const provider = model.id.split('/')[0];
  const providerInfo = PROVIDER_INFO[provider] || { name: provider, color: 'text-gray-500', bgColor: 'bg-gray-500/10' };
  
  // Parse pricing
  const promptPrice = parseFloat(model.pricing?.prompt || '0') * 1000000;
  const completionPrice = parseFloat(model.pricing?.completion || '0') * 1000000;
  
  return (
    <button
      onClick={() => onSelect(model.id)}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-all",
        "bg-muted/30 hover:bg-muted/60",
        isSelected && "bg-primary/10 ring-1 ring-primary"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{model.name}</span>
            {isSelected && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </div>
          
          {model.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {model.description}
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", providerInfo.bgColor, providerInfo.color)}>
              {providerInfo.name}
            </Badge>
            
            {model.context_length && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted/50">
                {(model.context_length / 1000).toFixed(0)}K ctx
              </Badge>
            )}
            
            {promptPrice > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ${promptPrice.toFixed(2)}/M in
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

// ==========================================
// COMPONENT
// ==========================================

export const AISettingsDialog: React.FC<AISettingsDialogProps> = ({ trigger }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [models, setModels] = useState<ModelsByProvider>({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // User settings (contains the OpenRouter API key) - TODO: Not available in Vid-Bolt
  // const { data: userSettings, isLoading: isLoadingSettings } = useUserSettings();
  const userSettings: { openrouter_key?: string } | null = null;
  const isLoadingSettings = false;
  const hasApiKey = Boolean(userSettings?.openrouter_key);

  // AI Settings store
  const {
    selectedModelId,
    enableStreaming,
    setSelectedModelId,
    setEnableStreaming,
  } = useAISettingsStore();

  // Load models when dialog opens
  useEffect(() => {
    if (open && hasApiKey) {
      loadModels();
    }
  }, [open, hasApiKey]);

  const loadModels = async () => {
    setIsLoadingModels(true);
    setModelsError(null);
    
    // TODO: openRouterModelService not available in Vid-Bolt
    setModelsError('Model loading not available in this version.');
    setIsLoadingModels(false);
    /*
    try {
      const modelsByProvider = await openRouterModelService.getModels();
      setModels(modelsByProvider);
    } catch (error) {
      console.error('Failed to load models:', error);
      setModelsError('Failed to load models. Please try again.');
    } finally {
      setIsLoadingModels(false);
    }
    */
  };

  // Filter models by search query - openRouterModelService not available
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return models;
    }
    // Fallback filtering without openRouterModelService
    const filtered: ModelsByProvider = {};
    for (const [provider, providerModels] of Object.entries(models)) {
      const matching = providerModels.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matching.length > 0) filtered[provider] = matching;
    }
    return filtered;
  }, [models, searchQuery]);

  // Get total model count
  const totalModels = useMemo(() => {
    return Object.values(filteredModels).reduce((acc, arr) => acc + arr.length, 0);
  }, [filteredModels]);

  // Find selected model name
  const selectedModelName = useMemo(() => {
    for (const providerModels of Object.values(models)) {
      const model = providerModels.find(m => m.id === selectedModelId);
      if (model) return model.name;
    }
    return selectedModelId.split('/').pop() || 'Unknown';
  }, [models, selectedModelId]);

  // Handle save
  const handleSave = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px] p-0 gap-0 bg-background border-0 shadow-2xl">
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            AI Settings
          </DialogTitle>
          <DialogDescription className="text-sm">
            Configure AI model for motion graphics generation
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-5">
          {/* API Key Status */}
          {isLoadingSettings ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading settings...</span>
            </div>
          ) : !hasApiKey ? (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    OpenRouter API Key Required
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add your OpenRouter API key in{" "}
                    <a href="/settings" className="text-primary hover:underline">
                      Settings → API Keys
                    </a>{" "}
                    to enable AI generation.
                  </p>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                  >
                    Get an API key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                OpenRouter API key configured
              </span>
            </div>
          )}

          {/* Model Selection */}
          {hasApiKey && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Cpu className="h-4 w-4" />
                  AI Model
                </Label>
                <span className="text-xs text-muted-foreground">
                  {totalModels} models available
                </span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-muted/50 border-0"
                />
              </div>

              {/* Models List */}
              {isLoadingModels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : modelsError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-destructive">{modelsError}</p>
                  <Button variant="outline" size="sm" onClick={loadModels} className="mt-2">
                    Retry
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[280px] rounded-lg bg-muted/30 p-2">
                  <div className="space-y-4">
                    {Object.entries(filteredModels).map(([provider, providerModels]) => {
                      const providerInfo = PROVIDER_INFO[provider] || { name: provider, color: 'text-gray-500', bgColor: 'bg-gray-500/10' };
                      
                      return (
                        <div key={provider}>
                          <div className="flex items-center gap-2 px-1 mb-2 sticky top-0 bg-muted/30 py-1">
                            <span className={cn("text-xs font-semibold uppercase tracking-wider", providerInfo.color)}>
                              {providerInfo.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({providerModels.length})
                            </span>
                          </div>
                          
                          <div className="space-y-1.5">
                            {providerModels.map((model) => (
                              <ModelCard
                                key={model.id}
                                model={model}
                                isSelected={selectedModelId === model.id}
                                onSelect={setSelectedModelId}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    
                    {totalModels === 0 && searchQuery && (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">No models found</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}

              {/* Selected Model Display */}
              {selectedModelId && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    Selected: <span className="font-medium">{selectedModelName}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Streaming Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="streaming" className="text-sm font-medium">
                Enable Streaming
              </Label>
              <p className="text-xs text-muted-foreground">
                See AI responses as they generate
              </p>
            </div>
            <Switch
              id="streaming"
              checked={enableStreaming}
              onCheckedChange={setEnableStreaming}
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-4 bg-muted/30">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AISettingsDialog;
