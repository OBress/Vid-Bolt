/**
 * MotionGraphicsTab - AI-powered motion graphics generation
 * 
 * Features:
 * - AI Chat interface for generating motion graphics from prompts
 * - Templates gallery with built-in and saved templates
 * - Category filtering and search
 * - Live preview of selected templates
 * - Drag to timeline functionality
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { Badge } from "../../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import {
  MotionGraphicsTemplate,
  MotionGraphicsCategory,
  MOTION_GRAPHICS_CATEGORY_NAMES,
  ChatMessage,
} from "../../../types/motion-graphics";
import type { CompositionDefinition } from "../../../types/composition";
import { useMotionGraphicsGeneration } from "../../../hooks/use-motion-graphics-generation";
import { parseTaggedJSX, hasLayerTags } from "../../../utils/jsx-layer-parser";

// Built-in templates (temporary - will be replaced with new AI generation system)
const getBuiltInTemplates = (): MotionGraphicsTemplate[] => {
  return [
    {
      id: 'builtin-lower-third-1',
      name: 'Modern Lower Third',
      description: 'Clean animated lower third with name and title',
      category: MotionGraphicsCategory.LOWER_THIRD,
      duration: 150,
      isBuiltIn: true,
      tags: ['lower third', 'name', 'title'],
    },
    {
      id: 'builtin-title-card-1',
      name: 'Title Card',
      description: 'Animated title card intro',
      category: MotionGraphicsCategory.TITLE_CARD,
      duration: 90,
      isBuiltIn: true,
      tags: ['title', 'intro'],
    },
  ];
};
import {
  Wand2,
  Sparkles,
  Send,
  Loader2,
  Search,
  Grid3X3,
  MessageSquare,
  Plus,
  Play,
  Clock,
  User,
  Bot,
  X,
  ChevronRight,
  MapPin,
  Type,
  Film,
  Layers,
  AlertCircle,
  Settings,
  Save,
  Trash2,
  Download,
  Edit,
  RefreshCw,
  Cpu,
  ChevronDown,
} from "lucide-react";
// TODO: ModelSelectorDialog not available in Vid-Bolt - needs to be ported or replaced
// import { ModelSelectorDialog } from "@/components/settings/ModelSelector/ModelSelectorDialog";
import { useAISettingsStore } from "../../../stores/ai-settings-store";
// TODO: These hooks/services don't exist in Vid-Bolt - motion graphics AI features disabled
// import { useUserSettings } from "@/hooks/use-settings";
// import { openRouterModelService, type OpenRouterModel } from "@/services/OpenRouterModelService";
type OpenRouterModel = { id: string; name: string }; // Stub type

// Note: AISettingsDialog removed - now using ModelSelectorDialog directly in chat header

// ==========================================
// TYPES
// ==========================================

type SubTab = 'generate' | 'templates';

interface TemplateCardProps {
  template: MotionGraphicsTemplate;
  onSelect: (template: MotionGraphicsTemplate) => void;
  onAddToTimeline: (template: MotionGraphicsTemplate) => void;
  onDelete?: (templateId: string) => void;
  isSelected: boolean;
}

// ==========================================
// CATEGORY ICONS
// ==========================================

const getCategoryIcon = (category: MotionGraphicsCategory) => {
  switch (category) {
    case MotionGraphicsCategory.TEXT_ANIMATION:
      return Type;
    case MotionGraphicsCategory.LOWER_THIRD:
      return Layers;
    case MotionGraphicsCategory.TITLE_CARD:
      return Film;
    case MotionGraphicsCategory.MAP_ANIMATION:
      return MapPin;
    default:
      return Sparkles;
  }
};

// ==========================================
// TEMPLATE CARD COMPONENT
// ==========================================

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onSelect,
  onAddToTimeline,
  onDelete,
  isSelected,
}) => {
  const CategoryIcon = getCategoryIcon(template.category);
  const isUserTemplate = !template.isBuiltIn && template.id.startsWith('saved-');
  
  return (
    <div
      className={cn(
        "relative rounded-lg border overflow-hidden cursor-pointer transition-all",
        "hover:border-primary/50 hover:shadow-md",
        isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"
      )}
      onClick={() => onSelect(template)}
    >
      {/* Thumbnail / Preview */}
      <div className="aspect-video bg-muted/50 relative overflow-hidden">
        {template.thumbnail ? (
          <img
            src={template.thumbnail}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <CategoryIcon className="h-8 w-8 text-primary/40" />
          </div>
        )}
        
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
            <Clock className="h-2.5 w-2.5 mr-1" />
            {(template.duration / 30).toFixed(1)}s
          </Badge>
        </div>

        {/* User template badge */}
        {isUserTemplate && (
          <div className="absolute top-2 left-2">
            <Badge className="text-[10px] px-1.5 py-0.5 bg-green-600">SAVED</Badge>
          </div>
        )}

        {/* Pro badge */}
        {template.isPro && (
          <div className="absolute top-2 right-2">
            <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500">PRO</Badge>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={(e) => {
              e.stopPropagation();
              onAddToTimeline(template);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
          {isUserTemplate && onDelete && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 px-2"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(template.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-2">
        <h4 className="text-xs font-medium truncate">{template.name}</h4>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {template.description}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {MOTION_GRAPHICS_CATEGORY_NAMES[template.category]}
          </Badge>
          {isUserTemplate && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-500/50 text-green-600">
              Custom
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// CHAT MESSAGE COMPONENT
// ==========================================

interface ChatMessageItemProps {
  message: ChatMessage;
  onUseTemplate?: (template: MotionGraphicsTemplate) => void;
  onSaveTemplate?: (template: MotionGraphicsTemplate) => void;
}

const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message, onUseTemplate, onSaveTemplate }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn("flex gap-2 mb-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-primary" : "bg-muted"
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 max-w-[85%]",
        isUser && "flex flex-col items-end"
      )}>
        <div className={cn(
          "rounded-lg px-3 py-2 text-sm",
          isUser 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted"
        )}>
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>

        {/* Error */}
        {message.error && (
          <div className="flex items-center gap-1 mt-1 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" />
            {message.error}
          </div>
        )}

        {/* Generated template */}
        {message.generatedTemplate && onUseTemplate && (
          <div className="mt-2 p-2 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">{message.generatedTemplate.name}</span>
              <Badge variant="outline" className="text-[9px]">
                {MOTION_GRAPHICS_CATEGORY_NAMES[message.generatedTemplate.category]}
              </Badge>
            </div>
            {/* Show skills used */}
            {message.generatedTemplate.tags && message.generatedTemplate.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {message.generatedTemplate.tags.slice(0, 4).map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
                {message.generatedTemplate.tags.length > 4 && (
                  <span className="text-[9px] text-muted-foreground">+{message.generatedTemplate.tags.length - 4}</span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => onUseTemplate(message.generatedTemplate!)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add to Timeline
              </Button>
              {onSaveTemplate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => onSaveTemplate(message.generatedTemplate!)}
                  title="Save as Template"
                >
                  <Save className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

// LocalStorage key for saved templates
const SAVED_TEMPLATES_KEY = 'motion-graphics-saved-templates';

export const MotionGraphicsTab: React.FC = () => {
  // State
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('generate');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MotionGraphicsCategory | 'all' | 'saved'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<MotionGraphicsTemplate | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<MotionGraphicsTemplate[]>([]);
  
  // Model selector state
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [userFavorites, setUserFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('openrouter-favorite-models');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [modelNames, setModelNames] = useState<Record<string, string>>({});

  // User Settings (contains API keys) - TODO: Not available in Vid-Bolt
  // const { data: userSettings } = useUserSettings();
  const userSettings: { openrouter_key?: string } | null = null;
  const hasApiKey = Boolean(userSettings?.openrouter_key);
  
  // AI Settings store (for model selection)
  const { selectedModelId, setSelectedModelId } = useAISettingsStore();

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // AI Generation hook
  const {
    isGenerating,
    stage,
    stageMessage,
    error: generationError,
    generatedCode,
    detectedSkills,
    correctionAttempt,
    generate,
    reset: resetGeneration,
  } = useMotionGraphicsGeneration();
  
  // Local error state for UI display
  const [error, setError] = useState<string | null>(null);
  
  // Sync generation error to local state
  useEffect(() => {
    if (generationError) {
      setError(generationError);
    }
  }, [generationError]);

  // Store
  const addClip = useVideoEditorStore((state) => state.addClip);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const fps = useVideoEditorStore((state) => state.fps);
  const aspectRatio = useVideoEditorStore((state) => state.aspectRatio);
  const resolution = useVideoEditorStore((state) => state.resolution);

  // Load saved templates from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_TEMPLATES_KEY);
      if (saved) {
        const templates = JSON.parse(saved) as MotionGraphicsTemplate[];
        setSavedTemplates(templates);
      }
    } catch (err) {
      console.error('Failed to load saved templates:', err);
    }
  }, []);

  // Save template to localStorage
  const saveTemplate = useCallback((template: MotionGraphicsTemplate) => {
    const newTemplate: MotionGraphicsTemplate = {
      ...template,
      id: `saved-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSavedTemplates((prev) => {
      const updated = [...prev, newTemplate];
      try {
        localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save template to localStorage:', err);
      }
      return updated;
    });

    // Show success toast or notification
    console.log('Template saved:', newTemplate.name);
  }, []);

  // Delete saved template
  const deleteTemplate = useCallback((templateId: string) => {
    setSavedTemplates((prev) => {
      const updated = prev.filter((t) => t.id !== templateId);
      try {
        localStorage.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to update localStorage:', err);
      }
      return updated;
    });
  }, []);

  // Get first available video track
  const getVideoTrackId = useCallback(() => {
    const videoTrack = tracks.find(t => t.type === 'video' && !t.locked);
    return videoTrack?.id || tracks[0]?.id || 'video-track-1';
  }, [tracks]);

  // Get templates
  const builtInTemplates = getBuiltInTemplates();

  // Combine and filter templates
  const allTemplates = [...builtInTemplates, ...savedTemplates];
  const filteredTemplates = allTemplates.filter((template) => {
    const matchesSearch = searchQuery === '' || 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Handle "saved" as a special filter to show only user-saved templates
    let matchesCategory = true;
    if (categoryFilter === 'all') {
      matchesCategory = true;
    } else if (categoryFilter === 'saved') {
      matchesCategory = !template.isBuiltIn && template.id.startsWith('saved-');
    } else {
      matchesCategory = template.category === categoryFilter;
    }
    
    return matchesSearch && matchesCategory;
  });

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Load model names for display - TODO: openRouterModelService not available in Vid-Bolt
  // useEffect(() => {
  //   const loadModelNames = async () => {
  //     try {
  //       const models = await openRouterModelService.getModels();
  //       const names: Record<string, string> = {};
  //       Object.values(models).flat().forEach((model: OpenRouterModel) => {
  //         names[model.id] = model.name;
  //       });
  //       setModelNames(names);
  //     } catch (error) {
  //       console.error('Failed to load model names:', error);
  //     }
  //   };
  //   if (hasApiKey) {
  //     loadModelNames();
  //   }
  // }, [hasApiKey]);

  // Get display name for selected model
  const getModelDisplayName = useCallback((modelId: string) => {
    if (modelNames[modelId]) {
      // Remove provider prefix like "Anthropic: "
      const name = modelNames[modelId];
      return name.replace(/^(Anthropic|OpenAI|Google|xAI|Meta|Mistral):\s*/i, '');
    }
    // Fallback to extracting name from ID
    const parts = modelId.split('/');
    return parts[parts.length - 1] || modelId;
  }, [modelNames]);

  // Toggle favorite model
  const handleToggleFavorite = useCallback((modelId: string) => {
    setUserFavorites((prev) => {
      const updated = prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem('openrouter-favorite-models', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear chat / start new chat
  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setInputValue('');
    setError(null);
    resetGeneration();
  }, [resetGeneration]);

  // Get canvas dimensions
  const getCanvasDimensions = useCallback(() => {
    const resolutionHeights: Record<string, number> = {
      '720p': 720,
      '1080p': 1080,
      '1440p': 1440,
      '4K': 2160,
    };
    
    const aspectRatios: Record<string, number> = {
      '16:9': 16/9,
      '9:16': 9/16,
      '1:1': 1,
      '4:5': 4/5,
    };

    const height = resolutionHeights[resolution] || 1080;
    const ratio = aspectRatios[aspectRatio] || 16/9;
    const width = Math.round(height * ratio);

    return { width, height };
  }, [aspectRatio, resolution]);

  // Handle send message - AI generation
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    const userPrompt = inputValue.trim();
    setInputValue('');
    setError(null);

    // Add placeholder assistant message
    const assistantMessageId = `msg-${Date.now()}-assistant`;
    setChatMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: 'Generating motion graphics...',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    // Get the API key from user settings
    const apiKey = userSettings?.openrouter_key || '';
    
    if (!apiKey) {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: 'Please configure your OpenRouter API key in Settings to use AI features.',
                isStreaming: false,
                error: 'No API key configured',
              }
            : msg
        )
      );
      setError('No API key configured');
      return;
    }

    // Generate motion graphics using the new system
    const result = await generate(
      userPrompt,
      apiKey,
      selectedModelId,
      {
        currentCode: generatedCode || undefined,
        isFollowUp: !!generatedCode,
      },
      {
        onStreamPhaseChange: (phase) => {
          if (phase === 'generating') {
            setChatMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: 'Writing animation code...' }
                  : msg
              )
            );
          }
        },
        onError: (error) => {
          setChatMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: 'Sorry, I encountered an error generating the animation.',
                    isStreaming: false,
                    error,
                  }
                : msg
            )
          );
          setError(error);
        },
        onComplete: (result) => {
          if (result.success && result.code) {
            // Get canvas dimensions for the composition
            const dimensions = getCanvasDimensions();
            
            // Duration comes from AI vision planning (single source of truth)
            const aiDuration = result.metadata?.duration;
            const duration = aiDuration || (fps * 5); // Fallback only if AI didn't provide duration
            
            if (aiDuration) {
              console.log('[MotionGraphicsTab] ✅ Using AI planned duration:', aiDuration, 'frames', `(${(aiDuration / fps).toFixed(1)}s)`);
            } else {
              console.warn('[MotionGraphicsTab] ⚠️ AI did not provide duration, using fallback:', duration, 'frames');
            }
            
            console.log('[MotionGraphicsTab] Duration:', {
              aiPlanned: aiDuration,
              final: duration,
              inSeconds: duration / fps
            });
            
            // Parse layers from tagged JSX if available
            let layers: any[] = [];
            console.log('[MotionGraphicsTab] Generated code preview:', result.code.substring(0, 500));
            
            if (hasLayerTags(result.code)) {
              console.log('[MotionGraphicsTab] ✅ JSX has layer tags, parsing...');
              layers = parseTaggedJSX(result.code, fps);
              console.log('[MotionGraphicsTab] ✅ Parsed', layers.length, 'layers from JSX');
              
              // Log each layer's details
              layers.forEach((layer: any) => {
                console.log('[MotionGraphicsTab] Layer:', {
                  id: layer.id,
                  name: layer.name,
                  type: layer.type,
                  keyframeCount: layer.keyframes?.length || 0,
                });
              });
            } else {
              console.warn('[MotionGraphicsTab] ⚠️ JSX does not have layer tags - AI did not follow tagging format');
              console.log('[MotionGraphicsTab] Code sample:', result.code.substring(0, 800));
            }
            
            // Create a CompositionDefinition with the generated JSX code
            const compositionDefinition: CompositionDefinition = {
              id: `comp-${Date.now()}`,
              name: 'AI Generated Animation',
              duration,
              fps,
              width: dimensions.width,
              height: dimensions.height,
              backgroundColor: '#000000',
              layers, // Parsed from JSX if tagged, empty otherwise
              originalRemotionCode: result.code,
              generatedFromJSX: true,
              usedIcons: result.metadata?.usedIcons, // Pass icons from backend analysis
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            // Create a template from the generated code
            const generatedTemplate: MotionGraphicsTemplate = {
              id: `generated-${Date.now()}`,
              name: 'AI Generated Animation',
              description: userPrompt,
              category: MotionGraphicsCategory.TEXT_ANIMATION,
              duration,
              isBuiltIn: false,
              remotionCode: result.code,
              compositionDefinition, // Attach the composition definition
              tags: result.metadata?.skills || [],
            };

            setChatMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? {
                      ...msg,
                      content: result.summary || 'Here\'s your motion graphic! Click "Add to Timeline" to use it.',
                      isStreaming: false,
                      generatedTemplate,
                    }
                  : msg
              )
            );
          }
        },
      }
    );

    if (!result.success && result.error) {
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: result.error || 'An error occurred',
                isStreaming: false,
                error: result.errorType,
              }
            : msg
        )
      );
    }
  };

  // Handle add template to timeline
  const handleAddToTimeline = (template: MotionGraphicsTemplate) => {
    const dimensions = getCanvasDimensions();
    const trackId = getVideoTrackId();
    
    // Create property values from editable properties
    const propertyValues = (template.editableProperties || []).reduce((acc, prop) => {
      acc[prop.id] = prop.value;
      return acc;
    }, {} as Record<string, any>);
    
    console.log('[MotionGraphicsTab] Adding motion graphics clip:', {
      type: 'motion-graphics',
      templateId: template.id,
      templateName: template.name,
      propertyCount: Object.keys(propertyValues).length,
    });
    
    // Create a motion graphics clip
    // Position at 0,0 with full canvas dimensions (top-left anchor)
    addClip({
      type: 'motion-graphics',
      sourceId: template.id,
      startTime: 0,
      duration: template.duration / fps,
      trackId,
      name: template.name,
      color: '#A855F7', // Purple color for motion graphics clips
      properties: {
        template,
        propertyValues,
        mapboxConfig: template.mapboxConfig,
      },
      // Position at center of canvas for proper alignment
      transform: {
        x: 0,
        y: 0,
        width: dimensions.width,
        height: dimensions.height,
        scale: 1,
        rotation: 0,
      },
    });
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Check if AI is properly configured (has OpenRouter API key in user settings)
  const isAIConfigured = hasApiKey;

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tabs with settings button */}
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center">
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as SubTab)} className="flex-1">
            <TabsList className="w-full h-9 bg-transparent p-0 rounded-none">
              <TabsTrigger
                value="generate"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="text-xs">Generate</span>
              </TabsTrigger>
              <TabsTrigger
                value="templates"
                className={cn(
                  "flex-1 h-full rounded-none border-b-2 border-transparent",
                  "data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  "flex items-center justify-center gap-1.5"
                )}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                <span className="text-xs">Templates</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* API status indicator and settings */}
          <div className="px-2 flex items-center gap-1">
            {isAIConfigured && (
              <div className="h-2 w-2 rounded-full bg-green-500" title="AI Connected" />
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "h-7 w-7",
                !isAIConfigured && "text-muted-foreground"
              )}
              title="AI Settings"
              onClick={() => setModelDialogOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Generate Tab Content */}
      {activeSubTab === 'generate' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Header with Model Selector and New Chat */}
          <div className="shrink-0 px-3 py-2 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              {/* Model Selector Button */}
              <button
                onClick={() => setModelDialogOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-muted/50 hover:bg-muted transition-colors truncate max-w-[180px]"
                title={`Model: ${selectedModelId}`}
              >
                <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{getModelDisplayName(selectedModelId)}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
              
              {/* New Chat Button */}
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleNewChat}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  New Chat
                </Button>
              )}
            </div>
          </div>
          
          {/* Chat messages */}
          <ScrollArea className="flex-1">
            <div ref={chatContainerRef} className="p-3">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Wand2 className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-medium mb-1">AI Motion Graphics</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto mb-4">
                    Describe the motion graphic you want to create
                  </p>
                  
                  {/* Quick prompts */}
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Try these:</p>
                    {[
                      'Create a modern lower third with name and title',
                      'Make an animated subscribe button',
                      'Generate a title card intro',
                    ].map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => setInputValue(prompt)}
                        className="block w-full text-left text-xs p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <ChevronRight className="h-3 w-3 inline mr-1 text-muted-foreground" />
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    onUseTemplate={handleAddToTimeline}
                    onSaveTemplate={saveTemplate}
                  />
                ))
              )}

              {/* Progress indicator */}
              {isGenerating && (
                <div className="flex flex-col gap-1 mt-2">
                  <div className="flex items-center gap-2 text-xs text-purple-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      {stageMessage || (
                        <>
                          {stage === 'intent_analysis' && 'Analyzing your creative vision...'}
                          {stage === 'skill_selection' && 'Selecting reference materials...'}
                          {stage === 'generating' && (correctionAttempt > 0 
                            ? `Auto-correcting (attempt ${correctionAttempt}/3)...` 
                            : 'Generating code...')}
                          {stage === 'validating' && 'Checking code quality...'}
                          {stage === 'visual_qc' && 'Analyzing visual output with AI...'}
                          {stage === 'regenerating' && `Improving generation (attempt ${correctionAttempt})...`}
                          {stage === 'complete' && 'Compiling...'}
                        </>
                      )}
                    </span>
                  </div>
                  {/* Show detected skills */}
                  {detectedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground">Skills:</span>
                      {detectedSkills.slice(0, 5).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-[9px] px-1 py-0 bg-purple-500/10 border-purple-500/30">
                          {skill}
                        </Badge>
                      ))}
                      {detectedSkills.length > 5 && (
                        <span className="text-[10px] text-muted-foreground">+{detectedSkills.length - 5} more</span>
                      )}
                    </div>
                  )}
                  {/* Show visual QC result when in that stage */}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="shrink-0 p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Describe your motion graphic..."
                className="flex-1 h-9 text-sm"
                disabled={isGenerating}
              />
              <Button
                size="sm"
                className="h-9 px-3"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {error && (
              <div className="flex items-center gap-1 mt-2 text-destructive text-xs">
                <AlertCircle className="h-3 w-3" />
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates Tab Content */}
      {activeSubTab === 'templates' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search and filters */}
          <div className="shrink-0 p-3 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="pl-8 h-8 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as MotionGraphicsCategory | 'all' | 'saved')}
              >
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="saved">
                    <span className="flex items-center gap-1">
                      <Save className="h-3 w-3" />
                      My Saved ({savedTemplates.length})
                    </span>
                  </SelectItem>
                  {Object.entries(MOTION_GRAPHICS_CATEGORY_NAMES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Templates grid */}
          <ScrollArea className="flex-1">
            <div className="p-3">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No templates found
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={setSelectedTemplate}
                      onAddToTimeline={handleAddToTimeline}
                      onDelete={deleteTemplate}
                      isSelected={selectedTemplate?.id === template.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Model Selector Dialog - TODO: ModelSelectorDialog not available in Vid-Bolt */}
      {/* <ModelSelectorDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
        onSelectModel={setSelectedModelId}
        searchQuery={modelSearchQuery}
        onSearchChange={setModelSearchQuery}
        userFavorites={userFavorites}
        onToggleFavorite={handleToggleFavorite}
      /> */}
    </div>
  );
};

export default MotionGraphicsTab;
