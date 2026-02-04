import React from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../ui/collapsible";

interface AnimationSectionProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * AnimationSection displays a collapsible section of animations
 */
export const AnimationSection: React.FC<AnimationSectionProps> = ({
  title,
  count,
  isOpen,
  onToggle,
  children,
}) => {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onToggle}
      className="w-full"
    >
      <div className="rounded-lg overflow-hidden bg-neutral-800">
        <CollapsibleTrigger className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-neutral-700 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {title}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-700 text-muted-foreground">
              {count}
            </span>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 pt-0">
            <div className="grid grid-cols-4 gap-1.5">{children}</div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
