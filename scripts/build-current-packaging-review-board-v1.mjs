#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-packaging-review-v1");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const preferredAuthorityPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1/manifest.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  if (!String(url || "").startsWith("/generated/system-line/")) return null;
  const file = path.resolve(publicRoot, String(url).replace(/^\//u, ""));
  return file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) ? file : null;
};
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const workspace = readJson(workspacePath);
const production = workspace.production;
const runtime = production.shotIntelligence;
const bindings = new Map((production.creatorPaletteShotBindingManifest?.entries || []).map((item) => [item.shotId, item]));
const rawBySha = new Map((runtime.lookMasterRawReferences || []).map((item) => [item.artifact?.sha256, item]));
const coverageByShot = new Map((production.shotVisualCoveragePlan?.shotPlans || []).map((item) => [item.shotId, item]));
const sequence = production.canonicalCreatorPackagingSequence.decisions;
const preferredAuthority = fs.existsSync(preferredAuthorityPath) ? readJson(preferredAuthorityPath) : null;
const preferredAuthorityCurrent = preferredAuthority?.contract === "A1UserSelectedPackagingAuthority/v1"
  && preferredAuthority.status === "CURRENT_UNIQUE_USER_SELECTION"
  && preferredAuthority.workspaceSha256 === workspace.workspaceSha256
  && preferredAuthority.uniqueness?.pass === true;
if (preferredAuthority && preferredAuthority.contract === "A1UserSelectedPackagingAuthority/v1" && !preferredAuthorityCurrent) {
  throw new Error("user-selected-packaging-authority-stale-or-invalid:refuse-fallback-to-older-binding");
}
const preferredByShot = new Map((preferredAuthority?.shotSelections || []).map((item) => [item.shotId, item]));
const packageIds = preferredAuthorityCurrent
  ? preferredAuthority.preferredBoard.packageShotIds
  : sequence.filter((item) => item.packageDecision === "PACKAGE").sort((a, b) => a.order - b.order).map((item) => item.shotId);
const timeline = [...(production.shotVisualCoveragePlan?.shotPlans || [])].sort((a, b) => Number(a.order) - Number(b.order));

function placeholder(width, height, lines, accent = "#315cff") {
  const rows = lines.map((line, index) => `<text x="28" y="${62 + index * 34}" fill="${index === 0 ? "#f4f6f0" : "#aeb9b8"}" font-family="Arial, sans-serif" font-size="${index === 0 ? 25 : 16}" font-weight="${index === 0 ? 700 : 500}">${esc(line)}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#11171a"/><rect x="0" y="0" width="9" height="100%" fill="${accent}"/><path d="M28 ${height - 28}H${width - 28}" stroke="#2c3d42" stroke-width="2"/><path d="M28 28H${width - 28}" stroke="#2c3d42" stroke-width="2"/>${rows}</svg>`);
}

function packageSource(shotId) {
  if (preferredAuthorityCurrent && preferredByShot.has(shotId)) {
    const preferred = preferredByShot.get(shotId);
    const file = publicFile(preferred.publicUrl);
    if (!file || !fs.existsSync(file)) return {status: "BLOCKED", sourceKind: "USER_SELECTED_PREFERRED_FILE_MISSING", publicUrl: null, sha256: null, label: `${shotId} · USER SELECTED FILE MISSING`};
    const actualSha256 = sha256(fs.readFileSync(file));
    if (actualSha256 !== preferred.artifactSha256) return {status: "BLOCKED", sourceKind: "USER_SELECTED_PREFERRED_SHA_MISMATCH", publicUrl: preferred.publicUrl, sha256: actualSha256, label: `${shotId} · USER SELECTED SHA MISMATCH`};
    return {status: "PASS", sourceKind: "USER_SELECTED_PREFERRED_CANDIDATE", publicUrl: preferred.publicUrl, sha256: actualSha256, label: `${shotId} · USER SELECTED PREFERRED`};
  }
  const binding = bindings.get(shotId);
  if (!binding || binding.status !== "PASS") return {status: "BLOCKED", sourceKind: "PENDING_FORMAL_CANDIDATE", publicUrl: null, sha256: null, label: "ED-19 · PENDING FORMAL LOOK MASTER"};
  const raw = rawBySha.get(binding.actualShotCandidateSha256);
  const file = publicFile(raw?.artifact?.publicUrl);
  if (!raw?.artifact?.publicUrl || !file || !fs.existsSync(file)) return {status: "BLOCKED", sourceKind: "CURRENT_BINDING_FILE_MISSING", publicUrl: null, sha256: null, label: `${shotId} · CURRENT FILE MISSING`};
  return {status: "PASS", sourceKind: "CURRENT_CANONICAL_CANDIDATE", publicUrl: raw.artifact.publicUrl, sha256: binding.actualShotCandidateSha256, label: `${shotId} · CURRENT CANONICAL CANDIDATE`};
}

function timelineSource(shot) {
  if (packageIds.includes(shot.shotId)) return packageSource(shot.shotId);
  const candidates = [shot.preview, shot.sourcePreview, production.shotIntelligence.videoPackagingContexts?.items?.find((item) => item.shotId === shot.shotId)?.baseFrame].filter(Boolean);
  for (const candidate of candidates) {
    const file = publicFile(candidate.publicUrl);
    if (file && fs.existsSync(file)) return {status: "PASS", sourceKind: "CURRENT_NO_PACKAGE_SOURCE", publicUrl: candidate.publicUrl, sha256: candidate.sha256 || sha256(fs.readFileSync(file)), label: `${shot.shotId} · CURRENT NO_PACKAGE SOURCE`};
  }
  return {status: "REVIEW_REQUIRED", sourceKind: "CURRENT_SOURCE_MISSING", publicUrl: null, sha256: null, label: `${shot.shotId} · CURRENT SOURCE MISSING`};
}

