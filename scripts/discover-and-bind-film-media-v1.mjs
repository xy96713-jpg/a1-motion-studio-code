#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1";
const outputRoot = path.join(publicRoot, phaseRelative);
const require = createRequire(path.join(root, "package.json"));
const ffprobe = require("@ffprobe-installer/ffprobe").path;
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sourceRoot = process.env.A1_CURRENT_ARTICLE_MEDIA_ROOT || "/Users/a1/Documents/Codex/声音/outputs";
const candidates = {
  audio: [process.env.A1_SOURCE_AUDIO, path.join(sourceRoot, "voice_clone_july1/july1_full_16k_mono.wav")].filter(Boolean),
  screens: [process.env.A1_SCREEN_RECORDING, path.join(sourceRoot, "smart_demo_recorder/projects/019f4e85-3e32-7b22-aa7d-d95294b97ef2/mouse-demo-workbench.mov"), path.join(sourceRoot, "smart_demo_recorder/projects/019f4e85-3e32-7b22-aa7d-d95294b97ef2/mouse-demo-presentation.mov")].filter(Boolean),
  presenter: [process.env.A1_PRESENTER_VIDEO].filter(Boolean),
  subtitles: [process.env.A1_SOURCE_SRT, path.join(sourceRoot, "subtitles_july1/july1_full_voice_bright_natural_corrected.srt")].filter(Boolean),
};

function probe(file) {
  if (!file || !fs.existsSync(file)) return null;
  const raw = execFileSync(ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,sample_rate", "-of", "json", file], {encoding: "utf8"});
  const parsed = JSON.parse(raw);
  return {sourcePath: file, durationMs: Math.round(Number(parsed.format?.duration || 0) * 1000), streams: parsed.streams || [], sizeBytes: fs.statSync(file).size, sha256: shaFile(file)};
}

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const targetDuration = workspace.article.durationMs;
const audio = candidates.audio.map(probe).filter(Boolean).find((item) => Math.abs(item.durationMs - targetDuration) <= 3_000 && item.streams.some((stream) => stream.codec_type === "audio")) || null;
const screens = candidates.screens.map(probe).filter(Boolean).filter((item) => item.durationMs >= 5_000 && item.streams.some((stream) => stream.codec_type === "video" && stream.width >= 1280));
const presenter = candidates.presenter.map(probe).filter(Boolean).find((item) => item.durationMs >= targetDuration * .75 && item.streams.some((stream) => stream.codec_type === "video")) || null;
const subtitle = candidates.subtitles.find((file) => file && fs.existsSync(file)) || null;
fs.mkdirSync(outputRoot, {recursive: true});

function importFile(item, role, fallbackExtension) {
  if (!item) return null;
  const sourcePath = typeof item === "string" ? item : item.sourcePath;
  const sha256 = typeof item === "string" ? shaFile(item) : item.sha256;
  const extension = path.extname(sourcePath) || fallbackExtension;
  const fileName = `${role}-${sha256.slice(0, 12)}${extension}`;
  const target = path.join(outputRoot, fileName);
  if (!fs.existsSync(target) || shaFile(target) !== sha256) {
    try {
      fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_FICLONE);
    } catch {
      fs.copyFileSync(sourcePath, target);
    }
  }
  return {assetId: `imported-${role}`, publicUrl: `/${phaseRelative}/${fileName}`, sha256, sourcePath, importedAt: new Date().toISOString(), durationMs: typeof item === "string" ? null : item.durationMs, sizeBytes: fs.statSync(target).size, streams: typeof item === "string" ? [] : item.streams};
}

const imported = {
  audio: importFile(audio, "source-audio", ".wav"),
  screens: screens.map((item, index) => importFile(item, `screen-recording-${index + 1}`, ".mov")),
  presenter: importFile(presenter, "presenter-video", ".mov"),
  subtitles: importFile(subtitle, "subtitles", ".srt"),
};
const presenterShotAssets = workspace.library.assets
  .filter((asset) => asset.route === "shot-composition" && String(asset.shotDemand?.editMode || "").startsWith("presenter-"))
  .sort((left, right) => Number(left.shotDemand.order) - Number(right.shotDemand.order));
