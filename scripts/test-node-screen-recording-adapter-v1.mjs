#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import {gzipSync, deflateSync, deflateRawSync, brotliCompressSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {EventEmitter} from "node:events";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {
  A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1,
  A1_NODE_SCREEN_RECORDING_RECEIPT_V1,
  executeScreenRecordingNode,
  screenRecordingNodeAdapterV1,
  prepareOptionalRecordingReviewV1,
  classifyBlockedRecordingRequestV1,
  validateOptionalRecordingPixelReviewV1,
  resolveRecordingTextAnchorV1,
  performRecordingDragSelectTextV1,
  validateRecordingDragEvidenceV1,
  preparePublicResourceLoadingV1,
  createPublicRecordingResourceBrokerV1,
  validatePublicRecordingResourceProofV1,
  requestPinnedRecordingResourceV1,
  fulfillPublicRecordingResourceRequestV1,
  createPublicRecordingFetchOwnerV1,
  buildRecordingLinePathV1,
  decodePublicRecordingResourceBodyV1,
} from "../apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Replay the existing static DOM route without entering recording/server setup.
// Installed Remotion methods run against memory-only seams; no browser launches.
if (process.argv.includes("--static-dom-regression")) {
  await testExistingStaticDOMRoute(repoRoot);
  process.exit(0);
}

async function testExistingStaticDOMRoute(sourceRoot) {
  const captureRoot = fs.existsSync(path.join(sourceRoot, "MODULE_TASK.json"))
    ? sourceRoot : path.join(sourceRoot, "work/module-development-launch-v1/environments/capture");
  const contentRoot = path.join(captureRoot, "work/web-reading-camera-component-v1/P08-source-bound-derived-news-entry-v1");
  const preparation = path.join(contentRoot, "recovery-font-subset-dom60s-once-v1/fixed-bundle-reuse-css-diagnostics-pure-preparation-v1");
  const actualRoot = path.join(preparation, "actual-p08-dom-entry3036-once-v1");
  const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
  const read = filename => JSON.parse(fs.readFileSync(filename, "utf8"));
  const fileFact = filename => {
    const bytes = fs.readFileSync(filename);
    return {path: filename, sha256: digest(bytes), bytes: bytes.length};
  };
  const checks = [];
  const check = async (name, run) => { await run(); checks.push({name, status: "PASS"}); };
  const boundaryPath = path.join(contentRoot, "dom-content-boundary-v1.mjs");
  const boundary = await import(pathToFileURL(boundaryPath));
  const nativePath = path.join(actualRoot, "actual-platform-font-evidence.json");
  const native = read(nativePath), evidence = native.evidence[0], sample = evidence.sample;
  const initialNativeFact = fileFact(nativePath);
  const report = boundary.compareFixedDOMObservationV1(evidence.observed, sample);

  await check("saved actual DOM satisfies all 190 predicates and 11 native rows", () => {
    assert.equal(native.complete, true);
    assert.equal(native.executionFailure, null);
    assert.equal(report.checks.length, 190);
    assert.equal(report.passed, true);
    assert.equal(boundary.validateFixedDOMObservationV1(evidence.observed, sample).length, 11);
    assert.equal(evidence.rawFontQueries.length, 11);
    const result = boundary.validateFixedDOMSetV1(native.evidence, [sample]);
    assert.equal(result.count, 1);
    assert.equal(result.visualApproval, "NOT_GRANTED");
    assert.equal(result.executionAuthorized, false);
  });
  await check("CSS serialization equivalence is limited to zero tracking and finite blur precision", () => {
    for (const value of ["normal", "0px", "-0px", "0.0px"]) assert.equal(boundary.equivalentCSSTrackingV1(value, "0px"), true);
    for (const value of ["0.1px", "0rem", "calc(0px)", null]) assert.equal(boundary.equivalentCSSTrackingV1(value, "0px"), false);
    assert.equal(boundary.equivalentCSSFilterV1("blur(0.875px)", "blur(0.8749999999999999px)"), true);
    for (const value of ["blur(0.876px)", "blur(0.875rem)", "blur(NaNpx)", "blur(Infinitypx)", "blur(0.875px) contrast(1)"]) {
      assert.equal(boundary.equivalentCSSFilterV1(value, "blur(0.875px)"), false);
    }
  });
  await check("wrong copy and changed selection clip remain rejected", () => {
    const copy = structuredClone(evidence.observed); copy.rows[0].text += "错";
    assert.throws(() => boundary.validateFixedDOMObservationV1(copy, sample));
    const crop = structuredClone(evidence.observed);
    crop.rows.find(row => row.field === "selected-row-paint").ancestors.find(a => a.selectionClip === "entry-selection").bounds.width++;
    assert.throws(() => boundary.validateFixedDOMObservationV1(crop, sample));
  });
  await check("wrong native face and zero glyph count remain rejected", () => {
    for (const mutation of [font => { font.postScriptName = "WrongFont"; }, font => { font.glyphCount = 0; }]) {
      const changed = structuredClone(native.evidence); mutation(changed[0].rows[0].fonts[0]);
      assert.throws(() => boundary.validateFixedDOMSetV1(changed, [sample]), /POSITIVE_NATIVE_FONT_GLYPHS/u);
    }
  });

  const require = createRequire(path.join(captureRoot, "remotion-renderer/package.json"));
  const installedRoot = path.dirname(require.resolve("@remotion/renderer"));
  const pagePath = path.join(installedRoot, "browser/BrowserPage.js");
  const {Page} = require(pagePath);
  // Construct the installed Page with a memory event bus and a stub main frame.
  // Unexpected CDP sends fail immediately; no Chromium/HTTP transport exists.
  const memoryPage = () => {
    const client = new EventEmitter();
    client.send = async () => { throw new Error("STATIC_REGRESSION_UNEXPECTED_CDP_SEND"); };
    const page = new Page({client, target: {}, browser: {}, logLevel: "silent", indent: false, pageIndex: 0});
    client.emit("Page.frameNavigated", {frame: {id: "MEMORY_ONLY", url: "about:blank", name: "", loaderId: "MEMORY_ONLY"}});
    const calls = [];
    page.mainFrame().goto = async (url, timeout, options) => {
      assert.equal(typeof url, "string", "installed Page.goto needs an object containing url");
      calls.push({url, timeout, options}); return {memoryOnly: true};
    };
    return {page, calls};
  };
  await check("real installed Page.goto receives object and forwards timeout/options", async () => {
    const {page, calls} = memoryPage();
    await page.goto({url: "http://localhost:3000/index.html", timeout: 7000, options: {waitUntil: "domcontentloaded"}});
    assert.deepEqual(calls, [{url: "http://localhost:3000/index.html", timeout: 7000, options: {waitUntil: "domcontentloaded"}}]);
    await assert.rejects(page.goto("http://localhost:3000/index.html"), /needs an object containing url/u);
  });
  const workerPath = path.join(captureRoot, "work/web-reading-camera-component-v1/P25-entry-P21-handoff-one-article-batch-preparation-v1/runtime-p21-handoff-recovery42s-v1/render-static.mjs");
  const worker = fs.readFileSync(workerPath, "utf8");
  const gotoLine = worker.split("\n").find(line => line.trim().startsWith("ownedPage.goto=async(...args)=>"));
  assert.ok(gotoLine, "current existing goto seam must be found exactly");
  const bindCurrentGoto = new Function("ownedPage", "contentProfile", "must", "remaining", "checked", `
    const originalGoto=ownedPage.goto.bind(ownedPage);
    let pageNavigations=0,navigationCount=0,allowedOrigin=null;
    ${gotoLine}
    return ownedPage.goto;
  `);
  const wrappedPage = () => {
    const memory = memoryPage();
    const goto = bindCurrentGoto(memory.page, {scope: {rendererAPITimeoutMs: 7000}},
      (value, code) => { if (!value) throw new Error(code); }, () => 7000, value => value);
    return {...memory, goto};
  };
  await check("current worker normalizes both goto shapes into the installed API", async () => {
    for (const args of [["http://localhost:3000/index.html", {timeout: 7000, waitUntil: "domcontentloaded"}],
      [{url: "http://localhost:3000/index.html", timeout: 7000, options: {waitUntil: "domcontentloaded"}}]]) {
      const {goto, calls} = wrappedPage(); await goto(...args);
      assert.deepEqual(calls, [{url: "http://localhost:3000/index.html", timeout: 7000, options: {waitUntil: "domcontentloaded"}}]);
      await assert.rejects(goto(...args), /AUTOMATIC_NAVIGATION_RETRY_FORBIDDEN/u);
    }
  });
  await check("current goto rejects external origins and wrong timeout before installed navigation", async () => {
    for (const arg of [{url: "https://remote.example/", timeout: 7000}, {url: "http://localhost:3000/", timeout: 6999}]) {
      const {goto, calls} = wrappedPage(); await assert.rejects(goto(arg)); assert.equal(calls.length, 0);
    }
  });
  let bundle;
  await check("existing SHA-bound bundle is verified without a rebuild", () => {
    bundle = boundary.verifyFixedDOMReusableBundleV1();
    const description = read(path.join(contentRoot, "FIXED-BUNDLE-REUSE-v1.json"));
    assert.equal(description.existingBundleAccepted, true);
    assert.equal(description.maximumNewStaticBundles, 0);
    assert.equal(description.bundleFiles.length, 20);
    assert.equal(description.bundleBytes, 5468766);
  });
  const indexPath = path.join(captureRoot, "work/web-reading-camera-component-v1/capture-cached-eight-inventory-v1/P08-TWO-PASS-EXACT-WRITER-INDEX-FACTS-v1.json");
  const indexed = read(indexPath);
  const assertCachedVisualReview = (row, review) => {
    assert.match(review.status, /^PASS_/u, "CACHED_VISUAL_REVIEW_PASS_REQUIRED");
    assert.equal(review.mustFixCount, 0, "CACHED_VISUAL_REVIEW_NO_MUST_FIX_REQUIRED");
    assert.deepEqual(review.mustFix, [], "CACHED_VISUAL_REVIEW_NO_MUST_FIX_REQUIRED");
    const contracts = {ENTRY: "A1IndependentActualVisualReview/v1", MAIN: "A1P08SingleMainIndependentActualApproximationVisualReview/v1"};
    assert.ok(Object.hasOwn(contracts, row.anchor), "CACHED_VISUAL_REVIEW_ANCHOR_REQUIRED");
    assert.equal(review.contract, contracts[row.anchor], "CACHED_VISUAL_REVIEW_CONTRACT_REQUIRED");
    assert.deepEqual(row.anchor === "ENTRY" ? review.candidate : review.lockedMAIN,
      {path: row.candidate.path, sha256: row.candidate.sha256, bytes: row.candidate.bytes},
      "CACHED_VISUAL_REVIEW_CANDIDATE_BINDING_REQUIRED");
  };
  await check("existing MAIN layer and ENTRY pixels are reused by exact SHA and review", () => {
    for (const row of indexed.rows.filter(row => row.candidate)) {
      assert.deepEqual(fileFact(row.candidate.path), {path: row.candidate.path, sha256: row.candidate.sha256, bytes: row.candidate.bytes});
      assert.deepEqual(fileFact(row.independentVisualReview.path), row.independentVisualReview);
      assertCachedVisualReview(row, read(row.independentVisualReview.path));
      const bytes = fs.readFileSync(row.candidate.path);
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], row.candidate.dimensions);
    }
    assert.equal(indexed.rows.find(row => row.anchor === "HANDOFF").candidate, null);
    assert.equal(indexed.wholeShotPASS, false);
  });
  await check("cached actual FAIL review is rejected", () => {
    const entry = indexed.rows.find(row => row.anchor === "ENTRY");
    const failed = read(path.join(path.dirname(entry.independentVisualReview.path), "P08-CURRENT-APPLIED-CSS-DIAGNOSTICS-READY-RUNTIME-INDEPENDENT-REVIEW-v1.json"));
    assert.throws(() => assertCachedVisualReview(entry, failed), /CACHED_VISUAL_REVIEW_PASS_REQUIRED/u);
  });
  await check("PASS review bound to another anchor, candidate SHA or bytes is rejected", () => {
    const entry = indexed.rows.find(row => row.anchor === "ENTRY"), main = indexed.rows.find(row => row.anchor === "MAIN");
    assert.throws(() => assertCachedVisualReview(entry, read(main.independentVisualReview.path)), /CACHED_VISUAL_REVIEW_CONTRACT_REQUIRED/u);
    for (const mutation of [review => { review.candidate = read(main.independentVisualReview.path).lockedMAIN; },
      review => { review.candidate.sha256 = "0".repeat(64); }, review => { review.candidate.bytes++; }]) {
      const changed = read(entry.independentVisualReview.path); mutation(changed);
      assert.throws(() => assertCachedVisualReview(entry, changed), /CACHED_VISUAL_REVIEW_CANDIDATE_BINDING_REQUIRED/u);
    }
  });
  await check("PASS review with a must-fix count or finding is rejected", () => {
    const entry = indexed.rows.find(row => row.anchor === "ENTRY");
    for (const mutation of [review => { review.mustFixCount = 1; }, review => { review.mustFix.push({id: "UNRESOLVED"}); }]) {
      const changed = read(entry.independentVisualReview.path); mutation(changed);
      assert.throws(() => assertCachedVisualReview(entry, changed), /CACHED_VISUAL_REVIEW_NO_MUST_FIX_REQUIRED/u);
    }
  });
  await check("replay preserves native evidence bytes", () => assert.deepEqual(fileFact(nativePath), initialNativeFact));
  const outputRoot = path.join(captureRoot, "work/capture-adapter-tests");
  fs.mkdirSync(outputRoot, {recursive: true});
  const output = fs.mkdtempSync(path.join(outputRoot, "static-dom-regression-"));
  const result = {status: "PASS_EXISTING_STATIC_DOM_ROUTE_INSTALLED_API_AND_SAVED_NATIVE_REPLAY",
    evidenceClass: "INSTALLED_API_MEMORY_SEAM_AND_REPLAY_OF_EXISTING_NATIVE_EVIDENCE",
    checks, checkCount: checks.length, nativePredicates: 190, nativeFontQueries: 11,
    installedPage: fileFact(pagePath), currentWorker: fileFact(workerPath), currentBoundary: fileFact(boundaryPath),
    savedNativeEvidence: initialNativeFact, indexFacts: fileFact(indexPath), bundleVerification: bundle,
    newBrowser: 0, newBuild: 0, newPNG: 0, newRaster: 0, newPhase: 0, newUpload: 0,
    newNativeMeasurements: false, executionAuthorized: false, productionAdmission: false, wholeShotPASS: false};
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({status: result.status, checkCount: checks.length, outputRoot: output,
    newBrowser: 0, newBuild: 0, newPNG: 0, newRaster: 0, newPhase: 0, newUpload: 0}));
}
const ffprobePath = path.join(repoRoot, ".tools/bin/ffprobe");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const unitOnly = process.argv.includes("--unit");
const publicOnly = process.argv.includes("--public");
const dragOnly = process.argv.includes("--drag-fixture");
const outputRoot = path.join(repoRoot, "work/capture-adapter-tests");
fs.mkdirSync(outputRoot, {recursive: true});
const tempRoot = fs.mkdtempSync(path.join(outputRoot, unitOnly ? "unit-" : "browser-"));
const serverRequests = [];
const frozenFixture = fs.readFileSync(path.join(repoRoot, "fixtures/capture-page.html"));
assert.equal(sha256(frozenFixture), "97c03499a04aed450505147ace3c36eb3a8514b5bc970c09c7ba3948fa40ceee");
const fixture = `<!doctype html>
<html><head><title>Local recording fixture</title><style>
body{font:24px sans-serif;margin:32px;background:#f4f0e7;color:#17191b}
button{font-size:20px;padding:12px 18px;margin-right:12px}
#status{margin-top:28px;padding:20px;background:#fff;border:2px solid #17191b;width:280px}
</style></head><body>
<h1>Local capture</h1><button id="complete">Complete action</button><button id="attempt-write">Attempt blocked write</button>
<div id="status">Ready</div>
<script>
document.querySelector('#complete').addEventListener('click',()=>{document.querySelector('#status').textContent='Complete';});
document.querySelector('#attempt-write').addEventListener('click',()=>{fetch('/write',{method:'POST',body:'fixture-only'}).catch(()=>{});});
</script></body></html>`;

