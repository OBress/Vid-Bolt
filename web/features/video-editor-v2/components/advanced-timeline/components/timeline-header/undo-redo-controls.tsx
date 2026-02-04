import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { Button } from '../../../ui/button';

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  return (
    <div className="flex items-center gap-0.5 bg-neutral-800/60 rounded-md px-1 py-1">
      <Button
        onClick={onUndo}
        disabled={!canUndo}
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:bg-muted/50"
        title="Undo (Ctrl/Cmd + Z)"
        aria-label="Undo last action"
        onTouchStart={(e) => e.preventDefault()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Undo2 className="w-4 h-4 text-white" />
      </Button>
      
      <Button
        onClick={onRedo}
        disabled={!canRedo}
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:bg-muted/50"
        title="Redo (Ctrl/Cmd + Shift + Z)"
        aria-label="Redo last action"
        onTouchStart={(e) => e.preventDefault()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Redo2 className="w-4 h-4 text-white" />
      </Button>
    </div>
  );
}; 