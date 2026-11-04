#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import { createProductionEvent } from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  appRoot = path.join(root, "apps/studio-next"),
  publicRoot = path.join(appRoot, "public"),
  phase = "generated/system-line/editorial-asset-workbench-v1",
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  ffprobe = path.join(root, ".tools/bin/ffprobe"),
  reviewFps = 60;
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || "")))
  throw new Error("full-film-540p-render-cas-required");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (workspace.workspaceSha256 !== expected)
  throw new Error(`full-film-540p-render-cas:${workspace.workspaceSha256}`);
if (
  ![
    "render-current-whole-film-540p",
    "review-current-whole-film-540p",
  ].includes(workspace.production.authority?.nextAction?.id)
)
  throw new Error("full-film-540p-render-authority-required");
const require = createRequire(path.join(appRoot, "package.json"));
const sharp = require("sharp");
const plan = JSON.parse(
    fs.readFileSync(
      path.join(publicRoot, phase, "full-film-motion-spec-plan-v2/report.json"),
      "utf8",
    ),
  ),
  direction = JSON.parse(
    fs.readFileSync(
      path.join(root, "work/first-episode-motion-direction-v1/plan.json"),
      "utf8",
    ),
  ),
  screenPlans = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        phase,
        "continuous-screen-evidence-v2/shot-performance-plans.json",
      ),
      "utf8",
    ),
  ),
  screenRunBreathing = JSON.parse(
    fs.readFileSync(
      path.join(publicRoot, phase, "screen-run-breathing-plan-v1/plan.json"),
      "utf8",
    ),
  );
if (
  plan.status !== "READY" ||
  plan.readyShotIds.length !== 34 ||
  plan.results.some((item) => item.status !== "READY")
)
  throw new Error("full-film-540p-ready-specs-required");
const directionByShot = new Map(
    direction.scenes.map((item) => [item.shotId, item]),
  ),
  screenPlanByShot = new Map(
    screenPlans.shots.map((item) => [item.shotId, item]),
  );
const presenterUrl = `/${phase}/imported-film-media-v1/presenter-video-093bc1315163.mov`,
  presenter = path.join(publicRoot, presenterUrl.replace(/^\//u, "")),
  clickSound = path.join(
    publicRoot,
    "generated/system-line/ui-sfx/click-soft.wav",
  );
const shaFile = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "a1-current-full-film-540p-"),
  ),
  clips = [],
  reviewFrames = [];
let totalDuration = 0;
const ordered = plan.results.sort((a, b) => a.spec.order - b.spec.order),
  timelineEndMs = Math.max(
    ...direction.scenes.map((scene) => scene.timeRange.endMs),
  );
