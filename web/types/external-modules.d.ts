// Module declarations for external packages lacking TypeScript types

declare module '@tanstack/react-query-devtools' {
  import { ComponentType } from 'react';
  export const ReactQueryDevtools: ComponentType<{
    initialIsOpen?: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    buttonPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  }>;
}

declare module 'motion/react' {
  export * from 'framer-motion';
}

declare module 'react-markdown' {
  import { ComponentType, ReactNode } from 'react';
  interface ReactMarkdownProps {
    children: string;
    remarkPlugins?: any[];
    rehypePlugins?: any[];
    components?: Record<string, ComponentType<any>>;
    className?: string;
    [key: string]: any;
  }
  const ReactMarkdown: ComponentType<ReactMarkdownProps>;
  export default ReactMarkdown;
}

declare module 'remark-gfm' {
  const remarkGfm: any;
  export default remarkGfm;
}

declare module 'shiki' {
  export function codeToHtml(code: string, options: {
    lang: string;
    theme?: string;
    themes?: Record<string, string>;
    [key: string]: any;
  }): Promise<string>;
  export function getHighlighter(options?: any): Promise<any>;
  export type BundledLanguage = string;
  export type BundledTheme = string;
}

declare module 'react-draggable' {
  import { ComponentType, ReactNode } from 'react';
  interface DraggableProps {
    axis?: 'both' | 'x' | 'y' | 'none';
    handle?: string;
    cancel?: string;
    bounds?: string | { left?: number; right?: number; top?: number; bottom?: number };
    defaultPosition?: { x: number; y: number };
    position?: { x: number; y: number };
    onStart?: (e: any, data: any) => void | false;
    onDrag?: (e: any, data: any) => void | false;
    onStop?: (e: any, data: any) => void | false;
    children?: ReactNode;
    [key: string]: any;
  }
  const Draggable: ComponentType<DraggableProps>;
  export default Draggable;
  export { Draggable };
}
