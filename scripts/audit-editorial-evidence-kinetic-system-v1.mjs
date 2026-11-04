#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "editorial-evidence-kinetic-system-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const paths = {
  report: path.join(artifactRoot, "report.json"),
  reportPublic: path.join(publicRoot, "report.json"),
  props: path.join(root, "remotion-renderer/src/generated/editorialEvidenceKineticSystemProofProps.json"),
  currentHProps: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
  verifiedAsset: path.join(root, "remotion-renderer/public/editorial-evidence-kinetic-v1/nasa-moon-base.webp"),
  video: path.join(artifactRoot, "editorial-evidence-kinetic-system-proof.mp4"),
  videoPublic: path.join(publicRoot, "editorial-evidence-kinetic-system-proof.mp4"),
  poster: path.join(artifactRoot, "editorial-evidence-kinetic-system-poster.png"),
  posterPublic: path.join(publicRoot, "editorial-evidence-kinetic-system-poster.png"),
  contactSheet: path.join(artifactRoot, "editorial-evidence-kinetic-system-contact-sheet.png"),
  contactSheetPublic: path.join(publicRoot, "editorial-evidence-kinetic-system-contact-sheet.png"),
  systemSource: path.join(root, "apps/studio-next/src/lib/a1-editorial-evidence-kinetic-system.ts"),
  timelineCompiler: path.join(root, "apps/studio-next/src/lib/a1-template-timeline.ts"),
  renderer: path.join(root, "remotion-renderer/src/EditorialEvidenceKineticSystemStage.tsx"),
  timelineRenderer: path.join(root, "remotion-renderer/src/ArticleTemplateTimeline.tsx"),
  reviewPage: path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx"),
  candidateMaster: path.join(root, "apps/studio-next/src/lib/a1-editorial-evidence-kinetic-candidate.mjs"),
  crossArticleAudit: path.join(artifactRoot, "cross-article-audit.json"),
  crossArticleAuditPublic: path.join(publicRoot, "cross-article-audit.json"),
};

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const missing = Object.entries(paths).filter(([, file]) => !fs.existsSync(file) || fs.statSync(file).size === 0).map(([id]) => `missing:${id}`);
if (missing.length) {
  console.error(JSON.stringify({status: "FAIL", failures: missing}, null, 2));
  process.exit(2);
}

const report = readJson(paths.report);
const props = readJson(paths.props);
const directions = props.items.map((item) => item.templateProps?.aestheticDirection).filter(Boolean);
const systemSource = fs.readFileSync(paths.systemSource, "utf8");
const compilerSource = fs.readFileSync(paths.timelineCompiler, "utf8");
const rendererSource = fs.readFileSync(paths.renderer, "utf8");
const timelineRendererSource = fs.readFileSync(paths.timelineRenderer, "utf8");
const reviewPageSource = fs.readFileSync(paths.reviewPage, "utf8");
const candidateMasterSource = fs.readFileSync(paths.candidateMaster, "utf8");
const crossArticleAudit = readJson(paths.crossArticleAudit);
const roleCount = new Set(directions.map((direction) => direction.sceneRole)).size;
const backgroundCount = new Set(directions.map((direction) => direction.background?.mode)).size;
const metricShots = directions.filter((direction) => direction.sceneRole === "metric-comparison");
const adjacentRepeats = directions.slice(1).map((direction, index) => ({previous: directions[index], current: direction})).filter(({previous, current}) => previous.background?.mode === current.background?.mode);
const frameFiles = fs.readdirSync(path.join(artifactRoot, "frames")).filter((file) => file.endsWith(".png"));
const frameHashes = new Set(frameFiles.map((file) => sha256(path.join(artifactRoot, "frames", file))));

