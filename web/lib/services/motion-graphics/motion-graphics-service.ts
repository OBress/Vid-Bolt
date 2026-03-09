/**
 * MotionGraphicsService - AI-Powered Motion Graphics Generation
 * 
 * Ported from gpt-story-writer-niche-sys/backend/src/services/motion-graphics/MotionGraphicsService.js
 * 
 * Adapted for Next.js:
 * - Uses fetch() for OpenRouter API calls (consistent with Vid-Bolt's openrouter.ts)
 * - SSE writes go to a WritableStreamDefaultWriter instead of Express res
 * - TypeScript with proper types
 * 
 * THE PIPELINE:
 * 1. SKILL DETECTION (keyword-based, fast — merged with validation)
 * 2. VISION & PLANNING (conditional — skipped for simple prompts)
 * 3. CODE GENERATION (streamed from OpenRouter)
 * 4. CODE VALIDATION & ANALYSIS
 * 5. SEND TO FRONTEND via SSE
 */

import { skillLoader } from './skill-loader';
import {
  BASE_SYSTEM_PROMPT,
  FOLLOW_UP_SYSTEM_PROMPT,
  VISION_PROMPT,
  PLANNING_PROMPT,
  buildSkillDetectionPrompt,
  buildErrorCorrectionContext,
} from './prompts';
import {
  validateCode,
  transpileCheck,
  extractAndEnsureIcons,
  stripMarkdownFences,
  extractComponentCode,
} from './code-validator';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface GenerationRequest {
  prompt: string;
  model: string;
  currentCode?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  isFollowUp?: boolean;
  errorCorrection?: {
    error: string;
    attemptNumber: number;
    maxAttempts: number;
  };
  previouslyUsedSkills?: string[];
}

interface EditOperation {
  description: string;
  old_string: string;
  new_string: string;
  lineNumber?: number;
}

type SSEWriter = (data: Record<string, unknown>) => void;

