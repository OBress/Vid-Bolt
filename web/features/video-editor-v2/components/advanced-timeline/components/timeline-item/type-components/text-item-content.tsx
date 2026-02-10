import React from 'react';
import { Type } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';
import { BaseItemContentProps } from '../timeline-item-content-factory';

interface TextItemContentProps extends BaseItemContentProps {
  data?: {
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
  };
}

export const TextItemContent: React.FC<TextItemContentProps> = ({
  label,
  data,
  isHovering = false,
}) => {
  // Handle both formats:
  // 1. data.text as string (legacy)
  // 2. data.text as object with text property (new clip format)
  let textToDisplay = label;
  
  if (data?.text) {
    if (typeof data.text === 'string') {
      textToDisplay = data.text;
    } else if (typeof data.text === 'object' && (data.text as any).text) {
      textToDisplay = (data.text as any).text;
    }
  }

  return (
    <TimelineItemLabel 
      icon={Type}
      label={textToDisplay}
      defaultLabel="TEXT"
      isHovering={isHovering}
    />
  );
}; 