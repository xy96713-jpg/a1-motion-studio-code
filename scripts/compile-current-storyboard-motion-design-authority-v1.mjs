#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {compileCurrentStoryboardMotionDesignAuthority} from "../apps/studio-next/src/lib/a1-current-storyboard-motion-design-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-design-authority-workspace-sha-required");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const relativeAsset = (publicUrl) => {
  const prefix = "/generated/system-line/editorial-asset-workbench-v1/";
  if (!String(publicUrl || "").startsWith(prefix) || String(publicUrl).includes("..")) throw new Error(`motion-design-authority-public-url-invalid:${publicUrl}`);
  return String(publicUrl).slice(prefix.length);
};
const execute = async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`motion-design-authority-cas:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const authority = next.production.shotIntelligence.currentStoryboardAuthority;
  const binaryFiles = {};
  const shaRepairs = [];
  for (const shot of authority.shots) {
    const relative = relativeAsset(shot.artifactPublicUrl);
    const file = path.join(publicRoot, shot.artifactPublicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(file)) throw new Error(`motion-design-authority-artifact-missing:${shot.shotId}`);
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`motion-design-authority-artifact-decode-failed:${shot.shotId}`);
    const actualSha256 = shaFile(file);
    if (shot.artifactSha256 && shot.artifactSha256 !== actualSha256) throw new Error(`motion-design-authority-artifact-sha-mismatch:${shot.shotId}`);
    if (!shot.artifactSha256) {
      shot.artifactSha256 = actualSha256;
      shaRepairs.push({shotId: shot.shotId, artifactPublicUrl: shot.artifactPublicUrl, artifactSha256: actualSha256, width: metadata.width, height: metadata.height});
    }
    binaryFiles[relative] = fs.readFileSync(file);
  }
  const identityManifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/source-cache/semantic-source-plates-v1/manifest.json");
  const identityBindings = fs.existsSync(identityManifestPath) ? [JSON.parse(fs.readFileSync(identityManifestPath, "utf8"))] : [];
  const compiled = compileCurrentStoryboardMotionDesignAuthority(next, {identityBindings});
  if (compiled.report.blockedCount !== 0 || compiled.report.readyCount !== authority.shots.length) throw new Error(`motion-design-authority-incomplete:${compiled.report.readyCount}:${compiled.report.blockedCount}`);
  for (const shot of authority.shots) {
    shot.motionDesignContract = compiled.contractsByShotId.get(shot.shotId);
    shot.motionDesignStatus = shot.motionDesignContract.review.status;
  }
  authority.motionDesignAuthority = {contract: compiled.report.contract, status: compiled.report.status, motionDesignSetSha256: compiled.report.motionDesignSetSha256, reportPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/current-storyboard-motion-design-authority-v1/report.json", shotCount: compiled.report.shotCount, readyCount: compiled.report.readyCount, blockedCount: compiled.report.blockedCount, userVisualApproval: "NOT_APPROVED", productionAdmission: false};
  authority.motionDesignCompiledAt = new Date().toISOString();
  const output = {status: "PASS", dryRun, workspaceSha256Before: current.workspaceSha256, shaRepairs, report: compiled.report, nextActionBefore: current.production.authority.nextAction, nextActionAfter: null};
  if (dryRun) return output;
  const now = authority.motionDesignCompiledAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (recalculated.production.authority.nextAction?.id !== current.production.authority.nextAction?.id) throw new Error(`motion-design-authority-next-action-drift:${current.production.authority.nextAction?.id}:${recalculated.production.authority.nextAction?.id}`);
  const event = createProductionEvent({workspace: current, action: "compile-current-storyboard-motion-design-authority", targetId: compiled.report.motionDesignSetSha256, payload: {storyboardRevisionSha256: authority.lastRevisionSha256 || null, motionDesignSetSha256: compiled.report.motionDesignSetSha256, shotCount: compiled.report.shotCount, shaRepairShotIds: shaRepairs.map((item) => item.shotId), userVisualApproval: "NOT_APPROVED", productionAdmission: false, assemblyAllowed: false, fullFilmMotionAllowed: false}, now});
  recalculated.production.eventLedger.eventCount += 1;recalculated.production.eventLedger.lastEventId = event.eventId;recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, binaryFiles, files: {"current-storyboard-motion-design-authority-v1/report.json": {...compiled.report, shaRepairs, compiledAt: now}}});
  output.workspaceSha256After = committed.workspaceSha256;output.nextActionAfter = recalculated.production.authority.nextAction;return output;
};
const result = dryRun ? await execute() : await withProjectLock(appRoot, execute);
console.log(JSON.stringify(result, null, 2));
