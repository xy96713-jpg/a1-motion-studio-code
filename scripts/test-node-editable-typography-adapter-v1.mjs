#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {editableTypographyNodeAdapterV1, executeEditableTypographyNode} from "../apps/studio-next/src/lib/a1-node-editable-typography-adapter-v1.mjs";
import {compileNodeWorkflow, nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {compileFontkitGlyphPathManifestV1} from "../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs";

const requireApp = createRequire(new URL("../apps/studio-next/package.json", import.meta.url));
const sharp = requireApp("sharp");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fontPath = path.resolve(import.meta.dirname, "../apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const evidenceRoot = path.resolve(import.meta.dirname, "../work/typography-visual-capability-v1");
fs.mkdirSync(evidenceRoot, {recursive: true});
const artifactRoot = fs.mkdtempSync(path.join(evidenceRoot, "adapter-tests-"));
const parameters = {
  exactCopy: "准确文字 A800", copyLock: {status: "LOCKED", sha256: sha("准确文字 A800")}, purpose: "SOURCE_EXACT",
  canvas: {width: 640, height: 360},
  fontBindings: [{id: "explicit-heavy", path: fontPath, sha256: sha(fs.readFileSync(fontPath)), postscriptName: "SourceHanSansCN-Heavy", weight: 900}],
  runs: [
    {text: "准确文字", fontId: "explicit-heavy", x: 35, baselineY: 100, fontSize: 56, letterSpacing: 2, fill: "#ffffff"},
    {text: " A800", fontId: "explicit-heavy", x: 35, baselineY: 190, fontSize: 48, letterSpacing: 0, fill: "#ff6600"},
  ],
};
const {definitions} = createNodeAdapterRegistry({"editable-typography": editableTypographyNodeAdapterV1});
const graphFor = (p = parameters) => compileNodeWorkflow({projectId: "type-test", workspaceSha256: "1".repeat(64), shots: [
  {id: "exact-copy", source: p.exactCopy, modules: {material: false, recording: false, typography: false, "editable-typography": true}, moduleInputs: {"editable-typography": p}},
]}, null, {moduleDefinitions: definitions});
const getNode = (graph) => graph.nodes.find((node) => node.module === "editable-typography");
const reject = async (mutate, reason) => {
  const changed = structuredClone(parameters); mutate(changed);
  assert.equal((await executeEditableTypographyNode(getNode(graphFor(changed)), {artifactRoot})).reason, reason);
};

try {
  const graph = graphFor(), node = getNode(graph);
  let pulses = 0;
  const result = await executeEditableTypographyNode(node, {artifactRoot, heartbeat: () => { pulses++; }});
  assert.equal(result.state, "needs-review", JSON.stringify(result));
  assert.equal(result.visualApproval, "NOT_GRANTED");
  assert.equal(result.productionAdmission, false);
  assert.equal(pulses, 2);
  assert.equal(result.artifactManifest.artifacts.length, 3);
  node.state = "needs-review"; node.result = result;
  const checked = await acceptNodeArtifacts(graph, node.id, {artifactRoot, reviewerId: "independent-byte-test"});
  assert.equal(getNode(checked).state, "succeeded");
  assert.equal(getNode(checked).acceptance.visualApproval, "NOT_GRANTED");
  const file = (role) => path.join(artifactRoot, result.artifactManifest.artifacts.find((artifact) => artifact.role === role).path);
  const pngFile = file("typography-overlay"), svgFile = file("editable-typography");
  const {data, info} = await sharp(pngFile).raw().toBuffer({resolveWithObject: true});
  assert.equal(info.channels, 4);
  let whitePixels = 0, orangePixels = 0, transparentPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) transparentPixels++;
    if (data[i + 3] > 240 && data[i] === 255 && data[i + 1] === 255) whitePixels++;
    if (data[i + 3] > 240 && data[i] === 255 && data[i + 1] === 102) orangePixels++;
  }
  assert.ok(whitePixels > 100 && orangePixels > 100 && transparentPixels > 10000, "real independently positioned colored glyphs render onto alpha");
  const svg = fs.readFileSync(svgFile, "utf8");
  assert.match(svg, /<path /u); assert.doesNotMatch(svg, /<text|<image|font-family|@font-face/u);
  const plan = JSON.parse(fs.readFileSync(file("typography-layout"), "utf8"));
  assert.equal(plan.proofBoundary.liveText, false);
  assert.equal(plan.proofBoundary.generatedAppearanceReplacementAllowed, false);
  assert.equal(plan.glyphManifests[0].font.sha256, parameters.fontBindings[0].sha256);
  assert.equal(plan.glyphManifests[0].shaping.systemFontFallbackUsed, false);

  const artifactShaByRole = (value, role) => value.artifactManifest.artifacts.find((item) => item.role === role).sha256;
  const explicitOne = structuredClone(parameters);
  explicitOne.runs.forEach((run) => { run.horizontalScale = 1; });
  const explicitOneResult = await executeEditableTypographyNode(getNode(graphFor(explicitOne)), {artifactRoot});
  assert.equal(explicitOneResult.state, "needs-review");
  assert.equal(artifactShaByRole(explicitOneResult, "editable-typography"), artifactShaByRole(result, "editable-typography"),
    "horizontalScale=1 must preserve existing SVG bytes");
  assert.equal(artifactShaByRole(explicitOneResult, "typography-overlay"), artifactShaByRole(result, "typography-overlay"),
    "horizontalScale=1 must preserve existing PNG bytes");
  const explicitVerticalOne = structuredClone(parameters);
  explicitVerticalOne.runs.forEach((run) => { run.verticalScale = 1; });
  const explicitVerticalOneResult = await executeEditableTypographyNode(getNode(graphFor(explicitVerticalOne)), {artifactRoot});
  assert.equal(explicitVerticalOneResult.state, "needs-review");
  for (const role of ["editable-typography", "typography-overlay"]) assert.equal(artifactShaByRole(explicitVerticalOneResult, role), artifactShaByRole(result, role));
  const compressed = structuredClone(parameters);
  compressed.runs.forEach((run) => { run.horizontalScale = 0.75; });
  const compressedResult = await executeEditableTypographyNode(getNode(graphFor(compressed)), {artifactRoot});
  assert.equal(compressedResult.state, "needs-review");
  assert.notEqual(artifactShaByRole(compressedResult, "editable-typography"), artifactShaByRole(result, "editable-typography"));
  const compressedPlanFile = path.join(artifactRoot, compressedResult.artifactManifest.artifacts.find((item) => item.role === "typography-layout").path);
  const compressedPlan = JSON.parse(fs.readFileSync(compressedPlanFile, "utf8"));
  assert.deepEqual(compressedPlan.parameters.runs.map((run) => run.horizontalScale), [0.75, 0.75]);
  const disclosed = structuredClone(parameters);
  disclosed.editorialAnnotations = [{id: "generated-art-note", kind: "GENERATED_ILLUSTRATION_DISCLOSURE", text: "示意图",
    fontId: "explicit-heavy", x: 530, baselineY: 332, fontSize: 22, letterSpacing: 0, fill: "#ffffff"}];
  const disclosedResult = await executeEditableTypographyNode(getNode(graphFor(disclosed)), {artifactRoot});
  assert.equal(disclosedResult.state, "needs-review");
  assert.equal(disclosed.exactCopy, parameters.exactCopy, "disclosure stays outside source-exact copy");
  const disclosedSvg = fs.readFileSync(path.join(artifactRoot, disclosedResult.artifactManifest.artifacts.find((item) => item.role === "editable-typography").path), "utf8");
  assert.match(disclosedSvg, /data-annotation-kind="GENERATED_ILLUSTRATION_DISCLOSURE" data-annotation-text="示意图"/u);
  assert.notEqual(artifactShaByRole(disclosedResult, "typography-overlay"), artifactShaByRole(result, "typography-overlay"));
  const disclosedPlan = JSON.parse(fs.readFileSync(path.join(artifactRoot, disclosedResult.artifactManifest.artifacts.find((item) => item.role === "typography-layout").path), "utf8"));
  assert.equal(disclosedPlan.proofBoundary.editorialAnnotationsAreSeparateFromSourceCopy, true);
  assert.equal(disclosedPlan.proofBoundary.generatedIllustrationDisclosureCount, 1);
  assert.equal(disclosedPlan.editorialAnnotationGlyphManifests[0].glyphs.map((glyph) => glyph.codePoint).length, 3);
  const layered = structuredClone(disclosed);
  layered.runs[0].plane = "behind-artwork";
  layered.runs[1].plane = "front-artwork";
  layered.editorialAnnotations[0].plane = "front-artwork";
  const layeredResult = await executeEditableTypographyNode(getNode(graphFor(layered)), {artifactRoot});
  assert.equal(layeredResult.state, "needs-review");
  assert.equal(layeredResult.artifactManifest.artifacts.length, 7);
  const rolePath = (value, role) => path.join(artifactRoot, value.artifactManifest.artifacts.find((item) => item.role === role).path);
  const behindSvg = fs.readFileSync(rolePath(layeredResult, "typography-plane-behind-artwork"), "utf8");
  const frontSvg = fs.readFileSync(rolePath(layeredResult, "typography-plane-front-artwork"), "utf8");
  assert.match(behindSvg, /data-copy="准确文字"/u);
  assert.doesNotMatch(behindSvg, /data-copy=" A800"|data-annotation-text/u);
  assert.match(frontSvg, /data-copy=" A800"/u);
  assert.match(frontSvg, /data-annotation-text="示意图"/u);
  const layeredPlan = JSON.parse(fs.readFileSync(rolePath(layeredResult, "typography-layout"), "utf8"));
  assert.deepEqual(layeredPlan.artworkPlanes.map((item) => item.plane), ["behind-artwork", "front-artwork"]);
  const allExplicitVerticalOne = structuredClone(layered);
  [...allExplicitVerticalOne.runs, ...allExplicitVerticalOne.editorialAnnotations].forEach((run) => { run.verticalScale = 1; });
  const allExplicitOneResult = await executeEditableTypographyNode(getNode(graphFor(allExplicitVerticalOne)), {artifactRoot});
  assert.equal(allExplicitOneResult.state, "needs-review");
  for (const artifact of layeredResult.artifactManifest.artifacts.filter((entry) => ["SVG", "IMAGE"].includes(entry.kind))) {
    assert.equal(artifactShaByRole(allExplicitOneResult, artifact.role), artifact.sha256, "default=1 preserves full and plane SVG/PNG including annotations");
  }
  const pixelEvidence = async (input) => {
    const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    let visiblePixels = 0, transparentPixels = 0, alphaMax = 0;
    const b = {minX: info.width, minY: info.height, maxX: -1, maxY: -1};
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      alphaMax = Math.max(alphaMax, alpha);
      if (!alpha) { transparentPixels++; continue; }
      visiblePixels++; b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
    }
    return {width: info.width, height: info.height, channels: info.channels, visiblePixels, transparentPixels, alphaMax,
      inkBounds: visiblePixels ? b : null, rawSha256: sha(data)};
  };
  const frozenBytes = fs.readFileSync(path.resolve(import.meta.dirname, "../fixtures/typography-inputs.json"));
  assert.equal(sha(frozenBytes), "a1f83d50f5c2d4e7cf60a2aafc60113222612b86f5d51cdd87e1ba1f6cb4030f");
  const frozenEvidence = [];
  for (const fixture of JSON.parse(frozenBytes).inputs.filter((item) => ["P22", "P23", "P24"].includes(item.id))) {
    const p = structuredClone(fixture.parameters);
    // P23 omits this field in the frozen packet. Recover only from SHA-locked runs.
    p.exactCopy ??= p.runs.map((run) => run.text).join("");
    assert.equal(sha(p.exactCopy), p.copyLock.sha256);
    p.fontBindings.forEach((font) => { font.path = path.join(path.dirname(fontPath), path.basename(font.path)); });
    const output = await executeEditableTypographyNode(getNode(graphFor(p)), {artifactRoot});
    assert.equal(output.state, "needs-review", JSON.stringify(output));
    const plan = JSON.parse(fs.readFileSync(rolePath(output, "typography-layout"), "utf8"));
    assert.equal(plan.glyphManifests.map((m) => m.exactCopy).join(""), p.exactCopy);
    assert.equal(sha(plan.parameters.exactCopy), p.copyLock.sha256);
    for (const m of [...plan.glyphManifests, ...plan.editorialAnnotationGlyphManifests]) {
      assert.equal(m.font.sha256, p.fontBindings.find((font) => font.id === m.font.fontId).sha256);
      assert.equal(m.glyphs.map((glyph) => glyph.characters).join(""), m.exactCopy);
    }
    const svg = fs.readFileSync(rolePath(output, "editable-typography"), "utf8");
    assert.doesNotMatch(svg, /<text|<image|<rect|font-family|@font-face/u);
    const imageEvidence = [];
    for (const artifact of output.artifactManifest.artifacts.filter((item) => item.kind === "IMAGE")) {
      const file = path.join(artifactRoot, artifact.path), pixels = await pixelEvidence(file);
      assert.equal(sha(fs.readFileSync(file)), artifact.sha256);
      assert.equal(pixels.channels, 4);
      assert.equal(pixels.width, p.canvas.width); assert.equal(pixels.height, p.canvas.height);
      assert.ok(pixels.transparentPixels > 0);
      assert.ok(pixels.visiblePixels > 0);
      imageEvidence.push({role: artifact.role, path: path.relative(evidenceRoot, file), sha256: artifact.sha256, ...pixels});
    }
    const runEvidence = [];
    for (const [index, m] of plan.glyphManifests.entries()) {
      const group = svg.match(new RegExp(`<g id="run-${index}"[^>]*>[\\s\\S]*?</g>`, "u"))?.[0];
      assert.ok(group);
      const pixels = await pixelEvidence(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.canvas.width}" height="${p.canvas.height}">${group}</svg>`));
      assert.ok(pixels.visiblePixels > 0, `${fixture.id} run ${index} is visible`);
      const b = m.run.canvasInkBounds;
      for (const key of ["minX", "minY"]) assert.ok(Math.abs(pixels.inkBounds[key] - Math.floor(b[key])) <= 1);
      for (const key of ["maxX", "maxY"]) assert.ok(Math.abs(pixels.inkBounds[key] - (Math.ceil(b[key]) - 1)) <= 1);
      runEvidence.push({index, text: m.exactCopy, fontSha256: m.font.sha256, vectorInkBounds: b, ...pixels});
    }
    frozenEvidence.push({id: fixture.id, exactCopy: p.exactCopy, copySha256: p.copyLock.sha256,
      missingExactCopyRecoveredFromLockedRuns: fixture.parameters.exactCopy == null,
      artifacts: output.artifactManifest.artifacts, images: imageEvidence, runs: runEvidence});
  }
  const alphaParameters = structuredClone(layered);
  alphaParameters.runs.forEach((run) => { run.opacity = 0.5; });
  alphaParameters.editorialAnnotations[0].opacity = 0.25;
  const alphaOutput = await executeEditableTypographyNode(getNode(graphFor(alphaParameters)), {artifactRoot});
  assert.equal(alphaOutput.state, "needs-review");
  const opacityEvidence = [];
  for (const plane of ["behind-artwork", "front-artwork"]) {
    const pixels = await pixelEvidence(rolePath(alphaOutput, `typography-plane-${plane}-overlay`));
    assert.ok(pixels.visiblePixels > 0 && pixels.transparentPixels > 0);
    assert.ok(pixels.alphaMax >= 127 && pixels.alphaMax <= 128, "plane run opacity survives rasterization");
    opacityEvidence.push({plane, ...pixels});
  }
  const annotationPixels = await pixelEvidence(await sharp(rolePath(alphaOutput, "typography-plane-front-artwork-overlay"))
    .extract({left: 520, top: 300, width: 120, height: 60}).png().toBuffer());
  assert.ok(annotationPixels.alphaMax >= 63 && annotationPixels.alphaMax <= 64, "annotation quarter-opacity survives in the front plane");
  opacityEvidence.push({kind: "front-annotation-quarter-alpha", ...annotationPixels});
  const emptyPlane = structuredClone(parameters);
  emptyPlane.runs.forEach((run) => { run.plane = "front-artwork"; });
  const emptyOutput = await executeEditableTypographyNode(getNode(graphFor(emptyPlane)), {artifactRoot});
  assert.equal(emptyOutput.state, "needs-review");
  const emptyPixels = await pixelEvidence(rolePath(emptyOutput, "typography-plane-behind-artwork-overlay"));
  assert.equal(emptyPixels.visiblePixels, 0);
  assert.equal(emptyPixels.transparentPixels, emptyPixels.width * emptyPixels.height);
  opacityEvidence.push({kind: "empty-behind-plane", ...emptyPixels});
  const spaced = structuredClone(parameters);
  spaced.runs = [{...parameters.runs[0]}, {...parameters.runs[1], text: " "}, {...parameters.runs[1], text: "A800", x: 60}];
  const spacedOutput = await executeEditableTypographyNode(getNode(graphFor(spaced)), {artifactRoot});
  assert.equal(spacedOutput.state, "needs-review");
  const spacedPlan = JSON.parse(fs.readFileSync(rolePath(spacedOutput, "typography-layout"), "utf8"));
  assert.equal(spacedPlan.glyphManifests.map((m) => m.exactCopy).join(""), parameters.exactCopy);
  assert.equal(spacedPlan.glyphManifests[1].run.visibleGlyphCount, 0);
  await reject((p) => { p.runs[0].x = -20; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  await reject((p) => { p.runs[0].x = 620; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  await reject((p) => { p.runs[0].baselineY = 10; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  await reject((p) => { p.runs[0].baselineY = 360; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  await reject((p) => { p.runs[0].letterSpacing = -100; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  await reject((p) => { p.runs[0].rotation = 90; p.runs[0].baselineY = 300; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  const rotated = structuredClone(parameters);
  rotated.runs[0].rotation = 23; rotated.runs[0].x = 100;
  rotated.runs[0].verticalScale = 1.15;
  const rotatedOutput = await executeEditableTypographyNode(getNode(graphFor(rotated)), {artifactRoot});
  assert.equal(rotatedOutput.state, "needs-review");
  const rotatedPlan = JSON.parse(fs.readFileSync(rolePath(rotatedOutput, "typography-layout"), "utf8"));
  const rotatedSvg = fs.readFileSync(rolePath(rotatedOutput, "editable-typography"), "utf8");
  const rotatedGroup = rotatedSvg.match(/<g id="run-0"[^>]*>[\s\S]*?<\/g>/u)[0];
  const rotatedPixels = await pixelEvidence(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">${rotatedGroup}</svg>`));
  const rotatedBounds = rotatedPlan.glyphManifests[0].run.canvasInkBounds;
  for (const key of ["minX", "minY"]) assert.ok(Math.abs(rotatedPixels.inkBounds[key] - Math.floor(rotatedBounds[key])) <= 1);
  for (const key of ["maxX", "maxY"]) assert.ok(Math.abs(rotatedPixels.inkBounds[key] - (Math.ceil(rotatedBounds[key]) - 1)) <= 1);
  await reject((p) => { p.editorialAnnotations = [{...disclosed.editorialAnnotations[0], x: -20}]; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  for (const verticalScale of [0.49, 1.51, NaN, Infinity, "1.15"]) {
    await reject((p) => { p.runs[0].verticalScale = verticalScale; }, "TYPOGRAPHY_RUN_INVALID");
    await reject((p) => { p.editorialAnnotations = [{...disclosed.editorialAnnotations[0], verticalScale}]; }, "TYPOGRAPHY_EDITORIAL_ANNOTATION_INVALID");
  }
  await reject((p) => { p.runs[0].baselineY = 60; p.runs[0].verticalScale = 1.5; }, "TYPOGRAPHY_INK_OUTSIDE_CANVAS");
  const scaledAnnotation = structuredClone(alphaParameters);
  scaledAnnotation.editorialAnnotations[0].verticalScale = 1.15;
  const scaledAnnotationOutput = await executeEditableTypographyNode(getNode(graphFor(scaledAnnotation)), {artifactRoot});
  assert.equal(scaledAnnotationOutput.state, "needs-review");
  const scaledAnnotationPixels = await pixelEvidence(await sharp(rolePath(scaledAnnotationOutput, "typography-plane-front-artwork-overlay"))
    .extract({left: 520, top: 290, width: 120, height: 70}).png().toBuffer());
  assert.ok(scaledAnnotationPixels.visiblePixels > annotationPixels.visiblePixels);
  assert.ok(scaledAnnotationPixels.alphaMax >= 63 && scaledAnnotationPixels.alphaMax <= 64);
  opacityEvidence.push({kind: "vertical-scale-annotation-quarter-alpha", ...scaledAnnotationPixels});
  fs.writeFileSync(path.join(evidenceRoot, "pixel-evidence.json"), `${JSON.stringify({status: "PASS", fixtureSha256: sha(frozenBytes),
    scope: "ISOLATED_FONTKIT_SHARP_PIXELS_NO_BROWSER_NO_COMPOSITOR", frozen: frozenEvidence,
    boundaryChecks: ["left", "right", "top", "bottom", "negative-spacing", "rotated", "annotation"],
    opacityEvidence,
    visualApproval: "NOT_GRANTED", productionAdmission: false}, null, 2)}\n`);

  const referenceOption = process.argv.indexOf("--reference-packet");
  if (referenceOption !== -1) {
    assert.ok(process.argv[referenceOption + 1], "reference packet path required");
    const packetPath = path.resolve(process.argv[referenceOption + 1]);
    const packetBytes = fs.readFileSync(packetPath);
    assert.equal(sha(packetBytes), "3ca3579326f1b872f139b6e5327e1ee70fa6993095b156ef10c8c6cd822fe609");
    const packet = JSON.parse(packetBytes);
    assert.equal(packet.productionAdmission, false);
    for (const entry of packet.files) {
      assert.equal(sha(fs.readFileSync(entry.path)), entry.sha256);
      assert.equal(fs.statSync(entry.path).mode & 0o222, 0, "reference files remain readonly");
    }
    const referenceFile = (suffix) => {
      const record = packet.files.find((entry) => entry.path.endsWith(suffix));
      assert.ok(record, suffix); return record;
    };
    const historical = JSON.parse(fs.readFileSync(referenceFile("/report.json").path, "utf8"));
    const ed = packet.ED01, canvas = {width: 1920, height: 1080};
    assert.equal(sha(ed.copy), ed.copySha256);
    assert.equal(historical.exactCopy, ed.copy);
    const serifBinding = {id: "eva-serif-heavy", path: path.join(path.dirname(fontPath), path.basename(ed.font.file)),
      sha256: ed.font.sha256, postscriptName: ed.font.postscriptName, weight: 900};
    const glyphOrigins = [...ed.copy].map((text, index) => {
      const m = compileFontkitGlyphPathManifestV1({manifestId: `reference-${index}`, exactCopy: text,
        fontFile: serifBinding.path, fontId: serifBinding.id});
      assert.equal(m.font.sha256, ed.font.sha256);
      assert.equal(m.glyphs[0].glyphId, ed.font.glyphIds[index]);
      const b = m.run.visibleBounds, measured = historical.structureAudit.glyphVisibility[index].bounds;
      const scale = ed.layout.size / m.font.unitsPerEm;
      return {text, x: measured.left - b.minX * scale * ed.layout.scaleX,
        baselineY: measured.top + b.maxY * scale * ed.layout.scaleY};
    });
    assert.ok(glyphOrigins.every((entry) => Math.abs(entry.baselineY - glyphOrigins[0].baselineY) < 1e-7));
    const parametersFor = (copy, fonts, runs) => ({exactCopy: copy, copyLock: {status: "LOCKED", sha256: sha(copy)},
      purpose: "COPY_SHADOW", canvas, fontBindings: fonts, runs});
    let groupIndex = 0;
    const referenceRuns = ed.layout.semanticCopyOrder.map((text) => {
      const origin = glyphOrigins[groupIndex]; groupIndex += [...text].length;
      return {text, fontId: serifBinding.id, x: origin.x, baselineY: origin.baselineY,
        fontSize: ed.layout.size, horizontalScale: ed.layout.scaleX, verticalScale: ed.layout.scaleY,
        letterSpacing: ed.layout.tracking, fill: historical.material.clean.fill, plane: "behind-artwork"};
    });
    assert.equal(referenceRuns.map((run) => run.text).join(""), ed.copy);
    const baseParameters = parametersFor(ed.copy, [serifBinding], referenceRuns);
    const referenceOutput = await executeEditableTypographyNode(getNode(graphFor(baseParameters)), {artifactRoot});
    assert.equal(referenceOutput.state, "needs-review", JSON.stringify(referenceOutput));
    const referencePlan = JSON.parse(fs.readFileSync(rolePath(referenceOutput, "typography-layout"), "utf8"));
    const referenceGlyphs = referencePlan.glyphManifests.flatMap((m) => m.glyphs);
    for (const [index, glyph] of referenceGlyphs.entries()) {
      const expected = historical.structureAudit.glyphVisibility[index].bounds;
      for (const [actualKey, expectedKey] of [["minX", "left"], ["minY", "top"], ["maxX", "right"], ["maxY", "bottom"]]) {
        assert.ok(Math.abs(glyph.canvasInkBounds[actualKey] - expected[expectedKey]) < 0.02, `ED01 glyph ${index} matches historical curve bounds`);
      }
    }
    assert.ok(Math.abs(referencePlan.glyphManifests[1].run.canvasInkBounds.minX
      - referencePlan.glyphManifests[0].run.canvasInkBounds.maxX - ed.layout.groupGap) < 0.02);
    const explicitIdentity = structuredClone(baseParameters);
    explicitIdentity.runs.forEach((run) => { delete run.verticalScale; });
    const omittedOutput = await executeEditableTypographyNode(getNode(graphFor(explicitIdentity)), {artifactRoot});
    assert.equal(omittedOutput.state, "needs-review");
    for (const artifact of referenceOutput.artifactManifest.artifacts.filter((entry) => ["SVG", "IMAGE"].includes(entry.kind))) {
      assert.equal(artifactShaByRole(omittedOutput, artifact.role), artifact.sha256, "real ED01 identity is byte-compatible");
    }
    const sansBinding = {...JSON.parse(frozenBytes).inputs[0].parameters.fontBindings[0]};
    sansBinding.path = path.join(path.dirname(fontPath), path.basename(sansBinding.path));
    const stageParameters = parametersFor(ed.copy, [sansBinding], [
      {...referenceRuns[0], fontId: sansBinding.id, x: 180, baselineY: 470, fontSize: 200,
        horizontalScale: 0.9, verticalScale: 1.15, letterSpacing: 0, fill: "#e9000b"},
      {...referenceRuns[1], fontId: sansBinding.id, x: 180, baselineY: 560, fontSize: 68,
        horizontalScale: 0.9, verticalScale: 1, letterSpacing: 1, fill: "#e9000b"},
    ]);
    const axisParameters = parametersFor(ed.copy, [serifBinding], [
      ...[...ed.layout.semanticCopyOrder[0]].map((text, index) => ({...referenceRuns[0], text, x: 180,
        baselineY: 280 + index * 140, fontSize: 120, letterSpacing: 0})),
      {...referenceRuns[1], x: 400, baselineY: 280, fontSize: 240, verticalScale: 1.15, letterSpacing: 4},
    ]);
    const cases = [
      {id: "ED01-REFERENCE-LAYOUT", parameters: baseParameters, output: referenceOutput,
        scope: "HISTORICAL_CHINESE_LAYOUT_RECONSTRUCTION_NEW_OUTPUT_NOT_APPROVED"},
      {id: "GAWX-01-STAGE-WORD-CANDIDATE", parameters: stageParameters, referenceCard: "gawx-01",
        scope: "UNAPPROVED_REFERENCE_BOUND_STAGE_WORD_TRIAL_SAME_ED01_COPY"},
      {id: "GAWX-04-SPATIAL-AXIS-CANDIDATE", parameters: axisParameters, referenceCard: "gawx-04",
        scope: "UNAPPROVED_REFERENCE_BOUND_SPATIAL_TRIAL_WITH_EVA_LETTERFORMS_SAME_ED01_COPY"},
    ];
    const source = referenceFile("/ed-01-hold-frame.jpg"), matte = referenceFile("/vitmatte-presenter-alpha-4k.png");
    const sourceBuffer = await sharp(source.path).resize(canvas.width, canvas.height).removeAlpha().raw().toBuffer();
    const matteBuffer = await sharp(matte.path).resize(canvas.width, canvas.height).extractChannel(0).raw().toBuffer();
    assert.equal(sourceBuffer.length, canvas.width * canvas.height * 3);
    assert.equal(matteBuffer.length, canvas.width * canvas.height);
    const caseEvidence = [];
    for (const item of cases) {
      const output = item.output ?? await executeEditableTypographyNode(getNode(graphFor(item.parameters)), {artifactRoot});
      assert.equal(output.state, "needs-review", JSON.stringify(output));
      const plan = JSON.parse(fs.readFileSync(rolePath(output, "typography-layout"), "utf8"));
      assert.equal(plan.glyphManifests.map((m) => m.exactCopy).join(""), ed.copy);
      const svg = fs.readFileSync(rolePath(output, "editable-typography"), "utf8");
      assert.doesNotMatch(svg, /<text|<image|<rect|<line|<circle|font-family/u, "master is glyph-only with alpha");
      const pixels = await pixelEvidence(rolePath(output, "typography-overlay"));
      assert.ok(pixels.visiblePixels > 0 && pixels.transparentPixels > 0);
      const titleBuffer = await sharp(rolePath(output, "typography-overlay")).ensureAlpha().raw().toBuffer();
      const reviewed = Buffer.from(sourceBuffer);
      let protectedCorePixels = 0, protectedCoreChangedPixels = 0, changedOutsideGlyphPixels = 0, visibleTitlePixels = 0;
      for (let pixel = 0; pixel < matteBuffer.length; pixel++) {
        const titleAlpha = titleBuffer[pixel * 4 + 3], protectedCore = matteBuffer[pixel] >= 245;
        const alpha = protectedCore ? 0 : titleAlpha / 255 * (1 - matteBuffer[pixel] / 255);
        if (protectedCore) protectedCorePixels++;
        if (alpha > 0) {
          visibleTitlePixels++;
          for (let channel = 0; channel < 3; channel++) reviewed[pixel * 3 + channel] = Math.round(
            titleBuffer[pixel * 4 + channel] * alpha + sourceBuffer[pixel * 3 + channel] * (1 - alpha));
        }
        const changed = [0, 1, 2].some((channel) => reviewed[pixel * 3 + channel] !== sourceBuffer[pixel * 3 + channel]);
        if (protectedCore && changed) protectedCoreChangedPixels++;
        if (!titleAlpha && changed) changedOutsideGlyphPixels++;
      }
      assert.equal(protectedCoreChangedPixels, 0); assert.equal(changedOutsideGlyphPixels, 0);
      const reviewPath = path.join(evidenceRoot, `${item.id}-review-only.png`);
      await sharp(reviewed, {raw: {...canvas, channels: 3}}).png().toFile(reviewPath);
      const glyphEvidence = [];
      for (const [runIndex, manifest] of plan.glyphManifests.entries()) {
        const run = item.parameters.runs[runIndex], s = run.fontSize / manifest.font.unitsPerEm;
        for (const glyph of manifest.glyphs) {
          const x = glyph.originX + glyph.index * run.letterSpacing / (s * run.horizontalScale);
          const glyphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g transform="translate(${run.x} ${run.baselineY}) rotate(${run.rotation ?? 0}) scale(${s * run.horizontalScale} ${-s * (run.verticalScale ?? 1)})"><path transform="translate(${x} ${glyph.originY})" d="${glyph.pathData}"/></g></svg>`;
          const glyphPixels = await pixelEvidence(Buffer.from(glyphSvg));
          const b = glyph.canvasInkBounds;
          for (const key of ["minX", "minY"]) assert.ok(Math.abs(glyphPixels.inkBounds[key] - Math.floor(b[key])) <= 1);
          for (const key of ["maxX", "maxY"]) assert.ok(Math.abs(glyphPixels.inkBounds[key] - (Math.ceil(b[key]) - 1)) <= 1);
          const isolatedGlyph = await sharp(Buffer.from(glyphSvg)).ensureAlpha().raw().toBuffer();
          let isolatedAlpha = 0, remainingAlpha = 0;
          for (let pixel = 0; pixel < matteBuffer.length; pixel++) {
            const alpha = isolatedGlyph[pixel * 4 + 3];
            isolatedAlpha += alpha;
            if (matteBuffer[pixel] < 245) remainingAlpha += alpha * (1 - matteBuffer[pixel] / 255);
          }
          const afterMatteVisibleFraction = remainingAlpha / isolatedAlpha;
          assert.ok(afterMatteVisibleFraction > 0, `review retains visible ink for ${glyph.characters}`);
          if (item.id === "GAWX-01-STAGE-WORD-CANDIDATE") assert.ok(afterMatteVisibleFraction > 0.99,
            `stage candidate preserves readable ink for ${glyph.characters}`);
          glyphEvidence.push({runIndex, text: glyph.characters, glyphId: glyph.glyphId, vectorInkBounds: b,
            ...glyphPixels, afterMatteVisibleFraction});
        }
      }
      caseEvidence.push({id: item.id, scope: item.scope, referenceCard: item.referenceCard ?? null,
        parameters: item.parameters, artifacts: output.artifactManifest.artifacts, pixels, glyphs: glyphEvidence,
        review: {path: path.relative(evidenceRoot, reviewPath), sha256: sha(fs.readFileSync(reviewPath)),
          sourceSha256: source.sha256, resampledSourceRawSha256: sha(sourceBuffer), matteSha256: matte.sha256,
          protectedCorePixels, protectedCoreChangedPixels, changedOutsideGlyphPixels, visibleTitlePixels,
          scope: "COMPARISON_ONLY_SIMPLE_GLYPH_MASK_REVIEW_NOT_PRODUCTION_COMPOSITOR"},
        visualApproval: "NOT_GRANTED", productionAdmission: false});
    }
    // The literal English belongs to atlas-02. It is not an invented ED01 translation.
    const englishCopy = "JUDGMENT FIRST";
    assert.equal(sha(fs.readFileSync(packet.englishLocalFont.path)), packet.englishLocalFont.sha256);
    const englishBinding = {id: "times-bold-reference", path: packet.englishLocalFont.path,
      sha256: packet.englishLocalFont.sha256, postscriptName: "TimesNewRomanPS-BoldMT", weight: 700};
    const englishParameters = parametersFor(englishCopy, [englishBinding], [{text: englishCopy, fontId: englishBinding.id,
      x: 180, baselineY: 300, fontSize: 180, letterSpacing: 4, horizontalScale: 0.7, verticalScale: 1.15, fill: "#f1efe5"}]);
    const englishOutput = await executeEditableTypographyNode(getNode(graphFor(englishParameters)), {artifactRoot});
    assert.equal(englishOutput.state, "needs-review", JSON.stringify(englishOutput));
    const englishPlan = JSON.parse(fs.readFileSync(rolePath(englishOutput, "typography-layout"), "utf8"));
    assert.equal(englishPlan.glyphManifests[0].exactCopy, englishCopy);
    assert.equal(englishPlan.glyphManifests[0].font.sha256, packet.englishLocalFont.sha256);
    const markParameters = parametersFor("q\u0301", [englishBinding], [{...englishParameters.runs[0], text: "q\u0301"}]);
    const markOutput = await executeEditableTypographyNode(getNode(graphFor(markParameters)), {artifactRoot});
    assert.equal(markOutput.state, "needs-review");
    const markPlan = JSON.parse(fs.readFileSync(rolePath(markOutput, "typography-layout"), "utf8"));
    assert.ok(markPlan.glyphManifests[0].glyphs.some((glyph) => glyph.yOffset !== 0), "real positioning mark exercises vertical yOffset");
    const markRun = markParameters.runs[0];
    const unscaledMark = compileFontkitGlyphPathManifestV1({manifestId: "mark-baseline-control", exactCopy: "q\u0301",
      fontFile: englishBinding.path, fontId: englishBinding.id, placement: {...markRun, verticalScale: 1}});
    for (const [index, glyph] of markPlan.glyphManifests[0].glyphs.entries()) {
      for (const key of ["minY", "maxY"]) assert.ok(Math.abs(glyph.canvasInkBounds[key]
        - (markRun.baselineY + (unscaledMark.glyphs[index].canvasInkBounds[key] - markRun.baselineY) * markRun.verticalScale)) < 1e-7,
        "real yOffset scales about the fixed baseline with the outline");
    }
    const markPixels = await pixelEvidence(rolePath(markOutput, "typography-overlay"));
    const markBounds = markPlan.glyphManifests[0].run.canvasInkBounds;
    for (const key of ["minX", "minY"]) assert.ok(Math.abs(markPixels.inkBounds[key] - Math.floor(markBounds[key])) <= 1);
    for (const key of ["maxX", "maxY"]) assert.ok(Math.abs(markPixels.inkBounds[key] - (Math.ceil(markBounds[key]) - 1)) <= 1);
    const referenceEvidence = {status: "GEOMETRY_AND_PIXELS_PASS_REVIEW_REQUIRED", referencePacketSha256: sha(packetBytes),
      referenceFilesVerified: packet.files.length, exactCopy: ed.copy, exactCopySha256: ed.copySha256,
      cases: caseEvidence, englishProbe: {copy: englishCopy, copySha256: sha(englishCopy), referenceCard: "atlas-02",
        copyProvenance: "MANUALLY_READ_REFERENCE_ATLAS_LITERAL_NOT_ED01_TRANSLATION", parameters: englishParameters,
        artifacts: englishOutput.artifactManifest.artifacts, pixels: await pixelEvidence(rolePath(englishOutput, "typography-overlay")),
        scope: "UNAPPROVED_LITERAL_REFERENCE_FONT_SCALE_PROBE", fontBinaryCopied: false},
      markOffsetProbe: {copy: "q\u0301", purpose: "POSITIONING_REGRESSION_ONLY_NOT_DISPLAY_COPY",
        glyphs: markPlan.glyphManifests[0].glyphs, pixels: markPixels, baselineAndYOffsetScalingPass: true},
      limits: ["Historical outline geometry reproduced; no byte-parity claim for the prior resvg/contact-shadow composite.",
        "Review uses the supplied 960px JPEG resampled to 1920; it is not the historical full-resolution source.",
        "Gawx candidate copy reuses ED01; the stage/axis mechanism is proposed, not a liked card or user-approved design.",
        "No production compositor edits, browser/provider jobs, animation, source promotion or font-binary redistribution."],
      visualApproval: "NOT_GRANTED", productionAdmission: false};
    fs.writeFileSync(path.join(evidenceRoot, "reference-pixel-evidence.json"), `${JSON.stringify(referenceEvidence, null, 2)}\n`);
    console.log(`PASS reference pixels: ED01 ${referenceGlyphs.length} glyphs, 150px semantic gap, protected source core unchanged, Gawx stage/axis candidates, verified English 0.70 × 1.15, positioning mark`);
  }
  await reject((p) => { p.runs[0].plane = "not-a-plane"; }, "TYPOGRAPHY_RUN_INVALID");
  const before = fs.statSync(pngFile);
  const repeated = await executeEditableTypographyNode(node, {artifactRoot});
  assert.equal(repeated.state, "needs-review");
  assert.equal(fs.statSync(pngFile).mtimeMs, before.mtimeMs);
  assert.deepEqual(repeated.artifactManifest, result.artifactManifest);

  await reject((p) => { p.runs[0].text = "错误文字"; }, "TYPOGRAPHY_COPY_BINDING_MISMATCH");
  await reject((p) => { p.copyLock.status = "DRAFT"; }, "TYPOGRAPHY_COPY_NOT_LOCKED");
  await reject((p) => { p.fontBindings[0].sha256 = "0".repeat(64); }, "TYPOGRAPHY_FONT_SHA_MISMATCH");
  await reject((p) => { p.fontBindings[0].weight = 400; }, "TYPOGRAPHY_FONT_IDENTITY_MISMATCH");
  await reject((p) => { p.purpose = "GENERATED_DESIGN_REPLACEMENT"; }, "TYPOGRAPHY_PURPOSE_REQUIRED");
  await reject((p) => { p.runs[0].fill = "url(https://example.com)"; }, "TYPOGRAPHY_RUN_INVALID");
  await reject((p) => { p.runs[0].horizontalScale = 0.49; }, "TYPOGRAPHY_RUN_INVALID");
  await reject((p) => { p.runs[0].horizontalScale = 1.51; }, "TYPOGRAPHY_RUN_INVALID");
  await reject((p) => { p.editorialAnnotations = [{id: "bad-note", kind: "GENERATED_ILLUSTRATION_DISCLOSURE", text: "H800", fontId: "explicit-heavy", x: 1, baselineY: 1, fontSize: 22, fill: "#ffffff"}]; }, "TYPOGRAPHY_EDITORIAL_ANNOTATION_INVALID");
  await reject((p) => { p.generatedGlyphLayers = []; }, "GENERATED_GLYPH_LAYERS_REQUIRE_SEPARATE_ASSET_ADAPTER");
  const missing = structuredClone(parameters);
  missing.exactCopy = "\u{10ffff}"; missing.copyLock.sha256 = sha(missing.exactCopy); missing.runs = [{...missing.runs[0], text: missing.exactCopy}];
  assert.match((await executeEditableTypographyNode(getNode(graphFor(missing)), {artifactRoot})).reason, /missing-codepoint/u);
  const tampered = structuredClone(node); tampered.input.parameters.runs[0].x += 1;
  assert.equal((await executeEditableTypographyNode(tampered, {artifactRoot})).reason, "TYPOGRAPHY_INPUT_SHA_MISMATCH");
  const tamperedScale = structuredClone(node); tamperedScale.input.parameters.runs[0].horizontalScale = 0.75;
  assert.equal((await executeEditableTypographyNode(tamperedScale, {artifactRoot})).reason, "TYPOGRAPHY_INPUT_SHA_MISMATCH");
  const dep = structuredClone(getNode(graphFor()));
  dep.dependencies = ["exact-copy:asset"]; dep.dependencyArtifactKinds = {"exact-copy:asset": ["IMAGE"]};
  const dependencies = {"exact-copy:asset": {state: "succeeded", inputSha256: "a".repeat(64), manifestSha256: "b".repeat(64)}};
  dep.inputSha256 = nodeInputHash({input: dep.input, dependencies: {inputs: [{id: "exact-copy:asset", inputSha256: "a".repeat(64), acceptedManifestSha256: "b".repeat(64)}], artifactKinds: {asset: ["IMAGE"]}}});
  assert.equal((await executeEditableTypographyNode(dep, {artifactRoot, dependencies})).state, "needs-review");
  dependencies["exact-copy:asset"].manifestSha256 = "c".repeat(64);
  assert.equal((await executeEditableTypographyNode(dep, {artifactRoot, dependencies})).reason, "TYPOGRAPHY_INPUT_SHA_MISMATCH");
  fs.writeFileSync(pngFile, "tamper");
  assert.equal((await executeEditableTypographyNode(node, {artifactRoot})).reason, "TYPOGRAPHY_CACHE_CONTENT_MISMATCH");
  console.log("PASS editable typography: real font outlines + PNG, technical acceptance, exact copy/font/dependency SHA guards, immutable cache; visual approval NOT_GRANTED");
} finally {
  console.log(`Local evidence retained: ${artifactRoot}`);
}
