#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/windowed-exact-frame-extraction-proof-v1");
const resultPath = path.join(taskRoot, "result.json");
const boardPath = path.join(taskRoot, "decode-work-comparison.png");
const ffmpegPath = process.env.A1_TEST_FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = process.env.A1_TEST_FFPROBE_PATH || "/Users/a1/.local/bin/ffprobe";
const extractorModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs");
const extractorTestPath = path.join(repoRoot, "scripts/test-node-ffmpeg-frame-extractor-v1.mjs");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-windowed-frame-proof-v1-"));
const profiles = [
  {id: "cfr25-narrated-explainer", genre: "narrated-explainer", fps: 25, gop: 50},
  {id: "cfr30-screen-tutorial", genre: "screen-tutorial", fps: 30, gop: 60},
  {id: "cfr60-opinion-piece", genre: "opinion-piece", fps: 60, gop: 120},
];
const durationSeconds = 12;
const keepFixtures = process.argv.includes("--keep-fixtures");

function run(binary, args, {timeout = 120_000, maxBuffer = 64 * 1024 * 1024} = {}) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout,
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || "").slice(-4000);
    throw new Error("COMMAND_FAILED " + binary + " exit=" + result.status + " " + detail);
  }
  return {stdout: result.stdout || "", stderr: result.stderr || ""};
}

function runMeasured(binary, args) {
  const start = performance.now();
  const result = run(binary, args);
  return {...result, wallMs: Number((performance.now() - start).toFixed(3))};
}

function showInfoRecords(stderr) {
  return String(stderr).split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/Parsed_showinfo_\d+[^\]]*\] n:\s*(\d+)\s+pts:\s*(-?\d+)/u);
    return match ? [{filterFrameIndex: Number(match[1]), pts: Number(match[2])}] : [];
  });
}

function framePixelCode(pixel) {
  return pixel[0] + pixel[1] * 256 + pixel[2] * 65_536;
}

async function readFramePixel(filename) {
  const {data, info} = await sharp(filename).removeAlpha().raw().toBuffer({resolveWithObject: true});
  assert.ok(info.width >= 2 && info.height >= 2, "decoded output image must have dimensions");
  return Array.from(data.subarray(0, 3));
}

async function selectedPixelCodes(directory, expectedCount) {
  const names = fs.readdirSync(directory).filter((name) => name.endsWith(".png")).sort();
  assert.equal(names.length, expectedCount, "FFmpeg output frame count must equal planned target count");
  const entries = [];
  for (let index = 0; index < names.length; index += 1) {
    const bytes = fs.readFileSync(path.join(directory, names[index]));
    entries.push({
      path: names[index],
      sha256: sha256(bytes),
      pixel: await readFramePixel(path.join(directory, names[index])),
    });
  }
  return entries;
}

function selectionFilter({frames, seekStartFrame = 0, ptsByFrame = null}) {
  const terms = frames.map((frame) => {
    if (ptsByFrame) return "eq(pts," + ptsByFrame[frame] + ")";
    return "eq(n," + (frame - seekStartFrame) + ")";
  });
  return "showinfo,select='" + terms.join("+") + "'";
}

function framePattern(directory) {
  fs.mkdirSync(directory, {recursive: true});
  return path.join(directory, "frame-%04d.png");
}

function keyframeTargets(profile, totalFrames) {
  const g = profile.gop;
  return [
    {id: "origin-boundary", seekStartFrame: 0, frames: [0, 1, profile.fps - 1, g - 1]},
    {id: "interior-gop-boundary", seekStartFrame: 2 * g, frames: [2 * g, 2 * g + 1, 3 * g - 1, 3 * g, 3 * g + 1]},
    {id: "tail-and-end", seekStartFrame: 4 * g,
      frames: [4 * g, 4 * g + 1, 5 * g - 1, 5 * g, 5 * g + 1, totalFrames - 1]},
  ].map((batch) => ({...batch, frames: [...new Set(batch.frames)].sort((a, b) => a - b)}));
}

