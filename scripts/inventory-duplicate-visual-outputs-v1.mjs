#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/generated-visual-reviews");
const outputDir = path.join(root, ".codex-artifacts/system-progress-system-line/duplicate-output-inventory-v1");
const outputPath = path.join(outputDir, "report.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && /\.(?:png|jpg|jpeg|webp|gif)$/iu.test(entry.name)) files.push(file);
  }
}
walk(reviewRoot);
const bySha = new Map();
const byCandidate = new Map();
for (const file of files) {
  const relativePath = path.relative(root, file).split(path.sep).join("/");
  const sha256 = shaFile(file);
  const record = {path: relativePath, bytes: fs.statSync(file).size, sha256};
  if (!bySha.has(sha256)) bySha.set(sha256, []);
  bySha.get(sha256).push(record);
  const candidate = path.basename(file).replace(/-(?:composite|inspection-board)\.png$/u, "");
  if (!byCandidate.has(candidate)) byCandidate.set(candidate, []);
  byCandidate.get(candidate).push(record);
}
const duplicateShaGroups = [...bySha.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([sha256, entries]) => ({sha256, count: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), files: entries}))
  .sort((left, right) => right.count - left.count || right.bytes - left.bytes);
const candidateRepeatGroups = [...byCandidate.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([candidateId, entries]) => ({candidateId, count: entries.length, uniqueSha256Count: new Set(entries.map((item) => item.sha256)).size, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), files: entries}))
  .sort((left, right) => right.count - left.count || right.bytes - left.bytes);
const report = {
  contract: "A1DuplicateVisualOutputInventory/v1",
  generatedAt: new Date().toISOString(),
  scope: "generated-visual-reviews-only",
  destructiveActionTaken: false,
  reviewRoot: path.relative(root, reviewRoot).split(path.sep).join("/"),
  summary: {
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
    duplicateShaGroupCount: duplicateShaGroups.length,
    duplicatedFileCount: duplicateShaGroups.reduce((sum, group) => sum + group.count, 0),
    repeatedCandidateGroupCount: candidateRepeatGroups.length,
  },
  duplicateShaGroups: duplicateShaGroups.slice(0, 50),
  repeatedCandidateGroups: candidateRepeatGroups.slice(0, 100),
  nextAction: "review-report-and-confirm-before-any-move-or-delete",
};
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: "PASS", reportPath: outputPath, summary: report.summary, topRepeatedCandidates: candidateRepeatGroups.slice(0, 10).map((group) => ({candidateId: group.candidateId, count: group.count, uniqueSha256Count: group.uniqueSha256Count}))}, null, 2));
