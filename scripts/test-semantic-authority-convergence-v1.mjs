#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildCanonicalDirectorAuthority,
  buildCanonicalTargetRepairManifest,
  assertCanonicalDirectorAuthority,
} from "../apps/studio-next/src/lib/a1-canonical-director-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const sourceRevisionHash = "source-revision-fixture";
const director = (shotId, editMode, sourceText, typographyRole, materialGate = "READY") => ({
  shotId,
  order: Number(shotId.replace("ED-", "")),
  editMode,
  sourceText,
  typographyRole,
  mediumDecisionReason: `director-rationale-${shotId}`,
  packageBrief: `package-brief-${shotId}`,
  materialGate,
  requiredMaterialIds: [],
  missingMaterialIds: materialGate === "BLOCKED_MEDIA_MISSING" ? ["fixture-material"] : [],
});
const presentation = (shotId, informationOwner, frameOccupation, generationAllowed, sourceText) => ({
  shotId,
  informationOwner,
  frameOccupation,
  typographyDuty: informationOwner === "presenter" ? "attached-keyword" : "none",
  generationAllowed,
  sourceSha256: requireHash(sourceText),
});
const coverage = (shotId, editMode, route, packageDecision, sourceText) => ({shotId, editMode, route, packageDecision, sourceText});
const runtime = (shotId, packageDecision, sourceText, finalPackageDecision = packageDecision) => ({
  shotId,
  packageDecision,
  sourceText,
  sourceHash: `timeline-${shotId}`,
  sequenceReview: {finalPackageDecision, finalPackageMode: finalPackageDecision === "PACKAGE" ? "TYPOGRAPHY" : null},
});
const requireHash = (value) => crypto.createHash("sha256").update(value).digest("hex");

const sources = {
  "ED-07": "有人可能会说，为什么不让它直接写完全文？",
  "ED-13": "不得不说，国产模型写中文确实会顺一些，但问题也并没有彻底解决。",
  "ED-14": "在这项英文新闻样本里，表达范围可能变窄。",
  "ED-19": "先整理主线，再读取风格库，最后检查硬伤。",
  "ED-23": "历史主题会按文章分开存。",
  "ED-32": "这不是一键好稿工具，依然需要人工修改。",
};
const directors = [
  director("ED-07", "presenter-overlay", sources["ED-07"], "question-premise-and-escalation", "BLOCKED_MEDIA_MISSING"),
  director("ED-13", "presenter-overlay", sources["ED-13"], "argument-pivot", "BLOCKED_MEDIA_MISSING"),
  director("ED-14", "full-package", sources["ED-14"], "research-boundary", "READY"),
  director("ED-19", "full-package", sources["ED-19"], "object-labels-and-responsibility-cues", "READY"),
  director("ED-23", "full-package", sources["ED-23"], "presenter-bound-editorial-phrase", "BLOCKED_MEDIA_MISSING"),
  director("ED-32", "presenter-clean", sources["ED-32"], "none", "BLOCKED_MEDIA_MISSING"),
];
directors.find((item) => item.shotId === "ED-14").semanticSourceCorrection = {status: "APPLIED", sourceTextOriginal: "旧的泛化研究句"};
const presentations = [
  presentation("ED-07", "presenter", "negative-space", true, sources["ED-07"]),
  presentation("ED-13", "presenter", "negative-space", true, sources["ED-13"]),
  presentation("ED-14", "evidence", "macro", false, "旧的泛化研究句"),
  presentation("ED-19", "evidence", "full-bleed", false, sources["ED-19"]),
  presentation("ED-23", "real-screen", "split", false, sources["ED-23"]),
  presentation("ED-32", "presenter", "quiet-field", false, sources["ED-32"]),
];
const coverages = [
  coverage("ED-07", "presenter-overlay", "PRESENTER_BASE", "NO_PACKAGE", sources["ED-07"]),
  coverage("ED-13", "presenter-overlay", "PRESENTER_BASE", "NO_PACKAGE", sources["ED-13"]),
  coverage("ED-14", "full-package", "PACKAGE_LOOK_MASTER", "PACKAGE", "旧的泛化研究句"),
  coverage("ED-19", "full-package", "PACKAGE_LOOK_MASTER", "PACKAGE", sources["ED-19"]),
  coverage("ED-23", "full-package", "SCREEN_EVIDENCE", "NO_PACKAGE", sources["ED-23"]),
  coverage("ED-32", "presenter-clean", "PRESENTER_BASE", "NO_PACKAGE", sources["ED-32"]),
];
const runtimes = [
  runtime("ED-07", "PACKAGE", sources["ED-07"]),
  runtime("ED-13", "PACKAGE", sources["ED-13"]),
  runtime("ED-14", "PACKAGE", sources["ED-14"]),
  runtime("ED-19", "PACKAGE", sources["ED-19"]),
  runtime("ED-23", "NO_PACKAGE", sources["ED-23"], "PACKAGE"),
  runtime("ED-32", "PACKAGE", sources["ED-32"]),
];
const workspace = {
  article: {shotCount: directors.length},
  production: {shotIntelligence: {sourceHash: "runtime-source", decisionSet: {sourceRevisionHash, sha256: "decision-set-fixture", items: runtimes}}},
};
const authority = buildCanonicalDirectorAuthority({
  workspace,
  directorRun: {plan: {source: {articleSha256: "article-fixture", timelineSha256: "timeline-fixture"}, shots: directors}},
  presentationSet: {items: presentations},
  coveragePlan: {shotPlans: coverages},
});
assertCanonicalDirectorAuthority(authority, {expectedShotCount: directors.length});
const manifest = buildCanonicalTargetRepairManifest(authority, {
  workspaceSha256: "workspace-fixture",
  repairScopeShotIds: ["ED-07", "ED-08", "ED-13", "ED-19"],
});

