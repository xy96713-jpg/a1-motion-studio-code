#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  sha256Json,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  readProjectWorkspace,
  withProjectLock,
  persistProjectState,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  buildCanonicalDirectorAuthority,
  buildCanonicalTargetRepairManifest,
  assertCanonicalDirectorAuthority,
} from "../apps/studio-next/src/lib/a1-canonical-director-authority-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const directorPath = path.join(phaseRoot, "typography-recall-recompile-v1/director-input.json");
const presentationPath = path.join(phaseRoot, "presentation-decision-set-v1.json");
const coveragePath = path.join(phaseRoot, "shot-visual-coverage-plan-v1.json");
const dryRun = process.argv.includes("--dry-run");
const now = new Date().toISOString();
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const CANONICAL_CORRECTION_ID = "canonical-authority-p0-user-correction-20260819-v2";
const CANONICAL_CORRECTION = {
  correctionId: CANONICAL_CORRECTION_ID,
  appliedAt: now,
  precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
  appendOnly: true,
  rationale: "最新用户纠偏锁定包装边界、真实证据路线与 ED-19 像素窗口母版；EVA 仅是正式字体包装，不得升级为美学母版。",
  corrections: [
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-01",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-clean",
      canonicalMedium: "presenter-clean",
      canonicalPackageDecision: "NO_PACKAGE",
      canonicalTypographyVisualRole: "NONE",
      typographyRole: "none",
      rationale: "PRESENTER_BASE；后续 ED-02/03 承担真实操作证据，ED-01 不包装。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-07",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-overlay",
      canonicalMedium: "presenter-overlay",
      canonicalPackageDecision: "PACKAGE",
      canonicalTypographyVisualRole: "PRESENTER_HEADLINE",
      titleRepairTarget: true,
      rationale: "人物负空间中的大提问标题，不是小问号窗口。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-08",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-overlay",
      canonicalMedium: "presenter-overlay",
      canonicalPackageDecision: "PACKAGE",
      canonicalTypographyVisualRole: "PRESENTER_HEADLINE",
      titleRepairTarget: true,
      rationale: "“AI 常常不说人话”是全片核心口播判断，作为人物负空间中的标题视觉 actor。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-13",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-overlay",
      canonicalMedium: "presenter-overlay",
      canonicalPackageDecision: "PACKAGE",
      canonicalTypographyVisualRole: "PRESENTER_HEADLINE",
      titleRepairTarget: true,
      rationale: "两段式大对比标题，人物作为可信基底，不是两个小卡。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-19",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-overlay",
      canonicalMedium: "presenter-overlay",
      canonicalPackageDecision: "PACKAGE",
      canonicalTypographyVisualRole: "PRESENTER_HEADLINE",
      titleRepairTarget: true,
      rationale: "像素窗口是 ED-19 的画面母版；整理、编排、读取、检查由 EVA 作为正式字体包装层呈现，不能把 EVA 当成整套美学风格。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-23",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "screen-demo",
      canonicalMedium: "screen-demo",
      canonicalPackageDecision: "NO_PACKAGE",
      canonicalTypographyVisualRole: "NONE",
      typographyRole: "none",
      rationale: "文章隔离与近五次版本是真实可验证功能，走 SCREEN_EVIDENCE，不生成概念证据。",
    },
    {
      correctionId: CANONICAL_CORRECTION_ID,
      shotId: "ED-32",
      precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
      editMode: "presenter-clean",
      canonicalMedium: "presenter-clean",
      canonicalPackageDecision: "NO_PACKAGE",
      canonicalTypographyVisualRole: "NONE",
      typographyRole: "none",
      supersedesLegacyBoardOverlay: true,
      rationale: "presenter-clean；产品边界由真实剪辑承载，旧 board overlay superseded。",
    },
  ],
};

