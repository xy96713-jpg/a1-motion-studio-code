#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertEd10LookMasterCandidateAuthority} from "../apps/studio-next/src/lib/a1-ed10-look-master-candidate-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const expectedIndex = process.argv.indexOf("--expected-workspace-sha");
const expectedWorkspaceSha256 = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed10-direction-c-mirror-expected-workspace-sha-required");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed10-direction-c-mirror-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  const authority = assertEd10LookMasterCandidateAuthority(current.production?.ed10LookMasterCandidateAuthority, {projectRoot});
  const relativeAssetPath = authority.candidate.publicUrl.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
  const relativeManifestPath = authority.candidate.manifestPublicUrl.replace("/generated/system-line/editorial-asset-workbench-v1/", "");
  const assetBytes = fs.readFileSync(path.join(appRoot, "public", authority.candidate.publicUrl));
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public", authority.candidate.manifestPublicUrl), "utf8"));
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  const event = createProductionEvent({workspace: current, action: "repair-ed10-direction-c-authority-mirror-v1", targetId: "ED-10", payload: {candidateAuthoritySha256: authority.authoritySha256, candidateSha256: authority.candidate.sha256, publicArtifactParity: true, generatedImages: false, mediaRenderPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, files: {[relativeManifestPath]: manifest}, binaryFiles: {[relativeAssetPath]: assetBytes}, expectedWorkspaceSha256: current.workspaceSha256, commitId: `repair-ed10-direction-c-authority-mirror-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, transitionSha256: committed.transitionSha256, candidateSha256: authority.candidate.sha256, publicArtifactParity: true, generatedImages: false, mediaRenderPerformed: false};
});

console.log(JSON.stringify(result, null, 2));
