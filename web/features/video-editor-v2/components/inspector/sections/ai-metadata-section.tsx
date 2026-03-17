/**
 * AI Metadata Section - Read-only display of generation metadata
 * Shows prompts, LoRAs, settings, and reference images used to create each clip.
 * For audio clips, shows transcript data with per-chunk breakdown.
 * For stock media, shows search query and source info.
 */

import React, { useCallback } from "react";
import { cn } from "../../../utils/general/utils";
import type { TimelineClip } from "../../../types/timeline-v2";
import { OverlayType } from "../../../types";
import { ScrollArea } from "../../ui/scroll-area";
import {
  Bot,
  Copy,
  Check,
  Image as ImageIcon,
  Video,
  Sparkles,
  Search,
  Music,
  Wand2,
  Settings2,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "../../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

// ==========================================
// COPY BUTTON COMPONENT
// ==========================================

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = "Copy" }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white/40 hover:text-white/80"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-400" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-[10px]">
          {copied ? "Copied!" : label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ==========================================
// INFO ROW COMPONENT
// ==========================================

const InfoRow: React.FC<{
  label: string;
  value: string | number | null | undefined;
  copyable?: boolean;
  mono?: boolean;
  className?: string;
}> = ({ label, value, copyable = false, mono = false, className }) => {
  if (value === null || value === undefined || value === "") return null;

  return (
    <div className={cn("flex items-start gap-2 py-1", className)}>
      <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold min-w-[60px] shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          "text-xs text-white/70 flex-1 break-words leading-relaxed",
          mono && "font-mono text-[11px]"
        )}
      >
        {String(value)}
      </span>
      {copyable && <CopyButton text={String(value)} label={`Copy ${label}`} />}
    </div>
  );
};

// ==========================================
// CARD WRAPPER
// ==========================================

const MetadataCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, children, className }) => (
  <div className={cn("bg-black/20 rounded-xl border border-white/5 overflow-hidden", className)}>
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
      <div className="text-primary">{icon}</div>
      <span className="text-sm font-medium text-white/90">{title}</span>
    </div>
    <div className="p-3 space-y-1">{children}</div>
  </div>
);

// ==========================================
// AI GENERATED MEDIA SECTION
// ==========================================

