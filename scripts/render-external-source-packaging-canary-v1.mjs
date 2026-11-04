#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  EXTERNAL_SOURCE_PACKAGING_ROUTES,
  assertExternalSourcePackagingPlan,
  compileExternalSourcePackagingPlan,
} from "../apps/studio-next/src/lib/a1-external-source-packaging-router-v1.mjs";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const sourceRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/source-cache");
const pilotSourceRoot = path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1/sources");
const outputRoot = path.join(root, "work/external-source-packaging-router-v1");
const panelsRoot = path.join(outputRoot, "panels");
const resultPath = path.join(outputRoot, "result.json");
const baselinePath = path.join(outputRoot, "baseline.json");
const contactSheetPath = path.join(outputRoot, "contact-sheet.png");
const propFixturePath = path.join(outputRoot, "fixture-prop.png");
const subjectMattePath = path.join(outputRoot, "fixture-subject-matte.png");
const width = 960;
const height = 540;
const contentHeight = 480;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sourceBinding({id, file, sourceUri, license, fixtureOnly = false}) {
  return {
    id,
    assetUri: file,
    sha256: fileSha256(file),
    fixtureOnly,
    provenance: {sourceUri, license, reviewed: true},
  };
}

function pixelReview(overrides = {}) {
  return {
    contract: "A1MaterialCarrierPixelReview/v1",
    status: "PASS",
    entityCorrect: true,
    sceneContextCorrect: true,
    actionCarrierFit: true,
    carrierVisible: true,
    materialRegion: {x: 0.08, y: 0.08, width: 0.84, height: 0.82},
    featurePrintDigest: "review-only-canary",
    labels: [],
    ...overrides,
  };
}

function chromeSvg(route, title, footer) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="44" fill="#111719"/><rect width="10" height="44" fill="#c8ff32"/>
    <text x="28" y="29" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(route)}</text>
    <text x="930" y="28" text-anchor="end" fill="#8d9b9e" font-family="Arial, sans-serif" font-size="14">${escapeXml(title)}</text>
    <rect y="${contentHeight}" width="${width}" height="60" fill="#111719"/>
    <text x="24" y="515" fill="#c8ff32" font-family="Arial, sans-serif" font-size="14" font-weight="700">REVIEW ONLY</text>
    <text x="142" y="515" fill="#9eabad" font-family="Arial, sans-serif" font-size="13">${escapeXml(footer)}</text>
  </svg>`);
}

async function panelWithChrome(content, plan, title) {
  return sharp({create: {width, height, channels: 4, background: "#0b0f10"}})
    .composite([
      {input: content, left: 0, top: 44},
      {input: chromeSvg(plan.route, title, `source-bound · plan ${plan.planSha256.slice(0, 12)} · production admission false`), left: 0, top: 0},
    ])
    .png()
    .toBuffer();
}

async function renderEvidence(source, plan) {
  const sourceWidth = 570;
  const sourceHeight = 370;
  const bright = await sharp(source.assetUri).resize(sourceWidth, sourceHeight, {fit: "cover", position: "top"}).png().toBuffer();
  const dim = await sharp(bright).modulate({brightness: 0.52, saturation: 0.3}).png().toBuffer();
  const anchor = plan.pixelReviewBinding.anchor;
  const box = {
    left: Math.round(anchor.x * sourceWidth),
    top: Math.round(anchor.y * sourceHeight),
    width: Math.max(4, Math.round(anchor.width * sourceWidth)),
    height: Math.max(4, Math.round(anchor.height * sourceHeight)),
  };
  box.width = Math.min(box.width, sourceWidth - box.left);
  box.height = Math.min(box.height, sourceHeight - box.top);
  const focus = await sharp(bright).extract(box).png().toBuffer();
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    <rect width="${width}" height="${contentHeight}" fill="#0d1214"/>
    <rect x="28" y="28" width="${sourceWidth + 12}" height="${sourceHeight + 12}" fill="#f5f2e8"/>
    <rect x="34" y="34" width="${sourceWidth}" height="${sourceHeight}" fill="#222"/>
    <rect x="${34 + box.left}" y="${34 + box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#c8ff32" stroke-width="5"/>
    <rect x="${34 + box.left}" y="${34 + box.top + box.height - 10}" width="${box.width}" height="10" fill="#c8ff32" opacity="0.82"/>
    <text x="640" y="102" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="31" font-weight="700">SOURCE</text>
    <text x="640" y="138" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="31" font-weight="700">PIXELS</text>
    <text x="640" y="174" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="31" font-weight="700">STAY TRUE</text>
    <path d="M640 198 H902" stroke="#556265" stroke-width="2"/>
    <text x="640" y="236" fill="#c8ff32" font-family="Arial, sans-serif" font-size="16">01 · dim outside</text>
    <text x="640" y="270" fill="#c8ff32" font-family="Arial, sans-serif" font-size="16">02 · highlight verified range</text>
    <text x="640" y="304" fill="#c8ff32" font-family="Arial, sans-serif" font-size="16">03 · bind local editable copy</text>
    <text x="640" y="365" fill="#8d9b9e" font-family="Arial, sans-serif" font-size="14">no generated evidence pixels</text>
  </svg>`);
  const highlight = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    <rect x="${34 + box.left}" y="${34 + box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#c8ff32" stroke-width="5"/>
    <rect x="${34 + box.left}" y="${34 + box.top + box.height - 10}" width="${box.width}" height="10" fill="#c8ff32" opacity="0.82"/>
  </svg>`);
  const content = await sharp(overlay).composite([
    {input: dim, left: 34, top: 34},
    {input: focus, left: 34 + box.left, top: 34 + box.top},
    {input: highlight, left: 0, top: 0},
  ]).png().toBuffer();
  return panelWithChrome(content, plan, "verified evidence");
}

async function renderSubject(source, plan) {
  const portrait = await sharp(source.assetUri).resize(330, 330, {fit: "cover"}).png().toBuffer();
  const mask = fs.readFileSync(subjectMattePath);
  const isolated = await sharp(portrait).composite([{input: mask, blend: "dest-in"}]).png().toBuffer();
  const art = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    <rect width="${width}" height="${contentHeight}" fill="#0d1214"/>
    <circle cx="670" cy="232" r="178" fill="none" stroke="#c8ff32" stroke-width="4"/>
    <circle cx="670" cy="232" r="194" fill="none" stroke="#c8ff32" stroke-width="1" opacity="0.35"/>
    <text x="54" y="155" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="42" font-weight="700">VERIFIED SUBJECT</text>
    <text x="54" y="205" fill="#c8ff32" font-family="Arial, sans-serif" font-size="20">fixture matte proves the gate, not identity</text>
    <path d="M55 244 H430" stroke="#5b686b" stroke-width="2"/>
    <text x="54" y="286" fill="#9eabad" font-family="Arial, sans-serif" font-size="18">source identity + alpha matte</text>
    <text x="54" y="318" fill="#9eabad" font-family="Arial, sans-serif" font-size="18">must both be verified</text>
  </svg>`);
  const content = await sharp(art).composite([{input: isolated, left: 505, top: 67}]).png().toBuffer();
  return panelWithChrome(content, plan, "person / profile");
}

