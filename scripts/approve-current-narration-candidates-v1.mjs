#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {applyNarrationReviewDecision} from "../apps/studio-next/src/lib/a1-narration-review-decision-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(expectedWorkspaceSha256 || "")) throw new Error("expected-workspace-sha-required");
const inputPath = path.join(root, "work/current-narration-review-decision-20260915/input.json");
const queuePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/review-queue-v1/current.json");
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const item of input.items) {
  for (const media of [item.audio, item.video]) {
    const source = path.resolve(root, media.path);
    const served = path.resolve(appRoot, "public", media.publicUrl.replace(/^\//u, ""));
    if (!source.startsWith(path.join(root, "work") + path.sep) || !fs.existsSync(source) || shaFile(source) !== media.sha256 || !fs.existsSync(served) || shaFile(served) !== media.sha256) throw new Error(`narration-review-media-stale:${item.shotId}`);
  }
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path.resolve(root, item.video.path)], {encoding: "utf8"}));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (video?.width !== item.video.width || video?.height !== item.video.height || video?.r_frame_rate !== `${item.video.fps}/1` || !probe.streams.some((stream) => stream.codec_type === "audio") || Math.abs(Number(probe.format.duration) * 1000 - item.video.durationMs) > 80) throw new Error(`narration-review-video-contract-invalid:${item.shotId}`);
}
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`narration-review-cas:${current.workspaceSha256}`);
  const now = new Date().toISOString();
  const applied = applyNarrationReviewDecision(current, queue, input, now);
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(applied.workspace, now));
  if (next.gates.motionPrototypeAllowed !== false || next.gates.finalRenderAllowed !== false || next.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval !== current.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval) throw new Error("narration-review-global-gate-drift");
  const event = createProductionEvent({workspace: current, action: "approve-current-narration-candidates", targetId: applied.decision.decisionSha256, payload: {shotIds: applied.decision.decisions.map((item) => item.shotId), decisionSha256: applied.decision.decisionSha256, userDirective: input.userDirective, productionAdmission: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const saved = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {[`narration-review-decision-v1/${applied.decision.decisionSha256}.json`]: applied.decision}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: saved.workspaceSha256, decision: applied.decision};
});
for (const [script, args] of [
  ["audit-system-line-workbench-current-authority-v2.mjs", ["--write"]],
  ["build-current-review-queue-v1.mjs", []],
  ["build-system-core-current-v1.mjs", []],
]) execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], {cwd: root, stdio: "pipe", env: process.env});
console.log(JSON.stringify(result, null, 2));
