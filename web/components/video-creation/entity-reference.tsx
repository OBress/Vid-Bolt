"use client";

import React, { useMemo } from "react";
import { EntityBadge, type EntityType } from "./entity-badge";

interface EntityInfo {
  name: string;
  image?: string;
}

interface EntityLookup {
  characters: Map<string, EntityInfo>;
  locations: Map<string, EntityInfo>;
  objects: Map<string, EntityInfo>;
}

interface EntityReferenceProps {
  text: string;
  entities: EntityLookup;
  className?: string;
}

// Regex to match @(EntityName) pattern
const ENTITY_PATTERN = /@\(([^)]+)\)/g;

/**
 * Parses text containing @(EntityName) syntax and renders inline entity badges.
 * Falls back to plain text if entity is not found in lookup.
 */
export function EntityReference({
  text,
  entities,
  className,
}: EntityReferenceProps) {
  const parsedContent = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyIndex = 0;

    // Create a case-insensitive name lookup
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

    // Reset regex state
    ENTITY_PATTERN.lastIndex = 0;

    while ((match = ENTITY_PATTERN.exec(text)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const entityName = match[1];
      const lookupKey = entityName.toLowerCase();
      const entityData = nameLookup.get(lookupKey);

      if (entityData) {
        // Found entity - render badge
        parts.push(
          <EntityBadge
            key={`entity-${keyIndex++}`}
            type={entityData.type}
            name={entityName}
            image={entityData.info.image}
          />,
        );
      } else {
        // Entity not found - render as plain text without the @() wrapper
        parts.push(entityName);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }, [text, entities]);

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
