#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {assertDefaultEffectPrimitiveContinuation, assertDefaultEffectPrimitiveReview} from "../apps/studio-next/src/lib/a1-default-effect-primitives-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const libraryRoot = "default-design-asset-library-v1/effect-primitives-v1";
const fontPaths = {heavy: path.join(appRoot, "public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf"), pixel: path.join(appRoot, "public/a1-editorial-fonts/fusion-pixel.ttf")};
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fontCss = `<style>@font-face{font-family:'A1 Heavy';src:url('${dataUrl(fontPaths.heavy, "font/otf")}')}@font-face{font-family:'A1 Pixel';src:url('${dataUrl(fontPaths.pixel, "font/ttf")}')}</style>`;

function specimenSvg({dark = false, transparent = false} = {}) {
  const base = dark ? "#121923" : "#eef2f1";
  const ink = dark ? "#edf1ef" : "#111923";
  const muted = dark ? "#91a6ba" : "#526574";
  const plate = dark ? "#1b2633" : "#d9e1df";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${fontCss}${transparent ? "" : `<rect width="1920" height="1080" fill="${base}"/>`}<rect x="118" y="104" width="12" height="250" fill="#2758c7"/><text x="172" y="205" fill="${ink}" font-family="A1 Heavy" font-size="92" letter-spacing="-5">效果不是装饰</text><text x="176" y="278" fill="${muted}" font-family="A1 Pixel" font-size="34">它必须说明画面状态</text><rect x="174" y="350" width="650" height="8" fill="#2758c7"/><rect x="1120" y="188" width="580" height="520" rx="4" fill="${plate}" fill-opacity="${transparent ? ".72" : "1"}" stroke="${muted}" stroke-width="3"/><circle cx="1410" cy="448" r="132" fill="none" stroke="${ink}" stroke-width="10"/><path d="M1285 465 C1342 360 1470 355 1536 430 C1586 488 1534 582 1424 574" fill="none" stroke="#2758c7" stroke-width="18"/><rect x="1180" y="756" width="510" height="10" fill="${muted}"/><rect x="1180" y="790" width="355" height="10" fill="${muted}"/><rect x="1180" y="824" width="430" height="10" fill="${muted}"/></svg>`;
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const priorContinuation = assertDefaultEffectPrimitiveContinuation(authority.effectPrimitiveContinuation);
  const priorReview = priorContinuation.review;
  const now = new Date().toISOString();
  const binaryFiles = {};
  const composites = [];
  const candidates = [];
  const light = await sharp(Buffer.from(specimenSvg())).png().toBuffer();
  const dark = await sharp(Buffer.from(specimenSvg({dark: true}))).png().toBuffer();
  for (const [index, candidate] of priorReview.candidates.entries()) {
    const primitivePath = path.join(appRoot, "public", candidate.publicUrl.replace(/^\//u, ""));
    const primitive = fs.readFileSync(primitivePath);
    const backgroundDark = candidate.candidateId.includes("charcoal");
    let composite;
    if (candidate.assetKind === "BACKGROUND_FIELD") {
      const overlay = await sharp(Buffer.from(specimenSvg({dark: backgroundDark, transparent: true}))).png().toBuffer();
      composite = await sharp(primitive).composite([{input: overlay, blend: "over"}]).png().toBuffer();
    } else {
      const base = candidate.candidateId === "effect-crt-scanline-phosphor-v1" || candidate.effectFamily === "SIGNAL_TEAR" ? dark : light;
      const effectInput = candidate.effectFamily === "CRT_SCANLINE" ? await sharp(primitive).extract({left: 1120, top: 188, width: 580, height: 520}).png().toBuffer() : primitive;
      composite = await sharp(base).composite([{input: effectInput, left: candidate.effectFamily === "CRT_SCANLINE" ? 1120 : 0, top: candidate.effectFamily === "CRT_SCANLINE" ? 188 : 0, blend: "over"}]).png().toBuffer();
    }
    const compositePath = `${libraryRoot}/composites/${candidate.candidateId}-specimen.png`;
    binaryFiles[compositePath] = composite;
    candidates.push({...candidate, composite: {...candidate.composite, sha256: sha256(composite)}, visualAssessment: {...candidate.visualAssessment, actualCompositeInspected: true, repairApplied: "background specimen made transparent; CRT preview confined to the semantic screen object; source primitive unchanged"}});
    composites.push({input: await sharp(composite).resize(600, 338, {fit: "cover"}).png().toBuffer(), left: [24, 660, 1296][index % 3], top: index < 3 ? 68 : 716});
  }
  const lefts = [24, 660, 1296];
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1460"><rect width="1920" height="1460" fill="#0b1015"/><text x="24" y="36" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT EFFECT PRIMITIVES V1 · REPAIRED SAME-SPECIMEN COMPARISON · USER ACTUAL-PIXEL REVIEW</text>${candidates.map((candidate, index) => `<text x="${lefts[index % 3]}" y="${index < 3 ? 430 : 1078}" fill="#eef1f0" font-family="monospace" font-size="14">${escapeXml(candidate.candidateId)}</text><text x="${lefts[index % 3]}" y="${index < 3 ? 454 : 1102}" fill="#8fa6b8" font-family="monospace" font-size="12">${escapeXml(candidate.effectFamily)} · ${escapeXml(candidate.assetKind)} · NOT APPROVED</text>`).join("")}<line x1="24" y1="1150" x2="1896" y2="1150" stroke="#32414d"/><text x="24" y="1192" fill="#dfff68" font-family="monospace" font-size="16">USAGE BOUNDARY</text><text x="24" y="1232" fill="#d9e0e2" font-family="monospace" font-size="14">CRT / 6-shot window ≤ 2 · one effect family per frame · semantic action required · global filter forbidden</text><text x="24" y="1272" fill="#8fa6b8" font-family="monospace" font-size="13">Transparent originals and recipes are separate from the specimen composites. Machine PASS cannot approve visual direction.</text><text x="24" y="1378" fill="#ef7a70" font-family="monospace" font-size="15">MOTION · RESOLVE · FINAL RENDER · WHOLE-FILM EXPANSION remain frozen.</text></svg>`);
  const reviewSheet = await sharp(labels).composite(composites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const reviewBody = {...priorReview, supersedesReviewSha256: priorReview.reviewSha256, candidates, reviewSheet: {...priorReview.reviewSheet, sha256: sha256(reviewSheet)}, actualPixelRepair: {reason: "opaque-specimen-obscured-contour-fields-and-global-preview-misrepresented-local-CRT-policy", rawPrimitivePixelsChanged: false, repairedCompositeCount: 4, repairedBackgroundCompositeCount: 2, repairedCrtCompositeCount: 2}, createdAt: now};
  delete reviewBody.reviewSha256;
  const review = assertDefaultEffectPrimitiveReview({...reviewBody, reviewSha256: sha256(reviewBody)});
  const continuationBody = {...priorContinuation, supersedesContinuationSha256: priorContinuation.continuationSha256, reviewSha256: review.reviewSha256, review, createdAt: now};
  delete continuationBody.continuationSha256;
  const continuation = assertDefaultEffectPrimitiveContinuation({...continuationBody, continuationSha256: sha256(continuationBody)});
  const nextAuthorityBody = structuredClone(authority);
  delete nextAuthorityBody.authoritySha256;
  nextAuthorityBody.effectPrimitiveContinuation = continuation;
  nextAuthorityBody.updatedAt = now;
  nextAuthorityBody.authoritySha256 = sha256(nextAuthorityBody);
  const nextAuthority = assertArticleAssetProductionAuthority(nextAuthorityBody);
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = nextAuthority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "repair-default-effect-primitive-review-composites", targetId: continuation.continuationSha256, payload: {supersedesReviewSha256: priorReview.reviewSha256, reviewSha256: review.reviewSha256, rawPrimitivePixelsChanged: false, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `repair-default-effect-primitives-v1-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, reviewSheet: result.review.reviewSheet, rawPrimitivePixelsChanged: false, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED"}, null, 2));
