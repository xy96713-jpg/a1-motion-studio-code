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
const audit = JSON.parse(fs.readFileSync(path.join(
  root,
  "work/screen-packaging-assist-mature-canary-v2/audit-report.json",
), "utf8"));
const props = JSON.parse(fs.readFileSync(path.join(root, audit.props.path), "utf8"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-screen-assist-guard-v2-"));
const stageDir = fs.mkdtempSync(path.join(publicRoot, "proof-only/screen-packaging-assist-v2/guard-"));
const stagedName = path.basename(audit.source.videoPath);
const stagedPath = path.join(stageDir, stagedName);
fs.copyFileSync(path.join(root, audit.source.videoPath), stagedPath);
const sourceVideoUri = path.relative(publicRoot, stagedPath).split(path.sep).join("/");
const tamperedPath = path.join(stageDir, `tampered-${stagedName}`);
const tamperedBytes = fs.readFileSync(stagedPath);
tamperedBytes[tamperedBytes.length - 1] ^= 1;
fs.writeFileSync(tamperedPath, tamperedBytes);
const tamperedSourceVideoUri = path.relative(publicRoot, tamperedPath).split(path.sep).join("/");
const remotion = path.join(renderer, "node_modules/.bin/remotion");
const entry = "src/screen-packaging-assist-v2-entry.tsx";
const composition = "ScreenPackagingAssistCanaryV2";
const invoke = (payload, name) => {
  const propsPath = path.join(tempDir, `${name}.json`);
  const outputPath = path.join(tempDir, `${name}.png`);
  fs.writeFileSync(propsPath, JSON.stringify(payload));
  const result = spawnSync(remotion, [
    "still", entry, composition, outputPath,
    "--props", propsPath,
    "--frame", "150",
    "--log", "error",
  ], {cwd: renderer, encoding: "utf8"});
  return {...result, outputPath};
};

try {
  const base = structuredClone(props);
  base.variants.forEach((variant) => { variant.sourceVideoUri = sourceVideoUri; });
  const forgedPath = structuredClone(base);
  const originalAdapter = forgedPath.variants[0].adapter;
  const forgedBody = {
    ...originalAdapter,
    actors: originalAdapter.actors.map((actor, index) =>
      index === 0 ? {...actor, path: "M 0 0 L 100 0 L 100 100 L 0 100 Z"} : actor),
  };
  delete forgedBody.adapterSha256;
  forgedPath.variants[0].adapter = {
    ...forgedBody,
    adapterSha256: hashScreenPackagingAssistValueV2(forgedBody),
  };
  const forgedResult = invoke(forgedPath, "forged-closed-path");
  assert.notEqual(forgedResult.status, 0, "renderer accepted a rehashed adapter with arbitrary closed path");
  assert.match(
    `${forgedResult.stdout}\n${forgedResult.stderr}`,
    /ADAPTER_ACTOR_KEYS_INVALID|screen-packaging-assist-adapter-v2-invalid/u,
  );
  assert.equal(fs.existsSync(forgedResult.outputPath), false);

  const sourceMismatch = structuredClone(base);
  sourceMismatch.variants[0].sourceVideoSha256 = "d".repeat(64);
  const mismatchResult = invoke(sourceMismatch, "source-mismatch");
  assert.notEqual(mismatchResult.status, 0, "canary accepted source video identity mismatch");
  assert.match(
    `${mismatchResult.stdout}\n${mismatchResult.stderr}`,
    /screen-packaging-assist-canary-v2-source-adapter-mismatch/u,
  );
  assert.equal(fs.existsSync(mismatchResult.outputPath), false);

  const uriMismatch = structuredClone(base);
  uriMismatch.variants.forEach((variant) => {
    variant.sourceVideoUri = tamperedSourceVideoUri;
  });
  const uriMismatchResult = invoke(uriMismatch, "actual-uri-bytes-mismatch");
  assert.notEqual(uriMismatchResult.status, 0, "canary accepted URI bytes that do not match the declared SHA");
  assert.match(
    `${uriMismatchResult.stdout}\n${uriMismatchResult.stderr}`,
    /screen-packaging-assist-canary-v2-source-uri-sha-mismatch/u,
  );
  assert.equal(fs.existsSync(uriMismatchResult.outputPath), false);

  const frameMismatch = structuredClone(base);
  frameMismatch.variants[0].sourceFrame += 1;
  const frameMismatchResult = invoke(frameMismatch, "evidence-frame-mismatch");
  assert.notEqual(frameMismatchResult.status, 0, "canary accepted a source frame different from the evidence frame");
  assert.match(
    `${frameMismatchResult.stdout}\n${frameMismatchResult.stderr}`,
    /screen-packaging-assist-canary-v2-source-evidence-frame-mismatch/u,
  );
  assert.equal(fs.existsSync(frameMismatchResult.outputPath), false);

  console.log(JSON.stringify({
    contract: "A1ScreenPackagingAssistRendererGuardTest/v2",
    status: "PASS",
    rehashedClosedSvgPathRejectedByRealRender: true,
    sourceVideoIdentityMismatchRejectedByRealRender: true,
    actualSourceUriBytesMismatchRejectedByRealRender: true,
    evidenceFrameMismatchRejectedByRealRender: true,
  }, null, 2));
} finally {
  fs.rmSync(stageDir, {recursive: true, force: true});
  fs.rmSync(tempDir, {recursive: true, force: true});
}
