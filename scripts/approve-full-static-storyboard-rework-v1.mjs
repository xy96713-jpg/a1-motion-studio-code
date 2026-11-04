#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("full-static-rework-approval-workspace-cas-required");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`full-static-rework-approval-cas:${current.workspaceSha256}`);
  if (current.production.authority?.nextAction?.id !== "review-full-static-storyboard-rework") throw new Error("full-static-rework-review-authority-required");
  const rework = current.production.staticStoryboardRework;
  const ledger = current.production.currentVisualDecisionLedger;
  if (rework?.status !== "READY_FOR_FULL_STATIC_STORYBOARD_REVIEW" || rework.userVisualApproval !== "PENDING") throw new Error("full-static-rework-review-ready-required");
  if (ledger?.current !== true || ledger.userVisualApproval !== "PENDING" || ledger.animationAllowed !== false || ledger.sourceCandidateReportSha256 !== rework.candidate?.reportSha256) throw new Error("full-static-rework-current-ledger-required");
  const ledgerFile = path.join(publicRoot, ledger.publicUrl.replace(/^\//u, ""));
  const boardFile = path.join(publicRoot, rework.candidate.board.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(ledgerFile) || !fs.existsSync(boardFile) || shaFile(boardFile) !== rework.candidate.board.sha256) throw new Error("full-static-rework-approved-pixels-invalid");
  const persistedLedger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  if (persistedLedger.ledgerSha256 !== ledger.ledgerSha256 || persistedLedger.entries?.length !== 34 || persistedLedger.entries.some((entry) => !fs.existsSync(path.join(publicRoot, entry.selectedFrame.publicUrl.replace(/^\//u, ""))) || shaFile(path.join(publicRoot, entry.selectedFrame.publicUrl.replace(/^\//u, ""))) !== entry.selectedFrame.sha256)) throw new Error("full-static-rework-ledger-pixel-binding-invalid");

  const now = new Date().toISOString();
  let next = structuredClone(current);
  next.production.staticStoryboardRework = {...next.production.staticStoryboardRework, status: "APPROVED_FOR_REPRESENTATIVE_MOTION", userVisualApproval: "APPROVED", animationFrozen: false, approvedAt: now, approvedBy: "user", approvalBasis: "EXPLICIT_USER_CONFIRMATION_2026_08_23"};
  next.production.currentVisualDecisionLedger = {...next.production.currentVisualDecisionLedger, status: "APPROVED_FOR_REPRESENTATIVE_MOTION", userVisualApproval: "APPROVED", animationAllowed: true, approvedAt: now, approvedBy: "user"};
  const priorMotion = structuredClone(next.production.motion || {});
  next.production.motion = {
    contract: "A1RepresentativeMotionGate/v2",
    status: "static-rework-approved-motion-ir-required",
    current: true,
    authorityScope: "CURRENT",
    fullMotionAllowed: false,
    motionApproved: false,
    sourceVisualDecisionLedgerSha256: ledger.ledgerSha256,
    sourceStaticStoryboardReworkReportSha256: rework.candidate.reportSha256,
    historyReadOnly: {...priorMotion, current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededReason: "new-34-shot-static-rework-explicitly-approved"},
    updatedAt: now,
  };
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.production.authority?.nextAction?.id !== "build-package-motion-ir") throw new Error(`full-static-rework-post-approval-authority-invalid:${next.production.authority?.nextAction?.id}`);
  const report = {contract: "A1FullStaticStoryboardReworkUserApproval/v1", status: "PASS", approvedBy: "user", approvedAt: now, workspaceSha256Before: current.workspaceSha256, reworkReportSha256: rework.candidate.reportSha256, boardSha256: rework.candidate.board.sha256, ledgerSha256: ledger.ledgerSha256, shotCount: persistedLedger.entries.length, nextAction: next.production.authority.nextAction, fullMotionAllowed: false, releaseAllowed: false};
  const event = createProductionEvent({workspace: current, action: "approve-full-static-storyboard-rework", targetId: ledger.ledgerSha256, payload: report, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"full-static-storyboard-rework-v4/user-approval.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
