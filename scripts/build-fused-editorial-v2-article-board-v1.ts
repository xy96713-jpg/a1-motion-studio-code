#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {A1LayeredShotDesignV2Schema} from "../apps/studio-next/src/lib/a1-layered-shot-design-v2.ts";
import {A1DesignBoardManifestV1Schema} from "../apps/studio-next/src/lib/a1-design-board-manifest-v1.ts";
import {understandArticle, type A1ArticleSentenceFunction} from "../apps/studio-next/src/lib/a1-article-understanding.ts";
import {getCodexDirectorCapability, runCodexArticleDirector} from "../apps/studio-next/src/lib/a1-codex-article-director.ts";
import {buildFourTreatmentImageCandidates} from "../lib/a1-four-treatment-image-factory.js";

const root = process.cwd();
const candidatePhase = "fused-editorial-v2-anchor-candidate-v1";
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const sharp = rendererRequire("sharp") as typeof import("sharp");
const {bundle} = rendererRequire("@remotion/bundler") as typeof import("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer") as typeof import("@remotion/renderer");

type ArticleEntry = {id: string; kind: string; title: string; url: string; inputPath?: string; inputText?: string};
const registry: ArticleEntry[] = [
  {id: "nasa-solar-eclipse-photography", kind: "教程", title: "Five Tips from NASA for Photographing a Total Solar Eclipse", url: "https://www.nasa.gov/science-research/five-tips-from-nasa-for-photographing-a-total-solar-eclipse/"},
  {id: "our-world-in-data-energy-mix", kind: "数据", title: "Energy Mix", url: "https://ourworldindata.org/energy-mix"},
  {id: "apple-iphone-17e", kind: "产品", title: "Apple introduces iPhone 17e", url: "https://www.apple.com/ng/newsroom/2026/03/apple-introduces-iphone-17e/"},
  {id: "paul-graham-life-is-short", kind: "个人叙事", title: "Life is Short", url: "https://paulgraham.com/vb.html"},
];
const args = process.argv.slice(2);
const requested = args.find((arg) => arg.startsWith("--article-id="))?.slice("--article-id=".length) || args.find((arg) => !arg.startsWith("--"));
const all = args.includes("--all");
const directorMode = (args.find((arg) => arg.startsWith("--director="))?.slice("--director=".length) || process.env.A1_FUSED_EDITORIAL_V2_DIRECTOR_MODE || "auto") as "auto" | "codex" | "deterministic";
if (!["auto", "codex", "deterministic"].includes(directorMode)) throw new Error(`invalid-director-mode:${directorMode}`);
if (directorMode !== "deterministic" && !process.env.A1_CODEX_DIRECTOR_TIMEOUT_MS) process.env.A1_CODEX_DIRECTOR_TIMEOUT_MS = "120000";
const requestedUrl = args.find((arg) => arg.startsWith("--url="))?.slice("--url=".length) || (requested && /^https?:\/\//iu.test(requested) ? requested : "");
const requestedInput = args.find((arg) => arg.startsWith("--input="))?.slice("--input=".length) || "";
const requestedTitle = args.find((arg) => arg.startsWith("--title="))?.slice("--title=".length) || "";
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/giu, "-").replace(/^-+|-+$/gu, "").slice(0, 64) || "article";
const customEntry: ArticleEntry | null = requestedInput
  ? (() => {
    const absolute = path.resolve(root, requestedInput);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`article-input-not-found:${absolute}`);
    const text = fs.readFileSync(absolute, "utf8");
    if (text.trim().length < 240) throw new Error(`article-input-too-short:${text.trim().length}`);
    const digest = crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
    return {id: `custom-${slugify(path.basename(absolute, path.extname(absolute)))}-${digest}`, kind: "自定义文章", title: requestedTitle || path.basename(absolute, path.extname(absolute)), url: `file://${absolute}`, inputPath: absolute, inputText: text};
  })()
  : requestedUrl
    ? (() => {
      let parsed: URL;
      try { parsed = new URL(requestedUrl); } catch { throw new Error(`article-url-invalid:${requestedUrl}`); }
      const digest = crypto.createHash("sha256").update(parsed.toString()).digest("hex").slice(0, 12);
      return {id: `custom-${slugify(parsed.hostname)}-${digest}`, kind: "自定义文章", title: requestedTitle || parsed.hostname, url: parsed.toString()};
    })()
    : null;
const selected = all ? registry : customEntry ? [customEntry] : registry.filter((item) => item.id === requested || item.url === requested);
if (!selected.length) throw new Error(`unknown-article-id:${requested || "missing"}`);

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); };
const intakeStatusFile = process.env.A1_FUSED_INTAKE_STATUS_FILE || "";
const updateIntakeStatus = (value: Record<string, unknown>) => {
  if (!intakeStatusFile) return;
  let previous: Record<string, unknown> = {};
  try { previous = readJson(intakeStatusFile); } catch { /* first status write */ }
  writeJson(intakeStatusFile, {contract: "A1FusedEditorialV2IntakeStatus/v1", ...previous, updatedAt: new Date().toISOString(), ...value});
};
const shaBuffer = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const shaFile = (file: string) => shaBuffer(fs.readFileSync(file));
const shaValue = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");

