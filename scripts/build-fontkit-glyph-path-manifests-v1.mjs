#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";
import {typographyEffectCatalog} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "work/fontkit-remotion-paths-glyph-adapter-v1");
const blindDir = path.join(outputDir, "blind-manifests");
const generatedDir = path.join(root, "remotion-renderer/src/generated");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
const profiles = {
  SANS_HEAVY: {fontId: "source-han-sans-heavy", fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf")},
  EVA_MINCHO: {fontId: "source-han-serif-heavy", fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf")},
  FUSION_PIXEL: {fontId: "fusion-pixel", fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf")},
};
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

const manifests = Object.fromEntries(Object.entries(profiles).map(([fontProfile, profile]) => [fontProfile, compileFontkitGlyphPathManifestV1({manifestId: `canary-${fontProfile.toLowerCase()}`, genre: "generic", exactCopy: fontProfile === "FUSION_PIXEL" ? "状态锁定" : "字效系统", fontProfile, fontId: profile.fontId, fontFile: profile.fontFile, semanticGroups: fontProfile === "FUSION_PIXEL" ? ["状态", "锁定"] : ["字效", "系统"]})]));
const effectIds = typographyEffectCatalog().map((effect) => effect.id);
const props = {contract: "A1GlyphPathAdapterCanaryProps/v1", width: 1920, height: 720, fps: 30, durationInFrames: 150, reviewPlate: true, manifests, effectIds, productionAdmission: false};
writeJson(path.join(generatedDir, "glyphPathAdapterCanaryProps.json"), props);
writeJson(path.join(generatedDir, "glyphPathAdapterTransparentCanaryProps.json"), {...props, reviewPlate: false});
writeJson(path.join(outputDir, "canary-props.json"), props);

const blind = fixtures.articles.map((article) => {
  const fontProfile = article.genre === "personal-opinion" ? "EVA_MINCHO" : "SANS_HEAVY";
  const profile = profiles[fontProfile];
  const exactCopy = article.shots[0];
  const manifest = compileFontkitGlyphPathManifestV1({manifestId: article.id, genre: article.genre, exactCopy, fontProfile, fontId: profile.fontId, fontFile: profile.fontFile, semanticGroups: [exactCopy]});
  writeJson(path.join(blindDir, `${article.id}.json`), manifest);
  return {id: article.id, genre: article.genre, status: "PASS", manifestSha256: manifest.manifestSha256, glyphCount: manifest.run.glyphCount, visibleGlyphCount: manifest.run.visibleGlyphCount, fontProfile};
});
const report = {contract: "A1FontkitGlyphPathBlindFixtureReport/v1", status: blind.length === 6 ? "PASS" : "BLOCK", fixtureCount: blind.length, fixtures: blind, canaryProps: "remotion-renderer/src/generated/glyphPathAdapterCanaryProps.json", transparentCanaryProps: "remotion-renderer/src/generated/glyphPathAdapterTransparentCanaryProps.json", productionAdmission: false};
writeJson(path.join(outputDir, "manifest-report.json"), report);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
