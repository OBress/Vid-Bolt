import { writingWorkflow } from "./writing";
import { ideaExpansion } from "./idea-expansion";
import { audioWorkflow } from "./audio";
import { avScriptWorkflow } from "./av-script";
import { universalScriptWorkflow } from "./writing/universal-script-workflow";

export const functions = [
  writingWorkflow,
  ideaExpansion,
  audioWorkflow,
  avScriptWorkflow,
  universalScriptWorkflow,
];