const dragEnglishText = "A real article paragraph can span inline elements and several visual lines. We select exact words with the browser mouse and retain the page selection style.";
const dragEnglishQuote = "span inline elements and several visual lines. We select exact words";
const dragChineseText = "真实文章段落可以跨越内联元素和多行文字。我们使用浏览器鼠标划选准确句子，并保留页面原有的选区样式。";
const dragChineseQuote = "跨越内联元素和多行文字。我们使用浏览器鼠标划选准确句子";
function dragFixture({chinese = false, ambiguous = false, unselectable = false, overlay = false, clear = false} = {}) {
  const body = chinese ? "真实文章段落可以跨越<em>内联元素和多行文字</em>。我们使用浏览器鼠标划选准确句子，并保留页面原有的选区样式。"
    : "A real article paragraph can span <em>inline elements and several visual lines.</em> We select exact words with the browser mouse and retain the page selection style.";
  return `<!doctype html><html lang="${chinese ? "zh" : "en"}"><head><title>Local drag fixture</title><style>
body{margin:24px;font:20px/1.4 sans-serif;color:#171717;background:#fff}h1{font-size:24px}.spacer{height:700px}
p{width:500px;margin:0 0 24px;${unselectable ? "user-select:none;" : ""}}em{font-style:normal}::selection{background:#222;color:#fff}
.cover{position:fixed;inset:0;z-index:100;background:#ccc}</style></head><body><h1>Local drag fixture</h1><div class="spacer"></div>
<p class="target">${body}</p>${ambiguous ? `<p class="target">${body}</p>` : ""}<p>Neighbour paragraph must remain unselected.</p><div style="height:300px"></div>
${overlay ? '<div class="cover">Occluding fixture</div>' : ""}${clear ? '<script>let timer;document.addEventListener("selectionchange",()=>{clearTimeout(timer);if(getSelection()?.toString())timer=setTimeout(()=>getSelection()?.collapseToStart(),450);});</script>' : ""}
</body></html>`;
}

