/**
 * Remotion Configuration for Lambda Bundle
 *
 * This file configures the Remotion CLI for building and deploying
 * the Lambda bundle. Used by:
 * - `npx remotion bundle` (build the site for Lambda deployment)
 * - `npx remotion lambda` CLI commands
 *
 * Entry point: features/video-editor-v2/utils/remotion/root.tsx
 */

import { Config } from "@remotion/cli/config";

// Set the entry point for the Remotion bundle
Config.setEntryPoint("features/video-editor-v2/utils/remotion/index.ts");

// Output directory for the bundle
Config.setOutputLocation("out/remotion-bundle");
