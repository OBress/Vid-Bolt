/**
 * ChatPanel - AI Chat Interface for Composition Editing
 * 
 * Generates motion graphics using the skill-based AI system.
 * AI generates Remotion JSX code that is compiled and rendered in real-time.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../../../utils/general/utils";
import { useCompositionEditorStore } from "../../../stores/composition-editor-store";
import type { CompositionChatMessage } from "../../../types/composition";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import {
  Send,
  Loader2,
  User,
  Bot,
  Wand2,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  PanelLeftClose,
  Sparkles,
  MessageSquare,
  Cpu,
  Code,
} from "lucide-react";
import { useAISettingsStore } from "../../../stores/ai-settings-store";
// TODO: useUserSettings not available in Vid-Bolt
// import { useUserSettings } from "@/hooks/use-settings";
import { useMotionGraphicsGeneration } from "../../../hooks/use-motion-graphics-generation";

// ==========================================
// TYPES
// ==========================================

interface ChatPanelProps {
  onClose?: () => void;
}

interface ExtendedChatMessage extends CompositionChatMessage {
  skills?: string[];
}

// ==========================================
// CHAT MESSAGE COMPONENT
// ==========================================

interface ChatMessageItemProps {
  message: ExtendedChatMessage;
}

const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn("flex gap-2 mb-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
        isUser ? "bg-purple-600" : "bg-muted"
      )}>
        {isUser ? (
          <User className="h-3.5 w-3.5 text-white" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
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
            ? "bg-purple-600 text-white" 
            : "bg-muted"
        )}>
          {message.content}
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>

        {/* Skills used */}
        {message.skills && message.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.skills.map((skill) => (
              <Badge key={skill} variant="outline" className="text-[10px] px-1.5 py-0">
                {skill}
              </Badge>
            ))}
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="flex items-center gap-1 mt-1 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" />
            {message.error}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// QUICK PROMPTS
// ==========================================

