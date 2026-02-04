
import React from 'react';
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../../../ui/context-menu';
import { Copy, Scissors, Trash2, Link, Unlink } from 'lucide-react';


interface TimelineItemContextMenuProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSplit?: () => void; // Add split handler
  onDuplicateItems?: (itemIds: string[]) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void; // Add split items handler
  isSelected?: boolean;
  selectedItemIds?: string[];
  duplicateText: string;
  deleteText: string;
  showSplit?: boolean; // Whether to show the split option (only for single items)
  // Link/Unlink props
  canLink?: boolean; // Whether items can be linked (2+ items selected)
  canUnlink?: boolean; // Whether items can be unlinked (selected items are linked)
  onLink?: () => void;
  onUnlink?: () => void;
}

export const TimelineItemContextMenu: React.FC<TimelineItemContextMenuProps> = ({
  onDuplicate,
  onDelete,
  onSplit,
  onDuplicateItems,
  onDeleteItems,
  onSplitItems,
  duplicateText,
  deleteText,
  showSplit = false,
  canLink = false,
  canUnlink = false,
  onLink,
  onUnlink,
}) => {
  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem 
        onClick={onDuplicate} 
        disabled={!onDuplicateItems}
      >
        <Copy className="mr-2 h-4 w-4" />
        <span>{duplicateText}</span>
      </ContextMenuItem>
      
      {showSplit && onSplit && onSplitItems && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onSplit}>
            <Scissors className="mr-2 h-4 w-4" />
            <span>Split at playhead</span>
          </ContextMenuItem>
        </>
      )}
      
      {/* Link/Unlink options */}
      {(canLink || canUnlink) && (
        <>
          <ContextMenuSeparator />
          {canLink && onLink && (
            <ContextMenuItem onClick={onLink}>
              <Link className="mr-2 h-4 w-4" />
              <span>Link items</span>
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+L</span>
            </ContextMenuItem>
          )}
          {canUnlink && onUnlink && (
            <ContextMenuItem onClick={onUnlink}>
              <Unlink className="mr-2 h-4 w-4" />
              <span>Unlink items</span>
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+L</span>
            </ContextMenuItem>
          )}
        </>
      )}
      
      <ContextMenuSeparator />
      <ContextMenuItem 
        onClick={onDelete} 
        disabled={!onDeleteItems}
        className="text-red-600 focus:text-red-600"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        <span>{deleteText}</span>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}; 