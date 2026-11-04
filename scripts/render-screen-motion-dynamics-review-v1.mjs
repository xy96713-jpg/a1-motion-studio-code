#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {compileDynamicScreenFollowCamera} from "../apps/studio-next/src/lib/a1-dynamic-screen-follow-camera-v1.mjs";
import {minimumJerk} from "../apps/studio-next/src/lib/a1-screen-motion-curves-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const sourceRoot = path.join(
  root,
  "work/screen-recording-maturity-test-v1/lab-vault-fresh-navigation-maturity-v1",
);
const outputRoot = path.join(
  root,
  "work/screen-recording-maturity-test-v1/motion-dynamics-v1",
);
const publicRelativeRoot = "proof-only/screen-recording-maturity-test-v1/motion-dynamics-v1";
const publicOutputRoot = path.join(publicRoot, publicRelativeRoot);
const reportPath = path.join(sourceRoot, "capture-report.json");
const sourceVideo = path.join(sourceRoot, "clean-source.mp4");
const stagedVideo = path.join(publicOutputRoot, "clean-source.mp4");
const finalFrame = path.join(publicOutputRoot, "final-frame.png");
const cleanVideo = path.join(outputRoot, "motion-dynamics-clean-1280x720-60fps.mp4");
const reviewVideo = path.join(outputRoot, "motion-dynamics-review-1280x720-60fps.mp4");
const propsPath = path.join(outputRoot, "props.json");
const cameraProgramPath = path.join(outputRoot, "camera-program.json");
const auditPath = path.join(outputRoot, "audit-report.json");
const contactSheetPath = path.join(outputRoot, "motion-contact-sheet.png");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clamp01 = (value) => Math.max(0, Math.min(1, value));

const cameraEase = (kind, value) => {
  const t = clamp01(value);
  if (kind === "hold") return 0;
  if (kind === "linear") return t;
  return minimumJerk(t);
};

const cameraAt = (track, atMs) => {
  if (atMs <= track[0].atMs) return track[0];
  if (atMs >= track.at(-1).atMs) return track.at(-1);
  const index = track.findIndex((row) => row.atMs > atMs);
  const from = track[index - 1];
  const to = track[index];
  if (from.easingToNext === "hold") return from;
  const progress = cameraEase(
    from.easingToNext,
    (atMs - from.atMs) / Math.max(1, to.atMs - from.atMs),
  );
  return {
    atMs,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    scale: Math.exp(
      Math.log(from.scale) +
        (Math.log(to.scale) - Math.log(from.scale)) * progress,
    ),
  };
};

const cameraVelocity = (track, atMs, stepMs = 1000 / 60) => {
  const before = cameraAt(track, Math.max(0, atMs - stepMs));
  const now = cameraAt(track, atMs);
  return (
    Math.hypot(now.x - before.x, now.y - before.y) * now.scale +
    Math.abs(Math.log(now.scale) - Math.log(before.scale))
  );
};

const pixelMae = async (leftFile, rightFile) => {
  const left = await sharp(leftFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const right = await sharp(rightFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
    throw new Error("pixel comparison dimensions differ");
  }
  let sum = 0;
  for (let index = 0; index < left.data.length; index += 1) {
    sum += Math.abs(left.data[index] - right.data[index]);
  }
  return sum / left.data.length;
};

const probeVideo = (file) => {
  execFileSync(ffmpeg, ["-v", "error", "-i", file, "-f", "null", "-"]);
  return JSON.parse(
    execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration",
        "-of",
        "json",
        file,
      ],
      {encoding: "utf8"},
    ),
  );
};

const phaseLabel = (text) =>
  Buffer.from(
    `<svg width="426" height="42"><rect width="426" height="42" fill="#0b1011"/><text x="14" y="27" fill="#f4f1e8" font-size="14" font-family="Arial" font-weight="700">${text}</text></svg>`,
  );