const QUICK_PROMPTS = [
  "Create a modern animated lower third",
  "Make an animated subscribe button",
  "Design a kinetic typography intro",
  "Create a progress bar animation",
  "Build a text reveal with fade",
  "Make a bouncy logo animation",
  "Create a chart with animated bars",
  "Design a social media post layout",
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export const ChatPanel: React.FC<ChatPanelProps> = ({ onClose }) => {
  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<ExtendedChatMessage[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Store state
  const composition = useCompositionEditorStore((state) => state.composition);
  const setGeneratedCode = useCompositionEditorStore((state) => state.setGeneratedCode);
  const loadFromJSX = useCompositionEditorStore((state) => state.loadFromJSX);
  const setIsGenerating = useCompositionEditorStore((state) => state.setIsGenerating);
  const setGenerationError = useCompositionEditorStore((state) => state.setGenerationError);
  const setDetectedSkills = useCompositionEditorStore((state) => state.setDetectedSkills);
  const addConversationMessage = useCompositionEditorStore((state) => state.addConversationMessage);
  const conversationHistory = useCompositionEditorStore((state) => state.conversationHistory);
  const generatedCode = useCompositionEditorStore((state) => state.generatedCode);
  const setRenderMode = useCompositionEditorStore((state) => state.setRenderMode);

  // AI Settings
  const { selectedModelId } = useAISettingsStore();
  // TODO: useUserSettings not available in Vid-Bolt
  // const { data: userSettings } = useUserSettings();
  const userSettings: { openrouter_key?: string } | null = null;
  const hasApiKey = Boolean(userSettings?.openrouter_key);

  // Generation hook
  const {
    isGenerating,
    stage,
    stageMessage,
    error: generationHookError,
    detectedSkills: hookDetectedSkills,
    vision,
    generate,
    reset: resetGeneration,
  } = useMotionGraphicsGeneration();

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Sync generation state with store
  useEffect(() => {
    setIsGenerating(isGenerating);
  }, [isGenerating, setIsGenerating]);

  useEffect(() => {
    setDetectedSkills(hookDetectedSkills);
  }, [hookDetectedSkills, setDetectedSkills]);

  useEffect(() => {
    if (generationHookError) {
      setGenerationError(generationHookError);
    }
  }, [generationHookError, setGenerationError]);

  // Add a message to chat
  const addMessage = useCallback((message: Omit<ExtendedChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ExtendedChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setChatMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  // Update a message by ID
  const updateMessage = useCallback((id: string, updates: Partial<ExtendedChatMessage>) => {
    setChatMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  // Handle send message - AI generation
  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isGenerating || !composition) return;

    const userPrompt = inputValue.trim();

    // Add user message to chat
    addMessage({
      role: 'user',
      content: userPrompt,
    });
    
    // Add to conversation history in store
    addConversationMessage('user', userPrompt);

    setInputValue('');

    // Add placeholder assistant message
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: 'Generating motion graphics...',
      isStreaming: true,
    });

    // Get the API key from user settings
    const apiKey = userSettings?.openrouter_key || '';
    
    if (!apiKey) {
      updateMessage(assistantMessageId, {
        content: 'Please configure your OpenRouter API key in Settings to use AI features.',
        isStreaming: false,
        error: 'No API key configured',
      });
      return;
    }

    // Determine if this is a follow-up edit
    const isFollowUp = !!generatedCode;
    const previouslyUsedSkills = hookDetectedSkills;

    // Generate motion graphics
    const result = await generate(
      userPrompt,
      apiKey,
      selectedModelId,
      {
        currentCode: generatedCode || undefined,
        conversationHistory,
        previouslyUsedSkills,
        isFollowUp,
      },
      {
        onCodeUpdate: (code) => {
          setGeneratedCode(code);
          // Note: We don't call loadFromJSX here because we don't have icons yet
          // loadFromJSX will be called in onComplete with the full metadata
        },
        onStreamPhaseChange: (phase) => {
          if (phase === 'generating') {
            updateMessage(assistantMessageId, {
              content: 'Writing animation code...',
              isStreaming: true,
            });
          }
        },
        onError: (error) => {
          updateMessage(assistantMessageId, {
            content: 'Sorry, I encountered an error generating the animation.',
            isStreaming: false,
            error,
          });
        },
        onComplete: (result) => {
          if (result.success && result.code) {
            const summary = result.summary || 'Motion graphic generated successfully!';
            updateMessage(assistantMessageId, {
              content: summary,
              isStreaming: false,
              skills: result.metadata?.skills,
            });
            addConversationMessage('assistant', summary);
            
            // Duration comes from AI vision planning (single source of truth)
            const usedIcons = result.metadata?.usedIcons;
            const duration = result.metadata?.duration;
            
            if (duration) {
              console.log('[ChatPanel] ✅ AI planned duration:', duration, 'frames', `(${(duration / 30).toFixed(1)}s)`);
            } else {
              console.error('[ChatPanel] ❌ AI did not provide duration! This should not happen. Check backend vision analysis.');
            }
            
            loadFromJSX(result.code, usedIcons, duration);
            // Switch to layers mode to show extracted layers
            setRenderMode('layers');
          }
        },
      }
    );

    if (!result.success && result.error) {
      updateMessage(assistantMessageId, {
        content: result.error,
        isStreaming: false,
        error: result.errorType,
      });
    }
  }, [
    inputValue, 
    isGenerating, 
    composition, 
    userSettings,
    selectedModelId,
    generatedCode,
    conversationHistory,
    hookDetectedSkills,
    addMessage,
    updateMessage,
    addConversationMessage,
    generate,
    setGeneratedCode,
    loadFromJSX,
    setRenderMode,
  ]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle quick prompt click
  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  };

  // Handle new chat - reset generation state
  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setInputValue('');
    resetGeneration();
    setGeneratedCode(null);
    setGenerationError(null);
  }, [resetGeneration, setGeneratedCode, setGenerationError]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-10 flex items-center justify-between px-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium">AI Motion Graphics</span>
        </div>
        <div className="flex items-center gap-1">
          {(chatMessages.length > 0 || generatedCode) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleNewChat}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              New
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Composition info */}
      {composition && (
        <div className="shrink-0 px-3 py-1.5 border-b border-border bg-purple-500/10">
          <div className="flex items-center gap-1.5 text-xs">
            <Code className="h-3 w-3 text-purple-400" />
            <span className="text-purple-300 font-medium truncate">
              {composition.name}
            </span>
            <span className="text-muted-foreground">
              ({composition.width}x{composition.height})
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Sparkles className="h-2.5 w-2.5" />
            {generatedCode ? 'AI-generated Remotion code' : 'Generate with AI prompts'}
          </div>
        </div>
      )}

      {/* Model indicator */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Cpu className="h-3 w-3" />
          <span className="truncate">
            {hasApiKey ? selectedModelId.split('/').pop() : 'No API key configured'}
          </span>
          {hasApiKey && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
        </div>
      </div>

      {/* Chat messages */}
      <ScrollArea className="flex-1">
        <div ref={chatContainerRef} className="p-3">
          {chatMessages.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
                <Wand2 className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="text-sm font-medium mb-1">Generate Motion Graphics</h3>
              <p className="text-xs text-muted-foreground max-w-[200px] mx-auto mb-4">
                Describe the animation you want to create
              </p>
              
              {/* Quick prompts */}
              <div className="space-y-1.5 text-left">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center mb-2">
                  Try these:
                </p>
                {QUICK_PROMPTS.slice(0, 4).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickPrompt(prompt)}
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
              <ChatMessageItem key={message.id} message={message} />
            ))
          )}

          {/* Generation indicator */}
          {isGenerating && (
            <div className="flex items-center gap-2 text-xs text-purple-400 mt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>
                {stageMessage || (
                  <>
                    {stage === 'intent_analysis' && 'Analyzing your creative vision...'}
                    {stage === 'skill_selection' && 'Selecting reference materials...'}
                    {stage === 'generating' && 'Generating code...'}
                    {stage === 'validating' && 'Checking code quality...'}
                    {stage === 'visual_qc' && 'Analyzing visual output with AI...'}
                    {stage === 'regenerating' && 'Improving generation...'}
                    {stage === 'complete' && 'Compiling...'}
                  </>
                )}
              </span>
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
            placeholder={generatedCode ? "Describe changes..." : "Describe your animation..."}
            className="flex-1 h-9 text-sm"
            disabled={isGenerating}
          />
          <Button
            size="sm"
            className="h-9 px-3 bg-purple-600 hover:bg-purple-700"
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
        
        {!hasApiKey && (
          <div className="flex items-center gap-1 mt-2 text-amber-500 text-xs">
            <AlertCircle className="h-3 w-3" />
            Configure API key in settings to enable AI
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
