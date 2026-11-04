#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const publicFile = (url) => url?.startsWith("/") ? path.join(publicRoot, url.replace(/^\/+/, "")) : null;

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-16");
  if (!plan || plan.contentTreatment !== "EDITORIAL_EXPLAINER" || plan.frameOccupation !== "SPLIT" || plan.assemblyMode !== "EXPLAINER" || plan.presentationMode !== "EXPLAINER") throw new Error("ed16-current-explainer-plan-required");
  const raw = (runtime.lookMasterRawReferences || []).find((item) => item.shotId === "ED-16" && item.current === true && item.semanticPixelAudit?.status === "PASS");
  if (!raw) throw new Error("ed16-current-semantic-pass-missing");
  const artifactFile = publicFile(raw.artifact?.publicUrl);
  const brief = plan.semanticDesignBrief;
  const directionBound = plan.candidateDirections?.some((direction) => direction.directionId === raw.candidateDirectionId) === true;
  const prompt = String(raw.artifact?.prompt || "");
  const checks = {
    artifactFileExists: Boolean(artifactFile && fs.existsSync(artifactFile)),
    artifactSha256Verified: Boolean(artifactFile && fs.existsSync(artifactFile) && sha256File(artifactFile) === raw.artifact.sha256),
    semanticPixelAuditPass: raw.semanticPixelAudit?.status === "PASS",
    candidateDirectionBound: directionBound,
    exactCopyBoundInPrompt: prompt.includes(`EXACT SOURCE COPY: ${brief?.exactCopy || "__missing_exact_copy__"}`),
    semanticActorBoundInPrompt: prompt.includes(`SEMANTIC ACTOR: ${brief?.semanticActor?.identity || "__missing_actor__"}`),
    semanticActionBoundInPrompt: prompt.includes(`ACTION: ${brief?.semanticActor?.action || "__missing_action__"}`),
    holdFrameBoundInPrompt: prompt.includes(plan.videoContext?.baseFrame?.sha256 || "__missing_hold_frame__"),
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`ed16-rebind-compatibility-failed:${JSON.stringify(checks)}`);
  const previousPlanSha256 = raw.planSha256;
  raw.planSha256 = plan.planSha256;
  raw.styleBriefSha256 = plan.styleBriefSha256;
  raw.current = true;
  raw.selectionEligible = true;
  raw.recommendationEligible = true;
  raw.status = "CURRENT_CREATOR_ROUTE_REBOUND";
  raw.rebindMode = "EXISTING_SEMANTIC_PASS_REBOUND_AFTER_CREATOR_ROUTE_RECONCILIATION";
  raw.rebindSourcePlanSha256 = previousPlanSha256;
  raw.rebindSourceAuditSha256 = raw.semanticPixelAuditSha256;
  raw.rebindCompatibility = {status: "PASS", checks};
  for (const job of next.production.generation.jobs || []) {
    if (job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === raw.artifact.sha256) {
      job.lookMasterPlanSha256 = plan.planSha256;
      job.reconciliation = {status: "CURRENT_CREATOR_ROUTE_REBOUND", previousLookMasterPlanSha256: previousPlanSha256, artifactSha256: raw.artifact.sha256};
    }
  }
  const binding = buildCreatorPaletteShotBindingManifest(next, {now: new Date().toISOString()});
  next.production.creatorPaletteShotBindingManifest = binding;
  const event = createProductionEvent({workspace: current, action: "ed16-current-explainer-pass-rebound", targetId: "ED-16", payload: {previousPlanSha256, currentPlanSha256: plan.planSha256, artifactSha256: raw.artifact.sha256, checks}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  persistProjectState(appRoot, finalWorkspace, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"creator-packaging-palette-binding-v1/manifest.json": binding}});
  return {workspaceSha256: finalWorkspace.workspaceSha256, previousPlanSha256, currentPlanSha256: plan.planSha256, artifactSha256: raw.artifact.sha256, bindingScopeStatus: binding.scopeStatus, conflictShotIds: binding.conflictShotIds || []};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
