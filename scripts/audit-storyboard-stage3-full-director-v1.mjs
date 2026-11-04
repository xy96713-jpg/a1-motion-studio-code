#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const phaseId = "storyboard-stage3-full-director-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const directorPlanPath = path.join(artifactRoot, "director-plan.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const currentFilmManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const stillsReportPath = path.join(artifactRoot, "stills-report.json");
const contactSheetArtifactPath = path.join(artifactRoot, "contact-sheet-50.png");
const contactSheetPublicPath = path.join(publicRoot, "contact-sheet-50.png");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive:true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

async function imageStats(filePath) {
  const {data, info} = await sharp(filePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const total = info.width * info.height;
  let dark = 0;
  let light = 0;
  let cobaltPixels = 0;
  let alphaVisible = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];
    const luma = .2126 * r + .7152 * g + .0722 * b;
    if (luma < 64) dark += 1;
    if (luma > 220) light += 1;
    if (b > 120 && b > r * 1.22 && b > g * 1.08) cobaltPixels += 1;
    if (a > 0) alphaVisible += 1;
  }
  return {
    width: info.width,
    height: info.height,
    darkFraction: Number((dark / total).toFixed(4)),
    lightFraction: Number((light / total).toFixed(4)),
    cobaltFraction: Number((cobaltPixels / total).toFixed(4)),
    visibleFraction: Number((alphaVisible / total).toFixed(4)),
  };
}

for (const required of [reportPath, directorPlanPath, candidatePropsPath, currentPropsPath, currentFilmManifestPath, stillsReportPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const report = readJson(reportPath);
const directorPlan = readJson(directorPlanPath);
const candidateProps = readJson(candidatePropsPath);
const currentProps = readJson(currentPropsPath);
const currentFilmManifest = readJson(currentFilmManifestPath);
const stillsReport = readJson(stillsReportPath);
const checks = [];
const check = (id, pass, detail) => checks.push({id, status:pass?"PASS":"FAIL", detail});

const directedScenes = candidateProps.scenes.filter((scene) => scene.storyboard?.stage3DirectorPriority === true && scene.storyboard?.shotDirector?.contract === "A1HSeriesShotDirectorPlan/v1");
const directorByBeatId = new Map(directorPlan.map((item) => [item.beatId, item]));
const visualSignatures = directorPlan.map((item) => `${item.background.mode}|${item.composition.mode}|${item.composition.variant}`);
const signatureCounts = visualSignatures.reduce((acc, signature) => {
  acc[signature] = (acc[signature] || 0) + 1;
  return acc;
}, {});
const backgroundModes = new Set(directorPlan.map((item) => item.background.mode));
const compositionModes = new Set(directorPlan.map((item) => item.composition.mode));
const missingSourceShots = directorPlan.filter((item) => item.asset.status === "missing-source");
const artworkShots = candidateProps.scenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.route === "editorial-artwork");
const invalidBoundEvidence = candidateProps.scenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.route === "real-evidence" && scene.storyboard?.shotDirector?.asset?.status === "bound" && !(scene.entityEvidence || []).some((item) => item.asset && item.assetSha256));
const placeholderPattern = /(?:保留当前|先登记|占位|placeholder|generic|context|观点推进|当前版本)/iu;
const headlineRisks = directorPlan.filter((item) => item.text.headlineLines.some((line) => Array.from(line).length > 16));

