'use client';

/**
 * CanvasContextMenu — DOM portal for right-click context menu on canvas items
 *
 * When a user right-clicks a timeline item on the PixiJS canvas, the canvas emits
 * screen coordinates + item data. This component renders the existing
 * TimelineItemContextMenu as a positioned DOM overlay at those coordinates.
 *
 * Closes on:
 * - Outside click
 * - Escape key
 * - Menu action selection
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasContextMenuData } from './canvas-timeline-item';

// ============================================================
// TYPES
// ============================================================

export interface CanvasContextMenuProps {
  /** Menu data from canvas right-click, or null when hidden */
  data: CanvasContextMenuData | null;
  /** Close the context menu */
  onClose: () => void;
  /** Action callbacks */
  onDuplicate?: (itemIds: string[]) => void;
  onDelete?: (itemIds: string[]) => void;
  onSplit?: (itemId: string, splitTime: number) => void;
  onLink?: (itemIds: string[]) => void;
  onUnlink?: (itemIds: string[]) => void;
  /** Currently selected item IDs */
  selectedItemIds?: string[];
  /** Whether item is selected */
  isSelected?: boolean;
  /** Current playhead time for split */
  currentTime?: number;
  /** Whether the item can be split at current playhead */
  canSplit?: boolean;
  /** Whether selected items can be linked */
  canLink?: boolean;
  /** Whether selected items can be unlinked */
  canUnlink?: boolean;
}

// ============================================================
// COMPONENT
// ============================================================

export function CanvasContextMenu({
  data,
  onClose,
  onDuplicate,
  onDelete,
  onSplit,
  onLink,
  onUnlink,
  selectedItemIds = [],
  isSelected = false,
  currentTime = 0,
  canSplit = false,
  canLink = false,
  canUnlink = false,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!data) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Use setTimeout to avoid the right-click event itself closing the menu
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [data, onClose]);

  if (!data) return null;

  const itemId = data.item.id;
  const isMultiSelection = isSelected && selectedItemIds.length > 1;
  const targetIds = isMultiSelection ? selectedItemIds : [itemId];

  const handleDuplicate = () => {
    onDuplicate?.(targetIds);
    onClose();
  };

  const handleDelete = () => {
    onDelete?.(targetIds);
    onClose();
  };

  const handleSplit = () => {
    onSplit?.(itemId, currentTime);
    onClose();
  };

  const handleLink = () => {
    onLink?.(selectedItemIds);
    onClose();
  };

  const handleUnlink = () => {
    onUnlink?.(selectedItemIds);
    onClose();
  };

  // Position the menu at the click coordinates, keeping it within the viewport
  const menuWidth = 192; // w-48 = 12rem = 192px
  const menuHeight = 200; // Approximate height
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080;

  const left = Math.min(data.screenX, viewportW - menuWidth - 8);
  const top = Math.min(data.screenY, viewportH - menuHeight - 8);

  const duplicateText = isMultiSelection
    ? `Duplicate ${selectedItemIds.length} items`
    : 'Duplicate';
  const deleteText = isMultiSelection
    ? `Delete ${selectedItemIds.length} items`
    : 'Delete';

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999]"
      style={{ left, top }}
    >
      <div className="w-48 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
        {/* Duplicate */}
        <button
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
          onClick={handleDuplicate}
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {duplicateText}
        </button>

        {/* Split */}
        {canSplit && (
          <>
            <div className="my-1 h-px bg-neutral-700" />
            <button
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
              onClick={handleSplit}
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
              Split at playhead
            </button>
          </>
        )}

        {/* Link / Unlink */}
        {(canLink || canUnlink) && (
          <>
            <div className="my-1 h-px bg-neutral-700" />
            {canLink && (
              <button
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
                onClick={handleLink}
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Link items
                <span className="ml-auto text-xs text-neutral-500">Ctrl+L</span>
              </button>
            )}
            {canUnlink && (
              <button
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white"
                onClick={handleUnlink}
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
                  <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
                  <line x1="8" y1="2" x2="8" y2="5" /><line x1="2" y1="8" x2="5" y2="8" />
                  <line x1="16" y1="19" x2="16" y2="22" /><line x1="19" y1="16" x2="22" y2="16" />
                </svg>
                Unlink items
                <span className="ml-auto text-xs text-neutral-500">Ctrl+Shift+L</span>
              </button>
            )}
          </>
        )}

        {/* Delete */}
        <div className="my-1 h-px bg-neutral-700" />
        <button
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-red-500 hover:bg-neutral-800 hover:text-red-400"
          onClick={handleDelete}
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {deleteText}
        </button>
      </div>
    </div>,
    document.body,
  );
}
