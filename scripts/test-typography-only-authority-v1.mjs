import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {typographyRoleAuthorityReceipt} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";
import {A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1, auditTypographyOnlyMasterStructure} from "../apps/studio-next/src/lib/a1-figma-typography-master-binding-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receipt = typographyRoleAuthorityReceipt();
assert.equal(receipt.typographyOnlyBoundary.contract, "A1TypographyOnlyAuthority/v1");
assert.equal(receipt.typographyOnlyBoundary.outputMode, "TRANSPARENT_GLYPH_ASSET");
assert.equal(receipt.typographyOnlyBoundary.neutralInspectionPlate.exportAllowed, false);
assert.ok(receipt.typographyOnlyBoundary.forbiddenVisibleElements.includes("AUTHORED_BACKGROUND"));
assert.ok(receipt.typographyOnlyBoundary.forbiddenVisibleElements.includes("PANEL"));
assert.ok(receipt.typographyOnlyBoundary.forbiddenVisibleElements.includes("PRESENTER_PLACEHOLDER"));
assert.equal(A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1.componentFillAllowed, false);
assert.equal(A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1.standaloneShapeAllowed, false);
assert.equal(A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1.outputMode, "TRANSPARENT_GLYPH_ASSET");

const pass = auditTypographyOnlyMasterStructure({componentFillCount: 0, visibleLeaves: [{id: "1:1", type: "VECTOR", name: "PRIMARY_GLYPH / OUTLINED"}], visibleStandaloneShapeCount: 0, authoredBackgroundPresent: false});
assert.equal(pass.status, "PASS");
assert.equal(pass.visibleNonGlyphLeafCount, 0);
assert.equal(auditTypographyOnlyMasterStructure({componentFillCount: 1, visibleLeaves: []}).status, "BLOCK");
assert.equal(auditTypographyOnlyMasterStructure({componentFillCount: 0, visibleLeaves: [{id: "1:2", type: "RECTANGLE", name: "BACKGROUND"}]}).status, "BLOCK");
assert.equal(auditTypographyOnlyMasterStructure({componentFillCount: 0, visibleLeaves: [{id: "1:3", type: "TEXT", name: "DEBUG LABEL"}]}).status, "BLOCK");

const builder = fs.readFileSync(path.join(root, "scripts/build-figma-typography-master-bindings-v1.mjs"), "utf8");
assert.equal(/staticDecorations|backgroundForFamily/u.test(builder), false, "typography-only builder must not author scene backgrounds or decorations");
assert.ok(builder.includes("TRANSPARENT_GLYPH_ASSET"));
const ui = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/TypographyDutyMapPanel.tsx"), "utf8");
assert.ok(ui.includes("字体包装只处理字"));
console.log("typography-only-authority-v1:PASS");

