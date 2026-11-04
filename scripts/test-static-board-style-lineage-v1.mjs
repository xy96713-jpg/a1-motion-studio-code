#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const authority = board.styleLineageAuthority;
const expectedShotIds = board.items.map((item) => item.shotId);

const liveAudit = auditStaticBoardStyleLineage({items: board.items, expectedShotIds, styleSystem: authority.styleSystem});
assert.equal(liveAudit.status, "PASS");
assert.equal(authority.status, "PASS");
assert.equal(authority.currentBoardSha256, board.sha256);

const canonicalScope = buildCanonicalStaticBoardScope(workspace, {boardItems: board.items});
assert.equal(canonicalScope.status, "PASS");

const sourceBindingTamper = structuredClone(workspace);
sourceBindingTamper.production.shotIntelligence.wholeFilmStaticBoard.items.find((item) => item.styleLineage?.pixelTreatment === "RECOMPOSED").styleLineage.sourceArtifactSha256 = "0".repeat(64);
const sourceBindingScope = buildCanonicalStaticBoardScope(sourceBindingTamper, {boardItems: sourceBindingTamper.production.shotIntelligence.wholeFilmStaticBoard.items});
assert.equal(sourceBindingScope.status, "BLOCKED");
assert.ok(sourceBindingScope.modeCompatibilityFailures.some((failure) => failure.code === "BOARD_ITEM_NOT_BOUND_TO_CREATOR_PALETTE_OR_CURRENT_STYLE_LINEAGE"));

const metadataOnlyTamper = structuredClone(workspace);
const metadataOnlyItem = metadataOnlyTamper.production.shotIntelligence.wholeFilmStaticBoard.items.find((item) => item.styleLineage?.pixelTreatment === "RECOMPOSED");
metadataOnlyItem.styleLineage.compositionMethod = "CREATOR_PALETTE_BOUND_ZERO_GENERATION_REBIND";
const metadataOnlyAudit = auditStaticBoardStyleLineage({items: metadataOnlyTamper.production.shotIntelligence.wholeFilmStaticBoard.items, expectedShotIds, styleSystem: authority.styleSystem});
assert.equal(metadataOnlyAudit.status, "BLOCK");
assert.ok(metadataOnlyAudit.items.find((item) => item.shotId === metadataOnlyItem.shotId).failures.includes("METADATA_ONLY_REBIND_FORBIDDEN"));

const currentCompositeAuditTamper = structuredClone(workspace);
const currentCompositeAuditItem = currentCompositeAuditTamper.production.shotIntelligence.wholeFilmStaticBoard.items.find((item) => item.shotId === "ED-07");
currentCompositeAuditItem.styleLineage.compositeVisualAudit.compositeSha256 = "0".repeat(64);
const currentCompositeAudit = auditStaticBoardStyleLineage({items: currentCompositeAuditTamper.production.shotIntelligence.wholeFilmStaticBoard.items, expectedShotIds, styleSystem: authority.styleSystem});
assert.equal(currentCompositeAudit.status, "BLOCK");
assert.ok(currentCompositeAudit.items.find((item) => item.shotId === "ED-07").failures.includes("CURRENT_COMPOSITE_ACTUAL_PIXEL_AUDIT_REQUIRED"));

const illustrationBindingTamper = structuredClone(workspace);
const illustrationItem = illustrationBindingTamper.production.shotIntelligence.wholeFilmStaticBoard.items.find((item) => item.styleLineage?.visualMaterialRoute === "ILLUSTRATION_LED");
illustrationItem.styleLineage.illustrationBinding = null;
const illustrationAudit = auditStaticBoardStyleLineage({items: illustrationBindingTamper.production.shotIntelligence.wholeFilmStaticBoard.items, expectedShotIds, styleSystem: authority.styleSystem});
assert.equal(illustrationAudit.status, "BLOCK");
assert.ok(illustrationAudit.items.find((item) => item.shotId === illustrationItem.shotId).failures.includes("ILLUSTRATION_BINDING_REQUIRED"));

const titleRunTamper = structuredClone(workspace);
for (const item of titleRunTamper.production.shotIntelligence.wholeFilmStaticBoard.items.slice(0, 3)) {
  item.styleLineage.visualMaterialRoute = "TYPOGRAPHY_DOMINANT";
  item.styleLineage.typographyJustification = "TEST_ONLY_SEMANTIC_TITLE_ACTOR";
}
const titleRunAudit = auditStaticBoardStyleLineage({items: titleRunTamper.production.shotIntelligence.wholeFilmStaticBoard.items, expectedShotIds, styleSystem: authority.styleSystem});
assert.equal(titleRunAudit.status, "BLOCK");
assert.ok(titleRunAudit.failures.includes("THREE_CONSECUTIVE_TYPOGRAPHY_DOMINANT_SHOTS_FORBIDDEN"));

const authorityTamper = structuredClone(workspace);
authorityTamper.production.shotIntelligence.wholeFilmStaticBoard.styleLineageAuthority.current = false;
const authorityScope = buildCanonicalStaticBoardScope(authorityTamper, {boardItems: authorityTamper.production.shotIntelligence.wholeFilmStaticBoard.items});
assert.equal(authorityScope.status, "BLOCKED");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1StaticBoardStyleLineageTest/v1",
  boardSha256: board.sha256,
  itemCount: board.items.length,
  recomposedCount: board.items.filter((item) => item.styleLineage.pixelTreatment === "RECOMPOSED").length,
  preservedStrongMasterCount: board.items.filter((item) => item.styleLineage.pixelTreatment === "PRESERVED_STRONG_MASTER").length,
  metadataOnlyRebindFailsClosed: true,
  currentCompositePixelAuditFailsClosed: true,
  illustrationBindingFailsClosed: true,
  consecutiveTitleRunFailsClosed: true,
  sourceBindingTamperFailsClosed: true,
  inactiveAuthorityFailsClosed: true,
}, null, 2));
