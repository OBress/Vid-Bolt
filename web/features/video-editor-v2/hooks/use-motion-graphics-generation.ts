/**
 * useMotionGraphicsGeneration - Hook for AI motion graphics code generation
 * 
 * Communicates with the backend motion graphics service to:
 * 1. Validate prompts
 * 2. Detect applicable skills
 * 3. Stream generated Remotion code
 * 4. Handle follow-up edits
 * 5. Auto-retry on compilation errors
 */

import { useState, useCallback, useRef } from 'react';
import { stripMarkdownFences, validateCode } from '../utils/remotion-compiler';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// TYPES
// ============================================================

export type GenerationStage = 
  | 'idle' 
  | 'starting'
  | 'validating'
  | 'analyzing'
  | 'intent_analysis'
  | 'skill_selection'
  | 'planning'
  | 'generating' 
  | 'editing'
  | 'visual_qc'
  | 'regenerating'
  | 'complete' 
  | 'error';

export type GenerationErrorType = 'validation' | 'api' | 'compilation' | 'edit_failed';

export interface AnimationVision {
  title: string;
  description: string;
  elements: number;
  phases: number;
  duration: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerationMetadata {
  skills?: string[];
  editType?: 'targeted' | 'full';
  usedIcons?: string[];
  corrections?: Array<{ original: string; correction: string }>;
  duration?: number; // Duration in frames from AI vision
}

export interface GenerationResult {
  success: boolean;
  code?: string;
  summary?: string;
  metadata?: GenerationMetadata;
  error?: string;
  errorType?: GenerationErrorType;
}

export interface ErrorCorrectionContext {
  error: string;
  attemptNumber: number;
  maxAttempts: number;
}

export interface GenerationOptions {
  currentCode?: string;
  conversationHistory?: ConversationMessage[];
  isFollowUp?: boolean;
  previouslyUsedSkills?: string[];
  maxAutoCorrectAttempts?: number;
  errorCorrection?: ErrorCorrectionContext;
}

export interface GenerationCallbacks {
  onStageChange?: (stage: GenerationStage, message?: string) => void;
  onSkillsDetected?: (skills: string[]) => void;
  onCodeUpdate?: (code: string) => void;
  onStreamPhaseChange?: (phase: 'analyzing' | 'generating' | 'validating' | 'editing') => void;
  onError?: (error: string, type: GenerationErrorType) => void;
  onComplete?: (result: GenerationResult) => void;
}

export interface UseMotionGraphicsGenerationReturn {
  isGenerating: boolean;
  stage: GenerationStage;
  stageMessage: string | null;
  error: string | null;
  generatedCode: string | null;
  detectedSkills: string[];
  correctionAttempt: number;
  vision: AnimationVision | null;
  generate: (
    prompt: string,
    apiKey: string,
    modelId: string,
    options?: GenerationOptions,
    callbacks?: GenerationCallbacks
  ) => Promise<GenerationResult>;
  reset: () => void;
}

// ============================================================
// HOOK
// ============================================================

export function useMotionGraphicsGeneration(): UseMotionGraphicsGenerationReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [detectedSkills, setDetectedSkills] = useState<string[]>([]);
  const [correctionAttempt, setCorrectionAttempt] = useState(0);
  const [vision, setVision] = useState<AnimationVision | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const originalPromptRef = useRef<string>('');
  // Use a ref for tracking attempts synchronously (state updates are async)
  const correctionAttemptRef = useRef<number>(0);
  // Preserve vision duration across error correction retries
  const visionDurationRef = useRef<number | undefined>(undefined);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    setStage('idle');
    setStageMessage(null);
    setError(null);
    setGeneratedCode(null);
    setDetectedSkills([]);
    setCorrectionAttempt(0);
    setVision(null);
    correctionAttemptRef.current = 0;
    visionDurationRef.current = undefined;
    originalPromptRef.current = '';
  }, []);

  const generate = useCallback(async (
    prompt: string,
    apiKey: string,
    modelId: string,
    options: GenerationOptions = {},
    callbacks: GenerationCallbacks = {}
  ): Promise<GenerationResult> => {
    const {
      currentCode,
      conversationHistory = [],
      isFollowUp = false,
      previouslyUsedSkills = [],
      maxAutoCorrectAttempts = 3,
      errorCorrection,
    } = options;

    const {
      onStageChange,
      onSkillsDetected,
      onCodeUpdate,
      onStreamPhaseChange,
      onError,
      onComplete,
    } = callbacks;

    // Store original prompt for auto-correction retries
    if (!errorCorrection) {
      originalPromptRef.current = prompt;
      correctionAttemptRef.current = 0;
      setCorrectionAttempt(0);
    }

    // Abort any existing request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsGenerating(true);
    setError(null);
    setStage('starting');
    setStageMessage('Starting generation...');
    onStageChange?.('starting', 'Starting generation...');

    try {
      // Get session for authentication
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        const errorMessage = 'Authentication required. Please log in.';
        setError(errorMessage);
        setStage('error');
        onError?.(errorMessage, 'api');
        return {
          success: false,
          error: errorMessage,
          errorType: 'api',
        };
      }

      // Make API request to backend
      const response = await fetch('/api/motion-graphics/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'x-openrouter-key': apiKey,
        },
        body: JSON.stringify({
          prompt,
          model: modelId,
          currentCode: isFollowUp || errorCorrection ? currentCode : undefined,
          conversationHistory: isFollowUp ? conversationHistory : [],
          isFollowUp,
          errorCorrection,
          previouslyUsedSkills,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `API error: ${response.status}`;
        const errorType = (errorData.type as GenerationErrorType) || 'api';
        
        setError(errorMessage);
        setStage('error');
        onError?.(errorMessage, errorType);
        
        return {
          success: false,
          error: errorMessage,
          errorType,
        };
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedCode = '';
      let finalSkills: string[] = [];
      let finalSummary = '';
      let editType: 'targeted' | 'full' | undefined;
      let usedIcons: string[] = [];
      let visionDuration: number | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            
            switch (event.type) {
              case 'stage':
                setStage(event.stage as GenerationStage);
                setStageMessage(event.message || null);
                onStageChange?.(event.stage, event.message);
                
                // Map stage to stream phase for callbacks
                if (event.stage === 'analyzing') {
                  onStreamPhaseChange?.('analyzing');
                } else if (event.stage === 'generating' || event.stage === 'editing') {
                  onStreamPhaseChange?.('generating');
                } else if (event.stage === 'validating') {
                  onStreamPhaseChange?.('validating');
                }
                break;
                
              case 'skills':
                finalSkills = event.skills || [];
                setDetectedSkills(finalSkills);
                onSkillsDetected?.(finalSkills);
                break;
                
              case 'vision':
                // Legacy vision event (kept for backwards compatibility)
                if (event.vision) {
                  setVision(event.vision as AnimationVision);
                  if (event.vision.duration && event.vision.duration > 0) {
                    visionDuration = event.vision.duration;
                    visionDurationRef.current = event.vision.duration;
                    console.log('[MotionGraphicsGeneration] ✅ Captured duration from vision:', event.vision.duration, 'frames', `(${(event.vision.duration / 30).toFixed(1)}s)`);
                  } else {
                    console.warn('[MotionGraphicsGeneration] ⚠️ Vision missing duration!', event.vision);
                  }
                  console.log('[MotionGraphicsGeneration] Vision:', event.vision.title, 
                    `(${event.vision.elements} elements, ${event.vision.phases} phases)`);
                }
                break;
                
              case 'plan':
                // Animation plan from vision analysis (NEW two-step process)
                if (event.plan) {
                  setVision(event.plan as AnimationVision);
                  // Capture duration from plan in BOTH local var AND ref (ref persists across retries)
                  if (event.plan.duration && event.plan.duration > 0) {
                    visionDuration = event.plan.duration;
                    visionDurationRef.current = event.plan.duration; // Persist for error corrections
                    console.log('[MotionGraphicsGeneration] ✅ Captured duration from plan:', event.plan.duration, 'frames', `(${(event.plan.duration / 30).toFixed(1)}s)`);
                  } else {
                    console.warn('[MotionGraphicsGeneration] ⚠️ Plan missing duration!', event.plan);
                  }
                  console.log('[MotionGraphicsGeneration] Plan:', event.plan.title, 
                    `(${event.plan.elements} elements, ${event.plan.phases} phases)`);
                }
                break;
                
              case 'code_chunk':
                accumulatedCode = event.fullCode || (accumulatedCode + event.chunk);
                const cleanCode = stripMarkdownFences(accumulatedCode);
                setGeneratedCode(cleanCode);
                onCodeUpdate?.(cleanCode);
                
                // Update stage if needed
                if (stage !== 'generating') {
                  setStage('generating');
                  setStageMessage('Creating your animation...');
                  onStageChange?.('generating', 'Creating your animation...');
                  onStreamPhaseChange?.('generating');
                }
                break;
                
              case 'edit':
                // Handle edit event for follow-ups
                finalSummary = event.summary || '';
                editType = event.editType;
                setStageMessage(event.summary || 'Applying edits...');
                break;
                
              case 'validation':
                // Backend validation results
                if (!event.result?.isValid) {
                  console.warn('[MotionGraphicsGeneration] Validation warnings:', event.result?.warnings);
                }
                break;
                
              case 'complete':
                // Strip markdown fences but keep the full code structure
                const strippedCode = stripMarkdownFences(event.code || accumulatedCode);
                
                // Store the raw code for display (extractComponentCode extracts just the body)
                let workingCode = strippedCode;
                
                setGeneratedCode(workingCode);
                setStage('complete');
                setStageMessage(null);
                onCodeUpdate?.(workingCode);
                onStageChange?.('complete');
                
                // Get metadata from event
                if (event.metadata?.usedIcons) {
                  usedIcons = event.metadata.usedIcons;
                }
                
                // Capture final skills if provided
                if (event.skills) {
                  finalSkills = event.skills;
                  setDetectedSkills(finalSkills);
                }
                
                // Client-side validation - just checks for JSX and tries to compile
                const clientValidation = validateCode(workingCode);
                
                if (!clientValidation.isValid && clientValidation.error) {
                  // Use ref for synchronous tracking (state updates are async)
                  correctionAttemptRef.current += 1;
                  const currentAttempt = correctionAttemptRef.current;
                  setCorrectionAttempt(currentAttempt); // Update state for UI
                  
                  // Only regenerate if local fixes didn't work and under limit
                  if (currentAttempt <= maxAutoCorrectAttempts) {
                    console.log(`[MotionGraphicsGeneration] Local fix failed, asking AI to fix (attempt ${currentAttempt}/${maxAutoCorrectAttempts})`);
                    console.log(`[MotionGraphicsGeneration] Error: ${clientValidation.error}`);
                    
                    // Retry with error correction - AI will fix the specific error
                    return generate(
                      originalPromptRef.current || prompt,
                      apiKey,
                      modelId,
                      {
                        ...options,
                        currentCode: workingCode, // Use the partially fixed code
                        errorCorrection: {
                          error: clientValidation.error,
                          attemptNumber: currentAttempt,
                          maxAttempts: maxAutoCorrectAttempts,
                        },
                      },
                      callbacks
                    );
                  }
                  
                  console.log(`[MotionGraphicsGeneration] Max retry attempts (${maxAutoCorrectAttempts}) reached. Stopping.`);
                  
                  // Max attempts reached
                  setError(clientValidation.error);
                  onError?.(clientValidation.error, 'compilation');
                  
                  return {
                    success: false,
                    code: workingCode,
                  error: clientValidation.error,
                  errorType: 'compilation',
                  metadata: {
                    skills: finalSkills,
                    usedIcons, // Always pass the array (even if empty) - [] means "no icons", undefined means "not analyzed"
                    duration: visionDurationRef.current || visionDuration, // Preserve across retries
                  },
                };
                }
                
                // Success!
                const finalDuration = visionDurationRef.current || visionDuration;
                console.log('[MotionGraphicsGeneration] ✅ Complete event - returning result with duration:', finalDuration);
                
                // Log icon metadata for debugging
                if (usedIcons && usedIcons.length > 0) {
                  console.log('[MotionGraphicsGeneration] ✅ Icons provided by backend:', usedIcons);
                } else if (usedIcons && usedIcons.length === 0) {
                  console.log('[MotionGraphicsGeneration] ✅ No icons used in this animation (backend confirmed)');
                }
                
                const result: GenerationResult = {
                  success: true,
                  code: workingCode,
                  summary: finalSummary || 'Motion graphic generated successfully!',
                  metadata: {
                    skills: finalSkills,
                    editType,
                    usedIcons, // Always pass the array - [] means "no icons", undefined means "not analyzed"
                    duration: finalDuration, // Duration from AI vision planning (persists across retries)
                  },
                };
                
                onComplete?.(result);
                return result;
                
              case 'error':
                throw new Error(event.error);
                
              case 'done':
                // Stream complete - this comes after 'complete'
                break;
            }
          } catch (parseError) {
            // Ignore parse errors for partial data
            if (parseError instanceof Error && !parseError.message.includes('JSON')) {
              throw parseError;
            }
          }
        }
      }

      // If we get here without a complete event, process what we have
      if (accumulatedCode) {
        const finalCode = stripMarkdownFences(accumulatedCode);
        
        // Don't extract here - keep the full code, compileCode will extract internally
        setGeneratedCode(finalCode);
        setStage('complete');
        
        const finalDuration = visionDurationRef.current || visionDuration;
        const result: GenerationResult = {
          success: true,
          code: finalCode,
          summary: finalSummary || 'Motion graphic generated!',
          metadata: {
            skills: finalSkills,
            editType,
            usedIcons: usedIcons.length > 0 ? usedIcons : undefined,
            duration: finalDuration, // Duration from AI vision planning (persists across retries)
          },
        };
        
        console.log('[MotionGraphicsGeneration] Fallback result with duration:', finalDuration);
        onComplete?.(result);
        return result;
      }

      throw new Error('No code generated');

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          error: 'Request aborted',
          errorType: 'api',
        };
      }

      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setStage('error');
      onError?.(errorMessage, 'api');
      
      return {
        success: false,
        error: errorMessage,
        errorType: 'api',
      };
    } finally {
      setIsGenerating(false);
    }
  }, [stage, correctionAttempt]);

  return {
    isGenerating,
    stage,
    stageMessage,
    error,
    generatedCode,
    detectedSkills,
    correctionAttempt,
    vision,
    generate,
    reset,
  };
}

export default useMotionGraphicsGeneration;