/**
 * Call OpenRouter API (non-streaming) using fetch
 */
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; maxTokens?: number; responseFormat?: { type: string } } = {}
): Promise<{ content: string; finishReason: string }> {
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 8192,
  };

  if (options.responseFormat) {
    requestBody.response_format = options.responseFormat;
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Motion Graphics',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${errorText.substring(0, 200)}`;
    }
    throw new Error(`OpenRouter API error: ${errorMessage}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new Error('Invalid response from OpenRouter API - no content');
  }

  return {
    content: choice.message.content,
    finishReason: choice.finish_reason || 'stop',
  };
}

/**
 * Call OpenRouter API with streaming, yields content chunks
 */
async function* streamOpenRouter(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Motion Graphics',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 32000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter streaming error: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for stream');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

class MotionGraphicsService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await skillLoader.initialize();
    this.initialized = true;
  }

  /**
   * Truncate conversation history to prevent context rot.
   * Keeps the first message (original context) + last N-1 messages.
   */
  private truncateHistory(
    history: Array<{ role: string; content: string }>,
    maxMessages: number = 4
  ): Array<{ role: string; content: string }> {
    if (history.length <= maxMessages) return history;
    // Keep first message (original prompt context) + last N-1 messages
    return [
      history[0],
      ...history.slice(-(maxMessages - 1)),
    ];
  }

  /**
   * Select a faster/cheaper model for classification tasks.
   * Only overrides if the user selected an expensive code-generation model.
   */
  private getClassificationModel(requestedModel: string): string {
    const cheapModels = [
      'google/gemini-3-flash-preview',
      'google/gemini-2.0-flash',
      'meta-llama/llama-3.1-8b-instruct',
    ];
    // If already using a cheap model, keep it
    if (cheapModels.some(m => requestedModel.includes(m))) return requestedModel;
    // Default to Gemini 3 Flash for classification
    return 'google/gemini-3-flash-preview';
  }

  /**
   * Determine if a prompt is complex enough to warrant vision/planning.
   * Simple prompts (e.g., "bouncy hello world") skip directly to code generation.
   */
  private isComplexPrompt(prompt: string): boolean {
    const wordCount = prompt.split(/\s+/).length;
    const hasMultipleConcepts = /\band\b|\bwith\b|\bthen\b|\bfollowed by\b|\bincluding\b|\bplus\b/i.test(prompt);
    const hasTimingWords = /\bsequence\b|\bphase\b|\bstep\b|\bstage\b|\btimeline\b|\bscene\b|\bsection\b/i.test(prompt);
    const hasDetailedRequest = /\bdata\b|\bchart\b|\bdashboard\b|\bmultiple\b|\bcomplex\b|\bprofessional\b|\bcorporate\b|\bintro\b|\boutro\b|\blogo\b|\binfographic\b/i.test(prompt);
    const hasAnimationDetail = /\btransition\b|\benter\b|\bexit\b|\bfade\b|\bslide\b|\bexplode\b|\bmorph\b|\bparticle\b|\b3d\b|\brotate\b/i.test(prompt);

    const isComplex = wordCount > 12 || hasMultipleConcepts || hasTimingWords || hasDetailedRequest || hasAnimationDetail;

    return isComplex;
  }

  /**
   * Parse JSON from AI response with robust error handling.
   */
  parseAIJson<T = Record<string, unknown>>(content: string, fallback: T): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      // Try to extract from markdown code block
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1].trim()) as T;
        } catch {
          // Continue
        }
      }
      
      // Try to extract JSON object
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Clean common JSON issues
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');
        
        try {
          return JSON.parse(jsonStr) as T;
        } catch {
          // Try to repair truncated JSON
          console.warn('[MotionGraphicsService] Attempting to repair truncated JSON...');
          
          let repaired = jsonStr;
          let braceDepth = 0;
          let bracketDepth = 0;
          let inString = false;
          let lastCompleteIndex = 0;
          
          for (let i = 0; i < repaired.length; i++) {
            const char = repaired[i];
            const prevChar = i > 0 ? repaired[i - 1] : '';
            
            if (char === '"' && prevChar !== '\\') {
              inString = !inString;
            }
            
            if (!inString) {
              if (char === '{') braceDepth++;
              else if (char === '}') braceDepth--;
              else if (char === '[') bracketDepth++;
              else if (char === ']') bracketDepth--;
              
              if (char === ',' || char === '}' || char === ']') {
                lastCompleteIndex = i + 1;
              }
            }
          }
          
          if (inString || braceDepth > 0 || bracketDepth > 0) {
            repaired = repaired.substring(0, lastCompleteIndex).trim();
            if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
            
            while (bracketDepth > 0) { repaired += ']'; bracketDepth--; }
            while (braceDepth > 0) { repaired += '}'; braceDepth--; }
            
            try {
              const fixed = JSON.parse(repaired) as T;
              console.log('[MotionGraphicsService] ✅ Successfully repaired truncated JSON');
              return fixed;
            } catch (repairError) {
              console.error('[MotionGraphicsService] Smart repair failed:', (repairError as Error).message);
            }
          }
        }
      }
      
      console.error('[MotionGraphicsService] ❌ Could not parse JSON from content');
      return fallback;
    }
  }

  /**
   * Validate that a prompt is appropriate for motion graphics generation.
   * Now a lightweight local check — AI validation merged into skill detection.
   */
  private validatePromptLocal(prompt: string): { valid: boolean; reason?: string } {
    if (!prompt || prompt.trim().length < 3) {
      return { valid: false, reason: 'Please describe an animation or visual content you\'d like to create.' };
    }
    return { valid: true };
  }

  /**
   * Analyze the user's vision
   */
  async analyzeVision(apiKey: string, prompt: string, model: string): Promise<string | null> {
    try {

      
      const { content, finishReason } = await callOpenRouter(apiKey, model, [
        { role: 'system', content: VISION_PROMPT },
        { role: 'user', content: prompt },
      ], {
        temperature: 0.7,
        maxTokens: 800,
        responseFormat: { type: 'json_object' },
      });

      if (finishReason === 'length') {
        console.warn('[MotionGraphicsService] ⚠️ Vision response truncated');
      }

      const visionJson = this.parseAIJson<{ description?: string }>(content, { description: undefined });
      if (visionJson?.description) {

        return visionJson.description;
      }
      
      console.error('[MotionGraphicsService] ❌ Could not parse vision JSON');
      return null;
    } catch (error) {
      console.error('[MotionGraphicsService] Vision analysis error:', (error as Error).message);
      return null;
    }
  }

  /**
   * Create a detailed animation plan from the vision.
   */
  async createPlan(
    apiKey: string,
    vision: string,
    originalPrompt: string,
    model: string
  ): Promise<Record<string, unknown> | null> {
    try {

      
      const planningInput = `VISION: ${vision}\n\nORIGINAL REQUEST: ${originalPrompt}`;
      
      const { content, finishReason } = await callOpenRouter(apiKey, model, [
        { role: 'system', content: PLANNING_PROMPT },
        { role: 'user', content: planningInput },
      ], {
        temperature: 0.7,
        maxTokens: 8000,
        responseFormat: { type: 'json_object' },
      });

      if (finishReason === 'length') {
        console.warn('[MotionGraphicsService] ⚠️ Plan response truncated');
      }

      const plan = this.parseAIJson(content, null);
      if (plan) {
  
        return plan as Record<string, unknown>;
      }
      
      console.error('[MotionGraphicsService] ❌ Could not parse plan JSON');
      return null;
    } catch (error) {
      console.error('[MotionGraphicsService] Plan creation error:', (error as Error).message);
      return null;
    }
  }

  /**
   * Format the plan into a prompt section for code generation.
   */
  formatPlanContext(vision: string | null, plan: Record<string, unknown>): string {
    if (!plan) return '';

    let context = `\n\n## ANIMATION SPECIFICATION\n\n`;
    
    if (vision) {
      context += `### Vision\n${vision}\n\n`;
    }
    
    context += `### Animation: ${plan.title || 'Motion Graphic'}\n\n`;

    const elements = plan.elements as Array<Record<string, string>> | undefined;
    if (elements && elements.length > 0) {
      context += `### Elements\n`;
      for (const element of elements) {
        context += `- **${element.name}** (${element.type})\n`;
        context += `  - Description: ${element.description}\n`;
        if (element.initialState) {
          context += `  - Initial State: ${element.initialState}\n`;
        }
      }
      context += '\n';
    }

    const timeline = plan.timeline as Array<Record<string, unknown>> | undefined;
    if (timeline && timeline.length > 0) {
      context += `### Timeline\n`;
      for (const phase of timeline) {
        context += `\n**${phase.phase}** (frames ${phase.startFrame}-${phase.endFrame})\n`;
        context += `${phase.description}\n`;
        const animations = phase.animations as Array<Record<string, string>> | undefined;
        if (animations && animations.length > 0) {
          context += 'Animations:\n';
          for (const anim of animations) {
            context += `- ${anim.element}: ${anim.property} from "${anim.from}" to "${anim.to}" (${anim.easing})\n`;
          }
        }
      }
      context += '\n';
    }

    const timing = plan.timing as { totalDurationFrames?: number; fps?: number } | undefined;
    if (timing) {
      context += `### Timing\n`;
      context += `- Duration: ${timing.totalDurationFrames} frames at ${timing.fps || 30}fps (${((timing.totalDurationFrames || 0) / 30).toFixed(1)}s)\n\n`;
    }

    const style = plan.style as Record<string, unknown> | undefined;
    if (style) {
      context += `### Visual Style\n`;
      if (style.backgroundColor) context += `- Background: ${style.backgroundColor}\n`;
      if (style.colorPalette) context += `- Colors: ${(style.colorPalette as string[]).join(', ')}\n`;
      if (style.primaryFont) context += `- Font: ${style.primaryFont}\n`;
      if (style.mood) context += `- Mood: ${style.mood}\n`;
      context += '\n';
    }

    context += `**IMPORTANT**: Follow this specification exactly. Every element and animation is precisely defined.\n`;

    return context;
  }

  /**
   * Detect skills from keywords (fast, no API call)
   */
  detectSkillsFromKeywords(prompt: string): string[] {
    const promptLower = prompt.toLowerCase();
    const detectedSkills: string[] = [];
    
    const skillKeywords: Record<string, string[]> = {
      'animations': ['animation', 'animate', 'motion', 'movement', 'entrance', 'exit'],
      'timing': ['easing', 'bezier', 'curve', 'interpolate', 'linear'],
      'spring-physics': ['bounce', 'spring', 'elastic', 'wobble', 'organic', 'physics', 'overshoot'],
      'sequencing': ['sequence', 'stagger', 'delay', 'timing', 'choreograph', 'order', 'phase'],
      'charts': ['chart', 'graph', 'bar chart', 'pie chart', 'data viz', 'visualization', 'statistics', 'progress', 'percentage', 'histogram', 'metric', 'donut'],
      'typography': ['title', 'headline', 'subtitle', 'caption', 'heading', 'kinetic text'],
      'text-animations': ['typewriter', 'typing', 'word by word', 'letter by letter', 'character', 'text reveal', 'highlight'],
      'messaging': ['chat', 'message bubble', 'whatsapp', 'imessage', 'sms', 'conversation', 'dm', 'text message'],
      'social-media': ['instagram', 'tiktok', 'youtube', 'story', 'reel', 'vertical', 'shorts', 'social', 'post'],
      '3d': ['3d', 'three', 'cube', 'sphere', 'rotate', 'spatial', 'dimension', 'threejs'],
      'maps': ['map', 'mapbox', 'location', 'route', 'geography', 'travel', 'marker', 'pin', 'coordinate', 'd3-geo', 'globe', 'flight', 'country', 'world', 'city', 'projection', 'state', 'province', 'region', 'county', 'district', 'territory', 'prefecture'],
      'lottie': ['lottie', 'after effects', 'bodymovin', 'json animation'],
      'images': ['image', 'photo', 'picture', 'logo'],
      'videos': ['video', 'clip', 'footage', 'embed'],
      'audio': ['audio', 'sound', 'music', 'sfx', 'soundtrack'],
      'gifs': ['gif', 'animated image', 'apng', 'webp animation'],
      'shapes': ['shape', 'circle', 'rectangle', 'triangle', 'star', 'polygon', 'svg', 'vector'],
      'transitions': ['transition', 'fade', 'slide', 'wipe', 'crossfade', 'cut to'],
      'fonts': ['font', 'google font', 'typeface', 'typography'],
      'compositions': ['composition', 'setup', 'dimension', 'fps', 'resolution', 'aspect ratio'],
      'assets': ['staticfile', 'asset import'],
      'audio-visualization': ['spectrum', 'waveform', 'equalizer', 'bass', 'frequency', 'beat', 'visualiz'],
      'measuring-text': ['fit text', 'text width', 'truncat'],
      'parameters': ['parameter', 'configurable', 'schema', 'zod'],
      'trimming': ['trim', 'shorten', 'clip range'],
      'transparent-videos': ['transparent video', 'alpha channel', 'green screen'],
      // New keyword mappings
      'backgrounds': ['background', 'backdrop', 'wallpaper', 'scenery'],
      'gradients': ['gradient', 'linear-gradient', 'radial gradient', 'color blend'],
      'icons': ['icon', 'emoji', 'symbol', 'lucide'],
      'particles': ['particle', 'confetti', 'sparkle', 'firework', 'snow', 'rain', 'dust', 'ember'],
      'noise': ['noise', 'perlin', 'grain', 'static texture'],
      'overlays': ['overlay', 'vignette', 'film grain', 'scanline', 'lower-third', 'lower third',
        'location tag', 'label', 'badge', 'indicator', 'hud', 'heads-up', 'effect', 'filter',
        'lens', 'frame', 'border', 'pip', 'picture-in-picture', 'split-screen', 'ticker',
        'countdown', 'progress', 'meter', 'gauge', 'info box', 'caption', 'annotation',
        'transparent', 'composit'],
      'masks-and-clipping': ['mask', 'clipping', 'crop', 'viewport'],
      'motion-blur': ['motion blur', 'speed lines', 'blur effect'],
      'light-leaks': ['light leak', 'lens flare', 'glow', 'bloom'],
    };
    
    for (const [skill, keywords] of Object.entries(skillKeywords)) {
      if (keywords.some(keyword => promptLower.includes(keyword))) {
        detectedSkills.push(skill);
      }
    }
    
    return detectedSkills.slice(0, 12);
  }

  /**
   * Detect skills with optional AI fallback
   */
  async detectSkills(apiKey: string, prompt: string, model: string): Promise<string[]> {
    try {
      const keywordSkills = this.detectSkillsFromKeywords(prompt);
      
      if (keywordSkills.length > 0) {
        return keywordSkills;
      }
      
      // AI-based detection fallback
      const skillMetadata = skillLoader.getAllSkillMetadata();
      if (skillMetadata.length === 0) return [];

      const detectionPrompt = buildSkillDetectionPrompt(skillMetadata);

      const { content } = await callOpenRouter(apiKey, this.getClassificationModel(model), [
        { role: 'system', content: detectionPrompt + '\n\nRespond with ONLY a JSON object like: {"skills": ["skill1", "skill2"]}' },
        { role: 'user', content: `Prompt: "${prompt}"` },
      ], {
        temperature: 0.1,
        maxTokens: 200,
      });

      const result = this.parseAIJson<{ skills?: string[] }>(content, { skills: [] });
      const detectedSkills = result.skills || [];
      const validSkills = detectedSkills.filter(name => skillLoader.hasSkill(name));
      

      return validSkills;
    } catch (error) {
      console.error('[MotionGraphicsService] Skill detection error:', error);
      return this.detectSkillsFromKeywords(prompt);
    }
  }

  /**
   * Stream generation — the main entry point.
   * Writes SSE events to the provided writer function.
   */
  async streamGeneration(
    sendSSE: SSEWriter,
    apiKey: string,
    request: GenerationRequest
  ): Promise<void> {
    const {
      prompt,
      model,
      currentCode,
      conversationHistory = [],
      isFollowUp = false,
      errorCorrection,
      previouslyUsedSkills = [],
    } = request;

    try {
      await this.initialize();

      sendSSE({ type: 'stage', stage: 'starting', message: 'Starting generation...' });

      // Step 1: Local prompt validation (fast, no API call)
      if (!isFollowUp && !errorCorrection) {
        const validation = this.validatePromptLocal(prompt);
        if (!validation.valid) {
          sendSSE({
            type: 'error',
            error: validation.reason || 'Please describe an animation or visual content you\'d like to create.',
            errorType: 'validation',
          });
          return;
        }
      }

      // Step 2: Detect skills (keyword-based, falls back to AI with cheap model)
      sendSSE({ type: 'stage', stage: 'analyzing', message: 'Analyzing requirements...' });
      
      // On follow-up/auto-correction: reuse original skills to prevent QC feedback text
      // from polluting skill detection (QC text contains words like "chart", "image", etc.)
      let detectedSkills: string[];
      if ((isFollowUp || errorCorrection) && previouslyUsedSkills.length > 0) {
        detectedSkills = [...previouslyUsedSkills];
      } else {
        detectedSkills = await this.detectSkills(apiKey, prompt, model);
      }
      
      // Always include spring-physics
      if (!detectedSkills.includes('spring-physics') && skillLoader.hasSkill('spring-physics')) {
        detectedSkills = ['spring-physics', ...detectedSkills];
      }
      
      // Domain-specific skills contain unique APIs the AI can't guess — prioritize them
      // over generic enhancement skills (animations, timing, typography) that overlap with the base prompt
      const PRIORITY_SKILLS = ['maps', 'charts', '3d', 'lottie', 'audio-visualization', 'particles', 'noise', 'light-leaks'];
      const ALWAYS_INCLUDE = ['spring-physics'];
      
      const alwaysIncluded = detectedSkills.filter(s => ALWAYS_INCLUDE.includes(s));
      const domainSpecific = detectedSkills.filter(s => PRIORITY_SKILLS.includes(s) && !ALWAYS_INCLUDE.includes(s));
      const generic = detectedSkills.filter(s => !PRIORITY_SKILLS.includes(s) && !ALWAYS_INCLUDE.includes(s));
      detectedSkills = [...alwaysIncluded, ...domainSpecific, ...generic];
      
      const MAX_SKILLS = 8;
      if (detectedSkills.length > MAX_SKILLS) {
        detectedSkills = detectedSkills.slice(0, MAX_SKILLS);
      }
      
      const newSkills = detectedSkills.filter(s => !previouslyUsedSkills.includes(s));
      
      sendSSE({ type: 'skills', skills: detectedSkills, newSkills });

      // Step 3: Vision & Planning (CONDITIONAL — only for complex prompts)
      let planContext = '';
      let plannedDuration: number | null = null;
      
      if (!isFollowUp && !errorCorrection && this.isComplexPrompt(prompt)) {
        sendSSE({ type: 'stage', stage: 'analyzing', message: 'Understanding your vision...' });
        const visionDescription = await this.analyzeVision(apiKey, prompt, model);
        
        if (visionDescription) {
          sendSSE({ type: 'stage', stage: 'planning', message: 'Creating detailed plan...' });
          const plan = await this.createPlan(apiKey, visionDescription, prompt, model);
          
          if (plan) {
            planContext = this.formatPlanContext(visionDescription, plan);
            const timing = plan.timing as { totalDurationFrames?: number } | undefined;
            plannedDuration = timing?.totalDurationFrames || null;
            
            sendSSE({ 
              type: 'plan', 
              plan: {
                title: plan.title,
                vision: visionDescription,
                elements: (plan.elements as unknown[])?.length || 0,
                phases: (plan.timeline as unknown[])?.length || 0,
                duration: plannedDuration,
              }
            });
          }
        }
      }

      // Step 4: Build enhanced system prompt
      const skillContent = skillLoader.getCombinedSkillContent(newSkills);
      let systemPrompt = BASE_SYSTEM_PROMPT;
      
      if (skillContent) {
        systemPrompt += `\n\n## SKILL-SPECIFIC GUIDANCE\n\n${skillContent}`;
      }
      
      if (planContext) {
        systemPrompt += planContext;
      }

      if (errorCorrection) {
        systemPrompt += buildErrorCorrectionContext(errorCorrection);
      }

      // Step 5: Handle follow-up edits
      if (isFollowUp && currentCode) {
        await this.handleFollowUpEdit(sendSSE, apiKey, {
          prompt,
          model,
          currentCode,
          conversationHistory,
          detectedSkills,
          errorCorrection,
          baseSystemPrompt: systemPrompt,
        });
        return;
      }

      // Step 5: Stream code generation
      sendSSE({ type: 'stage', stage: 'generating', message: 'Generating code...' });

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      let accumulatedCode = '';

      for await (const content of streamOpenRouter(apiKey, model, messages, {
        temperature: 0.7,
        maxTokens: 32000,
      })) {
        accumulatedCode += content;
        sendSSE({
          type: 'code_chunk',
          chunk: content,
          fullCode: accumulatedCode,
        });
      }

      // Step 6: Finalize (with syntax retry context so Babel failures auto-correct)
      await this.finalizeGeneration(sendSSE, accumulatedCode, detectedSkills, null, plannedDuration, {
        apiKey, model, prompt, attempt: 0, baseSystemPrompt: systemPrompt,
      });

    } catch (error) {
      console.error('[MotionGraphicsService] Generation error:', error);
      sendSSE({
        type: 'error',
        error: (error as Error).message || 'Generation failed',
        errorType: 'api',
      });
    }
  }

  /**
   * Handle follow-up edits (targeted or full replacement)
   */
  private async handleFollowUpEdit(
    sendSSE: SSEWriter,
    apiKey: string,
    options: {
      prompt: string;
      model: string;
      currentCode: string;
      conversationHistory: Array<{ role: string; content: string }>;
      detectedSkills: string[];
      errorCorrection?: GenerationRequest['errorCorrection'];
      baseSystemPrompt?: string;
    }
  ): Promise<void> {
    const { prompt, model, currentCode, conversationHistory, detectedSkills, errorCorrection, baseSystemPrompt } = options;

    sendSSE({ type: 'stage', stage: 'editing', message: 'Analyzing edit request...' });

    const contextMessages = this.truncateHistory(conversationHistory, 4);
    let conversationContext = '';
    if (contextMessages.length > 0) {
      conversationContext = '\n\n## RECENT CONVERSATION:\n' +
        contextMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    }

    // If this is an error correction, number the lines so the AI can use the Babel (Line:Col) coordinates
    const codeToDisplay = errorCorrection
      ? currentCode.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n')
      : currentCode;

    let editPrompt = `## CURRENT CODE:\n\`\`\`tsx\n${codeToDisplay}\n\`\`\`\n${conversationContext}`;

    if (errorCorrection) {
      editPrompt += buildErrorCorrectionContext(errorCorrection);
    }

    editPrompt += `\n\n## USER REQUEST:\n${prompt}\n\nAnalyze the request and decide: use targeted edits (type: "edit") for small changes, or full replacement (type: "full") for major restructuring.\n\nRespond with ONLY a JSON object.`;

    // Combine the full base prompt (Remotion rules, skills, plan) with the edit-specific prompt
    // so the AI retains all framework constraints during follow-up edits
    const fullSystemPrompt = baseSystemPrompt
      ? `${baseSystemPrompt}\n\n${FOLLOW_UP_SYSTEM_PROMPT}`
      : FOLLOW_UP_SYSTEM_PROMPT;

    try {
      const { content } = await callOpenRouter(apiKey, model, [
        { role: 'system', content: fullSystemPrompt + '\n\nYou MUST respond with ONLY a valid JSON object, no other text.' },
        { role: 'user', content: editPrompt },
      ], {
        temperature: 0.3,
        maxTokens: 8192,
      });

      const result = this.parseAIJson<{
        type?: string;
        edits?: EditOperation[];
        code?: string;
        summary?: string;
      }>(content, { type: 'full', code: content, summary: 'Code updated' });

      if (result.type === 'edit' && result.edits) {
        const editResult = this.applyEdits(currentCode, result.edits);
        
        if (!editResult.success) {
          // Fallback: re-request as full replacement instead of erroring out
          console.warn(`[MotionGraphicsService] Targeted edit failed: ${editResult.error}. Falling back to full replacement.`);
          sendSSE({ type: 'stage', stage: 'editing', message: 'Retrying with full replacement...' });

          try {
            const fallbackPrompt = `## CURRENT CODE:\n\`\`\`tsx\n${currentCode}\n\`\`\`\n\n## USER REQUEST:\n${prompt}\n\nThe targeted edit approach failed. You MUST provide a full replacement.\n\nRespond with ONLY a JSON object: { "type": "full", "summary": "...", "code": "...full replacement code..." }`;

            const { content: fallbackContent } = await callOpenRouter(apiKey, model, [
              { role: 'system', content: fullSystemPrompt + '\n\nYou MUST respond with type: "full" and provide the complete replacement code. Do NOT use type: "edit".' },
              { role: 'user', content: fallbackPrompt },
            ], {
              temperature: 0.3,
              maxTokens: 16384,
            });

            const fallbackResult = this.parseAIJson<{
              type?: string;
              code?: string;
              summary?: string;
            }>(fallbackContent, { type: 'full', code: fallbackContent, summary: 'Full replacement after edit failure' });

            if (fallbackResult.code) {
              sendSSE({ type: 'edit', summary: fallbackResult.summary || 'Applied fix via full replacement', editType: 'full' });
              await this.finalizeGeneration(sendSSE, fallbackResult.code, detectedSkills, 'full');
              return;
            }
          } catch (fallbackError) {
            console.error('[MotionGraphicsService] Full replacement fallback also failed:', fallbackError);
          }

          sendSSE({ type: 'error', error: editResult.error, errorType: 'edit_failed' });
          return;
        }

        sendSSE({
          type: 'edit',
          summary: result.summary,
          edits: editResult.enrichedEdits,
          editType: 'targeted',
        });

        await this.finalizeGeneration(sendSSE, editResult.result!, detectedSkills, 'targeted');

      } else if (result.type === 'full' && result.code) {
        sendSSE({ type: 'edit', summary: result.summary, editType: 'full' });
        await this.finalizeGeneration(sendSSE, result.code, detectedSkills, 'full');

      } else {
        sendSSE({ type: 'error', error: 'Invalid response from AI - missing required fields', errorType: 'edit_failed' });
      }

    } catch (error) {
      console.error('[MotionGraphicsService] Edit error:', error);
      sendSSE({ type: 'error', error: (error as Error).message || 'Edit failed', errorType: 'api' });
    }
  }

  /**
   * Apply edit operations to code
   */
  private applyEdits(
    code: string,
    edits: EditOperation[]
  ): { success: boolean; result?: string; error?: string; enrichedEdits?: EditOperation[] } {
    let result = code;
    const enrichedEdits: EditOperation[] = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      const { old_string, new_string, description } = edit;

      // Strategy 1: Exact match
      if (result.includes(old_string)) {
        const matches = result.split(old_string).length - 1;
        if (matches > 1) {
          return {
            success: false,
            result: code,
            error: `Edit ${i + 1} failed: Found ${matches} matches. The edit target is ambiguous.`,
          };
        }

        const lineNumber = this.getLineNumber(result, old_string);
        result = result.replace(old_string, new_string);
        enrichedEdits.push({ description, old_string, new_string, lineNumber });
        continue;
      }

      // Strategy 2: Whitespace-normalized fuzzy match
      const fuzzyResult = this.fuzzyFindAndReplace(result, old_string, new_string);
      if (fuzzyResult) {

        const lineNumber = this.getLineNumber(result, fuzzyResult.matchedOriginal);
        result = fuzzyResult.result;
        enrichedEdits.push({ description: `${description} (fuzzy matched)`, old_string: fuzzyResult.matchedOriginal, new_string, lineNumber });
        continue;
      }

      // Both strategies failed
      return {
        success: false,
        result: code,
        error: `Edit ${i + 1} failed: Could not find the specified text (exact and fuzzy match both failed)`,
      };
    }

    return { success: true, result, enrichedEdits };
  }

  /**
   * Fuzzy find-and-replace: normalizes whitespace in both the haystack and needle,
   * finds the match in normalized space, maps back to original positions, and replaces.
   */
  private fuzzyFindAndReplace(
    code: string,
    oldString: string,
    newString: string
  ): { result: string; matchedOriginal: string } | null {
    // Build a mapping from normalized-index → original-index
    // Normalization: collapse all runs of whitespace (spaces, tabs, newlines) to a single space, then trim
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

    const normalizedOld = normalize(oldString);
    if (!normalizedOld) return null;

    // Build normalized version of code with index mapping
    const normalizedChars: string[] = [];
    const indexMap: number[] = []; // normalizedChars[i] came from code[indexMap[i]]
    let prevWasSpace = false;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (/\s/.test(ch)) {
        if (!prevWasSpace && normalizedChars.length > 0) {
          normalizedChars.push(' ');
          indexMap.push(i);
        }
        prevWasSpace = true;
      } else {
        normalizedChars.push(ch);
        indexMap.push(i);
        prevWasSpace = false;
      }
    }

    const normalizedCode = normalizedChars.join('');
    const matchIndex = normalizedCode.indexOf(normalizedOld);
    if (matchIndex === -1) return null;

    // Check for ambiguity
    const secondMatch = normalizedCode.indexOf(normalizedOld, matchIndex + normalizedOld.length);
    if (secondMatch !== -1) return null; // Ambiguous — multiple matches

    // Map back to original code positions
    const originalStart = indexMap[matchIndex];
    const normalizedEnd = matchIndex + normalizedOld.length - 1;
    const originalEnd = indexMap[normalizedEnd];

    // Extract the original text that was matched (preserving original whitespace)
    const matchedOriginal = code.substring(originalStart, originalEnd + 1);

    // Replace in original code
    const result = code.substring(0, originalStart) + newString + code.substring(originalEnd + 1);

    return { result, matchedOriginal };
  }

  private getLineNumber(code: string, searchString: string): number {
    const index = code.indexOf(searchString);
    if (index === -1) return -1;
    return code.substring(0, index).split('\n').length;
  }

  /**
   * Finalize generation with validation and completion event.
   * Runs Babel syntax check — if it fails, auto-retries with AI error correction
   * up to MAX_SYNTAX_RETRIES times within the same SSE stream.
   */
  private async finalizeGeneration(
    sendSSE: SSEWriter,
    code: string,
    detectedSkills: string[],
    editType: string | null = null,
    duration: number | null = null,
    _syntaxRetryContext?: { apiKey: string; model: string; prompt: string; attempt: number; baseSystemPrompt?: string }
  ): Promise<void> {
    const MAX_SYNTAX_RETRIES = 2;

    let cleanedCode = stripMarkdownFences(code);
    cleanedCode = extractComponentCode(cleanedCode);

    sendSSE({ type: 'stage', stage: 'validating', message: 'Validating code...' });

    // Step 1: Regex-based heuristic validation (auto-fixes common issues)
    const validation = validateCode(cleanedCode);
    if (validation.fixedCode) {
      cleanedCode = validation.fixedCode;
    }

    // Step 2: Babel syntax check (~1-2ms) — catches ALL syntax errors
    const syntaxResult = transpileCheck(cleanedCode);

    if (!syntaxResult.valid && _syntaxRetryContext) {
      const { apiKey, model, prompt, attempt } = _syntaxRetryContext;

      if (attempt < MAX_SYNTAX_RETRIES) {
        console.log(`[MotionGraphicsService] Babel check failed (attempt ${attempt + 1}/${MAX_SYNTAX_RETRIES}), auto-retrying with AI fix...`);
        sendSSE({ type: 'stage', stage: 'regenerating', message: `Fixing syntax error (attempt ${attempt + 1})...` });

        // Re-generate with the error context — the AI will fix the specific syntax issue
        try {
          await this.handleFollowUpEdit(sendSSE, apiKey, {
            prompt,
            model,
            currentCode: cleanedCode,
            conversationHistory: [],
            detectedSkills,
            errorCorrection: {
              error: syntaxResult.error!,
              attemptNumber: attempt + 1,
              maxAttempts: MAX_SYNTAX_RETRIES,
            },
            baseSystemPrompt: _syntaxRetryContext.baseSystemPrompt,
          });
          // handleFollowUpEdit calls finalizeGeneration internally with the fixed code,
          // so we return here — the recursive call handles completion.
          return;
        } catch (retryError) {
          console.error('[MotionGraphicsService] Syntax retry failed:', retryError);
          // Fall through to send what we have
        }
      } else {
        console.warn(`[MotionGraphicsService] Max syntax retries (${MAX_SYNTAX_RETRIES}) reached. Sending code with syntax errors.`);
        validation.errors.push(`Babel syntax check: ${syntaxResult.error}`);
      }
    } else if (!syntaxResult.valid) {
      // No retry context available — just report the error
      console.warn('[MotionGraphicsService] Babel check failed (no retry context):', syntaxResult.error);
      validation.errors.push(`Babel syntax check: ${syntaxResult.error}`);
    }

    const iconResult = extractAndEnsureIcons(cleanedCode);
    const usedIcons = iconResult.icons;
    cleanedCode = iconResult.code;

    sendSSE({
      type: 'validation',
      result: {
        isValid: validation.isValid && syntaxResult.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    });

    sendSSE({
      type: 'complete',
      code: cleanedCode,
      skills: detectedSkills,
      editType,
      metadata: {
        usedIcons,
        duration,
        corrections: validation.corrections,
      },
    });

    sendSSE({ type: 'done' });
  }
}

/** Singleton instance */
export const motionGraphicsService = new MotionGraphicsService();
