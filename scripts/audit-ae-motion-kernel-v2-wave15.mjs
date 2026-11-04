#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, ".."),
  waveRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1"),
  outputRoot = path.join(root, "work/ae-motion-kernel-v2/wave15"),
  registrationRoot = path.join(waveRoot, "registration-v2"),
  plan = JSON.parse(fs.readFileSync(path.join(waveRoot, "plan.json"), "utf8")),
  batch = JSON.parse(
    fs.readFileSync(path.join(waveRoot, "render-batch.json"), "utf8"),
  ),
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  ffprobe = path.join(root, ".tools/bin/ffprobe"),
  require = createRequire(path.join(root, "apps/studio-next/package.json")),
  sharp = require("sharp"),
  sha = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
fs.mkdirSync(outputRoot, { recursive: true });
if (
  plan.status !== "READY" ||
  plan.items.length !== 15 ||
  batch.status !== "PASS" ||
  batch.sourcePlanSha256 !== plan.planSha256
)
  throw new Error("ae-motion-v2-current-plan-render-required");
const failures = [],
  items = [],
  tiles = [],
  registrations = [];
const label = async (text, file) => {
  const image = await sharp(file)
      .resize(480, 270, { fit: "cover" })
      .png()
      .toBuffer(),
    head = Buffer.from(
      `<svg width="480" height="34"><rect width="480" height="34" fill="#0b1011"/><text x="12" y="22" font-family="monospace" font-size="12" fill="#dfff68">${text}</text></svg>`,
    );
  return sharp({
    create: { width: 480, height: 304, channels: 3, background: "#0b1011" },
  })
    .composite([
      { input: head, left: 0, top: 0 },
      { input: image, left: 0, top: 34 },
    ])
    .png()
    .toBuffer();
};
for (const item of plan.items) {
  const props = JSON.parse(
      fs.readFileSync(path.join(root, item.propsPath), "utf8"),
    ),
    direction = props.scenes[0].screenDirection,
    render = batch.results.find(
      (candidate) => candidate.shotId === item.shotId,
    ),
    video = path.join(root, item.outputPath),
    shotFailures = [];
  if (
    direction.contract !== "A1ScreenActionDirection/v2" ||
    direction.status !== "PASS" ||
    item.directionSha256 !== direction.directionSha256
  )
    shotFailures.push("DIRECTION_V2_BINDING");
  if (direction.cameraPerformance.moveCount > 1)
    shotFailures.push("MOVE_COUNT");
  if (direction.cameraPerformance.maximumScale > 1.18)
    shotFailures.push("MAX_SCALE");
  if (direction.diagnostics.maximumAnchorDriftPx > 0.5)
    shotFailures.push("ANCHOR_DRIFT");
  if (direction.diagnostics.minimumActorVisibleRatio < 0.98)
    shotFailures.push("ACTOR_VISIBILITY");
  if (direction.diagnostics.maximumHoldDriftPx > 0.1)
    shotFailures.push("HOLD_DRIFT");
  if (
    direction.diagnostics.entryVelocityRatio > 0.02 ||
    direction.diagnostics.exitVelocityRatio > 0.02
  )
    shotFailures.push("ENDPOINT_VELOCITY");
  if (
    Math.abs(direction.diagnostics.entryAcceleration) > 1e-9 ||
    Math.abs(direction.diagnostics.exitAcceleration) > 1e-9
  )
    shotFailures.push("ENDPOINT_ACCELERATION");
  if (
    direction.cameraPerformance.automaticWideRestore !== false ||
    direction.cameraPerformance.resultReframe !== false
  )
    shotFailures.push("FORBIDDEN_SECONDARY_CAMERA");
  for (const actor of direction.attentionActors) {
    if (!actor.selector || !/^[a-f0-9]{64}$/u.test(actor.sourceCropSha256))
      shotFailures.push("ACTOR_EVIDENCE_BINDING");
    if (!actor.animationKind)
      shotFailures.push("ACTOR_VISIBLE_MOTION_KIND_REQUIRED");
  }
  if (!direction.motionSignal?.visiblyAnimated && !direction.motionSignal?.staticReason)
    shotFailures.push("STATIC_REASON_REQUIRED");
  if (
    !render ||
    !fs.existsSync(video) ||
    sha(video) !== render.outputSha256 ||
    render.propsSha256 !== item.propsSha256
  )
    shotFailures.push("RENDER_BINDING");
  let probe = null;
  if (fs.existsSync(video)) {
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
      shotFailures.push("MEDIA_CONTRACT");
    const moments = [
      Math.min(
        direction.durationMs - 120,
        direction.cameraPerformance.motionWindow?.endMs ??
          Math.round(direction.durationMs * 0.45),
      ),
      Math.max(0, direction.durationMs - 120),
    ];
    for (const [index, ms] of moments.entries()) {
      const frameFile = path.join(
        outputRoot,
        `${item.shotId.toLowerCase()}-${index ? "final" : "action"}.png`,
      );
      execFileSync(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        (ms / 1000).toFixed(3),
        "-i",
        video,
        "-frames:v",
        "1",
        frameFile,
      ]);
      tiles.push(
        await label(
          `${item.shotId} · ${index ? "FINAL HOLD" : direction.cameraPerformance.mode}`,
          frameFile,
        ),
      );
    }
  }
  for (const actor of direction.attentionActors) {
    const slug = item.shotId.toLowerCase(),
      sourceName = fs
        .readdirSync(registrationRoot)
        .find(
          (name) =>
            name.startsWith(`${slug}-${actor.id}-`) &&
            name.endsWith("-source.png"),
        ),
      cropName = fs
        .readdirSync(registrationRoot)
        .find(
          (name) =>
            name.startsWith(`${slug}-${actor.id}-`) &&
            name.endsWith("-crop.png"),
        ),
      finalFile = path.join(outputRoot, `${slug}-${actor.id}-registered.png`);
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
      finalFile,
    ]);
    if (
      !sourceName ||
      !cropName ||
      sha(path.join(registrationRoot, cropName)) !== actor.sourceCropSha256
    )
      shotFailures.push("ACTOR_SOURCE_CROP_SHA");
    const parts = await Promise.all(
        [
          ["SOURCE", path.join(registrationRoot, sourceName)],
          [`TARGET · ${actor.selector}`, path.join(registrationRoot, cropName)],
          ["FINAL", finalFile],
        ].map(([text, file]) => label(`${item.shotId} · ${text}`, file)),
      ),
      triptych = path.join(outputRoot, `${slug}-${actor.id}-triptych.png`);
    await sharp({
      create: { width: 1440, height: 304, channels: 3, background: "#070a0b" },
    })
      .composite(
        parts.map((input, index) => ({ input, left: index * 480, top: 0 })),
      )
      .png()
      .toFile(triptych);
    registrations.push({
      shotId: item.shotId,
      actorId: actor.id,
      selector: actor.selector,
      evidenceAtMs: actor.evidenceAtMs,
      sourceCropSha256: actor.sourceCropSha256,
      minimumVisibleRatio: direction.diagnostics.minimumActorVisibleRatio,
      triptych: { path: path.relative(root, triptych), sha256: sha(triptych) },
    });
  }
  failures.push(...shotFailures.map((failure) => `${item.shotId}:${failure}`));
  items.push({
    shotId: item.shotId,
    status: shotFailures.length ? "FAIL" : "PASS",
    directionSha256: direction.directionSha256,
    camera: direction.cameraPerformance,
    transition: direction.transition,
    diagnostics: direction.diagnostics,
    render: render
      ? {
          path: item.outputPath,
          sha256: render.outputSha256,
          durationMs: probe
            ? Math.round(Number(probe.format.duration) * 1000)
            : null,
        }
      : null,
    failures: shotFailures,
  });
}
const contact = path.join(outputRoot, "wave15-v2-contact-sheet.png");
await sharp({
  create: {
    width: 1920,
    height: Math.ceil(tiles.length / 4) * 304,
    channels: 3,
    background: "#070a0b",
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: (index % 4) * 480,
      top: Math.floor(index / 4) * 304,
    })),
  )
  .png()
  .toFile(contact);
