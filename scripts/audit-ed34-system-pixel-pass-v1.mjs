#!/usr/bin/env node

import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const migrationRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json";
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const targetSha = "5313ed6ae8ea877ea8b138375f422b4f36f49685df0889b17b6afa86a0ea226a";
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.resolve(publicRoot, String(url).replace(/^\//u, ""));

function readOcr(file) {
  const parsed = JSON.parse(execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1));
  return {status: parsed.status || "FAILED", text: parsed.text || "", observationCount: parsed.observationCount || 0, segments: parsed.segments || []};
}

async function styleMetrics(file) {
  const image = await sharp(file).ensureAlpha().resize(320, 180, {fit: "fill"}).raw().toBuffer({resolveWithObject: true});
  let warm = 0;
  let cobalt = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    if (red > 135 && green > 105 && blue < Math.min(150, red * 0.78) && red - blue > 35) warm += 1;
    if (blue > 135 && blue > red * 1.2 && blue > green * 1.08) cobalt += 1;
  }
  const total = image.info.width * image.info.height;
  return {warmDominantFraction: Number((warm / total).toFixed(4)), cobaltFraction: Number((cobalt / total).toFixed(4))};
}

function manifestSha(value) {
  const body = {...value};
  delete body.manifestSha256;
  return sha256(body);
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed34-system-pixel-audit-requires-frozen-idle-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed34-system-pixel-audit-assembly-forbidden");
  const raw = current.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-34" && item.artifact?.sha256 === targetSha && item.current !== false);
  if (!raw?.artifact?.publicUrl) throw new Error("ed34-system-pixel-audit-target-missing");
  const file = publicFile(raw.artifact.publicUrl);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== targetSha) throw new Error("ed34-system-pixel-audit-sha-mismatch");
  const metadata = await sharp(file).metadata();
  const ocr = readOcr(file);
  const metrics = await styleMetrics(file);
  const semantic = raw.semanticPixelAudit || {};
  const checks = {
    decodedPng: metadata.format === "png" && metadata.width === 1672 && metadata.height === 941,
    exactTitle: ocr.status === "PASS" && ocr.text.includes("往哪个方向走") && ocr.text.includes("自己的风格"),
    semanticAuditPass: semantic.status === "PASS" && semantic.recommendationEligible === true && (semantic.findings || []).length === 0,
    aestheticPass: raw.actualPixelAssessment?.localEvidence?.aestheticGate?.status === "PASS" && raw.actualPixelAssessment.localEvidence.aestheticGate?.basis?.measuredWarmField === false,
    coldNeutralField: metrics.warmDominantFraction < 0.08 && metrics.cobaltFraction > 0.01,
    noDebugOrFiller: semantic.checks?.noDebugOrSourceStrings === true && semantic.checks?.noUnrelatedFiller === true,
    threeSecondSemantic: semantic.checks?.viewerTakeawayMatch === true && semantic.checks?.threeSecondReadable === true,
  };
  const status = Object.values(checks).every(Boolean) ? "SYSTEM_PIXEL_PASS" : "SYSTEM_PIXEL_REVIEW_REQUIRED";
  if (status !== "SYSTEM_PIXEL_PASS") throw new Error(`ed34-system-pixel-audit-failed:${JSON.stringify(checks)}`);
  const audit = {
    contract: "A1ED34SystemPixelStyleAudit/v1",
    status,
    shotId: "ED-34",
    artifactSha256: targetSha,
    artifactBytesUnchanged: true,
    ocr,
    styleMetrics: metrics,
    checks,
    reviewedAt: now,
  };
  raw.systemPixelAudit = {...audit, auditSha256: sha256(audit)};
  raw.reviewStatus = "SYSTEM_PIXEL_PASS";
  raw.recommendationEligible = true;
  raw.selectionEligible = true;
  raw.assemblyEligible = true;
  const migrationPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", migrationRelativePath);
  const maturityPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", maturityRelativePath);
  const migration = readJson(migrationPath);
  const entry = migration.entries.find((item) => item.shotId === "ED-34");
  entry.actualModeEvidence = "SYSTEM_PIXEL_PASS";
  entry.status = "SYSTEM_PIXEL_PASS";
  entry.nextAction = "HOLD_FOR_USER_APPROVAL";
  entry.generationAllowed = false;
  entry.userVisualApproval = "NOT_APPROVED";
  migration.legacyDirectionOnlyShotIds = (migration.legacyDirectionOnlyShotIds || []).filter((shotId) => shotId !== "ED-34");
  migration.legacyDirectionOnlyCount = migration.legacyDirectionOnlyShotIds.length;
  migration.systemPixelPassShotIds = ["ED-34"];
  migration.systemPixelPassCount = 1;
  migration.generatedAt = now;
  migration.manifestSha256 = manifestSha(migration);
  const maturity = readJson(maturityPath);
  maturity.actualModeEvidence = {
    ...maturity.actualModeEvidence,
    systemPixelPassCount: 1,
    systemPixelPassShotIds: ["ED-34"],
    legacyDirectionOnlyCount: migration.legacyDirectionOnlyCount,
    legacyDirectionOnlyShotIds: migration.legacyDirectionOnlyShotIds,
  };
  maturity.legacyDirectionOnlyCount = migration.legacyDirectionOnlyCount;
  maturity.generatedAt = now;
  maturity.phases = {
    ...maturity.phases,
    PHASE_0: {
      ...maturity.phases.PHASE_0,
      results: (maturity.phases.PHASE_0.results || []).map((item) => item.shotId === "ED-34" ? {...item, classification: "SYSTEM_PIXEL_PASS", actualModeEvidence: "SYSTEM_PIXEL_PASS", actualPixelAuditSha256: raw.actualPixelAssessmentSha256 || null, semanticAuditSha256: raw.semanticPixelAuditSha256 || null, nextAction: "HOLD_FOR_USER_APPROVAL"} : item),
      systemPixelPassCount: 1,
      systemPixelPassShotIds: ["ED-34"],
    },
  };
  const maturityHash = {...maturity};
  delete maturityHash.maturityRunSha256;
  maturity.maturityRunSha256 = sha256(maturityHash);
  const next = structuredClone(current);
  next.production.universalReferencePackagingGate = {
    ...next.production.universalReferencePackagingGate,
    legacyDirectionOnlyShotIds: migration.legacyDirectionOnlyShotIds,
    systemPixelPassShotIds: ["ED-34"],
    systemPixelPassCount: 1,
    migrationManifestSha256: migration.manifestSha256,
  };
  next.production.goldenFilmVisualSystemMaturity = {
    ...next.production.goldenFilmVisualSystemMaturity,
    maturityRunSha256: maturity.maturityRunSha256,
    actualModeEvidence: structuredClone(maturity.actualModeEvidence),
    legacyDirectionOnlyCount: migration.legacyDirectionOnlyCount,
    legacyDirectionOnlyShotIds: migration.legacyDirectionOnlyShotIds,
  };
  const event = createProductionEvent({workspace: current, action: "audit-ed34-system-pixel-pass", targetId: targetSha, payload: {contract: "A1ED34SystemPixelStyleAudit/v1", status, generated: false, userApproved: false, noAssembly: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, files: {[migrationRelativePath]: migration, [maturityRelativePath]: maturity, "golden-film-visual-system-maturity-v1/ed34-system-pixel-audit.json": audit}});
  return {status, shotId: "ED-34", artifactSha256: targetSha, auditSha256: raw.systemPixelAudit.auditSha256, migrationSha256: migration.manifestSha256, maturityRunSha256: maturity.maturityRunSha256, workspaceSha256: committed.workspaceSha256, checks};
});

console.log(JSON.stringify(result, null, 2));