const server = http.createServer((request, response) => {
  serverRequests.push({method: request.method, url: request.url});
  if (request.url === "/write") {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"});
  const dragPages = {"/drag": {}, "/drag-zh": {chinese: true}, "/drag-ambiguous": {ambiguous: true},
    "/drag-unselectable": {unselectable: true}, "/drag-overlay": {overlay: true}, "/drag-clear": {clear: true}};
  response.end(Object.hasOwn(dragPages, request.url) ? dragFixture(dragPages[request.url]) : request.url === "/frozen" ? frozenFixture : fixture);
});

function recordingNode({id, inputSha256, url, allowLoopbackOrigin = false, initialState = {selector: "#status", visible: true, textExact: "Ready"},
  beats = [{beatId: "complete-state", action: {type: "click", selector: "#complete"},
    expectedVisibleState: {selector: "#status", visible: true, textExact: "Complete"}, settleMs: 600, stateTimeoutMs: 1500}],
  policy = {blockMutations: true, allowedMethods: ["GET", "HEAD", "OPTIONS"], maxDurationMs: 25_000, initialSettleMs: 800, finalHoldMs: 800}}) {
  return {
    id,
    shotId: id.split(":")[0],
    module: "recording",
    inputSha256,
    input: {
      module: "recording", moduleVersion: 1, need: true,
      parameters: {source: {url, allowLoopbackOrigin}, viewport: {width: 640, height: 360}, initialState, beats, policy},
    },
  };
}

function assertTimelineAndExtract(result, node, artifactRoot, label) {
  assert.equal(result.state, "needs-review", JSON.stringify(result));
  const receipt = JSON.parse(fs.readFileSync(path.join(artifactRoot, result.captureReceiptPath)));
  const ledger = JSON.parse(fs.readFileSync(path.join(artifactRoot, result.eventLedgerPath)));
  assert.equal(receipt.timeline.timebase, "capture-relative-ms");
  assert.deepEqual(ledger.timeline, receipt.timeline);
  assert.ok(receipt.beats[0].sourceStartMs >= node.input.parameters.policy.initialSettleMs);
  assert.ok(receipt.timeline.captureDurationMs - receipt.beats.at(-1).sourceEndMs >= node.input.parameters.policy.finalHoldMs);
  assert.ok(Math.abs(receipt.video.durationSeconds * 1000 - receipt.timeline.captureDurationMs) <= 1000 / 30 + 5);
  const click = ledger.events.find(event => event.type === "click");
  if (node.input.parameters.beats[0].action.type === "click") {
    assert.ok(click); assert.equal(click.targetId, "complete");
    assert.ok(click.timeMs >= receipt.beats[0].sourceStartMs && click.timeMs <= receipt.beats[0].sourceEndMs);
  }
  const times = {initial: 0.4, action: receipt.beats[0].sourceEndMs / 1000,
    final: receipt.video.durationSeconds - 0.2};
  if (click && process.argv.includes("--timing-frames")) {
    times.beforeClick = Math.max(0, (click.timeMs - 100) / 1000);
    times.afterClick = (click.timeMs + 100) / 1000;
  }
  const video = path.join(artifactRoot, receipt.video.path);
  const frames = Object.entries(times).map(([phase, seconds]) => {
    const frame = path.join(tempRoot, `${label}-${phase}.png`);
    execFileSync(path.join(repoRoot, ".tools/bin/ffmpeg"), ["-hide_banner", "-loglevel", "error", "-ss", String(seconds),
      "-i", video, "-frames:v", "1", frame], {timeout: 15000});
    const bytes = fs.readFileSync(frame);
    return {phase, seconds, path: frame, bytes: bytes.length, sha256: sha256(bytes)};
  });
  const evidence = {nodeId: node.id, capture: result.capture, receiptSha256: sha256(fs.readFileSync(path.join(artifactRoot, result.captureReceiptPath))),
    ledgerSha256: sha256(fs.readFileSync(path.join(artifactRoot, result.eventLedgerPath))), timeline: receipt.timeline, frames,
    actualPixelReview: "PENDING_MANUAL_FRAME_INSPECTION", productionAdmission: false};
  fs.writeFileSync(path.join(tempRoot, `${label}-evidence.json`), JSON.stringify(evidence, null, 2) + "\n");
}

async function testDragPure(validNode) {
  assert.deepEqual(resolveRecordingTextAnchorV1(["prefix ", "inline", " words suffix"], "inline words"),
    {start: {nodeIndex: 1, offset: 0}, end: {nodeIndex: 2, offset: 6}});
  assert.throws(() => resolveRecordingTextAnchorV1(["repeat repeat"], "repeat"), /AMBIGUOUS/u);
  assert.throws(() => resolveRecordingTextAnchorV1(["different"], "missing"), /MISSING/u);
  const action = {type: "dragSelectText", selector: "#paragraph", textExact: "inline words", quoteExact: "inline words", durationMs: 100, steps: 2};
  const linePath=buildRecordingLinePathV1([{x:10,y:50,width:80,height:20},{x:10,y:10,width:90,height:20},
    {x:70,y:10,width:30,height:20},{x:10,y:50,width:100,height:20}],{x:10,y:20},{x:60,y:60});
  assert.ok(linePath.every((p,i)=>!i||p.y>=linePath[i-1].y));assert.equal(linePath.at(-1).x,60);
  assert.ok(!linePath.some(p=>p.y===60&&p.x>60));assert.equal(linePath.filter(p=>p.jump).length,1);
  const selection = {text: action.quoteExact, textSha256: sha256(Buffer.from(action.quoteExact)), rangeCount: 1, collapsed: false, withinTarget: true,
    anchor: {path: [0], offset: 0}, focus: {path: [1, 0], offset: 6}, rects: [{x: 10, y: 10, width: 80, height: 20}],
    viewport: {width: 640, height: 360}, scroll: {x: 0, y: 0}, documentTimeMs: 123};
  const geometry = {start: {x: 10, y: 20}, end: {x: 90, y: 20}, points: [{x: 90, y: 20}], rects: selection.rects};
  const events = [{type: "pointerdown", timeMs: 100, trusted: true, pointerType: "mouse", button: 0, buttons: 1, clientX: 10, clientY: 20},
    {type: "pointermove", timeMs: 110, trusted: true, pointerType: "mouse", button: -1, buttons: 1, clientX: 50, clientY: 20},
    {type: "selectionchange", timeMs: 120, selection},
    {type: "pointerup", timeMs: 130, trusted: true, pointerType: "mouse", button: 0, buttons: 0, clientX: 90, clientY: 20}];
  const beat = {action, expectedVisibleState: {selector: action.selector, selectionTextExact: action.quoteExact}, sourceStartMs: 90, sourceEndMs: 180,
    eventRange: {startIndex: 0, endIndex: 4}, stateReceipt: {matched: true, observed: {selection}}, dragReceipt: {geometry, selection}};
  const final = {matched: true, observed: {selection}};
  assert.equal(validateRecordingDragEvidenceV1([beat], events, final), true);
  for (const change of [s => { s.text = "wrong"; }, s => { s.textSha256 = "0".repeat(64); }, s => { s.withinTarget = false; },
    s => { s.anchor.path = null; }, s => { s.rects = []; }]) {
    const broken = structuredClone(beat); change(broken.stateReceipt.observed.selection);
    assert.throws(() => validateRecordingDragEvidenceV1([broken], events, final), /DRAG_SELECTION_RECEIPT_INVALID/u);
  }
  assert.throws(() => validateRecordingDragEvidenceV1([beat], events.filter(e => e.type !== "pointermove"), final), /TRAJECTORY/u);
  assert.throws(() => validateRecordingDragEvidenceV1([beat], events, {matched: false}), /FINAL_HOLD/u);
  let moves = 0, downs = 0, ups = 0, checks = 0;
  const mockPage = {locator: () => ({count: async () => 1, scrollIntoViewIfNeeded: async () => {}, innerText: async () => action.textExact,
    evaluate: async (_, args) => args ? geometry : ["inline", " words"]}), evaluate: async (_, arg) => typeof arg === "string" ? selection : undefined,
    waitForTimeout: async () => {}, mouse: {move: async () => { moves++; }, down: async () => { downs++; }, up: async () => { ups++; }}};
  const result = await performRecordingDragSelectTextV1(mockPage, action);
  assert.equal(result.selection.text, action.quoteExact); assert.equal(downs, 1); assert.equal(ups, 1); assert.ok(moves >= 3);
  await assert.rejects(performRecordingDragSelectTextV1(mockPage, action, {check: async () => { if (++checks === 5) throw Error("cancelled-fixture"); }}), /cancelled-fixture/u);
  assert.equal(downs, 2); assert.equal(ups, 2, "cancel during held mouse releases in finally");
  const invalids = [{durationMs: 0}, {steps: 1000}, {quoteExact: "absent"}, {quoteExact: ""}];
  for (const changed of invalids) {
    const node = structuredClone(validNode); node.input.parameters.beats[0].action = {...action, ...changed};
    assert.match((await executeScreenRecordingNode(node)).reason, /BEAT_DRAG_PARAMETERS_INVALID/u);
  }
  const node = structuredClone(validNode); node.input.parameters.beats[0].action = action;
  assert.match((await executeScreenRecordingNode(node)).reason, /BEAT_DRAG_STATE_BINDING_INVALID/u);
  return {crossInlineAnchor: "PASS", invalidPlans: 5, selectionAndTrajectoryNegativeCases: 7,
    mockedMouseSequences: 2, finallyReleased: true, actualBrowser: false, actualPixels: "NOT_RUN"};
}

async function testDragReal(baseUrl, artifactRoot) {
  const cases = [];
  for (const [label, route, text, quote] of [["english", "/drag", dragEnglishText, dragEnglishQuote],
    ["chinese", "/drag-zh", dragChineseText, dragChineseQuote]]) {
    const action = {type: "dragSelectText", selector: "p.target", textExact: text, quoteExact: quote, durationMs: 900, steps: 40};
    const node = recordingNode({id: `drag-${label}:recording`, inputSha256: sha256(Buffer.from(`drag-v1-${label}`)),
      url: baseUrl + route, allowLoopbackOrigin: true, initialState: {selector: "h1", visible: true, textExact: "Local drag fixture"},
      beats: [{beatId: "select-paragraph", action, expectedVisibleState: {selector: action.selector, visible: true,
        textExact: text, selectionTextExact: quote}, settleMs: 150}],
      policy: {blockMutations: true, allowedMethods: ["GET", "HEAD", "OPTIONS"], maxDurationMs: 25000, initialSettleMs: 500, finalHoldMs: 850}});
    const result = await executeScreenRecordingNode(node, {artifactRoot, ffprobePath});
    fs.writeFileSync(path.join(tempRoot, `${label}-drag-result.json`), JSON.stringify(result, null, 2));
    assert.equal(result.state, "needs-review", JSON.stringify(result));
    const receiptPath = path.join(artifactRoot, result.captureReceiptPath), ledgerPath = path.join(artifactRoot, result.eventLedgerPath);
    const receipt = JSON.parse(fs.readFileSync(receiptPath)), ledger = JSON.parse(fs.readFileSync(ledgerPath));
    assert.equal(receipt.finalSelectionReceipt.observed.selection.text, quote);
    assert.equal(receipt.finalSelectionReceipt.observed.selection.withinTarget, true);
    assert.equal(validateRecordingDragEvidenceV1(receipt.beats, ledger.events, receipt.finalSelectionReceipt), true);
    assert.ok(receipt.finalSelectionReceipt.observed.selection.scroll.y > 100, "paragraph reached through real DOM scrolling");
    assert.ok(ledger.events.some(e => e.type === "scroll"));
    assert.deepEqual(ledger.beatBindings, receipt.beats);
    const down = ledger.events.find(e => e.type === "pointerdown"), up = ledger.events.find(e => e.type === "pointerup");
    const moves = ledger.events.filter(e => e.type === "pointermove" && e.buttons === 1);
    const video = path.join(artifactRoot, receipt.video.path);
    const samples = {initial: 0.25, beforeDown: Math.max(0, (down.timeMs - 100) / 1000), afterDown: (down.timeMs + 100) / 1000,
      during: moves[Math.floor(moves.length / 2)].timeMs / 1000, beforeUp: (up.timeMs - 100) / 1000,
      afterUp: (up.timeMs + 100) / 1000, final: receipt.video.durationSeconds - 0.12};
    const frames = Object.entries(samples).map(([phase, seconds]) => {
      const file = path.join(tempRoot, `${label}-drag-${phase}.png`);
      execFileSync(path.join(repoRoot, ".tools/bin/ffmpeg"), ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", file], {timeout: 15000});
      return {phase, seconds, path: file, sha256: sha256(fs.readFileSync(file))};
    });
    assert.equal(sha256(fs.readFileSync(video)), receipt.video.sha256);
    assert.ok(Math.abs(receipt.video.durationSeconds * 1000 - receipt.timeline.captureDurationMs) <= 1000 / 30 + 5);
    const evidence = {label, source: "LOCAL_DETERMINISTIC_FIXTURE_NOT_PUBLIC_ARTICLE", node, result,
      receiptPath, ledgerPath, receiptSha256: sha256(fs.readFileSync(receiptPath)), ledgerSha256: sha256(fs.readFileSync(ledgerPath)),
      videoSha256: receipt.video.sha256, video: receipt.video, timeline: receipt.timeline,
      down, up, moveCount: moves.length, selectionEvents: ledger.events.filter(e => e.type === "selectionchange").length,
      finalSelection: receipt.finalSelectionReceipt, frames, actualPixelReview: "PENDING_MANUAL", cursorPixels: "NOT_INFERRED_FROM_EVENTS", productionAdmission: false};
    fs.writeFileSync(path.join(tempRoot, `${label}-drag-evidence.json`), JSON.stringify(evidence, null, 2)); cases.push(evidence);
    const reused = await executeScreenRecordingNode(node, {artifactRoot, ffprobePath});
    assert.equal(reused.capture?.reusedBySha, true, JSON.stringify(reused));
    const receiptBytes = fs.readFileSync(receiptPath), ledgerBytes = fs.readFileSync(ledgerPath);
    for (const mutation of ["selection", "trajectory", "finalHold"]) {
      const broken = structuredClone(receipt), badLedger = structuredClone(ledger);
      if (mutation === "selection") broken.beats[0].stateReceipt.observed.selection.withinTarget = false;
      if (mutation === "trajectory") { badLedger.events = badLedger.events.map(e => e.type === "pointermove" ? {...e, buttons: 0} : e); }
      if (mutation === "finalHold") broken.finalSelectionReceipt.observed.selection.text = "wrong";
      badLedger.beatBindings = broken.beats;
      const bytes = Buffer.from(JSON.stringify(badLedger)); broken.eventLedger.sha256 = sha256(bytes); broken.eventLedger.bytes = bytes.length;
      fs.writeFileSync(ledgerPath, bytes); fs.writeFileSync(receiptPath, JSON.stringify(broken));
      const denied = await executeScreenRecordingNode(node, {artifactRoot, ffprobePath});
      assert.equal(denied.state, "blocked"); assert.match(denied.reason, /^DRAG_/u);
      fs.writeFileSync(ledgerPath, ledgerBytes); fs.writeFileSync(receiptPath, receiptBytes);
    }
  }
  const negatives = [];
  for (const [route, expected] of [["/drag-ambiguous", "DRAG_TARGET_MISSING_OR_AMBIGUOUS"],
    ["/drag-unselectable", "DRAG_LAYOUT_UNSTABLE_OR_UNSELECTABLE"], ["/drag-overlay", "DRAG_LAYOUT_UNSTABLE_OR_UNSELECTABLE"],
    ["/drag-clear", "DRAG_FINAL_HOLD_SELECTION_INVALID"]]) {
    const node = structuredClone(cases[0].node); node.id = route.slice(1) + ":recording"; node.inputSha256 = sha256(Buffer.from(route));
    node.input.parameters.source.url = baseUrl + route;
    const result = await executeScreenRecordingNode(node, {artifactRoot, ffprobePath});
    assert.equal(result.state, "blocked", JSON.stringify(result));
    assert.ok(JSON.stringify(result).includes(expected), JSON.stringify(result));
    assert.equal(result.artifactManifest, undefined); negatives.push({route, expected, result});
  }
  const summary = {status: "PASS_REAL_LOCAL_DRAG_DOM_AND_MEDIA_PENDING_PIXEL_REVIEW", positiveCases: cases.length,
    cachePositiveReuses: 2, cacheNegativeCases: 6, negativeCases: negatives, source: "LOCAL_FIXTURE_ONLY", outputRoot: tempRoot,
    realBrowser: true, actualPixelReview: "NOT_GRANTED_BY_DECODE_OR_DOM", physicalUserInputVerified: false, productionAdmission: false};
  fs.writeFileSync(path.join(tempRoot, "drag-suite-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function testPublicResourcesPure(validNode, artifactRoot) {
  const url = "https://futurism.com/zuckerberg-war-rooms-meta-ai-deepseek";
  const profile = {contract: "A1PublicReadOnlyResourceProfile/v1", sourceUrl: url,
    approvalEvidenceSha256: "c41c4621096fbb5802b74c080bd906c494d4a1f27858925471d14d7e1d87eb7a",
    credentialPolicy: "OMIT", allowedMethods: ["GET","HEAD"], protocols: ["https:"], redirectPolicy: "FAIL_CLOSED",
    maxRequests: 128, maxResourceBytes: 8388608, maxTotalBytes: 33554432, maxConcurrentRequests: 2, maxRedirects: 3, requestTimeoutMs: 8000};
  const node = recordingNode({id: "public-pure:recording", inputSha256: "c".repeat(64), url});
  const loading = preparePublicResourceLoadingV1(node, {profile});
  const legacyProfileSha = sha256(Buffer.from(JSON.stringify(profile)));
  assert.notEqual(loading.profileSha256, legacyProfileSha);
  assert.deepEqual(loading.profile.workerEnforcement, {version:"A1WorkerCspEnforcement/v1",independentPolicy:"worker-src 'none'"});
  assert.deepEqual(loading.profile.transportRecovery,{version:"A1PublicResourcePreResponseResetRecovery/v1",maximumAttempts:2,backoffMs:75,retryCode:"ECONNRESET",beforeResponseOnly:true});
  assert.equal(preparePublicResourceLoadingV1(node,{profile,runtimeCoverage:{contract:"A1PublicResourceRuntimeCoverage/v1",profileSha256:legacyProfileSha,
    evidenceSha256:"e".repeat(64),zeroUnhandledRequests:true,workerPolicy:"DENY",channels:["http","frame","worker-denied","redirect-denied","websocket-denied","service-worker-denied","unattributed-denied"]}}).coverage,null);
  assert.equal(preparePublicResourceLoadingV1({...node, input: {...node.input, parameters: {...node.input.parameters, publicResourceLoading: {profile}}}}, null), null);
  for (const changed of [{credentialPolicy:"INCLUDE"}, {maxRequests:129}, {protocols:["http:"]}, {approvalEvidenceSha256:"0".repeat(64)}, {redirectPolicy:"FOLLOW"}]) {
    assert.throws(() => preparePublicResourceLoadingV1(node, {profile:{...profile,...changed}}), /PUBLIC_RESOURCE_PROFILE_INVALID/);
  }
  let launches = 0;
  assert.equal((await executeScreenRecordingNode(node, {artifactRoot, publicResourceLoading: {profile}, browserType: {launch: async () => { launches++; }} })).reason, "PUBLIC_RESOURCE_RUNTIME_COVERAGE_REQUIRED");
  assert.equal(launches,0);
  const lookup = async host => host === "mixed.example" ? [{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}] : [{address:"8.8.8.8",family:4}];
  let connections = 0; const sentHeaders = [];
  const transport = async (raw, pin, options) => {
    connections++; sentHeaders.push(options.headers);
    return {status:200,headers:{"content-type":"text/html", "set-cookie":"SECRET", "access-control-allow-credentials":"true", "content-security-policy":"default-src 'self'"},
      body:Buffer.from("<p>real resource fixture bytes</p>"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  };
  const make = (option=loading, requestImpl=transport) => createPublicRecordingResourceBrokerV1(option, {lookup,requestImpl});
  // Real standard-library encoded bytes, injected transport; no browser/provider here.
  const decodedBytes = Buffer.from("<p>Encoded article with exact UTF-8 字体</p>");
  const encodedCases = [["identity", decodedBytes], ["gzip", gzipSync(decodedBytes)], ["deflate", deflateSync(decodedBytes)],
    ["br", brotliCompressSync(decodedBytes)], ["gzip, br", brotliCompressSync(gzipSync(decodedBytes))]];
  for (const [encoding, raw] of encodedCases) {
    const b = make(loading,async(rawUrl,pin) => ({status:200,headers:{"content-type":"text/html","content-encoding":encoding,
      "content-length":String(raw.length),"transfer-encoding":"chunked"},body:raw,remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(rawUrl).hostname}));
    const result = await b.fetch(url,{mainDocument:true});
    assert.deepEqual(result.body,decodedBytes); assert.equal(result.status,200);
    assert.equal(result.headers["content-encoding"],undefined); assert.equal(result.headers["content-length"],undefined);
    assert.equal(result.headers["transfer-encoding"],undefined);
    const proof = b.proof(); assert.equal(validatePublicRecordingResourceProofV1(proof,loading),true);
    assert.equal(proof.totalReceivedBytes,raw.length); assert.equal(proof.resources[0].rawBodySha256,sha256(raw));
    assert.equal(proof.resources[0].bodySha256,sha256(decodedBytes));
    for (const key of ["rawBodyBytes","rawBodySha256","contentEncoding"]) {
      const tampered = structuredClone(proof); tampered.resources[0][key] = key === "rawBodyBytes" ? -1 : "invalid";
      tampered.resourceAuditSha256 = sha256(Buffer.from(JSON.stringify(tampered.resources)));
      assert.throws(() => validatePublicRecordingResourceProofV1(tampered,loading));
    }
  }
  const decode = (raw,encoding,extra={}) => decodePublicRecordingResourceBodyV1(raw,encoding,
    {maxBytes:1024,deadlineMs:Date.now()+1000,...extra});
  for (const [raw,coding,reason] of [[Buffer.from("broken"),"gzip","CONTENT_DECODING_FAILED"],
    [gzipSync(decodedBytes).subarray(0,-4),"gzip","CONTENT_DECODING_FAILED"],
    [deflateRawSync(decodedBytes),"deflate","CONTENT_DECODING_FAILED"],
    [Buffer.from("x"),"zstd","CONTENT_ENCODING_UNSUPPORTED"],
    [Buffer.from("x"),"gzip,br,deflate,gzip","CONTENT_ENCODING_UNSUPPORTED"],
    [gzipSync(Buffer.alloc(4096)),"gzip","DECODED_TOO_LARGE"],
    [brotliCompressSync(gzipSync(Buffer.alloc(4096))),"gzip, br","DECODED_TOO_LARGE"]])
    await assert.rejects(decode(raw,coding),new RegExp(reason));
  await assert.rejects(decode(Buffer.alloc(1025),"identity"),/BODY_INVALID/);
  await assert.rejects(decode(gzipSync(decodedBytes),"gzip",{deadlineMs:Date.now()-1}),/DECODE_TIMEOUT/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(decode(gzipSync(decodedBytes),"gzip",{signal:abort.signal}),/ABORTED/);
  const activeAbort = new AbortController();
  const pendingDecode = decodePublicRecordingResourceBodyV1(gzipSync(Buffer.alloc(2_000_000)),"gzip",
    {maxBytes:3_000_000,deadlineMs:Date.now()+1000,signal:activeAbort.signal}); activeAbort.abort();
  await assert.rejects(pendingDecode,/ABORTED/);
  await assert.rejects(decodePublicRecordingResourceBodyV1(gzipSync(Buffer.alloc(2_000_000)),"gzip",
    {maxBytes:3_000_000,deadlineMs:Date.now()+1}),/DECODE_TIMEOUT/);
  for (const extra of [{method:"HEAD"},{status:204},{status:304}]) {
    const result = await decode(Buffer.alloc(0),"gzip",extra); assert.equal(result.body.length,0);assert.deepEqual(result.layers,[]);
  }
  const expanded = gzipSync(Buffer.alloc(4096));
  const smallTotal={...loading,profile:{...loading.profile,maxTotalBytes:1024}};
  await assert.rejects(make(smallTotal,async(raw,pin)=>({...await transport(raw,pin,{headers:{}}),body:expanded,
    headers:{"content-type":"text/html","content-encoding":"gzip"}})).fetch(url,{mainDocument:true}),/DECODED_TOTAL_BYTE_LIMIT/);
  for (const extra of [{status:206},{headers:{"content-range":"bytes 0-1/10","content-type":"text/html"}}])
    await assert.rejects(make(loading,async(raw,pin)=>({...await transport(raw,pin,{headers:{}}),...extra})).fetch(url),/PARTIAL_RESPONSE_UNSUPPORTED/);
  connections = 0; sentHeaders.length = 0;
  const broker = make();
  const main = await broker.fetch(url,{mainDocument:true,headers:{cookie:"SECRET",authorization:"Bearer SECRET",referer:"https://secret.example/token"}});
  assert.equal(main.headers["set-cookie"],undefined); assert.equal(main.headers["access-control-allow-credentials"],"true");
  assert.equal(main.headers["content-security-policy"],"default-src 'self', worker-src 'none'");
  assert.equal(main.body.toString(),"<p>real resource fixture bytes</p>");
  assert.deepEqual(Object.keys(sentHeaders[0]).sort(),["accept","accept-encoding","user-agent"]);
  await broker.fetch("https://public.example/font.woff2?token=SECRET",{resourceType:"font"});
  const proof = broker.proof(); assert.equal(validatePublicRecordingResourceProofV1(proof,loading),true);
  assert.ok(!JSON.stringify(proof).includes("SECRET"));
  for(const mime of ["text/html; charset=utf-8","application/xhtml+xml"]) {
    const original={"content-type":mime,"content-security-policy":["default-src 'self'","script-src 'self'"],
      "content-security-policy-report-only":"default-src 'none'"};
    const b=make(loading,async(raw,pin)=>({status:200,headers:original,body:Buffer.from("UNCHANGED_BYTES"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname}));
    const result=await b.fetch(url,{mainDocument:true});
    assert.equal(result.body.toString(),"UNCHANGED_BYTES");
    assert.equal(result.headers["content-security-policy-report-only"],"default-src 'none'");
    assert.equal(result.headers["content-security-policy"],"default-src 'self', script-src 'self', worker-src 'none'");
    assert.equal(validatePublicRecordingResourceProofV1(b.proof(),loading),true);
  }
  const nonHtml=make(loading,async(raw,pin)=>({status:200,headers:{"content-type":"text/css","content-security-policy":"default-src 'self'"},
    body:Buffer.from("body{color:red}"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname}));
  assert.equal((await nonHtml.fetch("https://public.example/style.css",{resourceType:"stylesheet"})).headers["content-security-policy"],"default-src 'self'");
  assert.equal(nonHtml.audit[0].workerEnforcement.applied,false);
  for(const mutate of [r=>delete r.workerEnforcement,r=>r.workerEnforcement.version="OLD",r=>r.workerEnforcement.independentPolicy="worker-src *",
    r=>{delete r.workerEnforcement.appliedHeaders["content-security-policy"];r.workerEnforcement.appliedHeadersSha256=sha256(Buffer.from(JSON.stringify(r.workerEnforcement.appliedHeaders)));},
    r=>r.workerEnforcement.originalPolicies["content-security-policy"]=[]]) {
    const tampered=structuredClone(proof);mutate(tampered.resources[0]);tampered.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(tampered.resources)));
    assert.throws(()=>validatePublicRecordingResourceProofV1(tampered,loading),/CACHE_PROOF_INVALID/);
  }
  const changedHeader=structuredClone(proof);changedHeader.resources[0].workerEnforcement.originalRawHeadersSha256="0".repeat(64);
  changedHeader.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(changedHeader.resources)));
  assert.throws(()=>validatePublicRecordingResourceProofV1(changedHeader,{...loading,expectedResourceAuditSha256:proof.resourceAuditSha256}),/CACHE_PROOF_INVALID/);
  const invalidCsp=make(loading,async(raw,pin)=>({status:200,headers:{"content-type":"text/html","content-security-policy":"x".repeat(8193)},
    body:Buffer.from("<p>unchanged</p>"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname}));
  await assert.rejects(invalidCsp.fetch(url,{mainDocument:true}),/PUBLIC_RESOURCE_CSP_HEADER_INVALID/);
  let fulfills=0,aborts=0,continues=0;const page={};const frame={page:()=>page};page.mainFrame=()=>frame;
  for(const kind of ["main","frame","diagnostic-page-proxy","worker","unattributed","popup"]) {
    const before=connections;
    const request={frame:()=>kind==="unattributed"?null:kind==="popup"?{page:()=>({mainFrame:()=>({})})}:frame,
      allHeaders:async()=>({"sec-fetch-dest":kind==="worker"?"worker":"document"}),serviceWorker:()=>null,
      isNavigationRequest:()=>kind==="main",resourceType:()=>kind==="worker"?"script":"document",url:()=>url,method:()=>"GET"};
    const route={request:()=>request,fulfill:async()=>{fulfills++;},abort:async()=>{aborts++;},continue:async()=>{continues++;}};
    if(["main","frame","diagnostic-page-proxy"].includes(kind))await fulfillPublicRecordingResourceRequestV1(route,kind==="diagnostic-page-proxy"?new Proxy(page,{}):page,make());
    else {await assert.rejects(fulfillPublicRecordingResourceRequestV1(route,page,make()));assert.equal(connections,before);}
  }
  assert.equal(fulfills,3);assert.equal(aborts,3);assert.equal(continues,0);
  const transportFailure=make(loading,async()=>{throw Object.assign(new Error("synthetic private request details"),{code:"ECONNRESET"});});
  await assert.rejects(transportFailure.fetch(url,{mainDocument:true}),/PUBLIC_RESOURCE_FETCH_FAILED/);
  assert.equal(transportFailure.audit[0].primaryFailure,true);
  assert.equal(transportFailure.audit[0].transportErrorCode,"ECONNRESET");
  await assert.rejects(transportFailure.fetch("https://public.example/cascade"),/PUBLIC_RESOURCE_FETCH_FAILED/);
  assert.equal(transportFailure.audit[1].primaryFailure,false);
  assert.ok(!JSON.stringify(transportFailure.audit).includes("synthetic private request details"));
  const candidateUrl="https://metrics.example/async.js",declaration='<script>const script=document.createElement("script");script.async=true;</script>';
  const candidate={url:candidateUrl,resourceType:"script",role:"ASYNC_DEPENDENCY_CANDIDATE",sourceDeclaration:declaration,
    sourceDeclarationSHA:sha256(Buffer.from(declaration)),sourceDocumentSHA:"a".repeat(64),failureDisposition:"REVIEW_ONLY_RELATIONSHIP_UNPROVEN"};
  const candidateLoading=preparePublicResourceLoadingV1(node,{profile,dependencyCandidates:[candidate]});
  const articleNode=structuredClone(node);articleNode.input.parameters.beats.forEach(beat=>{beat.action.type="dragSelectText";});
  articleNode.input.parameters.policy.blockMutations=true;
  const articleLoading=preparePublicResourceLoadingV1(articleNode,{profile,articleReadOnlyReview:true});
  const stylesheetUrl="https://fonts-fixture.example/stylesheet.css";
  const styleDeclaration=`<link rel="stylesheet" href="${stylesheetUrl}">`,styleMain=Buffer.from(`<h1>Article</h1>${styleDeclaration}`);
  const styleCandidate={url:stylesheetUrl,resourceType:"stylesheet",role:"STYLESHEET_FALLBACK_CANDIDATE",sourceDeclaration:styleDeclaration,
    sourceDeclarationSHA:sha256(Buffer.from(styleDeclaration)),sourceDocumentSHA:sha256(styleMain),failureDisposition:"REVIEW_ONLY_RELATIONSHIP_UNPROVEN"};
  assert.throws(()=>preparePublicResourceLoadingV1(node,{profile,dependencyCandidates:[styleCandidate]}),/CANDIDATE_INVALID/);
  for(const kind of ["timeout","tls","partial","source-sha","owner","undeclared","response-started","method"]){
    const option=preparePublicResourceLoadingV1(articleNode,{profile,articleReadOnlyReview:true,
      dependencyCandidates:[{...styleCandidate,...(kind==="source-sha"?{sourceDocumentSHA:"f".repeat(64)}:{})}]});
    const b=make(option,async(raw,pin)=>{
      if(raw===url)return {status:200,headers:{"content-type":"text/html"},body:styleMain,remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
      throw Object.assign(new Error(kind==="tls"?"PUBLIC_RESOURCE_SOCKET_OR_TLS_MISMATCH":"PUBLIC_RESOURCE_TIMEOUT"),
        {responseStarted:kind==="response-started"||kind==="partial",receivedBytes:kind==="partial"?2:0,securityFailure:kind==="tls"});
    });
    await b.fetch(url,{mainDocument:true});const action=b.fetch(kind==="undeclared"?"https://fonts-fixture.example/other.css":stylesheetUrl,
      {resourceType:"stylesheet",ownedFrame:kind!=="owner",nativeRequestId:"style-request",frameId:"style-frame",method:kind==="method"?"POST":"GET"});
    if(kind==="timeout"){
      assert.equal((await action).dependencyTransportFailure,true);assert.equal(b.audit.at(-1).outcome,"STYLESHEET_TRANSPORT_FAILURE_REVIEW_ONLY");
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),option),true);
      const forged=structuredClone(b.proof());forged.resources.at(-1).dependencyFailureProof.ownedFrame=false;
      forged.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(forged.resources)));assert.throws(()=>validatePublicRecordingResourceProofV1(forged,option));
    }else await assert.rejects(action);
  }
  for(const kind of ["style404","main404","script404","style403","challenge404"]){
    const originalBody="Original non-OK linked resource";
    const b=make(articleLoading,async(raw,pin)=>({status:raw===url?200:kind==="style403"?403:404,
      headers:{"content-type":"text/html"},body:Buffer.from(kind==="challenge404"&&raw!==url?"Checking your browser":originalBody),
      remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname}));
    await b.fetch(url,{mainDocument:true});
    const request={method:"GET",resourceType:kind==="script404"?"script":"stylesheet",mainDocument:kind==="main404",ownedFrame:true,nativeRequestId:kind,frameId:"main"};
    if(kind==="style404"){
      const response=await b.fetch("https://any-public.example/style.css",request);
      assert.equal(response.status,404);assert.equal(response.body.toString(),originalBody);
      assert.equal(b.audit[1].outcome,"HTTP_ERROR_STYLESHEET_REVIEW_ONLY");assert.equal(validatePublicRecordingResourceProofV1(b.proof(),articleLoading),true);
    }else await assert.rejects(b.fetch("https://any-public.example/style.css",request));
  }
  for(const kind of ["stylesheet404","main404","script404","stylesheet403","challenge404","unowned404"]){
    const b=make(articleLoading,async(raw,pin)=>({status:raw===url?200:kind==="stylesheet403"?403:404,
      headers:{"content-type":"text/html"},body:Buffer.from(kind==="challenge404"&&raw!==url?"Checking your browser":"Original 404 response body"),
      remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname}));
    await b.fetch(url,{mainDocument:true});
    const options={method:"GET",resourceType:kind==="script404"?"script":"stylesheet",mainDocument:kind==="main404",ownedFrame:kind!=="unowned404",nativeRequestId:kind,frameId:"main"};
    if(kind==="stylesheet404"){
      const response=await b.fetch("https://arbitrary.example/original.css",options);assert.equal(response.status,404);
      assert.equal(response.body.toString(),"Original 404 response body");assert.equal(b.audit[1].outcome,"HTTP_ERROR_STYLESHEET_REVIEW_ONLY");
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),articleLoading),true);
    }else await assert.rejects(b.fetch("https://arbitrary.example/original.css",options));
  }
  const secondSource={contract:"A1TrustedPublicArticleSource/v1",url:"https://second.example/article",evidenceSha256:"e".repeat(64)};
  const secondNode=structuredClone(articleNode);secondNode.input.parameters.source.url=secondSource.url;
  const secondProfile={...profile,sourceUrl:secondSource.url,approvalEvidenceSha256:secondSource.evidenceSha256};
  assert.equal(preparePublicResourceLoadingV1(secondNode,{profile:secondProfile,articleReadOnlyReview:true,trustedArticleSource:secondSource}).profile.sourceUrl,secondSource.url);
  assert.throws(()=>preparePublicResourceLoadingV1(secondNode,{profile:secondProfile,articleReadOnlyReview:true}),/PROFILE_INVALID/);
  for(const wrong of [{url:"https://127.0.0.1/private"},{url:"http://second.example/article"},{evidenceSha256:"invalid"},{contract:"CALLER_NODE_INPUT"}])
    assert.throws(()=>preparePublicResourceLoadingV1(secondNode,{profile:secondProfile,articleReadOnlyReview:true,trustedArticleSource:{...secondSource,...wrong}}));
  assert.throws(()=>preparePublicResourceLoadingV1(node,{profile,articleReadOnlyReview:true}),/ARTICLE_REVIEW_INVALID/);
  for(const kind of ["unknown-post-a","unknown-post-b","preflight","put","private","challenge","not-owned","wrong-type","redirect","missing-request-id","missing-frame-id"]){
    let lookups=0,calls=0;
    const b=createPublicRecordingResourceBrokerV1(articleLoading,{lookup:async()=>{lookups++;return [{address:"8.8.8.8",family:4}];},requestImpl:async(raw,pin)=>{
      calls++;return {status:200,headers:{"content-type":"text/html"},body:Buffer.from("<h1>Source</h1>"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
    }});
    await b.fetch(url,{mainDocument:true});const before={lookups,calls};
    const target=kind==="private"?"https://127.0.0.1/private":kind==="challenge"?"https://unknown.example/challenge":"https://"+(kind==="unknown-post-b"?"second.example":"unclassified.example")+"/endpoint";
    const metadata={method:kind==="put"?"PUT":kind==="preflight"?"OPTIONS":"POST",resourceType:kind==="wrong-type"?"script":"xhr",ownedFrame:kind!=="not-owned",
      nativeRequestId:kind==="missing-request-id"?undefined:kind,frameId:kind==="missing-frame-id"?undefined:"main",
      ...(kind==="redirect"?{redirectedRequestId:"old"}:{})};
    if(["unknown-post-a","unknown-post-b","preflight"].includes(kind)){
      assert.equal((await b.fetch(target,metadata)).deniedTelemetry,true);assert.equal(validatePublicRecordingResourceProofV1(b.proof(),articleLoading),true);
      assert.equal(b.audit[1].articleDenialProof.purpose,"UNMEASURED");
    }else await assert.rejects(b.fetch(target,metadata));
    assert.deepEqual({lookups,calls},before,"background rejection must not resolve/send");
  }
  const smallArticleLoading=preparePublicResourceLoadingV1(articleNode,{profile:{...profile,maxRequests:1},articleReadOnlyReview:true});
  const boundedArticle=make(smallArticleLoading);await boundedArticle.fetch(url,{mainDocument:true});boundedArticle.markArticleReady();
  assert.equal((await boundedArticle.fetch("https://unknown.example/after-budget",{nativeRequestId:"budget",frameId:"main",ownedFrame:true})).deniedTelemetry,true);
  assert.equal(validatePublicRecordingResourceProofV1(boundedArticle.proof(),smallArticleLoading),true);
  assert.equal(boundedArticle.proof().physicalRequestCount,1);
  const denialLimitedArticle=make(articleLoading);await denialLimitedArticle.fetch(url,{mainDocument:true});
  for(let i=0;i<64;i++)await denialLimitedArticle.fetch("https://unknown.example/denial",{method:"POST",resourceType:"xhr",ownedFrame:true,nativeRequestId:`limit-${i}`,frameId:"main"});
  await assert.rejects(denialLimitedArticle.fetch("https://unknown.example/denial",{method:"POST",resourceType:"xhr",ownedFrame:true,nativeRequestId:"overflow",frameId:"main"}),/BACKGROUND_DENIAL_LIMIT/);
  assert.equal(denialLimitedArticle.audit.length,66);assert.equal(denialLimitedArticle.audit.at(-1).outcome,"REJECTED");
  const auditLimitedArticle=make(articleLoading);await auditLimitedArticle.fetch(url,{mainDocument:true});
  for(let i=0;i<255;i++)try{auditLimitedArticle.reject("PUBLIC_RESOURCE_FIXTURE_REJECTION",{index:i});}catch{}
  assert.throws(()=>auditLimitedArticle.reject("PUBLIC_RESOURCE_FIXTURE_REJECTION",{index:256}),/AUDIT_LIMIT/);
  assert.equal(auditLimitedArticle.audit.length,257);assert.equal(auditLimitedArticle.audit.at(-1).outcome,"AUDIT_OVERFLOW");
  assert.throws(()=>auditLimitedArticle.proof());
  const frameRule={endpoint:"https://metrics.example/child.html",status:400,resourceType:"document",evidenceSHA:"d".repeat(64),
    sourceDeclaration:declaration,sourceDeclarationSHA:candidate.sourceDeclarationSHA,initiatorScript:"https://metrics.example/async.js"};
  const frameLoading=preparePublicResourceLoadingV1(node,{profile,failedFrameResponses:[frameRule]});
  for(const kind of ["exact","main","unknown-initiator","403","missing-declaration"]){
    const b=createPublicRecordingResourceBrokerV1(frameLoading,{lookup:async()=>[{address:"8.8.8.8",family:4}],requestImpl:async(raw,pin)=>({
      status:raw===url?200:kind==="403"?403:400,headers:{"content-type":"text/html"},body:Buffer.from(raw===url&&kind!=="missing-declaration"?declaration:"<h1>Actual error response</h1>"),
      remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname})});
    await b.fetch(url,{mainDocument:true});
    const metadata={resourceType:"document",mainFrame:kind==="main",nativeRequestId:"child-request",frameId:"child-frame",
      initiator:{type:"script",scripts:[{url:kind==="unknown-initiator"?"https://other.example/js":frameRule.initiatorScript}]}};
    if(kind==="exact"){
      const response=await b.fetch(frameRule.endpoint,metadata);assert.equal(response.status,400);assert.match(response.body.toString(),/Actual error/);
      assert.equal(b.audit[1].outcome,"HTTP_ERROR_REVIEW_ONLY");assert.equal(validatePublicRecordingResourceProofV1(b.proof(),frameLoading),true);
    }else await assert.rejects(b.fetch(frameRule.endpoint,metadata));
  }
  const deniedRule={endpoint:"https://metrics.example/g/collect",method:"POST",resourceType:"xhr",evidenceSHA:"d".repeat(64),
    sourceDeclaration:declaration,sourceDeclarationSHA:candidate.sourceDeclarationSHA,initiatorScript:candidateUrl};
  const denialLoading=preparePublicResourceLoadingV1(node,{profile,dependencyCandidates:[candidate],deniedTelemetry:[deniedRule]});
  const scriptBytes=Buffer.from("/* verified initiator fixture bytes */");
  const byteRule={...deniedRule,initiatorBodySHA:sha256(scriptBytes)};delete byteRule.sourceDeclaration;delete byteRule.sourceDeclarationSHA;
  const byteLoading=preparePublicResourceLoadingV1(node,{profile,deniedTelemetry:[byteRule]});
  for(const kind of ["exact","missing-script","wrong-script-bytes"]){
    const b=createPublicRecordingResourceBrokerV1(byteLoading,{lookup:async()=>[{address:"8.8.8.8",family:4}],requestImpl:async(raw,pin)=>({status:200,
      headers:{"content-type":raw===url?"text/html":"application/javascript"},body:raw===url?Buffer.from("<h1>Source</h1>"):kind==="wrong-script-bytes"?Buffer.from("wrong bytes"):scriptBytes,
      remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname})});
    await b.fetch(url,{mainDocument:true});if(kind!=="missing-script")await b.fetch(candidateUrl,{resourceType:"script"});
    const metadata={method:"POST",resourceType:"xhr",mainFrame:true,nativeRequestId:"script-byte-request",frameId:"main",
      initiator:{type:"script",scripts:[{url:candidateUrl}]}};
    if(kind==="exact"){
      assert.equal((await b.fetch(deniedRule.endpoint,metadata)).deniedTelemetry,true);
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),byteLoading),true);
      const forged=structuredClone(b.proof());forged.resources.at(-1).denialProof.sourceScriptBodySHA="f".repeat(64);
      forged.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(forged.resources)));assert.throws(()=>validatePublicRecordingResourceProofV1(forged,byteLoading));
    }else await assert.rejects(b.fetch(deniedRule.endpoint,metadata),/METHOD_BLOCKED/);
  }
  for(const wrong of [{method:"GET"},{endpoint:"http://metrics.example/g/collect"},{sourceDeclarationSHA:"e".repeat(64)}])
    assert.throws(()=>preparePublicResourceLoadingV1(node,{profile,dependencyCandidates:[candidate],deniedTelemetry:[{...deniedRule,...wrong}]}));
  for(const kind of ["exact","unknown-endpoint","unknown-initiator","frame","redirect","missing-declaration","limit"]){
    let lookups=0,calls=0;
    const b=createPublicRecordingResourceBrokerV1(denialLoading,{lookup:async()=>{lookups++;return [{address:"8.8.8.8",family:4}];},requestImpl:async(raw,pin)=>{
      calls++;return {status:200,headers:{"content-type":"text/html"},body:Buffer.from(kind==="missing-declaration"?"<h1>SSR</h1>":declaration),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
    }});
    await b.fetch(url,{mainDocument:true});const before={lookups,calls};
    const metadata={method:"POST",resourceType:"xhr",mainFrame:kind!=="frame",nativeRequestId:"native-denied",frameId:"owned-main",
      initiator:{type:"script",scripts:[{url:kind==="unknown-initiator"?"https://other.example/js":candidateUrl}]},
      ...(kind==="redirect"?{redirectedRequestId:"old-request"}:{})};
    const target=kind==="unknown-endpoint"?"https://metrics.example/unknown":deniedRule.endpoint+"?v=2&cid=private-fixture";
    if(["exact","limit"].includes(kind)){
      assert.equal((await b.fetch(target,metadata)).deniedTelemetry,true);b.check();
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),denialLoading),true);
      assert.ok(!JSON.stringify(b.audit).includes("private-fixture"));
      const forged=structuredClone(b.proof());forged.resources[1].denialProof.httpCalls=1;
      forged.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(forged.resources)));assert.throws(()=>validatePublicRecordingResourceProofV1(forged,denialLoading));
      if(kind==="limit"){
        for(let i=1;i<16;i++)await b.fetch(target,{...metadata,nativeRequestId:`native-${i}`});
        await assert.rejects(b.fetch(target,metadata),/DENIED_TELEMETRY_LIMIT/);
      }
    }else await assert.rejects(b.fetch(target,metadata),/METHOD_BLOCKED/);
    assert.deepEqual({lookups,calls},before,"denied POST must never resolve or send");
  }
  for(const wrong of [{resourceType:"font"},{role:"REQUIRED"},{sourceDeclarationSHA:"b".repeat(64)}])assert.throws(()=>preparePublicResourceLoadingV1(node,{profile,dependencyCandidates:[{...candidate,...wrong}]}));
  for(const errorCase of ["transport-timeout","security","private-dns","http403","declaration-missing","undeclared-script"]){
    const b=createPublicRecordingResourceBrokerV1(candidateLoading,{lookup:async host=>errorCase==="private-dns"&&host==="metrics.example"?[{address:"127.0.0.1",family:4}]:[{address:"8.8.8.8",family:4}],requestImpl:async(raw,pin)=>{
      if(raw===url)return {status:200,headers:{"content-type":"text/html"},body:Buffer.from(errorCase==="declaration-missing"?"<h1>SSR</h1>":declaration),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
      if(errorCase==="http403")return {status:403,headers:{},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
      throw Object.assign(new Error(errorCase==="security"?"PUBLIC_RESOURCE_SOCKET_OR_TLS_MISMATCH":"PUBLIC_RESOURCE_TIMEOUT"),{responseStarted:false,receivedBytes:0,securityFailure:errorCase==="security"});
    }});
    await b.fetch(url,{mainDocument:true});
    const resourceUrl=errorCase==="undeclared-script"?"https://other.example/script.js":candidateUrl;
    if(errorCase==="transport-timeout"){
      const result=await b.fetch(resourceUrl,{resourceType:"script"});assert.equal(result.dependencyTransportFailure,true);b.check();
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),candidateLoading),true);
      const forged=structuredClone(b.proof());forged.resources[1].dependencyFailureProof.sourceDeclarationSHA="c".repeat(64);
      forged.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(forged.resources)));assert.throws(()=>validatePublicRecordingResourceProofV1(forged,candidateLoading));
    }else await assert.rejects(b.fetch(resourceUrl,{resourceType:"script"}));
  }
  const reset = (extra={}) => Object.assign(new Error("synthetic reset private details"),
    {code:"ECONNRESET",responseStarted:false,receivedBytes:0,securityFailure:false,...extra});
  let resetCalls=0,dnsChecks=0;
  const recovered=createPublicRecordingResourceBrokerV1(loading,{lookup:async()=>{
    dnsChecks++;return [{address:dnsChecks===1?"8.8.8.8":"8.8.4.4",family:4}];
  },requestImpl:async(raw,pin,options)=>{
    resetCalls++;if(resetCalls===1)throw reset();return transport(raw,pin,options);
  }});
  await recovered.fetch(url,{mainDocument:true});
  assert.equal(resetCalls,2);assert.equal(dnsChecks,2);
  const recoveredProof=recovered.proof();assert.equal(recoveredProof.physicalRequestCount,2);
  assert.equal(recoveredProof.resources[0].recoveryCount,1);
  assert.equal(recoveredProof.resources[0].retryCount,1);
  assert.equal(recoveredProof.resources[0].originalTransportErrorCode,"ECONNRESET");
  assert.equal(recoveredProof.resources[0].attempts[0].selectedAddress,"8.8.8.8");
  assert.equal(recoveredProof.resources[0].selectedAddress,"8.8.4.4");
  assert.equal(validatePublicRecordingResourceProofV1(recoveredProof,loading),true);
  const unsafeRecovery=structuredClone(recoveredProof);unsafeRecovery.resources[0].attempts[0].responseStarted=true;
  unsafeRecovery.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(unsafeRecovery.resources)));
  assert.throws(()=>validatePublicRecordingResourceProofV1(unsafeRecovery,loading));
  for(const unsafe of [{responseStarted:true},{responseStarted:true,receivedBytes:3},{responseStarted:undefined},
    {receivedBytes:undefined},{securityFailure:true},{code:"UNKNOWN"},{code:"CERT_HAS_EXPIRED"}]) {
    let calls=0;const b=make(loading,async()=>{calls++;throw reset(unsafe);});
    await assert.rejects(b.fetch(url,{mainDocument:true}));assert.equal(calls,1);
  }
  let twice=0;const twiceReset=make(loading,async()=>{twice++;throw reset();});
  await assert.rejects(twiceReset.fetch(url,{mainDocument:true}));assert.equal(twice,2);
  assert.equal(twiceReset.audit[0].retryCount,1);assert.equal(twiceReset.audit[0].recoveryCount,0);
  assert.equal(twiceReset.audit[0].attempts.length,2);assert.equal(twiceReset.audit[0].primaryFailure,true);
  let privateChecks=0,privateCalls=0;
  const changedDns=createPublicRecordingResourceBrokerV1(loading,{lookup:async()=>{
    privateChecks++;return privateChecks===1?[{address:"8.8.8.8",family:4}]:[{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}];
  },requestImpl:async()=>{privateCalls++;throw reset();}});
  await assert.rejects(changedDns.fetch(url,{mainDocument:true}),/PUBLIC_URL_DNS_NOT_PUBLIC/);
  assert.equal(privateChecks,2);assert.equal(privateCalls,1);
  let headCalls=0;const headRecovery=make(loading,async(raw,pin)=>{
    headCalls++;if(headCalls===1)throw reset();return {status:200,headers:{},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  });
  await headRecovery.fetch("https://public.example/head",{method:"HEAD"});assert.equal(headCalls,2);
  let lateDnsCalls=0,lateTransportCalls=0;
  const expiresDuringDns=createPublicRecordingResourceBrokerV1({...loading,profile:{...loading.profile,requestTimeoutMs:130}},{lookup:async()=>{
    lateDnsCalls++;if(lateDnsCalls===2)await new Promise(resolve=>setTimeout(resolve,80));return [{address:"8.8.8.8",family:4}];
  },requestImpl:async()=>{lateTransportCalls++;throw reset();}});
  await assert.rejects(expiresDuringDns.fetch(url,{mainDocument:true}));assert.equal(lateDnsCalls,2);assert.equal(lateTransportCalls,1);
  for(const limit of [{requestTimeoutMs:50},{maxRequests:1}]) {
    let calls=0;const b=make({...loading,profile:{...loading.profile,...limit}},async()=>{calls++;throw reset();});
    await assert.rejects(b.fetch(url,{mainDocument:true}));assert.equal(calls,1);
  }
  for(const status of [403,302]) {
    let calls=0;const b=make(loading,async(raw,pin)=>{calls++;return {status,headers:{location:"https://public.example/"},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};});
    await assert.rejects(b.fetch(url,{mainDocument:true}));assert.equal(calls,1);
  }
  let budgetCalls=0;const bytesExhausted=make({...loading,profile:{...loading.profile,maxTotalBytes:1}},async(raw,pin)=>{
    budgetCalls++;return {status:200,headers:{"content-type":"text/html"},body:Buffer.from("A"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  });
  await bytesExhausted.fetch(url,{mainDocument:true});
  await assert.rejects(bytesExhausted.fetch("https://public.example/extra"),/TOTAL_BYTE_LIMIT/);assert.equal(budgetCalls,1);
  for(const stage of ["before-response","headers","partial-body","security"]) {
    const requestFactory=(_options,onResponse)=>{
      const request=new EventEmitter();
      request.destroy=error=>queueMicrotask(()=>request.emit("error",error||new Error("fixture destroyed")));
      request.end=()=>queueMicrotask(()=>{
        if(stage==="before-response"){request.emit("error",Object.assign(new Error("fixture reset"),{code:"ECONNRESET"}));return;}
        const socket=new EventEmitter();socket.remoteAddress=stage==="security"?"127.0.0.1":"8.8.8.8";socket.authorized=true;
        request.emit("socket",socket);socket.emit("secureConnect");if(stage==="security")return;
        const response=new EventEmitter();response.statusCode=200;response.headers={};response.destroy=()=>{};
        onResponse(response);if(stage==="partial-body")response.emit("data",Buffer.from("abc"));
        response.emit("error",Object.assign(new Error("fixture reset"),{code:"ECONNRESET"}));
      });return request;
    };
    await assert.rejects(requestPinnedRecordingResourceV1(url,{address:"8.8.8.8",family:4},{method:"GET",headers:{},timeoutMs:100,maxBytes:8,requestFactory}),error=>{
      assert.equal(error.responseStarted,["headers","partial-body"].includes(stage));
      assert.equal(error.receivedBytes,stage==="partial-body"?3:0);assert.equal(error.securityFailure,stage==="security");return true;
    });
  }
  const badRequests = [["https://127.0.0.1/","GET"],["https://mixed.example/a","GET"],["http://public.example/a","GET"],
    ["https://user:password@public.example/a","GET"],["https://public.example/turnstile/a","GET"],[url,"POST"]];
  for (const [raw,method] of badRequests) {
    const before=connections; await assert.rejects(make().fetch(raw,{method})); assert.equal(connections,before);
  }
  const redirectLoading=preparePublicResourceLoadingV1(node,{profile:{...profile,redirectPolicy:"VALIDATED_BROWSER_CHAIN"}});
  const startScript="https://public.example/scripts/entry?ver=6",finalScript="https://public.example/scripts/final";
  let hopCalls=0;
  const hopBroker=make(redirectLoading,async(raw,pin,options)=>{
    hopCalls++;assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.cookie,undefined);
    if(raw===startScript)return {status:302,headers:{location:"/scripts/final","content-type":"text/html","access-control-allow-origin":"https://futurism.com"},body:Buffer.from("redirect"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
    return {status:200,headers:{"content-type":raw===url?"text/html":"application/javascript"},body:Buffer.from("local public bytes"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  });
  await hopBroker.fetch(url,{mainDocument:true});
  const hop=await hopBroker.fetch(startScript,{resourceType:"script",headers:{origin:"https://futurism.com",authorization:"PRIVATE",cookie:"PRIVATE"}});
  assert.equal(hop.status,302);assert.equal(hop.headers.location,"/scripts/final");assert.equal(hop.browserRedirect.url,finalScript);
  assert.equal(hopBroker.markRemovedFrameCancellation("not-a-native-request","unowned"),false);
  const end=await hopBroker.fetch(finalScript,{resourceType:"script",redirectChain:hop.browserRedirect});
  assert.equal(end.status,200);assert.equal(hopCalls,3);assert.equal(validatePublicRecordingResourceProofV1(hopBroker.proof(),redirectLoading),true);
  for(const location of [startScript,"https://127.0.0.1/private","https://mixed.example/private","http://public.example/","https://public.example/turnstile/"]){
    let calls=0;const b=make(redirectLoading,async(raw,pin)=>{calls++;return {status:302,headers:{location},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};});
    await assert.rejects(b.fetch(startScript,{resourceType:"script"}));assert.equal(calls,1);
  }
  let limitCalls=0;const hopLimit=make({...redirectLoading,profile:{...redirectLoading.profile,maxRedirects:1}},async(raw,pin)=>{
    limitCalls++;return {status:302,headers:{location:raw===startScript?finalScript:"https://public.example/third"},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  });
  const firstHop=await hopLimit.fetch(startScript);await assert.rejects(hopLimit.fetch(finalScript,{redirectChain:firstHop.browserRedirect}),/REDIRECT_LIMIT/);assert.equal(limitCalls,2);
  const priorityOrder=[];let releasePriority;
  const priorityBroker=make({...redirectLoading,profile:{...redirectLoading.profile,maxConcurrentRequests:1}},async(raw,pin)=>{
    priorityOrder.push(raw);if(raw.endsWith('/hold'))await new Promise(resolve=>{releasePriority=resolve;});
    return {status:200,headers:{"content-type":"text/html"},body:Buffer.from("public"),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
  });
  const held=priorityBroker.fetch("https://public.example/hold");await new Promise(resolve=>setTimeout(resolve,5));
  const fresh=priorityBroker.fetch("https://public.example/fresh");
  const continued=priorityBroker.fetch(finalScript,{redirectChain:{rootUrl:startScript,hops:1,visited:[startScript,finalScript],deadlineMs:Date.now()+1000}});
  releasePriority();await Promise.all([held,fresh,continued]);
  assert.deepEqual(priorityOrder,["https://public.example/hold",finalScript,"https://public.example/fresh"]);
  let expiredCalls=0;const expiredHop=make(redirectLoading,async()=>{expiredCalls++;});
  await assert.rejects(expiredHop.fetch(finalScript,{redirectChain:{rootUrl:startScript,hops:1,visited:[startScript,finalScript],deadlineMs:Date.now()-1}}),/TIMEOUT/);assert.equal(expiredCalls,0);
  class MockCdp extends EventEmitter {
    commands=[];
    async send(method,parameters){this.commands.push({method,parameters});if(method==="Page.getFrameTree")return {frameTree:{frame:{id:"owned-main"}}};return {};}
    async detach(){}
  }
  const browserClient=new MockCdp(),pageClient=new MockCdp(),context=new EventEmitter();context.newCDPSession=async()=>pageClient;context.close=async()=>{};
  const owner=await createPublicRecordingFetchOwnerV1({newBrowserCDPSession:async()=>browserClient},make(redirectLoading),{loading:redirectLoading});
  await owner.bindPage(context,{});
  browserClient.emit("Fetch.requestPaused",{requestId:"native-owned-id",frameId:"owned-main",resourceType:"Document",request:{url,method:"GET",headers:{}}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(browserClient.commands.filter(x=>x.method==="Fetch.fulfillRequest").length,1,"networkId is observation only; native Fetch ID owns decision");
  browserClient.emit("Fetch.requestPaused",{requestId:"foreign-id",frameId:"not-owned",resourceType:"Script",request:{url:finalScript,method:"GET",headers:{}}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(browserClient.commands.filter(x=>x.method==="Fetch.failRequest").length,1);
  browserClient.emit("Fetch.requestPaused",{requestId:"native-owned-id",frameId:"owned-main",resourceType:"Document",request:{url,method:"GET",headers:{}}});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(browserClient.commands.filter(x=>x.method==="Fetch.fulfillRequest").length,1);
  assert.equal(browserClient.commands.filter(x=>x.method==="Fetch.continueRequest").length,0);
  await owner.closeOutstanding();await owner.detachAfterBrowserClose();
  const redirectCases = ["https://127.0.0.1/private", "https://mixed.example/private", "https://public.example/valid"];
  for (const location of redirectCases) {
    let calls=0;
    const b=make(loading,async(raw,pin)=>{calls++;return {status:302,headers:{location},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};});
    await assert.rejects(b.fetch(url,{mainDocument:true}),location.includes("/valid") ? /REDIRECT_BROKER_CONTEXT_UNSUPPORTED/ : /PUBLIC_/);
    assert.equal(calls,1,"redirect must make zero next-hop connections");
  }
  for (const change of [{remoteAddress:"1.1.1.1"},{tlsAuthorized:false},{servername:"other.example"},{status:403},{body:Buffer.alloc(9)},{headers:{"content-encoding":"gzip"}}]) {
    const limited={...loading,profile:{...loading.profile,maxResourceBytes:8}};
    await assert.rejects(make(limited,async(raw,pin)=>({...await transport(raw,pin,{headers:{}}),body:Buffer.from("ok"),...change})).fetch(url));
  }
  for (const key of ["profileSha256","sourceBodySha256","resourceAuditSha256","runtimeCoverageSha256"]) {
    const changed=structuredClone(proof);changed[key]="0".repeat(64);assert.throws(()=>validatePublicRecordingResourceProofV1(changed,loading));
  }
  const rewritten=structuredClone(proof);rewritten.resources[0].bodySha256="a".repeat(64);rewritten.sourceBodySha256="a".repeat(64);
  rewritten.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(rewritten.resources)));
  assert.throws(()=>validatePublicRecordingResourceProofV1(rewritten,{...loading,expectedResourceAuditSha256:proof.resourceAuditSha256}));
  const privateProof=structuredClone(proof);privateProof.resources[0].addresses.push({address:"127.0.0.1",family:4});privateProof.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(privateProof.resources)));
  assert.throws(()=>validatePublicRecordingResourceProofV1(privateProof,loading));
  assert.throws(()=>validatePublicRecordingResourceProofV1(proof,preparePublicResourceLoadingV1(node,{profile:{...profile,maxRequests:127}})));
  const coverage={contract:"A1PublicResourceRuntimeCoverage/v1",profileSha256:loading.profileSha256,evidenceSha256:"e".repeat(64),zeroUnhandledRequests:true,workerPolicy:"DENY",nativeNetworkPolicy:"A1BrowserNativeNetworkDeny/v1",transportRecoveryPolicy:"A1PublicResourcePreResponseResetRecovery/v1",httpRoutingPolicy:"A1PublicBrowserFetchOwner/v1",
    channels:["http","frame","worker-denied","redirect-denied","websocket-denied","service-worker-denied","unattributed-denied"]};
  const coveredOption={profile,runtimeCoverage:coverage,expectedResourceAuditSha256:proof.resourceAuditSha256};
  const cacheRoot=path.join(tempRoot,"public-negative-cache");let cacheCases=0;
  for(const kind of ["missing-anchor","audit","source","ledger","worker-policy","worker-header-rehashed","native-policy"]) {
    const cachedNode={...node,id:`public-cache-${kind}:recording`,inputSha256:sha256(Buffer.from(kind))},p=cachedNode.input.parameters;
    const capturePlanSha256=sha256(Buffer.from(JSON.stringify({nodeId:cachedNode.id,inputSha256:cachedNode.inputSha256,source:{url},viewport:p.viewport,initialState:p.initialState,beats:p.beats,policy:p.policy,publicResourceProfileSha256:loading.profileSha256})));
    const cp=structuredClone(proof);cp.runtimeCoverageSha256=sha256(Buffer.from(JSON.stringify(coverage)));
    cp.nativeNetworkEnforcement={version:"A1BrowserNativeNetworkDeny/v1",policy:"DENY_ALL_NATIVE_HTTP",directFallback:false,loopbackBypass:false,deniedConnections:0,forwardedConnections:0};
    cp.httpRouting={version:"A1PublicBrowserFetchOwner/v1",sdkHttpRoutes:false,continueRequests:0,outstandingRequests:0};
    if(kind==="native-policy")cp.nativeNetworkEnforcement.directFallback=true;
    if(kind==="audit"){cp.resources[0].bodySha256="f".repeat(64);cp.sourceBodySha256="f".repeat(64);cp.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(cp.resources)));}
    if(kind==="worker-policy")delete cp.resources[0].workerEnforcement;
    if(kind==="worker-header-rehashed"){
      cp.resources[0].workerEnforcement.appliedHeaders["content-security-policy"]="worker-src *";
      cp.resources[0].workerEnforcement.appliedHeadersSha256=sha256(Buffer.from(JSON.stringify(cp.resources[0].workerEnforcement.appliedHeaders)));
    }
    if(kind.startsWith("worker-"))cp.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(cp.resources)));
    const ledger={contract:A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1,nodeId:cachedNode.id,inputSha256:cachedNode.inputSha256,capturePlanSha256,timeline:{},events:[],beatBindings:[],publicResourceProof:structuredClone(cp)};
    if(kind==="ledger")ledger.publicResourceProof.sourceBodySha256="a".repeat(64);
    const eventBytes=Buffer.from(JSON.stringify(ledger));
    const receipt={contract:A1_NODE_SCREEN_RECORDING_RECEIPT_V1,nodeId:cachedNode.id,inputSha256:cachedNode.inputSha256,capturePlanSha256,
      source:{url,urlSha256:sha256(Buffer.from(url)),bodySha256:kind==="source"?"a".repeat(64):cp.sourceBodySha256},viewport:p.viewport,beatPlan:p.beats,beats:[],timeline:{},
      captureBackend:"playwright.chromium.screencast+ffmpeg/libx264",captureOrigin:"browser_automation",physicalUserInputVerified:false,
      network:{publicResourceProof:cp},eventLedger:{sha256:sha256(eventBytes),bytes:eventBytes.length,eventCount:0}};
    const slug=cachedNode.id.replace(/[^A-Za-z0-9._-]+/gu,"_");
    const parent=path.join(cacheRoot,`${slug}-${sha256(Buffer.from(cachedNode.id)).slice(0,12)}`);
    const directory=path.join(parent,cachedNode.inputSha256+"-"+loading.profileSha256);fs.mkdirSync(directory,{recursive:true});
    assert.equal(fs.existsSync(path.join(parent,cachedNode.inputSha256)),false,"profile path cannot reuse a strict cache path");
    fs.writeFileSync(path.join(directory,"recording.mp4"),"MOCK_NEGATIVE_NOT_A_VIDEO");fs.writeFileSync(path.join(directory,"capture-receipt.json"),JSON.stringify(receipt));fs.writeFileSync(path.join(directory,"event-ledger.json"),eventBytes);
    const option=kind==="missing-anchor"?{profile,runtimeCoverage:coverage}:coveredOption;
    const result=await executeScreenRecordingNode(cachedNode,{artifactRoot:cacheRoot,publicResourceLoading:option,browserType:{launch:async()=>{launches++;}}});
    assert.equal(result.reason,kind==="missing-anchor"?"PUBLIC_RESOURCE_CACHE_CONTROLLER_BINDING_REQUIRED":kind==="native-policy"?"PUBLIC_RESOURCE_NATIVE_NETWORK_PROOF_REQUIRED":kind==="audit"||kind.startsWith("worker-")?"PUBLIC_RESOURCE_CACHE_PROOF_INVALID":"PUBLIC_RESOURCE_CACHE_LEDGER_MISMATCH");cacheCases++;
  }
  assert.equal(launches,0);
  let active=0,maxActive=0;
  const concurrent=make(loading,async(raw,pin)=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return {...await transport(raw,pin,{headers:{}})};});
  await Promise.all(Array.from({length:7},(_,i)=>concurrent.fetch(`https://public.example/${i}`)));assert.equal(maxActive,2);
  const visualReleases=[],visualStarts=[];
  const visualPriorityBroker=make(loading,async(raw,pin)=>{visualStarts.push(raw);await new Promise(resolve=>visualReleases.push(resolve));return transport(raw,pin,{headers:{}});});
  const priorityJobs=[visualPriorityBroker.fetch("https://public.example/slow-a"),visualPriorityBroker.fetch("https://public.example/slow-b"),
    visualPriorityBroker.fetch("https://public.example/background-script",{resourceType:"script"}),visualPriorityBroker.fetch("https://public.example/needed-font",{resourceType:"font"})];
  await new Promise(resolve=>setTimeout(resolve,1));visualReleases.shift()();await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(visualStarts[2],"https://public.example/needed-font");
  while(visualReleases.length){visualReleases.shift()();await new Promise(resolve=>setTimeout(resolve,1));}await Promise.all(priorityJobs);
  for(const kind of ["clean-close","partial-close","security-at-close"]){
    let pendingCalls=0;
    const b=make(loading,async(raw,pin,options)=>{
      if(raw===url)return transport(raw,pin,options);
      pendingCalls++;
      const bytes=kind==="partial-close"?3:0;if(bytes)options.onBytesReceived(bytes);
      await new Promise((_,reject)=>options.signal.addEventListener("abort",()=>reject(Object.assign(
        new Error(kind==="security-at-close"?"PUBLIC_RESOURCE_SOCKET_OR_TLS_MISMATCH":"PUBLIC_RESOURCE_ABORTED"),
        {responseStarted:bytes>0,receivedBytes:bytes,securityFailure:kind==="security-at-close"})),{once:true}));
    });
    await b.fetch(url,{mainDocument:true});
    const jobs=["a","b","queued-font"].map((name,index)=>b.fetch(`https://public.example/${name}`,
      {resourceType:index===2?"font":"script",nativeRequestId:name,frameId:"main-frame"}));
    const settled=Promise.allSettled(jobs);await new Promise(resolve=>setTimeout(resolve,1));
    await b.closeCapture(["a","b","queued-font"]);await settled;assert.equal(pendingCalls,2,"queued read must not be sent after close");
    if(kind==="security-at-close")assert.throws(()=>b.check(),/SOCKET_OR_TLS_MISMATCH/);
    else{
      assert.equal(validatePublicRecordingResourceProofV1(b.proof(),loading),true);
      assert.ok(b.audit.slice(1).every(r=>r.outcome==="CANCELED_CAPTURE_CLOSED"));
      const forged=structuredClone(b.proof());forged.resources[1].captureCloseProof.contextClosed=false;
      forged.resourceAuditSha256=sha256(Buffer.from(JSON.stringify(forged.resources)));assert.throws(()=>validatePublicRecordingResourceProofV1(forged,loading));
    }
  }
  const requestLimited=make({...loading,profile:{...loading.profile,maxRequests:1}});await requestLimited.fetch(url);await assert.rejects(requestLimited.fetch(url),/REQUEST_LIMIT/);
  const byteLimited=make({...loading,profile:{...loading.profile,maxTotalBytes:1}});await assert.rejects(byteLimited.fetch(url),/TOTAL_BYTE_LIMIT/);
  const cancelBroker=make(loading,async(raw,pin,{signal})=>{
    if(raw.endsWith('/bad'))return {status:403,headers:{},body:Buffer.alloc(0),remoteAddress:pin.address,tlsAuthorized:true,servername:new URL(raw).hostname};
    await new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error("PUBLIC_RESOURCE_ABORTED"));else signal.addEventListener("abort",()=>reject(new Error("PUBLIC_RESOURCE_ABORTED")),{once:true});});
  });
  const canceled=await Promise.allSettled([cancelBroker.fetch("https://public.example/wait"),cancelBroker.fetch("https://public.example/bad")]);
  assert.ok(canceled.every(v=>v.status==="rejected"));assert.ok(cancelBroker.audit.every(v=>v.outcome!=="FULFILLED"));
  // Exercise native HTTPS construction with an EventEmitter transport; no sockets are opened.
  for (const remoteAddress of ["8.8.8.8","1.1.1.1"]) {
    let requestOptions;
    const requestFactory=(options,onResponse)=>{
      requestOptions=options;const request=new EventEmitter();let destroyed=false;
      request.destroy=error=>{destroyed=true;queueMicrotask(()=>request.emit("error",error));};
      request.end=()=>queueMicrotask(()=>{
        const socket=new EventEmitter();socket.remoteAddress=remoteAddress;socket.authorized=true;request.emit("socket",socket);socket.emit("secureConnect");if(destroyed)return;
        const response=new EventEmitter();response.statusCode=200;response.headers={"content-type":"image/png"};response.destroy=error=>{if(error)response.emit("error",error);};onResponse(response);response.emit("data",Buffer.from("png"));response.emit("end");
      });return request;
    };
    const task=requestPinnedRecordingResourceV1("https://public.example/image",{address:"8.8.8.8",family:4},{method:"GET",headers:{},timeoutMs:100,maxBytes:8,requestFactory});
    if(remoteAddress==="8.8.8.8")assert.equal((await task).body.toString(),"png");else await assert.rejects(task,/SOCKET_OR_TLS_MISMATCH/);
    assert.equal(requestOptions.servername,"public.example");assert.equal(requestOptions.rejectUnauthorized,true);assert.equal(requestOptions.agent,false);
    requestOptions.lookup("public.example",{},(_error,address)=>assert.equal(address,"8.8.8.8"));
  }
  fs.writeFileSync(path.join(tempRoot,"public-resource-pure-proof.json"),JSON.stringify({profileSha256:loading.profileSha256,proof,realNetworkCalls:0,realBrowserCalls:0,redirectCases:3,nextHopConnections:0,maxConcurrentObserved:maxActive,runtimeCoverage:"UNPROVEN_C2_REQUIRED"},null,2)+"\n");
  return {status:"PASS_PURE_ONLY",realNetworkCalls:0,realBrowserCalls:0,redirectCases:3,nextHopConnections:0,maxConcurrentObserved:maxActive,negativeCacheCases:cacheCases,mockRouteFulfills:fulfills,mockRouteAborts:aborts,networkContinues:continues,runtimeCoverage:"UNPROVEN_C2_REQUIRED"};
}

