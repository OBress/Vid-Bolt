"use client";

/**
 * JSON Tree Viewer
 * ============================================================================
 * Collapsible, syntax-highlighted JSON tree component with copy functionality.
 * Used throughout the Pipeline Debugger for inspecting step data.
 */

import { useState, useCallback, useMemo } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

interface JsonTreeViewerProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  maxDepth?: number;
  className?: string;
}

export function JsonTreeViewer({
  data,
  label,
  defaultExpanded = true,
  maxDepth = 6,
  className = "",
}: JsonTreeViewerProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopy = useCallback((value: unknown, path: string) => {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }, []);

  if (data === undefined || data === null) {
    return (
      <div className={`font-mono text-sm text-neutral-500 ${className}`}>
        {label && <span className="text-neutral-400">{label}: </span>}
        <span className="text-neutral-600 italic">null</span>
      </div>
    );
  }

  return (
    <div className={`font-mono text-sm ${className}`}>
      <JsonNode
        data={data}
        label={label}
        path={label || "root"}
        depth={0}
        maxDepth={maxDepth}
        defaultExpanded={defaultExpanded}
        copiedPath={copiedPath}
        onCopy={handleCopy}
      />
    </div>
  );
}

// ============================================================================
// JSON NODE (RECURSIVE)
// ============================================================================

interface JsonNodeProps {
  data: unknown;
  label?: string;
  path: string;
  depth: number;
  maxDepth: number;
  defaultExpanded: boolean;
  copiedPath: string | null;
  onCopy: (value: unknown, path: string) => void;
}

function JsonNode({
  data,
  label,
  path,
  depth,
  maxDepth,
  defaultExpanded,
  copiedPath,
  onCopy,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < (defaultExpanded ? 2 : 0));

  const isObject = typeof data === "object" && data !== null && !Array.isArray(data);
  const isArray = Array.isArray(data);
  const isExpandable = isObject || isArray;

  const entries = useMemo(() => {
    if (isArray) return (data as unknown[]).map((v, i) => [String(i), v] as [string, unknown]);
    if (isObject) return Object.entries(data as Record<string, unknown>);
    return [];
  }, [data, isArray, isObject]);

  const isCopied = copiedPath === path;

  // Leaf node
  if (!isExpandable) {
    return (
      <div className="flex items-center gap-1 group py-0.5">
        <span className="w-4" />
        {label !== undefined && (
          <span className="text-blue-400">&quot;{label}&quot;: </span>
        )}
        <ValueDisplay value={data} />
        <button
          onClick={() => onCopy(data, path)}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
          title="Copy value"
        >
          {isCopied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-neutral-600 hover:text-neutral-400" />
          )}
        </button>
      </div>
    );
  }

  // Collapsed preview
  if (depth >= maxDepth && !expanded) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <button onClick={() => setExpanded(true)} className="w-4">
          <ChevronRight className="w-3 h-3 text-neutral-600" />
        </button>
        {label !== undefined && (
          <span className="text-blue-400">&quot;{label}&quot;: </span>
        )}
        <span className="text-neutral-500">
          {isArray ? `Array(${entries.length})` : `Object(${entries.length} keys)`}
        </span>
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <button className="w-4 flex-shrink-0">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-neutral-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-neutral-500" />
          )}
        </button>
        {label !== undefined && (
          <span className="text-blue-400">&quot;{label}&quot;: </span>
        )}
        <span className="text-neutral-500">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy(data, path);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
          title="Copy object"
        >
          {isCopied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3 text-neutral-600 hover:text-neutral-400" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="ml-4 border-l border-neutral-800 pl-2">
          {entries.map(([key, value]) => (
            <JsonNode
              key={key}
              data={value}
              label={key}
              path={`${path}.${key}`}
              depth={depth + 1}
              maxDepth={maxDepth}
              defaultExpanded={defaultExpanded}
              copiedPath={copiedPath}
              onCopy={onCopy}
            />
          ))}
          {entries.length === 0 && (
            <span className="text-neutral-600 italic ml-4">
              {isArray ? "empty array" : "empty object"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VALUE DISPLAY
// ============================================================================

function ValueDisplay({ value }: { value: unknown }) {
  if (value === null) return <span className="text-neutral-600 italic">null</span>;
  if (value === undefined) return <span className="text-neutral-600 italic">undefined</span>;
  if (typeof value === "boolean") return <span className="text-yellow-400">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-green-400">{value}</span>;
  if (typeof value === "string") {
    // Truncate long strings
    const display = value.length > 200 ? `${value.substring(0, 200)}…` : value;
    // Check if it's a URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return (
        <span className="text-cyan-400 underline hover:text-cyan-300">
          &quot;{display}&quot;
        </span>
      );
    }
    return <span className="text-orange-300">&quot;{display}&quot;</span>;
  }
  return <span className="text-neutral-400">{String(value)}</span>;
}
