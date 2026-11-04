#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const auditPath = path.join(root, "work/background-cap-production-v1/storyboard-wave-15-v1/audit-report.json");
const decisionPath = path.join(root, ".codex-artifacts/system-line-decisions.ndjson");
const expectedSourceWorkspaceSha256 = process.argv[2];
const expectedPersistedWorkspaceSha256 = process.argv[3];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.match(String(expectedSourceWorkspaceSha256 || ""), /^[a-f0-9]{64}$/u, "background-wave-promotion-source-cas-required");
assert.match(String(expectedPersistedWorkspaceSha256 || ""), /^[a-f0-9]{64}$/u, "background-wave-promotion-persisted-cas-required");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
assert.equal(audit.contract, "A1BackgroundStoryboardWaveAudit/v1");
assert.equal(audit.status, "PASS");
assert.equal(audit.fixtureCount, 15);
assert.equal(audit.productionAdmission, false);
const auditSha256 = shaFile(auditPath);
const decisions = fs.readFileSync(decisionPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const approval = decisions.findLast((item) => item.scope === "storyboard-bound-background-screen-wave-15-v1" && item.status === "approved" && item.evidence?.sha256 === auditSha256);
assert.ok(approval, "background-wave-user-approval-required");

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(current.workspaceSha256, expectedSourceWorkspaceSha256, "background-wave-promotion-source-workspace-cas");
  assert.equal(current.workspaceSha256, audit.sourceWorkspaceSha256, "background-wave-source-workspace-drift");
  const next = structuredClone(current);
  const authority = next.production.shotIntelligence.currentStoryboardAuthority;
  const files = {};
  const binaryFiles = {};
  const promoted = [];
  const family = "current-storyboard-authority-v1/background-screen-wave-15-v1";
  for (const fixture of audit.fixtures) {
    assert.equal(fixture.status, "PASS", `background-wave-fixture-not-pass:${fixture.id}`);
    const shot = authority.shots.find((item) => item.shotId === fixture.id);
    assert.ok(shot, `background-wave-storyboard-shot-missing:${fixture.id}`);
    assert.equal(shot.versionId, fixture.storyboardBinding.versionId, `background-wave-version-drift:${fixture.id}`);
    assert.equal(shot.revisionSha256, fixture.storyboardBinding.revisionSha256, `background-wave-revision-drift:${fixture.id}`);
    const videoSource = path.join(root, fixture.reviewVideo.path);
    const posterSource = path.join(root, typeof fixture.contactSheet === "string" ? fixture.contactSheet : fixture.contactSheet.path);
    assert.ok(fs.existsSync(videoSource) && fs.existsSync(posterSource), `background-wave-media-missing:${fixture.id}`);
    assert.equal(shaFile(videoSource), fixture.reviewVideo.sha256, `background-wave-video-sha-drift:${fixture.id}`);
    const posterSha256 = shaFile(posterSource);
    if (typeof fixture.contactSheet === "object" && fixture.contactSheet.sha256) assert.equal(posterSha256, fixture.contactSheet.sha256, `background-wave-poster-sha-drift:${fixture.id}`);
    const videoName = `${fixture.id.toLowerCase()}-${fixture.storyboardBinding.revisionSha256.slice(0, 12)}.mp4`;
    const posterName = `${fixture.id.toLowerCase()}-${fixture.storyboardBinding.revisionSha256.slice(0, 12)}-contact.png`;
    const videoPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${family}/${videoName}`;
    const posterPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/${family}/${posterName}`;
    const binding = {
      contract: "A1BackgroundScreenCurrentStoryboardBinding/v1",
      status: "USER_APPROVED_FOR_WHOLE_FILM_540P_REVIEW",
      shotId: fixture.id,
      videoPublicUrl,
      videoSha256: fixture.reviewVideo.sha256,
      posterPublicUrl,
      posterSha256,
      sourceAuditSha256: auditSha256,
      sourceWorkspaceSha256: audit.sourceWorkspaceSha256,
      sourceStoryboardVersionId: fixture.storyboardBinding.versionId,
      sourceStoryboardRevisionSha256: fixture.storyboardBinding.revisionSha256,
      cameraRecipeSha256: fixture.storyboardBinding.cameraRecipeSha256,
      actionContractSha256: fixture.storyboardBinding.actionContractSha256,
      userDecisionLineSha256: approval.lineSha256,
      userVisualApproval: "APPROVED_BY_USER",
      productionAdmission: false,
      reviewScope: "ONE_NEW_540P_WHOLE_FILM_CANDIDATE",
      promotedAt: new Date().toISOString(),
    };
    shot.backgroundScreenCandidate = binding;
    shot.assetBindingStatus = binding.status;
    binaryFiles[`${family}/${videoName}`] = fs.readFileSync(videoSource);
    binaryFiles[`${family}/${posterName}`] = fs.readFileSync(posterSource);
    files[`${family}/${fixture.id}-promotion.json`] = {contract: "A1BackgroundScreenShotPromotion/v1", status: "PASS", binding};
    promoted.push({shotId: fixture.id, videoSha256: binding.videoSha256, revisionSha256: binding.sourceStoryboardRevisionSha256});
  }
  const now = new Date().toISOString();
  authority.backgroundScreenWave = {contract: "A1BackgroundScreenWavePromotion/v1", status: "APPROVED_FOR_540P_REVIEW_REBUILD", auditSha256, userDecisionLineSha256: approval.lineSha256, shotIds: promoted.map((item) => item.shotId), promotedAt: now};
  next.production.motion.fullFilmMotionSpecPlan = {...next.production.motion.fullFilmMotionSpecPlan, status: "SCREEN_SOURCE_RECOMPILE_REQUIRED"};
  next.production.release.review540p = {...next.production.release.review540p, status: "blocked-by-approved-screen-source-change", supersededSha256: next.production.release.review540p.sha256 || null};
  next.production.release.final1080p = {...next.production.release.final1080p, status: "NOT_READY"};
  next.production.release.davinciPackage = {...next.production.release.davinciPackage, status: "NOT_READY"};
  delete next.production.packagingTemporalReadabilityAuthority;
  let recalculated = recalculateEditorialAssetWorkbench(next, now);
  recalculated.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(recalculated, {now});
  recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(recalculated, now));
  const event = createProductionEvent({workspace: current, action: "promote-background-screen-wave-15", targetId: auditSha256, payload: {promoted, userDecisionLineSha256: approval.lineSha256, productionAdmission: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1BackgroundScreenWavePromotion/v1", status: "PASS", auditSha256, userDecisionLineSha256: approval.lineSha256, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, promoted, productionAdmission: false, finalReleaseAllowed: false, promotedAt: now};
  files[`${family}/promotion-report.json`] = report;
  const committed = await persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: expectedPersistedWorkspaceSha256, files, binaryFiles});
  return {...report, workspaceSha256After: committed.workspaceSha256};
});
console.log(JSON.stringify(result, null, 2));
