#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {compileScreenPackagingCorePlanV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.mjs";
import {compileScreenPackagingCoreAdapterV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.mjs";
import {validateScreenPackagingCoreAdapterV1, validateScreenPackagingCorePlanV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const publicRoot = path.join(renderer, "public");
const out = path.join(root, "work/screen-packaging-core-canary-v1");
const stageRoot = path.join(publicRoot, "proof-only/screen-packaging-core-v1");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const entry = "src/screen-packaging-core-v1-entry.tsx";
const composition = "ScreenPackagingCoreCanaryV1";
const output = {width: 960, height: 540};
const implementationPaths = [
  "apps/studio-next/src/lib/a1-screen-packaging-assist-policy-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.d.mts",
  "apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.d.mts",
  "apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.d.mts",
  "remotion-renderer/src/ScreenPackagingCoreV1.tsx",
  "remotion-renderer/src/ScreenPackagingCoreCanaryV1.tsx",
  "remotion-renderer/src/screen-packaging-core-v1-entry.tsx",
  "remotion-renderer/public/proof-only/screen-packaging-core-v1/default-core.mp4",
  "remotion-renderer/package.json",
  "remotion-renderer/package-lock.json",
  "scripts/build-screen-packaging-core-canary-v1.mjs",
  "scripts/test-screen-packaging-core-contract-v1.mjs",
  "scripts/test-screen-packaging-core-canary-v1.mjs",
  "scripts/test-screen-packaging-core-renderer-guard-v1.mjs",
];
const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const rel = (file) => path.relative(root, file);
const artifactRel = (file) => rel(path.join(out, path.basename(file)));
const event = (report, name) => {
  const value = report.events.find((item) => item.name === name);
  if (!value) throw new Error(`event-required:${report.shotId}:${name}`);
  return value;
};
const frameAt = (ms) => Math.round(Number(ms) * 60 / 1000);
// Authoritative on-screen result-panel rects, measured from the actual recorded
// frames via native Vision OCR text union + luminance edge profiling (the DOM
// finalRect is measured post-scrollIntoView and does not match the footage).
// Coordinate system: normalized source viewport (x,y,w,h in [0,1] of 2560x1440),
// identical to the primary sourceRect produced by recordDomTarget/boundingBox.
// ED-04: frame 320 (candidates settled) container x1668 y114 w888 h560.
// ED-05: measured separately below (see MEASURED_RESULT_RECT fill-in).
const MEASURED_RESULT_RECT = {
  // ED-04: frame 320 (candidates settled) container x1668 y114 w888 h560.
  "ED-04": {x: 1668 / 2560, y: 114 / 1440, width: 888 / 2560, height: 560 / 1440},
  // ED-05: frame 174 (findings settled) container x1670 y115 w886 h560.
  "ED-05": {x: 1670 / 2560, y: 115 / 1440, width: 886 / 2560, height: 560 / 1440},
};
const normalizedResultRect = (report) => {
  const rect = report.persistentResultDom?.finalRect;
  if (!rect || report.persistentResultDom?.status !== "PASS" || report.persistentResultDom?.rectDrift?.maxAbsPx > 1)
    throw new Error(`${report.shotId}:stable-result-required`);
  // finalRect comes from getBoundingClientRect() AFTER a scrollIntoView() inside
  // capture-persistent-result-dom — so it is a viewport rect measured at a scroll
  // position that does NOT match the recorded video frame. The focus hole and
  // diff region derived from it landed off-target (measured: hole ~54px above the
  // real panel in output space). The authoritative on-screen panel rect is read
  // from the actual recorded frame via native Vision OCR + edge profiling; the
  // stable window starts at frame 320 (candidates settled; frame 313 is the
  // "still preparing" transition state). Values are normalized source-viewport
  // coords, same coordinate system as primary sourceRect.
  const measured = MEASURED_RESULT_RECT[report.shotId];
  if (measured) return measured;
  return {x: rect.x / report.output.width, y: rect.y / report.output.height, width: rect.width / report.output.width, height: rect.height / report.output.height};
};
const runRemotion = (args) => execFileSync(path.join(renderer, "node_modules/.bin/remotion"), args, {cwd: renderer, stdio: "inherit"});
const pixelData = async (file) => sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
const deltaStats = (left, right, envelopes = null) => {
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) throw new Error("pixel-delta-dimensions-mismatch");
  let changed = 0, inside = 0, outside = 0;
  for (let offset = 0, pixel = 0; offset < left.data.length; offset += 3, pixel += 1) {
    const different = left.data[offset] !== right.data[offset] || left.data[offset + 1] !== right.data[offset + 1] || left.data[offset + 2] !== right.data[offset + 2];
    if (!different) continue;
    changed += 1;
    if (envelopes) {
      const x = pixel % left.info.width, y = Math.floor(pixel / left.info.width);
      if (envelopes.some((box) => x >= box.left && x < box.right && y >= box.top && y < box.bottom)) inside += 1;
      else outside += 1;
    }
  }
  return {changed, inside, outside};
};
// Alignment gate: the spotlight hole must actually sit on the bright result
// panel, not on dimmed empty canvas. Compares mean luminance inside the claimed
// hole (sampled on a grid) against the dimmed surround (four corner bands). A
// hole over blank space has no meaningful inside-vs-corner margin.
const meanLuminanceIn = (raw, box) => {
  const {width: W, height: H} = raw.info;
  const {data} = raw;
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(W, Math.ceil(box.x + box.width)), y1 = Math.min(H, Math.ceil(box.y + box.height));
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y += 4)
    for (let x = x0; x < x1; x += 4) {
      const i = (y * W + x) * 3;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count += 1;
    }
  return count ? sum / count : 0;
};
const meanLuminanceCornerBands = (raw, band = 40) => {
  const {width: W, height: H} = raw.info;
  const {data} = raw;
  const bands = [
    {x: 0, y: 0, width: band, height: band},
    {x: W - band, y: 0, width: band, height: band},
    {x: 0, y: H - band, width: band, height: band},
    {x: W - band, y: H - band, width: band, height: band},
  ];
  let sum = 0, count = 0;
  for (const b of bands) {
    for (let y = b.y; y < b.y + b.height; y += 4)
      for (let x = b.x; x < b.x + b.width; x += 4) {
        const i = (y * W + x) * 3;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        count += 1;
      }
  }
  return count ? sum / count : 0;
};
const uncoveredEdgePixels = (raw) => {
  const {width, height} = raw.info;
  const background = [12, 16, 17];
  const matches = (x, y) => {
    const offset = (y * width + x) * 3;
    return raw.data[offset] === background[0] && raw.data[offset + 1] === background[1] && raw.data[offset + 2] === background[2];
  };
  let count = 0;
  for (let x = 0; x < width; x += 1) {
    if (matches(x, 0)) count += 1;
    if (matches(x, height - 1)) count += 1;
  }
  for (let y = 1; y < height - 1; y += 1) {
    if (matches(0, y)) count += 1;
    if (matches(width - 1, y)) count += 1;
  }
  return count;
};

fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(stageRoot, {recursive: true});
const lockPath = path.join(out, ".build.lock");
let lockFd;
try { lockFd = fs.openSync(lockPath, "wx"); } catch { throw new Error("screen-packaging-core-build-already-running"); }
const runOut = fs.mkdtempSync(path.join(out, ".run-"));
const stageDir = fs.mkdtempSync(path.join(stageRoot, "run-"));
const workspaceShaBefore = sha(workspacePath);
const currentPhaseShaBefore = sha(currentPhasePath);

try {
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const shots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
  const resolve = (shotId) => {
    const shot = shots.find((item) => item.shotId === shotId);
    if (!shot?.prototypeEligible) throw new Error(`${shotId}:prototype-eligibility-required`);
    const captured = shot.motionReviewPlan?.capturedSource;
    const sourcePath = path.join(root, captured.path);
    if (!captured?.sha256 || !fs.existsSync(sourcePath) || sha(sourcePath) !== captured.sha256 || captured.versionId !== shot.versionId)
      throw new Error(`${shotId}:current-source-binding-invalid`);
    const reportPath = path.join(root, captured.reportPath || path.join(path.dirname(captured.path), "report.json"));
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.storyboardBinding?.revisionSha256 !== shot.revisionSha256 || report.output?.sha256 !== captured.sha256 || report.output?.fullDecodePass !== true)
      throw new Error(`${shotId}:report-source-binding-invalid`);
    return {shot, captured, sourcePath, reportPath, report};
  };
  const ed04 = resolve("ED-04");
  const ed05 = resolve("ED-05");
  const sourceOf = (resolved) => ({
    videoSha256: resolved.captured.sha256,
    revisionSha256: resolved.shot.revisionSha256,
    width: resolved.report.output.width,
    height: resolved.report.output.height,
    fps: 60,
    frameCount: resolved.report.output.frameCount,
  });
  const source04 = sourceOf(ed04), source05 = sourceOf(ed05);
  const request = ed04.report.domTargets.find((item) => item.event === "paragraph_request_run");
  if (!request?.sourceRect) throw new Error("ED-04:request-target-required");
  const resultRect04 = normalizedResultRect(ed04.report);
  const resultRect05 = normalizedResultRect(ed05.report);
  const requestEvent = event(ed04.report, "paragraph_request_run");
  const resultEvent04 = event(ed04.report, "paragraph_candidates_hold");
  const runningEvent05 = event(ed05.report, "review_running");
  const findingsEvent05 = event(ed05.report, "review_findings_hold");
  const target = ({source, revisionSha256, frameIndex, viewport, scroll, rect}) => ({
    videoSha256: source.videoSha256,
    revisionSha256,
    frameIndex,
    viewport: {width: viewport.width, height: viewport.height, scrollX: scroll.x, scrollY: scroll.y},
    coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
    rect,
  });
  const definitions = [
    {
      id: "ed04-focus-handoff",
      shotId: "ED-04",
      effectId: "FOCUS_HANDOFF",
      resolved: ed04,
      source: source04,
      durationFrames: 185,
      evidence: {
        kind: "FOCUS_HANDOFF_EVIDENCE",
        sourceStartFrame: 210,
        sourceEndFrame: 394,
        primaryTarget: target({source: source04, revisionSha256: ed04.shot.revisionSha256, frameIndex: frameAt(requestEvent.outputTimeMs), viewport: request.viewport, scroll: request.scroll, rect: request.sourceRect}),
        secondaryTarget: target({source: source04, revisionSha256: ed04.shot.revisionSha256, frameIndex: frameAt(resultEvent04.outputTimeMs), viewport: {width: source04.width, height: source04.height}, scroll: request.scroll, rect: resultRect04}),
      },
    },
    {
      id: "ed05-wipe-diff",
      shotId: "ED-05",
      effectId: "WIPE_COMPARE_DIFFERENCE_FLASH",
      resolved: ed05,
      source: source05,
      durationFrames: 120,
      evidence: {
        kind: "WIPE_COMPARE_EVIDENCE",
        beforeFrame: frameAt(runningEvent05.outputTimeMs),
        afterFrame: frameAt(findingsEvent05.outputTimeMs),
        sharedGeometry: true,
        viewport: {width: source05.width, height: source05.height},
        coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
        diffRegion: resultRect05,
      },
    },
    {
      id: "ed04-wait-compression",
      shotId: "ED-04",
      effectId: "WAIT_COMPRESSION",
      resolved: ed04,
      source: source04,
      durationFrames: 121,
      evidence: {
        kind: "WAIT_COMPRESSION_EVIDENCE",
        sourceStartFrame: 225,
        sourceEndFrame: 345,
        originalWaitStartMs: requestEvent.tMs,
        originalWaitEndMs: resultEvent04.tMs,
        outputWaitStartMs: requestEvent.outputTimeMs,
        outputWaitEndMs: resultEvent04.outputTimeMs,
        resultEventName: resultEvent04.name,
        resultFrame: frameAt(resultEvent04.outputTimeMs),
      },
    },
    {
      id: "ed04-result-hold",
      shotId: "ED-04",
      effectId: "RESULT_HOLD",
      resolved: ed04,
      source: source04,
      durationFrames: 140,
      evidence: {
        kind: "RESULT_HOLD_EVIDENCE",
        sourceStartFrame: frameAt(resultEvent04.outputTimeMs),
        sourceEndFrame: source04.frameCount - 1,
        minimumSourceHoldFrames: 60,
        finalFrameExtensionFrames: 140 - (source04.frameCount - frameAt(resultEvent04.outputTimeMs)),
        resultTarget: {
          videoSha256: source04.videoSha256,
          revisionSha256: source04.revisionSha256,
          firstFrame: frameAt(resultEvent04.outputTimeMs),
          lastFrame: source04.frameCount - 1,
          viewport: {width: source04.width, height: source04.height, scrollX: request.scroll.x, scrollY: request.scroll.y},
          coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
          rect: resultRect04,
          identitySha256: ed04.report.persistentResultDom.identitySha256,
          maxDriftPx: ed04.report.persistentResultDom.rectDrift.maxAbsPx,
        },
      },
    },
  ];
  const sourceUris = new Map();
  for (const resolved of [ed04, ed05]) {
    const name = `${resolved.shot.shotId.toLowerCase()}-${resolved.captured.sha256.slice(0, 12)}.mp4`;
    const staged = path.join(stageDir, name);
    fs.copyFileSync(resolved.sourcePath, staged);
    if (sha(staged) !== resolved.captured.sha256) throw new Error(`${resolved.shot.shotId}:staged-sha-mismatch`);
    sourceUris.set(resolved.shot.shotId, path.relative(publicRoot, staged).split(path.sep).join("/"));
  }
  // Cross-dissolve overlaps remove the hard cuts between independently authored
  // effect segments. Each boundary's overlap is the min of the two fade lengths;
  // the next segment starts that many frames before the previous effect ends, so
  // its fade-in crosses the previous segment's fade-out.
  const TRANSITIONS = [
    {index: 0, fadeOutFrames: 12}, // focus -> compare
    {index: 1, fadeInFrames: 12, fadeOutFrames: 10}, // compare -> wait
    {index: 2, fadeInFrames: 10, fadeOutFrames: 8}, // wait -> hold
    {index: 3, fadeInFrames: 8},
  ];
  const overlaps = [12, 10, 8]; // boundary overlaps: 0->1, 1->2, 2->3
  let cursor = 0;
  const variants = definitions.map((definition, index) => {
    const startFrame = cursor;
    const plan = compileScreenPackagingCorePlanV1({
      id: definition.id,
      shotId: definition.shotId,
      effectId: definition.effectId,
      source: definition.source,
      durationFrames: definition.durationFrames,
      evidence: definition.evidence,
    });
    const planValidation = validateScreenPackagingCorePlanV1(plan);
    if (planValidation.status !== "PASS") throw new Error(`${definition.id}:plan:${planValidation.failures.join(",")}`);
    const adapter = compileScreenPackagingCoreAdapterV1({plan, sourceVideoSha256: definition.source.videoSha256, output});
    const adapterValidation = validateScreenPackagingCoreAdapterV1(adapter);
    if (adapterValidation.status !== "PASS") throw new Error(`${definition.id}:adapter:${adapterValidation.failures.join(",")}`);
    const variant = {id: definition.id, sourceVideoUri: sourceUris.get(definition.shotId), sourceVideoSha256: definition.source.videoSha256, startFrame, adapter, resolved: definition.resolved, ...TRANSITIONS[index]};
    cursor = startFrame + definition.durationFrames - (index < overlaps.length ? overlaps[index] : 0);
    return variant;
  });
  const props = {variants: variants.map(({resolved, ...variant}) => variant)};
  const propsPath = path.join(runOut, "props.json");
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  const mediaPath = path.join(runOut, "screen-packaging-core-review-960x540.mp4");
  runRemotion(["render", entry, composition, mediaPath, "--props", propsPath, "--codec", "h264", "--crf", "16", "--log", "error"]);

  const proofSpec = [
    ["focus-primary", variants[0].startFrame + 60],
    ["focus-result", variants[0].startFrame + 150],
    ["compare-before", variants[1].startFrame + 10],
    ["compare-mid", variants[1].startFrame + 36],
    ["compare-flash", variants[1].startFrame + 63],
    ["compare-final", variants[1].startFrame + 100],
    ["wait-start", variants[2].startFrame + 10],
    ["wait-result", variants[2].startFrame + 100],
    ["hold-live", variants[3].startFrame + 40],
    ["hold-freeze-a", variants[3].startFrame + 105],
    ["hold-freeze-b", variants[3].startFrame + 132],
  ];
  const proofFiles = [];
  for (const [id, frame] of proofSpec) {
    const file = path.join(runOut, `${id}.png`);
    runRemotion(["still", entry, composition, file, "--props", propsPath, "--frame", String(frame), "--log", "error"]);
    proofFiles.push({id, frame, file, raw: await pixelData(file)});
  }
  const byId = new Map(proofFiles.map((item) => [item.id, item]));
  const focusDelta = deltaStats(byId.get("focus-primary").raw, byId.get("focus-result").raw);
  const focusEdgeBackgroundPixels = {
    primary: uncoveredEdgePixels(byId.get("focus-primary").raw),
    result: uncoveredEdgePixels(byId.get("focus-result").raw),
  };
  const compareDelta = deltaStats(byId.get("compare-before").raw, byId.get("compare-mid").raw);
  const waitDelta = deltaStats(byId.get("wait-start").raw, byId.get("wait-result").raw);
  const diff = variants[1].adapter.actor.diffRegion;
  const envelope = [{left: Math.floor(diff.x), top: Math.floor(diff.y), right: Math.ceil(diff.x + diff.width), bottom: Math.ceil(diff.y + diff.height)}];
  const flashDelta = deltaStats(byId.get("compare-final").raw, byId.get("compare-flash").raw, envelope);
  const holdFreezeA = shaBuffer(byId.get("hold-freeze-a").raw.data);
  const holdFreezeB = shaBuffer(byId.get("hold-freeze-b").raw.data);
  // Alignment gate: on the settled focus-result frame the spotlight hole must
  // cover the bright result panel. Sample the secondary target rect (the hole
  // follows it once the hand-off settles) and require it to be meaningfully
  // brighter than the dimmed corner surround. Catches "hole over blank space",
  // which the pure pixel-movement gate cannot see.
  const focusResultRaw = byId.get("focus-result").raw;
  const focusHole = variants[0].adapter.actor.secondaryTarget;
  const holeLum = meanLuminanceIn(focusResultRaw, focusHole);
  const surroundLum = meanLuminanceCornerBands(focusResultRaw);
  const focusAlignment = {holeLum: Math.round(holeLum * 10) / 10, surroundLum: Math.round(surroundLum * 10) / 10, margin: Math.round((holeLum - surroundLum) * 10) / 10};
  const failures = [];
  if (focusDelta.changed < 5000) failures.push("FOCUS_HANDOFF_PIXEL_MOVE_TOO_SMALL");
  if (focusEdgeBackgroundPixels.primary !== 0 || focusEdgeBackgroundPixels.result !== 0)
    failures.push(`FOCUS_CAMERA_EXPOSED_CANVAS:${focusEdgeBackgroundPixels.primary}:${focusEdgeBackgroundPixels.result}`);
  if (holeLum - surroundLum < 28)
    failures.push(`FOCUS_HOLE_NOT_ON_TARGET:${focusAlignment.holeLum}:${focusAlignment.surroundLum}`);
  if (compareDelta.changed < 5000) failures.push("COMPARE_WIPE_PIXEL_DELTA_TOO_SMALL");
  if (flashDelta.inside < 100 || flashDelta.outside !== 0)
    failures.push(`DIFFERENCE_FLASH_ENVELOPE_INVALID:${flashDelta.inside}:${flashDelta.outside}`);
  if (waitDelta.changed < 5000) failures.push("WAIT_RESULT_PIXEL_DELTA_TOO_SMALL");
  if (holdFreezeA !== holdFreezeB) failures.push("RESULT_HOLD_FINAL_FREEZE_UNSTABLE");

  const proofFrames = [
    {id: "focus-handoff", metrics: {...focusDelta, edgeBackgroundPixels: focusEdgeBackgroundPixels}, files: ["focus-primary", "focus-result"].map((id) => ({path: artifactRel(byId.get(id).file), sha256: sha(byId.get(id).file)}))},
    {id: "wipe-compare", metrics: compareDelta, files: ["compare-before", "compare-mid"].map((id) => ({path: artifactRel(byId.get(id).file), sha256: sha(byId.get(id).file)}))},
    {id: "difference-flash", metrics: {...flashDelta, envelope}, files: ["compare-flash", "compare-final"].map((id) => ({path: artifactRel(byId.get(id).file), sha256: sha(byId.get(id).file)}))},
    {id: "wait-compression", metrics: waitDelta, files: ["wait-start", "wait-result"].map((id) => ({path: artifactRel(byId.get(id).file), sha256: sha(byId.get(id).file)}))},
    {id: "result-hold", metrics: {freezePixelSha256: holdFreezeA, stable: holdFreezeA === holdFreezeB}, files: ["hold-live", "hold-freeze-a", "hold-freeze-b"].map((id) => ({path: artifactRel(byId.get(id).file), sha256: sha(byId.get(id).file)}))},
  ];
  const contactSheet = path.join(runOut, "contact-sheet.png");
  const thumbWidth = 480, thumbHeight = 270;
  const thumbs = await Promise.all(proofFiles.map((item) => sharp(item.file).resize(thumbWidth, thumbHeight).png().toBuffer()));
  const columns = 4, rows = Math.ceil(thumbs.length / columns);
  await sharp({create: {width: columns * thumbWidth, height: rows * thumbHeight, channels: 3, background: "#0c1011"}})
    .composite(thumbs.map((input, index) => ({input, left: index % columns * thumbWidth, top: Math.floor(index / columns) * thumbHeight})))
    .png().toFile(contactSheet);

  const probe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", mediaPath], {encoding: "utf8"}));
  const stream = probe.streams.find((item) => item.codec_type === "video");
  const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", mediaPath, "-f", "null", "-"], {encoding: "utf8"});
  if (stream?.width !== output.width || stream?.height !== output.height || stream?.r_frame_rate !== "60/1" || Number(stream?.nb_read_frames) !== cursor) failures.push("MEDIA_CONTRACT_INVALID");
  if (decode.status !== 0) failures.push("MEDIA_DECODE_FAILED");
  const workspaceShaAfter = sha(workspacePath), currentPhaseShaAfter = sha(currentPhasePath);
  if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
  if (currentPhaseShaBefore !== currentPhaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");
  const implementation = implementationPaths.map((item) => ({path: item, sha256: sha(path.join(root, item))}));
  const audit = {
    contract: "A1ScreenPackagingCoreCanaryAudit/v1",
    status: failures.length ? "FAIL" : "PASS",
    effects: variants.map((variant) => variant.adapter.effectId),
    sources: [ed04, ed05].map((resolved) => ({shotId: resolved.shot.shotId, versionId: resolved.shot.versionId, revisionSha256: resolved.shot.revisionSha256, videoPath: rel(resolved.sourcePath), videoSha256: resolved.captured.sha256, reportPath: rel(resolved.reportPath), reportSha256: sha(resolved.reportPath)})),
    adapters: variants.map((variant) => ({id: variant.id, planSha256: variant.adapter.plan.planSha256, adapterSha256: variant.adapter.adapterSha256, sourceVideoSha256: variant.sourceVideoSha256})),
    proofFrames,
    props: {path: artifactRel(propsPath), sha256: sha(propsPath)},
    media: {path: artifactRel(mediaPath), sha256: sha(mediaPath), width: stream?.width, height: stream?.height, fps: stream?.r_frame_rate, frameCount: Number(stream?.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000)},
    contactSheet: {path: artifactRel(contactSheet), sha256: sha(contactSheet), width: columns * thumbWidth, height: rows * thumbHeight},
    implementation,
    checks: {
      actualSourceBytesVerified: true,
      focusHandoffPixelsMove: focusDelta.changed >= 5000,
      focusCameraCoversCanvas: focusEdgeBackgroundPixels.primary === 0 && focusEdgeBackgroundPixels.result === 0,
      focusHoleOnResultPanel: focusAlignment.margin >= 28,
      focusAlignment,
      compareWipeAndDiffVisible: compareDelta.changed >= 5000 && flashDelta.inside >= 100 && flashDelta.outside === 0,
      waitCompressionMappingBound: variants[2].adapter.actor.compressionRatio > 40 && variants[2].adapter.actor.resultFrame === frameAt(resultEvent04.outputTimeMs),
      resultHoldStable: holdFreezeA === holdFreezeB,
      fullDecode: decode.status === 0,
    },
    boundary: {reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED", workspaceShaBefore, workspaceShaAfter, workspaceMutationPerformed: workspaceShaBefore !== workspaceShaAfter, currentPhaseShaBefore, currentPhaseShaAfter, currentPhaseMutationPerformed: currentPhaseShaBefore !== currentPhaseShaAfter},
    failures,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(runOut, "audit-report.json"), `${JSON.stringify(audit, null, 2)}\n`);
  if (failures.length) throw new Error(`screen-packaging-core-canary-failed:${failures.join(",")}`);
  for (const name of fs.readdirSync(runOut)) fs.cpSync(path.join(runOut, name), path.join(out, name), {recursive: true, force: true});
  console.log(JSON.stringify({...audit, artifactRoot: rel(out)}, null, 2));
} finally {
  fs.rmSync(stageDir, {recursive: true, force: true});
  fs.rmSync(runOut, {recursive: true, force: true});
  if (lockFd !== undefined) fs.closeSync(lockFd);
  fs.rmSync(lockPath, {force: true});
}