function parsePacketIndex(stdout, profile, totalFrames) {
  const probe = JSON.parse(stdout);
  const packets = Array.isArray(probe.packets) ? probe.packets : [];
  const stream = Array.isArray(probe.streams) ? probe.streams[0] : null;
  const timeBaseMatch = String(stream?.time_base || "").match(/^(\d+)\/(\d+)$/u);
  assert.ok(timeBaseMatch, "synthetic stream must expose an integer time base");
  const timeBaseNumerator = Number(timeBaseMatch[1]);
  const timeBaseDenominator = Number(timeBaseMatch[2]);
  assert.ok(timeBaseNumerator > 0 && timeBaseDenominator > 0, "synthetic stream time base must be positive");
  assert.equal(packets.length, totalFrames, "synthetic CFR fixture must contain exactly one packet per frame");
  const packetOrder = packets.map((packet) => {
    assert.ok(typeof packet.pts_time === "string" && Number.isFinite(Number(packet.pts_time)),
      "every synthetic packet must have a presentation timestamp");
    const exactPosition = Number(packet.pts_time) * profile.fps;
    const frame = Math.round(exactPosition);
    const timeBaseHalfFrame = profile.fps * timeBaseNumerator / timeBaseDenominator / 2;
    assert.ok(Math.abs(exactPosition - frame) <= timeBaseHalfFrame + 0.000001,
      "packet PTS must map to one CFR frame index within stream time-base precision");
    assert.ok(Number.isSafeInteger(Number(packet.pts)), "every synthetic packet must expose integer source PTS");
    return {frame, pts: Number(packet.pts), ptsSeconds: Number(packet.pts_time),
      keyframe: String(packet.flags || "").includes("K")};
  });
  const indexed = [...packetOrder].sort((left, right) => left.ptsSeconds - right.ptsSeconds);
  assert.deepEqual(packetOrder.map((entry) => entry.frame), indexed.map((entry) => entry.frame),
    "synthetic no-B-frame packet order must already match presentation order");
  for (let frame = 0; frame < totalFrames; frame += 1) {
    assert.equal(indexed[frame].frame, frame, "packet PTS index must be complete, unique and zero-based");
  }
  const expectedKeyframes = [];
  for (let frame = 0; frame < totalFrames; frame += profile.gop) expectedKeyframes.push(frame);
  const actualKeyframes = indexed.filter((entry) => entry.keyframe).map((entry) => entry.frame);
  assert.deepEqual(actualKeyframes, expectedKeyframes, "packet flags must identify the forced GOP keyframes");
  return {
    packetCount: packets.length,
    decodedFrames: 0,
    timeBase: stream.time_base,
    timeBaseNumerator,
    timeBaseDenominator,
    secondsPerTick: timeBaseNumerator / timeBaseDenominator,
    keyframes: indexed.filter((entry) => entry.keyframe).map((entry) => ({
      sourceFrame: entry.frame,
      ptsSeconds: entry.ptsSeconds,
    })),
    ptsByFrame: indexed.map((entry) => entry.pts),
    fingerprint: sha256(Buffer.from(JSON.stringify(indexed.map((entry) => ({
      frame: entry.frame,
      pts: entry.pts,
      keyframe: entry.keyframe,
    }))), "utf8")),
  };
}

function readPacketIndex(videoPath, profile, totalFrames) {
  const start = performance.now();
  const probe = run(ffprobePath, [
    "-v", "error", "-select_streams", "v:0",
    "-show_packets", "-show_streams", "-show_entries", "packet=pts,pts_time,flags:stream=time_base", "-of", "json",
    videoPath,
  ]);
  const index = parsePacketIndex(probe.stdout, profile, totalFrames);
  return {index, wallMs: Number((performance.now() - start).toFixed(3))};
}

function createSource(profile, destination) {
  const totalFrames = profile.fps * durationSeconds;
  const filter = "format=rgb24,geq=r='mod(N,256)':g='mod(floor(N/256),256)':b='mod(floor(N/65536),256)'";
  run(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:r=" + profile.fps + ":d=" + durationSeconds,
    "-vf", filter,
    "-frames:v", String(totalFrames),
    "-an", "-sn", "-dn",
    "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", "-bf", "0",
    "-g", String(profile.gop), "-keyint_min", String(profile.gop), "-sc_threshold", "0",
    "-pix_fmt", "rgb24", "-fps_mode", "cfr",
    "-y", destination,
  ]);
  return totalFrames;
}

function extractBaseline(videoPath, frames, directory) {
  const output = framePattern(directory);
  const filter = selectionFilter({frames});
  const result = runMeasured(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "info",
    "-i", videoPath,
    "-map", "0:v:0", "-an", "-sn", "-dn",
    "-vf", filter,
    "-fps_mode", "passthrough", "-frames:v", String(frames.length), "-start_number", "0",
    "-c:v", "png", "-compression_level", "6", "-pred", "mixed", "-threads", "1",
    "-f", "image2", "-y", output,
  ]);
  return {filterFrames: showInfoRecords(result.stderr).length, wallMs: result.wallMs};
}

