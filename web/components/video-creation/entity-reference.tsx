"use client";

import React, { useMemo, useState } from "react";
import { EntityBadge, type EntityType } from "./entity-badge";
import { Image as ImageIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EntityInfo {
  name: string;
  image?: string;
}

interface StockMediaInfo {
  id: string;
  url: string;
  thumbnailUrl: string;
  description?: string;
}

interface EntityLookup {
  characters: Map<string, EntityInfo>;
  locations: Map<string, EntityInfo>;
  objects: Map<string, EntityInfo>;
  stockMedia?: Map<string, StockMediaInfo>;
}

interface EntityReferenceProps {
  text: string;
  entities: EntityLookup;
  className?: string;
  /** Optional: Stock media lookup by ID for @(StockMedia:id) refs */
  stockMediaLookup?: Map<string, StockMediaInfo>;
}

// Regex to match @(EntityName) pattern - including StockMedia:id
const ENTITY_PATTERN = /@\(([^)]+)\)/g;
// Specific pattern for stock media: @(StockMedia:abc123)
const STOCK_MEDIA_PREFIX = "StockMedia:";

/**
 * Stock Media Badge component with image preview on hover
 */
function StockMediaBadge({ id, info }: { id: string; info?: StockMediaInfo }) {
  const thumbnailUrl = info?.thumbnailUrl || info?.url;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-pointer hover:bg-blue-500/30 transition-colors mx-0.5">
            <ImageIcon className="w-3 h-3" />
            <span className="truncate max-w-[80px]">
              {info?.description || `Stock ${id.slice(0, 6)}`}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 overflow-hidden">
          {thumbnailUrl ? (
            <div className="flex flex-col">
              <img
                src={thumbnailUrl}
                alt={info?.description || "Stock media"}
                className="max-w-[200px] max-h-[150px] object-cover"
              />
              {info?.description && (
                <p className="text-xs px-2 py-1 bg-background/80 text-muted-foreground truncate max-w-[200px]">
                  {info.description}
                </p>
              )}
            </div>
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Stock media ID: {id}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Parses text containing @(EntityName) and @(StockMedia:id) syntax
 * and renders inline entity/stock media badges.
 * Falls back to plain text if entity is not found in lookup.
 */
export function EntityReference({
  text,
  entities,
  className,
  stockMediaLookup,
}: EntityReferenceProps) {
  const parsedContent = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIndex = 0;

    // Create a case-insensitive name lookup for entities
    const nameLookup = new Map<
      string,
      { type: EntityType; info: EntityInfo }
    >();

    entities.characters.forEach((info, name) => {
      nameLookup.set(name.toLowerCase(), { type: "character", info });
    });
    entities.locations.forEach((info, name) => {
      nameLookup.set(name.toLowerCase(), { type: "location", info });
    });
    entities.objects.forEach((info, name) => {
      nameLookup.set(name.toLowerCase(), { type: "object", info });
    });

    // Merge stockMedia from entities and stockMediaLookup
    const stockMedia = new Map<string, StockMediaInfo>();
    entities.stockMedia?.forEach((info, id) => stockMedia.set(id, info));
    stockMediaLookup?.forEach((info, id) => stockMedia.set(id, info));

    // Reset regex state
    ENTITY_PATTERN.lastIndex = 0;

    while ((match = ENTITY_PATTERN.exec(text)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const entityContent = match[1];

      // Check if it's a stock media reference
      if (entityContent.startsWith(STOCK_MEDIA_PREFIX)) {
        const stockMediaId = entityContent.slice(STOCK_MEDIA_PREFIX.length);
        const stockMediaInfo = stockMedia.get(stockMediaId);

        parts.push(
          <StockMediaBadge
            key={`stockmedia-${keyIndex++}`}
            id={stockMediaId}
            info={stockMediaInfo}
          />,
        );
      } else {
        // Regular entity reference
        const lookupKey = entityContent.toLowerCase();
        const entityData = nameLookup.get(lookupKey);

        if (entityData) {
          // Found entity - render badge
          parts.push(
            <EntityBadge
              key={`entity-${keyIndex++}`}
              type={entityData.type}
              name={entityContent}
              image={entityData.info.image}
            />,
          );
        } else {
          // Entity not found - render as plain text without the @() wrapper
          parts.push(entityContent);
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }, [text, entities, stockMediaLookup]);

  return <span className={className}>{parsedContent}</span>;
}

/**
 * Creates an EntityLookup from outline assets.
 */
export function createEntityLookup(outlineAssets?: {
  characters?: Array<{ id: string; name: string; image?: string }>;
  locations?: Array<{ id: string; name: string; image?: string }>;
  objects?: Array<{ id: string; name: string; image?: string }>;
}): EntityLookup {
  const characters = new Map<string, EntityInfo>();
  const locations = new Map<string, EntityInfo>();
  const objects = new Map<string, EntityInfo>();

  outlineAssets?.characters?.forEach((c) => {
    characters.set(c.name, { name: c.name, image: c.image });
  });
  outlineAssets?.locations?.forEach((l) => {
    locations.set(l.name, { name: l.name, image: l.image });
  });
  outlineAssets?.objects?.forEach((o) => {
    objects.set(o.name, { name: o.name, image: o.image });
  });

  return { characters, locations, objects };
}

/**
 * Creates a stock media lookup from shot stock_media_ref/stock_media_refs data.
 */
export function createStockMediaLookup(
  shots?: Array<{
    stock_media_ref?: {
      id: string;
      url: string;
      thumbnailUrl: string;
      description: string;
    };
    stock_media_refs?: Array<{
      id: string;
      url: string;
      thumbnailUrl: string;
      description: string;
    }>;
  }>,
): Map<string, StockMediaInfo> {
  const lookup = new Map<string, StockMediaInfo>();

  shots?.forEach((shot) => {
    // Handle single ref (backwards compatibility)
    if (shot.stock_media_ref) {
      lookup.set(shot.stock_media_ref.id, {
        id: shot.stock_media_ref.id,
        url: shot.stock_media_ref.url,
        thumbnailUrl: shot.stock_media_ref.thumbnailUrl,
        description: shot.stock_media_ref.description,
      });
    }
    // Handle multiple refs (multi-image shots)
    shot.stock_media_refs?.forEach((ref) => {
      lookup.set(ref.id, {
        id: ref.id,
        url: ref.url,
        thumbnailUrl: ref.thumbnailUrl,
        description: ref.description,
      });
    });
  });

  return lookup;
}