async function main() {
  const sourceReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (sourceReport.status !== "READY_FOR_CAP_REVIEW") {
    throw new Error(`source capture is not review-ready: ${sourceReport.status}`);
  }
  if (sha256(sourceVideo) !== sourceReport.output.sha256) {
    throw new Error("source video SHA mismatch");
  }
  const width = Number(sourceReport.output.width);
  const height = Number(sourceReport.output.height);
  const fps = 60;
  const durationMs = 12000;
  const followStartMs = 2035;
  const followEndMs = 4917;
  const returnWideEndMs = 5800;
  const pushStartMs = 6200;
  const pushEndMs = 7100;
  const resultHoldEndMs = 9400;
  const finalWideAtMs = 10400;
  const cursorSamples = sourceReport.cursorTelemetry.moves
    .filter((row) => row.tMs >= followStartMs && row.tMs <= followEndMs)
    .map((row) => ({
      atMs: row.tMs - followStartMs,
      x: row.x,
      y: row.y,
      kind: "CURSOR",
    }));
  const followDurationMs = followEndMs - followStartMs;
  const followProgram = compileDynamicScreenFollowCamera({
    shotId: "SCREEN-MOTION-DYNAMICS-CURSOR-FOLLOW",
    durationMs: followDurationMs,
    targetSamples: cursorSamples,
    mode: "CURSOR_FOLLOW",
    sourceWidth: width,
    sourceHeight: height,
    outputWidth: width,
    outputHeight: height,
    fps,
    deadZoneFraction: 0.46,
  });
  if (followProgram.status !== "PASS") {
    throw new Error(`follow camera compilation failed: ${followProgram.failures.join(",")}`);
  }

  const followTrack = followProgram.track
    .filter((row) => row.atMs <= followDurationMs)
    .map((row) => ({
      atMs: Math.min(followEndMs, row.atMs + followStartMs),
      x: row.x,
      y: row.y,
      scale: row.scale,
      easingToNext: "linear",
    }));
  const followFinal = followTrack.at(-1);
  followFinal.atMs = followEndMs;
  followFinal.easingToNext = "restore";

  const resultRect = sourceReport.geometryTruth.targets.find(
    (target) => target.event === "result_hold",
  )?.sourceRect;
  if (!resultRect) throw new Error("result geometry is missing");
  const resultScale = 1.25;
  const halfViewport = 0.5 / resultScale;
  const resultTarget = {
    x: Math.max(
      halfViewport,
      Math.min(1 - halfViewport, resultRect.x + resultRect.width / 2),
    ),
    y: Math.max(
      halfViewport,
      Math.min(1 - halfViewport, resultRect.y + resultRect.height / 2),
    ),
    scale: resultScale,
  };
  const cameraTrack = [
    {atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: followStartMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "linear"},
    ...followTrack,
    {atMs: returnWideEndMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: pushStartMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "cinematic-in-out"},
    {atMs: pushEndMs, ...resultTarget, easingToNext: "hold"},
    {atMs: resultHoldEndMs, ...resultTarget, easingToNext: "restore"},
    {atMs: finalWideAtMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
    {atMs: durationMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold"},
  ].filter((row, index, rows) => index === 0 || row.atMs > rows[index - 1].atMs);

  const phases = [
    {id: "LOCK_WIDE", startMs: 0, endMs: 1800, label: "全景建立", detail: "稳定保持 · 不抢内容"},
    {id: "CURSOR_FOLLOW", startMs: 1800, endMs: followEndMs, label: "跟随鼠标移动", detail: "临界阻尼 · 死区跟随 · 连续速度"},
    {id: "RETURN_WIDE", startMs: followEndMs, endMs: pushStartMs, label: "回到正常画面", detail: "非线性缓出 · 点击后释放"},
    {id: "SEMANTIC_PUSH", startMs: pushStartMs, endMs: pushEndMs, label: "平移并推近结果", detail: "最小加加速度曲线 · 速度型动态模糊"},
    {id: "RESULT_HOLD", startMs: pushEndMs, endMs: resultHoldEndMs, label: "结果停留", detail: "镜头停稳 · 保持清晰可读"},
    {id: "RESTORE", startMs: resultHoldEndMs, endMs: finalWideAtMs, label: "再次回正", detail: "缓入缓出 · 不反弹"},
    {id: "FINAL_HOLD", startMs: finalWideAtMs, endMs: durationMs, label: "完整画面收束", detail: "最终静止 · 无模糊"},
  ];

  await fsp.mkdir(outputRoot, {recursive: true});
  await fsp.mkdir(publicOutputRoot, {recursive: true});
  await fsp.copyFile(sourceVideo, stagedVideo);
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "8.950",
    "-i",
    sourceVideo,
    "-frames:v",
    "1",
    finalFrame,
  ]);

  const scene = {
    shotId: "screen-motion-dynamics-review",
    timelineStartMs: 0,
    timelineEndMs: durationMs,
    durationMs,
    sourceActionId: "lab-vault-real-navigation",
    sourceVideoUri: `${publicRelativeRoot}/clean-source.mp4`,
    sourceSegments: [
      {
        kind: "video",
        outputStartMs: 0,
        outputEndMs: 9000,
        sourceStartMs: 0,
        sourceEndMs: 9000,
        evidenceRole: "REAL_BROWSER_NAVIGATION",
      },
      {
        kind: "still",
        outputStartMs: 9000,
        outputEndMs: durationMs,
        sourceStillUri: `${publicRelativeRoot}/final-frame.png`,
        evidenceRole: "REAL_CAPTURED_RESULT_HOLD",
      },
    ],
    screenDirection: {
      contract: "A1ScreenActionDirection/v1",
      grammar: "CURSOR_FOLLOW_RETURN_SEMANTIC_PUSH_RESULT_HOLD_RESTORE",
      cameraPath: "CINEMATIC_EASE_IN_OUT_RESTORE",
      motionBlurPolicy: "VELOCITY_CINEMATIC",
      cursorPolicy: "CAPTURED_TELEMETRY_REPLAY",
      clickFeedbackPolicy: "PRESS_ONLY",
      cameraPerformance: {mode: "DYNAMIC_REVIEW_ONLY"},
    },
    pointerTrack: {
      contract: "A1CurveGradePointerTrack/v1",
      interpolation: "CUBIC_HERMITE_CONTINUOUS_TANGENT",
      waypoints: sourceReport.cursorTelemetry.moves.map((row) => ({
        tMs: row.tMs,
        x: row.x,
        y: row.y,
      })),
      clicks: sourceReport.cursorTelemetry.clicks
        .filter((row) => row.down === true)
        .map((row) => ({atMs: row.tMs, x: row.x, y: row.y, kind: "press"})),
    },
    cameraTrack,
    editCoverage: {mode: "FULL_SOURCE_ACTION_PLUS_RESULT_HOLD", fullSourceActionShown: true},
  };
  const props = {
    contract: "A1ScreenMotionDynamicsReview/v1",
    width,
    height,
    fps,
    durationMs,
    scene,
    phases,
    showPhaseLabels: true,
  };
  await fsp.writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  await fsp.writeFile(
    cameraProgramPath,
    `${JSON.stringify(
      {
        contract: "A1ScreenMotionDynamicsCameraProgram/v1",
        sourceCaptureSha256: sourceReport.output.sha256,
        followProgram,
        resultTarget: {sourceRect: resultRect, camera: resultTarget},
        cameraTrack,
        phases,
      },
      null,
      2,
    )}\n`,
  );

  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({
    entryPoint: path.join(rendererRoot, "src/ScreenMotionDynamicsReviewEntry.tsx"),
    publicDir: publicRoot,
    rootDir: rendererRoot,
    enableCaching: true,
  });
  const browser = await openBrowser("chrome", {
    chromeMode: "headless-shell",
    logLevel: "warn",
  });
  const frameRecords = [];
  try {
    const composition = await selectComposition({
      serveUrl,
      id: "A1ScreenMotionDynamicsReviewV1",
      inputProps: props,
      puppeteerInstance: browser,
      logLevel: "warn",
    });
    const cleanProps = {...props, showPhaseLabels: false};
    const cleanComposition = await selectComposition({
      serveUrl,
      id: "A1ScreenMotionDynamicsReviewV1",
      inputProps: cleanProps,
      puppeteerInstance: browser,
      logLevel: "warn",
    });
    const reuseRenderedMedia =
      process.env.A1_REUSE_RENDERED_MEDIA === "1" &&
      fs.existsSync(cleanVideo) &&
      fs.existsSync(reviewVideo);
    if (!reuseRenderedMedia) {
      for (const [outputLocation, renderProps, renderComposition] of [
        [cleanVideo, cleanProps, cleanComposition],
        [reviewVideo, props, composition],
      ]) {
        await renderMedia({
          serveUrl,
          composition: renderComposition,
          inputProps: renderProps,
          outputLocation,
          codec: "h264",
          crf: 18,
          imageFormat: "jpeg",
          concurrency: 2,
          muted: true,
          hardwareAcceleration: "disable",
          overwrite: true,
          puppeteerInstance: browser,
          logLevel: "warn",
        });
      }
    }

    const velocities = Array.from({length: Math.ceil(durationMs / (1000 / fps))}, (_, index) => {
      const atMs = index * (1000 / fps);
      return {atMs, velocity: cameraVelocity(cameraTrack, atMs)};
    });
    const moving = velocities
      .filter((row) => row.atMs >= pushStartMs && row.atMs <= pushEndMs)
      .sort((left, right) => right.velocity - left.velocity)[0];
    const samples = [
      {id: "wide", atMs: 900},
      {id: "cursor-follow", atMs: 3650},
      {id: "returned-wide", atMs: 6000},
      {id: "push-motion", atMs: moving.atMs},
      {id: "result-hold", atMs: 8200},
      {id: "final-wide", atMs: 11200},
    ];
    for (const sample of samples) {
      const frame = Math.min(
        cleanComposition.durationInFrames - 1,
        Math.round((sample.atMs / 1000) * fps),
      );
      const file = path.join(outputRoot, `${sample.id}.png`);
      await renderStill({
        serveUrl,
        composition: cleanComposition,
        inputProps: cleanProps,
        frame,
        output: file,
        imageFormat: "png",
        overwrite: true,
        puppeteerInstance: browser,
        logLevel: "warn",
      });
      const stats = await sharp(file).stats();
      frameRecords.push({
        ...sample,
        frame,
        path: path.relative(root, file),
        sha256: sha256(file),
        meanLuma: stats.channels.slice(0, 3).reduce((sum, row) => sum + row.mean, 0) / 3,
      });
    }

    const noBlurProps = {
      ...props,
      showPhaseLabels: false,
      scene: {
        ...scene,
        screenDirection: {...scene.screenDirection, motionBlurPolicy: "NONE"},
      },
    };
    const noBlurComposition = await selectComposition({
      serveUrl,
      id: "A1ScreenMotionDynamicsReviewV1",
      inputProps: noBlurProps,
      puppeteerInstance: browser,
      logLevel: "warn",
    });
    const movingFrame = Math.round((moving.atMs / 1000) * fps);
    const holdFrame = Math.round((9200 / 1000) * fps);
    for (const [id, frame, renderProps, renderComposition] of [
      ["blur-moving", movingFrame, cleanProps, cleanComposition],
      ["no-blur-moving", movingFrame, noBlurProps, noBlurComposition],
      ["blur-hold", holdFrame, cleanProps, cleanComposition],
      ["no-blur-hold", holdFrame, noBlurProps, noBlurComposition],
    ]) {
      await renderStill({
        serveUrl,
        composition: renderComposition,
        inputProps: renderProps,
        frame,
        output: path.join(outputRoot, `${id}.png`),
        imageFormat: "png",
        overwrite: true,
        puppeteerInstance: browser,
        logLevel: "warn",
      });
    }
  } finally {
    await browser.close({silent: true});
  }

  const tiles = await Promise.all(
    frameRecords.map(async (record) => {
      const image = await sharp(path.join(root, record.path))
        .resize(426, 240, {fit: "cover"})
        .png()
        .toBuffer();
      return sharp({
        create: {width: 426, height: 282, channels: 3, background: "#0b1011"},
      })
        .composite([
          {input: phaseLabel(`${record.id.toUpperCase()} · ${(record.atMs / 1000).toFixed(2)}s`), left: 0, top: 0},
          {input: image, left: 0, top: 42},
        ])
        .png()
        .toBuffer();
    }),
  );
  await sharp({
    create: {width: 1278, height: 564, channels: 3, background: "#0b1011"},
  })
    .composite(
      tiles.map((input, index) => ({
        input,
        left: (index % 3) * 426,
        top: Math.floor(index / 3) * 282,
      })),
    )
    .png()
    .toFile(contactSheetPath);

  const cleanProbe = probeVideo(cleanVideo);
  const reviewProbe = probeVideo(reviewVideo);
  const cleanStream = cleanProbe.streams.find((row) => row.codec_type === "video");
  const reviewStream = reviewProbe.streams.find((row) => row.codec_type === "video");
  const movingBlurMae = await pixelMae(
    path.join(outputRoot, "blur-moving.png"),
    path.join(outputRoot, "no-blur-moving.png"),
  );
  const holdBlurMae = await pixelMae(
    path.join(outputRoot, "blur-hold.png"),
    path.join(outputRoot, "no-blur-hold.png"),
  );
  const maximumScale = Math.max(...cameraTrack.map((row) => row.scale));
  const pushStartVelocity = cameraVelocity(cameraTrack, pushStartMs + 50);
  const pushMidVelocity = cameraVelocity(cameraTrack, (pushStartMs + pushEndMs) / 2);
  const pushEndVelocity = cameraVelocity(cameraTrack, pushEndMs - 50);
  const followCameraTravel = followProgram.track.reduce(
    (sum, row, index, rows) =>
      index === 0 ? sum : sum + Math.hypot(row.x - rows[index - 1].x, row.y - rows[index - 1].y),
    0,
  );
  const failures = [];
  if (
    cleanStream.width !== width ||
    cleanStream.height !== height ||
    cleanStream.r_frame_rate !== "60/1" ||
    Number(cleanStream.nb_read_frames) !== 720 ||
    Math.abs(Number(cleanProbe.format.duration) - 12) > 0.05
  ) failures.push("CLEAN_MEDIA_CONTRACT");
  if (
    reviewStream.width !== width ||
    reviewStream.height !== height ||
    reviewStream.r_frame_rate !== "60/1" ||
    Number(reviewStream.nb_read_frames) !== 720
  ) failures.push("REVIEW_MEDIA_CONTRACT");
  if (frameRecords.some((row) => row.meanLuma < 5)) failures.push("BLACK_FRAME");
  if (maximumScale < 1.37) failures.push("ZOOM_PEAK_NOT_REACHED");
  if (cameraAt(cameraTrack, 6000).scale !== 1 || cameraAt(cameraTrack, 11200).scale !== 1) {
    failures.push("CAMERA_DID_NOT_RETURN_WIDE");
  }
  if (followProgram.performance.moves < 1 || followCameraTravel < 0.01) {
    failures.push("CURSOR_FOLLOW_NOT_VISIBLE");
  }
  if (!(pushMidVelocity > pushStartVelocity * 1.5 && pushMidVelocity > pushEndVelocity * 1.5)) {
    failures.push("NONLINEAR_EASE_PROFILE_NOT_PROVEN");
  }
  if (movingBlurMae < 0.08) failures.push("MOVING_BLUR_PIXEL_DELTA_TOO_LOW");
  if (holdBlurMae > 0.01) failures.push("HOLD_FRAME_BLUR_NOT_ZERO");
  if (Math.abs(cameraAt(cameraTrack, durationMs).scale - 1) > 1e-8) failures.push("FINAL_SCALE_NOT_ONE");
  const derivative = (fn, value, step = 1e-5) => (fn(value + step) - fn(value - step)) / (2 * step);
  if (Math.abs(derivative(minimumJerk, 0)) > 0.01 || Math.abs(derivative(minimumJerk, 1)) > 0.01) {
    failures.push("EASE_ENDPOINT_VELOCITY_NONZERO");
  }

  const audit = {
    contract: "A1ScreenMotionDynamicsReviewAudit/v1",
    status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY",
    source: {
      captureReport: path.relative(root, reportPath),
      captureReportSha256: sha256(reportPath),
      video: path.relative(root, sourceVideo),
      videoSha256: sha256(sourceVideo),
      realCursorWaypointCount: sourceReport.cursorTelemetry.moves.length,
      realClickCount: scene.pointerTrack.clicks.length,
      geometryTruthSha256: sourceReport.geometryTruth.geometryTruthSha256,
    },
    outputs: {
      clean: {
        path: path.relative(root, cleanVideo),
        sha256: sha256(cleanVideo),
        width,
        height,
        fps: "60/1",
        frameCount: Number(cleanStream.nb_read_frames),
        durationMs: Math.round(Number(cleanProbe.format.duration) * 1000),
        fullDecode: true,
      },
      labeledReview: {
        path: path.relative(root, reviewVideo),
        sha256: sha256(reviewVideo),
        width,
        height,
        fps: "60/1",
        frameCount: Number(reviewStream.nb_read_frames),
        durationMs: Math.round(Number(reviewProbe.format.duration) * 1000),
        fullDecode: true,
      },
      contactSheet: {
        path: path.relative(root, contactSheetPath),
        sha256: sha256(contactSheetPath),
        frames: frameRecords,
      },
    },
    motionEvidence: {
      phases,
      cursorFollow: {
        compilerContract: followProgram.contract,
        integration: followProgram.policy.integration,
        retargetCount: followProgram.performance.moves,
        cameraTravel: followCameraTravel,
        cameraProgramSha256: followProgram.cameraProgramSha256,
      },
      zoomAndRestore: {
        maximumScale,
        returnedWideAt6000Ms: cameraAt(cameraTrack, 6000),
        returnedWideAt11200Ms: cameraAt(cameraTrack, 11200),
      },
      nonlinearEase: {
        curve: "MINIMUM_JERK",
        endpointVelocity: {
          start: derivative(minimumJerk, 0),
          end: derivative(minimumJerk, 1),
        },
        pushVelocity: {
          start: pushStartVelocity,
          middle: pushMidVelocity,
          end: pushEndVelocity,
        },
      },
      dynamicMotionBlur: {
        policy: "VELOCITY_CINEMATIC",
        maximumBlurPx: 2.4,
        movingFrameMaeAgainstNoBlur: movingBlurMae,
        holdFrameMaeAgainstNoBlur: holdBlurMae,
        actualPixelPairPaths: [
          "blur-moving.png",
          "no-blur-moving.png",
          "blur-hold.png",
          "no-blur-hold.png",
        ].map((file) => path.relative(root, path.join(outputRoot, file))),
      },
      resultHoldMs: resultHoldEndMs - pushEndMs,
      finalWideHoldMs: durationMs - finalWideAtMs,
    },
    checks: {
      realSourceBound: true,
      realCursorTelemetryReplayed: true,
      mouseFollowVisible: followProgram.performance.moves > 0,
      zoomInVisible: maximumScale >= 1.37,
      returnToNormalVisible: cameraAt(cameraTrack, 6000).scale === 1,
      targetPanVisible: Math.abs(resultTarget.x - 0.5) > 0.05,
      nonlinearEaseEndpointsStopped: true,
      dynamicBlurPixelProven: movingBlurMae >= 0.08 && holdBlurMae <= 0.01,
      resultHoldAtLeastTwoSeconds: resultHoldEndMs - pushEndMs >= 2000,
      finalWideHoldAtLeastOneSecond: durationMs - finalWideAtMs >= 1000,
      fullDecode: true,
      noBlackSampleFrames: frameRecords.every((row) => row.meanLuma >= 5),
      clickRippleAbsent: scene.screenDirection.clickFeedbackPolicy === "PRESS_ONLY",
    },
    failures,
    boundary: {
      reviewOnly: true,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
      currentAuthorityMutation: false,
    },
  };
  audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
  await fsp.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify(audit, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
