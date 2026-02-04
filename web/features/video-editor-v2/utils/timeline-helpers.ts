/**
 * Timeline Helper Utilities
 * Functions for timeline interactions and animations
 */

/**
 * Scroll timeline to show a specific clip
 * @param clipId - The clip ID to scroll to
 */
export const scrollTimelineToClip = (clipId: string) => {
  // Find the timeline item element
  const timelineItem = document.querySelector(`[data-clip-id="${clipId}"]`);
  
  if (!timelineItem) {
    // Item might not be rendered yet, silently return
    // (Highlight will still work when item appears)
    return;
  }

  // Find the timeline scroll container
  const timelineScrollContainer = document.querySelector('[data-timeline-scroll-container]');
  
  if (!timelineScrollContainer) {
    // Fallback: try to find by class
    const fallbackContainer = timelineItem.closest('.overflow-x-auto, .overflow-auto, [style*="overflow"]');
    if (fallbackContainer) {
      fallbackContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      timelineItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    return;
  }

  // Calculate scroll position to center the item
  const containerRect = timelineScrollContainer.getBoundingClientRect();
  const itemRect = timelineItem.getBoundingClientRect();
  
  const scrollLeft = timelineScrollContainer.scrollLeft;
  const itemRelativeLeft = itemRect.left - containerRect.left;
  const targetScroll = scrollLeft + itemRelativeLeft - (containerRect.width / 2) + (itemRect.width / 2);

  // Smooth scroll to position
  timelineScrollContainer.scrollTo({
    left: Math.max(0, targetScroll),
    behavior: 'smooth'
  });
};

/**
 * Highlight a timeline item with a pulse animation
 * @param clipId - The clip ID to highlight
 * @param duration - Duration of highlight in milliseconds (default: 1000)
 */
export const highlightTimelineItem = (clipId: string, duration: number = 1000) => {
  const timelineItem = document.querySelector(`[data-clip-id="${clipId}"]`);
  
  if (!timelineItem) {
    console.warn(`Timeline item not found for clip: ${clipId}`);
    return;
  }

  // Add highlight class
  timelineItem.classList.add('timeline-item-highlight');

  // Remove after duration
  setTimeout(() => {
    timelineItem.classList.remove('timeline-item-highlight');
  }, duration);
};

/**
 * Combined function to scroll and highlight a timeline item
 * @param clipId - The clip ID to scroll to and highlight
 * @param highlightDuration - Duration of highlight in milliseconds (default: 1500)
 */
export const scrollAndHighlightClip = (clipId: string, highlightDuration: number = 1500) => {
  // Use requestAnimationFrame to wait for DOM update
  requestAnimationFrame(() => {
    // Try scrolling immediately after paint
    scrollTimelineToClip(clipId);
    
    // Highlight after a brief delay to ensure scroll has started
    setTimeout(() => {
      highlightTimelineItem(clipId, highlightDuration);
    }, 150);
  });
};

/**
 * Check if a timeline item is visible in the scroll container
 * @param clipId - The clip ID to check
 * @returns true if visible, false otherwise
 */
export const isTimelineItemVisible = (clipId: string): boolean => {
  const timelineItem = document.querySelector(`[data-clip-id="${clipId}"]`);
  
  if (!timelineItem) {
    return false;
  }

  const timelineScrollContainer = document.querySelector('[data-timeline-scroll-container]');
  
  if (!timelineScrollContainer) {
    return true; // Assume visible if no scroll container
  }

  const containerRect = timelineScrollContainer.getBoundingClientRect();
  const itemRect = timelineItem.getBoundingClientRect();

  return (
    itemRect.left >= containerRect.left &&
    itemRect.right <= containerRect.right &&
    itemRect.top >= containerRect.top &&
    itemRect.bottom <= containerRect.bottom
  );
};
