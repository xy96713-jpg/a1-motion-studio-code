#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const source = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/ed01-approved-fullscreen-title-v1/ED-01-fullscreen-title.png");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === "ED-01");
assert.equal(shot.artifactKind, "SINGLE_RENDERABLE_FRAME");
assert.match(shot.artifactPublicUrl, /ED-01-fullscreen-title\.png$/u);
assert.doesNotMatch(shot.artifactPublicUrl, /three-state-board|board\.png$/u);
assert.equal(shot.artifactSha256, sha256(source));
assert.equal(shot.presentationMode, "FULLSCREEN_WORKBENCH_OPENING");
assert.equal(shot.frameOccupation, "FULL_FRAME_TAKEOVER");
console.log(JSON.stringify({status: "PASS", contract: "A1Ed01FullscreenTitleBindingTest/v1", artifactSha256: shot.artifactSha256}, null, 2));
