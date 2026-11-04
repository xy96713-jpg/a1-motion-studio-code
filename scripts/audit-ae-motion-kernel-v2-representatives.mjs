#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, ".."),
  outputRoot = path.join(root, "work/ae-motion-kernel-v2"),
  representativeRoot = path.join(outputRoot, "representative"),
  registrationRoot = path.join(
    root,
    "work/remotion-screen-coverage-wave15-v1/registration-v2",
  ),
  plan = JSON.parse(
    fs.readFileSync(
      path.join(root, "work/remotion-screen-coverage-wave15-v1/plan.json"),
      "utf8",
    ),
  ),
  ids = ["ED-04", "ED-21", "ED-24", "ED-06", "ED-02"],
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  ffprobe = path.join(root, ".tools/bin/ffprobe"),
  require = createRequire(path.join(root, "apps/studio-next/package.json")),
  sharp = require("sharp"),
  sha = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.mkdirSync(outputRoot, { recursive: true });
const failures = [],
  items = [],
  tiles = [];
const label = async (text, image) => {
  const imageBuffer = await sharp(image)
      .resize(640, 360, { fit: "cover" })
      .png()
      .toBuffer(),
    head = Buffer.from(
      `<svg width="640" height="42"><rect width="640" height="42" fill="#0b1011"/><text x="14" y="27" font-family="monospace" font-size="15" fill="#dfff68">${text}</text></svg>`,
    );
  return sharp({
    create: { width: 640, height: 402, channels: 3, background: "#0b1011" },
  })
    .composite([
      { input: head, left: 0, top: 0 },
      { input: imageBuffer, left: 0, top: 42 },
    ])
    .png()
    .toBuffer();
};
for (const id of ids) {
  const item = plan.items.find((candidate) => candidate.shotId === id),
    props = JSON.parse(
      fs.readFileSync(path.join(root, item.propsPath), "utf8"),
    ),
    direction = props.scenes[0].screenDirection,
    video = path.join(representativeRoot, `${id.toLowerCase()}-v2.mp4`),
    itemFailures = [];
  if (
    direction.contract !== "A1ScreenActionDirection/v2" ||
    direction.status !== "PASS"
  )
    itemFailures.push("V2_DIRECTION_REQUIRED");
  if (direction.cameraPerformance.moveCount > 1)
    itemFailures.push("MOVE_BUDGET");
  if (direction.cameraPerformance.maximumScale > 1.18)
    itemFailures.push("SCALE_BUDGET");
  if (direction.diagnostics.maximumAnchorDriftPx > 0.5)
    itemFailures.push("ANCHOR_DRIFT");
  if (direction.diagnostics.minimumActorVisibleRatio < 0.98)
    itemFailures.push("ACTOR_VISIBILITY");
  if (direction.diagnostics.maximumHoldDriftPx > 0.1)
    itemFailures.push("HOLD_DRIFT");
  if (
    direction.diagnostics.entryVelocityRatio > 0.02 ||
    direction.diagnostics.exitVelocityRatio > 0.02
  )
    itemFailures.push("ENDPOINT_VELOCITY");
  if (
    Math.abs(direction.diagnostics.entryAcceleration) > 1e-9 ||
    Math.abs(direction.diagnostics.exitAcceleration) > 1e-9
  )
    itemFailures.push("ENDPOINT_ACCELERATION");
  if (!fs.existsSync(video)) itemFailures.push("RENDER_MISSING");
  let probe = null;
  if (fs.existsSync(video)) {
    probe = JSON.parse(
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
          video,
        ],
        { encoding: "utf8" },
      ),
    );
    const stream = probe.streams.find((entry) => entry.codec_type === "video");
    if (
      stream?.width !== 960 ||
      stream?.height !== 540 ||
      stream?.r_frame_rate !== "60/1"
    )
      itemFailures.push("MEDIA_CONTRACT");
    execFileSync(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      video,
      "-f",
      "null",
      "-",
    ]);
    const sampleMs =
        direction.attentionActors[0]?.evidenceAtMs ??
        (direction.cameraPerformance.motionWindow
          ? Math.round(
              (direction.cameraPerformance.motionWindow.startMs +
                direction.cameraPerformance.motionWindow.endMs) /
                2,
            )
          : Math.round(direction.durationMs / 2)),
      frameFile = path.join(outputRoot, `${id.toLowerCase()}-audit-frame.png`);
    execFileSync(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      (sampleMs / 1000).toFixed(3),
      "-i",
      video,
      "-frames:v",
      "1",
      frameFile,
    ]);
    tiles.push(
      await label(
        `${id} · ${direction.cameraPerformance.mode} · ${direction.cameraPerformance.maximumScale.toFixed(2)}x`,
        frameFile,
      ),
    );
  }
  failures.push(...itemFailures.map((failure) => `${id}:${failure}`));
  items.push({
    shotId: id,
    status: itemFailures.length ? "FAIL" : "PASS",
    directionSha256: direction.directionSha256,
    camera: direction.cameraPerformance,
    motionSignal: direction.motionSignal,
    attentionActorKinds: direction.attentionActors.map(
      (actor) => actor.animationKind,
    ),
    diagnostics: direction.diagnostics,
    render: fs.existsSync(video)
      ? {
          path: path.relative(root, video),
          sha256: sha(video),
          durationMs: Math.round(Number(probe.format.duration) * 1000),
        }
      : null,
    failures: itemFailures,
  });
}
const contact = path.join(outputRoot, "representative-five-contact-sheet.png");
await sharp({
  create: {
    width: 1280,
    height: Math.ceil(tiles.length / 2) * 402,
    channels: 3,
    background: "#070a0b",
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: (index % 2) * 640,
      top: Math.floor(index / 2) * 402,
    })),
  )
  .png()
  .toFile(contact);
