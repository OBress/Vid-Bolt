declare module '@babel/standalone' {
  export function transform(
    code: string,
    options?: {
      presets?: string[];
      plugins?: string[] | [string, Record<string, unknown>][];
      filename?: string;
      [key: string]: unknown;
    }
  ): { code: string };

  export function registerPlugin(name: string, plugin: unknown): void;
  export function registerPreset(name: string, preset: unknown): void;
  export const availablePlugins: Record<string, unknown>;
  export const availablePresets: Record<string, unknown>;
}
