#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertGenerationJobV2, assertGenerationResultV2, finalizeCanaryResult, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const bool = (name) => arg(name) === "true";
const jobPath = path.resolve(root, arg("--job") || "");
const resultPath = path.resolve(root, arg("--result") || "");
const auditPath = path.resolve(root, arg("--audit") || "");
if (![jobPath, resultPath, auditPath].every(fs.existsSync)) throw new Error("isolated-imagegen-finalize-job-result-audit-required");
const job = assertGenerationJobV2(JSON.parse(fs.readFileSync(jobPath, "utf8")));
const result = assertGenerationResultV2(JSON.parse(fs.readFileSync(resultPath, "utf8")));
const deterministic = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const visualAudit = {
  contract: "A1MainlineActualPixelVisualAssessment/v1",
  semanticThreeSecondPass: bool("--semanticThreeSecondPass"),
  styleAuthorityPass: bool("--styleAuthorityPass"),
  genericTemplateAbsent: bool("--genericTemplateAbsent"),
  oneContinuousScene: bool("--oneContinuousScene"),
  quietFieldRatio: Number(arg("--quietFieldRatio") || 0),
  notes: arg("--notes") || null,
  reviewer: "single-production-mainline",
  reviewedAt: new Date().toISOString(),
};
const finalized = finalizeCanaryResult(result, {job, ocrText: deterministic.ocr.text, ocrSegments: deterministic.ocr.segmentDetails, textBoxes: deterministic.ocr.textBoxes, visualAudit});
if (deterministic.status !== "PASS") finalized.rejectionCodes = [...new Set([...finalized.rejectionCodes, ...deterministic.failures])];
if (finalized.rejectionCodes.length) finalized.status = "AUDIT_FAIL";
const output = path.join(path.dirname(resultPath), "result.json");
const bytes = `${JSON.stringify(finalized, null, 2)}\n`;
const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
fs.writeFileSync(temporary, bytes, "utf8");
fs.renameSync(temporary, output);
console.log(JSON.stringify({status: finalized.status, resultPath: output, resultSha256: sha256(bytes), result: finalized}, null, 2));
