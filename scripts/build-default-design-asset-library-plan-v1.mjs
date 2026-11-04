#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertDefaultDesignAssetLibraryPlan, buildDefaultDesignAssetLibraryPlan} from "../apps/studio-next/src/lib/a1-default-design-asset-library-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseId = "editorial-asset-workbench-v1";
const planId = "default-design-asset-library-v1";
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const laneRoot = path.join(artifactRoot, "article-asset-background-lane-v1");
const notePath = path.join(root, "work/style-research/a1-pinterest-system-maturity-audit-2026-08-14.md");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

const workspace = readJson(path.join(publicRoot, "workspace.json"));
const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
const nextBackgroundBatchPlan = readJson(path.join(laneRoot, "next-variety-batch-plan.json"));
const plan = assertDefaultDesignAssetLibraryPlan(buildDefaultDesignAssetLibraryPlan({workspace, styleDna, nextBackgroundBatchPlan, researchNoteSha256: shaFile(notePath)}));

for (const destinationRoot of [publicRoot, artifactRoot]) {
  writeJson(path.join(destinationRoot, planId, "plan.json"), plan);
}

console.log(JSON.stringify({status: plan.status, contract: plan.contract, planSha256: plan.planSha256, publicUrl: `/generated/system-line/${phaseId}/${planId}/plan.json`, currentWave: plan.currentWave, boundaries: plan.boundaries}, null, 2));