async function testOptionalResourceFailures(validNode) {
  const node = structuredClone(validNode);
  node.input.parameters.initialState = {selector: "#title", visible: true, textExact: "Fixture title"};
  node.input.parameters.beats[0].expectedVisibleState = {selector: "#paragraph", visible: true, textExact: "Fixture paragraph"};
  const body = Buffer.from("fixture-document");
  const option = {verifierId: "fixture-pixel-review-v1", verifyPixels: async () => { throw Error("must-not-review-uncreated-pixels"); }, profile: {
    sourceUrl: node.input.parameters.source.url, sourceBodySha256: sha256(body),
    targets: [{role: "title", selector: "#title", textExact: "Fixture title"}, {role: "paragraph", selector: "#paragraph", textExact: "Fixture paragraph"}],
    requiredStylesheets: [new URL("/style.css", node.input.parameters.source.url).href],
    resources: [{url: "https://ads.example.com/optional.js", method: "HEAD", resourceType: "xhr", purpose: "advertising",
      evidenceSha256: "a".repeat(64), justification: "Fixture advertising probe does not render the article."}],
  }};
  const review = prepareOptionalRecordingReviewV1(node, option);
  const identity = {url: option.profile.resources[0].url, method: "HEAD", resourceType: "xhr", navigation: false, mainFrame: true, redirected: false};
  const reason = "CROSS_ORIGIN_OR_UNSAFE_REQUEST_BLOCKED";
  assert.ok(classifyBlockedRecordingRequestV1(identity, option.profile.sourceUrl, review, reason));
  for (const changed of [{navigation: true}, {mainFrame: false}, {redirected: true}, {redirected: null}, {method: "POST"},
    {resourceType: "stylesheet"}, {url: "https://other.example.com/optional.js"}, {url: "http://127.0.0.1/secret"}, {url: "file:///private/file"}]) {
    assert.equal(classifyBlockedRecordingRequestV1({...identity, ...changed}, option.profile.sourceUrl, review, reason), null);
  }
  assert.equal(classifyBlockedRecordingRequestV1(identity, option.profile.sourceUrl, review, "SOURCE_REQUEST_NETWORK_TARGET_BLOCKED"), null);
  assert.equal(classifyBlockedRecordingRequestV1(identity, option.profile.sourceUrl, null, reason), null);
  assert.throws(() => prepareOptionalRecordingReviewV1(node, {...option, verifyPixels: null}), /OPTIONAL_RESOURCE_REVIEW_CONFIG_INVALID/u);
  const security = structuredClone(option.profile); security.resources[0].url = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  assert.throws(() => prepareOptionalRecordingReviewV1(node, {...option, profile: security}), /OPTIONAL_RESOURCE_REVIEW_CONFIG_INVALID/u);
  const expected = {videoSha256: "b".repeat(64), profileSha256: review.profileSha256, layoutEvidenceSha256: "e".repeat(64),
    verifierId: option.verifierId, frameSha256: ["c".repeat(64), "d".repeat(64)]};
  const pixels = {...expected, reviewedVideoSha256: expected.videoSha256, titleReadable: true, paragraphReadable: true, layoutIntact: true,
    findings: "Mock validator shape only; no real visual review was performed."};
  assert.equal(validateOptionalRecordingPixelReviewV1(pixels, expected).layoutIntact, true);
  for (const changed of [{reviewedVideoSha256: "0".repeat(64)}, {profileSha256: "0".repeat(64)}, {layoutEvidenceSha256: "0".repeat(64)}, {layoutIntact: false},
    {titleReadable: false}, {paragraphReadable: false}, {frameSha256: ["c".repeat(64)]}, {verifierId: "other"}, {findings: ""}]) {
    assert.throws(() => validateOptionalRecordingPixelReviewV1({...pixels, ...changed}, expected), /OPTIONAL_RESOURCE_PIXEL_REVIEW_FAILED/u);
  }
  let closes = 0, aborts = 0, continues = 0, attempts = 0;
  async function attempt({requests = [identity], configured = true, responseBody = body, badLayout = false, requiredFailure = false} = {}) {
    let routeHandler;
    const mainFrame = {};
    const listeners = {};
    const page = {mainFrame: () => mainFrame, on: (event, callback) => { listeners[event] = callback; }, setDefaultTimeout: () => {}, addInitScript: async () => {},
      url: () => node.input.parameters.source.url, title: async () => "Fixture title", waitForTimeout: async () => {},
      evaluate: async () => ({now: 1000, origin: 1}),
      locator: selector => ({first() { return this; }, count: async () => 1, isVisible: async () => true,
        innerText: async () => selector === "#title" ? "Fixture title" : "Fixture paragraph",
        evaluate: async () => ({text: "Fixture title", visible: false, fontSizePx: 12, opacity: "1", fontsLoaded: true,
          stylesLoaded: true, visibleImagesLoaded: true, rect: {x: 0, y: 0, width: 100, height: 20}})}),
      goto: async () => {
        for (const metadata of requests) {
          const request = {url: () => metadata.url, method: () => metadata.method, resourceType: () => metadata.resourceType,
            isNavigationRequest: () => metadata.navigation, frame: () => metadata.mainFrame ? mainFrame : {},
            redirectedFrom: () => metadata.redirected ? {} : null};
          await routeHandler({request: () => request, abort: async () => { aborts++; }, continue: async () => { continues++; }});
        }
        if (requiredFailure) listeners.response({status: () => 404, request: () => ({url: () => option.profile.requiredStylesheets[0]})});
        return {status: () => 200, body: async () => responseBody};
      },
      ...(badLayout ? {screencast: {start: async ({onFrame}) => onFrame({}), stop: async () => {}}} : {}),
    };
    const browserType = {launch: async () => ({close: async () => { closes++; }, newContext: async () => ({
      routeWebSocket: async () => {}, route: async (_, handler) => { routeHandler = handler; }, newPage: async () => page,
    })})};
    const attemptNode = {...node, id: `optional-mock-${attempts++}:recording`, inputSha256: sha256(Buffer.from(String(attempts)))};
    const result = await executeScreenRecordingNode(attemptNode, {artifactRoot: path.join(tempRoot, "optional-mock-artifacts"), browserType,
      ...(configured ? {optionalResourceReview: option} : {})});
    assert.equal(result.state, "blocked"); assert.equal(result.productionAdmission, false);
    assert.equal(result.artifactManifest, undefined, "failed/missing quality proof must publish no review capture");
    return result;
  }
  assert.equal((await attempt()).reason, "PLAYWRIGHT_SCREENCAST_UNAVAILABLE", "known optional denial reaches content checks, not qualified success");
  assert.equal((await attempt({configured: false})).reason, reason, "default still fatal");
  assert.equal((await attempt({requests: [{...identity, navigation: true}]})).reason, reason);
  assert.equal((await attempt({requests: [{...identity, redirected: true}]})).reason, reason);
  assert.equal((await attempt({requests: [{...identity, method: "POST"}]})).reason, "MUTATING_REQUEST_ATTEMPT_BLOCKED");
  assert.equal((await attempt({requests: [{...identity, url: "https://unknown.example.com/required.css"}, identity]})).reason, reason, "later optional denial cannot clear fatal");
  assert.equal((await attempt({responseBody: Buffer.from("different document")})).reason, "OPTIONAL_RESOURCE_SOURCE_BODY_CHANGED");
  assert.equal((await attempt({badLayout: true})).reason, "OPTIONAL_RESOURCE_REQUIRED_LAYOUT_FAILED");
  assert.equal((await attempt({requiredFailure: true})).reason, "REQUIRED_SAME_ORIGIN_RESOURCE_FAILED");
  const overflow = await attempt({requests: Array.from({length: 257}, () => identity)});
  assert.equal(overflow.reason, "BLOCKED_REQUEST_AUDIT_LIMIT_EXCEEDED"); assert.equal(overflow.blockers[0].requests.length, 257);
  assert.equal(continues, 0, "all denied requests must still abort"); assert.equal(closes, attempts);
  const cacheRoot = path.join(tempRoot, "optional-cache-negative-fixtures");
  let cacheRejects = 0;
  for (const tamper of ["profile", "classification", "layout", "verification"]) {
    const cachedNode = {...node, id: `optional-cache-${tamper}:recording`, inputSha256: sha256(Buffer.from(tamper))};
    const p = cachedNode.input.parameters;
    const capturePlanSha256 = sha256(Buffer.from(JSON.stringify({nodeId: cachedNode.id, inputSha256: cachedNode.inputSha256,
      source: {url: p.source.url}, viewport: p.viewport, initialState: p.initialState, beats: p.beats, policy: p.policy,
      optionalResourceReview: {profileSha256: review.profileSha256, verifierId: option.verifierId}})));
    const denial = {...identity, reason, classification: "OPTIONAL_CANDIDATE_PENDING_QUALITY", purpose: "advertising", evidenceSha256: "a".repeat(64)};
    const layout = [{role: "title", mocked: true}];
    const verification = {...pixels, layoutEvidenceSha256: sha256(Buffer.from(JSON.stringify(layout)))};
    const optional = {profileSha256: review.profileSha256, verifierId: option.verifierId, status: "REVIEW_WITH_BLOCKED_OPTIONAL_RESOURCES",
      sourceBodySha256: option.profile.sourceBodySha256,
      layout, verification, verificationSha256: sha256(Buffer.from(JSON.stringify(verification)))};
    const ledger = {contract: A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1, nodeId: cachedNode.id, inputSha256: cachedNode.inputSha256,
      capturePlanSha256, timeline: {}, events: [], beatBindings: [], blockedRequests: [denial]};
    const receipt = {contract: A1_NODE_SCREEN_RECORDING_RECEIPT_V1, nodeId: cachedNode.id, inputSha256: cachedNode.inputSha256, capturePlanSha256,
      source: {url: p.source.url, urlSha256: sha256(Buffer.from(p.source.url))}, viewport: p.viewport, beatPlan: p.beats, beats: [], timeline: {},
      captureBackend: "playwright.chromium.screencast+ffmpeg/libx264", captureOrigin: "browser_automation", physicalUserInputVerified: false,
      network: {blockedRequests: [denial]}, optionalResourceReview: optional};
    if (tamper === "profile") optional.profileSha256 = "0".repeat(64);
    if (tamper === "classification") denial.classification = "FATAL";
    if (tamper === "layout") optional.layout = [{role: "paragraph", changed: true}];
    if (tamper === "verification") optional.verificationSha256 = "0".repeat(64);
    const eventBytes = Buffer.from(JSON.stringify(ledger));
    receipt.eventLedger = {sha256: sha256(eventBytes), bytes: eventBytes.length, eventCount: 0};
    const slug = cachedNode.id.replace(/[^A-Za-z0-9._-]+/gu, "_");
    const directory = path.join(cacheRoot, `${slug}-${sha256(Buffer.from(cachedNode.id)).slice(0, 12)}`, cachedNode.inputSha256);
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, "recording.mp4"), "MOCK_NEGATIVE_CACHE_NOT_REAL_VIDEO");
    fs.writeFileSync(path.join(directory, "capture-receipt.json"), JSON.stringify(receipt));
    fs.writeFileSync(path.join(directory, "event-ledger.json"), eventBytes);
    const result = await executeScreenRecordingNode(cachedNode, {artifactRoot: cacheRoot, optionalResourceReview: option,
      browserType: {launch: async () => { throw Error("cache failure must precede browser launch"); }}});
    assert.equal(result.reason, "ARTIFACT_CACHE_OPTIONAL_REVIEW_BINDING_MISMATCH", tamper); cacheRejects++;
  }
  return {mockAttempts: attempts, mockAborts: aborts, networkContinues: continues, cacheNegativeFixturesRejected: cacheRejects,
    actualPixels: "NOT_RUN_MOCKS_ONLY"};
}

