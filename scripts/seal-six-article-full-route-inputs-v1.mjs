#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const qualificationRoot = path.join(root, "qualification/six-article-full-route-v1");
const catalogPath = path.join(qualificationRoot, "source-catalog.json");
const sealedRoot = path.join(qualificationRoot, "sealed");
const manifestPath = path.join(qualificationRoot, "sealed-manifest.json");
const seal = process.argv.includes("--seal");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const srtTime = (ms) => {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3_600_000)).padStart(2, "0")}:${String(Math.floor((value % 3_600_000) / 60_000)).padStart(2, "0")}:${String(Math.floor((value % 60_000) / 1000)).padStart(2, "0")},${String(value % 1000).padStart(3, "0")}`;
};

function articleOutputs(article) {
  const articleText = article.paragraphs.join("\n\n");
  let cursorMs = 0;
  const cues = article.paragraphs.map((text, index) => {
    const durationMs = Math.max(7000, Math.min(24000, [...text].length * 235));
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;
    return `${index + 1}\n${srtTime(startMs)} --> ${srtTime(endMs)}\n${text}\n`;
  });
  return {articleText: `${articleText}\n`, srtText: `${cues.join("\n")}\n`, durationMs: cursorMs};
}

function verifyManifest(manifest) {
  const failures = [];
  if (manifest.contract !== "A1SixArticleFullRouteSealedManifest/v1" || manifest.status !== "SEALED") failures.push("MANIFEST_CONTRACT_INVALID");
  if (manifest.catalogSha256 !== fileSha256(catalogPath)) failures.push("CATALOG_SHA_DRIFT");
  if (manifest.articles?.length !== 6) failures.push("ARTICLE_COUNT_INVALID");
  const grouped = new Map();
  for (const item of manifest.articles || []) {
    grouped.set(item.genre, (grouped.get(item.genre) || 0) + 1);
    for (const binding of [item.article, item.timeline]) {
      const file = path.join(root, binding.path);
      if (!fs.existsSync(file)) failures.push(`${item.id}:${binding.kind}:MISSING`);
      else if (fileSha256(file) !== binding.sha256) failures.push(`${item.id}:${binding.kind}:SHA_DRIFT`);
    }
  }
  for (const genre of ["evidence-explainer", "product-tutorial", "personal-opinion"]) if (grouped.get(genre) !== 2) failures.push(`${genre}:PAIR_INVALID`);
  return {status: failures.length ? "FAIL" : "PASS", failures, grouped: Object.fromEntries(grouped)};
}

if (!seal) {
  if (!fs.existsSync(manifestPath)) throw new Error("six-article-sealed-manifest-missing:run-with---seal-once");
  const manifest = readJson(manifestPath);
  const verification = verifyManifest(manifest);
  console.log(JSON.stringify({contract: "A1SixArticleFullRouteSealedVerification/v1", ...verification, manifestSha256: fileSha256(manifestPath), sealedAt: manifest.sealedAt}, null, 2));
  if (verification.failures.length) process.exitCode = 1;
  process.exit();
}

if (fs.existsSync(manifestPath)) throw new Error("six-article-inputs-already-sealed");
const catalog = readJson(catalogPath);
assert.equal(catalog.contract, "A1SixArticleQualificationSourceCatalog/v1");
assert.equal(catalog.status, "READY_TO_SEAL");
assert.equal(catalog.articles.length, 6);
fs.mkdirSync(sealedRoot, {recursive: true});
const articles = [];
for (const article of catalog.articles) {
  assert.match(article.id, /^[a-z0-9][a-z0-9-]+$/u);
  assert.equal(article.paragraphs.length, 8, `${article.id}:paragraph-count`);
  const {articleText, srtText, durationMs} = articleOutputs(article);
  assert.ok([...articleText].length >= 450, `${article.id}:manuscript-too-short`);
  const articlePath = path.join(sealedRoot, `${article.id}.md`);
  const timelinePath = path.join(sealedRoot, `${article.id}.srt`);
  fs.writeFileSync(articlePath, articleText, {encoding: "utf8", flag: "wx"});
  fs.writeFileSync(timelinePath, srtText, {encoding: "utf8", flag: "wx"});
  articles.push({
    id: article.id,
    genre: article.genre,
    title: article.title,
    evidenceBoundary: article.evidenceBoundary,
    paragraphCount: article.paragraphs.length,
    characterCount: [...articleText.trim()].length,
    durationMs,
    article: {kind: "article", path: path.relative(root, articlePath), sha256: fileSha256(articlePath)},
    timeline: {kind: "timeline", path: path.relative(root, timelinePath), sha256: fileSha256(timelinePath)},
  });
}
const body = {
  contract: "A1SixArticleFullRouteSealedManifest/v1",
  status: "SEALED",
  immutable: true,
  articleCount: articles.length,
  requiredGenrePairs: {"evidence-explainer": 2, "product-tutorial": 2, "personal-opinion": 2},
  catalogPath: path.relative(root, catalogPath),
  catalogSha256: fileSha256(catalogPath),
  articles,
  acceptanceBoundary: {
    currentRouteRequired: "A1VisualDirectorProject/v1",
    planOnlyDoesNotQualify: true,
    templateCompilerDoesNotQualify: true,
    eachArticleRequires540pMedia: true,
    eachArticleRequiresDirectVisualReview: true,
    runtimeMustRemainFrozen: true,
  },
  sealedAt: new Date().toISOString(),
};
const manifest = {...body, manifestSha256: sha256(JSON.stringify(body))};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
const verification = verifyManifest(manifest);
assert.equal(verification.status, "PASS", verification.failures.join(","));
console.log(JSON.stringify({status: "PASS", manifestPath: path.relative(root, manifestPath), manifestSha256: fileSha256(manifestPath), articleCount: articles.length, genrePairs: verification.grouped, articles: articles.map((item) => ({id: item.id, characterCount: item.characterCount, durationMs: item.durationMs, articleSha256: item.article.sha256, timelineSha256: item.timeline.sha256}))}, null, 2));
