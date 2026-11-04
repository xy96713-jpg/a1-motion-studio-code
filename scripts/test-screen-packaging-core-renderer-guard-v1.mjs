#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {hashScreenPackagingAssistValueV2} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const publicRoot = path.join(renderer, "public");
const audit = JSON.parse(fs.readFileSync(path.join(root, "work/screen-packaging-core-canary-v1/audit-report.json"), "utf8"));
const props = JSON.parse(fs.readFileSync(path.join(root, audit.props.path), "utf8"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-screen-core-guard-"));
const stageDir = fs.mkdtempSync(path.join(publicRoot, "proof-only/screen-packaging-core-v1/guard-"));
const uriByShot = new Map();
let tamperedUri;
for (const source of audit.sources) {
  const sourcePath = path.join(root, source.videoPath);
  const staged = path.join(stageDir, `${source.shotId.toLowerCase()}.mp4`);
  fs.copyFileSync(sourcePath, staged);
  const uri = path.relative(publicRoot, staged).split(path.sep).join("/");
  uriByShot.set(source.shotId, uri);
  if (source.shotId === "ED-04") {
    const bytes = fs.readFileSync(sourcePath);
    bytes[bytes.length - 1] ^= 1;
    const tampered = path.join(stageDir, "ed-04-tampered.mp4");
    fs.writeFileSync(tampered, bytes);
    tamperedUri = path.relative(publicRoot, tampered).split(path.sep).join("/");
  }
}
const base = structuredClone(props);
base.variants.forEach((variant) => { variant.sourceVideoUri = uriByShot.get(variant.adapter.shotId); });
const remotion = path.join(renderer, "node_modules/.bin/remotion");
const invoke = (payload, name) => {
  const propsPath = path.join(tempDir, `${name}.json`);
  const outputPath = path.join(tempDir, `${name}.png`);
  fs.writeFileSync(propsPath, JSON.stringify(payload));
  const result = spawnSync(remotion, [
    "still", "src/screen-packaging-core-v1-entry.tsx", "ScreenPackagingCoreCanaryV1", outputPath,
    "--props", propsPath, "--frame", "60", "--log", "error",
  ], {cwd: renderer, encoding: "utf8"});
  return {...result, outputPath};
};

try {
  const forged = structuredClone(base);
  const original = forged.variants[0].adapter;
  const body = {...original, actor: {...original.actor, style: {filter: "blur(24px)"}}};
  delete body.adapterSha256;
  forged.variants[0].adapter = {...body, adapterSha256: hashScreenPackagingAssistValueV2(body)};
  const forgedResult = invoke(forged, "forged-style");
  assert.notEqual(forgedResult.status, 0, "renderer accepted a rehashed adapter with caller style");
  assert.match(`${forgedResult.stdout}\n${forgedResult.stderr}`, /FOCUS_ACTOR_KEYS_INVALID|screen-packaging-core-adapter-invalid/u);
  assert.equal(fs.existsSync(forgedResult.outputPath), false);

  const declaredMismatch = structuredClone(base);
  declaredMismatch.variants[0].sourceVideoSha256 = "d".repeat(64);
  const declaredResult = invoke(declaredMismatch, "declared-source-mismatch");
  assert.notEqual(declaredResult.status, 0, "renderer accepted declared source SHA mismatch");
  assert.match(`${declaredResult.stdout}\n${declaredResult.stderr}`, /screen-packaging-core-source-adapter-mismatch/u);

  const actualMismatch = structuredClone(base);
  actualMismatch.variants.filter((variant) => variant.adapter.shotId === "ED-04").forEach((variant) => {
    variant.sourceVideoUri = tamperedUri;
  });
  const actualResult = invoke(actualMismatch, "actual-source-bytes-mismatch");
  assert.notEqual(actualResult.status, 0, "renderer accepted actual URI bytes mismatch");
  assert.match(`${actualResult.stdout}\n${actualResult.stderr}`, /screen-packaging-core-source-uri-sha-mismatch/u);

  console.log(JSON.stringify({
    contract: "A1ScreenPackagingCoreRendererGuardTest/v1",
    status: "PASS",
    rehashedCallerStyleRejected: true,
    declaredSourceIdentityMismatchRejected: true,
    actualSourceBytesMismatchRejected: true,
  }, null, 2));
} finally {
  fs.rmSync(stageDir, {recursive: true, force: true});
  fs.rmSync(tempDir, {recursive: true, force: true});
}
