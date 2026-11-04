#!/usr/bin/env node
/**
 * Run the same independent visual gate used by imported projects against the
 * current 4311 full-film 540p artifact. This never approves a user release;
 * it only records a pass or an automatic-repair block on the single authority.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, registerFilmVisualQualityReview} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
// The built-in article predates the project-import contract and uses the
// compatible A1MotionIRSet/v2 envelope. Keep this audit read-only and do not
// rewrite its hashes just to satisfy the project-import validator.
const acceptedSet = JSON.parse(fs.readFileSync(path.join(publicDir, "accepted-shot-ir-v2.json"), "utf8"));
const motionSet = JSON.parse(fs.readFileSync(path.join(publicDir, "motion-ir-v2.json"), "utf8"));
if (acceptedSet?.contract !== "A1AcceptedShotIRSet/v2" || motionSet?.contract !== "A1MotionIRSet/v2" || acceptedSet.scenes?.length !== 34 || motionSet.scenes?.length !== 34) throw new Error("current-film-ir-envelope-invalid");
const workspace = JSON.parse(fs.readFileSync(path.join(publicDir, "workspace.json"), "utf8"));
const review540p = workspace.production.release.review540p;
if (review540p.status !== "ready-for-review" || !review540p.publicUrl || !/^[a-f0-9]{64}$/u.test(String(review540p.sha256 || ""))) throw new Error("current-film-540p-review-artifact-required");

const require = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const temp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8"); fs.renameSync(temp, file); };
const EDIT_MODE_PRIORITY = {"type-only": 5, "full-package": 4, "presenter-overlay": 3, "screen-demo": 2, "presenter-clean": 1};

function buildEditorialCoverageSamples(composition) {
  let cursor = 0;
  const shots = acceptedSet.scenes.map((scene) => {
    const durationInFrames = Math.max(1, Math.round(Number(scene.source.editWindow.durationMs || 0) / 1000 * composition.fps));
    const value = {
      shotId: scene.shotId,
      chapterId: scene.chapterId,
      editMode: scene.sceneGraph.editMode,
      topology: scene.sceneGraph.topology,
      startFrame: cursor,
      durationInFrames,
      visualJob: scene.visualContract?.visualJob || null,
    };
    cursor += durationInFrames;
    return value;
  });
  const samples = [];
  const seen = new Set();
  const add = (shot, phase, ratio) => {
    const key = `${shot.shotId}:${phase}`;
    if (seen.has(key)) return;
    seen.add(key);
    samples.push({
      ...shot,
      phase,
      frame: Math.min(composition.durationInFrames - 1, shot.startFrame + Math.max(0, Math.round((shot.durationInFrames - 1) * ratio))),
    });
  };

  // Every chapter contributes one deliberately chosen settled composition.
  for (const chapterId of [...new Set(shots.map((shot) => shot.chapterId))]) {
    const chapterShots = shots.filter((shot) => shot.chapterId === chapterId);
    const representative = [...chapterShots].sort((left, right) =>
      (EDIT_MODE_PRIORITY[right.editMode] || 0) - (EDIT_MODE_PRIORITY[left.editMode] || 0)
      || right.durationInFrames - left.durationInFrames
      || left.startFrame - right.startFrame
    )[0];
    if (representative) add(representative, "chapter-settle", .68);
  }

  // Guarantee that no medium family disappears from the visual audit.
  for (const editMode of Object.keys(EDIT_MODE_PRIORITY)) {
    if (samples.some((sample) => sample.editMode === editMode)) continue;
    const representative = shots.filter((shot) => shot.editMode === editMode).sort((left, right) => right.durationInFrames - left.durationInFrames)[0];
    if (representative) add(representative, "medium-settle", .68);
  }

  // A single still cannot prove causal motion. Add before/after evidence for
  // one real screen action and one material/type transformation.
  const screenAction = shots.filter((shot) => shot.editMode === "screen-demo").sort((left, right) => right.durationInFrames - left.durationInFrames)[0];
  if (screenAction) {
    add(screenAction, "causal-before", .24);
    add(screenAction, "causal-after", .82);
  }
  const transformation = shots.filter((shot) => ["full-package", "type-only"].includes(shot.editMode)).sort((left, right) => right.durationInFrames - left.durationInFrames)[0];
  if (transformation) {
    add(transformation, "transformation-before", .24);
    add(transformation, "transformation-after", .82);
  }

  return samples.sort((left, right) => left.frame - right.frame).slice(0, 14);
}

async function renderCoverageSheets(stills, outputDir) {
  const groups = [stills.slice(0, 7), stills.slice(7, 14)].filter((group) => group.length);
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 28;
  const gap = 8;
  const columns = 2;
  const sheets = [];
  for (const [groupIndex, group] of groups.entries()) {
    const rows = Math.ceil(group.length / columns);
    const width = gap + columns * (tileWidth + gap);
    const height = gap + rows * (tileHeight + gap);
    const background = Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111315"/></svg>`);
    const overlays = [];
    for (const [index, item] of group.entries()) {
      const left = gap + index % columns * (tileWidth + gap);
      const top = gap + Math.floor(index / columns) * (tileHeight + gap);
      const label = `${item.shotId} · ${item.chapterId} · ${item.editMode} · ${item.phase}`;
      const labelSvg = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="rgba(7,9,10,.9)"/><text x="10" y="19" font-family="Arial,sans-serif" font-size="13" fill="#e9ff70">${label.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")}</text></svg>`);
      const tile = await sharp(item.path).resize(tileWidth, tileHeight, {fit: "cover"}).composite([{input: labelSvg, left: 0, top: 0}]).png().toBuffer();
      overlays.push({input: tile, left, top});
    }
    const file = path.join(outputDir, `coverage-sheet-${String(groupIndex + 1).padStart(2, "0")}.png`);
    await sharp(background).composite(overlays).png().toFile(file);
    sheets.push({
      path: file,
      candidateId: `current-film-coverage-sheet-${String(groupIndex + 1).padStart(2, "0")}`,
      direction: group.map((item) => `${item.shotId}/${item.editMode}/${item.phase}`).join("；"),
      shotIds: group.map((item) => item.shotId),
      phases: group.map((item) => item.phase),
    });
  }
  return sheets;
}

async function main() {
  const outputDir = path.join(publicDir, "current-film-visual-quality-v1");
  const artifactOutputDir = path.join(artifactDir, "current-film-visual-quality-v1");
  fs.mkdirSync(outputDir, {recursive: true}); fs.mkdirSync(artifactOutputDir, {recursive: true});
  const serveUrl = await bundle({entryPoint: path.join(root, "remotion-renderer/src/index.ts"), publicDir: path.join(appRoot, "public"), rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const inputProps = {acceptedSet, motionSet, plan: {contract: "A1CurrentFilmVisualQualityPlan/v1", shotIds: acceptedSet.scenes.map((scene) => scene.shotId), durationMs: acceptedSet.scenes.reduce((sum, scene) => sum + Number(scene.source.editWindow.durationMs || 0), 0)}, audioUri: null};
    const composition = await selectComposition({serveUrl, id: "A1AcceptedEditorialSequenceV2", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const tag = new Date().toISOString().replace(/[:.]/gu, "-");
    const stillDir = path.join(outputDir, `stills-${tag}`);
    fs.mkdirSync(stillDir, {recursive: true});
    const coverageSamples = buildEditorialCoverageSamples(composition);
    const stills = [];
    for (const [index, sample] of coverageSamples.entries()) {
      const frame = sample.frame;
      const file = path.join(stillDir, `frame-${String(index + 1).padStart(2, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      stills.push({...sample, path: file, sha256: shaFile(file)});
    }
    const sampleManifest = {contract: "A1FilmVisualCoverageSampleSet/v1", sourceArtifactSha256: review540p.sha256, chapterCount: new Set(stills.map((item) => item.chapterId)).size, editModes: [...new Set(stills.map((item) => item.editMode))], samples: stills.map(({path: _path, ...item}) => item)};
    writeJson(path.join(outputDir, "coverage-samples.json"), sampleManifest);
    writeJson(path.join(artifactOutputDir, "coverage-samples.json"), sampleManifest);
    const coverageSheets = await renderCoverageSheets(stills, outputDir);
    const candidates = coverageSheets.map((sheet) => ({candidateId: sheet.candidateId, direction: sheet.direction, expectedText: null, shotIds: sheet.shotIds, phases: sheet.phases}));
    const report = await runVisualMaturityCritic({
      scope: "sequence-contact-sheet",
      images: coverageSheets.map((sheet) => sheet.path),
      candidates,
      context: {
        intent: "当前 4311 全片 540p 的独立视觉质量审计；只有 >=22/24 且无硬失败才允许最终 1080p/DaVinci 决定。",
        sourceArtifactSha256: review540p.sha256,
        acceptedShotIrSha256: acceptedSet.sha256,
        motionIrSha256: motionSet.sha256,
        realSourceBoundary: "真实人物、真实录屏和事实素材不得由生成图替代。",
        sampleCoverage: {chapterCount: sampleManifest.chapterCount, expectedChapterCount: 9, editModes: sampleManifest.editModes, expectedEditModes: Object.keys(EDIT_MODE_PRIORITY)},
        referenceRequirement: "按时间顺序审查这些章节与媒介覆盖帧。真人包装必须服从人物和真实物件；录屏必须有前后因果；全屏包装和纯字体必须有独立轮廓、像素字体角色与材料关系。拒绝同一文章截图反复缩放、HUD、卡片、底条、漂浮 Logo、无对象箭头，以及只靠淡入/平移/统一缩放的机械动作。",
      },
      cacheDir: path.join(artifactOutputDir, "cache"),
    });
    const reportName = "visual-quality-review.json";
    const brief = {contract: "A1FilmVisualRepairBrief/v1", sourceArtifactSha256: review540p.sha256, sourceReportSha256: crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex"), verdict: report.verdict, totalScore: report.totalScore, hardFailures: report.hardFailures || [], repairPlan: report.repairPlan || null, automaticNextStep: report.verdict === "PASS" && Number(report.totalScore) >= 22 && !(report.hardFailures || []).length ? "allow-final-render-decision" : "auto-revise-film-visual-sequence-from-critic", createdAt: new Date().toISOString()};
    const briefName = "visual-repair-brief.json";
    writeJson(path.join(outputDir, reportName), report); writeJson(path.join(outputDir, briefName), brief);
    writeJson(path.join(artifactOutputDir, reportName), report); writeJson(path.join(artifactOutputDir, briefName), brief);
    const reportSha256 = shaFile(path.join(outputDir, reportName));
    const briefSha256 = shaFile(path.join(outputDir, briefName));
    const review = {contract: "A1FilmVisualQualityReview/v1", scope: "sequence-contact-sheet", verdict: report.verdict, totalScore: Number.isFinite(Number(report.totalScore)) ? Number(report.totalScore) : null, maxScore: 24, hardFailures: report.hardFailures || [], sourceArtifactSha256: review540p.sha256, reportPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/current-film-visual-quality-v1/${reportName}`, reportSha256, repairBriefPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/current-film-visual-quality-v1/${briefName}`, repairBriefSha256: briefSha256, reviewedAt: report.reviewedAt || new Date().toISOString()};
    withProjectLock(appRoot, () => {
      const current = readProjectWorkspace(appRoot);
      const next = registerFilmVisualQualityReview(current, review);
      const event = createProductionEvent({workspace: current, action: "current-film-visual-quality-reviewed", payload: {verdict: report.verdict, totalScore: report.totalScore, hardFailures: report.hardFailures || [], reportSha256, automatic: true}});
      next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
      const recalculated = recalculateEditorialAssetWorkbench(next);
      persistProjectState(appRoot, recalculated, {event, files: {"current-film-visual-quality-v1/visual-quality-review.json": report, "current-film-visual-quality-v1/visual-repair-brief.json": brief}});
      console.log(JSON.stringify({status: recalculated.production.release.visualQualityReview.status, verdict: report.verdict, totalScore: report.totalScore, hardFailures: report.hardFailures || [], reportPublicUrl: review.reportPublicUrl, repairBriefPublicUrl: review.repairBriefPublicUrl, finalRenderAllowed: recalculated.gates.finalRenderAllowed, nextAction: recalculated.production.authority.nextAction}, null, 2));
    });
  } finally { await browser.close({silent: true}); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
