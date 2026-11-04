#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "picture-packaging-pilot-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const paths = {
  report: path.join(artifactRoot, "report.json"),
  reportPublic: path.join(publicRoot, "report.json"),
  props: path.join(root, "remotion-renderer/src/generated/picturePackagingPilotProps.json"),
  currentProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  video: path.join(artifactRoot, "picture-packaging-pilot.mp4"),
  videoPublic: path.join(publicRoot, "picture-packaging-pilot.mp4"),
  poster: path.join(artifactRoot, "picture-packaging-poster.png"),
  posterPublic: path.join(publicRoot, "picture-packaging-poster.png"),
  contactSheet: path.join(artifactRoot, "picture-packaging-contact-sheet.png"),
  contactSheetPublic: path.join(publicRoot, "picture-packaging-contact-sheet.png"),
  manifest: path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json"),
  page: path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx"),
  renderer: path.join(root, "remotion-renderer/src/PicturePackagingPilot.tsx"),
  root: path.join(root, "remotion-renderer/src/Root.tsx"),
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const missing = Object.entries(paths).filter(([, file]) => !fs.existsSync(file)).map(([id]) => `missing:${id}`);
if (missing.length) {
  console.error(JSON.stringify({status: "FAIL", failures: missing}, null, 2));
  process.exit(2);
}
const report = readJson(paths.report);
const props = readJson(paths.props);
const manifest = readJson(paths.manifest);
const page = fs.readFileSync(paths.page, "utf8");
const renderer = fs.readFileSync(paths.renderer, "utf8");
const rootSource = fs.readFileSync(paths.root, "utf8");
const ledger = manifest.adoptionLedger?.items?.find((item) => item.id === "picture-packaging-pilot-candidate");
const rejectedDocumentary = manifest.adoptionLedger?.items?.find((item) => item.id === "editorial-documentary-reset-candidate");
const designComplete = props.beats?.every((beat) => beat.textPlan && beat.backgroundPlan && beat.elementPlan && beat.imagePlan && beat.motionPlan);
const checks = {
  contractAndStatus: report.contract === "A1PicturePackagingPilotReport/v1" && report.status === "READY_FOR_DIRECT_REVIEW" && report.reviewOnly === true,
  userOwnsEditorialDecisions: report.editorialAuthority?.owner === "user" && report.editorialAuthority?.hostAppearanceTiming === "user-only" && report.editorialAuthority?.screenRecordingTiming === "user-only" && report.editorialAuthority?.cutTiming === "user-only" && report.editorialAuthority?.systemMayAssignEditorialMode === false,
  proofIsUnplaced: report.proofPlacement === "unassigned" && report.mainTimelinePlacementAllowed === false && props.placement === "unassigned" && props.mainTimelineMutated === false,
  packagingResponsibilitiesOnly: report.systemResponsibility?.text === true && report.systemResponsibility?.background === true && report.systemResponsibility?.elements === true && report.systemResponsibility?.imagery === true && report.systemResponsibility?.motion === true && report.systemResponsibility?.hostDirection === false && report.systemResponsibility?.screenRecordingCapture === false && report.systemResponsibility?.mainFilmCutDecision === false,
  noRecordingOrScreenshotDependency: report.summary?.recordingDependencyCount === 0 && report.summary?.screenshotDependencyCount === 0 && props.recordingDependencyCount === 0 && props.screenshotDependencyCount === 0 && !renderer.includes("<Img") && !renderer.includes("<Video"),
  everyShotFullyDesigned: report.summary?.beatCount === 5 && report.summary?.fullySpecifiedShotCount === 5 && props.beats?.length === 5 && designComplete,
  currentFilmPropsUnchanged: report.checks?.currentFilmPropsMutated === false && report.sourceBinding?.sourcePropsSha256 === sha256(paths.currentProps),
  mediaBound: report.pilot?.video?.status === "rendered" && report.pilot.video.hasAudio === true && report.pilot.video.sha256 === sha256(paths.video) && sha256(paths.videoPublic) === sha256(paths.video) && report.pilot.poster.sha256 === sha256(paths.poster) && sha256(paths.posterPublic) === sha256(paths.poster) && report.pilot.contactSheet.sha256 === sha256(paths.contactSheet) && sha256(paths.contactSheetPublic) === sha256(paths.contactSheet),
  reportPublishedIdentically: sha256(paths.report) === sha256(paths.reportPublic),
  rendererRegisteredAndOldPilotUnregistered: rootSource.includes('id="A1PicturePackagingPilot"') && !rootSource.includes('id="A1EditorialDocumentaryPilot"'),
  ledgerKeepsProofUnadopted: ledger?.status === "PROOF_ONLY_NOT_ADOPTED" && ledger?.adoptedIntoCurrentBuild === false && ledger?.placement === "unassigned" && ledger?.userOwnsEditorialTiming === true && rejectedDocumentary?.status === "REJECTED_SCOPE_ERROR_NOT_ADOPTED" && rejectedDocumentary?.adoptedIntoCurrentBuild === false,
  pageUsesCorrectPrimaryDirection: ["data-a1-picture-packaging-pilot", "data-a1-packaging-placement=\"unassigned\"", "data-a1-editorial-authority=\"user\"", "data-a1-recording-dependency=\"0\"", "系统只做包装", "你决定正片怎么切", "历史：稿台纪实方向越权，已撤下"].every((marker) => page.includes(marker)),
  systemNextActionIsDirectReview: manifest.nextAction === "direct-review-picture-packaging-pilot-before-any-timeline-placement",
};
const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
const audit = {contract: "A1PicturePackagingPilotAudit/v1", status: failures.length ? "FAIL" : "PASS", generatedAt: new Date().toISOString(), checks, summary: {beatCount: props.beats?.length || 0, placement: props.placement, recordingDependencyCount: props.recordingDependencyCount, screenshotDependencyCount: props.screenshotDependencyCount, currentFilmPropsMutated: props.currentFilmPropsMutated, candidateAdopted: ledger?.adoptedIntoCurrentBuild === true}, failures, nextAction: failures.length ? "repair-picture-packaging-pilot" : "direct-review-picture-packaging-pilot-before-any-timeline-placement"};
for (const output of [path.join(artifactRoot, "audit.json"), path.join(publicRoot, "audit.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
}
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 2;
