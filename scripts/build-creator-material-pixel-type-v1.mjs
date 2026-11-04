#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {buildCreatorMaterialPixelTypePlanV1} from "../apps/studio-next/src/lib/a1-creator-material-pixel-type-v1.ts";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererPublic = path.join(root, "remotion-renderer/public");
const studioPublic = path.join(root, "apps/studio-next/public");
const rendererPlan = path.join(root, "remotion-renderer/src/generated/creatorMaterialPixelTypeV1Props.json");
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const generatedRoot = "/Users/a1/.codex/generated_images/019fb0aa-64a7-72f0-9a6b-b80d46406867";
const copySources = new Map([
  ["creator-material-pixel-type-v1/plates/creator-desk-wide.png", path.join(generatedRoot, "exec-4a0d0909-ca70-47b4-87fb-1343c9b65c45.png")],
  ["creator-material-pixel-type-v1/plates/creator-desk-close.png", path.join(generatedRoot, "exec-9106b64b-27b1-45bd-b2e0-02d346f071b2.png")],
  ["creator-material-pixel-type-v1/fonts/Handjet-Variable.ttf", "/Users/a1/Library/Fonts/Handjet-Variable.ttf"],
  ["creator-material-pixel-type-v1/fonts/DepartureMono-Regular.otf", "/Users/a1/Library/Fonts/DepartureMono-Regular.otf"],
  ["creator-material-pixel-type-v1/fonts/fusion-pixel.ttf", "/Users/a1/Library/Fonts/fusion-pixel.ttf"],
  ["creator-material-pixel-type-v1/fonts/ChillPixels-Mono.otf", "/Users/a1/Library/Fonts/ChillPixels-Mono.otf"],
]);

function ensureFile(publicRoot, assetUri, expectedSha) {
  const target = path.join(publicRoot, assetUri);
  if (fs.existsSync(target) && shaFile(target) === expectedSha) return target;
  const source = copySources.get(assetUri);
  if (!source || !fs.existsSync(source)) throw new Error(`creator-material-source-missing:${assetUri}`);
  if (shaFile(source) !== expectedSha) throw new Error(`creator-material-source-hash:${assetUri}`);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
  if (shaFile(target) !== expectedSha) throw new Error(`creator-material-target-hash:${assetUri}`);
  return target;
}

const authorityBefore = shaFile(authorityPath);
const plan = buildCreatorMaterialPixelTypePlanV1();
const verifiedAssets = plan.assets.map((asset) => {
  const target = asset.route === "generated-environment" ? ensureFile(rendererPublic, asset.assetUri, asset.sha256) : path.join(rendererPublic, asset.assetUri);
  if (!fs.existsSync(target) || shaFile(target) !== asset.sha256) throw new Error(`creator-material-evidence-hash:${asset.id}`);
  return {id: asset.id, route: asset.route, path: path.relative(root, target), sha256: shaFile(target)};
});
const fontFiles = plan.fonts.map((font) => {
  const rendererTarget = ensureFile(rendererPublic, font.assetUri, font.sha256);
  const studioTarget = ensureFile(studioPublic, font.assetUri, font.sha256);
  return {role: font.role, family: font.family, assetUri: font.assetUri, sha256: shaFile(rendererTarget), studioSha256: shaFile(studioTarget)};
});

writeJson(rendererPlan, plan);
const authorityAfter = shaFile(authorityPath);
const report = {
  contract: "A1CreatorMaterialPixelTypeBuildReport/v1",
  phaseId,
  status: "PASS",
  plan,
  verifiedAssets,
  fontFiles,
  forbiddenPrimitives: [...new Set(plan.shots.flatMap((shot) => shot.forbiddenPrimitives))],
  currentAuthority: {path: path.relative(root, authorityPath), sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
  gates: {...plan.gates, structuralBuild: "PASS", visualProof: "PENDING"},
};
writeJson(path.join(artifactDir, "plan.json"), report);
writeJson(path.join(publicDir, "plan.json"), report);
writeJson(path.join(artifactDir, "build-report.json"), report);
writeJson(path.join(publicDir, "build-report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, assets: verifiedAssets.length, fonts: fontFiles.length, authorityUnchanged: report.currentAuthority.unchanged, publicPlan: `/generated/system-line/${phaseId}/plan.json`}, null, 2));
