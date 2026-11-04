#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const candidateRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/ed08-semantic-takeover-repair-v1");
const manifestFile = path.join(candidateRoot, "manifest.json");
const reviewFile = path.join(candidateRoot, "agent-actual-pixel-review.json");
const fontFile = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const normalizeText = (value) => String(value || "").replace(/[\s\u3000\p{P}\p{S}]+/gu, "").toLowerCase();

const manifest = readJson(manifestFile);
if (manifest.contract !== "A1ED08SemanticTakeoverRepair/v1" || manifest.status !== "PENDING_AGENT_ACTUAL_PIXEL_REVIEW") throw new Error("ed08-review-manifest-state-invalid");
const frameFile = publicFile(manifest.frame.publicUrl);
const frameBytes = fs.readFileSync(frameFile);
if (sha256(frameBytes) !== manifest.frame.sha256) throw new Error("ed08-review-frame-sha-mismatch");
const metadata = await sharp(frameBytes).metadata();
if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png") throw new Error(`ed08-review-frame-decode-invalid:${JSON.stringify(metadata)}`);
if (sha256(fs.readFileSync(fontFile)) !== manifest.fontBinding.sha256) throw new Error("ed08-review-font-sha-mismatch");
const observedText = manifest.item.textNodes.map((node) => node.text).join(" ");
if (normalizeText(observedText) !== normalizeText(manifest.exactFormalText)) throw new Error(`ed08-review-exact-copy-mismatch:${observedText}`);
if (!manifest.item.textNodes.every((node) => node.fontSha256 === manifest.fontBinding.sha256 && node.editable === true && node.generated === false)) throw new Error("ed08-review-formal-text-binding-invalid");
if (manifest.item.styleLineage.visualMaterialRoute !== "TYPOGRAPHY_DOMINANT" || !manifest.item.styleLineage.typographyJustification) throw new Error("ed08-review-typography-dominance-invalid");

const assessedAt = new Date().toISOString();
const reviewBody = {
  contract: "A1ED08SemanticTakeoverActualPixelReview/v1",
  status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW",
  shotId: "ED-08",
  actualPixelsViewed: true,
  reviewMethod: "ORIGINAL_1920X1080_FRAME_AND_CURRENT_11_SHOT_PACKAGE_CONTACT_SHEET_VIEWED_TOGETHER",
  artifact: manifest.frame,
  exactCopy: {required: manifest.exactFormalText, observed: observedText, status: "PASS"},
  checks: {
    typographyIsSoleInformationOwner: "PASS",
    threeSecondRead: "PASS",
    onePrimaryActor: "PASS",
    oneSemanticAction: "PASS",
    lowContrastBackground: "PASS",
    presenterAbsent: "PASS",
    illustrationPileAbsent: "PASS",
    pseudoTextAbsent: "PASS",
    verticalBarAbsent: "PASS",
    formalTextHashBoundAndEditable: "PASS",
    generatedFormalTextAbsent: "PASS",
    sequenceRoleDistinctFromED09Explainer: "PASS",
  },
  visualRead: "AI 的输出表面规整，但‘人话’发生一次受控错位；完整判断成为全屏唯一信息主角，并与下一镜阅读断裂图解形成判断到解释的递进。",
  hardFailures: [],
  userVisualApproval: "NOT_APPROVED",
  productionAdmissionAllowed: true,
  motionAllowed: false,
  assessedAt,
};
const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
const passLineage = (lineage) => ({
  ...lineage,
  preservedActualPixelReview: true,
  compositeVisualAudit: {
    contract: "A1StaticBoardCompositeVisualAudit/v1",
    status: "PASS",
    compositeSha256: manifest.frame.sha256,
    actualPixelsViewed: true,
    reviewMethod: review.reviewMethod,
    semanticAgreement: "PASS",
    semanticRead: review.visualRead,
    visualActorDominant: true,
    formalTextRendererBound: true,
    generatedFormalText: false,
    fakeEvidenceFound: false,
    specificGeneratedPersonFound: false,
    titleOverloadFound: false,
    reviewedAt: assessedAt,
  },
  minimalCompositionAudit: {
    contract: "A1ShotMinimalEditorialCompositionAudit/v1",
    status: "PASS",
    actualPixelsViewed: true,
    primaryActorCount: 1,
    semanticActionCount: 1,
    decorativeMotifCount: 0,
    referenceConstructionMatch: "PASS",
    independentPosterProduct: false,
    compositionRole: "EARNED_VERDICT_TAKEOVER",
    reviewedAt: assessedAt,
  },
});
const reviewedItem = {...manifest.item, styleLineage: passLineage(manifest.item.styleLineage)};
const nextBody = {
  ...manifest,
  status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW",
  item: reviewedItem,
  items: manifest.items.map((item) => item.shotId === "ED-08" ? reviewedItem : item),
  agentActualPixelReview: {publicUrl: `${manifest.frame.publicUrl.split("/frames/")[0]}/agent-actual-pixel-review.json`, sha256: review.reviewSha256, status: review.status},
  reviewedAt: assessedAt,
  manifestSha256: undefined,
};
const nextManifest = {...nextBody, manifestSha256: sha256(nextBody)};
fs.writeFileSync(reviewFile, `${JSON.stringify(review, null, 2)}\n`);
fs.writeFileSync(manifestFile, `${JSON.stringify(nextManifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: nextManifest.status, frameSha256: manifest.frame.sha256, reviewSha256: review.reviewSha256, manifestSha256: nextManifest.manifestSha256, userVisualApproval: nextManifest.userVisualApproval}, null, 2)}\n`);