async function tile(item, {width, imageHeight, labelHeight}) {
  const sourceFile = publicFile(item.source.publicUrl);
  const image = sourceFile && fs.existsSync(sourceFile)
    ? await sharp(sourceFile).resize(width, imageHeight, {fit: "cover"}).png().toBuffer()
    : await sharp(placeholder(width, imageHeight, item.source.status === "BLOCKED" ? [item.shotId, "ED-19", "FORMAL CANDIDATE PENDING"] : [item.shotId, "CURRENT SOURCE MISSING"], item.source.status === "BLOCKED" ? "#e0a83b" : "#d34e5b")).png().toBuffer();
  const accent = item.source.status === "PASS" ? (item.package ? "#315cff" : "#60737a") : "#e0a83b";
  const lines = [
    `${item.shotId} · ${item.package ? "PACKAGE" : "NO_PACKAGE"}`,
    item.source.label,
    item.route || "CURRENT ROUTE",
    item.text || "",
  ];
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#080d0f"/><rect width="8" height="100%" fill="${accent}"/>${lines.map((line, index) => `<text x="20" y="${19 + index * 18}" fill="${index === 0 ? "#f3f5ef" : index === 1 ? accent : "#9eabad"}" font-family="Arial, sans-serif" font-size="${index === 0 ? 13 : 10}" font-weight="${index === 0 ? 700 : 500}">${esc(String(line).slice(0, 68))}</text>`).join("")}</svg>`);
  return sharp({create: {width, height: imageHeight + labelHeight, channels: 4, background: "#080d0f"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
}

async function board(items, options) {
  const tiles = await Promise.all(items.map((item) => tile(item, options)));
  const rows = Math.ceil(tiles.length / options.columns);
  const tileHeight = options.imageHeight + options.labelHeight;
  const width = options.columns * options.width;
  const height = rows * tileHeight;
  const output = await sharp({create: {width, height, channels: 4, background: "#050809"}}).composite(tiles.map((input, index) => ({input, left: (index % options.columns) * options.width, top: Math.floor(index / options.columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  return {buffer: output, width, height, sha256: sha256(output)};
}

const packageItems = packageIds.map((shotId) => {
  const decision = sequence.find((item) => item.shotId === shotId);
  return {shotId, package: true, route: `${decision.presentationMode || decision.contentTreatment} · ${decision.frameOccupation || "PACKAGE"}`, text: decision.sourceText || "", source: packageSource(shotId)};
});
const timelineItems = timeline.map((shot) => ({shotId: shot.shotId, package: packageIds.includes(shot.shotId), route: shot.route || "CURRENT", text: shot.sourceText || "", source: timelineSource(shot)}));
fs.mkdirSync(artifactRoot, {recursive: true});
const packageBoard = await board(packageItems, {width: 480, imageHeight: 270, labelHeight: 82, columns: 3});
const timelineBoard = await board(timelineItems, {width: 360, imageHeight: 202, labelHeight: 82, columns: 4});
fs.writeFileSync(path.join(artifactRoot, "package-board-current-evidence.png"), packageBoard.buffer);
fs.writeFileSync(path.join(artifactRoot, "timeline-board-current-evidence.png"), timelineBoard.buffer);
const manifest = {
  contract: "A1CurrentPackagingReviewBoard/v1",
  status: "REVIEW_ONLY_NOT_PRODUCTION",
  generatedAt: new Date().toISOString(),
  workspaceSha256: workspace.workspaceSha256,
  packageBoard: {file: path.join(artifactRoot, "package-board-current-evidence.png"), ...packageBoard},
  timelineBoard: {file: path.join(artifactRoot, "timeline-board-current-evidence.png"), ...timelineBoard},
  packageItems,
  timelineItems,
  counts: {package: packageItems.length, timeline: timelineItems.length, blockedPackageCount: packageItems.filter((item) => item.source.status !== "PASS").length, currentNoPackageSourceCount: timelineItems.filter((item) => !item.package && item.source.status === "PASS").length},
  selectionAuthorityUsed: preferredAuthorityCurrent ? "A1UserSelectedPackagingAuthority/v1" : "A1CreatorPaletteShotBindingAuthority/v1",
  preferredAuthorityPath: preferredAuthorityCurrent ? path.relative(root, preferredAuthorityPath).split(path.sep).join("/") : null,
  oldBoardUsed: false,
  workspaceMutationPerformed: false,
  assemblyCreated: false,
  nextAction: "REVIEW_CURRENT_EVIDENCE_BOARD_THEN_FORMALIZE_ED19",
};
manifest.manifestSha256 = sha256(manifest);
fs.writeFileSync(path.join(artifactRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, manifestSha256: manifest.manifestSha256, counts: manifest.counts, packageBoard: manifest.packageBoard.file, timelineBoard: manifest.timelineBoard.file, workspaceSha256: manifest.workspaceSha256, oldBoardUsed: false, workspaceMutationPerformed: false}, null, 2));