function extractWindowed(videoPath, profile, batch, packetIndex, directory) {
  const output = framePattern(directory);
  const maxFrame = Math.max(...batch.frames);
  const seekStartPts = packetIndex.ptsByFrame[batch.seekStartFrame];
  const targets = batch.frames.map((frame) => packetIndex.ptsByFrame[frame]);
  const seekStartSeconds = seekStartPts * packetIndex.secondsPerTick;
  const result = runMeasured(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "info",
    "-copyts", "-seek_timestamp", "1", "-ss", seekStartSeconds.toFixed(9), "-accurate_seek",
    "-i", videoPath,
    "-map", "0:v:0", "-an", "-sn", "-dn",
    "-vf", selectionFilter({frames: batch.frames, ptsByFrame: packetIndex.ptsByFrame}),
    "-fps_mode", "passthrough", "-frames:v", String(batch.frames.length), "-start_number", "0",
    "-c:v", "png", "-compression_level", "6", "-pred", "mixed", "-threads", "1",
    "-f", "image2", "-y", output,
  ]);
  const records = showInfoRecords(result.stderr);
  const expectedRecords = maxFrame - batch.seekStartFrame + 1;
  assert.equal(records.length, expectedRecords, "seek must expose every frame from the verified keyframe to the last requested frame");
  assert.equal(records[0].pts, seekStartPts, "first seeked frame must be the verified source keyframe");
  assert.equal(records.at(-1).pts, packetIndex.ptsByFrame[maxFrame], "last decoded filter frame must be the last requested source frame");
  assert.equal(targets.length, batch.frames.length);
  return {filterFrames: records.length, wallMs: result.wallMs, startPts: seekStartPts,
    endPts: packetIndex.ptsByFrame[maxFrame]};
}

function renderComparisonBoard(profileResults, destination) {
  const width = 1520;
  const rowHeight = 174;
  const height = 208 + profileResults.length * rowHeight;
  const rows = profileResults.map((profile, row) => {
    const y = 180 + row * rowHeight;
    const maxCount = Math.max(...profile.batches.map((batch) => batch.baselineFilterFrames));
    const baselineTotal = profile.summary.baselineFilterFrames;
    const windowTotal = profile.summary.windowedFilterFrames;
    const percent = profile.summary.decodedFilterFrameReductionPercent;
    const batchBars = profile.batches.map((batch, index) => {
      const bx = 360 + index * 265;
      const bw = Math.max(3, Math.round((batch.baselineFilterFrames / maxCount) * 175));
      const ww = Math.max(3, Math.round((batch.windowedFilterFrames / maxCount) * 175));
      const by = y + 38;
      return [
        '<text x="' + bx + '" y="' + y + '" class="small">' + batch.id + '</text>',
        '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="10" rx="5" fill="#a6adb6"/>',
        '<rect x="' + bx + '" y="' + (by + 16) + '" width="' + ww + '" height="10" rx="5" fill="#276ef1"/>',
        '<text x="' + bx + '" y="' + (by + 43) + '" class="count">full ' + batch.baselineFilterFrames + ' · window ' + batch.windowedFilterFrames + '</text>',
      ].join("");
    }).join("");
    return [
      '<rect x="24" y="' + (y - 18) + '" width="' + (width - 48) + '" height="150" rx="16" fill="#ffffff" stroke="#dce1e7"/>',
      '<text x="48" y="' + (y + 12) + '" class="label">' + profile.fps + ' fps · GOP ' + profile.gopFrames + ' · ' + profile.totalFrames + ' frames</text>',
      batchBars,
      '<text x="' + (width - 190) + '" y="' + (y + 14) + '" class="total">' + baselineTotal + ' → ' + windowTotal + '</text>',
      '<text x="' + (width - 190) + '" y="' + (y + 42) + '" class="small">filter frames: −' + percent + '%</text>',
      '<text x="' + (width - 190) + '" y="' + (y + 66) + '" class="small">wall: ' + profile.summary.baselinePathWallMs + ' → ' + profile.summary.windowedDirectPathWallMs + ' ms</text>',
      '<text x="48" y="' + (y + 117) + '" class="small">Exact pixel IDs matched · starts use packet-verified keyframes · synthetic H.264 RGB, no B-frames</text>',
    ].join("");
  }).join("");
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
    '<style>text{font-family:Arial,sans-serif;fill:#18202b}.title{font-size:29px;font-weight:700}.subtitle{font-size:15px;fill:#566170}.label{font-size:17px;font-weight:700}.small{font-size:13px;fill:#586271}.count{font-size:11px;fill:#586271}.total{font-size:20px;font-weight:700}</style>',
    '<rect width="100%" height="100%" fill="#f3f5f8"/>',
    '<text x="36" y="48" class="title">Windowed frame extraction · synthetic proof</text>',
    '<text x="36" y="78" class="subtitle">Gray = full-source decode from frame 0 to each batch end · blue = verified-keyframe window</text>',
    '<text x="36" y="104" class="subtitle">Metric counts showinfo records before select; packet indexing and wall time are reported separately.</text>',
    rows,
    '<text x="36" y="' + (height - 24) + '" class="small">This proves controlled CFR/keyframe behavior only; it is not a real-footage runtime or visual-approval result.</text>',
    '</svg>',
  ].join("");
  return sharp(Buffer.from(svg)).png().toFile(destination);
}

