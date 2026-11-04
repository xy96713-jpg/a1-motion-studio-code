#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/local-foundations-v1";
const outputRoot = path.join(publicRoot, outputRelative);
const requestedStage = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1] || "all";
const requestedAsset = process.argv.find((arg) => arg.startsWith("--asset="))?.split("=")[1] || null;
const stageIds = requestedStage === "all" ? ["background-foundry", "element-atlas", "key-backgrounds"] : [requestedStage];
if (stageIds.some((id) => !["background-foundry", "element-atlas", "key-backgrounds"].includes(id))) throw new Error("local-foundation-stage-invalid");
fs.mkdirSync(outputRoot, {recursive: true});
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const esc = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

const palette = {paper: "#e7dfcf", paper2: "#f2ecdf", ink: "#111315", charcoal: "#17191a", cobalt: "#214fd3", oxblood: "#6f171d", graphite: "#76726a", acid: "#c9ef39"};
const paperFilter = `<filter id="paper" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".62 .34" numOctaves="4" seed="17" result="n"/><feColorMatrix in="n" values=".25 0 0 0 .58 0 .22 0 0 .55 0 0 .18 0 .48 0 0 0 .15 0" result="t"/><feBlend in="SourceGraphic" in2="t" mode="multiply"/></filter>`;
const inkFilter = `<filter id="ink" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".025 .17" numOctaves="3" seed="29" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="B"/><feGaussianBlur stdDeviation=".35"/></filter>`;
const grain = `<filter id="grain" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence baseFrequency=".85" numOctaves="3" seed="41" result="g"/><feColorMatrix in="g" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .09 0"/><feBlend in="SourceGraphic" mode="overlay"/></filter>`;