async function card(file, cardWidth, cardHeight, angle) {
  const image = await sharp(file).resize(cardWidth - 18, cardHeight - 18, {fit: "cover"}).extend({top: 9, bottom: 9, left: 9, right: 9, background: "#f4f0e4"}).png().toBuffer();
  return sharp(image).rotate(angle, {background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
}

async function renderArchive(sources, plan) {
  const cards = await Promise.all([
    card(sources[0].assetUri, 340, 300, -3),
    card(sources[1].assetUri, 340, 300, 2),
    card(sources[2].assetUri, 340, 300, 4),
  ]);
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    <rect width="${width}" height="${contentHeight}" fill="#d7d0bf"/>
    <path d="M0 72 H960 M0 220 H960 M0 368 H960" stroke="#b8af9c" stroke-width="1" opacity="0.55"/>
    <text x="44" y="425" fill="#111719" font-family="Arial, sans-serif" font-size="30" font-weight="700">ARCHIVE MATERIAL WALL</text>
    <text x="44" y="455" fill="#3e4749" font-family="Arial, sans-serif" font-size="15">each tile keeps its own source SHA · paper edge and rotation live in the presentation layer</text>
  </svg>`);
  const content = await sharp(base).composite([
    {input: cards[0], left: 35, top: 55},
    {input: cards[1], left: 310, top: 42},
    {input: cards[2], left: 585, top: 66},
  ]).png().toBuffer();
  return panelWithChrome(content, plan, "multi-source archive");
}

async function renderPrint(source, plan) {
  const print = await sharp(source.assetUri).resize(width, contentHeight, {fit: "cover"}).grayscale().tint({r: 235, g: 224, b: 194}).linear(1.08, -12).png().toBuffer();
  const lines = Array.from({length: 34}, (_, index) => `<path d="M0 ${index * 14} H960" stroke="#111719" stroke-width="1" opacity="${index % 3 === 0 ? 0.13 : 0.05}"/>`).join("");
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    ${lines}<rect x="18" y="18" width="924" height="444" fill="none" stroke="#111719" stroke-width="5" stroke-dasharray="18 7 3 11" opacity="0.65"/>
    <rect x="52" y="310" width="620" height="108" fill="#111719" opacity="0.88"/>
    <text x="78" y="360" fill="#c8ff32" font-family="Arial, sans-serif" font-size="38" font-weight="700">DISTRESSED PRINT LAYER</text>
    <text x="78" y="394" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="16">wear is bounded · original source remains separately hash-bound</text>
  </svg>`);
  return panelWithChrome(await sharp(print).composite([{input: overlay}]).png().toBuffer(), plan, "printed artifact");
}

async function renderProp(source, plan) {
  const transformed = await sharp(source.assetUri)
    .affine([[1, 0.18], [-0.05, 1]], {background: {r: 0, g: 0, b: 0, alpha: 0}})
    .rotate(-5, {background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toBuffer();
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${contentHeight}">
    <rect width="${width}" height="${contentHeight}" fill="#121719"/>
    <ellipse cx="650" cy="392" rx="250" ry="34" fill="#000" opacity="0.45"/>
    <text x="52" y="150" fill="#f5f4ec" font-family="Arial, sans-serif" font-size="42" font-weight="700">COPY FOLLOWS</text>
    <text x="52" y="198" fill="#c8ff32" font-family="Arial, sans-serif" font-size="42" font-weight="700">THE OBJECT PLANE</text>
    <text x="52" y="250" fill="#89979a" font-family="Arial, sans-serif" font-size="18">verified ROI → bounded transform → local editable type</text>
  </svg>`);
  return panelWithChrome(await sharp(base).composite([{input: transformed, left: 430, top: 72}]).png().toBuffer(), plan, "physical prop fixture");
}

async function createPropFixture() {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="430" height="270">
    <rect width="430" height="270" rx="8" fill="#eee5ce"/><rect x="18" y="18" width="394" height="234" fill="none" stroke="#222" stroke-width="3"/>
    <text x="42" y="62" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#222">TEST PROP · REVIEW ONLY</text>
    <path d="M42 88 H388 M42 122 H388 M42 156 H388 M42 190 H388" stroke="#6d6658" stroke-width="2"/>
    <text x="48" y="116" font-family="monospace" font-size="17" fill="#222">SOURCE ROI BOUND</text>
    <text x="48" y="184" font-family="monospace" font-size="17" fill="#222">NOT FACTUAL EVIDENCE</text>
    <text x="48" y="228" font-family="monospace" font-size="28" font-weight="700" fill="#153aa7">$ 1,280</text>
  </svg>`);
  await sharp(svg).png().toFile(propFixturePath);
  const matte = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="330" height="330"><circle cx="165" cy="165" r="158" fill="white"/></svg>`);
  await sharp(matte).png().toFile(subjectMattePath);
}

async function main() {
  fs.mkdirSync(panelsRoot, {recursive: true});
  await createPropFixture();
  const files = {
    paper: path.join(sourceRoot, "acl-2026-more-aligned-less-diverse-first-page.png"),
    portrait: path.join(pilotSourceRoot, "dmitry-kobak-official-portrait.webp"),
    screen: path.join(sourceRoot, "real-writing-workbench-main.png"),
    presenter: path.join(sourceRoot, "presenter-opening-frame.jpg"),
    prop: propFixturePath,
  };
  for (const file of Object.values(files)) assert(fs.existsSync(file), `source-missing:${file}`);

  const sources = {
    paper: sourceBinding({id: "verified-paper", file: files.paper, sourceUri: "https://aclanthology.org/", license: "primary research contextual review use"}),
    portrait: sourceBinding({id: "verified-profile", file: files.portrait, sourceUri: "https://kobak.net/", license: "official profile contextual review use"}),
    screen: sourceBinding({id: "verified-product-screen", file: files.screen, sourceUri: "local://verified-product-capture", license: "user-owned local product capture"}),
    presenter: sourceBinding({id: "verified-presenter-frame", file: files.presenter, sourceUri: "local://verified-presenter-frame", license: "user-owned presenter footage frame"}),
    prop: sourceBinding({id: "fixture-prop", file: files.prop, sourceUri: "fixture://physical-prop", license: "test-only fixture", fixtureOnly: true}),
  };

  const fixtures = [
    {
      id: "blind-source-a", genre: "evidence-explainer", title: "document evidence",
      input: {mediaRole: "DOCUMENT_EVIDENCE", source: sources.paper, requirement: {role: "evidence", effectBinding: {targetType: "source-text-range", semanticAction: "mark"}}, pixelReview: pixelReview({rangeRoi: {x: 0.16, y: 0.22, width: 0.66, height: 0.2}})},
      render: (plan) => renderEvidence(sources.paper, plan),
    },
    {
      id: "blind-source-b", genre: "profile-commentary", title: "verified subject",
      input: {mediaRole: "PERSON_SUBJECT", source: sources.portrait, requirement: {role: "evidence", requiredEntity: "Verified subject", effectBinding: {targetType: "material-region", semanticAction: "reveal"}}, pixelReview: pixelReview({labels: [{id: "people", confidence: 0.95}]}), identityVerified: true, sourceClean: true, subjectMatte: {status: "PASS", alphaSafe: true, sourceSha256: sources.portrait.sha256, matteSha256: fileSha256(subjectMattePath), fixtureOnly: true}},
      render: (plan) => renderSubject(sources.portrait, plan),
    },
    {
      id: "blind-source-c", genre: "documentary-archive", title: "archive material wall",
      input: {mediaRole: "ARCHIVE_SET", sources: [sources.paper, sources.screen, sources.presenter], requirement: {role: "context", effectBinding: {targetType: "material-region", semanticAction: "reveal"}}, pixelReview: pixelReview()},
      render: (plan) => renderArchive([sources.paper, sources.screen, sources.presenter], plan),
    },
    {
      id: "blind-source-d", genre: "culture-commentary", title: "distressed print",
      input: {mediaRole: "PRINT_ARTIFACT", source: sources.presenter, requirement: {role: "context", effectBinding: {targetType: "material-region", semanticAction: "hold"}}, pixelReview: pixelReview()},
      render: (plan) => renderPrint(sources.presenter, plan),
    },
    {
      id: "blind-source-e", genre: "object-process", title: "prop perspective",
      input: {mediaRole: "PHYSICAL_PROP", source: sources.prop, requirement: {role: "object", effectBinding: {targetType: "object-roi", semanticAction: "append"}}, pixelReview: pixelReview({objectRoi: {x: 0.12, y: 0.12, width: 0.76, height: 0.72}})},
      render: (plan) => renderProp(sources.prop, plan),
    },
  ];

  const rows = [];
  const panelBuffers = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const plan = compileExternalSourcePackagingPlan(fixture.input);
    assertExternalSourcePackagingPlan(plan);
    const panel = await fixture.render(plan);
    const panelPath = path.join(panelsRoot, `${String(index + 1).padStart(2, "0")}-${plan.route.toLowerCase()}.png`);
    await fs.promises.writeFile(panelPath, panel);
    const metadata = await sharp(panelPath).metadata();
    assert(metadata.width === width && metadata.height === height, `panel-dimensions:${fixture.id}`);
    panelBuffers.push(panel);
    rows.push({
      id: fixture.id,
      genre: fixture.genre,
      status: "PASS",
      route: plan.route,
      planSha256: plan.planSha256,
      sourceSha256: plan.sourceBindings.map((source) => source.sha256),
      artifact: {path: path.relative(root, panelPath), sha256: fileSha256(panelPath), width, height},
      productionAdmission: false,
    });
  }

  await sharp({create: {width, height: height * panelBuffers.length, channels: 4, background: "#050708"}})
    .composite(panelBuffers.map((input, index) => ({input, left: 0, top: index * height})))
    .png()
    .toFile(contactSheetPath);
  const contactMetadata = await sharp(contactSheetPath).metadata();
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const hotPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
  const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
  const hotPhase = JSON.parse(fs.readFileSync(hotPhasePath, "utf8"));
  const authoritySnapshot = {
    workspaceIdentitySha256: hotPhase.authority?.workspaceSha256 || null,
    workspaceFileSha256: fileSha256(workspacePath),
    systemLinePhaseFileSha256: fileSha256(hotPhasePath),
    phaseStatus: hotPhase.status || null,
  };
  assert(JSON.stringify(authoritySnapshot) === JSON.stringify(baseline.authoritySnapshot), "formal-authority-mutated-during-canary");
  const report = {
    contract: "A1ExternalSourcePackagingCanary/v1",
    status: rows.length === 5 && new Set(rows.map((row) => row.route)).size === 5 ? "PASS" : "FAIL",
    fixtures: rows,
    visibleArtifact: {path: path.relative(root, contactSheetPath), sha256: fileSha256(contactSheetPath), width: contactMetadata.width, height: contactMetadata.height},
    boundary: {reviewOnly: true, workspaceMutationPerformed: false, storyboardMutationPerformed: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED", authorityUnchanged: true, authoritySnapshot},
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}

await main();