const registration = [];
for (const id of ["ED-04", "ED-21"]) {
  const item = plan.items.find((candidate) => candidate.shotId === id),
    props = JSON.parse(
      fs.readFileSync(path.join(root, item.propsPath), "utf8"),
    ),
    direction = props.scenes[0].screenDirection,
    actor = direction.attentionActors[0],
    slug = id.toLowerCase(),
    source = fs
      .readdirSync(registrationRoot)
      .find(
        (name) => name.startsWith(`${slug}-`) && name.endsWith("-source.png"),
      ),
    crop = fs
      .readdirSync(registrationRoot)
      .find(
        (name) => name.startsWith(`${slug}-`) && name.endsWith("-crop.png"),
      ),
    final = path.join(outputRoot, `${slug}-registration-final.png`),
    video = path.join(representativeRoot, `${slug}-v2.mp4`);
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    (actor.evidenceAtMs / 1000).toFixed(3),
    "-i",
    video,
    "-frames:v",
    "1",
    final,
  ]);
  if (
    !source ||
    !crop ||
    sha(path.join(registrationRoot, crop)) !== actor.sourceCropSha256
  )
    failures.push(`${id}:SOURCE_CROP_BINDING`);
  const triptych = path.join(outputRoot, `${slug}-registration-triptych.png`),
    parts = await Promise.all(
      [
        ["SOURCE FRAME", path.join(registrationRoot, source)],
        [`TARGET CROP · ${actor.selector}`, path.join(registrationRoot, crop)],
        ["FINAL PROJECTED PIXELS", final],
      ].map(([text, file]) => label(`${id} · ${text}`, file)),
    );
  await sharp({
    create: { width: 1920, height: 402, channels: 3, background: "#070a0b" },
  })
    .composite(
      parts.map((input, index) => ({ input, left: index * 640, top: 0 })),
    )
    .png()
    .toFile(triptych);
  registration.push({
    shotId: id,
    selector: actor.selector,
    evidenceAtMs: actor.evidenceAtMs,
    sourceCropSha256: actor.sourceCropSha256,
    triptych: { path: path.relative(root, triptych), sha256: sha(triptych) },
    minimumVisibleRatio: direction.diagnostics.minimumActorVisibleRatio,
  });
}
const curveItems = items.filter((item) => item.camera.moveCount === 1);
const graphWidth = 1200,
  graphHeight = 320,
  paths = curveItems
    .map((item, index) => {
      const props = JSON.parse(
          fs.readFileSync(
            path.join(
              root,
              plan.items.find((candidate) => candidate.shotId === item.shotId)
                .propsPath,
            ),
            "utf8",
          ),
        ),
        samples = props.scenes[0].screenDirection.samples,
        window = item.camera.motionWindow,
        windowSamples = samples.filter(
          (sample) =>
            sample.atMs >= window.startMs && sample.atMs <= window.endMs,
        ),
        points = windowSamples
          .map(
            (sample, pointIndex) =>
              `${80 + (pointIndex / Math.max(1, windowSamples.length - 1)) * 1040},${260 - ((sample.camera.scale - 1) / 0.18) * 190}`,
          )
          .join(" ");
      return `<polyline points="${points}" fill="none" stroke="${["#dfff68", "#79aab0", "#f3a35c"][index % 3]}" stroke-width="4"/><text x="80" y="${40 + index * 28}" fill="${["#dfff68", "#79aab0", "#f3a35c"][index % 3]}" font-family="monospace" font-size="18">${item.shotId} · ${window.durationMs}ms · minimum jerk / log scale</text>`;
    })
    .join("");