function baseSvg(content, background = palette.paper2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs>${paperFilter}${inkFilter}${grain}</defs><rect width="1920" height="1080" fill="${background}" filter="url(#paper)"/>${content}<rect width="1920" height="1080" fill="transparent" filter="url(#grain)"/></svg>`;
}

function backgroundSvg(id) {
  if (id === "bg-warm-paper-dot") return baseSvg(`
    <path d="M0 0H245L214 152 262 330 201 520 251 714 205 900 236 1080H0Z" fill="${palette.ink}" filter="url(#ink)"/>
    <path d="M225 0L282 1080" stroke="${palette.oxblood}" stroke-width="10" opacity=".88"/>
    <g fill="${palette.graphite}" opacity=".58">${Array.from({length: 88}, (_, i) => { const x = 330 + (i * 83) % 430; const y = 640 + (i * 47) % 310; const r = 2 + (i % 4); return `<circle cx="${x}" cy="${y}" r="${r}"/>`; }).join("")}</g>
    <path d="M320 866C480 822 603 840 744 805" fill="none" stroke="${palette.cobalt}" stroke-width="22" stroke-linecap="round" opacity=".72"/>
    <path d="M329 902C501 858 622 870 770 835" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-dasharray="5 18"/>
  `);
  if (id === "bg-cobalt-ink-field") return baseSvg(`
    <path d="M1145 -70C1300 38 1435 10 1560 62 1702 122 1870 80 1990 152V1046C1778 1008 1642 1085 1451 1029 1310 988 1211 1054 1092 1010 1160 854 1080 738 1140 584 1198 431 1090 278 1145 -70Z" fill="${palette.cobalt}" filter="url(#ink)"/>
    <g stroke="#e9dfcd" opacity=".28">${Array.from({length: 34}, (_, i) => `<path d="M${1210 + i * 24} 20C${1160 + i * 26} 330 ${1290 + i * 18} 720 ${1180 + i * 26} 1060" stroke-width="${2 + i % 5}"/>`).join("")}</g>
    <path d="M0 925C352 881 548 974 824 932 991 907 1095 939 1225 904V1080H0Z" fill="${palette.ink}" filter="url(#ink)"/>
    <path d="M100 905C421 859 605 948 835 912" stroke="${palette.oxblood}" stroke-width="9" fill="none"/>
  `);
  if (id === "bg-charcoal-verdict") return baseSvg(`
    <path d="M-60 -30H1432L1369 136 1420 286 1358 472 1412 628 1340 802 1398 1110H-60Z" fill="${palette.charcoal}" filter="url(#ink)"/>
    <path d="M1320 -20L1411 0 1344 190 1427 353 1333 560 1414 735 1327 914 1400 1100 1268 1100 1304 895 1238 720 1317 520 1251 334 1326 168Z" fill="${palette.paper2}"/>
    <path d="M1297 -10L1342 183 1280 335 1352 528 1270 716 1345 900 1305 1090" fill="none" stroke="${palette.oxblood}" stroke-width="13" opacity=".9"/>
    <path d="M115 889L894 889" stroke="${palette.paper2}" stroke-width="7" stroke-dasharray="92 31" opacity=".72"/>
  `, palette.charcoal);
  if (id === "bg-halftone-cream") return baseSvg(`
    <path d="M-80 730C188 664 371 706 566 646 743 592 886 638 1028 580L1067 1110H-80Z" fill="${palette.ink}" filter="url(#ink)"/>
    <g fill="${palette.ink}" opacity=".68">${Array.from({length: 300}, (_, i) => { const col = i % 30; const row = Math.floor(i / 30); const x = 90 + col * 31; const y = 175 + row * 32; const r = Math.max(1.1, 5.8 - col * .13 - row * .15); return `<circle cx="${x}" cy="${y}" r="${r}"/>`; }).join("")}</g>
    <path d="M1001 565C1190 509 1315 554 1453 494" fill="none" stroke="${palette.cobalt}" stroke-width="34" stroke-linecap="round" opacity=".88"/>
    <path d="M1042 622C1226 568 1358 607 1510 548" fill="none" stroke="${palette.oxblood}" stroke-width="7" stroke-linecap="round"/>
  `);
  if (id === "bg-archive-ruling") return baseSvg(`
    <path d="M-40 -20H318L350 1090H-40Z" fill="${palette.ink}" filter="url(#ink)"/>
    <path d="M267 -15L632 18 596 1090 318 1090Z" fill="${palette.cobalt}" filter="url(#paper)"/>
    <path d="M560 -20L790 0 831 1080 595 1080Z" fill="#c7bfaf" filter="url(#paper)"/>
    <path d="M748 -10L995 14 947 1084 821 1084Z" fill="${palette.oxblood}" filter="url(#paper)"/>
    <path d="M940 -20L1128 8 1092 1086 948 1086Z" fill="${palette.ink}" filter="url(#ink)"/>
    <g fill="${palette.paper2}"><circle cx="394" cy="180" r="13"/><circle cx="407" cy="540" r="13"/><circle cx="421" cy="895" r="13"/></g>
    <path d="M1110 128L1885 128" stroke="${palette.ink}" stroke-width="5"/><path d="M1190 940L1806 940" stroke="${palette.cobalt}" stroke-width="12"/>
  `);
  return baseSvg(`
    <path d="M92 698C327 651 516 708 703 654 838 615 972 653 1087 611L1184 891C971 925 778 874 602 929 422 985 239 944 70 994Z" fill="${palette.ink}" filter="url(#ink)"/>
    <path d="M335 742C522 689 705 748 889 701L954 826C752 865 584 806 397 857Z" fill="${palette.oxblood}" filter="url(#ink)"/>
    <path d="M402 705L884 865" stroke="#ead2b2" stroke-width="34" opacity=".58"/>
    <path d="M470 687C601 773 733 739 866 824" fill="none" stroke="${palette.paper2}" stroke-width="15" stroke-dasharray="70 18"/>
    <path d="M121 647C353 601 507 636 696 590" fill="none" stroke="${palette.cobalt}" stroke-width="9"/>
  `);
}

function modelMaterialFieldSvg() {
  const dots = Array.from({length: 240}, (_, index) => {
    const column = index % 24;
    const row = Math.floor(index / 24);
    const x = 1110 + column * 34;
    const y = 98 + row * 34;
    const radius = 2 + ((column + row) % 3);
    return `<rect x="${x}" y="${y}" width="${radius * 2}" height="${radius * 2}" fill="${palette.paper2}" opacity="${.18 + (column % 4) * .05}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>${paperFilter}${inkFilter}${grain}<clipPath id="field-cut"><path d="M-80 746C238 624 526 703 806 566 1088 428 1361 479 2008 142V1120H-80Z"/></clipPath></defs>
    <rect width="1920" height="1080" fill="${palette.charcoal}"/>
    <path d="M-90 650C238 544 492 592 785 458 1118 307 1440 348 2010 45V1110H-90Z" fill="${palette.cobalt}" filter="url(#ink)"/>
    <path d="M-110 817C259 682 559 752 849 617 1141 481 1438 527 2026 229L1998 533C1458 747 1204 708 909 847 603 991 322 918 -105 1068Z" fill="${palette.paper2}" filter="url(#paper)"/>
    <path d="M-60 858C273 754 564 818 873 684 1216 535 1518 578 1987 345" fill="none" stroke="${palette.ink}" stroke-width="16" stroke-dasharray="82 28" opacity=".78"/>
    <g clip-path="url(#field-cut)">${dots}</g>
    <path d="M115 174H625" stroke="${palette.acid}" stroke-width="24"/>
    <path d="M114 221H414" stroke="${palette.paper2}" stroke-width="5" stroke-dasharray="20 18" opacity=".72"/>
    <path d="M1550 760L1804 760M1677 633L1677 887" stroke="${palette.oxblood}" stroke-width="18" opacity=".86"/>
    <path d="M0 0H250L218 152 266 337 205 516 257 698 211 884 244 1080H0Z" fill="${palette.ink}" opacity=".88" filter="url(#ink)"/>
    <rect width="1920" height="1080" fill="transparent" filter="url(#grain)"/>
  </svg>`;
}

function atlasSvg(id) {
  const color = id === "atlas-editor-marks" ? palette.oxblood : id === "atlas-evidence-connectors" ? palette.cobalt : palette.ink;
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = Math.floor(i / 4), x = col * 480 + 70, y = row * 360 + 55;
    const w = 340, h = 250;
    const marks = [
      `<ellipse cx="${x + 170}" cy="${y + 125}" rx="140" ry="83" fill="none" stroke="${color}" stroke-width="15" stroke-dasharray="510 22" transform="rotate(-5 ${x + 170} ${y + 125})"/>`,
      `<path d="M${x + 24} ${y + 160}C${x + 120} ${y + 90} ${x + 230} ${y + 200} ${x + 324} ${y + 102}" stroke="${color}" stroke-width="20" fill="none" stroke-linecap="round"/>`,
      `<path d="M${x + 45} ${y + 52}L${x + 292} ${y + 198}M${x + 286} ${y + 48}L${x + 56} ${y + 211}" stroke="${color}" stroke-width="18" stroke-linecap="round"/>`,
      `<path d="M${x + 28} ${y + 65}H${x + 296}V${y + 204}H${x + 28}Z" fill="none" stroke="${color}" stroke-width="12" stroke-dasharray="42 18"/>`,
      `<path d="M${x + 38} ${y + 164}L${x + 212} ${y + 164}L${x + 302} ${y + 75}" stroke="${color}" stroke-width="19" fill="none"/><circle cx="${x + 302}" cy="${y + 75}" r="25" fill="none" stroke="${color}" stroke-width="12"/>`,
      `<path d="M${x + 35} ${y + 98}Q${x + 170} ${y + 12} ${x + 305} ${y + 112}Q${x + 170} ${y + 224} ${x + 35} ${y + 98}Z" fill="${color}" opacity=".82"/>`,
      `<path d="M${x + 30} ${y + 75}C${x + 100} ${y + 10} ${x + 240} ${y + 18} ${x + 312} ${y + 88}L${x + 276} ${y + 215}C${x + 180} ${y + 172} ${x + 90} ${y + 238} ${x + 34} ${y + 176}Z" fill="${palette.paper}" stroke="${color}" stroke-width="10"/>`,
      `<g fill="${color}">${Array.from({length: 36}, (_, n) => `<circle cx="${x + 38 + n % 9 * 34}" cy="${y + 54 + Math.floor(n / 9) * 48}" r="${3 + n % 4}"/>`).join("")}</g>`,
      `<path d="M${x + 30} ${y + 202}L${x + 310} ${y + 44}" stroke="${color}" stroke-width="45" stroke-linecap="square"/><path d="M${x + 58} ${y + 204}L${x + 332} ${y + 62}" stroke="${palette.paper2}" stroke-width="7" stroke-dasharray="25 14"/>`,
      `<path d="M${x + 75} ${y + 28}L${x + 284} ${y + 58}L${x + 264} ${y + 224}L${x + 54} ${y + 194}Z" fill="#d6bd8c" opacity=".8" stroke="${color}" stroke-width="6"/>`,
      `<path d="M${x + 35} ${y + 123}H${x + 294}" stroke="${color}" stroke-width="16"/><path d="M${x + 248} ${y + 69}L${x + 310} ${y + 123}L${x + 248} ${y + 177}" fill="none" stroke="${color}" stroke-width="16"/>`,
      `<path d="M${x + 45} ${y + 55}H${x + 298}V${y + 205}H${x + 45}Z" fill="none" stroke="${color}" stroke-width="9"/><path d="M${x + 45} ${y + 98}H${x + 298}M${x + 122} ${y + 55}V${y + 205}" stroke="${color}" stroke-width="9"/>`,
    ];
    cells.push(`<g>${marks[i]}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs>${inkFilter}</defs>${cells.join("")}</svg>`;
}

async function renderSvg(svg, output) {
  await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toFile(output);
}

async function keyBackground(id, sources, output) {
  const wide = path.join(root, "remotion-renderer/public/creator-material-pixel-type-v1/plates/creator-desk-wide.png");
  const close = path.join(root, "remotion-renderer/public/creator-material-pixel-type-v1/plates/creator-desk-close.png");
  const sourceById = new Map(sources.map((asset) => [asset.id, path.join(publicRoot, asset.assetUri.replace(/^\/+/, ""))]));
  const workbench = sourceById.get("source-documentary-workbench-overview");
  const selection = sourceById.get("source-documentary-selection-action");
  const article = sourceById.get("source-documentary-document-surface");
  const presenter = sourceById.get("source-presenter-closing-frame");
  const resolve = sourceById.get("source-resolve-resolve-timeline-full");
  const base = await sharp(id === "key-bg-human-final-pass" ? presenter : id === "key-bg-revision-layers" ? close : wide).resize(1920, 1080, {fit: "cover"}).modulate({saturation: .82, brightness: .92}).toBuffer();
  const overlays = [];
  if (id === "key-bg-desk-question") {
    const screen = await sharp(workbench).resize(950, 585, {fit: "cover", position: "attention"}).modulate({saturation: .72, brightness: .82}).toBuffer();
    overlays.push({input: screen, left: 214, top: 70});
  } else if (id === "key-bg-model-material-table") {
    const screen = await sharp(resolve).resize(1000, 610, {fit: "cover", position: "attention"}).modulate({saturation: .68, brightness: .8}).toBuffer();
    overlays.push({input: screen, left: 205, top: 70});
  } else if (id === "key-bg-revision-layers") {
    const screen = await sharp(selection).resize(1000, 610, {fit: "cover", position: "attention"}).modulate({saturation: .72, brightness: .82}).toBuffer();
    overlays.push({input: screen, left: 680, top: 80});
  }
  const material = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><defs>${grain}</defs><rect width="1920" height="1080" fill="transparent" filter="url(#grain)"/>${id === "key-bg-human-final-pass" ? `<path d="M1502 -20H1950V1100H1588L1544 914 1602 728 1532 542 1591 352 1518 174Z" fill="${palette.ink}" opacity=".7"/><path d="M1538 64C1678 132 1760 70 1888 144" fill="none" stroke="${palette.oxblood}" stroke-width="11"/>` : `<path d="M42 1008C222 965 401 1015 584 970" fill="none" stroke="${id === "key-bg-revision-layers" ? palette.oxblood : palette.cobalt}" stroke-width="11"/>`}</svg>`);
  overlays.push({input: material, left: 0, top: 0});
  await sharp(base).composite(overlays).png({compressionLevel: 9}).toFile(output);
}

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceAssets = workspace.library.assets.filter((asset) => asset.review.status === "approved" && asset.assetUri && ["verified-real-source", "network-source"].includes(asset.route));
const generated = [];
for (const asset of workspace.library.assets.filter((item) => stageIds.includes(item.stageId) && item.route === "editorial-artwork" && (!requestedAsset || item.id === requestedAsset))) {
  const output = path.join(outputRoot, `${asset.id}.png`);
  if (asset.stageId === "background-foundry") await renderSvg(backgroundSvg(asset.id), output);
  else if (asset.stageId === "element-atlas") await renderSvg(atlasSvg(asset.id), output);
  else if (asset.id === "key-bg-model-material-table") await renderSvg(modelMaterialFieldSvg(), output);
  else await keyBackground(asset.id, sourceAssets, output);
  generated.push({assetId: asset.id, publicUrl: `/${outputRelative}/${asset.id}.png`, sha256: shaFile(output)});
}