assert.equal(authority.decisions.find((item) => item.shotId === "ED-32").canonicalMedium, "presenter-clean");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-32").canonicalTypographyVisualRole, "NONE");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-07").canonicalTypographyVisualRole, "PRESENTER_HEADLINE");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-19").canonicalTypographyVisualRole, "HERO_TAKEOVER");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-32").generationAllowed, false);
assert.equal(authority.decisions.find((item) => item.shotId === "ED-23").generationAllowed, false);
assert.equal(authority.decisions.find((item) => item.shotId === "ED-23").status, "EXPECTED_NO_GENERATION");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-23").conflictAudit.status, "PASS");
assert.equal(authority.decisions.find((item) => item.shotId === "ED-14").sourceAudit.status, "CURRENT_CORRECTION_BOUND");
assert.deepEqual(manifest.targetRepairShotIds, ["ED-07", "ED-13", "ED-19"]);
assert.deepEqual(manifest.generationEligibleShotIds, []);
for (const decision of authority.decisions) {
  if (decision.conflictAudit.status === "CONFLICT") assert.equal(decision.generationAllowed, false);
}
// This fixture is intentionally historical. It proves the old three-shot
// result cannot silently become the current production checkpoint.
assert.notDeepEqual(manifest.targetRepairShotIds, ["ED-07", "ED-08", "ED-13", "ED-19"]);
const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const live = readProjectWorkspace(appRoot);
const liveAuthority = live.production.shotIntelligence.canonicalDirectorAuthority;
const liveManifest = live.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
const currentAuthorityFile = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-authority-convergence-v1/canonical-director-authority.json");
const currentManifestFile = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/semantic-authority-convergence-v1/target-repair-manifest.json");
const persistedAuthority = JSON.parse(fs.readFileSync(currentAuthorityFile, "utf8"));
const persistedManifest = JSON.parse(fs.readFileSync(currentManifestFile, "utf8"));
const currentScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
const currentGenerationEligibleScope = ["ED-08", "ED-13", "ED-19"];
assert.equal(liveAuthority.authoritySha256, persistedAuthority.authoritySha256);
assert.equal(liveManifest.manifestSha256, persistedManifest.manifestSha256);
assert.equal(liveManifest.authoritySha256, liveAuthority.authoritySha256);
assert.equal(liveManifest.sourceRevisionHash, liveAuthority.sourceRevisionHash);
// After convergence, canonical authority and the current decision set must
// share the same source revision. Historical projections remain separate
// artifacts and cannot overwrite this current pair.
assert.equal(liveAuthority.sourceRevisionHash, live.production.shotIntelligence.decisionSet.sourceRevisionHash);
assert.deepEqual(liveManifest.targetRepairShotIds, currentScope);
assert.deepEqual(liveManifest.generationEligibleShotIds, currentGenerationEligibleScope);
assert.equal(liveManifest.entries.find((item) => item.shotId === "ED-08").status, "TARGET_REPAIR_GENERATION_ELIGIBLE");
assert.equal(liveManifest.entries.find((item) => item.shotId === "ED-08").generationAllowed, true);
assert.equal(liveManifest.generationDispatched, false);
assert.equal(liveManifest.boardRebuilt, false);
console.log(JSON.stringify({
  status: "PASS",
  contract: liveAuthority.contract,
  checkpoint: "CURRENT_CANONICAL_FOUR_SHOT_SCOPE_THREE_SHOT_DELTA",
  authoritySha256: liveAuthority.authoritySha256,
  manifestSha256: liveManifest.manifestSha256,
  sourceRevisionHash: liveAuthority.sourceRevisionHash,
  targetRepairShotIds: liveManifest.targetRepairShotIds,
  generationEligibleShotIds: liveManifest.generationEligibleShotIds,
  historicalFixture: {targetRepairShotIds: manifest.targetRepairShotIds, generationEligibleShotIds: manifest.generationEligibleShotIds},
}, null, 2));
