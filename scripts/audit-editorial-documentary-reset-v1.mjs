#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "editorial-documentary-reset-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer/public", phaseId);
const paths = {
  report: path.join(artifactRoot, "report.json"),
  reportPublic: path.join(publicRoot, "report.json"),
  plan: path.join(artifactRoot, "plan.json"),
  planPublic: path.join(publicRoot, "plan.json"),
  capture: path.join(artifactRoot, "source/report.json"),
  props: path.join(root, "remotion-renderer/src/generated/editorialDocumentaryPilotProps.json"),
  currentProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  video: path.join(artifactRoot, "editorial-documentary-pilot.mp4"),
  videoPublic: path.join(publicRoot, "editorial-documentary-pilot.mp4"),
  poster: path.join(artifactRoot, "editorial-documentary-poster.png"),
  posterPublic: path.join(publicRoot, "editorial-documentary-poster.png"),
  contactSheet: path.join(artifactRoot, "editorial-documentary-contact-sheet.png"),
  contactSheetPublic: path.join(publicRoot, "editorial-documentary-contact-sheet.png"),
  audio: path.join(rendererRoot, "audio/july1-opening-43s.wav"),
  manifest: path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json"),
  page: path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx"),
  remotionRoot: path.join(root, "remotion-renderer/src/Root.tsx"),
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const exists = (file) => fs.existsSync(file);
const filesPresent = Object.values(paths).every(exists);
if (!filesPresent) {
  const missing = Object.entries(paths).filter(([, file]) => !exists(file)).map(([id]) => id);
  console.error(JSON.stringify({status: "FAIL", failures: missing.map((id) => `missing:${id}`)}, null, 2));
  process.exit(2);
}

const report = readJson(paths.report);
const plan = readJson(paths.plan);
const capture = readJson(paths.capture);
const props = readJson(paths.props);
const currentProps = readJson(paths.currentProps);
const manifest = readJson(paths.manifest);
const pageSource = fs.readFileSync(paths.page, "utf8");
const remotionRootSource = fs.readFileSync(paths.remotionRoot, "utf8");
const ledger = manifest.adoptionLedger?.items?.find((item) => item.id === "editorial-documentary-reset-candidate");
const plannedBeatIds = plan.groups?.flatMap((group) => group.beatIds || []) || [];
const sourceBeatIds = (currentProps.scenes || []).map((scene) => scene.beatId);
const capturePaths = Object.values(props.captures || {});

const checks = {
  reportReadyForDirectReview: report.contract === "A1EditorialDocumentaryResetReport/v1"
    && report.status === "READY_FOR_DIRECT_REVIEW"
    && report.reviewOnly === true
    && report.rendererAdoptionAllowed === false
    && report.finalRenderAllowed === false
    && report.resolveExportAllowed === false,
  sourcePlanIsComplete: plan.contract === "A1HSeriesEditorialDocumentaryPlan/v1"
    && plan.status === "READY_FOR_PILOT_REVIEW"
    && plan.groups?.length === 16
    && plannedBeatIds.length === 50
    && new Set(plannedBeatIds).size === 50
    && sourceBeatIds.length === 50
    && sourceBeatIds.every((beatId) => plannedBeatIds.includes(beatId)),
  realSourceCaptureIsSafe: capture.contract === "A1EditorialDocumentarySourceCapture/v1"
    && capture.status === "PASS"
    && capture.captures?.length === 8
    && capture.checks?.realRuntimeUsed === true
    && capture.checks?.documentMutationAllowed === false,
  pilotUsesRealSourceOnly: report.summary?.realWorkbenchCaptureCount === 8
    && report.summary?.generatedArtworkCount === 0
    && report.allocation?.pilotGeneratedArtwork === 0
    && capturePaths.length === 8
    && capturePaths.every((assetPath) => assetPath.startsWith(`${phaseId}/source/`)),
  currentPropsAreUnchanged: report.currentPropsUnchanged === true
    && report.currentAuthorityMutated === false
    && report.sourceBinding?.sourcePropsSha256 === sha256(paths.currentProps),
  pilotPropsAreBound: report.pilot?.propsSha256 === sha256(paths.props)
    && props.contract === "A1EditorialDocumentaryPilot/v1"
    && props.reviewOnly === true
    && props.currentAuthorityMutated === false
    && props.beats?.length === 10
    && props.audioSrc === `${phaseId}/audio/july1-opening-43s.wav`,
  renderedMediaAreBound: report.pilot?.video?.status === "rendered"
    && report.pilot.video.hasAudio === true
    && report.pilot.video.sha256 === sha256(paths.video)
    && sha256(paths.videoPublic) === sha256(paths.video)
    && report.pilot.poster.sha256 === sha256(paths.poster)
    && sha256(paths.posterPublic) === sha256(paths.poster)
    && report.pilot.contactSheet.sha256 === sha256(paths.contactSheet)
    && sha256(paths.contactSheetPublic) === sha256(paths.contactSheet),
  reportsArePublishedIdentically: sha256(paths.report) === sha256(paths.reportPublic)
    && sha256(paths.plan) === sha256(paths.planPublic),
  ledgerRejectsScopeError: ledger?.status === "REJECTED_SCOPE_ERROR_NOT_ADOPTED"
    && ledger?.adoptedIntoCurrentBuild === false
    && ledger?.directReviewReady === false
    && ledger?.continuousSceneCount === 16
    && ledger?.sourceBeatCount === 50
    && ledger?.generatedArtworkCount === 0
    && ledger?.currentPropsUnchanged === true
    && ledger?.videoSha256 === report.pilot.video.sha256
    && ledger?.rejectionReason === "system-must-package-user-edited-main-film-not-replace-it-with-screen-recording-documentary",
  versionLinePointsToPackagingReview: manifest.nextAction === "direct-review-picture-packaging-pilot-before-any-timeline-placement"
    && manifest.artifacts?.editorialDocumentaryReset === "apps/studio-next/public/generated/system-line/editorial-documentary-reset-v1/report.json"
    && manifest.artifacts?.picturePackagingPilot === "apps/studio-next/public/generated/system-line/picture-packaging-pilot-v1/report.json",
  reviewPageKeepsDocumentaryAsRejectedHistory: [
    "data-a1-editorial-documentary-reset=\"rejected-scope-history\"",
    "data-a1-editorial-documentary-adoption=\"rejected-scope-error\"",
    "历史：稿台纪实方向越权，已撤下",
    "data-a1-picture-packaging-pilot={picturePackagingReady",
  ].every((marker) => pageSource.includes(marker)),
  documentaryVideoIsNotPresented: !pageSource.includes("data-a1-editorial-documentary-video="),
  documentaryCompositionIsUnregistered: !remotionRootSource.includes("A1EditorialDocumentaryPilot"),
};

const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
const audit = {
  contract: "A1EditorialDocumentaryResetAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  checks,
  summary: {
    sourceBeatCount: sourceBeatIds.length,
    continuousSceneCount: plan.groups?.length || 0,
    pilotBeatCount: props.beats?.length || 0,
    realCaptureCount: capture.captures?.length || 0,
    generatedArtworkCount: report.summary?.generatedArtworkCount ?? null,
    currentPropsUnchanged: report.currentPropsUnchanged === true,
    candidateAdopted: ledger?.adoptedIntoCurrentBuild === true,
    candidateStatus: ledger?.status || null,
    rejectionReason: ledger?.rejectionReason || null,
  },
  failures,
  nextAction: failures.length
    ? "repair-editorial-documentary-rejection-proof"
    : "direct-review-picture-packaging-pilot-before-any-timeline-placement",
};

for (const output of [path.join(artifactRoot, "audit.json"), path.join(publicRoot, "audit.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
}
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 2;
