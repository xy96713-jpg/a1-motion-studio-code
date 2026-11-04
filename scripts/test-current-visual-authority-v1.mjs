#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {assertCurrentVisualAuthority, assertGenerationMayUseCurrentVisualAuthority, resolveCurrentVisualAuthority} from "../apps/studio-next/src/lib/a1-current-visual-authority-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const authority = assertCurrentVisualAuthority(resolveCurrentVisualAuthority({appRoot}));
assert.equal(authority.authorityId, "presenter-light-overlay-system-v2");
assert.equal(authority.status, "PENDING_USER_APPROVAL");
assert.equal(authority.candidate.current, false);
assert.equal(authority.candidate.reviewOnly, true);
assert.equal(authority.candidate.productionAdmitted, false);
assert.equal(authority.downstream.legacyProjectionMayDriveGeneration, false);
assert.equal(authority.downstream.generationAllowed, false);
assert.equal(authority.downstream.motionAllowed, false);
assert.throws(() => assertGenerationMayUseCurrentVisualAuthority(authority), /CURRENT_VISUAL_AUTHORITY_REQUIRES_USER_APPROVAL/u);
console.log(JSON.stringify({
  status: "PASS",
  contract: authority.contract,
  authorityId: authority.authorityId,
  authorityStatus: authority.status,
  candidateManifestPath: authority.candidateManifestPath,
  projectionMatchesCandidate: authority.projection.matchesCandidate,
  legacyProjectionMayDriveGeneration: authority.downstream.legacyProjectionMayDriveGeneration,
  generationAllowed: authority.downstream.generationAllowed,
}, null, 2));