const now = new Date().toISOString();
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  for (const output of generated) {
    const asset = next.library.assets.find((item) => item.id === output.assetId);
    if (!asset) continue;
    asset.revisionHistory ||= [];
    if (asset.assetUri && asset.sha256 && asset.sha256 !== output.sha256) asset.revisionHistory.push({assetUri: asset.assetUri, sha256: asset.sha256, visualCritic: asset.visualCritic || null, archivedAt: now, reason: "local-deterministic-fallback"});
    asset.assetUri = output.publicUrl;
    asset.sha256 = output.sha256;
    asset.preview = {kind: asset.stageId === "element-atlas" ? "element-atlas" : "image", publicUrl: output.publicUrl};
    if (asset.id === "key-bg-model-material-table") {
      asset.name = "多模型抽象材料场";
      asset.promptBrief = "非写实编辑包装场：像素网点、纸带、墨块和五次连续试写痕迹；禁止人物、桌面照片、屏幕和假拍摄现场。";
      asset.sourceRequirement = "只允许非写实抽象包装；不能包含人物、真实或虚构屏幕、写实桌面、品牌墙和事实文字。";
      asset.semanticRole = "nonphotoreal-editorial-material-field";
      asset.mediaBoundary = {
        contract: "A1AssetMediaBoundary/v1",
        allowedEditModes: ["full-package"],
        photorealistic: false,
        containsPresenter: false,
        containsScreen: false,
        containsReadableEvidence: false,
      };
      asset.provenance = {
        sourceType: "deterministic-nonphotoreal-editorial-surface",
        sourceUri: output.publicUrl,
        license: "project-local deterministic editorial surface",
        reviewed: false,
      };
    }
    asset.visualCritic = null;
    asset.status = "ready-for-review";
    if (asset.id !== "key-bg-model-material-table") asset.provenance = {...asset.provenance, sourceType: asset.stageId === "key-backgrounds" ? "approved-real-sources-plus-deterministic-local-composite" : "deterministic-local-reproducible", sourceUri: output.publicUrl, license: "project-local; source bindings remain traceable", reviewed: false};
    asset.review = {status: "pending", note: "订阅生图限额期间由本地确定性资产编译器生成；仍需像素级视觉门禁，不以生成成功代替通过。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  }
  next.production.maturityLoop.foundationReports ||= {};
  for (const stageId of stageIds) delete next.production.maturityLoop.foundationReports[stageId];
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = `criticize-local-foundations:${stageIds.join(",")}`;
  next.production.generation.providerState = {provider: "codex-imagegen", status: "usage-limited", fallback: "deterministic-local-foundation-compiler", observedAt: now};
  const event = createProductionEvent({workspace: current, action: "local-foundation-assets-built", targetId: stageIds.join(","), payload: {generated}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return recalculated;
});

console.log(JSON.stringify({status: "PASS", stages: stageIds, generated, workspaceSha256: result.workspaceSha256}, null, 2));
