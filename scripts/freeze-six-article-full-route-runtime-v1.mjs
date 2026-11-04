#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const qualificationRoot = path.join(root, "qualification/six-article-full-route-v1");
const sealedManifestPath = path.join(qualificationRoot, "sealed-manifest.json");
const freezePath = path.join(qualificationRoot, "runtime-freeze.json");
const freeze = process.argv.includes("--freeze");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const runtimeFiles = [
  "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/import-project/route.ts",
  "apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs",
  "apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs",
  "apps/studio-next/src/lib/a1-packaging-orchestration-boundary-v1.mjs",
  "apps/studio-next/src/lib/a1-project-accepted-shot-ir-v2.mjs",
  "apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs",
  "apps/studio-next/src/lib/a1-project-intake-v1.mjs",
  "apps/studio-next/src/lib/a1-project-scene-graph-v1.mjs",
  "apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs",
  "apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs",
  "apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts",
  "remotion-renderer/src/AcceptedEditorialSequenceV2.tsx",
  "remotion-renderer/src/Root.tsx",
  "scripts/run-editorial-project-asset-jobs-v1.mjs",
  "scripts/run-editorial-project-autopilot-v1.mjs",
  "scripts/run-editorial-project-director-v1.mjs",
  "scripts/render-editorial-project-540p-v1.mjs",
  "scripts/run-six-article-full-route-qualification-v1.mjs",
  "package.json",
  "package-lock.json",
  "remotion-renderer/package-lock.json"
];

function verification(manifest) {
  const failures = [];
  if (manifest.contract !== "A1SixArticleFullRouteRuntimeFreeze/v1" || manifest.status !== "FROZEN") failures.push("FREEZE_CONTRACT_INVALID");
  if (!fs.existsSync(sealedManifestPath) || fileSha256(sealedManifestPath) !== manifest.sealedManifestSha256) failures.push("SEALED_INPUT_DRIFT");
  for (const item of manifest.files || []) {
    const file = path.join(root, item.path);
    if (!fs.existsSync(file)) failures.push(`${item.path}:MISSING`);
    else if (fileSha256(file) !== item.sha256) failures.push(`${item.path}:SHA_DRIFT`);
  }
  const currentRuntimeSha256 = sha256(JSON.stringify((manifest.files || []).map((item) => ({path: item.path, sha256: fs.existsSync(path.join(root, item.path)) ? fileSha256(path.join(root, item.path)) : null}))));
  if (currentRuntimeSha256 !== manifest.runtimeSha256) failures.push("RUNTIME_SET_SHA_DRIFT");
  return {status: failures.length ? "FAIL" : "PASS", failures, currentRuntimeSha256};
}

if (!freeze) {
  if (!fs.existsSync(freezePath)) throw new Error("six-article-runtime-freeze-missing:run-with---freeze-once");
  const manifest = JSON.parse(fs.readFileSync(freezePath, "utf8"));
  const verified = verification(manifest);
  console.log(JSON.stringify({contract: "A1SixArticleFullRouteRuntimeFreezeVerification/v1", ...verified, runtimeSha256: manifest.runtimeSha256, fileCount: manifest.files?.length || 0, frozenAt: manifest.frozenAt}, null, 2));
  if (verified.failures.length) process.exitCode = 1;
  process.exit();
}

if (fs.existsSync(freezePath)) throw new Error("six-article-runtime-already-frozen");
assert.ok(fs.existsSync(sealedManifestPath), "sealed-manifest-required-before-runtime-freeze");
const files = runtimeFiles.map((relativePath) => {
  const file = path.join(root, relativePath);
  assert.ok(fs.existsSync(file), `runtime-file-missing:${relativePath}`);
  return {path: relativePath, sha256: fileSha256(file), bytes: fs.statSync(file).size};
});
const runtimeSha256 = sha256(JSON.stringify(files.map(({path: filePath, sha256: fileHash}) => ({path: filePath, sha256: fileHash}))));
const body = {
  contract: "A1SixArticleFullRouteRuntimeFreeze/v1",
  status: "FROZEN",
  immutable: true,
  route: "A1VisualDirectorProject/v1",
  sealedManifestSha256: fileSha256(sealedManifestPath),
  runtimeSha256,
  fileCount: files.length,
  files,
  invalidationRule: "Any listed file hash change invalidates every qualification result and requires a new freeze plus a complete six-article rerun.",
  frozenAt: new Date().toISOString(),
};
const manifest = {...body, freezeManifestSha256: sha256(JSON.stringify(body))};
fs.writeFileSync(freezePath, `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
const verified = verification(manifest);
assert.equal(verified.status, "PASS", verified.failures.join(","));
console.log(JSON.stringify({status: "PASS", freezePath: path.relative(root, freezePath), runtimeSha256, fileCount: files.length, sealedManifestSha256: manifest.sealedManifestSha256}, null, 2));
