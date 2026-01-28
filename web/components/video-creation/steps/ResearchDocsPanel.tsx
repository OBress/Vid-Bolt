"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  TrendingUp,
  CheckCircle,
  Quote,
  Users,
  Clock,
  BookOpen,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface ResearchDocsPanelProps {
  dossier: {
    metadata?: {
      topic?: string;
      factCount?: number;
      quoteCount?: number;
      overallConfidence?: number;
    };
    facts?: Array<{
      id: string;
      statement: string;
      confidence: string;
      sources?: Array<{ title: string; url?: string }>;
      primarySourceId?: string;
    }>;
    quotes?: Array<{
      id: string;
      quote: string;
      speaker: string;
      speakerTitle?: string;
      sourceId?: string;
    }>;
    entities?: Array<{
      type: string;
      name: string;
      role: string;
    }>;
    worksCited?: Array<{
      id?: string;
      title: string;
      url?: string;
      author?: string;
      reliabilityTier: number;
      excerpt?: string;
    }>;
    // V2 fields
    narrative?: {
      hook: string;
      summary: string;
      background: string;
      priorEvents: string[];
      keyTerms: Record<string, string>;
    };
    keyDevelopments?: Array<{
      id: string;
      timestamp: string;
      what: string;
      who: string[];
      significance: string;
      sourceIds: string[];
    }>;
    entitiesV2?: Array<{
      type: "person" | "location" | "organization";
      name: string;
      role: string;
      bio: string;
      quoteIds?: string[];
      actions?: string[];
    }>;
    timeline?: Array<{
      id?: string;
      date: string;
      description?: string;
      event?: string;
    }>;
    sourceDocuments?: Array<{
      id: string;
      url: string;
      title: string;
      content: string;
      reliabilityTier: number;
      author?: string;
      publicationDate?: string;
    }>;
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ResearchDocsPanel({ dossier }: ResearchDocsPanelProps) {
  // Count helpers
  const factsCount = dossier.facts?.length || 0;
  const quotesCount = dossier.quotes?.length || 0;
  const entitiesCount =
    (dossier.entitiesV2?.length || 0) || (dossier.entities?.length || 0);
  const timelineCount = dossier.timeline?.length || 0;
  const sourcesCount =
    (dossier.worksCited?.length || 0) +
    (dossier.sourceDocuments?.length || 0);
  const developmentsCount = dossier.keyDevelopments?.length || 0;

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="narrative" className="h-full flex flex-col">
        {/* Horizontal Sub-Tab Bar */}
        <TabsList className="bg-neutral-900 mb-4 w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger
            value="narrative"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <FileText className="w-3.5 h-3.5" />
            Narrative
          </TabsTrigger>
          <TabsTrigger
            value="developments"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Developments
            {developmentsCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {developmentsCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="facts"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Facts
            {factsCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {factsCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="quotes"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <Quote className="w-3.5 h-3.5" />
            Quotes
            {quotesCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {quotesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="entities"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <Users className="w-3.5 h-3.5" />
            Entities
            {entitiesCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {entitiesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <Clock className="w-3.5 h-3.5" />
            Timeline
            {timelineCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {timelineCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="sources"
            className="gap-1.5 text-xs data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Sources
            {sourcesCount > 0 && (
              <span className="text-[10px] bg-neutral-700 px-1.5 rounded">
                {sourcesCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* ============================================================ */}
          {/* NARRATIVE TAB */}
          {/* ============================================================ */}
          <TabsContent value="narrative" className="mt-0 space-y-4">
            {dossier.narrative ? (
              <div className="space-y-4">
                {/* Hook */}
                <div className="bg-neutral-800/50 rounded-lg p-4 border border-purple-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-purple-400 uppercase">
                      🎯 Hook
                    </span>
                  </div>
                  <p className="text-neutral-200">{dossier.narrative.hook}</p>
                </div>

                {/* Summary */}
                {dossier.narrative.summary && (
                  <div className="bg-neutral-800/50 rounded-lg p-4">
                    <span className="text-xs font-bold text-blue-400 uppercase mb-2 block">
                      📋 Summary
                    </span>
                    <p className="text-neutral-300 whitespace-pre-line">
                      {dossier.narrative.summary}
                    </p>
                  </div>
                )}

                {/* Background */}
                {dossier.narrative.background && (
                  <div className="bg-neutral-800/50 rounded-lg p-4">
                    <span className="text-xs font-bold text-green-400 uppercase mb-2 block">
                      📚 Background
                    </span>
                    <p className="text-neutral-300 whitespace-pre-line">
                      {dossier.narrative.background}
                    </p>
                  </div>
                )}

                {/* Prior Events */}
                {dossier.narrative.priorEvents &&
                  dossier.narrative.priorEvents.length > 0 && (
                    <div className="bg-neutral-800/50 rounded-lg p-4">
                      <span className="text-xs font-bold text-yellow-400 uppercase mb-2 block">
                        ⏮️ Prior Events
                      </span>
                      <ol className="list-decimal list-inside space-y-1 text-neutral-300">
                        {dossier.narrative.priorEvents.map(
                          (event: string, idx: number) => (
                            <li key={idx}>{event}</li>
                          )
                        )}
                      </ol>
                    </div>
                  )}

                {/* Key Terms */}
                {dossier.narrative.keyTerms &&
                  Object.keys(dossier.narrative.keyTerms).length > 0 && (
                    <div className="bg-neutral-800/50 rounded-lg p-4 border border-orange-500/30">
                      <span className="text-xs font-bold text-orange-400 uppercase mb-2 block">
                        📖 Key Terms
                      </span>
                      <dl className="space-y-2">
                        {Object.entries(
                          dossier.narrative.keyTerms as Record<string, string>
                        ).map(([term, definition]) => (
                          <div key={term}>
                            <dt className="text-white font-medium">{term}</dt>
                            <dd className="text-neutral-400 text-sm ml-4">
                              {definition}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
              </div>
            ) : (
              <EmptyState message="No narrative context available" />
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* KEY DEVELOPMENTS TAB */}
          {/* ============================================================ */}
          <TabsContent value="developments" className="mt-0 space-y-3">
            {dossier.keyDevelopments && dossier.keyDevelopments.length > 0 ? (
              dossier.keyDevelopments.map((dev, idx) => (
                <div
                  key={dev.id || idx}
                  className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-400">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      {/* Timestamp and Who */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {dev.timestamp && (
                          <span className="text-xs font-mono bg-neutral-700 px-1.5 py-0.5 rounded text-yellow-400">
                            {dev.timestamp}
                          </span>
                        )}
                        {dev.who?.length > 0 && (
                          <span className="text-xs text-blue-400">
                            {dev.who.join(", ")}
                          </span>
                        )}
                      </div>
                      {/* What happened */}
                      <p className="text-sm text-white font-medium mb-1">
                        {dev.what}
                      </p>
                      {/* Significance */}
                      {dev.significance && (
                        <p className="text-xs text-neutral-400">
                          <span className="text-green-400 font-medium">
                            Significance:
                          </span>{" "}
                          {dev.significance}
                        </p>
                      )}
                      {/* Source IDs */}
                      {dev.sourceIds?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {dev.sourceIds.map((sid: string) => (
                            <span
                              key={sid}
                              className="text-xs font-mono bg-neutral-700 px-1 py-0.5 rounded text-purple-400"
                            >
                              {sid}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState message="No key developments found" />
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* FACTS TAB */}
          {/* ============================================================ */}
          <TabsContent value="facts" className="mt-0 space-y-2">
            {dossier.facts && dossier.facts.length > 0 ? (
              <TooltipProvider>
                <div className="space-y-2">
                  {dossier.facts.map((fact) => {
                    const primarySource = fact.primarySourceId
                      ? dossier.sourceDocuments?.find(
                          (s) => s.id === fact.primarySourceId
                        ) ||
                        dossier.worksCited?.find(
                          (s) => s.id === fact.primarySourceId
                        )
                      : null;

                    return (
                      <Tooltip key={fact.id}>
                        <TooltipTrigger asChild>
                          <div className="p-3 bg-neutral-800/50 rounded-lg border border-neutral-700 cursor-help hover:bg-neutral-800 transition-colors">
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-neutral-500 shrink-0">
                                [{fact.id}]
                              </span>
                              <span className="text-sm text-neutral-200 flex-1">
                                {fact.statement}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  fact.confidence === "verified"
                                    ? "bg-green-500/20 text-green-400"
                                    : fact.confidence === "high"
                                      ? "bg-blue-500/20 text-blue-400"
                                      : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              >
                                {fact.confidence}
                              </span>
                              {fact.primarySourceId && (
                                <span className="text-blue-400 text-[10px] font-mono">
                                  [{fact.primarySourceId}]
                                </span>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        {primarySource && (
                          <TooltipContent
                            side="right"
                            className="max-w-md p-4 bg-neutral-900 border border-neutral-700"
                          >
                            <div className="space-y-2">
                              <div className="font-medium text-white">
                                {primarySource.title}
                              </div>
                              {"content" in primarySource &&
                                primarySource.content && (
                                  <p className="text-sm text-neutral-400 italic line-clamp-3">
                                    "{primarySource.content.substring(0, 200)}
                                    ..."
                                  </p>
                                )}
                              {"excerpt" in primarySource &&
                                primarySource.excerpt &&
                                !("content" in primarySource) && (
                                  <p className="text-sm text-neutral-400 italic line-clamp-3">
                                    "{primarySource.excerpt}"
                                  </p>
                                )}
                              <div className="flex items-center gap-2 text-xs pt-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded ${
                                    primarySource.reliabilityTier === 1
                                      ? "bg-green-500/20 text-green-400"
                                      : primarySource.reliabilityTier === 2
                                        ? "bg-blue-500/20 text-blue-400"
                                        : "bg-yellow-500/20 text-yellow-400"
                                  }`}
                                >
                                  Tier {primarySource.reliabilityTier}
                                </span>
                                {"url" in primarySource && primarySource.url && (
                                  <a
                                    href={primarySource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Open Source
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            ) : (
              <EmptyState message="No facts found" />
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* QUOTES TAB */}
          {/* ============================================================ */}
          <TabsContent value="quotes" className="mt-0 space-y-2">
            {dossier.quotes && dossier.quotes.length > 0 ? (
              dossier.quotes.map((quote, idx) => (
                <div
                  key={quote.id || idx}
                  className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700"
                >
                  <blockquote className="text-sm text-neutral-200 italic border-l-2 border-green-500 pl-3">
                    "{quote.quote}"
                  </blockquote>
                  <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
                    <span className="font-medium text-green-400">
                      {quote.speaker}
                    </span>
                    {quote.speakerTitle && (
                      <span className="text-neutral-500">
                        • {quote.speakerTitle}
                      </span>
                    )}
                    {quote.sourceId && (
                      <span className="text-neutral-500">[{quote.sourceId}]</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState message="No quotes found" />
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* ENTITIES TAB */}
          {/* ============================================================ */}
          <TabsContent value="entities" className="mt-0 space-y-3">
            {(() => {
              const entities = dossier.entitiesV2 || dossier.entities || [];
              if (entities.length > 0) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entities.map((entity: any, idx: number) => (
                      <div
                        key={entity.name || idx}
                        className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded uppercase ${
                              entity.type === "person"
                                ? "bg-blue-500/20 text-blue-400"
                                : entity.type === "organization"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : entity.type === "location"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {entity.type}
                          </span>
                        </div>
                        <p className="text-base font-medium text-white">
                          {entity.name}
                        </p>
                        <p className="text-sm text-neutral-400 mt-1">
                          {entity.role}
                        </p>
                        {entity.bio && (
                          <p className="text-sm text-neutral-300 mt-2 italic border-l-2 border-neutral-600 pl-3">
                            {entity.bio}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return <EmptyState message="No entities found" />;
            })()}
          </TabsContent>

          {/* ============================================================ */}
          {/* TIMELINE TAB */}
          {/* ============================================================ */}
          <TabsContent value="timeline" className="mt-0 space-y-2">
            {dossier.timeline && dossier.timeline.length > 0 ? (
              <div className="space-y-2">
                {dossier.timeline.map((event: any, idx: number) => (
                  <div
                    key={event.id || idx}
                    className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700 flex gap-4"
                  >
                    <div className="flex-shrink-0 w-24 text-sm font-mono text-orange-400">
                      {event.date}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-neutral-200">
                        {event.description || event.event}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No timeline events found" />
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* SOURCES TAB */}
          {/* ============================================================ */}
          <TabsContent value="sources" className="mt-0 space-y-2">
            {(() => {
              const sources = [
                ...(dossier.sourceDocuments || []),
                ...(dossier.worksCited || []),
              ];
              if (sources.length > 0) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sources.map((source: any, idx: number) => (
                      <div
                        key={source.id || idx}
                        className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700 flex gap-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs text-neutral-500">
                              [{source.id || `SRC-${idx + 1}`}]
                            </span>
                            {source.reliabilityTier && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  source.reliabilityTier === 1
                                    ? "bg-green-500/20 text-green-400"
                                    : source.reliabilityTier === 2
                                      ? "bg-blue-500/20 text-blue-400"
                                      : "bg-neutral-600 text-neutral-400"
                                }`}
                              >
                                Tier {source.reliabilityTier}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-neutral-200">
                            {source.title}
                          </p>
                          {source.author && (
                            <p className="text-xs text-neutral-400 mt-0.5">
                              by {source.author}
                            </p>
                          )}
                          {source.excerpt && (
                            <p className="text-xs text-neutral-500 mt-2 line-clamp-2">
                              {source.excerpt}
                            </p>
                          )}
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return <EmptyState message="No sources found" />;
            })()}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center text-neutral-500 py-12">
      <p>{message}</p>
    </div>
  );
}
