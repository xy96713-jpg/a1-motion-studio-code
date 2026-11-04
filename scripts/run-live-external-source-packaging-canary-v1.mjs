#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {imageSearch} from "@mudbill/duckduckgo-images-api";
import {compileExternalSourcePackagingPlan, assertExternalSourcePackagingPlan} from "../apps/studio-next/src/lib/a1-external-source-packaging-router-v1.mjs";
import {judgeImagePixels, hammingDistance} from "../lib/visual-sourcing/image-pixel-judge-v1.mjs";
import {rankMaterialCarrierCandidates} from "../lib/visual-sourcing/material-carrier-fit-ranker-v1.mjs";
import {searchBroadWebImages} from "../lib/visual-sourcing/web-image-provider-chain.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/live-external-source-packaging-canary-v1");
const stagingRoot = path.join(outputRoot, "staging");
const panelsRoot = path.join(outputRoot, "panels");
const requestPath = path.join(outputRoot, "request.json");
const resultPath = path.join(outputRoot, "result.json");
const contactSheetPath = path.join(outputRoot, "contact-sheet.png");
const hotPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const width = 960;
const height = 540;
const allowedLicenses = new Set(["cc0", "pdm", "by", "by-sa"]);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const clean = (value, max = 1200) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const fixtures = [
  {
    id: "live-source-a",
    genre: "evidence-explainer",
    query: "newspaper front page",
    mediaRole: "DOCUMENT_EVIDENCE",
    requiredCount: 1,
    requiredQueryTerms: ["front", "page"],
    requirement: {role: "evidence", requiredEntity: null, requiredAction: "mark", requiredReadableDetail: "readable-source-detail", requiredVisualSignals: [], sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED"}, effectBinding: {targetType: "source-page-region", semanticAction: "mark", requiresVerifiedCarrier: true}},
  },
  {
    id: "live-source-b",
    genre: "documentary-archive",
    query: "NASA control room public domain",
    mediaRole: "ARCHIVE_SET",
    requiredCount: 2,
    requiredQueryTerms: ["nasa", "room"],
    requirement: {role: "context", requiredEntity: null, requiredAction: "hold", requiredReadableDetail: "scene-context", requiredVisualSignals: [], sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED"}, effectBinding: {targetType: "material-region", semanticAction: "hold", requiresVerifiedCarrier: true}},
  },
  {
    id: "live-source-c",
    genre: "culture-commentary",
    query: "WPA poster public domain",
    mediaRole: "PRINT_ARTIFACT",
    requiredCount: 1,
    requiredQueryTerms: ["wpa", "poster"],
    requirement: {role: "context", requiredEntity: null, requiredAction: "hold", requiredReadableDetail: "scene-context", requiredVisualSignals: [], sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED"}, effectBinding: {targetType: "material-region", semanticAction: "hold", requiresVerifiedCarrier: true}},
  },
];

function authoritySnapshot() {
  const phase = JSON.parse(fs.readFileSync(hotPhasePath, "utf8"));
  return {
    workspaceIdentitySha256: phase.authority?.workspaceSha256 || null,
    workspaceFileSha256: fileSha256(workspacePath),
    systemLinePhaseFileSha256: fileSha256(hotPhasePath),
    phaseStatus: phase.status || null,
  };
}

function sourceBinding(candidate) {
  return {
    id: candidate.id,
    assetUri: candidate.localPath,
    sha256: candidate.sha256,
    provenance: {
      sourceUri: candidate.sourceUrl,
      license: `${candidate.license}${candidate.licenseUrl ? ` · ${candidate.licenseUrl}` : ""}`,
      reviewed: true,
    },
  };
}

async function downloadCandidate(candidate, target) {
  const response = await fetch(candidate.imageUrl, {
    redirect: "follow",
    headers: {"User-Agent": "A1MotionStudio/1.0", Referer: candidate.sourceUrl},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`download-${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("download-size-invalid");
  await fs.promises.writeFile(target, bytes);
  const metadata = await sharp(target).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 480 || metadata.height < 270) throw new Error("download-dimensions-invalid");
  return {bytes: bytes.length, width: metadata.width, height: metadata.height, sha256: sha256(bytes)};
}

function candidateRecord(candidate, fixture, index) {
  return {
    ...candidate,
    id: `${fixture.id}:candidate:${index + 1}`,
    sourceQualityTier: candidate.providerId === "openverse" ? "open-knowledge" : "search-review-only",
    evidenceFields: {
      title: candidate.title,
      width: candidate.width,
      height: candidate.height,
      license: candidate.license,
      sourceQualityTier: candidate.providerId === "openverse" ? "open-knowledge" : "search-review-only",
    },
  };
}

async function acquireFixture(fixture) {
  const search = await searchBroadWebImages({query: fixture.query, maxResults: 14, imageSearchImpl: imageSearch, env: {}});
  const rightsSafe = search.candidates
    .filter((candidate) => candidate.providerId === "openverse")
    .filter((candidate) => allowedLicenses.has(clean(candidate.license, 20).toLowerCase()))
    .filter((candidate) => Number(candidate.width || 0) >= 480 && Number(candidate.height || 0) >= 270)
    .filter((candidate) => Number(candidate.queryMatchScore || 0) >= 25)
    .filter((candidate) => fixture.requiredQueryTerms.every((term) => (candidate.matchedQueryTerms || []).includes(term)))
    .filter((candidate) => !/\.svg(?:$|\?)/iu.test(candidate.imageUrl || ""))
    .map((candidate, index) => candidateRecord(candidate, fixture, index));
  const ranked = rankMaterialCarrierCandidates(rightsSafe, fixture.requirement, {});
  const fixtureDir = path.join(stagingRoot, fixture.id);
  fs.mkdirSync(fixtureDir, {recursive: true});
  const accepted = [];
  const attempts = [];
  for (const candidate of ranked.slice(0, 8)) {
    const localPath = path.join(fixtureDir, `${String(attempts.length + 1).padStart(2, "0")}.img`);
    const attempt = {id: candidate.id, title: candidate.title, providerId: candidate.providerId, sourceUrl: candidate.sourceUrl, imageUrl: candidate.imageUrl, license: candidate.license, licenseUrl: candidate.licenseUrl || null, queryMatchScore: candidate.queryMatchScore, matchedQueryTerms: candidate.matchedQueryTerms, status: "PENDING"};
    attempts.push(attempt);
    try {
      const download = await downloadCandidate(candidate, localPath);
      const review = await judgeImagePixels({imagePath: localPath, requirement: fixture.requirement});
      attempt.download = download;
      attempt.pixelReview = {status: review.status, score: review.score, fatalFailures: review.fatalFailures, semanticSource: review.semanticSource, ocrTextLength: review.ocrTextLength, labels: review.labels};
      if (review.status !== "PASS" || !review.perceptualHash) {
        attempt.status = "REJECTED";
        continue;
      }
      const duplicate = accepted.some((item) => {
        const distance = hammingDistance(item.pixelReview.perceptualHash, review.perceptualHash);
        return distance !== null && distance <= 4;
      });
      if (duplicate) {
        attempt.status = "REJECTED_DUPLICATE";
        continue;
      }
      const acceptedCandidate = {...candidate, localPath, sha256: download.sha256, pixelReview: review};
      accepted.push(acceptedCandidate);
      attempt.status = "ACCEPTED_FOR_REVIEW_PACKAGE";
      if (accepted.length >= fixture.requiredCount) break;
    } catch (error) {
      attempt.status = "FAILED";
      attempt.error = clean(error?.message || String(error), 300);
    }
  }
  if (accepted.length < fixture.requiredCount) throw new Error(`${fixture.id}:insufficient-live-candidates:${accepted.length}/${fixture.requiredCount}`);
  const plan = compileExternalSourcePackagingPlan({
    mediaRole: fixture.mediaRole,
    source: sourceBinding(accepted[0]),
    sources: accepted.map(sourceBinding),
    requirement: fixture.requirement,
    pixelReview: accepted[0].pixelReview,
  });
  assertExternalSourcePackagingPlan(plan);
  return {fixture, search, attempts, accepted, plan};
}

function chrome(route, title, subtitle) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="960" height="50" fill="#101617"/><rect width="10" height="50" fill="#c8ff32"/>
    <text x="28" y="33" font-family="Arial" font-size="20" font-weight="700" fill="#f5f4ec">${route}</text>
    <text x="930" y="31" text-anchor="end" font-family="Arial" font-size="13" fill="#8d9b9e">${title}</text>
    <rect y="486" width="960" height="54" fill="#101617"/>
    <text x="24" y="519" font-family="Arial" font-size="14" font-weight="700" fill="#c8ff32">LIVE SOURCE · REVIEW ONLY</text>
    <text x="260" y="519" font-family="Arial" font-size="12" fill="#8d9b9e">${subtitle}</text>
  </svg>`);
}

async function renderEvidence(acquired) {
  const source = acquired.accepted[0];
  const page = await sharp(source.localPath).resize(610, 400, {fit: "contain", background: "#eee9dd"}).modulate({brightness: 0.58, saturation: 0.25}).png().toBuffer();
  const anchor = acquired.plan.pixelReviewBinding.anchor;
  const box = {left: Math.round(58 + anchor.x * 610), top: Math.round(68 + anchor.y * 400), width: Math.max(8, Math.round(anchor.width * 610)), height: Math.max(8, Math.round(anchor.height * 400))};
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
    <rect width="960" height="540" fill="#0c1112"/><rect x="48" y="58" width="630" height="420" fill="#f4f0e4"/>
    <rect x="${box.left}" y="${box.top}" width="${Math.min(box.width, 660 - box.left)}" height="${Math.min(box.height, 468 - box.top)}" fill="none" stroke="#c8ff32" stroke-width="5"/>
    <text x="710" y="160" font-family="Arial" font-size="34" font-weight="700" fill="#f5f4ec">REAL PAGE</text>
    <text x="710" y="202" font-family="Arial" font-size="34" font-weight="700" fill="#f5f4ec">REAL OCR</text>
    <text x="710" y="254" font-family="Arial" font-size="17" fill="#c8ff32">dim → locate → highlight</text>
    <text x="710" y="292" font-family="Arial" font-size="14" fill="#8d9b9e">${clean(source.title, 32)}</text>
  </svg>`);
  const highlight = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect x="${box.left}" y="${box.top}" width="${Math.min(box.width, 660 - box.left)}" height="${Math.min(box.height, 468 - box.top)}" fill="none" stroke="#c8ff32" stroke-width="5"/><rect x="${box.left}" y="${box.top + Math.min(box.height, 468 - box.top) - 10}" width="${Math.min(box.width, 660 - box.left)}" height="10" fill="#c8ff32" opacity="0.8"/></svg>`);
  return sharp(overlay).composite([{input: page, left: 58, top: 68}, {input: highlight}, {input: chrome(acquired.plan.route, acquired.fixture.genre, `license ${source.license} · ${source.sha256.slice(0, 12)}`)}]).png().toBuffer();
}

async function renderArchive(acquired) {
  const cards = await Promise.all(acquired.accepted.map(async (source, index) => sharp(source.localPath).resize(390, 330, {fit: "cover"}).extend({top: 10, bottom: 10, left: 10, right: 10, background: "#f3eedf"}).rotate(index ? 3 : -3, {background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer()));
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#d5cebd"/><text x="48" y="458" font-family="Arial" font-size="22" font-weight="700" fill="#101617">LIVE ARCHIVE COLLAGE</text></svg>`);
  return sharp(base).composite([{input: cards[0], left: 70, top: 92}, {input: cards[1], left: 470, top: 78}, {input: chrome(acquired.plan.route, acquired.fixture.genre, `2 distinct hashes · ${acquired.accepted.map((item) => item.license).join(" + ")}`)}]).png().toBuffer();
}

async function renderPrint(acquired) {
  const source = acquired.accepted[0];
  const image = await sharp(source.localPath).resize(960, 486, {fit: "contain", background: "#d8d0bc"}).grayscale().tint({r: 232, g: 218, b: 180}).linear(1.1, -16).png().toBuffer();
  const lines = Array.from({length: 34}, (_, index) => `<path d="M0 ${index * 14} H960" stroke="#111" stroke-width="1" opacity="${index % 3 ? 0.04 : 0.12}"/>`).join("");
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">${lines}<rect x="54" y="320" width="650" height="108" fill="#101617" opacity="0.9"/><text x="82" y="366" font-family="Arial" font-size="36" font-weight="700" fill="#c8ff32">LIVE PRINT MATERIAL</text><text x="82" y="400" font-family="Arial" font-size="15" fill="#f5f4ec">bounded wear · original hash remains authoritative</text></svg>`);
  return sharp(image).extend({top: 50, bottom: 4, left: 0, right: 0, background: "#101617"}).composite([{input: overlay}, {input: chrome(acquired.plan.route, acquired.fixture.genre, `license ${source.license} · ${source.sha256.slice(0, 12)}`)}]).png().toBuffer();
}

async function renderFixture(acquired) {
  if (acquired.plan.route === "EVIDENCE_HIGHLIGHT") return renderEvidence(acquired);
  if (acquired.plan.route === "ARCHIVE_COLLAGE") return renderArchive(acquired);
  return renderPrint(acquired);
}

async function main() {
  fs.mkdirSync(stagingRoot, {recursive: true});
  fs.mkdirSync(panelsRoot, {recursive: true});
  const initialAuthority = authoritySnapshot();
  const request = {
    contract: "A1LiveExternalSourcePackagingRequest/v1",
    status: "DISPATCH_READY",
    fixtures: fixtures.map(({id, genre, query, mediaRole, requiredCount}) => ({id, genre, query, mediaRole, requiredCount})),
    policy: {providers: ["openverse", "duckduckgo"], acceptedProviderForRightsBoundCanary: "openverse", allowedLicenses: [...allowedLicenses], maximumCandidatesPerQuery: 14, maximumDownloadsPerFixture: 8, concurrency: 1},
    authoritySnapshot: initialAuthority,
  };
  fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

  const acquired = [];
  for (const fixture of fixtures) acquired.push(await acquireFixture(fixture));
  const rows = [];
  const panels = [];
  for (let index = 0; index < acquired.length; index += 1) {
    const item = acquired[index];
    const panel = await renderFixture(item);
    const panelPath = path.join(panelsRoot, `${String(index + 1).padStart(2, "0")}-${item.plan.route.toLowerCase()}.png`);
    await fs.promises.writeFile(panelPath, panel);
    const metadata = await sharp(panelPath).metadata();
    assert(metadata.width === width && metadata.height === height, `panel-dimensions:${item.fixture.id}`);
    panels.push(panel);
    rows.push({
      id: item.fixture.id,
      genre: item.fixture.genre,
      status: "PASS",
      query: item.fixture.query,
      route: item.plan.route,
      planSha256: item.plan.planSha256,
      searchedProviderSummary: item.search.providers,
      searchFailures: item.search.failures,
      attempts: item.attempts,
      acceptedSources: item.accepted.map((candidate) => ({title: candidate.title, sourceUrl: candidate.sourceUrl, imageUrl: candidate.imageUrl, license: candidate.license, licenseUrl: candidate.licenseUrl || null, localPath: path.relative(root, candidate.localPath), sha256: candidate.sha256, perceptualHash: candidate.pixelReview.perceptualHash, pixelReviewStatus: candidate.pixelReview.status})),
      artifact: {path: path.relative(root, panelPath), sha256: fileSha256(panelPath), width, height},
      productionAdmission: false,
    });
  }
  await sharp({create: {width, height: height * panels.length, channels: 4, background: "#050708"}}).composite(panels.map((input, index) => ({input, left: 0, top: index * height}))).png().toFile(contactSheetPath);
  const finalAuthority = authoritySnapshot();
  assert(JSON.stringify(initialAuthority) === JSON.stringify(finalAuthority), "formal-authority-mutated-during-live-canary");
  const report = {
    contract: "A1LiveExternalSourcePackagingCanary/v1",
    status: rows.length === fixtures.length && rows.every((row) => row.status === "PASS") ? "PASS" : "FAIL",
    fixtures: rows,
    visibleArtifact: {path: path.relative(root, contactSheetPath), sha256: fileSha256(contactSheetPath), width, height: height * panels.length},
    boundary: {reviewOnly: true, workspaceMutationPerformed: false, storyboardMutationPerformed: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED", authorityUnchanged: true, authoritySnapshot: finalAuthority},
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({status: report.status, fixtures: rows.map((row) => ({id: row.id, route: row.route, acceptedCount: row.acceptedSources.length, artifact: row.artifact})), visibleArtifact: report.visibleArtifact, boundary: report.boundary}, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}

await main();