check("report-ready", report.contract === "A1StoryboardStage3FullDirector/v1" && report.status === "REVIEW_CANDIDATE_READY", {contract:report.contract,status:report.status});
check("review-only-locks", report.reviewOnly === true && report.rendererAdoptionAllowed === false && report.applyAllowedBeforeExplicitApproval === false && report.fullMp4RenderAllowed === false && report.finalRenderAllowed === false && report.resolveExportAllowed === false, {reviewOnly:report.reviewOnly,rendererAdoptionAllowed:report.rendererAdoptionAllowed});
check("current-props-unchanged", sha256File(currentPropsPath) === report.sourceBinding.propsSha256 && currentProps.scenes.every((scene) => scene.storyboard?.stage3DirectorPriority !== true), {current:sha256File(currentPropsPath),source:report.sourceBinding.propsSha256});
check("current-film-binding-current", currentFilmManifest.contract === "A1CurrentFilmManifest/v1"
  && currentFilmManifest.current?.rendererPropsSha256 === report.sourceBinding.propsSha256
  && currentFilmManifest.current?.rendererSourceSha256 === report.sourceBinding.rendererSourceSha256
  && currentFilmManifest.current?.buildId === report.sourceBinding.currentFilmBuildId,
  {manifestBuildId:currentFilmManifest.current?.buildId,reportBuildId:report.sourceBinding.currentFilmBuildId,manifestRendererSourceSha256:currentFilmManifest.current?.rendererSourceSha256,reportRendererSourceSha256:report.sourceBinding.rendererSourceSha256});
check("candidate-props-bound", sha256File(candidatePropsPath) === report.candidate.propsSha256 && report.candidate.currentPropsUnchanged === true, {candidate:sha256File(candidatePropsPath),report:report.candidate.propsSha256});
check("director-plan-bound", sha256File(directorPlanPath) === report.directorPlan.sha256, {file:sha256File(directorPlanPath),report:report.directorPlan.sha256});
check("fifty-shot-director-coverage", directorPlan.length === 50 && directedScenes.length === 50 && report.summary.fullyDirectedSceneCount === 50 && report.summary.changedSceneCount === 50, {plan:directorPlan.length,directedScenes:directedScenes.length,summary:report.summary});
check("director-fields-complete", directorPlan.every((item) => item.text?.headlineLines?.length && item.background?.rationale && item.composition?.rationale && item.elements?.length >= 2 && item.asset?.rationale && item.motion?.primary && item.continuity?.carryIn && item.continuity?.carryOut && item.acceptance?.length >= 4), {required:report.directorPlan.requiredFields});
check("candidate-matches-director", directedScenes.every((scene) => directorByBeatId.has(scene.beatId) && scene.titleLines.join("|") === directorByBeatId.get(scene.beatId).text.headlineLines.join("|") && scene.route === directorByBeatId.get(scene.beatId).asset.route), {directedSceneCount:directedScenes.length});
const visiblePlaceholderShots = directorPlan.filter((item) => {
  const visibleCopy = [
    ...item.text.headlineLines,
    item.text.supportLine,
    ...item.elements.map((element) => element.label),
  ].filter(Boolean).join(" ");
  return placeholderPattern.test(visibleCopy);
});
check("no-registration-placeholder-copy", visiblePlaceholderShots.length === 0, visiblePlaceholderShots.map((item) => ({beatId:item.beatId,headlineLines:item.text.headlineLines,supportLine:item.text.supportLine,elementLabels:item.elements.map((element) => element.label)})));
check("headline-line-length", headlineRisks.length === 0, headlineRisks.map((item) => ({beatId:item.beatId,lines:item.text.headlineLines})));
check("background-decision-coverage", backgroundModes.size === 6, {count:backgroundModes.size,modes:[...backgroundModes]});
check("composition-decision-coverage", compositionModes.size === 15, {count:compositionModes.size,modes:[...compositionModes]});
check("visual-signature-diversity", new Set(visualSignatures).size >= 40 && Math.max(...Object.values(signatureCounts)) <= 2, {unique:new Set(visualSignatures).size,maxReuse:Math.max(...Object.values(signatureCounts)),signatureCounts});
check("artwork-route-is-real", artworkShots.length === 3 && artworkShots.every((scene) => scene.layers.some((layer) => layer.kind === "foreground-subject" && layer.asset && scene.layout?.assetPlacement?.sourcePolicy === "text-free-non-evidence-styleframe")), artworkShots.map((scene) => ({beatId:scene.beatId,asset:scene.layers.find((layer) => layer.kind === "foreground-subject")?.asset})));
check("bound-evidence-is-source-backed", invalidBoundEvidence.length === 0, invalidBoundEvidence.map((scene) => scene.beatId));
check("material-gaps-are-explicit", missingSourceShots.length === report.summary.missingSourceCount && missingSourceShots.every((item) => ["real-evidence","text-only-attribution"].includes(item.asset.route) && item.asset.fakeEvidenceAllowed === false), missingSourceShots.map((item) => ({beatId:item.beatId,route:item.asset.route,status:item.asset.status})));
check("three-anchor-gate", report.anchors.beatIds.length === 3 && report.anchors.approvalStatus === "not-approved" && report.anchors.beatIds.every((beatId) => directorByBeatId.has(beatId)), report.anchors);
check("all-50-stills-rendered", stillsReport.status === "PASS" && stillsReport.selection?.selectedCount === 50 && stillsReport.output?.expectedCount === 50 && stillsReport.output?.missingCount === 0 && stillsReport.fullMp4Rendered === false, {status:stillsReport.status,selection:stillsReport.selection,output:stillsReport.output});

