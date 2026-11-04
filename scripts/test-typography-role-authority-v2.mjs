import assert from "node:assert/strict";
import fs from "node:fs";
import {
  A1_TYPOGRAPHY_ROLES_V2,
  A1_TYPOGRAPHY_PROGRAM_MODES_V2,
  assertTypographyAssignmentV2,
  deriveTypographyProgramMode,
  displayCopyForTypographyRole,
  figmaMasterFamilyForTypographyRole,
  fontConfigurationForTypographyRole,
  resolveTypographyRoleV2,
  typographyRoleAuthorityReceipt,
} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";

assert.equal(Object.keys(A1_TYPOGRAPHY_ROLES_V2).length, 12);
assert.equal(Object.keys(A1_TYPOGRAPHY_PROGRAM_MODES_V2).length, 5);
assert.equal(resolveTypographyRoleV2({semanticEvent: "ordinary"}), "NO_TYPE");
assert.equal(resolveTypographyRoleV2({editMode: "screen-demo", typographyRole: "source-interface-text"}), "SOURCE_NATIVE");
assert.equal(resolveTypographyRoleV2({carrierType: "SCREEN_RECORDING", semanticEvent: "PROCESS", typeIntent: "HERO"}), "SOURCE_NATIVE");
assert.equal(resolveTypographyRoleV2({carrierType: "PRESENTER", semanticEvent: "IDENTITY", typeIntent: "HERO"}), "PRESENTER_HERO");
assert.equal(resolveTypographyRoleV2({carrierType: "PRESENTER", semanticEvent: "STRONG_CONTRAST", typeIntent: "MASKED_HERO"}), "PRESENTER_HERO");
assert.equal(resolveTypographyRoleV2({carrierType: "PRESENTER", semanticEvent: "STRONG_CONTRAST", importance: 0.86}), "PRESENTER_HERO");
assert.equal(resolveTypographyRoleV2({carrierType: "PRESENTER", semanticEvent: "QUESTION", importance: 0.4}), "PRESENTER_MARKER");
assert.equal(resolveTypographyRoleV2({carrierType: "PRESENTER", semanticEvent: "ORDINARY"}), "NO_TYPE");
assert.equal(resolveTypographyRoleV2({carrierType: "FULLSCREEN_IMAGE", semanticEvent: "CHAPTER_BREAK"}), "FULLSCREEN_HERO");
assert.equal(resolveTypographyRoleV2({carrierType: "OBJECT_DETAIL", semanticEvent: "DETAIL"}), "OBJECT_ATTACHED_LABEL");
assert.equal(resolveTypographyRoleV2({editMode: "presenter-clean", semanticEvent: "CONCLUSION"}), "NO_TYPE");
assert.equal(deriveTypographyProgramMode({editMode: "screen-demo", objectProcess: true}), "PRODUCT_TUTORIAL");
assert.equal(deriveTypographyProgramMode({sourceEvidenceRequired: true}), "EVIDENCE_ESSAY");
assert.equal(deriveTypographyProgramMode({objectProcess: true}), "OBJECT_PROCESS_NARRATIVE");
assert.equal(deriveTypographyProgramMode({editMode: "presenter-overlay"}), "LONG_TAKE_OPINION");
assert.equal(deriveTypographyProgramMode({personalNarrative: true}), "PERSONAL_NARRATIVE");
assert.equal(displayCopyForTypographyRole({exactCopy: "为什么？真的！", role: "FULLSCREEN_HERO"}), "为什么 真的");
assert.equal(displayCopyForTypographyRole({exactCopy: "研究：下降？", role: "EVIDENCE_TRANSLATION"}), "研究：下降？");
assert.equal(figmaMasterFamilyForTypographyRole("FULLSCREEN_HERO", {darkReset: true}), "DARK_RESET_VERDICT");
assert.equal(figmaMasterFamilyForTypographyRole("EXPLANATION_DIAGRAM", {roleGrid: true}), "ROLE_GRID_PROCESS");
assert.equal(fontConfigurationForTypographyRole("PRESENTER_MARKER").family, "A1 Fusion Pixel");
assert.equal(fontConfigurationForTypographyRole("EVIDENCE_TRANSLATION").family, "Source Han Sans CN Heavy");
assert.equal(fontConfigurationForTypographyRole("FULLSCREEN_HERO").scaleX, 0.66);
assert.equal(fontConfigurationForTypographyRole("FULLSCREEN_HERO", {scaleX: 0.9}).scaleX, 0.72);
assert.equal(typographyRoleAuthorityReceipt().approval.criticMayApproveNewMaster, false);
assert.throws(() => assertTypographyAssignmentV2({contract: "A1ShotTypographyAssignment/v2", shotId: "X", programMode: "EVIDENCE_ESSAY", typographyRole: "SOURCE_NATIVE", exactCopy: "原文。", displayCopy: "改文", figmaBinding: null}), /source-copy-mutated/);
assert.throws(() => assertTypographyAssignmentV2({contract: "A1ShotTypographyAssignment/v2", shotId: "X", programMode: "EVIDENCE_ESSAY", typographyRole: "SOURCE_NATIVE", exactCopy: "原文。", displayCopy: "原文。", figmaBinding: {frameNodeId: "1:1"}}), /source-figma-forbidden/);
const runtimeSource = fs.readFileSync(new URL("../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs", import.meta.url), "utf8");
assert.equal(/ED-\d+/u.test(runtimeSource), false, "runtime role authority must not branch on project shot IDs");
console.log("typography-role-authority-v2:PASS");