const curveSvg = Buffer.from(
    `<svg width="${graphWidth}" height="${graphHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b1011"/><line x1="80" y1="260" x2="1120" y2="260" stroke="#5f6a67"/><line x1="80" y1="70" x2="80" y2="260" stroke="#5f6a67"/>${paths}</svg>`,
  ),
  curveBoard = path.join(outputRoot, "curve-calibration-board.png");
await sharp(curveSvg).png().toFile(curveBoard);
const cavalryReceiptPath = path.join(outputRoot, "cavalry-receipt.json");
const cavalryScenePath = path.join(outputRoot, "cavalry-calibration-scene.jpeg");
const cavalryReceipt = fs.existsSync(cavalryReceiptPath)
  ? JSON.parse(fs.readFileSync(cavalryReceiptPath, "utf8"))
  : null;
if (cavalryReceipt?.status !== "EXECUTED")
  failures.push("CAVALRY_CALIBRATION_NOT_EXECUTED");
if (!fs.existsSync(cavalryScenePath))
  failures.push("CAVALRY_CALIBRATION_SCENE_PROOF_MISSING");
const visiblyAnimatedCount = items.filter(
  (item) => item.motionSignal?.visiblyAnimated === true,
).length;
if (visiblyAnimatedCount < 4)
  failures.push("REPRESENTATIVE_VISIBLE_MOTION_BELOW_4_OF_5");
if (!items.some((item) => item.attentionActorKinds.includes("CIRCLE_STROKE_DRAW")))
  failures.push("CIRCLE_STROKE_DRAW_CALIBRATION_REQUIRED");
if (!items.some((item) => item.attentionActorKinds.includes("FOCUS_FEATHER_EXPANSION")))
  failures.push("FOCUS_FEATHER_EXPANSION_CALIBRATION_REQUIRED");
const body = {
  contract: "A1AeMotionKernelRepresentativeAudit/v2",
  status: failures.length ? "FAIL" : "PASS",
  sourcePlanSha256: plan.planSha256,
  representativeShotIds: ids,
  requirements: {
    screenDirectionContract: "A1ScreenActionDirection/v2",
    maximumMoves: 1,
    maximumScale: 1.18,
    maximumAnchorDriftPx: 0.5,
    minimumActorVisibleRatio: 0.98,
    maximumHoldDriftPx: 0.1,
    maximumEndpointVelocityRatio: 0.02,
    endpointAcceleration: 0,
    minimumVisiblyAnimatedShots: 4,
    requiredActorMotionKinds: [
      "CIRCLE_STROKE_DRAW",
      "FOCUS_FEATHER_EXPANSION",
    ],
  },
  visibleMotionCounts: {
    visiblyAnimated: visiblyAnimatedCount,
    intentionalStatic: items.length - visiblyAnimatedCount,
  },
  items,
  registration,
  curveBoard: {
    path: path.relative(root, curveBoard),
    sha256: sha(curveBoard),
  },
  contactSheet: { path: path.relative(root, contact), sha256: sha(contact) },
  cavalryComparison: {
    status:
      cavalryReceipt?.status === "EXECUTED" && fs.existsSync(cavalryScenePath)
        ? "READY_FOR_PARITY_AUDIT"
        : "BLOCKED",
    required: true,
    receiptSha256: fs.existsSync(cavalryReceiptPath)
      ? sha(cavalryReceiptPath)
      : null,
    sceneProofSha256: fs.existsSync(cavalryScenePath)
      ? sha(cavalryScenePath)
      : null,
  },
  boundary: {
    reviewOnly: true,
    currentAuthorityMutated: false,
    userVisualApproval: "NOT_APPROVED",
    productionAdmission: false,
  },
  failures,
};
body.auditSha256 = crypto
  .createHash("sha256")
  .update(JSON.stringify(body))
  .digest("hex");
fs.writeFileSync(
  path.join(outputRoot, "representative-audit.json"),
  `${JSON.stringify(body, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      status: body.status,
      representativeShotIds: ids,
      failures,
      contactSheet: body.contactSheet,
      curveBoard: body.curveBoard,
      registration: body.registration,
      auditSha256: body.auditSha256,
      cavalryComparison: body.cavalryComparison,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
