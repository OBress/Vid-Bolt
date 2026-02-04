/**
 * InspectorSection - Unified collapsible section component for Inspector Panel
 * 
 * Provides consistent styling and behavior for all inspector sections.
 * Priority system ensures most-used options appear first.
 */

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../utils/general/utils";

export interface InspectorSectionProps {
  /** Section title */
  title: string;
  /** Whether section starts collapsed */
  defaultCollapsed?: boolean;
  /** Section content */
  children: React.ReactNode;
  /** Optional icon to display next to title */
  icon?: React.ReactNode;
  /** Priority level for ordering (lower = higher priority, appears first) */
  priority?: 'primary' | 'secondary' | 'tertiary';
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Collapsible section component with consistent styling
 */
export const InspectorSection: React.FC<InspectorSectionProps> = ({
  title,
  defaultCollapsed = false,
  children,
  icon,
  priority = 'secondary',
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Priority-based styling
  const priorityStyles = {
    primary: "border-l-2 border-l-primary/50",
    secondary: "border-l-2 border-l-border",
    tertiary: "border-l-2 border-l-transparent",
  };

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card/30",
      priorityStyles[priority],
      className
    )}>
      {/* Section Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5",
          "hover:bg-muted/30 transition-colors",
          "text-left group"
        )}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className={cn(
            "text-xs font-medium uppercase tracking-wide",
            priority === 'primary' ? "text-foreground" : "text-muted-foreground"
          )}>
            {title}
          </span>
        </div>
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Section Content */}
      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Property group within a section - for organizing related properties
 */
export interface PropertyGroupProps {
  /** Optional group label */
  label?: string;
  /** Group content */
  children: React.ReactNode;
  /** Optional className */
  className?: string;
}

export const PropertyGroup: React.FC<PropertyGroupProps> = ({
  label,
  children,
  className,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider pt-1">
          {label}
        </div>
      )}
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
};

/**
 * Property row - for individual property controls
 */
export interface PropertyRowProps {
  /** Property label */
  label: string;
  /** Control element */
  children: React.ReactNode;
  /** Optional tooltip */
  tooltip?: string;
  /** Whether to show in compact mode (label on same line as control) */
  compact?: boolean;
  /** Optional className */
  className?: string;
}

export const PropertyRow: React.FC<PropertyRowProps> = ({
  label,
  children,
  tooltip,
  compact = false,
  className,
}) => {
  if (compact) {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)} title={tooltip}>
        <label className="text-xs text-muted-foreground min-w-[60px]">
          {label}
        </label>
        <div className="flex-1">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)} title={tooltip}>
      <label className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
};

/**
 * Divider between property groups
 */
export const PropertyDivider: React.FC = () => {
  return <div className="border-t border-border/50 my-3" />;
};