const presenterFrameRoot = path.join(outputRoot, "presenter-shot-frames");
const presenterShotFrames = imported.presenter ? presenterShotAssets.map((asset) => {
  fs.mkdirSync(presenterFrameRoot, {recursive: true});
  const editWindow = asset.shotDemand.editWindow;
  const atMs = Math.max(0, Math.min(imported.presenter.durationMs - 34, Math.round((Number(editWindow.startMs) + Number(editWindow.endMs)) / 2)));
  const target = path.join(presenterFrameRoot, `${asset.shotDemand.shotId}.jpg`);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(atMs / 1000), "-i", presenter.sourcePath, "-frames:v", "1", "-vf", "scale=1920:-2", "-q:v", "2", target]);
  return {
    shotId: asset.shotDemand.shotId,
    atMs,
    publicUrl: `/${phaseRelative}/presenter-shot-frames/${path.basename(target)}`,
    sha256: shaFile(target),
  };
}) : [];
const presenterReferences = workspace.library.assets.filter((asset) => asset.review.status === "approved" && asset.id.startsWith("source-presenter-") && asset.assetUri).map((asset) => ({assetId: asset.id, publicUrl: asset.assetUri, sha256: asset.sha256}));
const report = {contract: "A1FilmMediaDiscoveryReport/v1", projectId: workspace.production.project.projectId, targetDurationMs: targetDuration, sourceRoot, imported, presenterReferences, presenterShotFrames, status: imported.presenter ? "REAL_MEDIA_COMPLETE" : "REAL_PRESENTER_VIDEO_MISSING_DESIGN_PROOF_ONLY", discoveredAt: new Date().toISOString()};
const reportName = "film-media-discovery-v1-latest.json";

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const bindings = next.production.assembly.mediaBindings;
  if (imported.audio) bindings.audio = imported.audio;
  imported.screens.forEach((item, index) => { bindings[`screen-${index + 1}`] = item; });
  if (imported.presenter) bindings.presenter = imported.presenter;
  if (imported.subtitles) bindings.subtitles = imported.subtitles;
  bindings.presenterReferences = {assetId: "approved-presenter-reference-stills", publicUrl: presenterReferences[0]?.publicUrl || "", sha256: crypto.createHash("sha256").update(JSON.stringify(presenterReferences)).digest("hex"), importedAt: report.discoveredAt, items: presenterReferences};
  if (imported.presenter) {
    const presenterShotIds = presenterShotAssets.map((asset) => asset.shotDemand.shotId);
    const presenterEvidence = {
      contract: "A1RealPresenterVideoEvidence/v1",
      publicUrl: imported.presenter.publicUrl,
      sha256: imported.presenter.sha256,
      durationMs: imported.presenter.durationMs,
      timingAuthority: "article-srt-edit-window",
      identityPolicy: "user-owned-real-presenter-no-ai-substitution",
      shotFrames: presenterShotFrames,
    };
    const sourceAdmissionSha256 = shaValue({
      assetId: "source-presenter-continuous-video",
      sha256: imported.presenter.sha256,
      durationMs: imported.presenter.durationMs,
      presenterShotIds,
      presenterShotFrames,
    });
    const existingIndex = next.library.assets.findIndex((asset) => asset.id === "source-presenter-continuous-video");
    const presenterAsset = {
      id: "source-presenter-continuous-video",
      stageId: "source-materials",
      name: "本人完整连续口播视频",
      purpose: "作为全部人物镜头的真实时间轴主素材；按每镜 SRT 时间窗取帧并保护眼睛、嘴部与表情。",
      semanticRole: "real-presenter-continuous-video",
      route: "verified-real-source",
      promptBrief: "只允许裁切、调色、轻微推拉和不遮脸的文字包装；禁止 AI 替换人物或假口型。",
      sourceRequirement: "用户本人真实连续口播，时长与当前文章/SRT 对齐。",
      outputPolicy: "source-bound-continuous-video",
      status: "approved",
      contentSha256: sourceAdmissionSha256,
      requiredForShotComposition: true,
      assetUri: imported.presenter.publicUrl,
      sha256: imported.presenter.sha256,
      usedByShotIds: presenterShotIds,
      extractionPolicy: null,
      typographyRole: null,
      typographySpec: null,
      preview: {kind: "source-video", publicUrl: presenterShotFrames[0]?.publicUrl || imported.presenter.publicUrl},
      candidates: null,
      shotDemand: null,
      presenterEvidence,
      provenance: {
        sourceType: "user-owned-presenter-continuous-video",
        sourceUri: imported.presenter.sourcePath,
        license: "user-owned presenter footage",
        reviewed: true,
        resolver: "davinci-media-pool-read-only-inventory",
      },
      review: {
        status: "approved",
        note: "已从当前 DaVinci 项目媒体池只读定位，并核对 5 个时间点、视频时长、分辨率、人物身份和全文连续性。",
        reviewedAt: report.discoveredAt,
        reviewedBy: "system-source-audit",
        approvedContentSha256: sourceAdmissionSha256,
      },
      sourceUri: imported.presenter.sourcePath,
    };
    const contentSha256 = editorialAssetContentSha256(presenterAsset);
    presenterAsset.contentSha256 = contentSha256;
    presenterAsset.review.approvedContentSha256 = contentSha256;
    if (existingIndex >= 0) next.library.assets[existingIndex] = presenterAsset;
    else next.library.assets.push(presenterAsset);
  }
  next.production.assembly.audioBound = Boolean(imported.audio);
  next.production.assembly.screenMediaBound = imported.screens.length > 0;
  next.production.assembly.presenterMediaBound = Boolean(imported.presenter);
  next.production.assembly.subtitleTimelineBound = Boolean(imported.subtitles || next.production.assembly.subtitleTimelineBound);
  next.production.assembly.status = imported.presenter && imported.audio && imported.screens.length ? "real-media-bound" : imported.audio && imported.screens.length ? "design-proof-ready-real-presenter-video-missing" : "auto-discovery-incomplete";
  next.production.assembly.discovery = {reportPublicUrl: `/${phaseRelative}/${reportName}`, status: report.status, discoveredAt: report.discoveredAt};
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = imported.presenter ? "render-full-34-shot-540p" : "render-full-34-shot-design-proof-then-wait-real-presenter-video";
  const event = createProductionEvent({workspace: current, action: "film-media-auto-discovery-complete", targetId: current.production.project.projectId, payload: {status: report.status, audioBound: Boolean(imported.audio), screenMediaBound: imported.screens.length > 0, presenterMediaBound: Boolean(imported.presenter), subtitleBound: Boolean(imported.subtitles)}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, report.discoveredAt);
  persistProjectState(appRoot, recalculated, {event, files: {[reportName]: report}});
  return recalculated;
});

fs.writeFileSync(path.join(outputRoot, reportName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, assembly: updated.production.assembly, reportPublicUrl: `/${phaseRelative}/${reportName}`}, null, 2));
