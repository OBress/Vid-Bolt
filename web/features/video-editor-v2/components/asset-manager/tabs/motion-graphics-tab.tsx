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

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { useVideoEditorStore, getTypedState, useTypedStore, startMediaDrag, endDrag } from "../../../stores/video-editor-store";
import type { VideoEditorStore } from "../../../stores/video-editor-store";
import {
  MotionGraphicsTemplate,
  MotionGraphicsCategory,
  MOTION_GRAPHICS_CATEGORY_NAMES,
  ChatMessage,
} from "../../../types/motion-graphics";
import type { CompositionDefinition } from "../../../types/composition";
import { useMotionGraphicsGeneration } from "../../../hooks/use-motion-graphics-generation";
import { parseTaggedJSX, hasLayerTags } from "../../../utils/jsx-layer-parser";
import { Player, PlayerRef } from "@remotion/player";
import { DynamicCompositionWrapper, setRuntimeErrorHandler } from "../../../utils/remotion/dynamic-composition";
import { useVisualQC, type QCResult } from "../../../hooks/use-visual-qc";
import { useGifExport } from "../../../hooks/use-gif-export";

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
      editableProperties: [],
    },
    {
      id: 'builtin-title-card-1',
      name: 'Title Card',
      description: 'Animated title card intro',
      category: MotionGraphicsCategory.TITLE_CARD,
      duration: 90,
      isBuiltIn: true,
      tags: ['title', 'intro'],
      editableProperties: [],
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
  GripVertical,
} from "lucide-react";
import { ModelSelectorDialog, getModelDisplayName } from "../components/model-selector-dialog";
import { useAISettingsStore } from "../../../stores/ai-settings-store";
import { useApiKeys } from "@/hooks/use-api-keys";

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
  onExportGif?: (template: MotionGraphicsTemplate) => void;
  isExportingGif?: boolean;
  gifExportProgress?: number;
}