const AiGeneratedSection: React.FC<{ clip: TimelineClip }> = ({ clip }) => {
  const data = clip.data || {};
  const visualPrompt = data.visualPrompt || data.visual_prompt;
  const text = data.text;
  const contentType = data.contentType || data.content_type;
  const shotIndex = data.shotIndex ?? data.shot_index;
  const mediaType = clip.type === "video" ? "Video" : clip.type === "image" ? "Image" : clip.type;

  // Generation settings that may be embedded
  const generation = data.generation || {};
  const loraName = generation.loraName || data.loraName;
  const loraStrength = generation.loraStrength || data.loraStrength;
  const model = generation.model || data.model;
  const aspectRatio = generation.aspectRatio || data.aspectRatio;
  const steps = generation.steps || data.steps;
  const guidanceScale = generation.guidanceScale || data.guidanceScale;
  const seed = generation.seed || data.seed;
  const fps = generation.fps || data.fps;
  const negativePrompt = generation.negativePrompt || data.negativePrompt;
  const referenceImages = generation.referenceImages || data.referenceImages;

  // No data at all
  if (!visualPrompt && !text && !loraName && !model) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Prompt Card */}
      {(visualPrompt || text) && (
        <MetadataCard
          title="Generation Prompt"
          icon={<Sparkles className="h-4 w-4" />}
        >
          {visualPrompt && (
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
                  {visualPrompt}
                </p>
                <CopyButton text={visualPrompt} label="Copy prompt" />
              </div>
            </div>
          )}
          {text && text !== visualPrompt && (
            <InfoRow label="Script" value={text} copyable />
          )}
          {negativePrompt && (
            <InfoRow label="Negative" value={negativePrompt} copyable />
          )}
        </MetadataCard>
      )}

      {/* Settings Card */}
      {(loraName || model || aspectRatio || steps || seed) && (
        <MetadataCard
          title="Generation Settings"
          icon={<Settings2 className="h-4 w-4" />}
        >
          <InfoRow label="Model" value={model} />
          {loraName && (
            <InfoRow
              label="LoRA"
              value={loraStrength ? `${loraName} (${loraStrength})` : loraName}
            />
          )}
          <InfoRow label="Aspect" value={aspectRatio} />
          <InfoRow label="Steps" value={steps} mono />
          <InfoRow label="CFG" value={guidanceScale} mono />
          <InfoRow label="Seed" value={seed} mono />
          {fps && <InfoRow label="FPS" value={fps} mono />}
        </MetadataCard>
      )}

      {/* Reference Images Card */}
      {referenceImages && referenceImages.length > 0 && (
        <MetadataCard
          title="Reference Images"
          icon={<ImageIcon className="h-4 w-4" />}
        >
          <div className="grid grid-cols-2 gap-2">
            {referenceImages.map((url: string, i: number) => (
              <div
                key={i}
                className="aspect-video rounded-md overflow-hidden border border-white/10"
              >
                <img
                  src={url}
                  alt={`Reference ${i + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </MetadataCard>
      )}

      {/* Clip Info Card */}
      <MetadataCard
        title="Clip Info"
        icon={<Layers className="h-4 w-4" />}
      >
        <InfoRow label="Type" value={mediaType} />
        {shotIndex != null && <InfoRow label="Shot" value={`#${shotIndex}`} />}
        {contentType && <InfoRow label="Content" value={contentType} />}
        <InfoRow label="Duration" value={`${clip.duration.toFixed(2)}s`} mono />
      </MetadataCard>
    </div>
  );
};

// ==========================================
// STOCK MEDIA SECTION
// ==========================================

const StockMediaSection: React.FC<{ clip: TimelineClip }> = ({ clip }) => {
  const data = clip.data || {};
  const stock = data.stock || {};

  const searchQuery = stock.query || data.searchQuery;
  const source = stock.source || data.source;
  const attribution = stock.attribution || data.attribution;
  const originalUrl = stock.originalUrl || data.originalUrl;

  if (!searchQuery && !source) return null;

  return (
    <MetadataCard
      title="Stock Media Info"
      icon={<Search className="h-4 w-4" />}
    >
      <InfoRow label="Query" value={searchQuery} copyable />
      <InfoRow label="Source" value={source} />
      {attribution && <InfoRow label="Credit" value={attribution} />}
      {originalUrl && (
        <InfoRow label="URL" value={originalUrl} copyable />
      )}
    </MetadataCard>
  );
};

// ==========================================
// MOTION GRAPHICS SECTION
// ==========================================

const MotionGraphicsMetadata: React.FC<{ clip: TimelineClip }> = ({ clip }) => {
  const template = clip.properties?.template;
  const compositionDefinition = clip.properties?.compositionDefinition;
  const data = clip.data || {};

  return (
    <div className="space-y-3">
      {template && (
        <MetadataCard
          title="Motion Graphics Template"
          icon={<Wand2 className="h-4 w-4" />}
        >
          <InfoRow label="Name" value={template.name} />
          <InfoRow label="Category" value={template.category} />
          {template.description && (
            <InfoRow label="Desc" value={template.description} />
          )}
        </MetadataCard>
      )}

      {data.visualPrompt && (
        <MetadataCard
          title="Generation Prompt"
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
              {data.visualPrompt}
            </p>
            <CopyButton text={data.visualPrompt} label="Copy prompt" />
          </div>
        </MetadataCard>
      )}

      {compositionDefinition && (
        <MetadataCard
          title="Composition"
          icon={<Layers className="h-4 w-4" />}
        >
          <InfoRow label="Name" value={compositionDefinition.name} />
          <InfoRow
            label="Size"
            value={`${compositionDefinition.width}×${compositionDefinition.height}`}
          />
          <InfoRow label="FPS" value={compositionDefinition.fps} mono />
          <InfoRow
            label="Layers"
            value={compositionDefinition.layers?.length || 0}
            mono
          />
        </MetadataCard>
      )}
    </div>
  );
};

// ==========================================
// EMPTY STATE
// ==========================================

const EmptyAiState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
      <Bot className="w-6 h-6 text-white/30" />
    </div>
    <h3 className="text-sm font-medium text-white/60 mb-1">No AI Data</h3>
    <p className="text-xs text-white/40 max-w-[200px] leading-relaxed">
      No generation metadata available for this clip. AI data is populated when clips are created through the pipeline.
    </p>
  </div>
);

// ==========================================
// MAIN COMPONENT
// ==========================================

interface AiMetadataSectionProps {
  clip: TimelineClip;
}

export const AiMetadataSection: React.FC<AiMetadataSectionProps> = ({ clip }) => {
  const data = clip.data || {};
  const clipType = clip.type;

  // Determine what kind of metadata to show
  const isMotionGraphics = clipType === "motion-graphics";
  const isStockMedia = !!(data.stock || data.searchQuery || data.source);
  const isAiGenerated =
    !!(data.visualPrompt || data.visual_prompt || data.generation || data.loraName || data.model);

  // Show appropriate section based on clip type
  if (isMotionGraphics) {
    return (
      <ScrollArea className="h-full inspector-scrollbar">
        <div className="p-3">
          <MotionGraphicsMetadata clip={clip} />
        </div>
      </ScrollArea>
    );
  }

  if (isStockMedia) {
    return (
      <ScrollArea className="h-full inspector-scrollbar">
        <div className="p-3 space-y-3">
          <StockMediaSection clip={clip} />
          {isAiGenerated && <AiGeneratedSection clip={clip} />}
        </div>
      </ScrollArea>
    );
  }

  if (isAiGenerated) {
    return (
      <ScrollArea className="h-full inspector-scrollbar">
        <div className="p-3">
          <AiGeneratedSection clip={clip} />
        </div>
      </ScrollArea>
    );
  }

  // Fallback: show whatever data we have, or empty state
  if (data.visualPrompt || data.text || data.shotIndex != null) {
    return (
      <ScrollArea className="h-full inspector-scrollbar">
        <div className="p-3">
          <AiGeneratedSection clip={clip} />
        </div>
      </ScrollArea>
    );
  }

  return <EmptyAiState />;
};

export default AiMetadataSection;