try {
  if (!unitOnly && !publicOnly) await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = unitOnly || publicOnly ? 12345 : server.address().port;
  const url = `http://127.0.0.1:${port}/capture`;
  const artifactRoot = path.join(tempRoot, "artifacts");
  const validNode = recordingNode({id: "fixture-recording:recording", inputSha256: "1".repeat(64), url, allowLoopbackOrigin: true});

  assert.equal(screenRecordingNodeAdapterV1.version, 1);
  assert.equal(screenRecordingNodeAdapterV1.execute, executeScreenRecordingNode);
  const registered = createNodeAdapterRegistry({recording: screenRecordingNodeAdapterV1});
  assert.equal(registered.definitions.recording.available, true);
  assert.equal(registered.definitions.recording.version, 1);

  const unapprovedLoopback=await executeScreenRecordingNode(recordingNode({id:"unapproved-loopback:recording",inputSha256:"7".repeat(64),url}),{artifactRoot,ffprobePath});
  assert.deepEqual({state:unapprovedLoopback.state,reason:unapprovedLoopback.reason},{state:"blocked",reason:"SOURCE_LOOPBACK_ORIGIN_APPROVAL_REQUIRED"});
  const privateSubnet=await executeScreenRecordingNode(recordingNode({id:"private-subnet:recording",inputSha256:"8".repeat(64),url:"http://192.168.1.1/"}),{artifactRoot,ffprobePath});
  assert.deepEqual({state:privateSubnet.state,reason:privateSubnet.reason},{state:"blocked",reason:"SOURCE_URL_UNSAFE"});

  if (unitOnly) {
    // A cold Chromium launch has its own bounded budget. A failed launch must
    // end this attempt without starting a second browser.
    let startupLaunches = 0;
    const startupNode = structuredClone(validNode);
    startupNode.id = "fixture-startup-budget:recording";
    startupNode.inputSha256 = "d".repeat(64);
    startupNode.input.parameters.policy.maxDurationMs = 60_000;
    const startupFailure = await executeScreenRecordingNode(startupNode, {artifactRoot,
      browserType: {launch: async options => {
        startupLaunches++;
        assert.equal(options.timeout, 30_000);
        throw new Error("fixture-browser-launch-failed");
      }}});
    assert.equal(startupFailure.reason, "fixture-browser-launch-failed");
    assert.equal(startupLaunches, 1);
    let launches = 0, closes = 0;
    const browserType = {launch: async () => { launches++; return {
      newContext: async () => { throw new Error("fixture-context-failure"); }, close: async () => { closes++; },
    }; }};
    const odd = structuredClone(validNode);
    odd.input.parameters.viewport.width = 641;
    assert.equal((await executeScreenRecordingNode(odd, {artifactRoot, browserType})).reason, "SCREEN_RECORDING_VIEWPORT_INVALID");
    const abort = new AbortController(); abort.abort();
    assert.equal((await executeScreenRecordingNode(validNode, {artifactRoot, browserType, signal: abort.signal})).reason, "SCREEN_RECORDING_ABORTED");
    assert.equal(launches, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      const failure = await executeScreenRecordingNode(validNode, {artifactRoot, browserType});
      assert.equal(failure.state, "blocked"); assert.equal(failure.reason, "fixture-context-failure");
    }
    assert.equal(launches, 2); assert.equal(closes, 2);
    const parent = fs.readdirSync(artifactRoot)[0];
    assert.deepEqual(fs.readdirSync(path.join(artifactRoot, parent)), [], "failed attempts must not publish partial cache or obstruct retry");
    const directory = path.join(artifactRoot, parent, validNode.inputSha256);
    fs.mkdirSync(directory);
    const p = validNode.input.parameters;
    const capturePlanSha256 = sha256(Buffer.from(JSON.stringify({nodeId: validNode.id, inputSha256: validNode.inputSha256,
      source: {url}, viewport: p.viewport, initialState: p.initialState, beats: p.beats, policy: p.policy})));
    const ledger = {contract: A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1, nodeId: validNode.id,
      inputSha256: validNode.inputSha256, capturePlanSha256, events: []};
    const receipt = {contract: A1_NODE_SCREEN_RECORDING_RECEIPT_V1, nodeId: validNode.id, inputSha256: validNode.inputSha256,
      capturePlanSha256, source: {url, urlSha256: sha256(Buffer.from(url))}, viewport: p.viewport,
      captureBackend: "playwright.chromium.screencast+ffmpeg/libx264", captureOrigin: "browser_automation",
      physicalUserInputVerified: false, beatPlan: p.beats, eventLedger: {sha256: "0".repeat(64), bytes: 1}};
    fs.writeFileSync(path.join(directory, "recording.mp4"), "not-a-video");
    fs.writeFileSync(path.join(directory, "capture-receipt.json"), JSON.stringify(receipt));
    fs.writeFileSync(path.join(directory, "event-ledger.json"), JSON.stringify(ledger));
    assert.equal((await executeScreenRecordingNode(validNode, {artifactRoot, browserType})).reason, "ARTIFACT_CACHE_LEDGER_SHA_MISMATCH");
    assert.equal(launches, 2, "corrupt cache must fail before launching another browser or probing fake media");
    const optionalResourceTests = await testOptionalResourceFailures(validNode);
    const dragPureTests = await testDragPure(validNode);
    const publicResourceTests = await testPublicResourcesPure(validNode, artifactRoot);
    console.log(JSON.stringify({status: "PASS_UNIT_ONLY", browserLaunches: 0, mockLaunches: launches,
      checks: ["odd-viewport-rejected", "pre-abort-no-launch", "failure-closes-browser", "same-input-retry-no-partial-cache", "ledger-sha-tamper-rejected"],
      outputRoot: tempRoot, visualReview: "NOT_RUN", productionAdmission: false}, null, 2));
    console.log(JSON.stringify({optionalResourceTests}, null, 2));
    console.log(JSON.stringify({dragPureTests}, null, 2));
    console.log(JSON.stringify({publicResourceTests}, null, 2));
  } else if (dragOnly) {
    await testDragReal(`http://127.0.0.1:${port}`, artifactRoot);
  } else if (publicOnly) {
    const publicNode = recordingNode({id: "public-example:recording", inputSha256: "b".repeat(64), url: "https://example.com/",
      initialState: {selector: "h1", visible: true, textExact: "Example Domain"},
      beats: [{beatId: "read-public-heading", action: {type: "wait", durationMs: 1000},
        expectedVisibleState: {selector: "h1", visible: true, textExact: "Example Domain"}, settleMs: 0}]});
    const publicResult = await executeScreenRecordingNode(publicNode, {artifactRoot, ffprobePath});
    fs.writeFileSync(path.join(tempRoot, "public-result.json"), JSON.stringify(publicResult, null, 2) + "\n");
    assertTimelineAndExtract(publicResult, publicNode, artifactRoot, "public");
    console.log(JSON.stringify({status: "PASS_PUBLIC_REVIEW_ONLY", outputRoot: tempRoot, visualReview: "NOT_GRANTED_BY_DECODE"}, null, 2));
  } else {
  const first = await executeScreenRecordingNode(validNode, {artifactRoot, ffprobePath});
  assert.equal(first.state, "needs-review", JSON.stringify(first));
  assert.equal(first.productionAdmission, false);
  assert.equal(first.artifactKind, "CAPTURE_REVIEW_ONLY");
  assert.equal(first.artifactManifest.contract, "A1NodeArtifactManifest/v1");
  assert.equal(first.artifactManifest.nodeId, validNode.id);
  assert.equal(first.artifactManifest.inputSha256, validNode.inputSha256);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.equal(first.artifactManifest.artifacts.length, 3);
  const videoArtifact = first.artifactManifest.artifacts.find((artifact) => artifact.kind === "VIDEO");
  const receiptArtifact = first.artifactManifest.artifacts.find((artifact) => artifact.jsonContract === A1_NODE_SCREEN_RECORDING_RECEIPT_V1);
  const eventArtifact = first.artifactManifest.artifacts.find((artifact) => artifact.jsonContract === A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1);
  assert.ok(videoArtifact && receiptArtifact && eventArtifact);
  assert.ok(!path.isAbsolute(videoArtifact.path));
  assert.ok(!videoArtifact.path.split("/").includes(".."));
  assert.ok(videoArtifact.path.includes(validNode.inputSha256), "video path must be scoped to the immutable input SHA");

  const videoPath = path.join(artifactRoot, videoArtifact.path);
  const receiptPath = path.join(artifactRoot, receiptArtifact.path);
  const eventPath = path.join(artifactRoot, eventArtifact.path);
  assert.ok(fs.existsSync(videoPath) && fs.existsSync(receiptPath) && fs.existsSync(eventPath));
  const videoBytes = fs.readFileSync(videoPath);
  assert.equal(sha256(videoBytes), videoArtifact.sha256);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const eventLedger = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  assert.equal(receipt.contract, A1_NODE_SCREEN_RECORDING_RECEIPT_V1);
  assert.equal(receipt.nodeId, validNode.id);
  assert.equal(receipt.inputSha256, validNode.inputSha256);
  assert.equal(receipt.source.url, url);
  assert.equal(receipt.viewport.width, 640);
  assert.equal(receipt.viewport.height, 360);
  assert.equal(receipt.captureBackend, "playwright.chromium.screencast+ffmpeg/libx264");
  assert.equal(receipt.captureOrigin, "browser_automation");
  assert.equal(receipt.physicalUserInputVerified, false);
  assert.equal(receipt.proofBoundary.reviewOnly, true);
  assert.equal(receipt.proofBoundary.userVisualApproval, false);
  assert.equal(receipt.proofBoundary.productionAdmission, false);
  assert.equal(receipt.beatPlan[0].beatId, "complete-state");
  assert.deepEqual(receipt.beatPlan[0].action, {type: "click", selector: "#complete"});
  assert.equal(receipt.beatPlan[0].expectedVisibleState.textExact, "Complete");
  assert.equal(receipt.beats[0].stateReceipt.matched, true);
  assert.equal(receipt.video.sha256, videoArtifact.sha256);
  assert.equal(receipt.video.audioStreams, 0);
  assert.equal(receipt.video.fullDecodePass, true);
  assert.equal(receipt.eventLedger.sha256, eventArtifact.sha256);
  assert.equal(eventLedger.contract, A1_NODE_SCREEN_RECORDING_EVENT_LEDGER_V1);
  assert.equal(eventLedger.nodeId, validNode.id);
  assert.equal(eventLedger.inputSha256, validNode.inputSha256);
  assert.equal(eventLedger.physicalUserInputVerified, false);
  assert.equal(eventLedger.beatBindings[0].beatId, "complete-state");
  assert.ok(receipt.network.requestMethods.every((method) => ["GET", "HEAD", "OPTIONS"].includes(method)));
  assert.equal(receipt.network.mutatingRequestsSent, 0);
  assert.deepEqual(serverRequests.map((request) => request.method).filter((method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method)), []);
  assert.equal(first.capture.width, 640);
  assert.equal(first.capture.height, 360);
  assert.equal(first.capture.audioStreams, 0);
  assert.equal(first.capture.fullDecodePass, true);
  assert.ok(first.capture.durationSeconds > 0);
  assertTimelineAndExtract(first, validNode, artifactRoot, "english");

  const frozenNode = recordingNode({id: "frozen-fixture:recording", inputSha256: "9".repeat(64),
    url: `http://127.0.0.1:${port}/frozen`, allowLoopbackOrigin: true,
    initialState: {selector: "#status", visible: true, textExact: "准备"},
    beats: [{beatId: "complete-state", action: {type: "click", selector: "#complete"},
      expectedVisibleState: {selector: "#status", visible: true, textExact: "完成"}, settleMs: 600}]});
  const frozenResult = await executeScreenRecordingNode(frozenNode, {artifactRoot, ffprobePath});
  assertTimelineAndExtract(frozenResult, frozenNode, artifactRoot, "frozen");

  const verified = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node: validNode, ffprobePath});
  assert.equal(verified.artifacts.length, 3);
  assert.equal(verified.artifacts.find((artifact) => artifact.kind === "VIDEO").metadata.width, 640);
  assert.equal(verified.artifacts.find((artifact) => artifact.kind === "VIDEO").metadata.height, 360);

  const requestCountBeforeCache = serverRequests.length;
  const reused = await executeScreenRecordingNode(validNode, {artifactRoot, ffprobePath});
  assert.equal(reused.state, "needs-review");
  assert.equal(reused.capture.reusedBySha, true);
  assert.equal(reused.artifactManifest.artifacts.find((artifact) => artifact.kind === "VIDEO").sha256, videoArtifact.sha256);
  assert.equal(serverRequests.length, requestCountBeforeCache, "same node input must reuse the verified recording artifact");

  const missingPlan = recordingNode({id: "missing-plan:recording", inputSha256: "2".repeat(64), url, allowLoopbackOrigin: true, beats: []});
  const missingPlanResult = await executeScreenRecordingNode(missingPlan, {artifactRoot, ffprobePath});
  assert.deepEqual({state: missingPlanResult.state, reason: missingPlanResult.reason}, {state: "blocked", reason: "SCREEN_RECORDING_BEAT_PLAN_REQUIRED"});

  const missingUrl = recordingNode({id: "missing-url:recording", inputSha256: "6".repeat(64), url: ""});
  const missingUrlResult = await executeScreenRecordingNode(missingUrl, {artifactRoot, ffprobePath});
  assert.deepEqual({state: missingUrlResult.state, reason: missingUrlResult.reason}, {state: "blocked", reason: "SOURCE_URL_REQUIRED"});

  const unsafePolicy = recordingNode({id: "unsafe-policy:recording", inputSha256: "3".repeat(64), url, allowLoopbackOrigin: true,
    policy: {blockMutations: true, allowedMethods: ["GET", "POST"], maxDurationMs: 25_000}});
  const unsafePolicyResult = await executeScreenRecordingNode(unsafePolicy, {artifactRoot, ffprobePath});
  assert.deepEqual({state: unsafePolicyResult.state, reason: unsafePolicyResult.reason}, {state: "blocked", reason: "SCREEN_RECORDING_MUTATION_POLICY_INVALID"});

  const unknownSource = recordingNode({id: "unknown-source:recording", inputSha256: "4".repeat(64), url, allowLoopbackOrigin: true,
    initialState: {selector: "#not-present", visible: true}});
  const unknownSourceResult = await executeScreenRecordingNode(unknownSource, {artifactRoot, ffprobePath});
  assert.deepEqual({state: unknownSourceResult.state, reason: unknownSourceResult.reason}, {state: "blocked", reason: "SOURCE_STATE_UNKNOWN"});

  const mutatingNode = recordingNode({id: "blocked-write:recording", inputSha256: "5".repeat(64), url: `${url}?write=1`, allowLoopbackOrigin: true,
    beats: [{beatId: "attempt-write", action: {type: "click", selector: "#attempt-write"},
      expectedVisibleState: {selector: "#status", visible: true, textExact: "Ready"}, settleMs: 100, stateTimeoutMs: 1000}]});
  const mutatingResult = await executeScreenRecordingNode(mutatingNode, {artifactRoot, ffprobePath});
  assert.equal(mutatingResult.state, "blocked");
  assert.equal(mutatingResult.reason, "MUTATING_REQUEST_ATTEMPT_BLOCKED");
  assert.deepEqual(serverRequests.map((request) => request.method).filter((method) => ["POST", "PUT", "PATCH", "DELETE"].includes(method)), [],
    "the local server must never receive a mutating method");

  const intactReceiptBytes = fs.readFileSync(receiptPath);
  fs.appendFileSync(receiptPath, "tamper");
  const staleCacheResult = await executeScreenRecordingNode(validNode, {artifactRoot, ffprobePath});
  assert.equal(staleCacheResult.state, "blocked");
  assert.equal(staleCacheResult.reason, "ARTIFACT_CACHE_JSON_INVALID");
  fs.writeFileSync(path.join(tempRoot, "tampered-receipt-evidence.txt"), fs.readFileSync(receiptPath));
  fs.writeFileSync(receiptPath, intactReceiptBytes);

  const recoverNode = recordingNode({id: "encoder-recovery:recording", inputSha256: "a".repeat(64), url, allowLoopbackOrigin: true});
  const encoderFailed = await executeScreenRecordingNode(recoverNode, {artifactRoot, ffprobePath,
    ffmpegPath: path.join(tempRoot, "absent-encoder")});
  assert.equal(encoderFailed.reason, "VIDEO_ENCODER_UNAVAILABLE");
  const recovered = await executeScreenRecordingNode(recoverNode, {artifactRoot, ffprobePath});
  assert.equal(recovered.state, "needs-review", JSON.stringify(recovered));

  console.log(JSON.stringify({
    contract: "A1NodeScreenRecordingAdapterTest/v1",
    status: "PASS_REVIEW_ONLY",
    checks: [
      "local-playwright-capture-and-silent-h264-output", "full-decode-and-artifact-manifest-compatibility",
      "node-input-sha-bound-path-and-video-bytes", "source-viewport-beat-action-and-state-binding",
      "explicit-loopback-origin-approval", "private-subnet-target-rejected", "same-origin-only-requests-and-pinned-public-dns",
      "browser-automation-never-claims-physical-input", "mutating-http-methods-blocked-before-server",
      "unsafe-policy-missing-url-or-beat-plan-and-unknown-source-state-blocked", "verified-cache-reused-by-input-sha",
      "stale-cache-rejected", "review-only-no-approval-or-production-admission",
      "frozen-fixture-source-sha", "capture-relative-events-and-recorded-holds", "measured-video-duration-within-one-frame",
      "encoder-failure-same-input-recovery", "decoded-initial-action-and-final-pngs-retained",
    ],
    productionAdmission: false,
    outputRoot: tempRoot,
    visualReview: "NOT_GRANTED_BY_DECODE",
  }, null, 2));
  }
} finally {
  if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
}
