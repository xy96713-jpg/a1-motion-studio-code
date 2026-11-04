#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditGeneratedVisualSurfaceGraph} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const phaseRelative = "generated/system-line/editorial-asset-workbench-v1";
const require = createRequire(path.join(root, "package.json"));
const {chromium} = require("playwright");
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl || "").replace(/^\/+/, ""));
const fileUrl = (publicUrl) => pathToFileURL(publicFile(publicUrl)).href;
const shotArg = process.argv.find((item) => item.startsWith("--shot="))?.split("=")[1];
if (!shotArg) throw new Error("shot-candidate-render-shot-required");

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const shot = workspace.library.assets.find((asset) => (asset.id === shotArg || asset.shotDemand?.shotId === shotArg) && asset.route === "shot-composition");
if (!shot?.candidates?.length) throw new Error(`shot-candidates-not-ready:${shotArg}`);
const assetById = new Map(workspace.library.assets.map((asset) => [asset.id, asset]));
const outputRelative = `${phaseRelative}/shot-candidates/${shot.shotDemand.shotId}`;
const outputDir = path.join(publicRoot, outputRelative);
fs.mkdirSync(outputDir, {recursive: true});

function imageForNode(node) {
  if (node.sourceFramePublicUrl) return node.sourceFramePublicUrl;
  const asset = assetById.get(node.assetId);
  if (!asset) return null;
  if (node.type === "generated-glyph-reference") {
    const selected = asset.typographySpec?.generatedCandidates?.find((item) => item.id === asset.selectedCandidateId);
    return selected?.cutoutPublicUrl || selected?.publicUrl || null;
  }
  return asset.assetUri || null;
}