async function main() {
  fs.mkdirSync(taskRoot, {recursive: true});
  const adapterTestCommand = "node scripts/test-node-ffmpeg-frame-extractor-v1.mjs";
  const adapterTest = run(process.execPath,
    [path.join(repoRoot, "scripts/test-node-ffmpeg-frame-extractor-v1.mjs")], {timeout: 120_000});
  const adapterTestOutput = adapterTest.stdout + adapterTest.stderr;
  const adapterTestSummary = adapterTestOutput.trim().split(/\r?\n/u).at(-1) || "";
  assert.match(adapterTestSummary, /^PASS node-ffmpeg-frame-extractor-v1:/u,
    "adapter focused test must pass before the integrated proof is marked complete");
  const profileResults = [];
  for (const profile of profiles) {
    const totalFrames = profile.fps * durationSeconds;
    const fixturePath = path.join(temporaryRoot, profile.id + ".mkv");
    createSource(profile, fixturePath);
    const videoBytes = fs.readFileSync(fixturePath);
    const sourceVideoSha256 = sha256(videoBytes);
    const batches = [];
    let firstPacketIndex = null;
    for (const batch of keyframeTargets(profile, totalFrames)) {
      const {index: packetIndex, wallMs: packetIndexWallMs} = readPacketIndex(fixturePath, profile, totalFrames);
      if (firstPacketIndex) {
        assert.equal(packetIndex.fingerprint, firstPacketIndex.fingerprint,
          "each independent packet-index probe must produce the same source index");
      } else {
        firstPacketIndex = packetIndex;
      }
      assert.ok(packetIndex.keyframes.some((keyframe) => keyframe.sourceFrame === batch.seekStartFrame),
        "window start must be an indexed keyframe");
      const batchBase = path.join(temporaryRoot, profile.id, batch.id);
      const baseline = extractBaseline(fixturePath, batch.frames, path.join(batchBase, "baseline"));
      const windowed = extractWindowed(fixturePath, profile, batch, packetIndex,
        path.join(batchBase, "windowed"));
      const baselineImages = await selectedPixelCodes(path.join(batchBase, "baseline"), batch.frames.length);
      const windowImages = await selectedPixelCodes(path.join(batchBase, "windowed"), batch.frames.length);
      const targetChecks = [];
      for (let index = 0; index < batch.frames.length; index += 1) {
        const frame = batch.frames[index];
        const expectedCode = frame;
        const baselineCode = framePixelCode(baselineImages[index].pixel);
        const windowedCode = framePixelCode(windowImages[index].pixel);
        assert.equal(baselineCode, expectedCode, "baseline output must match synthetic source-frame pixel ID");
        assert.equal(windowedCode, expectedCode, "window output must match synthetic source-frame pixel ID");
        assert.deepEqual(windowImages[index].pixel, baselineImages[index].pixel,
          "window output pixels must exactly equal baseline output pixels");
        targetChecks.push({sourceFrame: frame, expectedPixelCode: expectedCode, baselinePixelCode: baselineCode,
          windowedPixelCode: windowedCode, baselinePngSha256: baselineImages[index].sha256,
          windowedPngSha256: windowImages[index].sha256});
      }
      const repeatDirectory = path.join(batchBase, "windowed-repeat");
      const repeat = extractWindowed(fixturePath, profile, batch, packetIndex, repeatDirectory);
      const repeatedImages = await selectedPixelCodes(repeatDirectory, batch.frames.length);
      assert.deepEqual(repeatedImages.map((entry) => entry.sha256), windowImages.map((entry) => entry.sha256),
        "identical seek-window run must reproduce identical PNG bytes");
      assert.equal(repeat.filterFrames, windowed.filterFrames);
      const baselineEnd = Math.max(...batch.frames);
      assert.equal(baseline.filterFrames, baselineEnd + 1,
        "baseline work count must include every frame delivered from source frame zero to the last target");
      batches.push({
        id: batch.id,
        seekStartFrame: batch.seekStartFrame,
        seekStartPts: windowed.startPts,
        lastTargetFrame: baselineEnd,
        targetFrames: batch.frames,
        baselineFilterFrames: baseline.filterFrames,
        windowedFilterFrames: windowed.filterFrames,
        repeatWindowedFilterFrames: repeat.filterFrames,
        baselineWallMs: baseline.wallMs,
        windowedWallMs: windowed.wallMs,
        repeatWindowedWallMs: repeat.wallMs,
        packetIndexWallMs,
        packetIndexFingerprint: packetIndex.fingerprint,
        exactPixelOracle: "PASS",
        repeatPngByteIdentity: true,
        targets: targetChecks,
      });
    }
    const baselineFilterFrames = batches.reduce((sum, batch) => sum + batch.baselineFilterFrames, 0);
    const windowedFilterFrames = batches.reduce((sum, batch) => sum + batch.windowedFilterFrames, 0);
    profileResults.push({
      id: profile.id,
      genre: profile.genre,
      fps: profile.fps,
      gopFrames: profile.gop,
      totalFrames,
      durationSeconds,
      sourceVideoSha256,
      sourceVideoBytes: videoBytes.length,
      packetIndex: {
        packetCount: firstPacketIndex.packetCount,
        decodedFrames: firstPacketIndex.decodedFrames,
        timeBase: firstPacketIndex.timeBase,
        keyframes: firstPacketIndex.keyframes,
        fingerprint: firstPacketIndex.fingerprint,
        probeCount: batches.length,
        wallMs: Number(batches.reduce((sum, batch) => sum + batch.packetIndexWallMs, 0).toFixed(3)),
      },
      batches,
      summary: {
        batchCount: batches.length,
        targetCount: batches.reduce((sum, batch) => sum + batch.targetFrames.length, 0),
        baselineFilterFrames,
        windowedFilterFrames,
        decodedFilterFrameReductionPercent: Number(((1 - windowedFilterFrames / baselineFilterFrames) * 100).toFixed(2)),
        baselinePathWallMs: Number(batches.reduce((sum, batch) => sum + batch.baselineWallMs, 0).toFixed(3)),
        windowedExtractionWallMs: Number(batches.reduce((sum, batch) => sum + batch.windowedWallMs, 0).toFixed(3)),
        repeatedPacketIndexWallMs: Number(batches.reduce((sum, batch) => sum + batch.packetIndexWallMs, 0).toFixed(3)),
        windowedDirectPathWallMs: Number(batches.reduce((sum, batch) => sum
          + batch.windowedWallMs + batch.packetIndexWallMs, 0).toFixed(3)),
        allRequestedSourceFramePixelsExact: true,
        deterministicRepeatPass: true,
      },
    });
  }
  const baselineTotal = profileResults.reduce((sum, profile) => sum + profile.summary.baselineFilterFrames, 0);
  const windowedTotal = profileResults.reduce((sum, profile) => sum + profile.summary.windowedFilterFrames, 0);
  const boardResult = await renderComparisonBoard(profileResults, boardPath);
  const boardBytes = fs.readFileSync(boardPath);
  const result = {
    contract: "A1WindowedExactFrameExtractionProof/v1",
    phaseId: "windowed-exact-frame-extraction-proof-v1",
    status: "PASS",
    createdAt: new Date().toISOString(),
    runtime: {
      ffmpegPath,
      ffprobePath,
      ffmpegBinarySha256: sha256(fs.readFileSync(ffmpegPath)),
      ffprobeBinarySha256: sha256(fs.readFileSync(ffprobePath)),
      ffmpegVersion: run(ffmpegPath, ["-version"]).stdout.split(/\r?\n/u)[0],
      ffprobeVersion: run(ffprobePath, ["-version"]).stdout.split(/\r?\n/u)[0],
    },
    measurement: {
      decoderWorkMetric: "count of showinfo frame records before select",
      metricBoundary: "frames delivered to the filter graph; not codec-internal operations or wall-clock time",
      seekRequirement: "each -ss start is a keyframe PTS verified from ffprobe packet flags for the synthetic fixture",
      windowCommand: "copy timestamps, seek by source PTS at an indexed keyframe, then select planned source PTS",
      baselineCommand: "start at source frame 0, select source frame indices, stop after final planned target",
      packetIndexingDecodesFrames: 0,
      packetIndexProbePolicy: "one full packet index scan per independent batch; no shared index cache",
      sourceHashVerificationIncluded: false,
      artifactAcceptanceTimeIncluded: false,
      realSourceBytesRead: 0,
      adapterIntegrationClaim: false,
      schedulerIntegrationClaim: false,
      adapterExecutionStatus: "PASS_ADAPTER_LEVEL_ONLY",
      adapterFocusedTest: {
        status: "PASS",
        command: adapterTestCommand,
        executionPath: "direct adapter.execute calls on accepted synthetic node fixtures; no scheduler tick or registered execution",
        outputSha256: sha256(Buffer.from(adapterTestOutput, "utf8")),
        adapterModuleSha256: sha256(fs.readFileSync(extractorModulePath)),
        focusedTestSourceSha256: sha256(fs.readFileSync(extractorTestPath)),
        summary: adapterTestSummary,
      },
      productionAdmission: false,
      visualApproval: "NOT_GRANTED",
    },
    fixtures: profileResults.map((profile) => ({
      id: profile.id,
      genre: profile.genre,
      status: "PASS",
      totalFrames: profile.totalFrames,
      targetCount: profile.summary.targetCount,
      summary: profile.summary,
    })),
    profiles: profileResults,
    summary: {
      profileCount: profileResults.length,
      targetCount: profileResults.reduce((sum, profile) => sum + profile.summary.targetCount, 0),
      baselineFilterFrames: baselineTotal,
      windowedFilterFrames: windowedTotal,
      decodedFilterFrameReductionPercent: Number(((1 - windowedTotal / baselineTotal) * 100).toFixed(2)),
      baselinePathWallMs: Number(profileResults.reduce((sum, profile) => sum + profile.summary.baselinePathWallMs, 0).toFixed(3)),
      windowedExtractionWallMs: Number(profileResults.reduce((sum, profile) => sum + profile.summary.windowedExtractionWallMs, 0).toFixed(3)),
      repeatedPacketIndexWallMs: Number(profileResults.reduce((sum, profile) => sum + profile.summary.repeatedPacketIndexWallMs, 0).toFixed(3)),
      windowedDirectPathWallMs: Number(profileResults.reduce((sum, profile) => sum + profile.summary.windowedDirectPathWallMs, 0).toFixed(3)),
      exactPixelOraclePass: true,
      deterministicRepeatPass: true,
      allWindowStartsAreVerifiedKeyframes: true,
      adapterFocusedTestPass: true,
      schedulerIntegrationTest: "NOT_RUN",
    },
    proofBoundary: {
      sourceVideoBytesRead: "synthetic-only",
      userVideoBytesRead: 0,
      syntheticFramesDecoded: profileResults.reduce((sum, profile) => sum + profile.summary.baselineFilterFrames
        + profile.summary.windowedFilterFrames + profile.summary.windowedFilterFrames, 0),
      visualEventsObserved: false,
      visualApproval: "NOT_GRANTED",
      productionAdmission: false,
      defaultRegistryChanged: false,
      formalAuthorityModified: false,
    },
    visibleArtifact: {
      path: path.relative(repoRoot, boardPath).split(path.sep).join("/"),
      sha256: sha256(boardBytes),
      bytes: boardBytes.length,
      width: boardResult.width,
      height: boardResult.height,
    },
    independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
  if (!keepFixtures) fs.rmSync(temporaryRoot, {recursive: true, force: true});
  console.log(JSON.stringify({
    status: result.status,
    resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/"),
    visibleArtifact: result.visibleArtifact,
    summary: result.summary,
    temporaryFixturesRemoved: !keepFixtures,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