function withCanonicalCorrectionLedger(current) {
  const existing = current.production?.canonicalAuthorityCorrectionLedger || null;
  const history = [...(existing?.history || [])];
  if (!history.some((item) => item.correctionId === CANONICAL_CORRECTION_ID)) history.push(CANONICAL_CORRECTION);
  return {
    contract: "A1CanonicalAuthorityCorrectionLedger/v1",
    version: 1,
    appendOnly: true,
    precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
    history,
    activeCorrectionId: CANONICAL_CORRECTION_ID,
    activeCorrectionSha256: sha256Json(CANONICAL_CORRECTION),
  };
}

for (const file of [directorPath, presentationPath, coveragePath]) {
  if (!fs.existsSync(file)) throw new Error(`canonical-authority-input-missing:${file}`);
}

function build(current) {
  const effectiveWorkspace = structuredClone(current);
  effectiveWorkspace.production.canonicalAuthorityCorrectionLedger = withCanonicalCorrectionLedger(current);
  const authority = buildCanonicalDirectorAuthority({
    workspace: effectiveWorkspace,
    directorRun: readJson(directorPath),
    presentationSet: readJson(presentationPath),
    coveragePlan: readJson(coveragePath),
  });
  assertCanonicalDirectorAuthority(authority, {expectedShotCount: current.article?.shotCount || 34});
  const previousManifest = current.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest || null;
  const generatedAt = previousManifest?.authoritySha256 === authority.authoritySha256
    && previousManifest?.sourceRevisionHash === authority.sourceRevisionHash
    ? previousManifest.generatedAt || now
    : now;
  const manifestCandidate = buildCanonicalTargetRepairManifest(authority, {
    workspaceSha256: previousManifest?.authoritySha256 === authority.authoritySha256
      ? previousManifest.sourceWorkspaceSha256 || current.workspaceSha256
      : current.workspaceSha256,
    generatedAt,
    repairScopeShotIds: ["ED-07", "ED-08", "ED-13", "ED-19"],
  });
  const manifest = previousManifest?.authoritySha256 === authority.authoritySha256
    && previousManifest?.sourceRevisionHash === authority.sourceRevisionHash
    && previousManifest?.manifestSha256 === manifestCandidate.manifestSha256
    ? previousManifest
    : manifestCandidate;
  const report = {
    contract: "A1CanonicalDirectorAuthorityConvergenceReport/v1",
    status: authority.status === "PASS" ? "PASS" : "BLOCKED_CONFLICTS_RECORDED",
    checkpoint: "CODE_ONLY_CANONICAL_AUTHORITY_PASS",
    workspaceSha256Before: current.workspaceSha256,
    sourceRevisionHash: authority.sourceRevisionHash,
    authoritySha256: authority.authoritySha256,
    manifestSha256: manifest.manifestSha256,
    shotCount: authority.shotCount,
    explicitRulings: authority.decisions.filter((item) => ["ED-14", "ED-23", "ED-32"].includes(item.shotId)).map((item) => ({
      shotId: item.shotId,
      canonicalMedium: item.canonicalMedium,
      canonicalTypographyRole: item.canonicalTypographyRole,
      canonicalTypographyVisualRole: item.canonicalTypographyVisualRole,
      titlePackagingRequired: item.titlePackagingRequired,
      generationAllowed: item.generationAllowed,
      status: item.status,
      rationale: item.rationale,
      reasonCodes: item.conflictAudit.findings.map((finding) => finding.code),
      overrideProposals: item.conflictAudit.overrideProposals,
    })),
    targetRepairShotIds: manifest.targetRepairShotIds,
    generationEligibleShotIds: manifest.generationEligibleShotIds,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
    assemblyStarted: false,
    layersStarted: false,
    criticStarted: false,
    motionStarted: false,
    queue: current.production?.generation?.summary || null,
    workerStatus: current.production?.generation?.workerStatus || null,
    assemblyCreationAllowed: current.production?.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed ?? false,
    generatedAt: now,
  };
  return {authority, manifest, report, correctionLedger: effectiveWorkspace.production.canonicalAuthorityCorrectionLedger};
}