function nodeMarkup(node, mode) {
  const g = node.geometry || {x: 0, y: 0, width: 1, height: 1};
  const pos = `left:${g.x * 100}%;top:${g.y * 100}%;width:${g.width * 100}%;height:${g.height * 100}%;z-index:${node.z || 0}`;
  // Review PNGs must keep typography fully readable. Foreground occlusion is
  // executed later from the same resolveFinishing/Motion IR plan; simulating a
  // matte in the still made intact Chinese look like a broken glitch.
  if (node.deliveryUsage === "preview-only") return "";
  if (node.type === "solid-surface") {
    const allowedSurfaceClasses = new Set([
      "plain-paper",
      "screen-context-stage",
      "screen-action-stage-ink",
      "screen-action-stage-cobalt",
      "screen-action-stage-vermillion",
    ]);
    const surfaceClass = allowedSurfaceClasses.has(node.surfaceTreatment) ? node.surfaceTreatment : "";
    return `<div class="node solid ${surfaceClass}" style="${pos}"></div>`;
  }
  if (node.type === "source-bound-research-scan") return `<div class="node research-scan-marker ${node.id || ""}" data-object-binding="${node.objectBinding || "real-research-paper"}" style="${pos}"></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "task-packet") return `<div class="node task-packet" data-object-binding="${node.objectBinding || "material-angle-preference-bundle"}" style="${pos}"><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "api-bridge") return `<div class="node api-bridge" data-object-binding="${node.objectBinding || "task-packet"}" style="${pos}"><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "negative-preference-cut") return `<div class="node negative-preference-cut" data-object-binding="${node.objectBinding || "word-actor-1"}" style="${pos}"><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "destination-thread") return `<div class="node destination-thread" data-object-binding="${node.objectBinding || "word-actor-2"}" style="${pos}"><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "duty-material-stack") return `<div class="node duty-material-stack" data-object-binding="${node.objectBinding || "real-document-material-sections"}" style="${pos}"><span></span><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "duty-spine") return `<div class="node duty-spine" data-object-binding="${node.objectBinding || "duty-material-stack"}" style="${pos}"><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "duty-proof-stamp") return `<div class="node duty-proof-stamp" data-object-binding="${node.objectBinding || "primary"}" style="${pos}">CHECK</div>`;
  if (node.type === "editorial-ink-surface" && String(node.id || "").startsWith("archive-slot-")) return `<div class="node archive-slot ${node.id}" data-object-binding="${node.objectBinding || "source-document-history-separation"}" style="${pos}"><b>0${node.id.at(-1)}</b><span></span><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "retained-selection-boundary") return `<div class="node retained-selection-boundary" data-object-binding="${node.objectBinding || "word-actor-2"}" style="${pos}"><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "local-revision-window") return `<div class="node local-revision-window" data-object-binding="${node.objectBinding || "primary"}" style="${pos}"><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "reading-central-void") return `<div class="node reading-central-void" data-object-binding="${node.objectBinding || "competing-main-points"}" style="${pos}"></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "object-relay-pixel") return `<div class="node object-relay-pixel" data-object-binding="${node.objectBinding || "real-footage-object:microphone-arm-joint"}" style="${pos}"><span></span><span></span><span></span></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "object-relay-rail") return `<div class="node object-relay-rail" data-object-binding="${node.objectBinding || "real-footage-object:monitor-to-microphone-arm-to-desk"}" style="${pos}"><svg viewBox="0 0 960 540" preserveAspectRatio="none" aria-hidden="true"><path class="relay-monitor-shadow" d="M914 110H880V127H852"/><path class="relay-monitor-main" d="M914 110H880V127H852"/><path class="relay-mic-shadow" d="M287 327L254 344H222L188 365H152"/><path class="relay-mic-main" d="M287 327L254 344H222L188 365H152"/><rect class="relay-rail-lock" x="899" y="95" width="16" height="16"/><rect class="relay-rail-joint" x="246" y="336" width="16" height="16"/></svg></div>`;
  if (node.type === "editorial-ink-surface" && node.id === "proof-sheet-handoff-pixel") return `<div class="node proof-sheet-handoff-pixel" data-object-binding="${node.objectBinding || "proofing-sheet:eraser-debris-tail-to-next-shot"}" style="${pos}"></div>`;
  if (node.type === "editorial-ink-surface" && String(node.id || "").startsWith("reading-ink-strip-")) return `<div class="node reading-ink-strip ${node.id}" data-object-binding="${node.objectBinding || "real-document-paragraph-region"}" style="${pos}"></div>`;
  // Semantic scan points drive motion/handoff timing but are never decorative
  // pixels on a review frame.
  if (node.type === "semantic-scan-point") return "";
  if (node.type === "source-bound-pointer") return `<div class="node source-pointer" data-source-target="${String(node.interaction?.target || "real-source-target")}" style="${pos}"><span class="pointer-arrow"></span><span class="pointer-press-ring"></span></div>`;
  if (node.type === "editorial-correction-mark") {
    const pathKind = node.pathKind || "hand-drawn-ellipse-cross-close";
    const path = pathKind === "reading-cancel-black"
      ? `<path d="M4 69 C24 57 47 40 96 17"/><path d="M8 24 C36 35 57 55 93 77"/>`
      : pathKind === "reading-spine-blue"
        ? `<path d="M18 2 C7 24 34 37 24 56 C16 72 40 83 31 98"/>`
        : pathKind === "reading-cross-check-path"
          ? `<path d="M4 12 C18 5 27 17 35 28 C42 38 50 31 57 43 C64 55 75 47 84 59 C91 68 86 78 72 88"/>`
        : pathKind === "reading-branch-blue"
          ? `<path d="M2 64 C24 62 27 20 53 24 C75 27 79 60 98 45"/>`
      : pathKind === "reading-sentence-underline-blue"
        ? `<path d="M2 69 C24 73 46 57 66 64 C79 68 90 59 98 63"/>`
      : pathKind === "reading-handoff-open-arc"
        ? `<path d="M3 18 C20 69 72 93 97 42"/>`
      : pathKind === "reading-handoff-red-arc"
        ? `<path d="M3 18 C20 69 72 93 97 42"/>`
      : pathKind === "reading-handoff-open-circle"
        ? `<path d="M82 78 C62 96 27 91 10 68 C-4 48 6 19 35 9 C62 0 91 15 95 43 C97 55 94 63 89 69"/>`
        : pathKind === "reading-loop-blue"
          ? `<path d="M92 61 C96 33 75 8 44 8 C16 8 3 29 8 56 C13 83 38 94 66 86 C79 82 88 73 92 61"/>`
          : `<path d="M93 69 C99 42 88 13 56 7 C25 1 5 19 6 51 C7 82 28 96 61 91 C80 88 90 80 93 69"/>`;
    return `<div class="node editorial-correction-mark ${pathKind}" data-object-binding="${node.objectBinding || "verdict-glyph"}" style="${pos}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${path}</svg></div>`;
  }
  if (node.type === "editable-text") {
    const font = assetById.get(node.fontAssetId);
    const family = font ? `font-${font.id}` : "A1Fallback";
    const shadow = node.visualMode === "editable-shadow";
    const typographyMaterialUrl = node.typographyMaterialCreativeInputOnly === true
      && node.typographyMaterialEvidenceUseAllowed === false
      && node.typographyMaterialPublicUrl
      && fs.existsSync(publicFile(node.typographyMaterialPublicUrl))
      ? node.typographyMaterialPublicUrl
      : null;
    const wordActor = String(node.id || "").startsWith("word-actor-");
    const textAlign = node.align === "right" ? "right" : node.align === "center" ? "center" : "left";
    const justifyContent = node.align === "right" ? "flex-end" : node.align === "center" ? "center" : "flex-start";
    const renderedJustifyContent = Array.isArray(node.splitVisualActors) && node.splitVisualActors.length > 0 ? "space-between" : justifyContent;
    const escapedText = String(node.text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    const dataText = escapedText.replaceAll('"', "&quot;");
    const renderedText = Array.isArray(node.splitVisualActors) && node.splitVisualActors.length > 0
      ? node.splitVisualActors.map((actor, index) => {
        const actorText = String(actor.text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
        const actorBinding = String(actor.objectBinding || node.objectBinding || "real-footage-object").replaceAll('"', "&quot;");
        const actorClass = String(actor.className || `split-actor-${index + 1}`).replace(/[^a-zA-Z0-9_-]/gu, "-");
        const characterPath = Array.isArray(actor.characterPath) ? actor.characterPath : null;
        if (characterPath && actor.pathMode === "flow") {
          const flowGlyphs = Array.from(String(actor.text || "")).map((glyph, glyphIndex) => {
            const escapedGlyph = glyph.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
            const pathPoint = characterPath[glyphIndex] || {};
            const glyphScale = Number(pathPoint.scale ?? 1);
            const glyphRotate = Number(pathPoint.rotate ?? 0);
            const glyphDy = Number(pathPoint.y ?? 0);
            const glyphDx = Number(pathPoint.x ?? 0);
            const glyphBinding = String(actor.glyphBindings?.[glyphIndex] || actorBinding).replaceAll('"', "&quot;");
            return `<span class="split-actor-glyph flow-path-glyph" data-object-binding="${glyphBinding}" style="--glyph-scale:${Number.isFinite(glyphScale) ? glyphScale : 1};--glyph-rotate:${Number.isFinite(glyphRotate) ? glyphRotate : 0}deg;--glyph-dy:${Number.isFinite(glyphDy) ? glyphDy : 0}em;--glyph-dx:${Number.isFinite(glyphDx) ? glyphDx : 0}em">${escapedGlyph}</span>`;
          }).join("");
          return `<span class="split-visual-actor ${actorClass} flow-path-actor" data-object-binding="${actorBinding}">${flowGlyphs}</span>`;
        }
        if (characterPath) {
          const pathGlyphs = Array.from(String(actor.text || "")).map((glyph, glyphIndex) => {
            const escapedGlyph = glyph.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
            const pathPoint = characterPath[glyphIndex] || {};
            const glyphScale = Number(pathPoint.scale ?? 1);
            const glyphRotate = Number(pathPoint.rotate ?? 0);
            const glyphX = Number(pathPoint.x ?? 0);
            const glyphY = Number(pathPoint.y ?? 0);
            const glyphBinding = String(actor.glyphBindings?.[glyphIndex] || actorBinding).replaceAll('"', "&quot;");
            return `<span class="split-actor-glyph path-glyph" data-object-binding="${glyphBinding}" style="left:${glyphX * 100}%;top:${glyphY * 100}%;--glyph-scale:${Number.isFinite(glyphScale) ? glyphScale : 1};--glyph-rotate:${Number.isFinite(glyphRotate) ? glyphRotate : 0}deg">${escapedGlyph}</span>`;
          }).join("");
          return `<span class="split-visual-actor ${actorClass} path-actor" data-object-binding="${actorBinding}">${pathGlyphs}</span>`;
        }
        const scaleSequence = Array.isArray(actor.characterScaleSequence) ? actor.characterScaleSequence : null;
        const renderedActorText = scaleSequence
          ? Array.from(String(actor.text || "")).map((glyph, glyphIndex) => {
            const escapedGlyph = glyph.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
            const scale = Number(scaleSequence[glyphIndex] ?? scaleSequence.at(-1) ?? 1);
            return `<span class="split-actor-glyph" style="--glyph-scale:${Number.isFinite(scale) ? scale : 1}">${escapedGlyph}</span>`;
          }).join("")
          : actorText;
        return `<span class="split-visual-actor ${actorClass}" data-object-binding="${actorBinding}">${renderedActorText}</span>`;
      }).join("")
      : escapedText.replaceAll("\n", "<br>");
    const materialStyle = typographyMaterialUrl
      ? `display:inline-flex!important;width:max-content;max-width:100%;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;background-image:url('${fileUrl(typographyMaterialUrl)}')!important;background-size:cover!important;background-position:74% 50%!important;background-repeat:no-repeat!important;background-color:#111315!important;padding:.02em .12em .04em!important;clip-path:polygon(0 12%,88% 0,100% 20%,96% 88%,14% 100%,0 78%)!important;text-shadow:2px 2px 0 #111315,5px 5px 0 rgba(49,86,239,.72),0 10px 24px rgba(0,0,0,.48);`
      : "";
    const materialAttribute = node.typographyMaterialAssetId ? ` data-typography-material="${node.typographyMaterialAssetId}"` : "";
    return `<div class="node type ${node.id || ""} ${shadow ? "editable-shadow" : ""} ${wordActor ? "word-actor" : ""} ${node.tone === "light" ? "tone-light" : ""} ${node.typeTreatment || ""} surface-${node.surfaceTreatment || "none"} palette-${node.paletteRole || "none"}" data-text="${dataText}"${materialAttribute} style="${pos};height:${g.height * 100}%!important;font-family:${family};font-size:${Math.round(Number(node.fontSize || 96) / 2)}px;line-height:${node.lineHeight || 1};text-align:${textAlign};justify-content:${renderedJustifyContent};${materialStyle}">${renderedText}</div>`;
  }
  const image = imageForNode(node);
  if (!image || !fs.existsSync(publicFile(image))) return "";
  const src = fileUrl(image);
  if (node.type === "source-bound-operation-stage") {
    const focus = node.evidenceFocusRegion || {x: 0, y: 0, width: 1, height: 1};
    const fullContext = node.screenReviewFit === "full-context";
    const focusOrigin = fullContext ? "center" : node.focalPoint || `${(focus.x + focus.width / 2) * 100}% ${(focus.y + focus.height / 2) * 100}%`;
    const aspectScale = fullContext ? 1 : Math.min(2.4, 1 / Math.max(.01, Number(focus.width || 1)));
    const focusStyle = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${focusOrigin};transform:scale(${aspectScale});transform-origin:${focusOrigin}`;
    const clip = node.clipPathPolygon ? `;clip-path:${node.clipPathPolygon}` : "";
    return `<div class="node operation-stage" data-operation-beat="${node.evidenceBeat || ""}" style="${pos}${clip}"><img src="${src}" style="${focusStyle}"></div>`;
  }
  if (node.type === "source-bound-foreground-occluder") return `<div class="node foreground-occluder" style="${pos};clip-path:${node.clipPathPolygon}"><img src="${src}" style="object-position:${node.focalPoint || "center"};transform:scale(${Number(node.mediaScale || 1)});transform-origin:${node.focalPoint || "center"}"></div>`;
  if (node.type === "source-bound-focus-region") return `<div class="node focus-ring" style="${pos}"></div>`;
  if (node.type === "atlas-cell-reference") {
    const cell = Number(node.atlasCell || 0) % 12;
    const column = cell % 4;
    const row = Math.floor(cell / 4);
    return `<div class="node atlas-cell" style="${pos}"><img src="${src}" style="width:400%;height:300%;left:${-column * 100}%;top:${-row * 100}%"></div>`;
  }
  if (node.id === "evidence-band" && node.evidenceFocusRegion) {
    const focus = node.evidenceFocusRegion;
    const focusOrigin = node.focalPoint || `${(focus.x + focus.width / 2) * 100}% ${(focus.y + focus.height / 2) * 100}%`;
    const edgeClass = `evidence-edge-${node.evidenceEdge || "right"}`;
    return `<div class="node evidence-band ${edgeClass}" style="${pos}"><img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${focusOrigin};transform:scale(${Math.max(1, Number(node.mediaScale || 1))});transform-origin:${focusOrigin}"></div>`;
  }
  if (["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(node.type) && node.evidenceFocusRegion) {
    const focus = node.evidenceFocusRegion;
    const focusOrigin = node.focalPoint || `${(focus.x + focus.width / 2) * 100}% ${(focus.y + focus.height / 2) * 100}%`;
    const treatmentClass = node.presentationTreatment === "monitor-inset" ? " monitor-inset" : "";
    return `<div class="node preference-source-surface source-bound-closeup${treatmentClass}" style="${pos};${node.clipPathPolygon ? `clip-path:${node.clipPathPolygon}` : ""}"><img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${focusOrigin};transform:scale(${Math.max(1, Number(node.mediaScale || 1))});transform-origin:${focusOrigin}"></div>`;
  }
  const className = node.type === "generated-glyph-reference" ? `generated-glyph ${node.tone === "light" ? "tone-light" : ""}` : node.type === "source-bound-entity-imprint" ? `entity-imprint ${node.tone === "light" ? "tone-light" : ""} ${node.entityLightTreatment === "preserve" ? "preserve-light" : ""}` : ["source-bound-preference-surface", "source-bound-presenter-operation-surface"].includes(node.type) ? "preference-source-surface" : node.type === "editorial-anchor-surface" ? `editorial-anchor-surface ${node.sceneFamily || ""}` : node.id === "primary" ? `primary ${mode} ${node.sourceMask || ""}` : node.id === "supporting-evidence" ? "supporting-evidence" : node.id === "evidence-band" ? "evidence-band" : "asset";
  const imageStyle = `object-fit:${node.crop === "contain" ? "contain" : "cover"};object-position:${node.focalPoint || "center"};transform:scale(${Number(node.mediaScale || 1)});transform-origin:${node.focalPoint || "center"}`;
  const surfaceStyle = node.type === "editorial-anchor-surface"
    ? `;opacity:${Number(node.opacity ?? 1)};mix-blend-mode:${node.blendMode || "normal"};${node.filter ? `filter:${node.filter};` : ""}`
    : `${node.opacity != null ? `;opacity:${Number(node.opacity)};` : ""}${node.blendMode ? `;mix-blend-mode:${node.blendMode};` : ""}${node.filter ? `;filter:${node.filter};` : ""}`;
  return `<div class="node ${className} ${node.id || ""}" data-anchor-surface="${node.type === "editorial-anchor-surface" ? node.assetId || "" : ""}" style="${pos};${node.clipPathPolygon ? `clip-path:${node.clipPathPolygon}` : ""}${surfaceStyle}"><img src="${src}" style="${imageStyle}"></div>`;
}

const fontFaces = workspace.library.assets.filter((asset) => asset.route === "project-font" && asset.review.status === "approved" && asset.assetUri).map((asset) => `@font-face{font-family:font-${asset.id};src:url('${fileUrl(asset.assetUri)}')}`).join("\n");
const structuralCss = `.research-scan-marker{background:linear-gradient(90deg,rgba(215,255,69,.12),rgba(215,255,69,.82) 12%,rgba(215,255,69,.58) 88%,rgba(215,255,69,.08));border-left:3px solid #3156ef;mix-blend-mode:multiply;transform:rotate(-.35deg);box-shadow:0 1px 0 rgba(17,19,21,.2)}
.full-package.source-document .research-scan-word{align-items:center;overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;text-shadow:2px 2px 0 rgba(242,236,223,.94),4px 2px 0 rgba(49,86,239,.72)!important}
.full-package.source-document .research-scan-word.word-actor-1{font-family:font-type-pixel-correction!important;color:#3156ef!important;letter-spacing:.015em;text-shadow:1px 1px 0 #f2ecdf!important}
.full-package.source-document .research-scan-word.word-actor-2{color:#111315!important;background:#d7ff45;padding:.02em .1em .01em;clip-path:polygon(1% 12%,100% 0,97% 92%,0 100%);text-shadow:none!important}
.full-package.source-document .research-scan-word.word-actor-3{color:#111315!important;letter-spacing:-.085em;text-shadow:2px 2px 0 #f2ecdf,5px 2px 0 #3156ef!important}
.full-package.rhetorical-cross-examination .rhetorical-question-word{font-family:font-type-pixel-correction!important;color:#d7ff45!important;font-weight:820;letter-spacing:-.08em;text-shadow:3px 2px 0 #111315!important;overflow:visible;white-space:nowrap}
.full-package.rhetorical-cross-examination .rhetorical-question-word.word-actor-2{color:#3156ef!important;text-align:right;justify-content:flex-end;text-shadow:3px 2px 0 #f2ecdf!important}
.negative-preference-cut{overflow:visible;border-top:6px solid #8d2436;transform:rotate(-4deg)}
.negative-preference-cut:before,.negative-preference-cut:after{content:"";position:absolute;left:12%;top:-12px;width:54%;border-top:4px solid #f2ecdf;transform:rotate(7deg)}
.negative-preference-cut:after{left:37%;top:7px;width:43%;border-color:#8d2436;transform:rotate(-9deg)}
.negative-preference-cut span{position:absolute;right:4%;top:-10px;width:22px;height:22px;border:4px solid #8d2436;border-radius:50%}
.destination-thread{overflow:visible;border-top:5px solid #3156ef;transform:rotate(-1.5deg)}
.destination-thread:after{content:"";position:absolute;right:-2px;top:-12px;width:20px;height:20px;border:5px solid #3156ef;border-radius:50%;background:#f2ecdf}
.destination-thread span{position:absolute;left:34%;top:-9px;width:46px;height:13px;background:#d7ff45;transform:skewX(-18deg)}
.duty-material-stack{background:#eee5d4;clip-path:polygon(2% 1%,96% 5%,100% 94%,4% 100%);box-shadow:12px 14px 0 #3156ef,24px 27px 0 rgba(242,236,223,.34);border-top:7px solid #d7ff45}.duty-material-stack span{position:absolute;left:9%;height:4%;background:#111315}.duty-material-stack span:nth-child(1){top:18%;width:72%}.duty-material-stack span:nth-child(2){left:11%;top:37%;width:65%}.duty-material-stack span:nth-child(3){left:13%;top:57%;width:58%;height:7%;background:#8d2436}.duty-material-stack span:nth-child(4){left:15%;top:77%;width:51%}
.duty-spine{overflow:visible;border-left:6px solid #3156ef;border-bottom:6px solid #3156ef}.duty-spine span{position:absolute;bottom:-12px;width:24px;height:24px;background:#3156ef;clip-path:polygon(0 0,100% 0,100% 100%,38% 100%,38% 38%,0 38%)}.duty-spine span:nth-child(1){left:12%}.duty-spine span:nth-child(2){left:48%}.duty-spine span:nth-child(3){left:84%;background:#d7ff45}
.duty-proof-stamp{display:grid;place-items:center;background:#d7ff45;color:#111315;font-family:font-type-pixel-correction;font-size:28px;font-weight:900;letter-spacing:2px;clip-path:polygon(0 8%,92% 0,100% 88%,9% 100%);border:5px solid #111315;transform:rotate(-4deg)}
.archive-slot{overflow:hidden;background:#171a1c;border:4px solid #f2ecdf;clip-path:polygon(5% 0,100% 3%,95% 100%,0 96%);box-shadow:8px 10px 0 rgba(0,0,0,.38)}.archive-slot-2{background:#3156ef;border-color:#d7ff45}.archive-slot b{position:absolute;left:15%;top:8%;font-family:font-type-pixel-correction;font-size:24px;color:#f2ecdf}.archive-slot-2 b{color:#d7ff45}.archive-slot span{position:absolute;left:14%;width:68%;border-top:3px solid rgba(242,236,223,.72)}.archive-slot span:nth-of-type(1){top:29%}.archive-slot span:nth-of-type(2){top:45%;width:61%}.archive-slot span:nth-of-type(3){top:61%;width:54%;border-color:#3156ef}.archive-slot-2 span:nth-of-type(3){border-color:#f2ecdf}.archive-slot span:nth-of-type(4){top:77%;width:47%}
.retained-selection-boundary{overflow:visible;border:7px solid #3156ef;box-shadow:inset 0 0 0 3px rgba(215,255,69,.76),0 0 0 1px #111315}.retained-selection-boundary span{position:absolute;right:-13px;bottom:-13px;width:24px;height:24px;background:#d7ff45;border:4px solid #111315}
.local-revision-window{overflow:hidden;background:rgba(17,19,21,.78);clip-path:polygon(2% 0,100% 5%,96% 100%,0 93%);border-left:6px solid #3156ef}.local-revision-window span{position:absolute;left:8%;width:72%;border-top:4px solid #f2ecdf}.local-revision-window span:nth-child(1){top:18%}.local-revision-window span:nth-child(2){top:44%;width:84%;border-color:#8d2436;transform:rotate(-2deg)}.local-revision-window span:nth-child(3){left:18%;top:69%;width:68%;border-color:#3156ef}
.full-package.editorial-duty-assembly .duty-source-slice-1,.full-package.editorial-duty-assembly .duty-source-slice-2,.full-package.editorial-duty-assembly .duty-source-slice-3{overflow:hidden;box-shadow:7px 9px 0 #3156ef,12px 14px 0 rgba(17,19,21,.25);filter:brightness(.76) contrast(1.22) saturate(.62)}.full-package.editorial-duty-assembly .duty-source-slice-2{box-shadow:7px 9px 0 #d7ff45,12px 14px 0 rgba(17,19,21,.25)}.full-package.editorial-duty-assembly .editorial-duty-word{color:#111315!important;overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;text-shadow:2px 2px 0 #f2ecdf!important}.full-package.editorial-duty-assembly .editorial-duty-word.word-actor-2{color:#111315!important;background:#d7ff45!important;padding:.02em .08em;text-shadow:none!important}.full-package.editorial-duty-assembly .editorial-duty-word.word-actor-3{color:#3156ef!important}.full-package.editorial-duty-assembly .editorial-duty-word.word-actor-4{color:#111315!important;text-shadow:3px 2px 0 #f2ecdf,6px 3px 0 #3156ef!important}.full-package.editorial-duty-assembly .primary{clip-path:polygon(2% 0,100% 4%,95% 100%,0 96%);box-shadow:-12px 14px 0 #d7ff45}
.full-package.archive-memory-separation .archive-memory-word{color:#f2ecdf!important;background:#111315!important;padding:.02em .08em;clip-path:polygon(1% 8%,100% 0,96% 92%,0 100%);overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;text-shadow:none!important}.full-package.archive-memory-separation .archive-memory-word.word-actor-2{color:#d7ff45!important}.full-package.archive-memory-separation .numeric-unit{color:#111315!important;text-shadow:1px 1px 0 #f2ecdf!important}.full-package.archive-memory-separation .primary{clip-path:polygon(3% 0,100% 3%,96% 100%,0 97%);filter:brightness(.72) contrast(1.25) saturate(.66)}
.full-package.controlled-locality-verdict .controlled-locality-word{overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal}.full-package.controlled-locality-verdict .controlled-locality-word.word-actor-1{color:#ff5948!important;text-decoration:line-through .09em #8d2436;text-shadow:1px 1px 0 #111315!important}.full-package.controlled-locality-verdict .controlled-locality-word.word-actor-2{color:#4f6dff!important;text-shadow:4px 3px 0 #f2ecdf,8px 5px 0 #111315!important}.full-package.controlled-locality-verdict .controlled-locality-word.word-actor-3{color:#f2ecdf!important;background:linear-gradient(transparent 60%,#d7ff45 60%,#d7ff45 88%,transparent 88%)!important;text-shadow:3px 2px 0 #111315!important}.full-package.controlled-locality-verdict .primary{clip-path:polygon(2% 0,100% 5%,96% 100%,0 94%);filter:brightness(.76) contrast(1.2) saturate(.68)}
.screen-demo .screen-causal-word{font-family:font-type-pixel-correction!important;color:#3156ef!important;font-weight:820;letter-spacing:-.045em;white-space:nowrap;overflow:visible;mix-blend-mode:multiply;text-shadow:1px 1px 0 rgba(242,236,223,.92)!important}.screen-demo .screen-causal-word.palette-vermillion{color:#9d2637!important}.screen-demo .screen-causal-caption{font-family:font-type-pixel-correction!important;color:#111315!important;font-weight:720;letter-spacing:.055em;white-space:nowrap;overflow:visible;mix-blend-mode:multiply;text-shadow:1px 1px 0 rgba(242,236,223,.86)!important}
.screen-demo.screen-context-edge-word .screen-causal-word{letter-spacing:-.025em}.screen-demo.screen-result-word-handoff .screen-causal-word,.screen-demo.screen-result-accept-lock .screen-causal-word{letter-spacing:-.055em}.screen-demo.screen-review-verdict-lock .screen-causal-caption{color:#8d2436!important}.screen-demo.screen-action-word-lock .screen-causal-word{transform:skewX(-1.2deg);transform-origin:left center}
.full-package.source-bound-model-handoff .model-handoff-entity-name{font-weight:820;letter-spacing:-.07em;overflow:visible;white-space:nowrap}
.full-package.source-bound-model-handoff .model-handoff-entity-name.entity-name-1{color:#111315!important;text-shadow:3px 3px 0 #d7ff45!important}
.full-package.source-bound-model-handoff .model-handoff-entity-name.entity-name-2{color:#3156ef!important;text-shadow:3px 3px 0 #f2ecdf!important}
.full-package.source-bound-model-handoff .model-handoff-stage-word{font-weight:780;letter-spacing:-.055em;overflow:visible;white-space:nowrap;text-shadow:none!important}
.full-package.source-bound-model-handoff .model-handoff-stage-word.word-actor-1{color:#111315!important;border-bottom:4px solid #d7ff45}
.full-package.source-bound-model-handoff .model-handoff-stage-word.word-actor-2{color:#111315!important;border-bottom:5px solid #d7ff45}
.full-package.source-bound-model-handoff .model-handoff-stage-word.word-actor-3{color:#3156ef!important}
.task-packet{background:#f2ecdf;clip-path:polygon(3% 0,100% 5%,94% 100%,0 94%);box-shadow:10px 12px 0 rgba(17,19,21,.16),16px 18px 0 rgba(49,86,239,.18);border-left:7px solid #d7ff45;transform:rotate(-2deg)}
.task-packet span{position:absolute;left:9%;height:8%;background:#111315}.task-packet span:nth-child(1){top:25%;width:72%}.task-packet span:nth-child(2){top:48%;width:58%}.task-packet span:nth-child(3){top:71%;width:78%;background:#8d2436}
.api-bridge{overflow:visible;border-top:6px solid #3156ef;transform:rotate(2deg)}
.api-bridge:before{content:"";position:absolute;right:-4%;top:-14px;width:28px;height:28px;background:#3156ef;clip-path:polygon(0 0,100% 50%,0 100%,26% 50%)}
.api-bridge span{position:absolute;left:36%;top:-10px;width:38px;height:16px;background:#d7ff45;transform:skewX(-16deg)}
.full-package.source-document.source-revision-locality .source-revision-word{overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;background:transparent!important}
.full-package.source-document.source-revision-locality .source-revision-word.word-actor-1{color:#8d2436!important;text-decoration-line:line-through;text-decoration-thickness:.09em;text-decoration-color:#8d2436;transform:rotate(-1.2deg);text-shadow:1px 1px 0 #f2ecdf!important}
.full-package.source-document.source-revision-locality .source-revision-word.word-actor-2{color:#3156ef!important;font-family:font-type-pixel-correction!important;border-left:5px solid #3156ef;padding-left:.12em;text-shadow:1px 1px 0 #f2ecdf!important}
.full-package.source-document.source-revision-locality .source-revision-word.word-actor-3{color:#111315!important;letter-spacing:-.08em;background:linear-gradient(transparent 58%,#d7ff45 58%,#d7ff45 87%,transparent 87%)!important;text-shadow:2px 2px 0 #f2ecdf,5px 2px 0 rgba(49,86,239,.75)!important}
.full-package.source-document.source-reading-friction .source-reading-friction-word{overflow:visible;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;background:transparent!important;font-weight:860;letter-spacing:-.075em}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-1{color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:720;opacity:1;text-shadow:1px 1px 0 #f2ecdf!important;background:linear-gradient(transparent 44%,#d7ff45 44% 92%,transparent 92%)!important}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-2{color:#3156ef!important;font-weight:780;text-shadow:1px 1px 0 #f2ecdf,2px 2px 0 rgba(17,19,21,.2)!important;background:linear-gradient(transparent 49%,rgba(49,86,239,.16) 49% 92%,transparent 92%)!important}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-3{color:#111315!important;background:transparent!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.025em;text-shadow:1px 1px 0 #f2ecdf!important}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-4{color:#3156ef!important;text-shadow:2px 2px 0 #f2ecdf,5px 2px 0 rgba(17,19,21,.72)!important}
.full-package.source-document.source-reading-friction .primary{box-shadow:10px 13px 0 rgba(17,19,21,.22),-4px 5px 0 rgba(49,86,239,.24);filter:sepia(.22) saturate(.82) contrast(1.08);transform:rotate(-1.15deg);transform-origin:50% 50%}
.full-package.source-document.source-reading-friction .reading-source-slice-2,.full-package.source-document.source-reading-friction .reading-source-slice-3{overflow:hidden;box-shadow:9px 11px 0 rgba(17,19,21,.18);filter:sepia(.08) saturate(.76) contrast(1.08)}
.full-package.source-document.source-reading-friction .reading-source-slice-2{box-shadow:9px 11px 0 rgba(49,86,239,.22)}
.full-package.source-document.source-reading-friction .reading-source-slice-3{box-shadow:9px 11px 0 rgba(169,45,50,.18)}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-2{background:transparent!important;padding:0;clip-path:none;text-shadow:1px 1px 0 rgba(242,236,223,.9)!important;transform:rotate(-.45deg)}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-3{background:transparent!important;padding:0;clip-path:none}
.full-package.source-document.source-reading-friction .reading-ink-strip~.source-reading-friction-word.word-actor-1{color:#f2ecdf!important;text-shadow:2px 2px 0 #111315!important}
.full-package.source-document.source-reading-friction .reading-ink-strip~.source-reading-friction-word.word-actor-2{color:#3156ef!important;text-shadow:1px 1px 0 #f2ecdf,2px 2px 0 rgba(17,19,21,.28)!important}
.full-package.source-document.source-reading-friction .reading-ink-strip~.source-reading-friction-word.word-actor-3{color:#111315!important;text-shadow:2px 2px 0 #f2ecdf!important}
.source-reading-friction .reading-friction-scan-1{background:linear-gradient(90deg,rgba(215,255,69,.08),rgba(215,255,69,.68),rgba(215,255,69,.08));border-left:0;transform:rotate(-.6deg)}
.source-reading-friction .reading-friction-scan-2{background:linear-gradient(90deg,rgba(49,86,239,.05),rgba(49,86,239,.34),rgba(49,86,239,.04));border-left:4px solid #3156ef;transform:rotate(.45deg)}
.reading-central-void{background:#f2ecdf!important;background-image:radial-gradient(rgba(17,19,21,.14) .8px,transparent .8px),linear-gradient(173deg,rgba(255,255,255,.18),rgba(49,86,239,.05))!important;background-size:7px 7px,100% 100%;clip-path:polygon(3% 12%,18% 3%,37% 8%,58% 0,82% 7%,100% 18%,94% 86%,74% 100%,46% 92%,22% 100%,0 82%);opacity:.94;box-shadow:8px 10px 0 rgba(17,19,21,.18),-4px 4px 0 rgba(49,86,239,.18);filter:none;transform:rotate(-1.4deg);pointer-events:none;mix-blend-mode:normal}
.reading-central-void:after{content:"";position:absolute;inset:5% 6%;border-top:2px solid rgba(49,86,239,.3);border-bottom:2px solid rgba(169,45,50,.22);transform:rotate(.6deg)}
.full-package.source-document.source-reading-friction .reading-spine-blue path,.full-package.source-document.source-reading-friction .reading-handoff-open-arc path{stroke-width:1.8;filter:none}
.full-package.source-document.source-reading-friction .reading-ink-strip{background-color:#17191a;background-image:linear-gradient(173deg,transparent 0 11%,rgba(242,236,223,.09) 13%,transparent 17%),repeating-linear-gradient(7deg,rgba(255,255,255,.035) 0 1px,transparent 1px 6px);clip-path:polygon(0 24%,8% 10%,21% 14%,34% 5%,49% 11%,66% 2%,82% 9%,100% 15%,97% 71%,88% 84%,72% 76%,58% 91%,41% 82%,25% 96%,10% 86%,3% 100%);box-shadow:6px 7px 0 rgba(17,19,21,.2),inset 0 0 0 1px rgba(242,236,223,.14);opacity:.95;mix-blend-mode:multiply;transform:rotate(-1.15deg)}
.full-package.source-document.source-reading-friction .reading-ink-strip-2{clip-path:polygon(0 6%,18% 0,37% 11%,63% 2%,84% 12%,100% 5%,96% 86%,71% 94%,45% 84%,18% 100%,3% 87%);transform:rotate(.75deg);opacity:.94}
.full-package.source-document.source-reading-friction .reading-ink-strip-3{clip-path:polygon(0 12%,19% 0,43% 7%,65% 1%,87% 10%,100% 4%,95% 82%,74% 94%,49% 86%,29% 100%,5% 88%);transform:rotate(-.55deg);opacity:.9}
.full-package.source-document.source-reading-friction .reading-ink-strip-2{background:transparent!important;background-image:none!important;box-shadow:none!important;border-bottom:3px solid #3156ef;clip-path:none;mix-blend-mode:multiply;transform:rotate(-.7deg);opacity:.88}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-1{color:#111315!important;background:transparent!important;font-family:font-type-pixel-correction!important;font-weight:900;text-shadow:1px 1px 0 #f2ecdf,2px 1px 0 rgba(49,86,239,.24)!important;letter-spacing:-.02em;text-decoration-line:underline;text-decoration-color:#d7ff45;text-decoration-thickness:.12em;text-underline-offset:.08em}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-2{color:#111315!important;background:transparent!important;font-family:font-type-pixel-correction!important;font-weight:820;text-shadow:1px 1px 0 #f2ecdf,2px 1px 0 rgba(49,86,239,.22)!important;letter-spacing:-.045em;transform:rotate(-.35deg)}
.full-package.source-document.source-reading-friction .source-reading-friction-word.word-actor-3{color:#111315!important;background:linear-gradient(transparent 58%,rgba(215,255,69,.78) 58% 88%,transparent 88%)!important;font-family:font-type-pixel-correction!important;font-weight:900;text-shadow:1px 1px 0 #f2ecdf,2px 1px 0 rgba(49,86,239,.24)!important;letter-spacing:-.02em}
.full-package.source-reading-friction .primary.erased-central-reading-void{-webkit-mask-image:radial-gradient(ellipse 21% 18% at 50% 51%,transparent 0 48%,rgba(0,0,0,.16) 62%,#000 84%);mask-image:radial-gradient(ellipse 21% 18% at 50% 51%,transparent 0 48%,rgba(0,0,0,.16) 62%,#000 84%)}
.full-package.light .type.covacut-entity-word,.full-package.light .type.covacut-entity-name{color:#111315!important;text-shadow:2px 2px 0 #f2ecdf,4px 2px 0 rgba(49,86,239,.55)!important}
.full-package.light .type.covacut-pixel-count{color:#3156ef!important;text-shadow:3px 3px 0 #f2ecdf!important}
.full-package.light .type.covacut-pixel-caption{color:#111315!important;text-shadow:none!important}
.full-package.source-document .editorial-question-strip-word{overflow:hidden;white-space:nowrap;word-break:keep-all;mix-blend-mode:normal;padding:.03em .12em .015em;text-shadow:none!important}
.full-package.source-document .editorial-question-strip-word.palette-ink{color:#f2ecdf!important;background:#111315;padding:.03em .12em .015em;clip-path:polygon(1% 8%,100% 0,97% 91%,0 100%)}
.full-package.source-document .editorial-question-strip-word.word-actor-2{color:#111315!important;background:#f2ecdf;padding:.03em .12em .015em;clip-path:polygon(0 0,98% 7%,100% 100%,2% 91%)}
.full-package.source-document .editorial-question-strip-word.palette-cobalt{color:#f2ecdf!important;background:#4f6dff;clip-path:polygon(1% 8%,100% 0,97% 91%,0 100%)}
.full-package.source-document.source-reading-friction [data-typography-material]{background-size:cover!important;background-position:74% 50%!important;background-repeat:no-repeat!important;background-color:#111315!important;padding:.02em .12em .04em!important;clip-path:polygon(0 12%,88% 0,100% 20%,96% 88%,14% 100%,0 78%)!important}`;
const mediaBoundaryCss = `.full-package .type.covacut-pixel-impact{color:#f2d36b!important;background:transparent!important;padding:0!important;font-weight:760;letter-spacing:-.045em;text-shadow:2px 0 rgba(17,19,21,.82),0 5px 26px rgba(0,0,0,.74)}
.full-package .type.covacut-pixel-impact.tone-light{color:#f2d36b!important}
.full-package .type.covacut-entity-word{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:690;letter-spacing:.015em;text-shadow:1px 1px rgba(17,19,21,.85),0 4px 16px rgba(0,0,0,.72)}
.full-package .type.covacut-entity-word.word-actor-2,.full-package .type.covacut-entity-word.word-actor-5{color:#f2d36b!important}
.full-package .type.covacut-entity-name{color:#f2d36b!important;background:transparent!important;padding:0!important;font-weight:760;letter-spacing:-.055em;text-shadow:3px 0 rgba(17,19,21,.86),0 6px 28px rgba(0,0,0,.78)}
.full-package .type.covacut-entity-name.entity-name-2{color:#f3eddf!important}
.full-package .type.covacut-pixel-count{color:#f2d36b!important;background:transparent!important;padding:0!important;font-weight:760;letter-spacing:-.08em;text-shadow:3px 0 rgba(17,19,21,.82),0 7px 28px rgba(0,0,0,.78)}
.full-package .type.covacut-pixel-caption{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:700;letter-spacing:.02em;text-shadow:1px 1px rgba(17,19,21,.8),0 4px 16px rgba(0,0,0,.7)}
.full-package .entity-imprint{opacity:.24;filter:grayscale(1) contrast(1.4);transform:rotate(-2deg)}`;
const operationStageCss = `.operation-stage{overflow:hidden;background:#f2ecdf}.operation-stage img{display:block}`;
const sourcePointerCss = `.source-pointer{overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,.42))}.pointer-arrow{position:absolute;left:0;top:0;width:58%;height:72%;background:#fff;clip-path:polygon(0 0,88% 57%,53% 64%,72% 100%,53% 100%,35% 68%,0 92%);box-shadow:inset 0 0 0 2px #111}.pointer-arrow:after{content:"";position:absolute;inset:2px;background:#111;clip-path:inherit;z-index:-1}.pointer-press-ring{position:absolute;left:-34%;top:-25%;width:116%;aspect-ratio:1;border:3px solid rgba(49,86,239,.9);border-radius:999px;box-shadow:0 0 0 6px rgba(49,86,239,.16)}`;
const correctionMarkCss = `.editorial-correction-mark{overflow:visible;transform:rotate(-1.3deg);filter:drop-shadow(1px 2px 0 rgba(242,236,223,.7))}.editorial-correction-mark svg{width:100%;height:100%;overflow:visible}.editorial-correction-mark path{fill:none;stroke:#a92d32;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.editorial-correction-mark.reading-loop-blue path,.editorial-correction-mark.reading-spine-blue path,.editorial-correction-mark.reading-cross-check-path path,.editorial-correction-mark.reading-branch-blue path,.editorial-correction-mark.reading-sentence-underline-blue path,.editorial-correction-mark.reading-handoff-open-circle path,.editorial-correction-mark.reading-handoff-open-arc path{stroke:#3156ef;stroke-width:2.7}.full-package.source-document.source-reading-friction .editorial-correction-mark.reading-spine-blue path,.full-package.source-document.source-reading-friction .editorial-correction-mark.reading-handoff-open-arc path{stroke-width:1.8}.editorial-correction-mark.reading-cancel-black path{stroke:#111315;stroke-width:4.2}.editorial-correction-mark.reading-handoff-open-circle,.editorial-correction-mark.reading-handoff-open-arc{filter:none;transform:rotate(2deg)}.type-only .type.type-correction-intro{color:#f2ecdf!important;text-shadow:1px 1px 0 #111315!important;letter-spacing:-.04em}.type-only .type.type-correction-prefix{color:#f2ecdf!important;font-family:inherit!important;font-weight:820;letter-spacing:-.065em;text-shadow:2px 2px 0 #111315,4px 3px 0 rgba(49,86,239,.54)!important;mix-blend-mode:normal}.type-only .type.type-correction-waste{color:#3156ef!important;font-family:inherit!important;font-weight:900;letter-spacing:-.09em;transform:rotate(-1.2deg);text-shadow:3px 2px 0 #f2ecdf,6px 3px 0 #111315!important;mix-blend-mode:normal}`;
const anchorSurfaceCss = `.editorial-anchor-surface{overflow:hidden;pointer-events:none;isolation:isolate}.editorial-anchor-surface img{width:100%;height:100%;display:block;object-fit:cover}.editorial-anchor-surface.full-bleed-hero{filter:saturate(.9) contrast(1.05)}.editorial-anchor-surface.paper-evidence{filter:saturate(.82) contrast(1.1)}.editorial-anchor-surface.dark-verdict{filter:contrast(1.08) saturate(.92)}.editorial-anchor-surface.creator-workbench-overlay-v3{filter:saturate(.94) contrast(1.1) brightness(.94)}.editorial-anchor-surface.creator-workbench-overlay-v4{filter:contrast(1.12) saturate(.9) brightness(.92)}.editorial-anchor-surface.presenter-typographic-stage-v5{filter:brightness(.78) contrast(1.18) saturate(.72)}.editorial-anchor-surface.opening-typographic-plane-v6{filter:brightness(.84) contrast(1.12) saturate(.82)}.editorial-anchor-surface.causal-screen-desk-v3{filter:saturate(.82) contrast(1.1) brightness(.9)}.editorial-anchor-surface.proofing-bench-scan-v3,.editorial-anchor-surface.proofing-strips-stage-v4{filter:saturate(.82) contrast(1.16) brightness(.96)}.editorial-anchor-surface.evidence-filing-stage-v4{filter:contrast(1.12) saturate(.93) brightness(.94)}.editorial-anchor-surface.ink-verdict-stage-v3,.editorial-anchor-surface.ink-field-typographic-stage-v3{filter:contrast(1.12) saturate(.96)}.editorial-anchor-surface + .type{isolation:isolate}`;
const preferenceSurfaceCss = `.preference-source-surface{overflow:hidden;background:#f2ecdf;filter:contrast(1.08) saturate(.72);box-shadow:18px 0 38px rgba(0,0,0,.32)}
.presenter-overlay.preference-fullframe .preference-source-surface.monitor-inset{transform:rotate(-2.4deg);border:0;clip-path:polygon(3% 0,100% 5%,94% 94%,0 100%);box-shadow:0 8px 18px rgba(0,0,0,.34);filter:contrast(1.18) saturate(.62)}
.preference-source-surface:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 62%,rgba(8,10,11,.16));pointer-events:none}`;
const frameBaseCss = `*{box-sizing:border-box}html,body{margin:0;background:#070909}.frame{position:relative;width:960px;height:540px;overflow:hidden;background:#111315;color:#f0eadc}.frame.light{color:#111315;background:#ebe3d4}.node{position:absolute}.node.solid{inset:0!important;width:100%!important;height:100%!important;background:radial-gradient(circle at 18% 82%,rgba(35,79,209,.22),transparent 30%),#111315}.node img{width:100%;height:100%;display:block;object-fit:cover}.asset img,.entity-imprint img{object-fit:contain}.primary.presenter-clean img,.primary.presenter-overlay img,.foreground-occluder img{object-position:center 34%;filter:saturate(.86) contrast(1.05)}.full-package.source-documentary .primary img{filter:brightness(.82) contrast(1.12) saturate(.72)}.type{display:flex;align-items:center;font-weight:700;letter-spacing:-.055em;word-break:keep-all;text-wrap:balance;text-shadow:0 3px 0 rgba(0,0,0,.12)}.dark .type{color:#f0eadc}.light .type{color:#111315}.type.editable-shadow{opacity:0!important;pointer-events:none}`;
const anchorPrimitiveFinalCss = `.frame.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-intro{color:#111315!important;text-shadow:none!important}
.frame.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-aligned-prefix{color:#111315!important;text-shadow:3px 3px 0 rgba(36,71,255,.2)!important}
.frame.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-waste-reveal{color:#ff4b3e!important;text-shadow:3px 3px 0 #111315!important}`;
const plainPaperCss = `.node.solid.plain-paper{background:#f2ecdf;background-image:radial-gradient(circle at 1px 1px,rgba(17,19,21,.1) .55px,transparent .7px);background-size:7px 7px}`;
const screenContextStageCss = `.node.solid.screen-context-stage{background:#111315}
.screen-demo .node.solid.screen-context-stage{background:radial-gradient(circle at 18% 82%,rgba(49,86,239,.25),transparent 30%),#111315}
.screen-demo .node.solid.screen-context-stage~.primary,.screen-demo .node.solid.screen-context-stage~.operation-stage{box-shadow:0 18px 54px rgba(0,0,0,.38),0 0 0 1px rgba(242,236,223,.22)}
.screen-demo.context-bilingual-caption .screen-causal-caption{color:#d7ff45!important;mix-blend-mode:screen;text-shadow:1px 1px #111315,0 3px 12px rgba(0,0,0,.76)!important}
.screen-demo .node.solid.screen-action-stage-ink{background:radial-gradient(circle at 84% 12%,rgba(215,255,69,.09),transparent 26%),#111315}
.screen-demo .node.solid.screen-action-stage-cobalt{background:linear-gradient(145deg,#111315 0 66%,#172552 100%)}
.screen-demo .node.solid.screen-action-stage-vermillion{background:linear-gradient(145deg,#111315 0 68%,#35151a 100%)}
.screen-demo .node.solid[class*="screen-action-stage-"]~.primary,.screen-demo .node.solid[class*="screen-action-stage-"]~.operation-stage{box-shadow:0 20px 58px rgba(0,0,0,.44),0 0 0 1px rgba(242,236,223,.18)}
.screen-demo.action-bilingual-caption .screen-causal-caption{font-size:10px!important;letter-spacing:.06em!important}
.presenter-typographic-stage-v5 .paper-grain{display:none}`;
const glyphActorCss = `.generated-glyph{overflow:visible}.generated-glyph img{mix-blend-mode:multiply;filter:contrast(1.08) saturate(1.06)}
.generated-glyph.tone-light img{mix-blend-mode:screen;filter:invert(1) hue-rotate(168deg) saturate(1.35) contrast(1.12)}`;
const presenterTypographyCss = `.presenter-overlay .type.covacut-pixel-impact{isolation:isolate;overflow:visible;font-weight:760;letter-spacing:-.075em;white-space:nowrap;word-break:keep-all}
.presenter-overlay .type.grammar-presenter-pixel{background:transparent!important;padding:0!important;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.09em;white-space:nowrap;word-break:keep-all;text-shadow:3px 2px 0 #111315,6px 4px 0 rgba(49,86,239,.72),0 8px 20px rgba(0,0,0,.62)!important;transform:skewX(-3deg);transform-origin:left bottom;filter:drop-shadow(0 0 4px rgba(215,255,69,.18))}
.presenter-overlay .type.grammar-presenter-pixel:nth-of-type(2n){color:#d7ff45!important;text-shadow:3px 2px 0 #111315,6px 4px 0 rgba(242,236,223,.76),0 8px 20px rgba(0,0,0,.62)!important;transform:skewX(2deg)}
.presenter-overlay .type.covacut-pixel-impact:before{content:attr(data-text);position:absolute;inset:0;display:flex;align-items:center;justify-content:inherit;color:#3156ef;transform:translate(5px,4px);clip-path:polygon(0 57%,100% 48%,100% 100%,0 100%);opacity:.78;z-index:-1;text-shadow:none}
.presenter-overlay .type.covacut-pixel-resolve{font-weight:900;letter-spacing:-.075em}
.presenter-overlay .type.covacut-pixel-lockup{color:#f3eddf!important;font-weight:760;letter-spacing:-.055em;text-wrap:balance;text-shadow:1px 0 #3156ef,0 8px 24px rgba(0,0,0,.64)}
.presenter-overlay .type.covacut-pixel-word{color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:690;letter-spacing:.015em;text-shadow:1px 1px rgba(0,0,0,.82)!important}
.presenter-overlay .type.covacut-preference-like{color:#3156ef!important;background:transparent!important;padding:0!important;font-weight:790;letter-spacing:-.06em;text-shadow:2px 2px 0 rgba(242,236,223,.92),0 5px 14px rgba(0,0,0,.2)!important}
.presenter-overlay .type.covacut-preference-dislike{color:#111315!important;background:transparent!important;padding:0!important;font-weight:790;letter-spacing:-.06em;text-shadow:2px 2px 0 rgba(242,236,223,.92),0 5px 14px rgba(0,0,0,.18)!important}
.presenter-overlay.preference-fullframe .type.covacut-preference-like{color:#d7ff45!important;font-size:1.12em!important;letter-spacing:-.09em;text-shadow:4px 0 #3156ef,0 5px 16px rgba(0,0,0,.8)!important;transform:rotate(-2deg);transform-origin:left center}
.presenter-overlay.preference-fullframe .type.covacut-preference-dislike{color:#f3eddf!important;font-size:1.12em!important;letter-spacing:-.09em;text-shadow:4px 0 #111315,0 5px 16px rgba(0,0,0,.8)!important;transform:rotate(1.5deg);transform-origin:left center}
.presenter-overlay.preference-fullframe .type.covacut-preference-caption{font-family:Arial,sans-serif;color:#d7ff45!important;font-size:13px!important;letter-spacing:.12em;font-weight:700;text-shadow:1px 1px #111315,0 3px 10px rgba(0,0,0,.8)!important;white-space:nowrap}
.presenter-overlay.preference-fullframe #preference-dislike-caption{color:#f3eddf!important}
.presenter-overlay.preference-fullframe #preference-outcome-word{color:#f2d36b!important;font-size:1.16em!important;letter-spacing:-.08em;white-space:pre-line;text-shadow:4px 0 #3156ef,0 7px 22px rgba(0,0,0,.84)!important;transform:skewX(-4deg);transform-origin:left bottom}
.presenter-overlay .type.covacut-screen-word{color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:720;letter-spacing:.015em;mix-blend-mode:screen;opacity:.92;filter:drop-shadow(0 0 7px rgba(215,255,69,.2));text-shadow:1px 1px rgba(0,0,0,.58)!important}
.presenter-overlay .type.covacut-pixel-functional{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:735;letter-spacing:-.06em;text-shadow:2px 0 rgba(17,19,21,.9),0 7px 20px rgba(0,0,0,.62)!important}
.presenter-overlay .type.covacut-pixel-handoff{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:780;letter-spacing:-.07em;text-shadow:3px 0 #3156ef,0 7px 22px rgba(0,0,0,.68)!important}
.presenter-overlay .type.covacut-monitor-handoff{color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:790;letter-spacing:-.055em;mix-blend-mode:screen;filter:drop-shadow(0 0 11px rgba(215,255,69,.34));text-shadow:2px 0 #3156ef,0 5px 16px rgba(0,0,0,.52)!important;transform:skewY(-1deg);transform-origin:right center}
.presenter-overlay .type.covacut-mic-depth,.presenter-overlay .type.covacut-mic-depth-resolve{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:780;letter-spacing:-.08em;text-shadow:3px 0 #111315,0 8px 26px rgba(0,0,0,.72)!important;transform:skewY(-1.2deg)}
.presenter-overlay .type.covacut-mic-rail-word{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:820;letter-spacing:-.08em;text-shadow:3px 0 #111315,0 8px 26px rgba(0,0,0,.72)!important;transform:rotate(-10deg) skewY(-1deg);transform-origin:left bottom}
.presenter-overlay .type.covacut-mic-depth-resolve{color:#f2d36b!important;text-shadow:3px 0 #3156ef,0 8px 26px rgba(0,0,0,.7)!important}
.presenter-overlay .type.covacut-mic-signal{color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:780;letter-spacing:-.07em;text-shadow:2px 0 #3156ef,0 7px 22px rgba(0,0,0,.66)!important;transform:skewY(-1.2deg)}
.presenter-overlay .type.covacut-monitor-overflow{color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:760;letter-spacing:-.075em;mix-blend-mode:screen;text-shadow:2px 0 #111315,0 5px 17px rgba(0,0,0,.66)!important;transform:skewY(-1.8deg)}
.presenter-overlay .type.covacut-desk-imprint,.presenter-overlay .type.covacut-desk-object{color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:790;letter-spacing:-.085em;text-shadow:0 .035em #d1c7b3,0 .07em #928875,0 .105em #4b4943,0 .14em 18px rgba(0,0,0,.72)!important;transform:perspective(720px) rotateX(7deg) skewX(-4deg);transform-origin:left bottom}
.presenter-overlay .type.covacut-desk-object{color:#f2d36b!important;transform:perspective(720px) rotateX(7deg) skewX(3deg);transform-origin:right bottom}
.presenter-overlay .type.covacut-pixel-caption.surface-monitor-burnin{color:#d7ff45!important;background:transparent!important;padding:0!important;border-bottom:1px solid rgba(215,255,69,.78);text-shadow:1px 1px rgba(0,0,0,.78)!important}
.presenter-overlay .type.covacut-pixel-caption.surface-lamp-margin{color:#f3eddf!important;background:transparent!important;padding:0!important;text-shadow:1px 1px rgba(0,0,0,.82)!important}
.presenter-overlay .type.covacut-pixel-caption.surface-desk-edge{color:#d7ff45!important;background:transparent!important;padding:0!important;border-left:2px solid #d7ff45;text-indent:.22em;text-shadow:1px 1px rgba(0,0,0,.8)!important}
.presenter-overlay .type.covacut-pixel-lockup.surface-ink-crop{color:#f3eddf!important;background:transparent!important;padding:0!important;text-shadow:2px 0 rgba(49,86,239,.85),0 8px 24px rgba(0,0,0,.62)!important}
.presenter-overlay .type.covacut-pixel-lockup.surface-paper-cut{color:#111315!important;background:#f2ecdf!important;padding:.035em .1em .015em!important;clip-path:polygon(1% 7%,98% 0,100% 87%,3% 100%);text-shadow:none!important;transform:rotate(-.45deg)}
.presenter-overlay .type.surface-paper-stamp,.presenter-overlay .type.surface-acid-strip,.presenter-overlay .type.surface-pixel-notch{color:#111315!important;text-shadow:none!important}
.presenter-overlay .type.covacut-pixel-caption.surface-paper-stamp,.presenter-overlay .type.covacut-pixel-caption.surface-acid-strip,.presenter-overlay .type.covacut-pixel-caption.surface-pixel-notch{color:#111315!important;text-shadow:none!important}
.presenter-overlay .type.surface-paper-stamp{background-color:#f2ecdf;background-image:radial-gradient(circle at 1px 1px,rgba(17,19,21,.16) .7px,transparent .8px);background-size:6px 6px;transform:rotate(-.6deg)}
.presenter-overlay .type.surface-acid-strip{background-color:#d7ff45;background-image:linear-gradient(90deg,rgba(17,19,21,.1),transparent 18%,rgba(17,19,21,.07));transform:rotate(.55deg)}
.presenter-overlay .type.surface-cobalt-pixel{color:#f3eddf!important;text-shadow:1px 1px rgba(17,19,21,.7)!important;transform:rotate(-.45deg)}
.presenter-overlay .type.covacut-pixel-caption.surface-cobalt-pixel{color:#f3eddf!important;text-shadow:1px 1px rgba(17,19,21,.7)!important}
.presenter-overlay .type.surface-ink-cutout{color:#f3eddf!important;border-left:.08em solid #d7ff45}
.presenter-overlay .type.surface-outline-crop{color:transparent!important;-webkit-text-stroke:.027em #f2ecdf!important;filter:drop-shadow(4px 3px 0 #3156ef)}
.presenter-overlay.creator-workbench-overlay-v3 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.08em;text-shadow:3px 2px 0 #111315,5px 4px 0 rgba(49,86,239,.68)!important;transform:rotate(-1.2deg);transform-origin:left bottom}
.presenter-overlay.creator-workbench-overlay-v3 .type.object-pinned-pixel-word:nth-of-type(2n){color:#d7ff45!important;transform:rotate(1.4deg)}
.presenter-overlay.creator-workbench-overlay-v4 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.085em;text-shadow:2px 2px 0 #f2ecdf,4px 3px 0 #3156ef!important;transform:rotate(-1deg);transform-origin:left bottom}
.presenter-overlay.creator-workbench-overlay-v4 .type.object-pinned-pixel-word:nth-of-type(2n){color:#3156ef!important;transform:rotate(1deg)}
.full-package.proofing-bench-scan-v3 .type.proofing-source-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.055em;text-shadow:1px 1px 0 #f2ecdf,2px 2px 0 rgba(49,86,239,.24)!important}
.full-package.proofing-bench-scan-v3 .type.proofing-source-word:nth-of-type(3n){color:#3156ef!important;text-decoration:underline;text-decoration-color:#d7ff45;text-decoration-thickness:.11em;text-underline-offset:.08em}
.type-only.ink-verdict-stage-v3 .type.ink-field-prefix{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.075em;text-shadow:3px 2px 0 #111315,5px 3px 0 rgba(49,86,239,.72)!important}
.type-only.ink-field-typographic-stage-v3 .type.ink-field-prefix,.type-only.ink-field-typographic-stage-v3 .type.ink-field-secondary-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.075em;text-shadow:3px 2px 0 #111315,5px 3px 0 rgba(49,86,239,.72)!important}
.type-only.ink-field-typographic-stage-v3 .type.ink-field-secondary-word{color:#3156ef!important;transform:rotate(-1deg);transform-origin:left center}
.full-package.proofing-strips-stage-v4 .type.filing-proof-word,.full-package.evidence-filing-stage-v4 .type.filing-proof-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.075em;color:#f2ecdf!important;text-shadow:3px 3px 0 #111315,6px 4px 0 rgba(49,86,239,.66)!important;transform:rotate(-1.2deg);transform-origin:left center}
.full-package.proofing-strips-stage-v4 .type.filing-proof-word:nth-of-type(2n),.full-package.evidence-filing-stage-v4 .type.filing-proof-word:nth-of-type(2n){color:#3156ef!important;transform:rotate(1.1deg)}
.type-only.ink-verdict-stage-v3 .type.type-correction-intro{background:transparent!important;padding:0!important}
.presenter-overlay.presenter-object-bound-pixel-relay .type.object-pinned-pixel-word{background:transparent!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:760;letter-spacing:-.055em;text-shadow:1px 1px 0 #111315!important;transform:rotate(-.6deg);transform-origin:left bottom}
.presenter-overlay.presenter-object-bound-pixel-relay .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:24px!important;letter-spacing:-.025em;text-shadow:2px 2px 0 #111315!important}
.presenter-overlay.presenter-object-bound-pixel-relay .presenter-word-2{font-weight:760!important;letter-spacing:-.045em!important;transform:rotate(-2deg)!important;transform-origin:left center!important;width:max-content!important;max-width:none!important}
.presenter-overlay.presenter-object-bound-pixel-relay .presenter-word-2:after{content:"";display:inline-block;position:relative;width:13px;height:13px;margin-left:5px;vertical-align:middle;background:linear-gradient(#b8ff00,#b8ff00) left top/6px 2px no-repeat,linear-gradient(#b8ff00,#b8ff00) left top/2px 6px no-repeat,linear-gradient(#b8ff00,#b8ff00) right top/6px 2px no-repeat,linear-gradient(#b8ff00,#b8ff00) right top/2px 6px no-repeat,linear-gradient(#b8ff00,#b8ff00) left bottom/6px 2px no-repeat,linear-gradient(#b8ff00,#b8ff00) left bottom/2px 6px no-repeat,linear-gradient(#b8ff00,#b8ff00) right bottom/6px 2px no-repeat,linear-gradient(#b8ff00,#b8ff00) right bottom/2px 6px no-repeat;filter:drop-shadow(1px 1px 0 #111315)}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail{overflow:visible;pointer-events:none;filter:drop-shadow(2px 2px 0 rgba(17,19,21,.92))}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail svg{width:100%;height:100%;overflow:visible;shape-rendering:crispEdges}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail path{fill:none;stroke-linecap:square;stroke-linejoin:miter;vector-effect:non-scaling-stroke}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-monitor-shadow{stroke:#2447ff;stroke-width:4;opacity:.34}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-monitor-main{stroke:#b8ff00;stroke-width:1.6}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-mic-shadow{stroke:#b8ff00;stroke-width:4;opacity:.28}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-mic-main{stroke:#2447ff;stroke-width:1.6}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail rect{shape-rendering:crispEdges;stroke:#111315;stroke-width:3;vector-effect:non-scaling-stroke}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-rail-lock{fill:transparent;stroke:#b8ff00;stroke-width:2}
.presenter-overlay.presenter-object-bound-pixel-relay .object-relay-rail .relay-rail-joint{fill:#2447ff}
.presenter-overlay.desk-type-object-1 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.09em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 12px 20px rgba(0,0,0,.48)!important;display:flex!important;width:90%!important;max-width:none!important;align-items:flex-end;justify-content:space-between;gap:1.5em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.desk-type-object-1 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.desk-type-object-1 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:1em;transform:perspective(720px) rotateX(9deg) skewX(-7deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 12px 20px rgba(0,0,0,.46)!important}
.presenter-overlay.desk-type-object-1 .type.object-pinned-pixel-word .split-actor-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;font-size:1.2em;transform:perspective(720px) rotateX(13deg) skewX(4deg);transform-origin:right bottom;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.7),0 14px 22px rgba(0,0,0,.56)!important}
.presenter-overlay.desk-type-object-1 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:22px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important}
.presenter-overlay.desk-type-object-1 .presenter-word-1:after{content:"";display:block;width:22px;height:4px;margin:3px 0 0 auto;background:#b8ff00;box-shadow:2px 2px 0 #111315}
.presenter-overlay.desk-type-object-1 .presenter-word-1:after,.presenter-overlay.desk-type-object-1 .presenter-word-2:after{display:none!important}
.presenter-overlay.desk-type-object-2 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.095em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:block!important;width:max-content!important;max-width:none!important;transform:perspective(720px) rotateX(9deg) skewX(-4deg)!important;transform-origin:left bottom}
.presenter-overlay.desk-type-object-2 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:22px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.desk-type-object-2 .presenter-word-1:after{display:none!important}
.presenter-overlay.desk-type-object-2 .presenter-word-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.desk-type-object-2 .presenter-word-2:after{content:"";display:block!important;position:absolute;right:-20px;bottom:10%;width:15px;height:15px;border:3px solid #b8ff00;box-shadow:2px 2px 0 #111315;transform:none!important;background:transparent}
.presenter-overlay.desk-type-object-3 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.105em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:block!important;width:max-content!important;max-width:none!important;transform:perspective(720px) rotateX(8deg) rotate(-4deg) skewX(-3deg)!important;transform-origin:left bottom}
.presenter-overlay.desk-type-object-3 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.desk-type-object-3 .presenter-word-1:after{display:none!important}
.presenter-overlay.desk-type-object-3 .presenter-word-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.desk-type-object-3 .presenter-word-2:after{content:"";display:inline-block!important;position:relative;right:auto;bottom:auto;width:14px;height:14px;margin-left:10px;vertical-align:middle;border:3px solid #b8ff00;box-shadow:2px 2px 0 #111315;transform:none!important;background:transparent}
.presenter-overlay.desk-type-object-4 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.095em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:flex!important;width:max-content!important;max-width:none!important;align-items:flex-end;gap:.035em;transform:perspective(720px) rotateX(7deg) rotate(-3deg) skewX(-3deg)!important;transform-origin:left bottom}
.presenter-overlay.desk-type-object-4 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.desk-type-object-4 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.86em;transform:rotate(-7deg) translateY(-.08em);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 10px 20px rgba(0,0,0,.42)!important}
.presenter-overlay.desk-type-object-4 .type.object-pinned-pixel-word .split-actor-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;font-size:1.18em;transform:rotate(-2deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.desk-type-object-4 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.desk-type-object-4 .presenter-word-1:after{display:none!important}
.presenter-overlay.desk-type-object-4 .presenter-word-2:after{content:"";display:inline-block!important;position:relative;right:auto;bottom:auto;width:11px;height:11px;margin-left:5px;vertical-align:middle;border:2px solid #b8ff00;box-shadow:1px 1px 0 #111315;transform:none!important;background:transparent}
.presenter-overlay.desk-type-object-5 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.095em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:flex!important;width:max-content!important;max-width:none!important;align-items:flex-end;gap:.035em;transform:perspective(720px) rotateX(7deg) rotate(-3deg) skewX(-3deg)!important;transform-origin:left bottom}
.presenter-overlay.desk-type-object-5 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.desk-type-object-5 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.82em;transform:rotate(-9deg) translateY(-.16em);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 10px 20px rgba(0,0,0,.42)!important}
.presenter-overlay.desk-type-object-5 .type.object-pinned-pixel-word .split-actor-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;font-size:1.16em;transform:rotate(-2deg) translateY(.1em);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.desk-type-object-5 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.desk-type-object-5 .presenter-word-1:after,.presenter-overlay.desk-type-object-5 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-6 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.09em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:flex!important;width:90%!important;max-width:none!important;align-items:flex-end;gap:.035em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-6 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-6 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.82em;transform:translate(-1.85em,-1.1em) rotate(-25deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 10px 20px rgba(0,0,0,.42)!important}
.presenter-overlay.surface-path-object-6 .type.object-pinned-pixel-word .split-actor-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;font-size:1.08em;transform:translate(-1.6em,.8em) rotate(-2deg) perspective(720px) rotateX(8deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.surface-path-object-6 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-6 .presenter-word-1:after,.presenter-overlay.surface-path-object-6 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-7 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.09em;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.68),0 12px 22px rgba(0,0,0,.5)!important;display:grid!important;grid-template-columns:65% 8% 27%;width:78%!important;max-width:none!important;align-items:flex-end;gap:0;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-7 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-7 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.68em;transform:translate(.1em,-.8em) rotate(-22deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,6px 6px 0 rgba(36,71,255,.62),0 8px 16px rgba(0,0,0,.42)!important}
.presenter-overlay.surface-path-object-7 .type.object-pinned-pixel-word .handoff-notch{width:11px;height:11px;flex:0 0 11px;background:#2447ff;box-shadow:3px 3px 0 #b8ff00,2px 2px 0 #111315;transform:translate(1.45em,-.25em) rotate(45deg);transform-origin:center;opacity:.96}
.presenter-overlay.surface-path-object-7 .type.object-pinned-pixel-word .split-actor-2{color:#f2d36b!important;-webkit-text-fill-color:#f2d36b!important;font-size:.82em;transform:translate(.75em,.58em) rotate(-3deg) perspective(720px) rotateX(14deg) skewX(3deg);transform-origin:left bottom;text-shadow:3px 3px 0 #111315,7px 7px 0 rgba(36,71,255,.72),0 14px 24px rgba(0,0,0,.56)!important}
.presenter-overlay.surface-path-object-7 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-7 .presenter-word-1:after,.presenter-overlay.surface-path-object-7 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-8 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.085em;text-shadow:3px 3px 0 #2447ff,0 10px 20px rgba(0,0,0,.48)!important;display:grid!important;grid-template-columns:70% 30%;width:78%!important;max-width:none!important;align-items:flex-end;gap:0;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-8 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-8 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.54em;transform:translate(.05em,-.78em) rotate(-22deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.38)!important}
.presenter-overlay.surface-path-object-8 .type.object-pinned-pixel-word .split-actor-2{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.95em;transform:translate(.55em,.32em) rotate(-5deg) perspective(720px) rotateX(13deg) skewX(3deg);transform-origin:left bottom;text-shadow:3px 3px 0 #2447ff,0 10px 18px rgba(0,0,0,.52)!important}
.presenter-overlay.surface-path-object-8 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-8 .presenter-word-1:after,.presenter-overlay.surface-path-object-8 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-9 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.085em;text-shadow:3px 3px 0 #2447ff,0 10px 20px rgba(0,0,0,.48)!important;display:grid!important;grid-template-columns:70% 30%;width:78%!important;max-width:none!important;align-items:flex-end;gap:0;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-9 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-9 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.58em;transform:translate(.05em,-.78em) rotate(-22deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.38)!important}
.presenter-overlay.surface-path-object-9 .type.object-pinned-pixel-word .split-actor-1 .split-actor-glyph{display:inline-block;transform:scale(var(--glyph-scale));transform-origin:left bottom;margin-right:-.035em}
.presenter-overlay.surface-path-object-9 .type.object-pinned-pixel-word .split-actor-2{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.95em;transform:translate(.55em,.32em) rotate(-5deg) perspective(720px) rotateX(13deg) skewX(3deg);transform-origin:left bottom;text-shadow:3px 3px 0 #2447ff,0 5px 0 rgba(17,19,21,.55),0 10px 18px rgba(0,0,0,.52)!important;filter:drop-shadow(0 3px 0 rgba(17,19,21,.34))}
.presenter-overlay.surface-path-object-9 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:18px!important;letter-spacing:-.035em;text-shadow:2px 2px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-9 .presenter-word-1:after,.presenter-overlay.surface-path-object-9 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.085em;text-shadow:2px 2px 0 #2447ff,0 9px 18px rgba(0,0,0,.44)!important;display:grid!important;grid-template-columns:70% 30%;width:78%!important;max-width:none!important;align-items:flex-end;gap:0;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.58em;transform:translate(.05em,-.78em) rotate(-22deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.34)!important}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word .split-actor-1 .split-actor-glyph{display:inline-block;transform:scale(var(--glyph-scale));transform-origin:left bottom;margin-right:-.035em}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word .split-actor-2{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.82em;transform:translate(.42em,.3em) rotate(-5deg) perspective(720px) rotateX(13deg) skewX(3deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 4px 0 rgba(17,19,21,.6),0 9px 16px rgba(0,0,0,.48)!important;filter:drop-shadow(0 3px 0 rgba(17,19,21,.36))}
.presenter-overlay.surface-path-object-10 .type.object-pinned-pixel-word .split-actor-2:after{content:"";display:block;width:34px;height:4px;margin:4px 0 0 .1em;background:#b8ff00;box-shadow:3px 2px 0 #2447ff;shape-rendering:crispEdges}
.presenter-overlay.surface-path-object-10 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-10 .presenter-word-1:after,.presenter-overlay.surface-path-object-10 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-11 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.085em;text-shadow:none!important;display:block!important;width:100%!important;max-width:none!important;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-11 .type.object-pinned-pixel-word .split-visual-actor.path-actor{position:absolute;inset:0;display:block;overflow:visible}
.presenter-overlay.surface-path-object-11 .type.object-pinned-pixel-word .path-glyph{position:absolute;display:inline-block;white-space:nowrap;line-height:.92;font-size:calc(1em * var(--glyph-scale));transform:rotate(var(--glyph-rotate));transform-origin:left bottom;color:#f2ecdf;-webkit-text-fill-color:#f2ecdf;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.38);}
.presenter-overlay.surface-path-object-11 .type.object-pinned-pixel-word .path-glyph:nth-child(n+5){text-shadow:2px 2px 0 #2447ff,0 4px 0 rgba(17,19,21,.58),0 9px 16px rgba(0,0,0,.48);filter:drop-shadow(0 3px 0 rgba(17,19,21,.34))}
.presenter-overlay.surface-path-object-11 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-11 .presenter-word-1:after,.presenter-overlay.surface-path-object-11 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-12 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.09em;text-shadow:none!important;display:block!important;width:100%!important;max-width:none!important;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-12 .type.object-pinned-pixel-word .split-visual-actor.path-actor{position:absolute;inset:0;display:block;overflow:visible}
.presenter-overlay.surface-path-object-12 .type.object-pinned-pixel-word .path-glyph{position:absolute;display:inline-block;white-space:nowrap;line-height:.92;font-size:calc(1em * var(--glyph-scale));transform:rotate(var(--glyph-rotate));transform-origin:left bottom;color:#f2ecdf;-webkit-text-fill-color:#f2ecdf;text-shadow:2px 2px 0 #2447ff,0 6px 12px rgba(0,0,0,.34)}
.presenter-overlay.surface-path-object-12 .type.object-pinned-pixel-word .path-glyph:nth-child(n+5){text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.64),0 6px 15px rgba(0,0,0,.44);filter:drop-shadow(0 3px 0 rgba(17,19,21,.38));mix-blend-mode:screen}
.presenter-overlay.surface-path-object-12 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-12 .presenter-word-1:after,.presenter-overlay.surface-path-object-12 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-13 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.09em;text-shadow:none!important;display:flex!important;width:82%!important;max-width:none!important;align-items:flex-end;justify-content:space-between;gap:.02em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-13 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate}
.presenter-overlay.surface-path-object-13 .type.object-pinned-pixel-word .split-actor-1{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.62em;transform:translate(.05em,-.82em) rotate(-22deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.36)!important}
.presenter-overlay.surface-path-object-13 .type.object-pinned-pixel-word .split-actor-2{color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;font-size:.76em;transform:translate(-.05em,.22em) rotate(-4deg) perspective(720px) rotateX(16deg) skewX(3deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.62),0 8px 15px rgba(0,0,0,.46)!important;filter:drop-shadow(0 3px 0 rgba(17,19,21,.38))}
.presenter-overlay.surface-path-object-13 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-13 .presenter-word-1:after,.presenter-overlay.surface-path-object-13 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-14 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.08em;text-shadow:none!important;display:flex!important;width:82%!important;max-width:none!important;align-items:flex-end;justify-content:space-between;gap:.02em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-14 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.9;isolation:isolate;padding:.03em .08em .02em;background:#f2ecdf;color:#111315;-webkit-text-fill-color:#111315;clip-path:polygon(0 9%,96% 0,100% 86%,6% 100%);box-shadow:4px 4px 0 #2447ff;}
.presenter-overlay.surface-path-object-14 .type.object-pinned-pixel-word .split-actor-1{font-size:.62em;transform:translate(.05em,-.82em) rotate(-22deg);transform-origin:left bottom;box-shadow:3px 3px 0 #2447ff;}
.presenter-overlay.surface-path-object-14 .type.object-pinned-pixel-word .split-actor-2{font-size:.76em;transform:translate(-.05em,.22em) rotate(-4deg) perspective(720px) rotateX(16deg) skewX(3deg);transform-origin:left bottom;box-shadow:4px 4px 0 #2447ff,0 6px 12px rgba(0,0,0,.38);}
.presenter-overlay.surface-path-object-14 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-14 .presenter-word-1:after,.presenter-overlay.surface-path-object-14 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-15 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.08em;text-shadow:none!important;display:flex!important;width:82%!important;max-width:none!important;align-items:flex-end;justify-content:space-between;gap:.02em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-15 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.9;isolation:isolate;padding:.03em .08em .02em;background:#f2ecdf;color:#111315;-webkit-text-fill-color:#111315;clip-path:polygon(0 9%,96% 0,100% 86%,6% 100%);box-shadow:4px 4px 0 #2447ff;}
.presenter-overlay.surface-path-object-15 .type.object-pinned-pixel-word .split-actor-1{font-size:.62em;transform:translate(.05em,-.82em) rotate(-22deg);transform-origin:left bottom;box-shadow:3px 3px 0 #2447ff;}
.presenter-overlay.surface-path-object-15 .type.object-pinned-pixel-word .split-actor-2{font-size:.72em;transform:translate(-1.05em,.22em) rotate(-4deg) perspective(720px) rotateX(16deg) skewX(3deg);transform-origin:left bottom;box-shadow:4px 4px 0 #2447ff,0 6px 12px rgba(0,0,0,.38);border-right:4px solid #b8ff00;border-bottom:4px solid #b8ff00;padding-right:.12em;padding-bottom:.05em;}
.presenter-overlay.surface-path-object-15 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-15 .presenter-word-1:after,.presenter-overlay.surface-path-object-15 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-16 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.085em;text-shadow:none!important;display:block!important;width:100%!important;max-width:none!important;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-16 .type.object-pinned-pixel-word .split-visual-actor.path-actor{position:absolute;inset:0;display:block;overflow:visible;white-space:nowrap}
.presenter-overlay.surface-path-object-16 .type.object-pinned-pixel-word .path-glyph{position:absolute;display:inline-block;white-space:nowrap;line-height:.9;font-size:calc(1em * var(--glyph-scale));transform:rotate(var(--glyph-rotate));transform-origin:left bottom;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;text-shadow:2px 2px 0 #2447ff,0 5px 12px rgba(0,0,0,.34)!important}
.presenter-overlay.surface-path-object-16 .type.object-pinned-pixel-word .path-glyph:nth-child(n+5){text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.58),0 6px 13px rgba(0,0,0,.38)!important;filter:drop-shadow(0 2px 0 rgba(17,19,21,.28))}
.presenter-overlay.surface-path-object-16 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-16 .presenter-word-1:after,.presenter-overlay.surface-path-object-16 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-17 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.095em;text-shadow:2px 2px 0 #2447ff,0 7px 14px rgba(0,0,0,.34)!important;display:flex!important;width:100%!important;max-width:none!important;align-items:flex-end;justify-content:flex-start!important;gap:.06em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-17 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.9;isolation:isolate;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important}
.presenter-overlay.surface-path-object-17 .type.object-pinned-pixel-word .split-actor-1{font-size:.72em;transform:rotate(-13deg) translateY(-.06em);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 6px 12px rgba(0,0,0,.34)!important}
.presenter-overlay.surface-path-object-17 .type.object-pinned-pixel-word .split-actor-2{font-size:.78em;transform:rotate(-5deg) translate(.06em,.08em);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.56),0 7px 14px rgba(0,0,0,.38)!important;filter:drop-shadow(0 2px 0 rgba(17,19,21,.28))}
.presenter-overlay.surface-path-object-17 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-17 .presenter-word-1:after,.presenter-overlay.surface-path-object-17 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-18 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.09em;text-shadow:none!important;display:flex!important;width:68%!important;max-width:none!important;align-items:flex-end;justify-content:space-between!important;gap:.02em;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-18 .type.object-pinned-pixel-word .split-visual-actor{display:inline-block;position:relative;white-space:nowrap;line-height:.92;isolation:isolate;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important}
.presenter-overlay.surface-path-object-18 .type.object-pinned-pixel-word .split-actor-1{font-size:.70em;transform:translate(.05em,-.55em) rotate(-17deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 6px 12px rgba(0,0,0,.34)!important}
.presenter-overlay.surface-path-object-18 .type.object-pinned-pixel-word .split-actor-2{font-size:.78em;transform:translate(.06em,.08em) rotate(-5deg) perspective(720px) rotateX(10deg);transform-origin:left bottom;text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.56),0 7px 14px rgba(0,0,0,.38)!important;filter:drop-shadow(0 2px 0 rgba(17,19,21,.28))}
.presenter-overlay.surface-path-object-18 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-18 .presenter-word-1:after,.presenter-overlay.surface-path-object-18 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-19 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.075em;text-shadow:none!important;display:block!important;width:100%!important;max-width:none!important;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-19 .type.object-pinned-pixel-word .split-visual-actor.path-actor{position:absolute;inset:0;display:block;overflow:visible;white-space:nowrap}
.presenter-overlay.surface-path-object-19 .type.object-pinned-pixel-word .path-glyph{position:absolute;display:inline-block;white-space:nowrap;line-height:.9;font-size:calc(1em * var(--glyph-scale));transform:rotate(var(--glyph-rotate));transform-origin:left bottom;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;text-shadow:2px 2px 0 #2447ff,0 5px 11px rgba(0,0,0,.34)!important}
.presenter-overlay.surface-path-object-19 .type.object-pinned-pixel-word .path-glyph:nth-child(n+5){text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.58),0 6px 12px rgba(0,0,0,.38)!important;filter:drop-shadow(0 2px 0 rgba(17,19,21,.28))}
.presenter-overlay.surface-path-object-19 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-19 .presenter-word-1:after,.presenter-overlay.surface-path-object-19 .presenter-word-2:after{display:none!important}
.presenter-overlay.surface-path-object-20 .type.object-pinned-pixel-word{background:transparent!important;background-image:none!important;padding:0!important;clip-path:none!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#f2ecdf!important;font-family:font-type-pixel-correction!important;font-weight:880;letter-spacing:-.075em;text-shadow:none!important;display:block!important;width:100%!important;max-width:none!important;transform:none!important;transform-origin:left bottom}
.presenter-overlay.surface-path-object-20 .type.object-pinned-pixel-word .split-visual-actor.flow-path-actor{position:relative;display:inline-flex;align-items:flex-end;overflow:visible;white-space:nowrap;line-height:.9;isolation:isolate}
.presenter-overlay.surface-path-object-20 .type.object-pinned-pixel-word .flow-path-glyph{display:inline-block;position:relative;white-space:nowrap;font-size:calc(1em * var(--glyph-scale));transform:translate(var(--glyph-dx),var(--glyph-dy)) rotate(var(--glyph-rotate));transform-origin:left bottom;color:#f2ecdf!important;-webkit-text-fill-color:#f2ecdf!important;text-shadow:1px 1px 0 #2447ff,0 3px 8px rgba(0,0,0,.32)!important;margin-right:-.045em}
.presenter-overlay.surface-path-object-20 .type.object-pinned-pixel-word .flow-path-glyph:nth-child(n+5){text-shadow:2px 2px 0 #2447ff,0 3px 0 rgba(17,19,21,.58),0 6px 12px rgba(0,0,0,.38)!important;filter:drop-shadow(0 2px 0 rgba(17,19,21,.28))}
.presenter-overlay.surface-path-object-20 .presenter-word-1{color:#b8ff00!important;-webkit-text-fill-color:#b8ff00!important;font-size:23px!important;letter-spacing:-.035em;text-shadow:1px 1px 0 #111315!important;display:block!important;transform:none!important}
.presenter-overlay.surface-path-object-20 .presenter-word-1:after,.presenter-overlay.surface-path-object-20 .presenter-word-2:after{display:none!important}
.full-package.evidence-bound-pixel-choice-funnel .type.funnel-choice-word{color:#111315!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.055em;text-shadow:2px 2px 0 #f4f1e8!important;white-space:nowrap;overflow:visible}
.full-package.evidence-bound-pixel-choice-funnel .type.funnel-output-block{color:#f4f1e8!important;background:#2447ff!important;padding:.04em .12em!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.065em;text-shadow:2px 2px 0 #111315!important;filter:drop-shadow(7px 8px 0 rgba(17,19,21,.28));white-space:nowrap;overflow:visible;clip-path:polygon(0 8%,90% 2%,94% 24%,100% 32%,95% 46%,100% 58%,94% 70%,98% 88%,4% 100%)}
.type-only.proof-sheet-corruption-reveal .type.proof-sheet-intro,.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-intro{color:#111315!important;font-weight:760;letter-spacing:-.03em;text-shadow:none!important}
.type-only.proof-sheet-corruption-reveal .type.proof-sheet-aligned-prefix,.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-aligned-prefix{color:#111315!important;font-weight:900;letter-spacing:-.075em;text-shadow:3px 3px 0 rgba(36,71,255,.2)!important;white-space:nowrap;overflow:visible}
.type-only.proof-sheet-corruption-reveal .type.proof-sheet-waste-reveal,.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-waste-reveal{color:#ff4b3e!important;font-family:font-type-pixel-correction!important;font-weight:900;letter-spacing:-.06em;text-shadow:3px 3px 0 #111315!important;white-space:nowrap;overflow:visible}
.type-only.proof-sheet-corruption-reveal .type.proof-sheet-waste-reveal:before,.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-waste-reveal:before{content:"";position:absolute;left:35%;top:14%;width:62%;height:15%;background:repeating-linear-gradient(162deg,transparent 0 4px,#ff4b3e 4px 6px,#111315 6px 8px,transparent 8px 12px);clip-path:polygon(0 18%,100% 0,92% 100%,8% 82%);opacity:.8;pointer-events:none}
.type-only.proof-sheet-corruption-reveal .type.proof-sheet-waste-reveal:after,.type-only.master-type-contradiction-proofing-repair .type.proof-sheet-waste-reveal:after{content:"";position:absolute;right:1%;top:4%;width:58%;height:52%;background:repeating-linear-gradient(158deg,transparent 0 8px,rgba(242,236,223,.94) 8px 10px,transparent 10px 15px);clip-path:polygon(8% 0,100% 0,88% 100%,0 64%);pointer-events:none}
.type-only.proof-sheet-corruption-reveal .proof-sheet-handoff-pixel,.type-only.master-type-contradiction-proofing-repair .proof-sheet-handoff-pixel{background:#ff4b3e;border:1px solid #111315;box-shadow:2px 2px 0 rgba(17,19,21,.5);transform:rotate(-8deg);pointer-events:none}
.presenter-overlay.presenter-typographic-stage-v5 .headline.covacut-desk-object{color:#f3eddf!important;-webkit-text-fill-color:#f3eddf!important;text-shadow:0 .035em #d1c7b3,0 .07em #928875,0 .105em #4b4943,0 .14em 18px rgba(0,0,0,.72)!important;transform:perspective(720px) rotateX(7deg) skewX(3deg);transform-origin:right bottom}
.presenter-overlay.presenter-typographic-stage-v5 .presenter-word-2.covacut-mic-rail-word{color:#f3eddf!important;-webkit-text-fill-color:#f3eddf!important;text-shadow:2px 0 #111315,0 7px 20px rgba(0,0,0,.7)!important}
.presenter-overlay.presenter-typographic-stage-v5 .presenter-word-2a.covacut-mic-rail-segment-a,.presenter-overlay.presenter-typographic-stage-v5 .presenter-word-2b.covacut-mic-rail-segment-b{color:#f3eddf!important;-webkit-text-fill-color:#f3eddf!important;background:transparent!important;padding:0!important;font-weight:820;letter-spacing:-.1em;text-shadow:2px 0 #111315,0 6px 16px rgba(0,0,0,.68)!important;transform-origin:left bottom}
.presenter-overlay.presenter-typographic-stage-v5 .presenter-word-2a.covacut-mic-rail-segment-a{transform:rotate(-10deg) skewY(-1deg)}
.presenter-overlay.presenter-typographic-stage-v5 .presenter-word-2b.covacut-mic-rail-segment-b{transform:rotate(-8deg) skewY(-1deg);margin-left:-.02em}
.presenter-overlay.presenter-typographic-stage-v5 .headline.covacut-desk-object:after{content:"";position:absolute;left:9%;right:1%;bottom:3%;height:2px;background:rgba(17,19,21,.38);transform:skewX(-10deg);box-shadow:0 2px 0 rgba(243,237,223,.26);pointer-events:none}
.editorial-anchor-surface.presenter-letterpress-desk-v1{filter:contrast(1.06) saturate(.78) brightness(.98)}
.editorial-anchor-surface.presenter-letterpress-desk-v1.desk-letterpress-sheet{box-shadow:-7px -3px 0 rgba(17,19,21,.28),0 4px 10px rgba(17,19,21,.32);transform:perspective(720px) rotateX(5deg) rotateZ(-2deg);transform-origin:right bottom}
.presenter-overlay.presenter-letterpress-desk-v1 .type.letterpress-monitor-pixel{color:#d7ff45!important;-webkit-text-fill-color:#d7ff45!important;background:transparent!important;padding:0!important;font-weight:760;letter-spacing:-.045em;text-shadow:1px 1px 0 #111315!important;mix-blend-mode:screen;transform:rotate(-2deg);transform-origin:left center}
.presenter-overlay.presenter-letterpress-desk-v1 .type.letterpress-mic-ink{background:transparent!important;padding:0!important;overflow:visible;white-space:nowrap;word-break:keep-all;color:#d2b45e!important;-webkit-text-fill-color:#d2b45e!important;font-weight:720;letter-spacing:-.04em;text-shadow:1px 1px 0 rgba(17,19,21,.9)!important;mix-blend-mode:screen}
.presenter-overlay.presenter-letterpress-desk-v1 .type.letterpress-mic-ink .split-visual-actor.mic-ink-path{position:absolute;inset:0;display:block;overflow:visible;white-space:nowrap}
.presenter-overlay.presenter-letterpress-desk-v1 .type.letterpress-mic-ink .path-glyph{position:absolute;display:inline-block;white-space:nowrap;line-height:.9;font-size:calc(1em * var(--glyph-scale));transform:rotate(var(--glyph-rotate));transform-origin:left bottom;color:#d2b45e!important;-webkit-text-fill-color:#d2b45e!important;text-shadow:1px 1px 0 rgba(17,19,21,.88)!important}
.presenter-overlay.presenter-letterpress-desk-v1 .headline.letterpress-desk-ink{color:#111315!important;-webkit-text-fill-color:#111315!important;background:transparent!important;padding:0!important;font-weight:900;letter-spacing:-.085em;text-shadow:1px 1px 0 rgba(243,237,223,.4)!important;mix-blend-mode:multiply;transform:perspective(820px) rotateX(8deg) skewX(-4deg);transform-origin:left bottom}
`;
const sections = shot.candidates.map((candidate) => {
  const generatedSurfaceEnabled = candidate.sceneGraph?.generatedVisualSurface === true
    || candidate.sceneGraph?.nodes?.some((node) => node.id === "generated-visual-layer" || node.role === "generated-visual-layer" || node.objectAnchor === "generated-visual-layer" || String(node.objectBinding || "").startsWith("generated-layer:"));
  const generatedSurfaceAudit = auditGeneratedVisualSurfaceGraph({nodes: candidate.sceneGraph?.nodes, enabled: generatedSurfaceEnabled});
  if (generatedSurfaceAudit.status === "BLOCK") throw new Error(`generated-visual-surface-policy-blocked:${candidate.candidateId}:${generatedSurfaceAudit.failures.join(",")}`);
  const mode = candidate.sceneGraph.editMode;
  const bgId = candidate.sceneGraph.nodes.find((node) => node.id === "background")?.assetId || "";
  const primaryId = candidate.sceneGraph.primaryMaterialId || "";
  const primaryDark = /^key-bg-/u.test(primaryId);
  const operationBound = Boolean(candidate.sceneGraph.operationTraceBinding);
  const operationBeat = candidate.sceneGraph.nodes.find((node) => node.type === "source-bound-operation-stage")?.evidenceBeat || null;
  const light = operationBound || candidate.sceneGraph.nodes.some((node) => node.type === "editorial-correction-mark") || (!primaryDark && /warm|cream|archive/iu.test(bgId));
  const sourceDocument = /source-(?:documentary-|network-article-context)/u.test(primaryId);
  const sourceDocumentary = /^source-documentary-/u.test(primaryId);
  const nodes = candidate.sceneGraph.nodes.map((node) => nodeMarkup(node, mode)).join("\n");
  const refinedReadingProof = candidate.sceneGraph.fullPackageArchetype === "source-reading-friction"
    && candidate.sceneGraph.candidateSetPolicy?.mode === "critic-selected-single-mature-refinement";
  return `<section class="frame ${mode} ${candidate.sceneGraph.visualFamily || ""} ${candidate.sceneGraph.presenterCompositionVariant || ""} ${candidate.sceneGraph.fullPackageArchetype || ""} ${candidate.sceneGraph.screenPackagingArchetype || ""} ${candidate.sceneGraph.screenPackagingDensity || ""} ${light ? "light" : "dark"} ${sourceDocument ? "source-document" : ""} ${sourceDocumentary ? "source-documentary" : ""} ${operationBeat ? `operation-${operationBeat}` : ""}" id="candidate-${candidate.candidateId}">${nodes}${refinedReadingProof ? "" : '<div class="paper-grain"></div>'}</section>`;
}).join("\n");
const htmlPath = path.join(outputDir, "candidates.html");
fs.writeFileSync(htmlPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${fontFaces}\n${structuralCss}\n${mediaBoundaryCss}\n${operationStageCss}\n${sourcePointerCss}\n${correctionMarkCss}\n${anchorSurfaceCss}\n${preferenceSurfaceCss}\n${plainPaperCss}\n${screenContextStageCss}\n${glyphActorCss}\n${presenterTypographyCss}\n${frameBaseCss}
.type-only .type:not(.editable-shadow):not(.type-correction-waste):not(.type-correction-prefix){color:#f1eadc!important;background:transparent;padding:0;height:auto;text-shadow:0 4px 24px rgba(0,0,0,.75)}.type.editable-shadow{opacity:0!important;pointer-events:none;background:transparent!important}.generated-glyph img{mix-blend-mode:normal}.focus-ring{border:3px solid #c9ef39;background:linear-gradient(90deg,rgba(201,239,57,.18),rgba(201,239,57,.035));box-shadow:0 0 0 1px rgba(8,10,11,.85),0 8px 22px rgba(8,10,11,.18);mix-blend-mode:multiply}.focus-ring:after{content:"";position:absolute;right:-9px;top:50%;width:18px;height:18px;transform:translateY(-50%);border-radius:50%;background:#c9ef39;border:3px solid #111315}.atlas-cell{overflow:hidden;mix-blend-mode:multiply}.atlas-cell img{position:absolute;object-fit:fill}.entity-imprint{mix-blend-mode:multiply;filter:grayscale(1) contrast(1.3);transform:rotate(-3deg);opacity:.64}.dark .entity-imprint,.entity-imprint.tone-light{mix-blend-mode:screen;filter:grayscale(1) invert(1) contrast(1.2);opacity:.78}.dark .entity-imprint.preserve-light,.entity-imprint.tone-light.preserve-light{filter:grayscale(1) contrast(1.2)}.paper-grain{position:absolute;inset:0;z-index:90;pointer-events:none;opacity:.08;background-image:radial-gradient(circle at 1px 1px,#111 1px,transparent 1.25px);background-size:7px 7px;mix-blend-mode:multiply}.presenter-overlay .paper-grain{opacity:.025}.screen-demo .paper-grain,.presenter-clean .paper-grain{display:none}
.frame.type-only.light .type.type-correction-intro{color:#f2ecdf!important;text-shadow:1px 1px 0 #111315!important;letter-spacing:-.04em}
${anchorPrimitiveFinalCss}
</style></head><body>${sections}</body></html>`);

const browser = await chromium.launch({headless: true});
const previews = [];
try {
  const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
  await page.goto(pathToFileURL(htmlPath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts.ready);
  for (const candidate of shot.candidates) {
    const output = path.join(outputDir, `${candidate.candidateId}.png`);
    await page.locator(`#candidate-${candidate.candidateId}`).screenshot({path: output, type: "png"});
    previews.push({candidateId: candidate.candidateId, publicUrl: `/${outputRelative}/${path.basename(output)}`, sha256: sha256(fs.readFileSync(output)), width: 960, height: 540});
  }
} finally {
  await browser.close();
}

const columns = shot.candidates.length <= 4 ? 2 : 3;
const tileWidth = 480;
const tileHeight = 270;
const tiles = await Promise.all(previews.map((item) => sharp(publicFile(item.publicUrl)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
const contactPath = path.join(outputDir, "contact-sheet.png");
await sharp({create: {width: columns * tileWidth, height: Math.ceil(tiles.length / columns) * tileHeight, channels: 4, background: "#090b0c"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight})))
  .png()
  .toFile(contactPath);
const contact = {publicUrl: `/${outputRelative}/contact-sheet.png`, sha256: sha256(fs.readFileSync(contactPath))};
// Pixel output is also a function of the compositor implementation and the
// produced PNGs. Do not include mutable candidate metadata here: critic
// write-back updates screening/review fields and may normalize the scene graph
// without changing pixels. Including candidateSha256 would then make the
// second sample look like a new render and permanently hold calibration.
const renderSourceSha256 = sha256({
  // The PNG hashes capture every compositor/CSS change that alters visible
  // pixels. Hashing the entire renderer source invalidated unrelated shots
  // whenever another primitive's CSS changed, forcing needless reviews.
  previewSha256s: previews.map((preview) => preview.sha256),
  contactSha256: contact.sha256,
});
const candidateSourceSha256 = sha256(shot.candidates.map((candidate) => candidate.candidateSha256));
const now = new Date().toISOString();
const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const target = next.library.assets.find((asset) => asset.id === shot.id);
  const sameRender = target.candidateRender?.renderSourceSha256 === renderSourceSha256
    && target.candidateRender?.candidateSourceSha256 === candidateSourceSha256;
  const previewById = new Map(previews.map((item) => [item.candidateId, item]));
  for (const candidate of target.candidates) {
    const preview = previewById.get(candidate.candidateId);
    if (!preview) continue;
    candidate.preview = {kind: "scene-graph", ...preview};
    // Re-rendering the same pixels is a compositor bookkeeping operation, not
    // a new visual sample. Preserve the critic result and its stability window
    // when the render hash is unchanged; only a pixel change invalidates it.
    candidate.screening = sameRender
      ? candidate.screening
      : {...candidate.screening, status: "ready-for-visual-critic", score: null};
  }
  target.candidateRender = {contract: "A1ShotCandidateRender/v1", candidateSourceSha256, renderSourceSha256, contact, previews, renderedAt: now};
  if (!sameRender) {
    target.visualCritic = null;
    delete next.production.maturityLoop.shotReports[shot.shotDemand.shotId];
  }
  target.status = "ready-for-review";
  target.review = {status: "pending", note: `${previews.length} 个真实像素候选已渲染，进入自动视觉红队。`, reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
  next.production.maturityLoop.status = "critic-running";
  next.production.maturityLoop.nextAction = `criticize-shot-candidates:${shot.shotDemand.shotId}`;
  const event = createProductionEvent({workspace: current, action: "shot-scene-graph-candidates-rendered", targetId: target.id, payload: {renderSourceSha256, contactSha256: contact.sha256, candidateCount: previews.length}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return recalculated;
});

console.log(JSON.stringify({status: "READY_FOR_VISUAL_CRITIC", shotId: shot.shotDemand.shotId, previews: previews.length, candidateSourceSha256, renderSourceSha256, contact, workspaceSha256: updated.workspaceSha256}, null, 2));