function guard() {
  const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
  if (branch !== "codex/system-maturity-line-20260722") throw new Error(`wrong-branch:${branch}`);
  const current = readJson(currentPhasePath);
  if (current?.contract !== "A1SystemLineCurrentPhase/v1" || current.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-authority:${current?.phaseId || "missing"}`);
}

function htmlDecode(value: string) {
  return value.replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)));
}

function extractMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "iu")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "iu"));
  return match ? htmlDecode(match[1]) : "";
}

function htmlToText(html: string) {
  const scoped = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1] || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu)?.[1] || html;
  const withoutChrome = scoped.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ").replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, " ");
  const blocks = [...withoutChrome.matchAll(/<(?:p|h1|h2|h3|h4|li)\b[^>]*>([\s\S]*?)<\/(?:p|h1|h2|h3|h4|li)>/giu)]
    .map((match) => match[1].replace(/<[^>]+>/gu, " ").replace(/https?:\/\S+/giu, " ").replace(/\s+/gu, " ").trim())
    .filter((block) => block.length > 1);
  const filteredBlocks = blocks.filter((block) => {
    if (/^(?:Endnotes?|References?|Notes?\s*\[|Translation links?|Korean Translation|Japanese Translation|Chinese Translation|Press Contact|Media Helpline|Media in this article|About Apple|Home|Essays|H&P|Books|Y Combinator|FAQ|RSS|Bio|Twitter|Mastodon)\b/iu.test(block)) return false;
    if (/media\.[a-z0-9.-]+@[a-z0-9.-]+/iu.test(block)) return false;
    if (/(?:Annex (?:II|III)|Technology-specific cost|Metrics & Methodology)/iu.test(block) && (block.match(/\b[A-Z][a-z]+,\s*[A-Z]\./gu) || []).length >= 3) return false;
    if ((block.match(/\b[A-Z][a-z]+,\s*[A-Z]\./gu) || []).length >= 6) return false;
    return true;
  });
  const raw = filteredBlocks.length >= 4 ? filteredBlocks.join(" ") : withoutChrome.replace(/<[^>]+>/gu, " ").replace(/https?:\/\S+/giu, " ").replace(/\s+/gu, " ").trim();
  return htmlDecode(raw
    .replace(/\b(?:Cite this work|Reuse this work freely|More from Apple Newsroom|About Apple|Press Contact|Media Helpline|Media in this article)\b[\s\S]*$/iu, "")
    .replace(/\b(?:Korean Translation|Japanese Translation|Chinese Translation)(?:\s+\b(?:Korean Translation|Japanese Translation|Chinese Translation))*\s*$/iu, "")
    .trim());
}

function extractImageUrl(html: string, pageUrl: string) {
  const og = extractMeta(html, "og:image");
  const firstImage = html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/iu)?.[1] || "";
  const value = og || firstImage;
  if (!value) return null;
  try { return new URL(value, pageUrl).toString(); } catch { return null; }
}

function extractImageUrls(html: string, pageUrl: string) {
  const values = [extractMeta(html, "og:image"), ...[...html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/giu)].map((match) => match[1]), ...[...html.matchAll(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/giu)].flatMap((match) => match[1].split(",").map((item) => item.trim().split(/\s+/u)[0]))];
  const output: string[] = [];
  for (const value of values) {
    if (!value) continue;
    try { const absolute = new URL(value, pageUrl).toString(); if (/^https?:/iu.test(absolute) && !output.includes(absolute)) output.push(absolute); } catch { /* ignore malformed candidate */ }
    if (output.length >= 6) break;
  }
  return output;
}

async function fetchArticle(entry: ArticleEntry, cacheFile: string) {
  let html = "";
  let cached = false;
  let capturedAt = new Date().toISOString();
  if (entry.inputText) {
    const title = entry.title;
    const text = entry.inputText.replace(/\r/g, "\n").trim();
    html = `<article><h1>${htmlDecode(title)}</h1><p>${htmlDecode(text).replace(/\n+/gu, "</p><p>")}</p></article>`;
    if (!fs.existsSync(cacheFile) || fs.statSync(cacheFile).size < 1024) {
      fs.mkdirSync(path.dirname(cacheFile), {recursive: true});
      fs.writeFileSync(cacheFile, html);
    } else {
      html = fs.readFileSync(cacheFile, "utf8");
      cached = true;
      capturedAt = fs.statSync(cacheFile).mtime.toISOString();
    }
    return {title, text, imageUrl: null, imageCandidates: [] as string[], htmlSha256: shaBuffer(Buffer.from(html)), capturedAt, cached, html};
  }
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
    html = fs.readFileSync(cacheFile, "utf8");
    cached = true;
    capturedAt = fs.statSync(cacheFile).mtime.toISOString();
  } else {
    const response = await fetch(entry.url, {headers: {"user-agent": "A1-Article-Packaging/1.0", accept: "text/html,application/xhtml+xml"}});
    if (!response.ok) throw new Error(`article-fetch-failed:${entry.id}:${response.status}`);
    html = await response.text();
    fs.mkdirSync(path.dirname(cacheFile), {recursive: true});
    fs.writeFileSync(cacheFile, html);
  }
  const title = extractMeta(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/\s+/gu, " ").trim() || entry.title;
  let text = htmlToText(html);
  if (/apple\.com/iu.test(entry.url)) text = text.replace(/\s+Apple\s*$/u, "").replace(/\s+More information\s+—[\s\S]*$/iu, "").trim();
  if (text.length < 240) throw new Error(`article-text-too-short:${entry.id}:${text.length}`);
  const imageCandidates = extractImageUrls(html, entry.url);
  return {title, text, imageUrl: imageCandidates[0] || extractImageUrl(html, entry.url), imageCandidates, htmlSha256: shaBuffer(Buffer.from(html)), capturedAt, cached, html};
}

function splitHeadline(value: string) {
  const cleaned = String(value || "文章段落").replace(/[\n\r]+/gu, " ").trim();
  if (/[\u3400-\u9fff]/u.test(cleaned)) {
    const chars = Array.from(cleaned.replace(/[。，！？；：、“”‘’（）()《》【】…—,:;.!?]/gu, ""));
    if (chars.length <= 10) return [chars.join("")];
    const mid = Math.ceil(chars.length / 2);
    return [chars.slice(0, Math.min(10, mid)).join(""), chars.slice(Math.min(10, mid), Math.min(20, chars.length)).join("")].filter(Boolean);
  }
  const words = cleaned.split(/\s+/u).filter(Boolean);
  if (words.length <= 5) return [words.join(" ")];
  const lines: string[] = [];
  const wordsPerLine = Math.max(5, Math.ceil(words.length / 4));
  for (let index = 0; index < words.length; index += wordsPerLine) lines.push(words.slice(index, index + wordsPerLine).join(" "));
  return lines.slice(0, 4);
}

function firstSourceSentence(value: string) {
  const cleaned = String(value || "").replace(/\s+/gu, " ").replace(/[’]/gu, "'").trim();
  return (cleaned.split(/(?<=[.!?])\s+|。/u).map((item) => item.trim()).find((item) => item.length >= 12) || cleaned).replace(/[。.!?]+$/u, "").trim();
}

function directorClaimIsNoisy(value: string) {
  const claim = String(value || "").replace(/\s+/gu, " ").trim();
  if (!claim) return true;
  if (/(?:Endnotes?|References?|Translation links?|Korean Translation|Japanese Translation|Chinese Translation|Press Contact|Media Helpline|Media in this article|Annex (?:II|III)|Technology-specific cost|Metrics & Methodology|media\.[a-z0-9.-]+@[a-z0-9.-]+)/iu.test(claim)) return true;
  if ((claim.match(/\b[A-Z][a-z]+,\s*[A-Z]\./gu) || []).length >= 4) return true;
  if (/\b(?:iPh|IP68 r|supports English \([^)]*)$/iu.test(claim)) return true;
  if (/(?:\b(?:and|or|but|for|to|of|in|on|at|with|from|by|is|are|can|should|will|while|so|be|try|supports|you|your|it|it's|it’s|a|an|the|all|after)\s*)$/iu.test(claim)) return true;
  return false;
}

function semanticClaimFor(section: any) {
  const claim = String(section.semanticClaim || "").replace(/\s+/gu, " ").trim();
  const source = firstSourceSentence(section.sourceText || "");
  const claimWords = claim.split(/\s+/u).filter(Boolean).length;
  const sourceWords = source.split(/\s+/u).filter(Boolean).length;
  return directorClaimIsNoisy(claim) || (sourceWords >= claimWords + 3 && source.length >= claim.length + 12) ? source : claim;
}

function completeHeadline(value: string, sourceText: string) {
  const claim = String(value || "文章段落").replace(/\s+/gu, " ").replace(/\s+([’'])/gu, "$1").replace(/([’'])\s+/gu, "$1").replace(/[’]/gu, "'").trim();
  const source = String(sourceText || "").replace(/\s+/gu, " ").replace(/\s+([’'])/gu, "$1").replace(/([’'])\s+/gu, "$1").replace(/[’]/gu, "'").trim().replace(/^.*?\bArticle\s+/iu, "");
  const dangling = /(?:\b(?:and|or|but|for|to|of|in|on|at|with|from|by|is|are|can|should|will|while|so|be|it's)\s*)$/iu.test(claim);
  const firstSentence = source.split(/(?<=[.!?])\s+/u)[0] || source;
  if (claim === firstSentence && firstSentence.length > 40) return firstSentence;
  if (!/[A-Za-z]/u.test(claim) || !/[A-Za-z]/u.test(source) || source.length <= claim.length + 12 || claim.length > 120 || (!dangling && claim.length <= 40)) return claim;
  const stopWords = new Set(["a", "an", "the", "and", "or", "but", "for", "to", "of", "in", "on", "at", "with", "from", "by", "is", "are", "can", "should", "will", "while", "within", "so", "be", "you", "your", "it", "it's", "it’s", "try", "supports", "use", "remove", "make", "study", "creates", "create", "great", "focus", "allow", "provides", "gives", "sure", "these", "those", "need", "take", "during", "after", "all", "that", "you'll", "you’ll", "we'll", "we’ll", "they'll", "they’ll"]);
  const words = firstSentence.split(/\s+/u).filter(Boolean).slice(0, 18);
  while (words.length > 4 && stopWords.has((words.at(-1) || "").toLowerCase().replace(/[.,;:!?]+$/gu, ""))) words.pop();
  return words.length >= 4 ? words.join(" ").replace(/[,;:]\s*$/u, "") : claim;
}

function roleForFunction(value: A1ArticleSentenceFunction) {
  if (value === "setup") return "setup" as const;
  if (value === "problem") return "problem" as const;
  if (value === "method") return "method" as const;
  if (value === "roles") return "roles" as const;
  if (value === "comparison") return "comparison" as const;
  if (value === "closing") return "closing" as const;
  return "proof" as const;
}

function familyOptions(functionName: A1ArticleSentenceFunction, index: number, total: number) {
  if (index === 0 || functionName === "setup") return ["full-bleed-hero", "paper-evidence"];
  if (index === total - 1 || functionName === "closing") return ["dark-verdict", "quiet-bridge"];
  if (functionName === "data") return ["metric-verdict", "paper-evidence", "relationship-map"];
  if (functionName === "comparison") return ["vertical-shutters", "metric-verdict", "relationship-map"];
  if (functionName === "method" || functionName === "roles" || functionName === "mechanism") return ["relationship-map", "vertical-shutters", "paper-evidence"];
  if (functionName === "evidence") return ["paper-evidence", "full-bleed-hero", "relationship-map"];
  if (functionName === "problem") return ["dark-verdict", "cutout-collage", "quiet-bridge"];
  return ["quiet-bridge", "relationship-map", "paper-evidence"];
}

function chooseFamily(functionName: A1ArticleSentenceFunction, index: number, total: number, previous: string | null, previousPrevious: string | null) {
  for (const candidate of familyOptions(functionName, index, total)) if (!(candidate === previous && candidate === previousPrevious)) return candidate;
  return familyOptions(functionName, index, total)[0];
}

function elementKindsFor(family: string, functionName: A1ArticleSentenceFunction) {
  if (family === "metric-verdict" || functionName === "data") return ["metric"];
  if (family === "relationship-map" || functionName === "mechanism") return ["relationship-path", "label"];
  if (family === "vertical-shutters" || functionName === "roles") return ["label", "direction"];
  if (family === "dark-verdict" || functionName === "problem") return ["annotation"];
  if (family === "cutout-collage") return ["direction", "label"];
  return ["label"];
}

function displaySupport(value: string) {
  const cleaned = String(value || "").replace(/\s+/gu, " ").replace(/\s+([’'])/gu, "$1").replace(/([’'])\s+/gu, "$1").replace(/[’]/gu, "'").trim();
  const finish = (candidate: string) => candidate.replace(/[,，;；:：]\s*$/u, "").trim() || null;
  if (cleaned.length <= 170) return finish(cleaned);
  const clauses = cleaned.split(/(?<=[.!?。！？；;])\s*/u).map((item) => item.trim()).filter(Boolean);
  const complete = clauses.find((item) => item.length >= 32 && item.length <= 170);
  if (complete) return finish(complete);
  const commaClause = cleaned.split(/(?<=[,，])\s*/u).map((item) => item.trim()).find((item) => item.length >= 32 && item.length <= 150);
  if (commaClause) return finish(commaClause);
  const words = cleaned.split(/\s+/u);
  let safe = "";
  for (const word of words) {
    const next = safe ? `${safe} ${word}` : word;
    if (next.length > 150) break;
    safe = next;
  }
  return finish(safe || cleaned.slice(0, 150));
}

function channel(channelName: string, source: string, visualJob: string, assetUri: string | null, localSha256: string | null, sourceUrl: string | null, emptyReason: string | null, extras: Record<string, unknown> = {}) {
  return {contract: "A1ShotVisualLayer/v2", channel: channelName, source, visualJob, assetUri, sourceUrl, localSha256, prompt: null, promptSha256: null, emptyReason, independent: true, reviewStatus: source === "none" ? "not-required" : "pending", ...extras};
}

function buildDesign(section: any, index: number, total: number, material: {assetUri: string; localSha256: string; sourceUrl: string; candidates?: Array<{assetUri: string; localSha256: string; sourceUrl: string}>} | null, previous: string | null, previousPrevious: string | null, articleTitle: string) {
  const dominant = section.dominantFunction as A1ArticleSentenceFunction;
  let family = chooseFamily(dominant, index, total, previous, previousPrevious);
  const numericEvidence = /\d|%|％|percent|percentage|million|billion|亿|万/iu.test(`${section.sourceText} ${section.semanticClaim}`);
  if (family === "metric-verdict" && !numericEvidence) family = index % 2 ? "paper-evidence" : "relationship-map";
  const materialNeeded = Boolean(material) && ["setup", "evidence", "data", "comparison", "roles"].includes(dominant);
  const chosenMaterial = materialNeeded && material?.candidates?.length ? material.candidates[index % material.candidates.length] : material;
  const materialSource = materialNeeded ? "verified-web" : "none";
  const materialAssetUri = materialNeeded ? chosenMaterial!.assetUri : null;
  const materialSha = materialNeeded ? chosenMaterial!.localSha256 : null;
  const materialUrl = materialNeeded ? chosenMaterial!.sourceUrl : null;
  const semanticClaim = index === 0 ? articleTitle : semanticClaimFor(section);
  const headlineLines = splitHeadline(index === 0 ? articleTitle : completeHeadline(semanticClaim || section.sourceText || articleTitle, section.sourceText));
  const role = roleForFunction(dominant);
  const familyRole = family === "metric-verdict" ? "number" : family === "dark-verdict" || family === "cutout-collage" ? "judgement" : family === "vertical-shutters" ? "condensed-title" : role === "closing" ? "judgement" : "body";
  const elements = elementKindsFor(family, dominant);
  const design = {
    contract: "A1LayeredShotDesign/v2" as const,
    shotId: `${articleTitle.toLowerCase().replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").slice(0, 18) || "article"}-B${String(index + 1).padStart(2, "0")}`,
    order: index + 1,
    visualMasterId: "fused-editorial-v2" as const,
    sceneFamily: family,
    narrative: {task: `${dominant} · ${section.groupingReason}`, importance: index === 0 || index === total - 1 ? 5 : dominant === "data" || dominant === "problem" ? 4 : 3, visualFocus: semanticClaim || section.sourceText.slice(0, 36), whyThisShotExists: `AI 先将本段识别为${dominant}，再用${family}承载，而不是先套模板。`, carryIn: index ? `承接上一镜的${previous || "文章主线"}，保留同一语义对象。` : "从文章标题和第一条判断建立主视觉。", carryOut: index < total - 1 ? `把${dominant}判断交给下一镜的${String(section.relationFromPrevious || "continuation")}关系。` : "收束为读者仍可判断的结论。"},
    layers: {
      background: {...channel("background", "style-pack", family === "dark-verdict" ? "建立黑场结论底色" : "建立纸张/编辑底色", null, null, null, null), mode: family === "dark-verdict" || family === "metric-verdict" ? "ink" : "paper"},
      material: {...channel("material", materialSource, materialNeeded ? "承载文章来源页的真实图像证据" : "明确本镜以文字和语义关系为主，不伪造配图", materialAssetUri, materialSha, materialUrl, materialNeeded ? null : "当前段落的判断或关系本身是主事件；没有可靠来源图时保持诚实留白。"), mode: materialNeeded ? "editorial-image" : "none", evidenceAllowed: materialNeeded},
      foreground: {...channel("foreground", "none", "不把未审抠像伪装成前景", null, null, null, "该通用文章首轮没有通过遮罩审片的独立前景，保留原图/文字层。"), mode: "none", maskAssetId: null},
      semanticElements: {...channel("semanticElements", "deterministic", "让线、节点、数字和批注附着在本段语义对象上", null, null, null, null), elementKinds: elements, attachTo: ["headline", dominant], decorative: false},
      typography: {...channel("typography", "editable-text", "保留真实字体与精确换行，中文不烘焙", null, null, null, null), source: "editable-text", role: index === 0 ? "film-title" : index === total - 1 ? "finale" : family === "metric-verdict" ? "metric" : family === "dark-verdict" ? "evidence" : "headline", familyRole, editableCopy: {headlineLines, support: displaySupport(section.sourceText), number: family === "metric-verdict" ? (section.sourceText.match(/\d+(?:\.\d+)?\s*(?:%|％|亿|万|million|billion)?/iu)?.[0] || null) : null, annotation: null}, bakedTitle: {enabled: false, assetUri: null, ocrStatus: "not-required", humanCharacterReview: "not-required", editableTruth: null}},
      finish: {...channel("finish", "deterministic", "统一颗粒、调色、印刷错位与边缘融合", null, null, null, null), treatments: family === "dark-verdict" ? ["paper-grain", "chromatic-echo", "unified-grade"] : ["paper-grain", "unified-grade", "edge-blend"]},
    },
    treatment: {crop: materialNeeded ? (family === "paper-evidence" ? "contain" : "cinematic-crop") : "none", cropAlternatives: materialNeeded ? [`${index + 1}-contain`, `${index + 1}-focal-cover`, `${index + 1}-cinematic-crop`] : [], selectedCropId: materialNeeded ? `${index + 1}-cinematic-crop` : null, cutout: "not-needed", textSafeArea: {left: .05, top: .08, right: .95, bottom: .9}},
    review: {status: "pending-visual-review" as const, structurePass: true, humanVisualApprovalRequired: true as const, blockers: []},
  };
  return A1LayeredShotDesignV2Schema.parse(design);
}

async function cacheMaterial(entry: ArticleEntry, imageUrls: string[]) {
  if (!imageUrls.length) return null;
  const dir = path.join(rendererPublicDir, "generated/system-line/article-material-cache-v1", entry.id);
  const candidates: Array<{id: string; sourceUrl: string; assetUri: string; localSha256: string; capturedAt: string; licenseStatus: string; role: string}> = [];
  for (const [index, imageUrl] of imageUrls.slice(0, 6).entries()) {
    const output = path.join(dir, `candidate-${String(index + 1).padStart(2, "0")}.png`);
    try {
      if (!fs.existsSync(output) || fs.statSync(output).size < 1024) {
        const response = await fetch(imageUrl, {headers: {"user-agent": "A1-Article-Packaging/1.0", accept: "image/avif,image/webp,image/png,image/jpeg,*/*"}});
        if (!response.ok) continue;
        const raw = Buffer.from(await response.arrayBuffer());
        fs.mkdirSync(dir, {recursive: true});
        await sharp(raw).rotate().resize(1920, 1080, {fit: "inside", withoutEnlargement: false}).png().toFile(output);
      }
      candidates.push({id: `${entry.id}-material-${String(index + 1).padStart(2, "0")}`, sourceUrl: imageUrl, assetUri: path.relative(rendererPublicDir, output).split(path.sep).join("/"), localSha256: shaFile(output), capturedAt: new Date().toISOString(), licenseStatus: "unknown-review-visible", role: index === 0 ? "primary-page-image" : "semantic-candidate"});
    } catch { /* preserve successful candidates; failed downloads remain visible in the source URL list */ }
  }
  if (!candidates.length) return null;
  const primary = candidates[0];
  return {assetUri: primary.assetUri, localSha256: primary.localSha256, sourceUrl: primary.sourceUrl, candidates};
}

async function makeContactSheet(stills: Array<{path: string; order: number; shotId: string}>, output: string) {
  const tileWidth = 480; const tileHeight = 270; const labelHeight = 32; const columns = 4; const rows = Math.ceil(stills.length / columns);
  const composites: any[] = [];
  for (const [index, still] of stills.entries()) {
    const left = (index % columns) * tileWidth; const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    composites.push({input: await sharp(still.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="10" y="22" fill="#f2efe7" font-family="Arial" font-size="15">${String(still.order).padStart(2, "0")} · ${still.shotId}</text></svg>`), left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 90}).toFile(output);
}

async function renderStills(designs: any[], phaseId: string, artifactDir: string, publicDir: string) {
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const stills: Array<{path: string; publicUrl: string; order: number; shotId: string; sha256: string; width: number; height: number}> = [];
  fs.mkdirSync(path.join(artifactDir, "stills"), {recursive: true}); fs.mkdirSync(path.join(publicDir, "stills"), {recursive: true});
  try {
    for (const design of designs) {
      const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2FullBoard", inputProps: {design}, puppeteerInstance: browser, logLevel: "warn"});
      const name = `${String(design.order).padStart(2, "0")}-${design.shotId}.png`; const artifactPath = path.join(artifactDir, "stills", name); const publicPath = path.join(publicDir, "stills", name);
      await renderStill({serveUrl, composition, inputProps: {design}, frame: 0, output: artifactPath, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(artifactPath, publicPath); stills.push({path: rel(artifactPath), publicUrl: `/generated/system-line/${phaseId}/stills/${name}`, order: design.order, shotId: design.shotId, sha256: shaFile(artifactPath), width: 960, height: 540});
    }
  } finally { await browser.close({silent: true}); }
  return stills;
}

async function buildArticle(entry: ArticleEntry) {
  const phaseId = `article-${entry.id}-fused-editorial-v2-v1`;
  const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
  const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
  fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
  const previousReport = fs.existsSync(path.join(publicDir, "report.json")) ? readJson(path.join(publicDir, "report.json")) : null;
  const previousBoard = fs.existsSync(path.join(publicDir, "design-board-manifest.json")) ? readJson(path.join(publicDir, "design-board-manifest.json")) : null;
  const sourceCacheFile = path.join(artifactDir, "source.html");
  const fetched = await fetchArticle(entry, sourceCacheFile);
  const deterministicUnderstanding = understandArticle(fetched.text, {title: fetched.title});
  let understanding = deterministicUnderstanding;
  let directorRun: Record<string, unknown> = {contract: "A1FusedEditorialV2DirectorRun/v1", requestedMode: directorMode, status: "deterministic-fallback", fallbackReason: "director-not-requested", analyzerMode: deterministicUnderstanding.analyzerMode};
  if (directorMode !== "deterministic") {
    try {
      const capability = await getCodexDirectorCapability();
      if (!capability.codexAvailable) throw new Error("local-codex-cli-unavailable");
      const run = await runCodexArticleDirector(fetched.text, {title: fetched.title});
      understanding = run.understanding;
      directorRun = {contract: "A1FusedEditorialV2DirectorRun/v1", requestedMode: directorMode, status: "completed", analyzerMode: run.analyzerMode, granularity: run.granularity, taskId: run.taskId, durationMs: run.durationMs, codexVersion: run.codexVersion, capability};
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (directorMode === "codex") throw new Error(`codex-director-failed:${entry.id}:${reason}`);
      directorRun = {...directorRun, status: "deterministic-fallback", fallbackReason: reason, analyzerMode: deterministicUnderstanding.analyzerMode};
    }
  }
  if (!understanding.coverage.exact || understanding.sections.length < 4) throw new Error(`article-understanding-incomplete:${entry.id}:${understanding.sections.length}`);
  const material = await cacheMaterial(entry, fetched.imageCandidates);
  const sections = understanding.sections.slice(0, 12);
  const visualArticleTitle = entry.kind === "自定义文章" ? fetched.title : entry.title;
  const designs: any[] = []; let previous: string | null = null; let previousPrevious: string | null = null;
  for (const [index, section] of sections.entries()) { const design = buildDesign(section, index, sections.length, material, previous, previousPrevious, visualArticleTitle); designs.push(design); previousPrevious = previous; previous = design.sceneFamily; }
  const candidateReport = readJson(path.join(root, "apps/studio-next/public/generated/system-line", candidatePhase, "report.json"));
  const sourceRecord = {contract: "A1ArticleSourceProvenance/v1", articleId: entry.id, kind: entry.kind, title: fetched.title, sourceUrl: entry.url, imageUrl: fetched.imageUrl, capturedAt: fetched.capturedAt, htmlSha256: fetched.htmlSha256, textSha256: shaValue(fetched.text), material};
  writeJson(path.join(artifactDir, "source-provenance.json"), {...sourceRecord, cacheFile: rel(sourceCacheFile), cacheHit: fetched.cached}); writeJson(path.join(publicDir, "source-provenance.json"), {...sourceRecord, cacheFile: rel(sourceCacheFile), cacheHit: fetched.cached});
  writeJson(path.join(artifactDir, "director-run.json"), directorRun); writeJson(path.join(publicDir, "director-run.json"), directorRun);
  writeJson(path.join(artifactDir, "article-understanding.json"), understanding); writeJson(path.join(publicDir, "article-understanding.json"), understanding);
  writeJson(path.join(artifactDir, "layered-shot-designs.json"), {contract: "A1FusedEditorialV2ArticleDesignSet/v1", articleId: entry.id, sourceUrl: entry.url, visualMasterSha256: candidateReport.visualMaster.sha256, designs: designs.map((design) => ({...design, designSha256: shaValue(design)}))});
  writeJson(path.join(publicDir, "layered-shot-designs.json"), {contract: "A1FusedEditorialV2ArticleDesignSet/v1", articleId: entry.id, sourceUrl: entry.url, visualMasterSha256: candidateReport.visualMaster.sha256, designs: designs.map((design) => ({...design, designSha256: shaValue(design)}))});
  const stills = await renderStills(designs, phaseId, artifactDir, publicDir);
  await makeContactSheet(stills.map((still) => ({path: path.join(root, still.path), order: still.order, shotId: still.shotId})), path.join(artifactDir, "static-board-contact-sheet.jpg"));
  fs.copyFileSync(path.join(artifactDir, "static-board-contact-sheet.jpg"), path.join(publicDir, "static-board-contact-sheet.jpg"));
  const treatments = material ? await buildFourTreatmentImageCandidates({sourcePath: path.join(rendererPublicDir, material.assetUri), outputDir: path.join(artifactDir, "treatments"), id: entry.id, width: 960, height: 540, textExclusionZones: [{left: .04, top: .08, right: .48, bottom: .88}]}) : null;
  if (treatments) { fs.mkdirSync(path.join(publicDir, "treatments"), {recursive: true}); for (const output of treatments.outputs as Array<{path: string | null}>) if (output.path) fs.copyFileSync(output.path, path.join(publicDir, "treatments", path.basename(output.path))); }
  const sourceHash = shaValue(sourceRecord); const designSetHash = shaFile(path.join(publicDir, "layered-shot-designs.json"));
  const unchangedDesign = previousReport?.designSetSha256 === designSetHash && previousBoard?.sourceHash === designSetHash;
  const shots = unchangedDesign && Array.isArray(previousReport?.shots)
    ? previousReport.shots
    : designs.map((design, index) => ({order: design.order, shotId: design.shotId, designSha256: shaValue(design), still: stills[index], review: {status: "pending", reviewedDesignSha256: null}, neighborShotIds: [designs[index - 1]?.shotId, designs[index + 1]?.shotId].filter(Boolean)}));
  const board = unchangedDesign && previousBoard
    ? previousBoard
    : A1DesignBoardManifestV1Schema.parse({contract: "A1DesignBoardManifest/v1", projectId: phaseId, visualMasterId: "fused-editorial-v2", visualMasterSha256: candidateReport.visualMaster.sha256, sourceHash: designSetHash, phase: "full-board-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: true, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false, shots, summary: {shotCount: shots.length, approvedCount: 0, pendingCount: shots.length, reviseCount: 0}, nextAction: "review-article-static-board-before-motion"});
  writeJson(path.join(artifactDir, "design-board-manifest.json"), board); writeJson(path.join(publicDir, "design-board-manifest.json"), board);
  const report = {contract: "A1FusedEditorialV2ArticleBoardReport/v1", phaseId, article: {id: entry.id, kind: entry.kind, title: fetched.title, sourceUrl: entry.url}, status: unchangedDesign && previousReport?.status ? previousReport.status : "READY_FOR_ARTICLE_STATIC_BOARD_REVIEW", reviewOnly: true, currentAuthority: {phaseId: "h-series-semantic-directed-v1", unchanged: true}, source: sourceRecord, director: directorRun, understanding: {sentenceCount: understanding.sentences.length, sectionCount: understanding.sections.length, coverageExact: understanding.coverage.exact, confidence: understanding.confidence, analyzerMode: understanding.analyzerMode}, visualMasterSha256: candidateReport.visualMaster.sha256, designSetSha256: designSetHash, sceneFamilyCounts: designs.reduce((counts, design) => ({...counts, [design.sceneFamily]: (counts[design.sceneFamily] || 0) + 1}), {} as Record<string, number>), allShotsStableStills: stills.length === designs.length, shots, contactSheet: {publicUrl: `/generated/system-line/${phaseId}/static-board-contact-sheet.jpg`, path: rel(path.join(artifactDir, "static-board-contact-sheet.jpg")), sha256: shaFile(path.join(artifactDir, "static-board-contact-sheet.jpg"))}, treatments: treatments ? {source: material, outputs: treatments.outputs, everySourceHasThreeReadyTreatments: treatments.outputs.filter((output: any) => output.status === "ready").length >= 3} : null, gates: unchangedDesign && previousReport?.gates ? previousReport.gates : {staticReviewRequired: true, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false}, formal1080: unchangedDesign ? previousReport?.formal1080 : undefined, nextAction: unchangedDesign && previousReport?.nextAction ? previousReport.nextAction : "approve-article-static-board-before-motion"};
  writeJson(path.join(artifactDir, "report.json"), report); writeJson(path.join(publicDir, "report.json"), report);
  return {id: entry.id, phaseId, sectionCount: designs.length, contactSheet: report.contactSheet.publicUrl, sourceUrl: entry.url, status: report.status};
}

guard();
updateIntakeStatus({status: "running", mode: directorMode, requested: selected.map((entry) => ({id: entry.id, url: entry.url}))});
try {
  const results = [];
  for (const entry of selected) results.push(await buildArticle(entry));
  updateIntakeStatus({status: "completed", mode: directorMode, articles: results});
  console.log(JSON.stringify({status: "ARTICLE_STATIC_BOARDS_READY_FOR_REVIEW", articles: results}, null, 2));
} catch (error) {
  updateIntakeStatus({status: "failed", mode: directorMode, error: error instanceof Error ? error.message : String(error)});
  throw error;
}
