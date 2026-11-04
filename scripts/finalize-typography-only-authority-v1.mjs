import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/typography-only-authority-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha(fs.readFileSync(file));
const baseline = readJson(path.join(workDir, "baseline.json"));
const library = readJson(path.join(root, "work/typography-director-v2/figma-typography-master-library-v1.json"));
const contact = readJson(path.join(workDir, "contact-sheet-receipt.json"));
const dutyMap = readJson(path.join(root, "work/typography-director-v2/whole-film-typography-duty-map.json"));
const blind = readJson(path.join(root, "work/typography-director-v2/blind-fixtures/report.json"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const policySource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/TypographyDutyMapPanel.tsx"), "utf8");
const typographySop = fs.readFileSync(path.join(root, "docs/A1_TYPOGRAPHY_SOP.md"), "utf8");
const design = fs.readFileSync(path.join(root, "DESIGN.md"), "utf8");
const failures = [];

if (fileSha(workspacePath) !== baseline.formalWorkspaceFileSha256) failures.push("FORMAL_WORKSPACE_CHANGED");
if (fileSha(boardPath) !== baseline.formalBoardManifestSha256) failures.push("FORMAL_BOARD_CHANGED");
if (library.status !== "READY_FOR_USER_VISUAL_APPROVAL" || library.outputMode !== "TRANSPARENT_GLYPH_ASSET" || library.authoredBackgroundAllowed !== false) failures.push("MASTER_LIBRARY_BOUNDARY_INVALID");
if (library.bindings?.length !== 6 || library.bindings.some((item) => item.typographyOnlyAudit?.status !== "PASS" || item.typographyOnlyAudit?.componentFillCount !== 0 || item.typographyOnlyAudit?.visibleNonGlyphLeafCount !== 0 || item.typographyOnlyAudit?.visibleStandaloneShapeCount !== 0)) failures.push("MASTER_STRUCTURE_NOT_TYPOGRAPHY_ONLY");
if (library.scaleReviews?.length !== 18 || library.scaleReviews.some((item) => !item.renderPass)) failures.push("TRANSPARENT_SCALE_REVIEW_FAILED");
if (contact.status !== "PASS" || contact.reviewPlate?.exportAllowed !== false || contact.checks?.some((item) => item.forbiddenSvgElementCount !== 0)) failures.push("CONTACT_SHEET_OR_SVG_AUDIT_FAILED");
if (dutyMap.sequenceLedger?.status !== "PASS_REVIEW_ONLY" || dutyMap.summary?.sequenceRiskCount !== 0) failures.push("SEQUENCE_LEDGER_REGRESSION");
if (blind.status !== "PASS" || blind.articleCount !== 6) failures.push("BLIND_FIXTURE_REGRESSION");
if (!policySource.includes("A1TypographyOnlyAuthority/v1") || !policySource.includes("TRANSPARENT_GLYPH_ASSET")) failures.push("RUNTIME_POLICY_MISSING");
if (!uiSource.includes("字体包装只处理字")) failures.push("WORKBENCH_BOUNDARY_COPY_MISSING");
if (!typographySop.includes("Typography-only packaging boundary") || !design.includes("Typography packaging scope")) failures.push("DURABLE_DESIGN_RULE_MISSING");

const result = {
  contract: "A1TypographyOnlyAuthorityResult/v1",
  status: failures.length ? "BLOCK" : "PASS",
  failures,
  boundary: {
    designSubject: "TYPE_ONLY",
    formalOutputMode: "TRANSPARENT_GLYPH_ASSET",
    allowed: ["glyph shape", "line break", "tracking", "line height", "scale", "compression", "position", "rotation", "opacity", "glyph color", "glyph-local gradient", "glyph-derived underprint", "glyph slice", "glyph warp", "glyph mask", "deterministic glyph motion"],
    forbidden: ["background", "panel", "card", "color block", "line", "circle", "lens", "presenter placeholder", "evidence placeholder", "object placeholder", "safe-zone stroke", "decorative icon", "debug label", "random grain"],
    neutralReviewPlate: "REVIEW_ONLY_NOT_EXPORTED",
  },
  figma: {
    fileKey: library.figmaFileKey,
    pageNodeId: library.pageNodeId,
    pageName: library.pageName,
    masterCount: library.bindings.length,
    componentFillCount: library.bindings.reduce((sum, item) => sum + item.typographyOnlyAudit.componentFillCount, 0),
    visibleNonGlyphLeafCount: library.bindings.reduce((sum, item) => sum + item.typographyOnlyAudit.visibleNonGlyphLeafCount, 0),
    visibleStandaloneShapeCount: library.bindings.reduce((sum, item) => sum + item.typographyOnlyAudit.visibleStandaloneShapeCount, 0),
    librarySha256: library.librarySha256,
    approvalStatus: library.approvalStatus,
  },
  proof: {
    contactSheet: contact.output,
    contactSheetSha256: contact.outputSha256,
    transparentScaleReviewCount: library.scaleReviews.length,
    transparentSvgCount: library.bindings.reduce((sum, item) => sum + item.semanticSvgFiles.length, 0),
    forbiddenSvgElementCount: contact.checks.reduce((sum, item) => sum + item.forbiddenSvgElementCount, 0),
    dutyMapSha256: dutyMap.dutyMapSha256,
    sequenceLedgerSha256: dutyMap.sequenceLedger.ledgerSha256,
  },
  formalAuthority: {
    workspaceBefore: baseline.formalWorkspaceFileSha256,
    workspaceAfter: fileSha(workspacePath),
    workspaceUnchanged: fileSha(workspacePath) === baseline.formalWorkspaceFileSha256,
    boardBefore: baseline.formalBoardManifestSha256,
    boardAfter: fileSha(boardPath),
    boardUnchanged: fileSha(boardPath) === baseline.formalBoardManifestSha256,
    productionAdmission: false,
    assemblyAllowed: false,
    motionAllowed: false,
    resolveAllowed: false,
    releaseAllowed: false,
  },
  fixtures: blind.reports.map((item) => ({id: item.articleId, genre: item.genre, status: item.sequenceLedger?.status === "PASS_REVIEW_ONLY" ? "PASS" : "BLOCK"})),
  approvalBoundary: {userVisualApproval: "PENDING", implementationPassDoesNotApproveMasterLibrary: true},
  nextAction: "REVIEW_TYPOGRAPHY_ONLY_MASTER_LIBRARY",
};
fs.mkdirSync(workDir, {recursive: true});
fs.writeFileSync(path.join(workDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;

