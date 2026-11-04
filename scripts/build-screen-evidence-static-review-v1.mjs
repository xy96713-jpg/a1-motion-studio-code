#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {attachSourcePresentationRoutes, compileSourcePresentationRouteAuthority} from "../apps/studio-next/src/lib/a1-source-presentation-routing-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const SCREEN_EVIDENCE_STATIC_REVIEW_CONTRACT = "A1ScreenEvidenceStaticReview/v1";
export const SCREEN_EVIDENCE_STATIC_REVIEW_ACTION = "build-screen-evidence-static-review-v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const defaultEvidenceRootUrl = "/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2";
const defaultSourceRenderUrl = `${defaultEvidenceRootUrl}/all-sixteen-shot-v2`;
const defaultReviewRootUrl = `${defaultEvidenceRootUrl}/static-review-v1`;
const defaultSourceManifestPath = path.join(publicRoot, defaultEvidenceRootUrl.replace(/^\//u, ""), "all-sixteen-shot-v2", "manifest.json");
const defaultSourcePlansPath = path.join(publicRoot, defaultEvidenceRootUrl.replace(/^\//u, ""), "shot-performance-plans.json");
const generatedRootPrefix = "/generated/system-line/editorial-asset-workbench-v1/";
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  const text = String(url || "");
  if (!text.startsWith("/generated/system-line/")) throw new Error(`screen-review-public-path-invalid:${text}`);
  const file = path.resolve(publicRoot, text.replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error(`screen-review-public-path-outside:${text}`);
  return file;
};
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const clamp01 = (value, fallback = 0.5) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
const resolveInputPath = (value, fallback) => {
  const candidate = value || fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
};
const generatedRelativePath = (publicUrl) => {
  if (!String(publicUrl || "").startsWith(generatedRootPrefix)) throw new Error(`screen-review-generated-path-invalid:${publicUrl}`);
  return String(publicUrl).slice(generatedRootPrefix.length);
};

function loadStaticReviewInput() {
  const sourceManifestPath = resolveInputPath(process.env.A1_SCREEN_EVIDENCE_SOURCE_MANIFEST, defaultSourceManifestPath);
  const sourcePlansPath = resolveInputPath(process.env.A1_SCREEN_EVIDENCE_SOURCE_PLANS, defaultSourcePlansPath);
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
  const sourcePlans = JSON.parse(fs.readFileSync(sourcePlansPath, "utf8"));
  const shotIds = [...new Set(sourceManifest.shotIds || (sourceManifest.frames || []).map((frame) => frame.shotId).filter(Boolean))];
  if (!shotIds.length) throw new Error("screen-review-shot-set-missing");
  const sourceRenderUrl = process.env.A1_SCREEN_EVIDENCE_SOURCE_RENDER_URL
    || sourceManifest.frameRootPublicUrl
    || (sourceManifest.output?.publicUrl ? path.posix.dirname(sourceManifest.output.publicUrl) : defaultSourceRenderUrl);
  const reviewRootUrl = process.env.A1_SCREEN_EVIDENCE_REVIEW_ROOT || defaultReviewRootUrl;
  const routeAuthorityRootUrl = process.env.A1_SCREEN_EVIDENCE_ROUTE_AUTHORITY_ROOT
    || path.posix.dirname(path.posix.dirname(reviewRootUrl));
  return {sourceManifest, sourcePlans, shotIds, sourceRenderUrl, reviewRootUrl, routeAuthorityRootUrl, sourceManifestPath, sourcePlansPath};
}

function sourceAssetIdFor(workspace, publicUrl) {
  const asset = (workspace.library?.assets || []).find((candidate) => candidate.videoEvidence?.evidenceFrames?.some((frame) => frame.publicUrl === publicUrl));
  return asset?.id || null;
}

function rawPreviewForShot(shot, sourcePlansByShot) {
  const existing = shot?.sourcePreview?.presentationRoute === "SOURCE_COLLAGE" ? null : shot?.sourcePreview;
  if (existing?.publicUrl) return structuredClone(existing);
  if (shot?.preview?.presentationRoute !== "SOURCE_COLLAGE" && shot?.preview?.publicUrl) return structuredClone(shot.preview);
  const plan = sourcePlansByShot.get(shot?.shotId);
  const sourceFrame = plan?.evidenceFrames?.at(-1);
  return sourceFrame?.publicUrl ? {
    kind: "VERIFIED_SCREEN_SOURCE",
    publicUrl: sourceFrame.publicUrl,
    sha256: sourceFrame.sha256 || null,
    provenance: "CURRENT_SCREEN_SOURCE_RESULT_FRAME",
  } : null;
}

function focusFor(frame, shot) {
  const camera = (shot.cameraTrack || []).filter((item) => Number(item.scale) > 1).sort((a, b) => Number(b.scale) - Number(a.scale))[0] || shot.cameraTrack?.[1] || null;
  const region = frame?.focusRegion || null;
  const focus = frame?.focus || (camera ? {x: camera.x, y: camera.y, scale: camera.scale, derived: true} : {x: 0.5, y: 0.5, scale: 1, derived: true});
  return {
    focusRegion: region || {x: clamp01(focus.x) - 0.12, y: clamp01(focus.y) - 0.08, width: 0.24, height: 0.16, derived: true},
    focus: {x: clamp01(focus.x), y: clamp01(focus.y), scale: Number(focus.scale || 1), derived: Boolean(focus.derived)},
  };
}

function panelOverlay({x, y, width, height, annotation, mode}) {
  const region = annotation.focusRegion;
  const rx = x + clamp01(region.x) * width;
  const ry = y + clamp01(region.y) * height;
  const rw = Math.max(20, clamp01(region.width, 0.24) * width);
  const rh = Math.max(16, clamp01(region.height, 0.16) * height);
  const tx = x + clamp01(annotation.focus.x) * width;
  const ty = y + clamp01(annotation.focus.y) * height;
  const color = mode === "focus" ? "#d7f246" : "#5f87ff";
  return `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4"/><path d="M${rx.toFixed(1)} ${Math.min(y + height - 4, ry + rh + 4).toFixed(1)}H${Math.min(x + width - 8, rx + rw).toFixed(1)}" stroke="#ffcf5a" stroke-width="3"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="10" fill="none" stroke="#ff6b6b" stroke-width="2"/><path d="M${(tx - 15).toFixed(1)} ${ty.toFixed(1)}H${(tx + 15).toFixed(1)}M${tx.toFixed(1)} ${(ty - 15).toFixed(1)}V${(ty + 15).toFixed(1)}" stroke="#ff6b6b" stroke-width="1.5"/>`;
}

async function renderStaticReview({shot, focusFrame, resultFrame, focusFile, resultFile}) {
  const width = 960;
  const height = 540;
  const panel = {width: 444, height: 250, leftX: 24, rightX: 492, y: 64};
  const focusBuffer = await sharp(focusFile).resize(panel.width, panel.height, {fit: "contain", background: "#101719"}).png().toBuffer();
  const resultBuffer = await sharp(resultFile).resize(panel.width, panel.height, {fit: "contain", background: "#101719"}).png().toBuffer();
  const focus = focusFor(focusFrame, shot);
  const result = focusFor(resultFrame, shot);
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="38" fill="#c8d0d1"/><rect x="0" y="0" width="6" height="38" fill="#244edc"/><circle cx="22" cy="19" r="6" fill="#ef6a5c"/><circle cx="40" cy="19" r="6" fill="#f0c04a"/><circle cx="58" cy="19" r="6" fill="#62bd75"/><text x="78" y="25" fill="#162024" font-family="PingFang SC, Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(shot.shotId)} · Windows Evidence Review Window</text><rect x="${panel.leftX - 2}" y="${panel.y - 2}" width="${panel.width + 4}" height="${panel.height + 4}" fill="none" stroke="#53646b"/><rect x="${panel.rightX - 2}" y="${panel.y - 2}" width="${panel.width + 4}" height="${panel.height + 4}" fill="none" stroke="#53646b"/><text x="${panel.leftX}" y="54" fill="#d7f246" font-family="PingFang SC, Arial, sans-serif" font-size="12" font-weight="700">FOCUS · 计划放大区域 / 鼠标目标</text><text x="${panel.rightX}" y="54" fill="#5f87ff" font-family="PingFang SC, Arial, sans-serif" font-size="12" font-weight="700">RESULT · 前后状态 / 结果停留</text>${panelOverlay({x: panel.leftX, y: panel.y, width: panel.width, height: panel.height, annotation: focus, mode: "focus"})}${panelOverlay({x: panel.rightX, y: panel.y, width: panel.width, height: panel.height, annotation: result, mode: "result"})}<rect x="0" y="326" width="${width}" height="214" fill="#111b1e"/><rect x="24" y="344" width="912" height="1" fill="#34484f"/><text x="24" y="366" fill="#f1f4ee" font-family="PingFang SC, Arial, sans-serif" font-size="15" font-weight="700">STATIC REVIEW · 动效前先看见证据如何被包装</text><text x="24" y="390" fill="#a9b7b8" font-family="PingFang SC, Arial, sans-serif" font-size="12">SOURCE_WINDOW · 外部来源窗口　　 CROP_ANNOTATION · 放大 / 鼠标目标 / 划线位置　　 SOURCE_COLLAGE · 前后状态</text><text x="24" y="414" fill="#ffcf5a" font-family="PingFang SC, Arial, sans-serif" font-size="12">MOUSE TARGET: ${escapeXml(`source cursor preserved · focus ${(focus.focus.x * 100).toFixed(1)}%, ${(focus.focus.y * 100).toFixed(1)}%`)}</text><text x="24" y="437" fill="#d7f246" font-family="PingFang SC, Arial, sans-serif" font-size="12">ZOOM PLAN: ${escapeXml(`${focus.focus.scale.toFixed(2)}x · crop ${focus.focusRegion.width.toFixed(3)}×${focus.focusRegion.height.toFixed(3)}`)}</text><text x="24" y="460" fill="#5f87ff" font-family="PingFang SC, Arial, sans-serif" font-size="12">UNDERLINE: ${escapeXml(`focus-region bottom · result restore ${result.focus.scale.toFixed(2)}x`)}</text><text x="24" y="490" fill="#91a0a3" font-family="PingFang SC, Arial, sans-serif" font-size="11">真实录屏源像素保留；红色十字仅为审阅目标导视，不是合成鼠标。生产准入：冻结。</text><text x="24" y="515" fill="#91a0a3" font-family="PingFang SC, Arial, sans-serif" font-size="11">${escapeXml((shot.sourceActions || []).join("  ·  ").slice(0, 142))}</text></svg>`);
  const output = await sharp({create: {width, height, channels: 4, background: "#080d0f"}}).composite([
    {input: focusBuffer, left: panel.leftX, top: panel.y},
    {input: resultBuffer, left: panel.rightX, top: panel.y},
    {input: overlay, left: 0, top: 0},
  ]).png().toBuffer();
  return {buffer: output, sha256: sha256(output), focus, result};
}

async function buildStaticReviewArtifacts(workspace, {now = new Date().toISOString(), sourceManifest, sourcePlans, shotIds, sourceRenderUrl, reviewRootUrl} = {}) {
  if (!sourceManifest || !sourcePlans || !Array.isArray(shotIds) || !sourceRenderUrl || !reviewRootUrl) throw new Error("screen-review-input-required");
  const sourceManifestShotIds = sourceManifest.shotIds || [...new Set((sourceManifest.frames || []).map((frame) => frame.shotId).filter(Boolean))];
  assert.deepEqual(sourceManifestShotIds, shotIds, "screen-review-shot-set");
  const frameByShot = new Map();
  for (const frame of sourceManifest.frames || []) {
    const entry = frameByShot.get(frame.shotId) || {};
    entry[frame.label] = frame;
    frameByShot.set(frame.shotId, entry);
  }
  const planByShot = new Map((sourcePlans.shots || []).map((shot) => [shot.shotId, shot]));
  const buffers = {};
  const entries = [];
  const sourceAssetIds = new Set();
  for (const shotId of shotIds) {
    const shot = planByShot.get(shotId);
    const frames = frameByShot.get(shotId);
    assert.ok(shot && frames?.focus && frames?.result, `screen-review-input:${shotId}`);
    const focusFile = path.join(publicRoot, sourceRenderUrl.replace(/^\//u, ""), frames.focus.file);
    const resultFile = path.join(publicRoot, sourceRenderUrl.replace(/^\//u, ""), frames.result.file);
    assert.ok(fs.existsSync(focusFile) && fs.existsSync(resultFile), `screen-review-frame-files:${shotId}`);
    assert.equal(sha256(fs.readFileSync(focusFile)), frames.focus.sha256, `screen-review-focus-sha:${shotId}`);
    assert.equal(sha256(fs.readFileSync(resultFile)), frames.result.sha256, `screen-review-result-sha:${shotId}`);
    const focusPlan = shot.evidenceFrames?.[0] || null;
    const resultPlan = shot.evidenceFrames?.at(-1) || focusPlan;
    const rendered = await renderStaticReview({shot, focusFrame: focusPlan, resultFrame: resultPlan, focusFile, resultFile});
    const publicUrl = `${reviewRootUrl}/${shotId}.png`;
    buffers[generatedRelativePath(publicUrl)] = rendered.buffer;
    const focusSourceAssetId = sourceAssetIdFor(workspace, focusPlan?.publicUrl);
    const resultSourceAssetId = sourceAssetIdFor(workspace, resultPlan?.publicUrl);
    [focusSourceAssetId, resultSourceAssetId].filter(Boolean).forEach((id) => sourceAssetIds.add(id));
    entries.push({
      shotId,
      status: "PASS",
      staticPreview: {publicUrl, sha256: rendered.sha256, width: 960, height: 540, reviewOnly: true},
      presentationRoute: "SOURCE_COLLAGE",
      annotationRoute: "CROP_ANNOTATION",
      sourceWindowRoute: "SOURCE_WINDOW",
      panels: [
        {state: "FOCUS", route: "SOURCE_WINDOW", publicUrl: `${sourceRenderUrl}/${frames.focus.file}`, sha256: frames.focus.sha256, sourceAssetId: focusSourceAssetId, sourceFrame: focusPlan, annotation: rendered.focus, mouseTarget: "SOURCE_CURSOR_PRESERVED"},
        {state: "RESULT", route: "SOURCE_WINDOW", publicUrl: `${sourceRenderUrl}/${frames.result.file}`, sha256: frames.result.sha256, sourceAssetId: resultSourceAssetId, sourceFrame: resultPlan, annotation: rendered.result, mouseTarget: "SOURCE_CURSOR_PRESERVED"},
      ],
      sourcePlansSha256: sourcePlansManifestSha(sourcePlans),
      cameraModel: sourceManifest.cameraAudit?.model || "C2_WIDE_FOCUS_RESTORE_V2",
      syntheticCursorAdded: false,
      sourcePixelsPreserved: true,
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
    });
  }
  const contactColumns = 4;
  const contactTileHeight = 160;
  const contactRows = Math.max(1, Math.ceil(entries.length / contactColumns));
  const contactHeight = 135 + contactRows * contactTileHeight;
  const contactTiles = await Promise.all(entries.map(async (entry, index) => ({input: await sharp(buffers[generatedRelativePath(entry.staticPreview.publicUrl)]).resize(240, 135, {fit: "cover"}).png().toBuffer(), left: (index % contactColumns) * 240, top: Math.floor(index / contactColumns) * contactTileHeight})));
  const contactLabel = Buffer.from(`<svg width="960" height="${contactHeight}" xmlns="http://www.w3.org/2000/svg">${entries.map((entry, index) => `<rect x="${(index % contactColumns) * 240}" y="${Math.floor(index / contactColumns) * contactTileHeight + 135}" width="240" height="25" fill="#111b1e"/><text x="${(index % contactColumns) * 240 + 10}" y="${Math.floor(index / contactColumns) * contactTileHeight + 152}" fill="#f1f4ee" font-family="PingFang SC, Arial, sans-serif" font-size="11" font-weight="700">${entry.shotId} · SOURCE_COLLAGE</text>`).join("")}</svg>`);
  const contact = await sharp({create: {width: 960, height: contactHeight, channels: 4, background: "#080d0f"}}).composite([...contactTiles, {input: contactLabel, left: 0, top: 0}]).png().toBuffer();
  const contactFileName = process.env.A1_SCREEN_EVIDENCE_CONTACT_NAME || "all-sixteen-static-review-contact.png";
  const contactPublicUrl = `${reviewRootUrl}/${contactFileName}`;
  const withoutHash = {
    contract: SCREEN_EVIDENCE_STATIC_REVIEW_CONTRACT,
    version: 1,
    status: "READY_FOR_STATIC_BOARD_REVIEW",
    current: true,
    reviewOnly: true,
    shotIds,
    sourceRenderManifestSha256: sha256(sourceManifest),
    sourcePlansSha256: sourcePlansManifestSha(sourcePlans),
    sourceAssetIds: [...sourceAssetIds],
    outputRoot: reviewRootUrl,
    entries,
    contactSheet: {publicUrl: contactPublicUrl, sha256: sha256(contact), width: 960, height: contactHeight},
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    articleSourceSha256: workspace.article?.sourceTextSha256 || null,
    workspaceContract: workspace.contract || null,
    generatedAt: now,
  };
  return {manifest: {...withoutHash, manifestSha256: sha256(withoutHash)}, buffers: {...buffers, [generatedRelativePath(contactPublicUrl)]: contact}};
}

function sourcePlansManifestSha(sourcePlans) {
  return sha256(sourcePlans);
}

export async function buildScreenEvidenceStaticReview({now = new Date().toISOString()} = {}) {
  const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const input = loadStaticReviewInput();
  const artifacts = await buildStaticReviewArtifacts(initial, {...input, now});
  const {sourcePlans, shotIds, reviewRootUrl, routeAuthorityRootUrl} = input;
  const sourcePlansByShot = new Map((sourcePlans.shots || []).map((shot) => [shot.shotId, shot]));
  const routeAuthority = compileSourcePresentationRouteAuthority(initial, {
    staticReview: {manifestSha256: artifacts.manifest.manifestSha256, shotIds, sourceAssetIds: artifacts.manifest.sourceAssetIds},
    generatedAt: now,
  });
  const sourceManifestRelative = generatedRelativePath(`${reviewRootUrl}/manifest.json`);
  const routeAuthorityRelative = generatedRelativePath(`${routeAuthorityRootUrl}/source-presentation-routes-v1/authority.json`);
  const result = withProjectLock(appRoot, () => {
    const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (locked.workspaceSha256 !== initial.workspaceSha256) throw new Error(`screen-review-workspace-cas-failed:${locked.workspaceSha256}`);
    let next = attachSourcePresentationRoutes(locked, routeAuthority);
    const reviewByShot = new Map(artifacts.manifest.entries.map((entry) => [entry.shotId, entry]));
    next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
      const entry = reviewByShot.get(shot.shotId);
      if (!entry) return shot;
      return {
        ...shot,
        sourcePreview: rawPreviewForShot(shot, sourcePlansByShot),
        preview: {
          kind: "SOURCE_COLLAGE_STATIC_REVIEW",
          publicUrl: entry.staticPreview.publicUrl,
          sha256: entry.staticPreview.sha256,
          presentationRoute: entry.presentationRoute,
          annotationRoute: entry.annotationRoute,
          sourceWindowRoute: entry.sourceWindowRoute,
          staticReviewManifestSha256: artifacts.manifest.manifestSha256,
          reviewOnly: true,
          sourcePixelsPreserved: true,
          syntheticCursorAdded: false,
          productionAdmission: false,
          userVisualApproval: "NOT_APPROVED",
        },
      };
    });
    next.production.screenEvidenceStaticReview = {
      contract: SCREEN_EVIDENCE_STATIC_REVIEW_CONTRACT,
      status: artifacts.manifest.status,
      manifestSha256: artifacts.manifest.manifestSha256,
      contactSheet: artifacts.manifest.contactSheet,
      shotIds,
      current: true,
      reviewOnly: true,
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
      generatedAt: now,
    };
    const rawPreviewByShot = new Map(next.production.shotVisualCoveragePlan.shotPlans.map((shot) => [shot.shotId, rawPreviewForShot(shot, sourcePlansByShot)]));
    const event = createProductionEvent({workspace: next, action: SCREEN_EVIDENCE_STATIC_REVIEW_ACTION, targetId: artifacts.manifest.manifestSha256, payload: {contract: SCREEN_EVIDENCE_STATIC_REVIEW_CONTRACT, shotCount: shotIds.length, routeAuthoritySha256: routeAuthority.authoritySha256, productionAdmission: false, userVisualApproval: "NOT_APPROVED"}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    next = recalculateEditorialAssetWorkbench(next, now);
    // The workbench recalculator intentionally rebuilds derived coverage. Reapply
    // this review-only projection after that rebuild so the static board remains
    // visibly bound to the new collage while the raw source preview is retained.
    next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
      const entry = reviewByShot.get(shot.shotId);
      if (!entry) return shot;
      return {
        ...shot,
        sourcePreview: structuredClone(rawPreviewByShot.get(shot.shotId) || null),
        preview: {
          kind: "SOURCE_COLLAGE_STATIC_REVIEW",
          publicUrl: entry.staticPreview.publicUrl,
          sha256: entry.staticPreview.sha256,
          presentationRoute: entry.presentationRoute,
          annotationRoute: entry.annotationRoute,
          sourceWindowRoute: entry.sourceWindowRoute,
          staticReviewManifestSha256: artifacts.manifest.manifestSha256,
          reviewOnly: true,
          sourcePixelsPreserved: true,
          syntheticCursorAdded: false,
          productionAdmission: false,
          userVisualApproval: "NOT_APPROVED",
        },
      };
    });
    next.production.screenEvidenceStaticReview = {
      contract: SCREEN_EVIDENCE_STATIC_REVIEW_CONTRACT,
      status: artifacts.manifest.status,
      manifestSha256: artifacts.manifest.manifestSha256,
      contactSheet: artifacts.manifest.contactSheet,
      shotIds,
      current: true,
      reviewOnly: true,
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
      generatedAt: now,
    };
    next = assertEditorialAssetWorkbench(next);
    const files = {
      [sourceManifestRelative]: artifacts.manifest,
      [routeAuthorityRelative]: routeAuthority,
    };
    const binaryFiles = Object.fromEntries(Object.entries(artifacts.buffers).map(([relative, buffer]) => [relative, buffer]));
    const persisted = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: locked.workspaceSha256, files, binaryFiles});
    return {persisted, manifest: artifacts.manifest, routeAuthority, workspace: next};
  });
  return {status: "PASS", workspaceSha256: result.persisted.workspaceSha256, staticReviewManifestSha256: result.manifest.manifestSha256, routeAuthoritySha256: result.routeAuthority.authoritySha256, shotCount: shotIds.length, contactSheet: result.manifest.contactSheet};
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(await buildScreenEvidenceStaticReview(), null, 2));
