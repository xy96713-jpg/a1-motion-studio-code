#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const workspaceRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const workspacePath = path.join(workspaceRoot, "workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const audit = workspace.production?.authority?.visualTreatmentAudit || {};
const reviewRoot = path.join(workspaceRoot, "generated-visual-reviews");
const outputDir = path.join(workspaceRoot, "ed08-ed09-ed10-review-triptych-v1");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/ed08-ed09-ed10-review-triptych-v1");
fs.mkdirSync(outputDir, {recursive: true});
fs.mkdirSync(artifactDir, {recursive: true});

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  return entries.flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
};
const publicToFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//, ""));
const findComposite = (item) => {
  const prefix = `${item.candidateId}-composite.png`;
  const files = walk(reviewRoot).filter((file) => path.basename(file) === prefix);
  const exact = files.find((file) => sha256File(file) === item.compositePreviewSha256);
  if (exact) return {file: exact, selection: "audit-hash-match"};
  const latest = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (latest) return {file: latest, selection: "latest-candidate-fallback"};
  throw new Error(`review-composite-missing:${item.candidateId}`);
};
const findItem = (shotId, treatmentId) => (audit.items || []).find((item) => item.shotId === shotId && item.treatmentId === treatmentId);
// The review-only triptych must follow the currently adopted champion.  A
// hard-coded fallback to an older direction made the artifact silently show
// documentary-interface-evidence even after flat-editorial-evidence passed.
const championTreatmentId = audit.championTreatmentId || "flat-editorial-evidence";
const ed09 = findItem("ED-09", championTreatmentId);
const ed10 = findItem("ED-10", championTreatmentId);
if (!ed09 || !ed10) throw new Error(`treatment-audit-items-for-champion-missing:${championTreatmentId}`);
const ed09Composite = findComposite(ed09);
const ed10Composite = findComposite(ed10);
const ed08Asset = workspace.library?.assets?.find((asset) => asset.id === "source-presenter-opening-frame");
const ed08PublicUrl = ed08Asset?.preview?.publicUrl || ed08Asset?.publicUrl || ed08Asset?.assetUri;
const ed08File = ed08PublicUrl ? publicToFile(ed08PublicUrl) : null;
if (!ed08File || !fs.existsSync(ed08File)) throw new Error("ed08-presenter-frame-missing");

const panels = [
  {
    shotId: "ED-08",
    title: "ED-08 · presenter-clean",
    file: ed08File,
    sourceType: "verified-real-source",
    sourcePublicUrl: ed08PublicUrl,
    candidateId: null,
    typographyAllowed: false,
    note: "纯真人合同；不叠加字形母版",
  },
  {
    shotId: "ED-09",
    title: `ED-09 · ${championTreatmentId}`,
    file: ed09Composite.file,
    sourceType: "review-only-compositor",
    sourcePublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${path.relative(workspaceRoot, ed09Composite.file)}`,
    candidateId: ed09.candidateId,
    typographyAllowed: true,
    note: "AI 味母版仅作风格参考；可编辑文字影子仍为正式层",
    selection: ed09Composite.selection,
    verdict: ed09.verdict,
    score: ed09.score,
  },
  {
    shotId: "ED-10",
    title: `ED-10 · ${championTreatmentId}`,
    file: ed10Composite.file,
    sourceType: "review-only-compositor",
    sourcePublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${path.relative(workspaceRoot, ed10Composite.file)}`,
    candidateId: ed10.candidateId,
    typographyAllowed: true,
    note: "完成度很高的废稿母版仅作风格参考；可编辑文字影子仍为正式层",
    selection: ed10Composite.selection,
    verdict: ed10.verdict,
    score: ed10.score,
  },
];

const panelWidth = 640;
const panelHeight = 400;
const imageHeight = 360;
const svgLabel = (panel) => Buffer.from(`<svg width="${panelWidth}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151515"/><text x="18" y="26" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#f7f1e7">${panel.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`);
const renderedPanels = await Promise.all(panels.map(async (panel) => {
  const image = await sharp(panel.file).resize(panelWidth, imageHeight, {fit: "cover", position: "centre"}).png().toBuffer();
  return sharp({create: {width: panelWidth, height: panelHeight, channels: 4, background: "#151515"}})
    .composite([{input: image, top: 40, left: 0}, {input: svgLabel(panel), top: 0, left: 0}])
    .png()
    .toBuffer();
}));
const triptychPath = path.join(outputDir, "ed08-ed09-ed10-review-triptych.png");
await sharp({create: {width: panelWidth * panels.length, height: panelHeight, channels: 4, background: "#151515"}})
  .composite(renderedPanels.map((input, index) => ({input, left: index * panelWidth, top: 0})))
  .png()
  .toFile(triptychPath);

const report = {
  contract: "A1ReviewOnlyTriptych/v1",
  status: "REVIEW_ONLY_BLOCKED_BY_VISUAL_CRITIC",
  reviewOnly: true,
  productionBindingAllowed: false,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  treatmentAuditStatus: audit.status || "BLOCK",
  championTreatmentId,
  triptych: {
    publicUrl: `/generated/system-line/editorial-asset-workbench-v1/ed08-ed09-ed10-review-triptych-v1/ed08-ed09-ed10-review-triptych.png`,
    sha256: sha256File(triptychPath),
    width: panelWidth * panels.length,
    height: panelHeight,
  },
  panels: panels.map((panel) => ({
    shotId: panel.shotId,
    title: panel.title,
    sourceType: panel.sourceType,
    sourcePublicUrl: panel.sourcePublicUrl,
    candidateId: panel.candidateId,
    sourceSha256: sha256File(panel.file),
    typographyAllowed: panel.typographyAllowed,
    note: panel.note,
    selection: panel.selection || null,
    verdict: panel.verdict || null,
    score: panel.score ?? null,
  })),
  gateNote: `ED-08 保持 presenter-clean；ED-09/ED-10 使用当前冠军 ${championTreatmentId} 的 review-only compositor。视觉批评器不可用时不自动批准。`,
  createdAt: new Date().toISOString(),
};
const reportJson = JSON.stringify(report, null, 2);
fs.writeFileSync(path.join(outputDir, "report.json"), `${reportJson}\n`);
fs.writeFileSync(path.join(artifactDir, "report.json"), `${reportJson}\n`);
console.log(JSON.stringify({status: "PASS", triptych: report.triptych, panels: report.panels.map(({shotId, sourceType, candidateId, selection}) => ({shotId, sourceType, candidateId, selection}))}, null, 2));
