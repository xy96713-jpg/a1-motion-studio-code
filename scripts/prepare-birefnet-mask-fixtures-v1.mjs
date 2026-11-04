#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const fixtureDir = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures");
const manifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures.json");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const local = (value) => path.relative(root, value).split(path.sep).join("/");
const normalizeLocal = async (source, destination) => { fs.mkdirSync(path.dirname(destination), {recursive:true}); await sharp(source).rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:false}).jpeg({quality:90}).toFile(destination); };
const download = async (url, destination) => { const response = await fetch(url, {headers:{"user-agent":"A1-BiRefNet-Benchmark/1.0",accept:"image/avif,image/webp,image/jpeg,*/*"}}); if (!response.ok) throw new Error(`download-failed:${response.status}:${url}`); const bytes = Buffer.from(await response.arrayBuffer()); fs.mkdirSync(path.dirname(destination),{recursive:true}); await sharp(bytes).rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:false}).jpeg({quality:90}).toFile(destination); };
const groups = [
  ["mask-multi-person-01","https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1600&q=85"],
  ["mask-multi-person-02","https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1600&q=85"],
  ["mask-multi-person-03","https://images.unsplash.com/photo-1539635278303-d4002c07eae3?auto=format&fit=crop&w=1600&q=85"],
  ["mask-multi-person-04","https://images.unsplash.com/photo-1506869640319-fe1a24fd76dc?auto=format&fit=crop&w=1600&q=85"],
  ["mask-multi-person-05","https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1600&q=85"],
];
const localSources = {
  "portrait-hair": [
    "/Users/a1/Documents/Codex/2026-05-28/pro-users-a1-codex-skills-pro/assets/real-image-fixtures/pd-charles-darwin-front.jpg",
    "/Users/a1/Documents/Codex/2026-05-28/pro-users-a1-codex-skills-pro/assets/real-image-fixtures/pd-darwin-profile.jpg",
    "/Users/a1/Documents/Codex/2026-05-28/pro-users-a1-codex-skills-pro/assets/real-image-fixtures/cc0-face-portrait-unsplash.jpg",
    "/Users/a1/Documents/Codex/2026-05-28/pro-users-a1-codex-skills-pro/assets/real-image-fixtures/cc0-boubou-headshot.jpg",
    "/Users/a1/Documents/Codex/2026-05-28/pro-users-a1-codex-skills-pro/assets/real-image-fixtures/cc0-old-man-portrait-pixabay.jpg",
  ],
  "device-product": [
    "remotion-renderer/public/generated/system-line/article-material-cache-v1/apple-iphone-17e/hero.png",
    "remotion-renderer/public/generated/system-line/article-material-cache-v1/nasa-solar-eclipse-photography/hero.png",
    "remotion-renderer/public/generated/system-line/article-material-cache-v1/our-world-in-data-energy-mix/hero.png",
    "remotion-renderer/public/generated/system-line/article-material-cache-v1/paul-graham-life-is-short/hero.png",
    "remotion-renderer/public/editorial-documentary-reset-v1/source/selection-action.png",
  ],
  "paper-document": [
    "remotion-renderer/public/editorial-documentary-reset-v1/source/document-surface.png",
    "remotion-renderer/public/editorial-documentary-reset-v1/source/paragraph-assist.png",
    "remotion-renderer/public/editorial-documentary-reset-v1/source/presentation-mode.png",
    "remotion-renderer/public/editorial-documentary-reset-v1/source/workbench-overview.png",
    "/Users/a1/Documents/Codex/写作项目/outputs/product_audit_2026-07-14/02-signal-library.jpg",
  ],
  "transparent-reflective": [
    "/Users/a1/Documents/Codex/2026-06-01/superpowers-plugin-superpowers-openai-curated-build/outputs/qa-synthetic-recording/hannya/latest-poster.png",
    "/Users/a1/Documents/Codex/2026-06-01/superpowers-plugin-superpowers-openai-curated-build/work/sketchfab-downloads/sanxingdui-gold/extract/textures/SM_SXD_FACE_baseColor.jpeg",
    "/Users/a1/Documents/Codex/2026-06-01/superpowers-plugin-superpowers-openai-curated-build/outputs/qa-facefit-catalog/wearable-20260618/hannya/front.png",
    "remotion-renderer/public/visual-grammar-v4/illustrations/05-human-intervention-alt-a.png",
    "remotion-renderer/public/layered-anchor-v2/final/h03-paper-spiral.png",
  ],
  "mixed-hard-edge": [
    "remotion-renderer/public/visual-grammar-v4/illustrations/01-default-convergence.png",
    "remotion-renderer/public/visual-grammar-v4/illustrations/02-human-intervention.png",
    "remotion-renderer/public/visual-grammar-v4/illustrations/03-style-accumulation.png",
    "remotion-renderer/public/layered-anchor-v2/final/h03-paper-spiral.png",
    "remotion-renderer/public/layered-anchor-v2/final/h11-direction-cluster.png",
  ],
};
for (const file of Object.values(localSources).flat()) { const absolute = path.isAbsolute(file) ? file : path.join(root,file); if (!fs.existsSync(absolute)) throw new Error(`fixture-source-missing:${absolute}`); }
const samples = [];
for (const [category, files] of Object.entries(localSources)) for (const [index, source] of files.entries()) { const sourceAbsolute = path.isAbsolute(source) ? source : path.join(root,source); const output = path.join(fixtureDir,`${category}-${String(index+1).padStart(2,"0")}.jpg`); await normalizeLocal(sourceAbsolute,output); samples.push({id:`${category}-${String(index+1).padStart(2,"0")}`,category,sourcePath:local(output),sourceSha256:sha(output),rightsNote:source.startsWith("/") ? "本地已有素材，仅用于内部抠像压力测试；不作为对外授权声明。" : "本地项目素材，仅用于内部抠像压力测试；不作为对外授权声明。",standard:{edgeReviewStatus:"pending",reportPath:null},lite:{edgeReviewStatus:"pending",reportPath:null}}); }
for (const [index, [sampleId, url]] of groups.entries()) { const output = path.join(fixtureDir,`${sampleId}.jpg`); await download(url,output); samples.push({id:sampleId,category:"multi-person",sourcePath:local(output),sourceSha256:sha(output),sourceUrl:url,rightsNote:"Unsplash 原图用于内部压力测试和预览；对外发布前需单独确认许可与署名。",standard:{edgeReviewStatus:"pending",reportPath:null},lite:{edgeReviewStatus:"pending",reportPath:null}}); }
const manifest = {contract:"A1MaskBenchmarkFixtureManifest/v1",sampleCount:samples.length,createdAt:new Date().toISOString(),categories:["portrait-hair","multi-person","device-product","paper-document","transparent-reflective","mixed-hard-edge"],samples};
fs.mkdirSync(path.dirname(manifestPath),{recursive:true}); fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`); console.log(JSON.stringify({status:"MASK_FIXTURE_MANIFEST_READY",manifestPath:local(manifestPath),sampleCount:samples.length,categoryCounts:Object.fromEntries(manifest.categories.map((category)=>[category,samples.filter((sample)=>sample.category===category).length]))},null,2));
