#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {buildCurrentFilmManifest, CURRENT_FILM_CONTRACT, CURRENT_FILM_STATES} from "../lib/current-film-manifest.js";

const root = process.cwd();
const publicManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-film-audit-v1");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/current-film-audit-v1");
const expected = buildCurrentFilmManifest(root);
const published = fs.existsSync(publicManifestPath) ? JSON.parse(fs.readFileSync(publicManifestPath, "utf8")) : null;
const checks = {
  manifestPublished: Boolean(published),
  contract: published?.contract === CURRENT_FILM_CONTRACT,
  validState: CURRENT_FILM_STATES.includes(published?.state),
  buildIdMatchesLiveInputs: published?.current?.buildId === expected.current.buildId,
  stateMatchesLiveInputs: published?.state === expected.state,
  storyboardRendererParityReported: published?.gates?.board?.storyboardRendererParity === expected.gates.board.storyboardRendererParity,
  staleLegacyNeverCurrent: (published?.legacyArtifacts || []).every((artifact) => artifact.mayBePresentedAsCurrent === false),
  previewRequiresAllBindings: !published?.gates?.currentPreview?.pass || published.gates.currentPreview.bindingFailures.length === 0,
  revisionRequiresCurrentReviewBinding: published?.state !== "NEEDS_REVISION"
    || (published?.gates?.userReview?.pass === true
      && published?.reviewDecision?.status === "needs-revision"
      && published?.reviewDecision?.sourceBindingCurrent === true
      && published?.reviewDecision?.previewShaCurrent === true),
  revisionKeepsExportsLocked: published?.state !== "NEEDS_REVISION"
    || (published?.finalRenderAllowed === false && published?.resolveExportAllowed === false),
  adoptionLedgerBoundToCurrentBuild: published?.adoptionLedger?.contract === "A1SystemLineAdoptionLedger/v1"
    && published?.adoptionLedger?.authority === "subordinate-to-current-film-build"
    && published?.adoptionLedger?.buildId === published?.current?.buildId,
  proofOnlyNeverAdopted: (published?.adoptionLedger?.items || [])
    .filter((item) => item.status === "PROOF_ONLY_NOT_ADOPTED")
    .every((item) => item.adoptedIntoCurrentBuild === false),
  finalRequiresApproval: !published?.finalRenderAllowed || published?.gates?.userApproval?.pass === true,
  resolveRequiresApproval: !published?.resolveExportAllowed || published?.gates?.userApproval?.pass === true,
};
const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
const report = {
  contract: "A1CurrentFilmManifestAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  observed: published ? {
    state: published.state,
    buildId: published.current?.buildId,
    finalRenderAllowed: published.finalRenderAllowed,
    resolveExportAllowed: published.resolveExportAllowed,
    blockers: published.blockers,
    reviewDecision: published.reviewDecision,
    adoptionLedgerSummary: published.adoptionLedger?.summary,
    legacyArtifacts: published.legacyArtifacts,
  } : null,
  nextAction: failures.length ? "rebuild-current-film-manifest" : expected.nextAction,
};
for (const output of [path.join(artifactRoot, "report.json"), path.join(publicRoot, "report.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 2;
