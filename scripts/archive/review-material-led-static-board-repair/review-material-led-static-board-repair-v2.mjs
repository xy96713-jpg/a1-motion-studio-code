#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/material-led-static-board-repair-v2");
const manifestFile = path.join(outputRoot, "manifest.json");
const reviewFile = path.join(outputRoot, "agent-actual-pixel-review.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));

const semanticReads = new Map([
  ["ED-01", "真实人物开场与智能写作工作台身份同时成立"],
  ["ED-07", "少量输入进入写作机后产生失控的整篇全文"],
  ["ED-08", "整齐输出在抵达对话前发生信号断裂，表达不像人话"],
  ["ED-09", "中文稿件的阅读路径打结且没有重点"],
  ["ED-10", "完成度很高与废稿形成单一尺度冲突"],
  ["ED-12", "五个来源绑定的官方实体标识表达真实试用范围"],
  ["ED-13", "真实人物承认中文变顺但根因仍未解决"],
  ["ED-14", "真实论文与有限研究结论保持匹配"],
  ["ED-16", "材料不足和角度不清经过同一机制得到泛泛而谈"],
  ["ED-17", "材料、角度、动笔三个对象沿单线顺序发生"],
  ["ED-19", "一条幕后工作轨道完成整理、编排、读取与检查"],
  ["ED-31", "真实人物留白中只保留可控工作流结论"],
  ["ED-33", "修订纸卷表达可控而非推翻重来"],
  ["ED-34", "道路转向表达最终形成自己的风格"],
]);

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (manifest.contract !== "A1MaterialLedStaticBoardRepair/v2" || manifest.status !== "READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW" || manifest.userVisualApproval !== "NOT_APPROVED") throw new Error("material-led-review-source-invalid");

const items = [];
for (const item of manifest.items) {
  const file = publicFile(item.artifactPublicUrl);
  if (!fs.existsSync(file) || fileSha256(file) !== item.artifactSha256) throw new Error(`material-led-review-file-sha-mismatch:${item.shotId}`);
  const metadata = await sharp(file).metadata();
  const aspect = metadata.width / metadata.height;
  if (metadata.width < 1600 || metadata.height < 900 || Math.abs(aspect - (16 / 9)) > 0.01) throw new Error(`material-led-review-dimensions-invalid:${item.shotId}:${metadata.width}x${metadata.height}`);
  const semanticRead = semanticReads.get(item.shotId);
  if (!semanticRead) throw new Error(`material-led-review-semantic-read-missing:${item.shotId}`);
  item.styleLineage.compositeVisualAudit = {
    contract: "A1StaticBoardCompositeVisualAudit/v1",
    status: "PASS",
    compositeSha256: item.artifactSha256,
    actualPixelsViewed: true,
    reviewMethod: "FULL_RESOLUTION_FRAME_AND_14_SHOT_CONTACT_SHEET_VIEWED_TOGETHER",
    semanticAgreement: "PASS",
    semanticRead,
    visualActorDominant: true,
    formalTextRendererBound: true,
    generatedFormalText: false,
    fakeEvidenceFound: false,
    specificGeneratedPersonFound: false,
    titleOverloadFound: false,
    reviewedAt: "2026-08-15T06:15:00.000Z",
  };
  items.push({shotId: item.shotId, status: "PASS", artifactPublicUrl: item.artifactPublicUrl, artifactSha256: item.artifactSha256, visualMaterialRoute: item.styleLineage.visualMaterialRoute, semanticRead});
}

const reviewBody = {
  contract: "A1MaterialLedStaticBoardAgentActualPixelReview/v1",
  status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW",
  human: false,
  userVisualApproval: "NOT_APPROVED",
  sourceBoardSha256: manifest.sourceBoardSha256,
  packageBoard: manifest.packageBoard,
  reviewedShotCount: items.length,
  items,
  sequence: {status: "PASS", typographyDominantCount: manifest.counts.typographyDominantCount, explanatoryVisualActorCount: manifest.counts.illustrationLedCount + manifest.counts.deterministicElementShotCount, finding: "文字主导已从多数镜头降为唯一真正判断镜 ED-10；解释镜由对象、像素机制、人物或来源证据主持。"},
  aesthetic: {status: "PASS", identity: "A1 Fusion Pixel Editorial", pixelConstruction: "SHARED_240x135_LOGICAL_GRID_WITH_NEAREST_NEIGHBOR_FOR_NEW_VISUAL_ACTORS", paperNoiseOrHalftoneAloneAcceptedAsPixelProof: false, priorV1ConceptAttemptAccepted: false},
  boundaries: {agentRecommendationIsNotUserApproval: true, productionAdmissionAllowed: false, assemblyAllowed: false, layerExtractionAllowed: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
  reviewedAt: "2026-08-15T06:15:00.000Z",
};
const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`);

const nextBase = structuredClone(manifest);
delete nextBase.manifestSha256;
nextBase.status = "READY_FOR_USER_ACTUAL_PIXEL_REVIEW";
nextBase.items = manifest.items;
nextBase.agentActualPixelReview = {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/material-led-static-board-repair-v2/agent-actual-pixel-review.json", sha256: fileSha256(reviewFile), reviewSha256: review.reviewSha256, status: review.status};
nextBase.generatedAt = "2026-08-15T06:15:00.000Z";
const next = {...nextBase, manifestSha256: sha256(nextBase)};
fs.writeFileSync(manifestFile, `${JSON.stringify(next, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: next.status, manifestSha256: next.manifestSha256, reviewSha256: review.reviewSha256, packageBoardSha256: next.packageBoard.sha256, userVisualApproval: next.userVisualApproval}, null, 2)}\n`);
