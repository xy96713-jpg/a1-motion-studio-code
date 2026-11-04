#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {describeCapExecutedEffects} from "./lib/cap-execution-readback.mjs";
import {inspectEvidenceBindings, readJson, shaFile, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";
const root = path.resolve(import.meta.dirname, "..");
const relative = process.argv[2];
if (!relative || !relative.startsWith("work/screen-recording-maturity-test-v1/") || !relative.endsWith("/cap-receipt.json")) throw new Error("REVIEW_RECEIPT_PATH_REQUIRED");
const file = path.resolve(root, relative), receipt = readJson(file);
const inputs = {capture: receipt.captureReport, source: receipt.sourceVideo, output: receipt.reviewVideo, config: {path: `${receipt.capProject.path}/project-config.json`, sha256: receipt.capProject.configSha256}};
const bindings = inspectEvidenceBindings(root, inputs);
if (bindings.status !== "PASS" || receipt.configurationReadback?.status !== "PASS") throw new Error(JSON.stringify(bindings.failures));
const report = readJson(path.join(root, receipt.captureReport.path)), config = readJson(path.join(root, inputs.config.path));
const executionEffects = describeCapExecutedEffects(report, config, receipt.feedback);
if (executionEffects.some((effect) => effect.execution === "UNAVAILABLE")) throw new Error("DECLARED_EFFECT_NOT_EXECUTED");
if (JSON.stringify(executionEffects) === JSON.stringify(receipt.executionEffects)) {console.log("NOOP_ALREADY_CURRENT"); process.exit(0);}
const backup = `${file}.before-execution-reconcile-${Date.now()}`;
fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
const revised = {...receipt, executionEffects, reconciliation: {scope: "CONFIGURATION_RECEIPT_CORRECTION_ONLY", previousReceiptSha256: shaFile(backup), sourceVideoUnchanged: true, outputVideoUnchanged: true, visualAcceptance: "NOT_REVIEWED"}};
delete revised.receiptSha256;
revised.receiptSha256 = crypto.createHash("sha256").update(JSON.stringify(revised)).digest("hex");
writeAudit(root, relative, revised, bindings.checked);
console.log(JSON.stringify({status: "PASS", executionEffects, outputVideoUnchanged: true}));