const stills = [];
for (const item of directorPlan) {
  const filePath = path.join(publicRoot, "stills", `${item.beatId}.png`);
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  const stats = exists ? await imageStats(filePath) : null;
  const metadata = stillsReport.rendered?.find((entry) => entry.beatId === item.beatId) || stillsReport.reused?.find((entry) => entry.beatId === item.beatId) || null;
  const frameChecks = {
    exists,
    metadataShaMatches:Boolean(exists && metadata?.sha256 === sha256File(filePath)),
    expectedDimensions:stats?.width === 960 && stats?.height === 540,
    visibleField:Boolean(stats && stats.visibleFraction >= .99),
    nonBlank:Boolean(stats && stats.darkFraction + (1 - stats.lightFraction) >= .01),
  };
  stills.push({beatId:item.beatId,path:rel(filePath),sha256:exists?sha256File(filePath):null,background:item.background.mode,composition:item.composition.mode,assetRoute:item.asset.route,stats,checks:frameChecks,status:Object.values(frameChecks).every(Boolean)?"PASS":"FAIL"});
}
check("all-frame-pixels-pass", stills.length === 50 && stills.every((item) => item.status === "PASS"), stills.filter((item) => item.status !== "PASS"));
check("no-exact-duplicate-frames", new Set(stills.map((item) => item.sha256).filter(Boolean)).size === 50, {uniqueFrameCount:new Set(stills.map((item) => item.sha256).filter(Boolean)).size});

const tileWidth = 384;
const tileHeight = 216;
const labelHeight = 44;
const columns = 5;
const rows = 10;
const gutter = 2;
const composites = [];
for (const [index, item] of stills.entries()) {
  const left = (index % columns) * (tileWidth + gutter);
  const top = Math.floor(index / columns) * (tileHeight + labelHeight + gutter);
  const image = await sharp(path.join(root, item.path)).resize(tileWidth, tileHeight).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#17191b"/><text x="14" y="28" font-family="Arial, sans-serif" font-size="17" fill="#f3f1e9">${item.beatId}  ${item.composition}</text></svg>`);
  composites.push({input:image,left,top},{input:label,left,top:top+tileHeight});
}
const contactSheet = await sharp({create:{width:columns*tileWidth+(columns-1)*gutter,height:rows*(tileHeight+labelHeight)+(rows-1)*gutter,channels:3,background:"#d9d5ca"}}).composite(composites).png().toBuffer();
for (const output of [contactSheetArtifactPath, contactSheetPublicPath]) {
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, contactSheet);
}
const contactSheetSha256 = sha256File(contactSheetArtifactPath);
check("contact-sheet-public-identical", sha256File(contactSheetPublicPath) === contactSheetSha256, {artifact:contactSheetSha256,public:sha256File(contactSheetPublicPath)});

