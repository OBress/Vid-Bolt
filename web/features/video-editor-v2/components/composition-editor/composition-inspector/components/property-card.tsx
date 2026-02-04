/**
 * PropertyCard - Collapsible card for property groups
 * 
 * After Effects style property card with:
 * - Collapsible header with icon and title
 * - Optional reset button
 * - Smooth collapse animation
 * - Card-based visual design
 */

import React, { useState } from 'react';
import { cn } from '../../../../utils/general/utils';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../ui/collapsible';

// ==========================================
// TYPES
// ==========================================

interface PropertyCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onReset?: () => void;
  className?: string;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const PropertyCard: React.FC<PropertyCardProps> = ({
  title,
  icon,
  children,
  defaultOpen = true,
  onReset,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Card Header */}
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2.5 cursor-pointer",
            "hover:bg-accent/50 transition-colors border-b border-border",
            "group"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Chevron */}
            <div className="text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>

            {/* Icon */}
            <div className="text-muted-foreground shrink-0">
              {icon}
            </div>

            {/* Title */}
            <h3 className="text-sm font-semibold truncate">
              {title}
            </h3>
          </div>

          {/* Reset Button */}
          {onReset && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              title="Reset to default"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CollapsibleTrigger>

      {/* Card Content */}
      <CollapsibleContent>
        <div className="p-3 space-y-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default PropertyCard;
