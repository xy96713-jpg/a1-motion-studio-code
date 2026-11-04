#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {decorateEditorialEvidenceKineticTimeline} from "../apps/studio-next/src/lib/a1-editorial-evidence-kinetic-system.ts";

const root = process.cwd();
const phaseId = "editorial-evidence-kinetic-system-v1";
const sourceTimelinePath = path.join(root, "public/generated/studio-next-template-timeline/unseen-real-3edfea7d5161/article-template-timeline-props.json");
const articleSourcePath = "/Users/a1/Documents/Codex/声音/network-article-tests/nasa-moon-base-20260729/article-source.txt";
const rendererAssetPath = path.join(root, "remotion-renderer/public/editorial-evidence-kinetic-v1/nasa-moon-base.webp");
const currentHPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const systemSourcePath = path.join(root, "apps/studio-next/src/lib/a1-editorial-evidence-kinetic-system.ts");
const rendererSourcePath = path.join(root, "remotion-renderer/src/EditorialEvidenceKineticSystemStage.tsx");
const propsPath = path.join(root, "remotion-renderer/src/generated/editorialEvidenceKineticSystemProofProps.json");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const nasaUrl = "https://www.nasa.gov/news-release/nasa-provides-update-on-moon-base-rovers-landers-missions/";
const localAssetUrl = "editorial-evidence-kinetic-v1/nasa-moon-base.webp";

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function replaceAssetUrl(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(replaceAssetUrl);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceAssetUrl(item)]));
  if (typeof value === "string" && /\/assets\/web-assets\/cache\/75d1559889d32d87837b\.webp$/u.test(value)) return localAssetUrl;
  return value;
}

for (const file of [sourceTimelinePath, articleSourcePath, rendererAssetPath, currentHPropsPath, systemSourcePath, rendererSourcePath]) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`aesthetic-system-required-file-missing:${file}`);
}

const sourceTimeline = readJson(sourceTimelinePath);
const decorated = replaceAssetUrl(decorateEditorialEvidenceKineticTimeline(sourceTimeline)) as ReturnType<typeof decorateEditorialEvidenceKineticTimeline>;
writeJson(propsPath, decorated);

const directions = decorated.items.map((item) => item.templateProps?.aestheticDirection as Record<string, unknown>);
const roleCounts = Object.fromEntries([...new Set(directions.map((direction) => String(direction.sceneRole)))].map((role) => [role, directions.filter((direction) => direction.sceneRole === role).length]));
const backgroundCounts = Object.fromEntries([...new Set(directions.map((direction) => String((direction.background as Record<string, unknown>)?.mode)))].map((mode) => [mode, directions.filter((direction) => (direction.background as Record<string, unknown>)?.mode === mode).length]));

const report = {
  contract: "A1EditorialEvidenceKineticSystemProof/v1",
  status: "READY_TO_RENDER",
  reviewOnly: true,
  visualReviewStatus: "PENDING_USER_VISUAL_REVIEW",
  systemUpgrade: true,
  referenceMode: "aesthetic-grammar-only",
  visualThesis: "新文章进入后，每镜由语义决定全画幅证据、暖纸或炭黑背景、大号可编辑文字、附着式关系元素、真实图片与多状态动效；不是固定卡片换皮。",
  boundaries: {
    currentHSeriesAuthorityMutated: false,
    rendererAdoptionAllowed: false,
    mainTimelinePlacementAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    copiesCreatorIdentity: false,
    copiesCreatorLogoOrWatermark: false,
    copiesExactFramesOrLayouts: false,
  },
  sourceBinding: {
    articleSourceUrl: nasaUrl,
    articleSourcePath,
    articleSourceSha256: sha256(articleSourcePath),
    sourceTimelinePath: path.relative(root, sourceTimelinePath),
    sourceTimelineSha256: sha256(sourceTimelinePath),
    verifiedAssetPath: path.relative(root, rendererAssetPath),
    verifiedAssetSha256: sha256(rendererAssetPath),
    currentHPropsPath: path.relative(root, currentHPropsPath),
    currentHPropsSha256: sha256(currentHPropsPath),
    systemSourcePath: path.relative(root, systemSourcePath),
    systemSourceSha256: sha256(systemSourcePath),
    rendererSourcePath: path.relative(root, rendererSourcePath),
    rendererSourceSha256: sha256(rendererSourcePath),
  },
  summary: {
    shotCount: decorated.items.length,
    directedShotCount: directions.length,
    separateFiveLayerShotCount: directions.filter((direction) => (direction.gates as Record<string, unknown>)?.separateFiveLayers === true).length,
    sourceBoundShotCount: directions.filter((direction) => (direction.gates as Record<string, unknown>)?.sourceBound === true).length,
    verifiedPictureShotCount: directions.filter((direction) => (direction.picture as Record<string, unknown>)?.route === "verified-source").length,
    metricShotCount: directions.filter((direction) => direction.sceneRole === "metric-comparison").length,
    generatedArtworkCount: 0,
    distinctSceneRoleCount: Object.keys(roleCounts).length,
    distinctBackgroundModeCount: Object.keys(backgroundCounts).length,
    durationSec: Number(decorated.items.reduce((sum, item) => sum + Number((item as Record<string, unknown>).durationSec || 0), 0).toFixed(3)),
  },
  roleCounts,
  backgroundCounts,
  shots: decorated.items.map((item) => ({
    id: item.id,
    sourceTemplate: item.selectedSlug,
    title: item.templateProps?.title || "",
    direction: item.templateProps?.aestheticDirection,
  })),
  pilot: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    video: {publicUrl: `/generated/system-line/${phaseId}/editorial-evidence-kinetic-system-proof.mp4`, status: "pending-render"},
    poster: {publicUrl: `/generated/system-line/${phaseId}/editorial-evidence-kinetic-system-poster.png`, status: "pending-render"},
    contactSheet: {publicUrl: `/generated/system-line/${phaseId}/editorial-evidence-kinetic-system-contact-sheet.png`, status: "pending-render"},
  },
  failures: [],
  nextAction: "render-full-eight-shot-system-proof-for-direct-visual-review",
};

for (const output of [path.join(artifactDir, "report.json"), path.join(publicDir, "report.json")]) writeJson(output, report);
console.log(JSON.stringify({status: report.status, phaseId, summary: report.summary, roleCounts, backgroundCounts, propsPath: report.pilot.propsPath}, null, 2));