for (let index = 0; index < ordered.length; index++) {
  const item = ordered[index],
    spec = item.spec,
    scene = directionByShot.get(spec.shotId),
    nextScene =
      index + 1 < ordered.length
        ? directionByShot.get(ordered[index + 1].spec.shotId)
        : null,
    duration = Math.max(
      0.5,
      ((nextScene?.timeRange.startMs ?? timelineEndMs) -
        scene.timeRange.startMs) /
        1000,
    ),
    primary = spec.assets.find(
      (asset) => asset.assetId === spec.renderPolicy.primarySourceAssetId,
    ),
    approved = spec.assets.find(
      (asset) => asset.sha256 === spec.sourceAuthority.approvedStaticSha256,
    ),
    primaryFile = path.join(publicRoot, primary.publicUrl.replace(/^\//u, "")),
    approvedFile = path.join(
      publicRoot,
      approved.publicUrl.replace(/^\//u, ""),
    );
  if (!fs.existsSync(primaryFile) || shaFile(primaryFile) !== primary.sha256)
    throw new Error(`full-film-primary-invalid:${spec.shotId}`);
  if (!fs.existsSync(approvedFile) || shaFile(approvedFile) !== approved.sha256)
    throw new Error(`full-film-approved-invalid:${spec.shotId}`);
  const clip = path.join(
      temp,
      `${String(spec.order).padStart(2, "0")}-${spec.shotId}.mp4`,
    ),
    approvedBackgroundScreen = primary.kind === "VERIFIED_SCREEN_SOURCE" && primary.userVisualApproval === "APPROVED_BY_USER",
    fadeStart = Math.max(0, duration - (approvedBackgroundScreen ? 0.8 : 0.7)).toFixed(3),
    fadeDuration = approvedBackgroundScreen ? "0.10" : "0.25",
    pad = Math.max(0, duration).toFixed(3);
  const isPresenterSource = primary.kind === "VERIFIED_PRESENTER_VIDEO";
  const inputArgs = isPresenterSource
    ? ["-ss", (scene.timeRange.startMs / 1000).toFixed(3), "-i", primaryFile]
    : ["-i", primaryFile];
  const filter = `[0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2:black,fps=${reviewFps},tpad=stop_mode=clone:stop_duration=${pad}[base];[1:v]format=rgba,fade=t=in:st=${fadeStart}:d=${fadeDuration}:alpha=1[final];[base][final]overlay=0:0,fps=${reviewFps}[out]`;
  const args = [
    "-y",
    ...inputArgs,
    "-loop",
    "1",
    "-t",
    String(duration),
    "-i",
    approvedFile,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-an",
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "22",
    "-preset",
    "veryfast",
    clip,
  ];
  const run = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 300000 });
  if (run.status !== 0)
    throw new Error(
      `full-film-shot-render-failed:${spec.shotId}:${run.stderr.slice(-1800)}`,
    );
  const frame = path.join(temp, `${spec.shotId}-review.png`),
    grab = spawnSync(
      ffmpeg,
      [
        "-y",
        "-ss",
        String(Math.min(duration * 0.55, duration - 0.1)),
        "-i",
        clip,
        "-frames:v",
        "1",
        frame,
      ],
      { encoding: "utf8", maxBuffer: 100000 },
    );
  if (grab.status !== 0)
    throw new Error(`full-film-review-frame-failed:${spec.shotId}`);
  clips.push({
    shotId: spec.shotId,
    order: spec.order,
    startMs: scene.timeRange.startMs,
    duration,
    route: spec.productionRoute,
    file: clip,
    primarySourceSha256: primary.sha256,
    approvedStaticSha256: approved.sha256,
    cameraLockSha256: spec.cameraLockSha256,
  });
  reviewFrames.push({
    shotId: spec.shotId,
    order: spec.order,
    route: spec.productionRoute,
    file: frame,
  });
  totalDuration += duration;
}
const concatFile = path.join(temp, "concat.txt");
fs.writeFileSync(
  concatFile,
  clips
    .map((item) => `file '${item.file.replaceAll("'", "'\\''")}'`)
    .join("\n") + "\n",
);
const output = path.join(publicRoot, phase, "current-full-film-540p-v1");
fs.mkdirSync(output, { recursive: true });
const silent = path.join(temp, "full-silent.mp4"),
  video = path.join(output, "current-full-film-review-960x540.mp4");
let run = spawnSync(
  ffmpeg,
  ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", silent],
  { encoding: "utf8", maxBuffer: 200000 },
);
if (run.status !== 0)
  throw new Error(`full-film-concat-failed:${run.stderr.slice(-1800)}`);
const clickTimes = direction.scenes.flatMap((scene) =>
  (screenPlanByShot.get(scene.shotId)?.pointerTrack?.clicks || []).map(
    (click) => scene.timeRange.startMs + click.atMs,
  ),
);
const audioInputs = [
  "-i",
  silent,
  "-i",
  presenter,
  ...clickTimes.flatMap(() => ["-i", clickSound]),
];
let audioFilter = "[1:a]aresample=48000[voice]",
  audioLabels = ["voice"];
clickTimes.forEach((atMs, index) => {
  audioFilter += `;[${index + 2}:a]volume=.28,adelay=${Math.round(atMs)}|${Math.round(atMs)}[click${index}]`;
  audioLabels.push(`click${index}`);
});
audioFilter += `;${audioLabels.map((label) => `[${label}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`;
run = spawnSync(
  ffmpeg,
  [
    "-y",
    ...audioInputs,
    "-filter_complex",
    audioFilter,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-t",
    String(totalDuration),
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-shortest",
    video,
  ],
  { encoding: "utf8", maxBuffer: 300000 },
);
if (run.status !== 0)
  throw new Error(`full-film-audio-mux-failed:${run.stderr.slice(-1800)}`);
const tileWidth = 320,
  tileHeight = 180,
  labelHeight = 28,
  columns = 4,
  tiles = [];
for (const item of reviewFrames) {
  const label = Buffer.from(
    `<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="8" y="19" fill="#dfff68" font-family="monospace" font-size="11">${item.shotId} · ${item.route}</text></svg>`,
  );
  tiles.push(
    await sharp(item.file)
      .resize(tileWidth, tileHeight)
      .extend({
        top: labelHeight,
        bottom: 0,
        left: 0,
        right: 0,
        background: "#0c0f13",
      })
      .composite([{ input: label, top: 0, left: 0 }])
      .png()
      .toBuffer(),
  );
}
const contact = path.join(output, "current-full-film-contact-sheet.png");
await sharp({
  create: {
    width: columns * tileWidth,
    height: Math.ceil(tiles.length / columns) * (tileHeight + labelHeight),
    channels: 4,
    background: "#0c0f13",
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * (tileHeight + labelHeight),
    })),
  )
  .png()
  .toFile(contact);
const probe = JSON.parse(
    spawnSync(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name,width,height,avg_frame_rate:format=duration,size",
        "-of",
        "json",
        video,
      ],
      { encoding: "utf8" },
    ).stdout,
  ),
  renderedAt = new Date().toISOString();
const report = {
  contract: "A1CurrentFullFilm540pRender/v1",
  status: "READY_FOR_USER_WHOLE_FILM_REVIEW",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceMotionSpecPlanSha256: crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(
        path.join(
          publicRoot,
          phase,
          "full-film-motion-spec-plan-v2/report.json",
        ),
      ),
    )
    .digest("hex"),
  sourceVisualLedgerSha256: plan.sourceVisualLedgerSha256,
  screenRunBreathing: {
    ...screenRunBreathing,
    resets: screenRunBreathing.resets.filter((reset) => !clips.some((clip) => clip.shotId === reset.afterShotId && plan.results.find((item) => item.shotId === clip.shotId)?.spec.assets.some((asset) => asset.assetId === plan.results.find((item) => item.shotId === clip.shotId)?.spec.renderPolicy.primarySourceAssetId && asset.userVisualApproval === "APPROVED_BY_USER"))),
    resetCount: screenRunBreathing.resets.filter((reset) => !clips.some((clip) => clip.shotId === reset.afterShotId && plan.results.find((item) => item.shotId === clip.shotId)?.spec.assets.some((asset) => asset.assetId === plan.results.find((item) => item.shotId === clip.shotId)?.spec.renderPolicy.primarySourceAssetId && asset.userVisualApproval === "APPROVED_BY_USER"))).length,
    approvedPreHoldMs: 700,
    preHoldShotIds: clips.filter((clip) => plan.results.find((item) => item.shotId === clip.shotId)?.spec.assets.some((asset) => asset.assetId === plan.results.find((item) => item.shotId === clip.shotId)?.spec.renderPolicy.primarySourceAssetId && asset.userVisualApproval === "APPROVED_BY_USER")).map((clip) => clip.shotId),
    suppressedLegacyPresenterResetShotIds: screenRunBreathing.resets.filter((reset) => clips.some((clip) => clip.shotId === reset.afterShotId && plan.results.find((item) => item.shotId === clip.shotId)?.spec.assets.some((asset) => asset.assetId === plan.results.find((item) => item.shotId === clip.shotId)?.spec.renderPolicy.primarySourceAssetId && asset.userVisualApproval === "APPROVED_BY_USER"))).map((reset) => reset.afterShotId),
  },
  shotCount: clips.length,
  totalDurationSec: Number(totalDuration.toFixed(3)),
  clips: clips.map(({ file, ...item }) => item),
  video: {
    publicUrl: `/${phase}/current-full-film-540p-v1/current-full-film-review-960x540.mp4`,
    sha256: shaFile(video),
    bytes: fs.statSync(video).size,
  },
  contactSheet: {
    publicUrl: `/${phase}/current-full-film-540p-v1/current-full-film-contact-sheet.png`,
    sha256: shaFile(contact),
  },
  probe,
  boundaries: {
    reviewOnly: true,
    final1080pAllowed: false,
    resolveWritePerformed: false,
    userVisualApproval: "PENDING",
  },
  renderedAt,
};
fs.writeFileSync(
  path.join(output, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
const committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== workspace.workspaceSha256)
    throw new Error(`full-film-540p-persist-cas:${current.workspaceSha256}`);
  let next = structuredClone(current);
  next.production.motion = {
    ...next.production.motion,
    status: "full-film-motion-specs-ready",
    fullMotionAllowed: true,
  };
  next.production.release = {
    ...next.production.release,
    review540p: {
      status: report.status,
      publicUrl: report.video.publicUrl,
      sha256: report.video.sha256,
      reportPublicUrl: `/${phase}/current-full-film-540p-v1/report.json`,
      contactSheet: report.contactSheet,
      approvedAt: null,
      renderedAt,
      durationMs: Math.round(report.totalDurationSec * 1000),
      width: 960,
      height: 540,
      screenRunBreathing: {
        resetCount: report.screenRunBreathing?.resets?.length || 0,
        approvedPreHoldMs:
          report.screenRunBreathing?.approvedPreHoldMs || null,
        preHoldShotIds: report.screenRunBreathing?.preHoldShotIds || [],
      },
    },
  };
  next = assertEditorialAssetWorkbench(
    recalculateEditorialAssetWorkbench(next, renderedAt),
  );
  if (
    next.production.authority?.nextAction?.id !==
    "review-current-whole-film-540p"
  )
    throw new Error(
      `full-film-540p-next-action-invalid:${next.production.authority?.nextAction?.id}`,
    );
  const event = createProductionEvent({
    workspace: current,
    action: "render-current-full-film-from-motion-specs",
    targetId: report.sourceVisualLedgerSha256,
    payload: {
      shotCount: report.shotCount,
      videoSha256: report.video.sha256,
      contactSheetSha256: report.contactSheet.sha256,
      totalDurationSec: report.totalDurationSec,
    },
    now: renderedAt,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: { "current-full-film-540p-v1/report.json": report },
  });
});
console.log(
  JSON.stringify(
    {
      status: report.status,
      shotCount: report.shotCount,
      totalDurationSec: report.totalDurationSec,
      video: report.video,
      contactSheet: report.contactSheet,
      probe: report.probe,
      workspaceSha256After: committed.workspaceSha256,
    },
    null,
    2,
  ),
);
