'use client';

import React, { useState, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ColorPaletteEditorProps {
  colors: string[];
  onChange: (colors: string[]) => void;
  maxColors?: number;
}

/**
 * Interactive color palette editor.
 * Displays hex color swatches with add/remove controls.
 */
export function ColorPaletteEditor({
  colors,
  onChange,
  maxColors = 8,
}: ColorPaletteEditorProps) {
  const [newColor, setNewColor] = useState('#');

  const addColor = useCallback(() => {
    const hex = newColor.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex) && !colors.includes(hex) && colors.length < maxColors) {
      onChange([...colors, hex]);
      setNewColor('#');
    }
  }, [newColor, colors, onChange, maxColors]);

  const removeColor = useCallback(
    (index: number) => {
      onChange(colors.filter((_, i) => i !== index));
    },
    [colors, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addColor();
    }
  };

  return (
    <div className="space-y-3">
      {/* Swatch grid */}
      <div className="flex flex-wrap gap-2">
        {colors.map((color, i) => (
          <div key={`${color}-${i}`} className="group relative">
            <div
              className="w-9 h-9 rounded-lg border border-neutral-700 shadow-sm cursor-pointer transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              title={color}
            />
            <button
              type="button"
              onClick={() => removeColor(i)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add color input */}
      {colors.length < maxColors && (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={newColor.length === 7 ? newColor : '#000000'}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-10 h-10 p-0.5 bg-transparent border-neutral-700 rounded-lg cursor-pointer"
          />
          <Input
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="#FF5733"
            className="bg-black/40 border-neutral-800 h-10 font-mono text-xs w-28"
            maxLength={7}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addColor}
            disabled={!/^#[0-9A-Fa-f]{6}$/.test(newColor.trim())}
            className="h-10 border-neutral-700"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {colors.length === 0 && (
        <p className="text-[10px] text-neutral-500 italic">
          No colors defined. The pipeline will use default palette choices.
        </p>
      )}
    </div>
  );
}
