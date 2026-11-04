#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  A1_EXTERNAL_SOURCE_TOOL_ADAPTER_CONTRACT,
  compileExternalSourceToolExecutionPlan,
  generateExternalSourceMatte,
  probeExternalSourceToolRuntime,
} from "../lib/visual-sourcing/external-source-tool-adapters-v1.mjs";

const runtime = probeExternalSourceToolRuntime();
assert.equal(runtime.contract, "A1ExternalSourceToolRuntimeProbe/v1");
assert.equal(runtime.status, "READY", JSON.stringify(runtime.checks));

const evidence = compileExternalSourceToolExecutionPlan({route: "EVIDENCE_HIGHLIGHT", candidateCount: 6});
assert.equal(evidence.contract, A1_EXTERNAL_SOURCE_TOOL_ADAPTER_CONTRACT);
assert.equal(evidence.status, "READY_FOR_REVIEW_EXECUTION");
assert.equal(evidence.steps.find((step) => step.id === "semantic-rerank")?.required, true);

const cleanSubject = compileExternalSourceToolExecutionPlan({route: "SUBJECT_ISOLATION", sourceClean: true, candidateCount: 1});
assert.equal(cleanSubject.status, "READY_FOR_REVIEW_EXECUTION");
assert.equal(cleanSubject.steps.find((step) => step.id === "subject-matte")?.provider, "BIREFNET_LITE");
const dirtySubject = compileExternalSourceToolExecutionPlan({route: "SUBJECT_ISOLATION", sourceClean: false, candidateCount: 1});
assert.equal(dirtySubject.status, "BLOCKED");
assert.ok(dirtySubject.failures.includes("SOURCE_CLEAN_REQUIRED"));

const prop = compileExternalSourceToolExecutionPlan({route: "PROP_PERSPECTIVE", candidateCount: 1});
assert.equal(prop.steps.find((step) => step.id === "perspective-bind")?.destinationQuadRequired, true);

const dirtyMatte = await generateExternalSourceMatte({sourcePath: "does-not-matter.png", outputDir: "work/blocked", id: "dirty", sourceClean: false});
assert.equal(dirtyMatte.status, "BLOCKED");
assert.ok(dirtyMatte.failures.includes("BLOCKED_SOURCE_BURNED_TEXT"));

console.log(JSON.stringify({status: "PASS", contract: "A1ExternalSourceToolAdaptersTest/v1", runtime: runtime.checks, plans: {evidence: evidence.planSha256, cleanSubject: cleanSubject.planSha256, dirtySubject: dirtySubject.planSha256, prop: prop.planSha256}}, null, 2));
