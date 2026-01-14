import { writingWorkflow } from "./writing";

import { audioWorkflow } from "./audio";
import { avScriptWorkflow } from "./av-script";
import { universalScriptWorkflow } from "./writing/universal-script-workflow";
import { visualDirectorWorkflow } from "./visual-director";
import { visualDirectorTestWorkflow } from "./visual-director/test-workflow";
import { gpuApiTestFunctions } from "./gpu-api-test";
import { mediaGenerationWorkflow } from "./media-generation-workflow";

export const functions = [
  writingWorkflow,
  audioWorkflow,
  avScriptWorkflow,
  universalScriptWorkflow,
  visualDirectorWorkflow,
  visualDirectorTestWorkflow,
  mediaGenerationWorkflow,
  ...gpuApiTestFunctions,
];
