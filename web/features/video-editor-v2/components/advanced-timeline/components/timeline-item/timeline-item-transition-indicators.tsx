import React from 'react';
import { VideoTransition, AudioTransition } from '../../types';

interface TimelineItemTransitionIndicatorsProps {
  inTransition?: VideoTransition | AudioTransition;
  outTransition?: VideoTransition | AudioTransition;
  duration: number; // item duration in seconds
  isHovering: boolean;
}

/**
 * Renders visual indicators for transitions on timeline items
 * Shows colored overlays at the start/end of items to indicate transitions
 */
export const TimelineItemTransitionIndicators: React.FC<TimelineItemTransitionIndicatorsProps> = ({
  inTransition,
  outTransition,
  duration,
  isHovering,
}) => {
  if (!inTransition && !outTransition) return null;

  // Calculate transition durations as percentages of item duration
  const inTransitionPercent = inTransition 
    ? Math.min((inTransition.duration / duration) * 100, 50) 
    : 0;
  const outTransitionPercent = outTransition 
    ? Math.min((outTransition.duration / duration) * 100, 50) 
    : 0;

  return (
    <>
      {/* In Transition Indicator - at start of item */}
      {inTransition && (
        <div
          className="absolute left-0 top-0 bottom-0 pointer-events-none z-10"
          style={{
            width: `${inTransitionPercent}%`,
            background: 'linear-gradient(to right, rgba(59, 130, 246, 0.3), transparent)',
            borderLeft: '2px solid rgb(59, 130, 246)',
          }}
          title={`In Transition: ${inTransition.type} (${inTransition.duration}s)`}
        >
          {isHovering && (
            <div className="absolute top-0 left-0 px-1 py-0.5 bg-blue-500 text-white text-[8px] rounded-br">
              IN
            </div>
          )}
        </div>
      )}

      {/* Out Transition Indicator - at end of item */}
      {outTransition && (
        <div
          className="absolute right-0 top-0 bottom-0 pointer-events-none z-10"
          style={{
            width: `${outTransitionPercent}%`,
            background: 'linear-gradient(to left, rgba(59, 130, 246, 0.3), transparent)',
            borderRight: '2px solid rgb(59, 130, 246)',
          }}
          title={`Out Transition: ${outTransition.type} (${outTransition.duration}s)`}
        >
          {isHovering && (
            <div className="absolute top-0 right-0 px-1 py-0.5 bg-blue-500 text-white text-[8px] rounded-bl">
              OUT
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default TimelineItemTransitionIndicators;
