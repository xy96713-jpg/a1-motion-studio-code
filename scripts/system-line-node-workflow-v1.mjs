#!/usr/bin/env node
import path from "node:path";
import {readCurrentNodeWorkflow, runNodeWorkflowTick} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {summarizeNodeWorkflow} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const execute = process.argv.includes("--execute");
if (execute && process.env.A1_SYSTEM_LINE_WRITER_ID !== "system-line-operator-cli") throw new Error("use-system-line-run-node-flow-apply");
if (execute) {
  const result = await runNodeWorkflowTick(appRoot, {workerId: `node-flow-${process.pid}`, origin: process.env.A1_NODE_MATERIAL_SEARCH_ORIGIN});
  console.log(JSON.stringify({...result, workflow: summarizeNodeWorkflow(result.workflow)}, null, 2));
  if (result.outcomes.some((outcome) => ["failed", "commit-rejected"].includes(outcome.state))) process.exitCode = 1;
} else {
  console.log(JSON.stringify(summarizeNodeWorkflow(readCurrentNodeWorkflow(appRoot)), null, 2));
}