const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message, onUseTemplate, onSaveTemplate, onExportGif, isExportingGif, gifExportProgress }) => {
  // Drag handler for generated templates
  const handleTemplateDragStart = useCallback((e: React.DragEvent, template: MotionGraphicsTemplate) => {
    const fps = getTypedState().fps || 30;
    const duration = template.duration ? template.duration / fps : 5; // Convert frames to seconds

    // Create property values from editable properties
    const propertyValues = (template.editableProperties || []).reduce((acc: Record<string, any>, prop: any) => {
      acc[prop.id] = prop.value;
      return acc;
    }, {} as Record<string, any>);

    const dragData = {
      isNewItem: true,
      type: 'motion-graphics',
      label: template.name,
      duration,
      data: {
        id: template.id,
        type: 'motion-graphics',
        src: '',
        name: template.name,
        template,
        propertyValues,
      },
    };

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));

    // Do NOT call startMediaDrag — it sets store drag type to 'media' with newItemType: 'video',
    // which overrides the correct 'motion-graphics' type from dataTransfer JSON.
    // The timeline's use-media-drop hook reads dataTransfer JSON directly when no store drag is set.

    console.log('[MotionGraphicsTab] Drag started for template:', template.id, template.name);
  }, []);

  const handleTemplateDragEnd = useCallback(() => {
    // Clean up any visual drag state
    endDrag();
  }, []);
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
          <div 
            className="mt-2 p-2 rounded-lg border bg-card cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors group/card"
            draggable
            onDragStart={(e) => handleTemplateDragStart(e, message.generatedTemplate!)}
            onDragEnd={handleTemplateDragEnd}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 group-hover/card:text-muted-foreground transition-colors" />
                <span className="text-xs font-medium">{message.generatedTemplate.name}</span>
              </div>
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
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onUseTemplate(message.generatedTemplate!); }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add to Timeline
              </Button>
              {onSaveTemplate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={(e) => { e.stopPropagation(); onSaveTemplate(message.generatedTemplate!); }}
                  title="Save as Template"
                >
                  <Save className="h-3 w-3" />
                </Button>
              )}
              {onExportGif && message.generatedTemplate?.remotionCode && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={(e) => { e.stopPropagation(); onExportGif(message.generatedTemplate!); }}
                  title="Export as GIF"
                  disabled={isExportingGif}
                >
                  {isExportingGif ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
            {isExportingGif && gifExportProgress !== undefined && gifExportProgress > 0 && (
              <div className="mt-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>Exporting GIF...</span>
                  <span>{gifExportProgress}%</span>
                </div>
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${gifExportProgress}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-center">Drag to timeline or click to add</p>
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
  const [userDuration, setUserDuration] = useState<string>('auto'); // 'auto' or seconds string
  
  // Model selector state
  const [modelDialogOpen, setModelDialogOpen] = useState(false);

  // API key availability check
  const { availability: apiKeyAvailability, loading: apiKeysLoading } = useApiKeys();
  const hasApiKey = apiKeyAvailability.openrouter_key;
  
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
  
  // Visual QC
  const { isAnalyzing: isQCRunning, result: qcResult, captureAndAnalyze, reset: resetQC } = useVisualQC();
  const { isExporting: isExportingGif, progress: gifExportProgress, error: gifExportError, exportGif, cancel: cancelGifExport } = useGifExport();
  const qcPlayerRef = useRef<PlayerRef>(null);
  const [qcCode, setQCCode] = useState<string | null>(null);
  const [qcDurationFrames, setQCDurationFrames] = useState(150);
  const [qcPrompt, setQCPrompt] = useState<string>('');
  const [qcPendingAnalysis, setQCPendingAnalysis] = useState(false);
  const qcRetryCountRef = useRef(0);
  const isSubmittingRef = useRef(false); // Synchronous guard against double-submission
  const qcRuntimeErrorRef = useRef<string | null>(null); // Captures runtime errors from generated code
  const MAX_QC_RETRIES = 3;

  // Register runtime error handler so DynamicCompositionWrapper reports crashes
  useEffect(() => {
    setRuntimeErrorHandler((error: string) => {
      console.error('[MotionGraphicsTab] Runtime error captured:', error);
      qcRuntimeErrorRef.current = error;
    });
    return () => setRuntimeErrorHandler(null);
  }, []);
  
  // Sync generation error to local state
  useEffect(() => {
    if (generationError) {
      setError(generationError);
    }
  }, [generationError]);

  // Store
  const addClip = useTypedStore(state => state.addClip);
  const tracks = useTypedStore(state => state.tracks);
  const fps = useTypedStore(state => state.fps);
  const aspectRatio = useTypedStore(state => state.aspectRatio);
  const resolution = useTypedStore(state => state.resolution);

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
    const allTracks = Object.values(tracks);
    const videoTrack = allTracks.find(t => t.type === 'video' && !t.locked);
    return videoTrack?.id || allTracks[0]?.id || 'video-track-1';
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

  // getModelDisplayName is imported from model-selector-dialog

  // Clear chat / start new chat
  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setInputValue('');
    setError(null);
    resetGeneration();
    resetQC();
    setQCCode(null);
    setQCPendingAnalysis(false);
    qcRetryCountRef.current = 0;
  }, [resetGeneration, resetQC]);

  // Auto-trigger Visual QC after generation completes and Player has rendered
  const qcRunningRef = useRef(false); // Synchronous guard to prevent double QC runs
  useEffect(() => {
    if (!qcPendingAnalysis || !qcCode || !qcPlayerRef.current) return;
    // Prevent double-firing: use a synchronous ref guard
    if (qcRunningRef.current) return;
    qcRunningRef.current = true;

    // Wait for Player to compile + render the code before capturing
    const timer = setTimeout(async () => {
      console.log('[MotionGraphicsTab] 🔍 Starting auto Visual QC...');
      setQCPendingAnalysis(false);

      // Add QC status message to chat 
      const qcMsgId = `qc-${Date.now()}`;
      setChatMessages(prev => [
        ...prev,
        {
          id: qcMsgId,
          role: 'assistant' as const,
          content: '🔍 Verifying visual output...',
          isStreaming: true,
          timestamp: new Date().toISOString(),
        },
      ]);

      const result = await captureAndAnalyze(
        qcPlayerRef as React.RefObject<any>,
        qcDurationFrames,
        qcPrompt,
        selectedModelId,
        fps || 30,
        qcCode || undefined
      );

      if (result) {
        const statusIcon = result.passed ? '✅' : '❌';
        const statusText = result.passed
          ? `Visual QC passed: ${result.summary}`
          : `Visual QC failed: ${result.summary}`;

        // Build detailed status text with element-specific issues if available
        let detailText = '';
        if (!result.passed && result.elementIssues?.length > 0) {
          detailText = '\n\nElement issues found:\n' + result.elementIssues.map(ei =>
            `• [${ei.severity.toUpperCase()}] "${ei.elementId}" (${ei.elementDescription}): ${ei.issue}`
          ).join('\n');
        }
        if (!result.passed && result.generalIssues?.length > 0) {
          detailText += '\n\nGeneral issues:\n' + result.generalIssues.map(gi => `• ${gi}`).join('\n');
        }

        setChatMessages(prev =>
          prev.map(msg =>
            msg.id === qcMsgId
              ? { ...msg, content: `${statusIcon} ${statusText}${detailText}`, isStreaming: false }
              : msg
          )
        );

        // If QC failed and we haven't exceeded retries, auto-regenerate with feedback
        if (!result.passed && qcRetryCountRef.current < MAX_QC_RETRIES) {
          qcRetryCountRef.current++;
          console.log(`[MotionGraphicsTab] 🔄 QC failed, auto-correcting (attempt ${qcRetryCountRef.current}/${MAX_QC_RETRIES})...`);

          // Build element-specific feedback prompt from QC results
          const elementFeedback = result.elementIssues?.length > 0
            ? result.elementIssues.map(ei =>
                `[${ei.severity.toUpperCase()}] Element "${ei.elementId}" (${ei.elementDescription}): ${ei.issue}. Fix: ${ei.suggestedFix}`
              ).join('\n')
            : '';
          const generalFeedback = result.generalIssues?.length > 0
            ? result.generalIssues.join('; ')
            : result.issues.join('; ');
          const suggestionsFallback = result.suggestions.length > 0 ? ` Suggestions: ${result.suggestions.join('; ')}` : '';

          let feedbackPrompt = elementFeedback
            ? `Fix these specific element issues:\n${elementFeedback}${generalFeedback ? `\n\nGeneral issues: ${generalFeedback}` : ''}`
            : `Fix the following visual issues: ${generalFeedback}.${suggestionsFallback}`;

          // If we captured a runtime error, scrap everything and regenerate from scratch
          const hasRuntimeError = !!qcRuntimeErrorRef.current;
          if (hasRuntimeError) {
            feedbackPrompt += `\n\nCRITICAL: The component threw a JavaScript runtime error: "${qcRuntimeErrorRef.current}". The previous code is fundamentally broken. Regenerate the entire animation from scratch, avoiding this error.`;
            qcRuntimeErrorRef.current = null; // Reset after use
          }

          // Full regeneration on runtime errors, targeted edit otherwise
          handleAutoCorrection(feedbackPrompt, hasRuntimeError);
        } else if (result.passed) {
          qcRetryCountRef.current = 0; // Reset on success
        }
      } else {
        // QC capture failed — update message but don't block
        setChatMessages(prev =>
          prev.map(msg =>
            msg.id === qcMsgId
              ? { ...msg, content: '⚠️ Visual QC: Could not capture preview (animation may still work fine)', isStreaming: false }
              : msg
          )
        );
      }

      qcRunningRef.current = false; // Release the guard after QC completes
    }, 2000); // Wait 2s for Player to compile and render

    return () => {
      clearTimeout(timer);
      qcRunningRef.current = false; // Release on cleanup
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qcPendingAnalysis, qcCode, qcDurationFrames, qcPrompt, selectedModelId, captureAndAnalyze]);

  // Memoize QC player inputProps to prevent re-renders
  const qcPlayerInputProps = useMemo(() => ({
    code: qcCode || '',
  }), [qcCode]);


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
    if (!inputValue.trim() || isGenerating || isSubmittingRef.current) return;
    isSubmittingRef.current = true; // Synchronous lock to prevent double-submit

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    const userPrompt = inputValue.trim();
    // Prepend duration context if user specified one
    const effectivePrompt = userDuration !== 'auto'
      ? `[Duration: ${userDuration} seconds] ${userPrompt}`
      : userPrompt;
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

    // API key check - the backend will fetch the key from the database
    // We pass an empty string here; the backend endpoint retrieves it from user_api_keys
    if (!hasApiKey) {
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
    const apiKey = ''; // Backend retrieves from DB via Supabase session

    // Generate motion graphics using the new system
    const result = await generate(
      effectivePrompt,
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
            
            // Duration: user override > AI planned > fallback
            const userDurationFrames = userDuration !== 'auto' ? Math.round(parseFloat(userDuration) * fps) : null;
            const aiDuration = result.metadata?.duration;
            const duration = userDurationFrames || aiDuration || (fps * 5);
            
            if (userDurationFrames) {
              console.log('[MotionGraphicsTab] ✅ Using user-specified duration:', userDuration, 's =', userDurationFrames, 'frames');
            } else if (aiDuration) {
              console.log('[MotionGraphicsTab] ✅ Using AI planned duration:', aiDuration, 'frames', `(${(aiDuration / fps).toFixed(1)}s)`);
            } else {
              console.warn('[MotionGraphicsTab] ⚠️ No duration source, using fallback:', duration, 'frames');
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
              id: `generated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: 'AI Generated Animation',
              description: userPrompt,
              category: MotionGraphicsCategory.TEXT_ANIMATION,
              duration,
              isBuiltIn: false,
              remotionCode: result.code,
              compositionDefinition, // Attach the composition definition
              tags: result.metadata?.skills || [],
              editableProperties: [],
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

            // Trigger automatic Visual QC
            setQCCode(result.code);
            setQCDurationFrames(duration);
            setQCPrompt(userPrompt);
            setQCPendingAnalysis(true);
            console.log('[MotionGraphicsTab] 🔍 Queuing Visual QC for generated code');
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

    isSubmittingRef.current = false;
  };

  // Direct auto-correction handler: bypasses input field to avoid race conditions and duplicate messages
  // When forceFullRegeneration=true, discards broken code and starts fresh (used for runtime errors)
  const handleAutoCorrection = async (feedbackPrompt: string, forceFullRegeneration: boolean = false) => {
    if (isGenerating) return;

    const modeLabel = forceFullRegeneration ? '🔄 Regenerating from scratch' : '🔄 Auto-correcting';
    const autoPrompt = `${modeLabel}: ${feedbackPrompt}`;

    // Add auto-correction message to chat (system-generated, not user input)
    const autoCorrectionMsgId = `auto-correct-${Date.now()}`;
    setChatMessages(prev => [
      ...prev,
      {
        id: autoCorrectionMsgId,
        role: 'user' as const,
        content: autoPrompt,
        timestamp: new Date().toISOString(),
      },
    ]);

    // Add assistant placeholder
    const assistantMsgId = `auto-correct-assistant-${Date.now()}`;
    setChatMessages(prev => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: forceFullRegeneration ? 'Regenerating animation from scratch...' : 'Fixing visual issues...',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    // Runtime errors → full regeneration (no existing code, fresh start)
    // Visual issues → targeted edit (preserve existing code, apply fixes)
    const result = await generate(
      autoPrompt,
      '', // Backend retrieves API key from DB
      selectedModelId,
      {
        currentCode: forceFullRegeneration ? undefined : (generatedCode || undefined),
        isFollowUp: !forceFullRegeneration,
      },
      {
        onStreamPhaseChange: (phase) => {
          if (phase === 'editing' || phase === 'generating') {
            setChatMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMsgId
                  ? { ...msg, content: 'Editing animation code based on QC feedback...' }
                  : msg
              )
            );
          }
        },
        onError: (error) => {
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: 'Auto-correction failed. Please try adjusting manually.',
                    isStreaming: false,
                    error,
                  }
                : msg
            )
          );
        },
        onComplete: (result) => {
          if (result.success && result.code) {
            const dimensions = getCanvasDimensions();
            const aiDuration = result.metadata?.duration;
            const duration = aiDuration || (fps * 5);

            const compositionDefinition: CompositionDefinition = {
              id: `comp-${Date.now()}`,
              name: 'AI Generated Animation',
              duration,
              fps,
              width: dimensions.width,
              height: dimensions.height,
              backgroundColor: '#000000',
              layers: [],
              originalRemotionCode: result.code,
              generatedFromJSX: true,
              usedIcons: result.metadata?.usedIcons,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            const generatedTemplate: MotionGraphicsTemplate = {
              id: `generated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: 'AI Generated Animation',
              description: feedbackPrompt,
              category: MotionGraphicsCategory.TEXT_ANIMATION,
              duration,
              isBuiltIn: false,
              remotionCode: result.code,
              compositionDefinition,
              tags: result.metadata?.skills || [],
              editableProperties: [],
            };

            setChatMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      content: result.summary || 'Auto-correction complete! Here\'s the updated animation.',
                      isStreaming: false,
                      generatedTemplate,
                    }
                  : msg
              )
            );

            // Trigger Visual QC on the corrected output
            setQCCode(result.code);
            setQCDurationFrames(duration);
            setQCPrompt(qcPrompt); // Use original prompt for QC context
            setQCPendingAnalysis(true);
            console.log('[MotionGraphicsTab] 🔍 Queuing Visual QC for auto-corrected code');
          }
        },
      }
    );

    if (!result.success && result.error) {
      setChatMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: result.error || 'Auto-correction failed',
                isStreaming: false,
                error: result.errorType,
              }
            : msg
        )
      );
    }
  };

  // Handle export GIF
  const handleExportGif = useCallback((template: MotionGraphicsTemplate) => {
    if (!template.remotionCode || !qcPlayerRef.current) {
      console.warn('[MotionGraphicsTab] Cannot export GIF: no code or player ref');
      return;
    }

    // Set the QC player to show the template's code so we can capture from it
    const duration = template.duration || (fps * 5);
    setQCCode(template.remotionCode);
    setQCDurationFrames(duration);

    // Wait for the player to compile the new code, then start export
    setTimeout(() => {
      const safeName = (template.name || 'motion-graphic')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      exportGif(qcPlayerRef, duration, fps || 30, safeName);
    }, 2500); // Allow time for Babel compilation + first render
  }, [fps, exportGif]);

  // Handle add template to timeline
  const handleAddToTimeline = (template: MotionGraphicsTemplate) => {
    const dimensions = getCanvasDimensions();
    const trackId = getVideoTrackId();
    
    // Create property values from editable properties
    const propertyValues = (template.editableProperties || []).reduce((acc, prop) => {
      acc[prop.id] = prop.value;
      return acc;
    }, {} as Record<string, any>);
    
    // Place at end of existing clips on track (allows multiple adds to stack sequentially)
    const existingClips = Object.values(getTypedState().clips).filter(c => c.trackId === trackId);
    const endOfTrack = existingClips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
    const startTime = endOfTrack; // 0 if no clips, otherwise right after the last one
    
    console.log('[MotionGraphicsTab] Adding motion graphics clip:', {
      type: 'motion-graphics',
      templateId: template.id,
      templateName: template.name,
      propertyCount: Object.keys(propertyValues).length,
      startTime,
    });
    
    // Create a motion graphics clip
    addClip({
      type: 'motion-graphics',
      sourceId: template.id,
      startTime,
      duration: template.duration / fps,
      trackId,
      name: template.name,
      color: '#A855F7', // Purple color for motion graphics clips
      properties: {
        template,
        propertyValues,
        mapboxConfig: template.mapboxConfig,
      },
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
                    onExportGif={handleExportGif}
                    isExportingGif={isExportingGif}
                    gifExportProgress={gifExportProgress}
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
              <Select value={userDuration} onValueChange={setUserDuration}>
                <SelectTrigger className="w-[72px] h-9 text-xs shrink-0" title="Animation duration">
                  <Clock className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top" className="z-[200]">
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="3">3s</SelectItem>
                  <SelectItem value="5">5s</SelectItem>
                  <SelectItem value="7">7s</SelectItem>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="15">15s</SelectItem>
                  <SelectItem value="20">20s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Model Selector Dialog */}
      <ModelSelectorDialog
        open={modelDialogOpen}
        onOpenChange={setModelDialogOpen}
        onSelectModel={(modelId) => setSelectedModelId(modelId)}
        selectedModelId={selectedModelId}
      />

      {/* Hidden Remotion Player for Visual QC capture & GIF export */}
      {qcCode && (
        <div
          style={{
            position: 'fixed',
            // Use clip-path instead of off-screen positioning so element keeps
            // proper layout dimensions (offsetWidth/Height stay non-zero)
            clipPath: 'inset(100%)',
            width: '1280px',
            height: '720px',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <Player
            ref={qcPlayerRef}
            component={DynamicCompositionWrapper}
            inputProps={qcPlayerInputProps}
            durationInFrames={Math.max(1, qcDurationFrames)}
            compositionWidth={1280}
            compositionHeight={720}
            fps={fps || 30}
            style={{ width: '1280px', height: '720px' }}
          />
        </div>
      )}
    </div>
  );
};

export default MotionGraphicsTab;
