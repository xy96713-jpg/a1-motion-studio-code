#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {typographyEffectCatalog, typographyEffectForbiddenMechanisms} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/semantic-typography-effect-vocabulary-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const baseline = readJson(path.join(workDir, "baseline.json"));
const render = readJson(path.join(workDir, "render-manifest.json"));
const blind = readJson(path.join(workDir, "blind-fixture-effect-report.json"));
const map = readJson(path.join(root, "work/typography-director-v2/whole-film-typography-duty-map.json"));
const ledger = readJson(path.join(root, "work/typography-director-v2/typography-effect-sequence-ledger.json"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const boardPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const publicContact = path.join(root, "apps/studio-next/public/generated/system-line/typography-director-v2/effect-vocabulary/typography-effect-vocabulary-contact-sheet.png");
const uiSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/TypographyDutyMapPanel.tsx"), "utf8");
const catalog = typographyEffectCatalog();
const failures = [];

if (catalog.length !== 10) failures.push("EFFECT_CATALOG_COUNT_INVALID");
const serialized = JSON.stringify(catalog).toLowerCase();
for (const forbidden of typographyEffectForbiddenMechanisms()) if (serialized.includes(forbidden)) failures.push(`FORBIDDEN_EFFECT_MECHANISM:${forbidden}`);
if (render.status !== "PASS" || render.effectCount !== 10 || render.specimens.some((item) => !item.formalPass)) failures.push("EFFECT_RENDER_NOT_READY");
if (ledger.status !== "PASS_REVIEW_ONLY" || ledger.failures.length !== 0) failures.push("EFFECT_SEQUENCE_BLOCKED");
if (map.summary.effectSequenceRiskCount !== 0 || map.summary.effectFamilyCount < 7 || map.summary.noEffectCount < 20) failures.push("WHOLE_FILM_EFFECT_DISTRIBUTION_INVALID");
if (map.assignments.filter((item) => ["SOURCE_NATIVE", "NO_TYPE", "CAPTION", "EVIDENCE_HIGHLIGHT"].includes(item.typographyRole)).some((item) => item.effectProgram?.effectId !== "NONE")) failures.push("PROTECTED_ROLE_EFFECT_REGRESSION");
if (blind.status !== "PASS" || blind.fixtures.length !== 6) failures.push("BLIND_EFFECT_FIXTURES_FAILED");
if (fileSha(workspacePath) !== baseline.formalWorkspaceFileSha256) failures.push("FORMAL_WORKSPACE_CHANGED");
if (fileSha(boardPath) !== baseline.formalBoardManifestSha256) failures.push("FORMAL_BOARD_CHANGED");
if (!fs.existsSync(publicContact) || fileSha(publicContact) !== render.contactSheetSha256) failures.push("PUBLIC_EFFECT_CONTACT_SHEET_MISMATCH");
if (!uiSource.includes("纯字形效果词汇表") || !uiSource.includes("effectProgram?.effectId")) failures.push("WORKBENCH_EFFECT_VIEW_MISSING");

const result = {
  contract: "A1SemanticTypographyEffectVocabularyResult/v1",
  status: failures.length ? "BLOCK" : "PASS",
  failures,
  vocabulary: {
    contract: "A1TypographyEffectAuthority/v1",
    effectCount: catalog.length,
    effectIds: catalog.map((item) => item.id),
    outputMode: "TRANSPARENT_GLYPH_ASSET",
    authoredSceneElementsAllowed: false,
    cleanReadableHoldRequired: true,
  },
  wholeFilm: {
    shotCount: map.assignments.length,
    usedEffectFamilyCount: map.summary.effectFamilyCount,
    expressiveEffectCount: map.summary.expressiveEffectCount,
    noEffectCount: map.summary.noEffectCount,
    effectCounts: map.summary.effectCounts,
    sequenceRiskCount: map.summary.effectSequenceRiskCount,
    dutyMapSha256: map.dutyMapSha256,
    effectLedgerSha256: ledger.ledgerSha256,
  },
  proof: {
    contactSheet: render.contactSheet,
    contactSheetSha256: render.contactSheetSha256,
    transparentSpecimenCount: render.specimens.length,
    publicContactSheet: "/generated/system-line/typography-director-v2/effect-vocabulary/typography-effect-vocabulary-contact-sheet.png",
    workbenchViewVerified: true,
  },
  fixtures: blind.fixtures,
  formalAuthority: {
    workspaceBefore: baseline.formalWorkspaceFileSha256,
    workspaceAfter: fileSha(workspacePath),
    workspaceUnchanged: fileSha(workspacePath) === baseline.formalWorkspaceFileSha256,
    boardBefore: baseline.formalBoardManifestSha256,
    boardAfter: fileSha(boardPath),
    boardUnchanged: fileSha(boardPath) === baseline.formalBoardManifestSha256,
    productionAdmission: false,
    motionAllowed: false,
    assemblyAllowed: false,
    resolveAllowed: false,
    releaseAllowed: false,
  },
  approvalBoundary: {userVisualApproval: "PENDING", implementationPassDoesNotApproveEffectVocabulary: true},
  nextAction: "REVIEW_TYPOGRAPHY_EFFECT_VOCABULARY_AND_34_SHOT_DISTRIBUTION",
};
fs.writeFileSync(path.join(workDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;