const checks = {
  contractAndStatus: report.contract === "A1EditorialEvidenceKineticSystemProof/v1" && report.status === "READY_FOR_DIRECT_VISUAL_REVIEW" && report.systemUpgrade === true && report.reviewOnly === true,
  systemNotThreeHardcodedAnchors: props.items.length === 8 && directions.length === props.items.length && report.summary?.directedShotCount === 8,
  fiveLayersPerShot: directions.every((direction) => direction.gates?.separateFiveLayers === true && direction.background?.mode && direction.typography?.mode && direction.elements?.mode && direction.picture?.route && direction.motion?.mode),
  semanticDiversity: roleCount >= 5 && backgroundCount >= 5 && report.summary?.distinctSceneRoleCount === roleCount && report.summary?.distinctBackgroundModeCount === backgroundCount,
  repeatedLayoutActivelyVaried: adjacentRepeats.every(({current}) => current.layoutVariant?.endsWith(":alternate") && current.decisionTrace?.previousLayoutAvoided === true),
  verifiedSourcePictureBound: directions[0]?.sceneRole === "source-opening" && directions[0]?.picture?.route === "verified-source" && directions[0]?.picture?.sourceUrl?.startsWith("https://www.nasa.gov/") && directions[0]?.picture?.imageUrl === "editorial-evidence-kinetic-v1/nasa-moon-base.webp",
  verifiedMetricsNotFabricated: metricShots.length === 1 && metricShots[0].metrics?.some((metric) => metric.label === "Astrolab" && metric.valueText === "$219M") && metricShots[0].metrics?.some((metric) => metric.label === "Lunar Outpost" && metric.valueText === "$220M"),
  noFakeImageOrGeneratedArtwork: directions.every((direction) => direction.gates?.fakeEvidenceAllowed === false && direction.gates?.generatedArtworkCount === 0) && report.summary?.generatedArtworkCount === 0,
  sourceAssetHashBound: report.sourceBinding?.verifiedAssetSha256 === sha256(paths.verifiedAsset),
  currentHAuthorityUnchanged: report.boundaries?.currentHSeriesAuthorityMutated === false && report.sourceBinding?.currentHPropsSha256 === sha256(paths.currentHProps),
  allAdoptionAndExportGatesClosed: report.boundaries?.rendererAdoptionAllowed === false && report.boundaries?.mainTimelinePlacementAllowed === false && report.boundaries?.finalRenderAllowed === false && report.boundaries?.resolveExportAllowed === false,
  futureArticleCompilerIntegrated: compilerSource.includes("decorateEditorialEvidenceKineticTimeline") && compilerSource.includes("return decorateEditorialEvidenceKineticTimeline({"),
  crossArticleCompilerRuntime: crossArticleAudit.contract === "A1EditorialEvidenceKineticCrossArticleAudit/v1" && crossArticleAudit.status === "PASS" && crossArticleAudit.summary?.fixtureCount >= 3 && crossArticleAudit.summary?.distinctArticleTitleCount >= 2 && crossArticleAudit.summary?.totalDirectedShotCount === crossArticleAudit.summary?.totalShotCount && sha256(paths.crossArticleAudit) === sha256(paths.crossArticleAuditPublic),
  runtimeConsumesPerShotDirection: timelineRendererSource.includes("EditorialEvidenceKineticDirectionSchema.safeParse") && timelineRendererSource.includes("<EditorialEvidenceKineticSystemStage") && timelineRendererSource.includes('data-a1-template-render-policy="semantic-aesthetic-system"'),
  rendererUsesFiveVisibleLayers: ["background", "typography", "elements", "picture", "motion"].every((layer) => rendererSource.includes(layer)) && rendererSource.includes('data-a1-aesthetic-five-layers="separate"'),
  rendererIsDeterministicFrameDriven: rendererSource.includes("useCurrentFrame") && rendererSource.includes("interpolate") && !/Math\.random|Date\.now|\bspring\s*\(/u.test(rendererSource) && !/animation\s*:|transition\s*:/u.test(rendererSource),
  referenceIsGrammarOnly: candidateMasterSource.includes('referenceMode: "aesthetic-grammar-only"') && candidateMasterSource.includes("copiesCreatorIdentity: false") && candidateMasterSource.includes("copiesCreatorLogoOrWatermark: false") && candidateMasterSource.includes("copiesExactFramesOrLayouts: false"),
  noPaidApiDependency: !/OPENAI_API_KEY|ANTHROPIC_API_KEY|REPLICATE_API_TOKEN|fal\.ai|paid-api/iu.test(`${systemSource}\n${rendererSource}`),
  renderedMediaBound: report.pilot?.video?.status === "rendered" && report.pilot.video.sha256 === sha256(paths.video) && sha256(paths.videoPublic) === sha256(paths.video) && report.pilot.poster.sha256 === sha256(paths.poster) && sha256(paths.posterPublic) === sha256(paths.poster) && report.pilot.contactSheet.sha256 === sha256(paths.contactSheet) && sha256(paths.contactSheetPublic) === sha256(paths.contactSheet),
  representativeFramesDistinct: frameFiles.length === props.items.length && frameHashes.size === props.items.length,
  reportPublishedIdentically: sha256(paths.report) === sha256(paths.reportPublic),
  reviewPageExposesSystemProof: [
    'data-a1-editorial-evidence-kinetic="system-review-only"',
    'data-a1-editorial-evidence-kinetic-current-authority="unchanged"',
    'data-a1-editorial-evidence-kinetic-visual-review="pending"',
    'data-a1-editorial-evidence-kinetic-video="full-eight-shot-system-proof"',
    'data-a1-editorial-evidence-kinetic-layer-inspector="background-typography-elements-picture-motion"',
    "不是三镜模仿",
    "逐镜审美导演",
  ].every((marker) => reviewPageSource.includes(marker)),
};

const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
const audit = {
  contract: "A1EditorialEvidenceKineticSystemAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  checks,
  summary: {
    shotCount: props.items.length,
    directedShotCount: directions.length,
    distinctSceneRoleCount: roleCount,
    distinctBackgroundModeCount: backgroundCount,
    verifiedPictureShotCount: directions.filter((direction) => direction.picture?.route === "verified-source").length,
    metricShotCount: metricShots.length,
    adjacentRepeatedBackgroundCount: adjacentRepeats.length,
    generatedArtworkCount: report.summary?.generatedArtworkCount,
    currentHPropsSha256: sha256(paths.currentHProps),
  },
  failures,
  nextAction: failures.length ? "repair-system-aesthetic-proof-before-review" : "direct-review-system-aesthetic-proof-before-promoting-profile",
};
for (const output of [path.join(artifactRoot, "audit.json"), path.join(publicRoot, "audit.json")]) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
}
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 2;