const failures = checks.filter((item) => item.status !== "PASS");
const audit = {
  contract:"A1StoryboardStage3FullDirectorAudit/v1",
  phaseId,
  generatedAt:new Date().toISOString(),
  status:failures.length?"FAIL":"PASS_FULL_DIRECTOR_PROOF",
  reviewOnly:true,
  visualReviewStatus:"not-approved-by-user",
  currentAuthorityMutated:false,
  rendererAdoptionAllowed:false,
  fullMp4RenderAllowed:false,
  finalRenderAllowed:false,
  resolveExportAllowed:false,
  sourceBinding:report.sourceBinding,
  candidate:report.candidate,
  summary:{
    sceneCount:50,
    renderedStillCount:stills.filter((item) => item.status === "PASS").length,
    backgroundModeCount:backgroundModes.size,
    compositionModeCount:compositionModes.size,
    uniqueVisualSignatureCount:new Set(visualSignatures).size,
    missingSourceCount:missingSourceShots.length,
    artworkCount:artworkShots.length,
    exactDuplicateFrameCount:50-new Set(stills.map((item) => item.sha256).filter(Boolean)).size,
  },
  anchors:report.anchors,
  materialGaps:missingSourceShots.map((item) => ({beatId:item.beatId,route:item.asset.route,status:item.asset.status,rationale:item.asset.rationale})),
  stills,
  contactSheet:{artifactPath:rel(contactSheetArtifactPath),publicPath:rel(contactSheetPublicPath),sha256:contactSheetSha256,frameCount:50,columns,rows},
  checks,
  failures,
  nextAction:failures.length?"repair-stage3-full-director-proof":"direct-review-50-frame-contact-sheet-before-renderer-adoption",
};
writeJson(path.join(artifactRoot, "audit.json"), audit);
writeJson(path.join(publicRoot, "audit.json"), audit);
if (!failures.length) {
  const currentPhase = {
    contract:"A1SystemProgressPhase/v1",
    phaseId,
    status:"complete",
    startedAt:report.generatedAt,
    completedAt:audit.generatedAt,
    authority:{
      kind:"derived-pointer-only",
      manifestPath:"apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json",
      buildId:currentFilmManifest.current.buildId,
      state:currentFilmManifest.state,
    },
    reviewDecision:{
      status:"needs-revision",
      userReviewPath:"apps/studio-next/public/generated/system-line/current-film/user-review.json",
      finalRenderAllowed:false,
      resolveExportAllowed:false,
    },
    proof:{
      reviewUrl:"http://127.0.0.1:4311/system-line-review#stage3-full-director",
      storyboardPropsSha256:currentFilmManifest.current.storyboardPropsSha256,
      rendererPropsSha256:currentFilmManifest.current.rendererPropsSha256,
      rendererSourceSha256:currentFilmManifest.current.rendererSourceSha256,
      stage3FullDirectorReportPath:rel(reportPath),
      stage3FullDirectorAuditPath:rel(path.join(artifactRoot, "audit.json")),
      stage3FullDirectorContactSheetSha256:contactSheetSha256,
      stage3CandidatePropsSha256:report.candidate.propsSha256,
      fullyDirectedSceneCount:audit.summary.sceneCount,
      renderedStillCount:audit.summary.renderedStillCount,
      missingSourceCount:audit.summary.missingSourceCount,
    },
    next:{recommended:{
      id:"direct-review-stage3-50-frame-candidate-before-adoption",
      reason:"Stage 3 is a 50-shot code-rendered candidate with explicit text, background, composition, element, asset, motion and continuity decisions; it remains separate from current film props until direct visual approval.",
      requiresExplicitApproval:false,
      riskTags:["review-only-candidate","no-new-full-mp4","no-final-render","no-resolve-export"],
    }},
  };
  writeJson(currentPhasePath, currentPhase);
}
console.log(JSON.stringify({status:audit.status,summary:audit.summary,failures:failures.map((item) => item.id),contactSheet:audit.contactSheet,nextAction:audit.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
