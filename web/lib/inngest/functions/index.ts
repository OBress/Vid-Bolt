import { writingWorkflow } from "./writing";

import { audioWorkflow } from "./audio";
import { avScriptWorkflow } from "./av-script";
import { universalScriptWorkflow } from "./writing/universal-script-workflow";

export const functions = [
  writingWorkflow,
  audioWorkflow,
  avScriptWorkflow,
  universalScriptWorkflow,
];
