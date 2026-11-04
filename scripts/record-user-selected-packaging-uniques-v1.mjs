#!/usr/bin/env node

/**
 * Record the user's preferred packaging evidence as one deterministic,
 * recoverable selection authority. This does not promote production state and
 * does not delete or move any existing artifact.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1");
const sourceRoot = path.join(artifactRoot, "source-attachments");
const minimalManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/minimal-editorial-static-board-repair-v1/manifest.json");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const publicAuthorityRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const boardAttachment = argValue("--board", "/var/folders/vc/t_3z1r_s2vb2_88v8st66x8c0000gn/T/codex-clipboard-f248d43d-e94b-4d77-a2a3-f53b29beed34.png");
const ed16Attachment = argValue("--ed16", "/var/folders/vc/t_3z1r_s2vb2_88v8st66x8c0000gn/T/codex-clipboard-a2975d7a-3566-4541-ae47-ff1319164bec.png");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const publicFile = (url) => {
  if (!String(url || "").startsWith("/generated/system-line/")) return null;
  const file = path.resolve(publicRoot, String(url).slice(1));
  return file.startsWith(`${path.resolve(publicRoot)}${path.sep}`) ? file : null;
};

function assertFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label}-missing:${file}`);
  if (!fs.statSync(file).isFile()) throw new Error(`${label}-not-file:${file}`);
}

async function pixelFingerprint(file) {
  const image = sharp(file);
  const metadata = await image.metadata();
  const pixels = await image.removeAlpha().raw().toBuffer();
  return {width: metadata.width, height: metadata.height, pixelSha256: sha256(pixels), bytes: fs.statSync(file).size};
}

async function assertPixelMatch(sourceFile, targetFile, label) {
  const source = await pixelFingerprint(sourceFile);
  const target = await pixelFingerprint(targetFile);
  if (source.width !== target.width || source.height !== target.height || source.pixelSha256 !== target.pixelSha256) {
    throw new Error(`${label}-pixel-mismatch:${JSON.stringify({source, target})}`);
  }
  return {source, target, exactPixels: true};
}

assertFile(boardAttachment, "board-attachment");
assertFile(ed16Attachment, "ed16-attachment");
assertFile(minimalManifestPath, "minimal-manifest");
assertFile(workspacePath, "workspace");

const minimalManifest = readJson(minimalManifestPath);
const workspace = readJson(workspacePath);
const boardUrl = "/generated/system-line/editorial-asset-workbench-v1/minimal-editorial-static-board-repair-v1/whole-film-package-board.png";
const boardArtifact = publicFile(boardUrl);
assertFile(boardArtifact, "preferred-board-artifact");
const ed16Url = "/generated/system-line/editorial-asset-workbench-v1/look-masters/ED-16/4f18584d76cf-3efc20b967af-c02.png";
const ed16Artifact = publicFile(ed16Url);
assertFile(ed16Artifact, "preferred-ed16-artifact");

const boardMatch = await assertPixelMatch(boardAttachment, boardArtifact, "preferred-board");
const ed16Match = await assertPixelMatch(ed16Attachment, ed16Artifact, "preferred-ed16");
const boardAttachmentSha256 = sha256File(boardAttachment);
const ed16AttachmentSha256 = sha256File(ed16Attachment);
const boardArtifactSha256 = sha256File(boardArtifact);
const ed16ArtifactSha256 = sha256File(ed16Artifact);

const production = workspace.production || {};
const rawBySha = new Map((production.shotIntelligence?.lookMasterRawReferences || []).map((item) => [item.artifact?.sha256, item]));
const currentBindings = new Map((production.creatorPaletteShotBindingManifest?.entries || []).map((item) => [item.shotId, item]));
const preferredItems = minimalManifest.items || [];
if (preferredItems.length !== 11) throw new Error(`preferred-board-shot-count-unexpected:${preferredItems.length}`);
const shotSelections = preferredItems.map((item) => {
  const selectedUrl = item.shotId === "ED-16" ? ed16Url : item.artifactPublicUrl;
  const selectedFile = publicFile(selectedUrl);
  assertFile(selectedFile, `selected-${item.shotId}`);
  const selectedSha256 = sha256File(selectedFile);
  const binding = currentBindings.get(item.shotId);
  const raw = binding ? rawBySha.get(binding.actualShotCandidateSha256) : null;
  return {
    shotId: item.shotId,
    current: true,
    selectionStatus: "USER_SELECTED_PREFERRED",
    selectionRole: item.shotId === "ED-16" ? "PREFERRED_SHOT_OVERRIDE" : "PREFERRED_BOARD_MEMBER",
    candidateId: item.shotId === "ED-16" ? "look-master-ed-16-4f18584d76cf-3efc20b967af-c02" : item.candidateId,
    publicUrl: selectedUrl,
    artifactSha256: selectedSha256,
    sourceBoardManifestSha256: minimalManifest.sourceBoardSha256,
    previousCurrentBinding: binding ? {
      status: binding.status,
      artifactSha256: binding.actualShotCandidateSha256,
      publicUrl: raw?.artifact?.publicUrl || null,
      sameAsSelected: binding.actualShotCandidateSha256 === selectedSha256,
    } : null,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
  };
});

const selectedByShot = new Map(shotSelections.map((item) => [item.shotId, item]));
const duplicateShotIds = [...selectedByShot.entries()].filter(([, item]) => !item.current).map(([shotId]) => shotId);
if (duplicateShotIds.length) throw new Error(`non-current-selected-shot:${duplicateShotIds.join(",")}`);
const supersededCurrentBindings = [...currentBindings.entries()]
  .filter(([shotId, binding]) => selectedByShot.has(shotId) && binding.actualShotCandidateSha256 !== selectedByShot.get(shotId).artifactSha256)
  .map(([shotId, binding]) => {
    const raw = rawBySha.get(binding.actualShotCandidateSha256);
    return {
      shotId,
      status: "QUARANTINE_RECOMMENDED",
      artifactSha256: binding.actualShotCandidateSha256,
      publicUrl: raw?.artifact?.publicUrl || null,
      reason: "superseded-by-user-selected-unique-pointer",
      moved: false,
      recoverable: true,
    };
  });

const sourceAttachments = [
  {role: "USER_PREFERRED_WHOLE_FILM_BOARD", path: rel(boardAttachment), sha256: boardAttachmentSha256, width: boardMatch.source.width, height: boardMatch.source.height, pixelMatch: boardMatch.exactPixels, matchedArtifactSha256: boardArtifactSha256},
  {role: "USER_PREFERRED_ED16", path: rel(ed16Attachment), sha256: ed16AttachmentSha256, width: ed16Match.source.width, height: ed16Match.source.height, pixelMatch: ed16Match.exactPixels, matchedArtifactSha256: ed16ArtifactSha256},
];
fs.mkdirSync(sourceRoot, {recursive: true});
fs.copyFileSync(boardAttachment, path.join(sourceRoot, "user-preferred-board.png"));
fs.copyFileSync(ed16Attachment, path.join(sourceRoot, "user-preferred-ed16.png"));

const manifest = {
  contract: "A1UserSelectedPackagingAuthority/v1",
  status: "CURRENT_UNIQUE_USER_SELECTION",
  generatedAt: new Date().toISOString(),
  authorityScope: "USER_PREFERENCE_REVIEW",
  selectionStatus: "USER_SELECTED_PREFERRED",
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
  workspaceSha256: workspace.workspaceSha256,
  sourceAttachments,
  preferredBoard: {
    publicUrl: boardUrl,
    artifactSha256: boardArtifactSha256,
    packageShotIds: minimalManifest.packageShotIds,
    demotedBreathingBeatShotIds: minimalManifest.demotedBreathingBeatShotIds,
    boardSourceManifest: rel(minimalManifestPath),
    boardSourceManifestSha256: sha256File(minimalManifestPath),
    exactPixelsMatched: boardMatch.exactPixels,
  },
  shotSelections,
  uniqueness: {
    rule: "one-shot-one-current-user-selected-pointer",
    selectedShotCount: shotSelections.length,
    uniqueShotCount: selectedByShot.size,
    duplicateShotIds,
    pass: duplicateShotIds.length === 0 && selectedByShot.size === shotSelections.length,
  },
  quarantinePlan: {
    contract: "A1RecoverablePackagingQuarantinePlan/v1",
    status: "PLAN_ONLY_NO_FILES_MOVED",
    deleted: false,
    recoverable: true,
    entries: supersededCurrentBindings,
    instruction: "Resolvers must ignore these superseded pointers. Move only through a separately authorized quarantine command.",
  },
  resolverPolicy: {
    preferredManifestPath: rel(path.join(publicAuthorityRoot, "manifest.json")),
    boardResolversMustUseManifest: true,
    historyArtifactsNeverResolveAsCurrent: true,
    timestampCannotChooseWinner: true,
    userPreferenceDoesNotImplyProductionAdmission: true,
  },
  workspaceMutationPerformed: false,
  filesMoved: false,
  deleted: false,
};
manifest.manifestSha256 = sha256(Buffer.from(JSON.stringify(manifest)));
const text = `${JSON.stringify(manifest, null, 2)}\n`;
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicAuthorityRoot, {recursive: true});
fs.writeFileSync(path.join(artifactRoot, "manifest.json"), text);
fs.writeFileSync(path.join(publicAuthorityRoot, "manifest.json"), text);
fs.writeFileSync(path.join(artifactRoot, "quarantine-plan.json"), `${JSON.stringify(manifest.quarantinePlan, null, 2)}\n`);
fs.writeFileSync(path.join(publicAuthorityRoot, "quarantine-plan.json"), `${JSON.stringify(manifest.quarantinePlan, null, 2)}\n`);
console.log(JSON.stringify({
  status: manifest.status,
  manifestSha256: manifest.manifestSha256,
  preferredBoard: {publicUrl: boardUrl, sha256: boardArtifactSha256, packageShotCount: manifest.preferredBoard.packageShotIds.length},
  preferredEd16: {publicUrl: ed16Url, sha256: ed16ArtifactSha256, exactPixelsMatched: ed16Match.exactPixels},
  uniqueShotCount: manifest.uniqueness.uniqueShotCount,
  supersededCurrentBindingCount: supersededCurrentBindings.length,
  workspaceMutationPerformed: false,
  filesMoved: false,
  artifactManifest: rel(path.join(artifactRoot, "manifest.json")),
  publicManifest: rel(path.join(publicAuthorityRoot, "manifest.json")),
}, null, 2));
