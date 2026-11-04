#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {buildBackgroundSupplyPlan, buildBackgroundVarietyBatchPlan, buildEditorialVideoCompositionGrammar} from "../apps/studio-next/src/lib/a1-video-composition-background-supply-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const laneRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const workspace = readProjectWorkspace(appRoot);
const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
const userDecision = readJson(path.join(laneRoot, "user-library-decision.json"));
const now = new Date().toISOString();
const sampledReferences = [
  {creator: "胡泊Hubo", videoId: "BV1a63d6CEBa", url: "https://www.bilibili.com/video/BV1a63d6CEBa/", sampledFrameCount: 12},
  {creator: "差评君", videoId: "BV1Kv4y1j7hQ", url: "https://www.bilibili.com/video/BV1Kv4y1j7hQ/", sampledFrameCount: 12},
];
const grammar = buildEditorialVideoCompositionGrammar({workspace, sampledReferences, now});
const supplyPlan = buildBackgroundSupplyPlan({workspace, grammar, userDecision, now});
const varietyBatchPlan = buildBackgroundVarietyBatchPlan({workspace, grammar, supplyPlan, styleDna, now});

writeJson(path.join(laneRoot, "video-composition-grammar.json"), grammar);
writeJson(path.join(laneRoot, "background-supply-plan.json"), supplyPlan);
writeJson(path.join(laneRoot, "next-variety-batch-plan.json"), varietyBatchPlan);

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  grammarSha256: grammar.grammarSha256,
  supplyPlanSha256: supplyPlan.supplyPlanSha256,
  minimumCoverageFloor: supplyPlan.countPolicy.minimumCoverageFloor,
  approvedDistinctCount: supplyPlan.coverage.approvedDistinctCount,
  nextBatchPlanSha256: varietyBatchPlan.batchPlanSha256,
  imageGenerationPerformed: false,
}, null, 2));