function hashWorkspace(next) {
  const hashInput = structuredClone(next);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  next.workspaceSha256 = sha256Json(hashInput);
  if (next.reviewLedger) next.reviewLedger.workspaceSha256 = next.workspaceSha256;
  return next;
}

const result = dryRun
  ? (() => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      return {...build(current), dryRun: true, workspaceSha256After: current.workspaceSha256};
    })()
  : await withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const built = build(current);
      const authorityAlreadyCurrent = current.production?.shotIntelligence?.canonicalDirectorAuthority?.authoritySha256 === built.authority.authoritySha256
        && current.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.manifestSha256 === built.manifest.manifestSha256
        && current.production?.semanticAuthorityConvergence?.manifestSha256 === built.manifest.manifestSha256
        && current.production?.generation?.workerStatus === "frozen";
      if (authorityAlreadyCurrent) {
        built.report.workspaceSha256After = current.workspaceSha256;
        return {...built, commitId: null, dryRun: false, alreadyCurrent: true};
      }
      const next = structuredClone(current);
      next.production.canonicalAuthorityCorrectionLedger = built.correctionLedger;
      next.production.shotIntelligence.canonicalDirectorAuthority = built.authority;
      next.production.shotIntelligence.canonicalDirectorTargetRepairManifest = built.manifest;
      next.production.semanticAuthorityConvergence = {
        contract: "A1SemanticAuthorityConvergenceProjection/v1",
        checkpoint: "CODE_ONLY_CANONICAL_AUTHORITY_PASS",
        status: built.report.status,
        sourceRevisionHash: built.authority.sourceRevisionHash,
        authoritySha256: built.authority.authoritySha256,
        manifestSha256: built.manifest.manifestSha256,
        targetRepairShotIds: built.manifest.targetRepairShotIds,
        generationEligibleShotIds: built.manifest.generationEligibleShotIds,
        generationAllowedByCanonicalAuthority: built.manifest.generationEligibleShotIds.length > 0,
        deterministicRules: "BLOCK_OR_PROPOSE_ONLY",
        generationDispatched: false,
        imageGenCalls: 0,
        boardRebuilt: false,
        correctionLedgerId: built.correctionLedger.activeCorrectionId,
      };
      // Recalculate through the same workbench projection used by every
      // project transaction.  Otherwise current-phase can say the repair
      // worker is frozen while workspace.json retains a stale `idle` mirror.
      const projected = recalculateEditorialAssetWorkbench(next, now);
      hashWorkspace(projected);
      assertEditorialAssetWorkbench(projected);
      built.report.workspaceSha256After = projected.workspaceSha256;
      const committed = persistProjectState(appRoot, projected, {
        expectedWorkspaceSha256: current.workspaceSha256,
        files: {
          "semantic-authority-convergence-v1/canonical-director-authority.json": built.authority,
          "semantic-authority-convergence-v1/target-repair-manifest.json": built.manifest,
          "semantic-authority-convergence-v1/report.json": built.report,
        },
      });
      return {...built, ...committed, dryRun: false, alreadyCurrent: false};
    });

console.log(JSON.stringify({
  status: result.report.status,
  checkpoint: result.report.checkpoint,
  workspaceSha256Before: result.report.workspaceSha256Before,
  workspaceSha256After: result.report.workspaceSha256After,
  sourceRevisionHash: result.authority.sourceRevisionHash,
  authoritySha256: result.authority.authoritySha256,
  manifestSha256: result.manifest.manifestSha256,
  targetRepairShotIds: result.manifest.targetRepairShotIds,
  generationEligibleShotIds: result.manifest.generationEligibleShotIds,
  explicitRulings: result.report.explicitRulings,
  generationDispatched: result.report.generationDispatched,
  imageGenCalls: result.report.imageGenCalls,
  boardRebuilt: result.report.boardRebuilt,
  correctionLedgerId: result.correctionLedger?.activeCorrectionId || null,
  dryRun: result.dryRun,
  alreadyCurrent: result.alreadyCurrent || false,
}, null, 2));
