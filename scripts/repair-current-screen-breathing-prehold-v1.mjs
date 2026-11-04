#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || "")))
  throw new Error("breathing-prehold-cas-required");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (workspace.workspaceSha256 !== expected)
  throw new Error(`breathing-prehold-cas:${workspace.workspaceSha256}`);
if (
  workspace.production.authority?.nextAction?.id !==
  "review-current-whole-film-540p"
)
  throw new Error("breathing-prehold-review-authority-required");
const output = path.join(publicRoot, phase, "current-full-film-540p-v1"),
  reportFile = path.join(output, "report.json"),
  report = JSON.parse(fs.readFileSync(reportFile, "utf8")),
  resets = report.screenRunBreathing?.resets || [];
if (resets.length !== 3)
  throw new Error("breathing-prehold-three-resets-required");
const source = path.join(
    publicRoot,
    report.video.publicUrl.replace(/^\//u, ""),
  ),
  presenter = path.join(
    publicRoot,
    phase,
    "imported-film-media-v1/presenter-video-093bc1315163.mov",
  ),
  ledger = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        phase,
        "current-visual-decision-ledger-v1/ledger.json",
      ),
      "utf8",
    ),
  ),
  entryByShot = new Map(ledger.entries.map((item) => [item.shotId, item])),
  inputs = ["-i", source, "-i", presenter];
for (const reset of resets) {
  const entry = entryByShot.get(reset.afterShotId);
  inputs.push(
    "-loop",
    "1",
    "-t",
    String(report.totalDurationSec),
    "-i",
    path.join(publicRoot, entry.selectedFrame.publicUrl.replace(/^\//u, "")),
  );
}
let filter = "[0:v]setpts=PTS-STARTPTS[base]",
  last = "base";
resets.forEach((reset, index) => {
  const holdStart = (reset.startMs / 1000 - 0.55).toFixed(3),
    holdEnd = (reset.startMs / 1000).toFixed(3),
    next = `hold${index}`;
  filter += `;[${index + 2}:v]format=rgba[holdimg${index}];[${last}][holdimg${index}]overlay=0:0:enable='between(t,${holdStart},${holdEnd})'[${next}]`;
  last = next;
});
resets.forEach((reset, index) => {
  const start = (reset.startMs / 1000).toFixed(3),
    end = (reset.endMs / 1000).toFixed(3),
    next = `resetstage${index}`;
  filter += `;[1:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS+${start}/TB,scale=960:540,fps=60[reset${index}];[${last}][reset${index}]overlay=0:0:enable='between(t,${start},${end})'[${next}]`;
  last = next;
});
filter += `;[${last}]format=yuv420p[out]`;
const video = path.join(
    output,
    "current-full-film-review-breathing-prehold-960x540.mp4",
  ),
  run = spawnSync(
    ffmpeg,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-preset",
      "veryfast",
      "-c:a",
      "copy",
      "-t",
      String(report.totalDurationSec),
      video,
    ],
    { encoding: "utf8", maxBuffer: 500000 },
  );
if (run.status !== 0)
  throw new Error(`breathing-prehold-render-failed:${run.stderr.slice(-2500)}`);
const sha = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  probe = JSON.parse(
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
  repairedAt = new Date().toISOString(),
  nextReport = {
    ...report,
    video: {
      publicUrl: `/${phase}/current-full-film-540p-v1/${path.basename(video)}`,
      sha256: sha(video),
      bytes: fs.statSync(video).size,
    },
    probe,
    screenRunBreathing: {
      ...report.screenRunBreathing,
      approvedPreHoldMs: 550,
      preHoldShotIds: resets.map((item) => item.afterShotId),
      repairedAt,
    },
    renderedAt: repairedAt,
  };
fs.writeFileSync(reportFile, `${JSON.stringify(nextReport, null, 2)}\n`);
const committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== workspace.workspaceSha256)
    throw new Error(`breathing-prehold-persist-cas:${current.workspaceSha256}`);
  let next = structuredClone(current);
  next.production.release.review540p = {
    ...next.production.release.review540p,
    publicUrl: nextReport.video.publicUrl,
    sha256: nextReport.video.sha256,
    renderedAt: repairedAt,
    screenRunBreathing: {
      ...next.production.release.review540p.screenRunBreathing,
      resetCount: resets.length,
      approvedPreHoldMs: 550,
      preHoldShotIds: resets.map((item) => item.afterShotId),
    },
  };
  next = assertEditorialAssetWorkbench(
    recalculateEditorialAssetWorkbench(next, repairedAt),
  );
  const event = createProductionEvent({
    workspace: current,
    action: "repair-current-screen-breathing-prehold",
    targetId: nextReport.video.sha256,
    payload: {
      resetCount: resets.length,
      approvedPreHoldMs: 550,
      videoSha256: nextReport.video.sha256,
    },
    now: repairedAt,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: { "current-full-film-540p-v1/report.json": nextReport },
  });
});
console.log(
  JSON.stringify(
    {
      status: "PASS",
      approvedPreHoldMs: 550,
      shotIds: resets.map((item) => item.afterShotId),
      video: nextReport.video,
      probe,
      workspaceSha256After: committed.workspaceSha256,
    },
    null,
    2,
  ),
);