const counts = {
  moving: items.filter((item) => item.camera.moveCount === 1).length,
  fullFrame: items.filter((item) => item.camera.moveCount === 0).length,
  actors: registrations.length,
  lumaFade: items.filter((item) => item.transition.family === "LUMA_FADE")
    .length,
  sharedDissolve: items.filter(
    (item) => item.transition.family === "SHARED_ANCHOR_DISSOLVE",
  ).length,
};
const visiblyAnimatedCount = plan.items.filter((item) => {
  const props = JSON.parse(fs.readFileSync(path.join(root, item.propsPath), "utf8"));
  return props.scenes[0].screenDirection.motionSignal?.visiblyAnimated === true;
}).length;
counts.visiblyAnimated = visiblyAnimatedCount;
if (visiblyAnimatedCount < 9) failures.push("WAVE_VISIBLE_MOTION_SIGNAL_BELOW_9");
const body = {
  contract: "A1AeMotionKernelWave15Audit/v2",
  status: failures.length ? "FAIL" : "PASS",
  sourcePlanSha256: plan.planSha256,
  sourceRenderBatchSha256: batch.batchSha256,
  shotCount: items.length,
  requirements: {
    screenDirection: "A1ScreenActionDirection/v2",
    maximumMoves: 1,
    maximumScale: 1.18,
    maximumAnchorDriftPx: 0.5,
    minimumActorVisibleRatio: 0.98,
    maximumHoldDriftPx: 0.1,
    maximumEndpointVelocityRatio: 0.02,
    endpointAcceleration: 0,
    automaticWideRestore: false,
    resultReframe: false,
    minimumVisiblyAnimatedShots: 9,
  },
  counts,
  items,
  registrations,
  contactSheet: { path: path.relative(root, contact), sha256: sha(contact) },
  cavalryParity: JSON.parse(
    fs.readFileSync(
      path.join(root, "work/ae-motion-kernel-v2/cavalry-remotion-parity.json"),
      "utf8",
    ),
  ),
  boundary: {
    reviewOnly: true,
    userVisualApproval: "NOT_APPROVED",
    productionAdmission: false,
    fullMotionSpecAllowed: false,
  },
  failures,
};
body.auditSha256 = crypto
  .createHash("sha256")
  .update(JSON.stringify(body))
  .digest("hex");
fs.writeFileSync(
  path.join(outputRoot, "audit-report.json"),
  `${JSON.stringify(body, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      status: body.status,
      shotCount: body.shotCount,
      counts,
      failures,
      contactSheet: body.contactSheet,
      auditSha256: body.auditSha256,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
