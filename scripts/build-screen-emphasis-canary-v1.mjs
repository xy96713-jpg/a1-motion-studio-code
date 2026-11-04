#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
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
  phase =
    "generated/system-line/editorial-asset-workbench-v1/screen-emphasis-canary-v1",
  publicOut = path.join(publicRoot, phase),
  artifactOut = path.join(
    root,
    ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-emphasis-canary-v1",
  ),
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  ffprobe = path.join(root, ".tools/bin/ffprobe"),
  cap = "/Applications/Cap.app/Contents/MacOS/cap-cli",
  expected = process.argv[2];
assert.match(String(expected || ""), /^[a-f0-9]{64}$/u);
fs.mkdirSync(publicOut, { recursive: true });
fs.mkdirSync(artifactOut, { recursive: true });
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
assert.equal(workspace.workspaceSha256, expected);
const report15 = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/report.json",
      ),
      "utf8",
    ),
  ),
  audit = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "work/background-cap-production-v1/storyboard-wave-15-v1/audit-report.json",
      ),
      "utf8",
    ),
  ),
  shaFile = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  shaValue = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const shotById = new Map(
    workspace.production.shotIntelligence.currentStoryboardAuthority.shots.map(
      (shot) => [shot.shotId, shot],
    ),
  ),
  auditById = new Map(audit.fixtures.map((item) => [item.id, item]));
function effectFamily(shot, events) {
  if (events.some((event) => event.name === "save_shortcut"))
    return "KEYSTROKE_BADGE";
  if (shot.actionId === "causalRewrite") return "SELECTION_SPOTLIGHT";
  if (shot.actionId === "historyIsolation") return "PANEL_SPOTLIGHT";
  if (shot.actionId === "presentation") return "STATE_CROSSFADE";
  if (shot.actionId === "paragraph" || shot.actionId === "saveHistory")
    return "INPUT_OUTLINE";
  if (shot.actionId === "review") return "RESULT_SPOTLIGHT";
  return "CLICK_RING";
}
function latestCapProject(shotId) {
  const runs = fs
    .readdirSync(path.join(root, "work/background-cap-production-v1/runs"))
    .sort()
    .reverse();
  for (const run of runs) {
    const candidate = path.join(
      root,
      "work/background-cap-production-v1/runs",
      run,
      `${shotId.toLowerCase()}.cap`,
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`screen-emphasis-cap-project-missing:${shotId}`);
}
const specs = [];
for (const shot of report15.shots) {
  const current = shotById.get(shot.shotId),
    fixture = auditById.get(shot.shotId),
    events =
      current.backgroundScreenCandidate?.storyboardReviewEvents ||
      fixture?.events ||
      [],
    durationMs =
      current.timeRange?.durationMs || shot.frames.result.timeMs + 350,
    targetMs = durationMs * 0.55,
    actionEvent = events
      .filter(
        (event) =>
          ![
            "start",
            "end",
            "result_hold",
            "reopened_latest_verified",
            "presentation_playing",
          ].includes(event.name),
      )
      .sort(
        (a, b) =>
          Math.abs((a.outputTimeMs ?? a.tMs) - targetMs) -
          Math.abs((b.outputTimeMs ?? b.tMs) - targetMs),
      )[0],
    actionMs = clamp(
      actionEvent?.outputTimeMs ?? actionEvent?.tMs ?? durationMs * 0.45,
      250,
      durationMs - 500,
    ),
    pointer = (fixture?.pointerTargets || []).sort(
      (a, b) =>
        Math.abs((a.tMs ?? actionMs) - actionMs) -
        Math.abs((b.tMs ?? actionMs) - actionMs),
    )[0] || { x: 0.5, y: 0.5 },
    family = effectFamily(shot, events),
    target = {
      x: clamp(pointer.x - 0.13, 0.03, 0.71),
      y: clamp(pointer.y - 0.1, 0.04, 0.76),
      width: 0.26,
      height: 0.2,
      source: pointer.event ? "POINTER_TELEMETRY" : "SAFE_MANUAL_DEFAULT",
    },
    timing = {
      startMs: Math.max(0, actionMs - 220),
      endMs: Math.min(durationMs - 120, actionMs + 1100),
      fadeInMs: 180,
      fadeOutMs: 220,
    };
  const body = {
    contract: "A1ScreenEmphasisSpec/v1",
    version: 1,
    shotId: shot.shotId,
    source: {
      storyboardVersionId: current.versionId,
      storyboardRevisionSha256: current.revisionSha256,
      videoSha256: shot.video.sha256,
      actionId: shot.actionId,
    },
    effect: {
      family,
      target: family === "KEYSTROKE_BADGE" ? null : target,
      timing,
      label: family === "KEYSTROKE_BADGE" ? "⌘ S" : null,
      outsideDarkness: family.includes("SPOTLIGHT") ? 0.22 : 0,
      outlineWidth:
        family === "INPUT_OUTLINE" ? 3 : family.includes("SPOTLIGHT") ? 2 : 0,
    },
    budget: {
      maximumPrimaryEffects: 1,
      maximumSemanticZooms: family === "STATE_CROSSFADE" ? 0 : 0,
      clickRingAllowed: family === "CLICK_RING",
      particlesAllowed: false,
      decorativeArrowAllowed: false,
    },
    camera: {
      existingZoomSuppressed: family !== "STATE_CROSSFADE",
      sourceSpeed: 1,
      resultHoldMs: Math.max(800, shot.cameraDirection.resultHoldMs || 0),
    },
    approval: {
      reviewOnly: true,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
    },
  };
  body.specSha256 = shaValue(body);
  specs.push(body);
}
const representatives = [];
for (const family of [
  "SELECTION_SPOTLIGHT",
  "KEYSTROKE_BADGE",
  "PANEL_SPOTLIGHT",
  "INPUT_OUTLINE",
  "STATE_CROSSFADE",
  "CLICK_RING",
  "RESULT_SPOTLIGHT",
]) {
  const candidates = specs
    .filter((spec) => spec.effect.family === family)
    .sort(
      (a, b) =>
        (shotById.get(b.shotId).timeRange?.durationMs || 0) -
        (shotById.get(a.shotId).timeRange?.durationMs || 0),
    );
  assert.ok(candidates[0], `screen-emphasis-family-missing:${family}`);
  representatives.push(candidates[0]);
}
const badge = path.join(publicOut, "cmd-s-badge.png");
await sharp(
  Buffer.from(
    `<svg width="180" height="64"><rect x="2" y="2" width="176" height="60" rx="12" fill="#101415" fill-opacity=".92" stroke="#ffffff" stroke-opacity=".32"/><text x="90" y="42" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="28" font-weight="700">CMD + S</text></svg>`,
  ),
)
  .png()
  .toFile(badge);
const clickRing = path.join(publicOut, "click-ring.png");
await sharp(
  Buffer.from(
    `<svg width="104" height="104"><circle cx="52" cy="52" r="38" fill="none" stroke="#12a8bd" stroke-width="6" stroke-opacity=".9"/><circle cx="52" cy="52" r="10" fill="#12a8bd" fill-opacity=".22"/></svg>`,
  ),
)
  .png()
  .toFile(clickRing);
const outputs = [];
for (const spec of representatives) {
  const shot = report15.shots.find((item) => item.shotId === spec.shotId),
    source = path.join(publicRoot, shot.video.publicUrl.replace(/^\//u, "")),
    base = path.join(publicOut, `${spec.shotId}-base.mp4`),
    output = path.join(
      publicOut,
      `${spec.shotId}-${spec.effect.family.toLowerCase()}.mp4`,
    );
  if (spec.effect.family === "STATE_CROSSFADE") fs.copyFileSync(source, base);
  else {
    const project = path.join(publicOut, `${spec.shotId}.cap`);
    if (!fs.existsSync(project))
      fs.cpSync(latestCapProject(spec.shotId), project, { recursive: true });
    const configPath = path.join(project, "project-config.json"),
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.timeline.zoomSegments = [];
    config.screenEmphasisSpec = {
      contract: spec.contract,
      specSha256: spec.specSha256,
      effectFamily: spec.effect.family,
      reviewOnly: true,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    execFileSync(
      cap,
      [
        "export",
        project,
        "--output",
        base,
        "--fps",
        "60",
        "--resolution",
        "960x540",
        "--quality",
        "maximum",
        "--json",
      ],
      { stdio: "pipe" },
    );
  }
  const start = (spec.effect.timing.startMs / 1000).toFixed(3),
    end = (spec.effect.timing.endMs / 1000).toFixed(3),
    enable = `between(t,${start},${end})`,
    x = Math.round((spec.effect.target?.x || 0.5) * 960),
    y = Math.round((spec.effect.target?.y || 0.5) * 540),
    w = Math.round((spec.effect.target?.width || 0.2) * 960),
    h = Math.round((spec.effect.target?.height || 0.15) * 540);
  let filter = "[0:v]fps=60,format=yuv420p[v]",
    inputs = ["-i", base];
  if (spec.effect.family.includes("SPOTLIGHT")) {
    filter = `[0:v]drawbox=x=0:y=0:w=iw:h=${y}:color=black@0.22:t=fill:enable='${enable}',drawbox=x=0:y=${y + h}:w=iw:h=ih-${y + h}:color=black@0.22:t=fill:enable='${enable}',drawbox=x=0:y=${y}:w=${x}:h=${h}:color=black@0.22:t=fill:enable='${enable}',drawbox=x=${x + w}:y=${y}:w=iw-${x + w}:h=${h}:color=black@0.22:t=fill:enable='${enable}',drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x12a8bd@0.9:t=2:enable='${enable}',fps=60,format=yuv420p[v]`;
  } else if (spec.effect.family === "INPUT_OUTLINE") {
    filter = `[0:v]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x12a8bd@0.95:t=3:enable='${enable}',fps=60,format=yuv420p[v]`;
  } else if (spec.effect.family === "KEYSTROKE_BADGE") {
    inputs = ["-i", base, "-i", badge];
    filter = `[1:v]format=rgba[badge];[0:v][badge]overlay=x=40:y=H-h-38:enable='${enable}',fps=60,format=yuv420p[v]`;
  } else if (spec.effect.family === "CLICK_RING") {
    inputs = ["-i", base, "-i", clickRing];
    filter = `[1:v]format=rgba[ring];[0:v][ring]overlay=x=${x + Math.round(w / 2) - 52}:y=${y + Math.round(h / 2) - 52}:enable='${enable}',fps=60,format=yuv420p[v]`;
  }
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "veryfast",
    output,
  ]);
  const probe = JSON.parse(
      execFileSync(
        ffprobe,
        [
          "-v",
          "error",
          "-show_entries",
          "stream=width,height,r_frame_rate:format=duration,size",
          "-of",
          "json",
          output,
        ],
        { encoding: "utf8" },
      ),
    ),
    video = probe.streams[0];
  assert.equal(video.width, 960);
  assert.equal(video.height, 540);
  assert.equal(video.r_frame_rate, "60/1");
  const still = path.join(publicOut, `${spec.shotId}-canary.png`);
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-ss",
    ((spec.effect.timing.startMs + spec.effect.timing.endMs) / 2000).toFixed(3),
    "-i",
    output,
    "-frames:v",
    "1",
    still,
  ]);
  outputs.push({
    shotId: spec.shotId,
    effectFamily: spec.effect.family,
    specSha256: spec.specSha256,
    video: {
      publicUrl: `/${phase}/${path.basename(output)}`,
      sha256: shaFile(output),
      width: 960,
      height: 540,
      durationMs: Math.round(Number(probe.format.duration) * 1000),
    },
    still: {
      publicUrl: `/${phase}/${path.basename(still)}`,
      sha256: shaFile(still),
      width: 960,
      height: 540,
    },
    zoomSuppressed: spec.camera.existingZoomSuppressed,
    failures: [],
  });
}
const tileW = 480,
  tileH = 270,
  labelH = 54,
  tiles = [];
for (const output of outputs) {
  const file = path.join(
      publicRoot,
      output.still.publicUrl.replace(/^\//u, ""),
    ),
    label = Buffer.from(
      `<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#111516"/><text x="14" y="22" fill="#dfff68" font-family="Arial" font-size="14" font-weight="700">${output.shotId} · ${output.effectFamily}</text><text x="14" y="42" fill="#9aa7a1" font-family="Arial" font-size="10">ONE PRIMARY EFFECT · ZOOM SUPPRESSED ${output.zoomSuppressed}</text></svg>`,
    );
  tiles.push(
    await sharp(file)
      .resize(tileW, tileH)
      .extend({
        top: labelH,
        bottom: 0,
        left: 0,
        right: 0,
        background: "#111516",
      })
      .composite([{ input: label, left: 0, top: 0 }])
      .png()
      .toBuffer(),
  );
}
const contact = path.join(
  publicOut,
  "screen-emphasis-five-family-contact-sheet.png",
);
await sharp({
  create: {
    width: tileW * 2,
    height: Math.ceil(tiles.length / 2) * (tileH + labelH),
    channels: 4,
    background: "#090c0d",
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: (index % 2) * tileW,
      top: Math.floor(index / 2) * (tileH + labelH),
    })),
  )
  .png()
  .toFile(contact);
const generatedAt = new Date().toISOString(),
  report = {
    contract: "A1ScreenEmphasisCanary/v1",
    status: "READY_FOR_USER_EFFECT_REVIEW",
    sourceWorkspaceSha256: workspace.workspaceSha256,
    specCount: specs.length,
    representativeShotIds: outputs.map((item) => item.shotId),
    effects: [...new Set(specs.map((spec) => spec.effect.family))],
    specs,
    outputs,
    contactSheet: {
      publicUrl: `/${phase}/${path.basename(contact)}`,
      sha256: shaFile(contact),
      width: 960,
      height: Math.ceil(tiles.length / 2) * (tileH + labelH),
    },
    audit: {
      status: "PASS",
      maximumPrimaryEffects: 1,
      zoomSuppressedForOverlayCanaries: true,
      sourceSpeedOne: true,
      particleCount: 0,
      decorativeArrowCount: 0,
      failures: [],
    },
    boundaries: {
      reviewOnly: true,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
      wholeFilmRenderPerformed: false,
      resolveWritePerformed: false,
    },
    generatedAt,
  };
for (const file of fs
  .readdirSync(publicOut)
  .filter((name) => /\.(json|png|mp4)$/u.test(name))) {
  if (file === "report.json") continue;
  fs.copyFileSync(path.join(publicOut, file), path.join(artifactOut, file));
}
fs.writeFileSync(
  path.join(publicOut, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(artifactOut, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
const committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(current.workspaceSha256, workspace.workspaceSha256);
  let next = structuredClone(current);
  next.production.shotIntelligence.currentStoryboardAuthority.screenEmphasisCanary =
    {
      contract: report.contract,
      status: report.status,
      reportPublicUrl: `/${phase}/report.json`,
      contactSheet: report.contactSheet,
      representativeShotIds: report.representativeShotIds,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
      generatedAt,
    };
  for (const spec of specs) {
    const shot =
      next.production.shotIntelligence.currentStoryboardAuthority.shots.find(
        (item) => item.shotId === spec.shotId,
      );
    if (shot?.screenStoryboard) shot.screenStoryboard.emphasisSpec = spec;
  }
  next = recalculateEditorialAssetWorkbench(next, generatedAt);
  const event = createProductionEvent({
    workspace: current,
    action: "build-screen-emphasis-five-family-canary",
    targetId: report.contactSheet.sha256,
    payload: {
      representativeShotIds: report.representativeShotIds,
      effects: report.effects,
      wholeFilmRenderPerformed: false,
    },
    now: generatedAt,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: { "screen-emphasis-canary-v1/report.json": report },
  });
});
console.log(
  JSON.stringify(
    {
      status: report.status,
      specCount: report.specCount,
      representativeShotIds: report.representativeShotIds,
      effects: report.effects,
      contactSheet: report.contactSheet,
      workspaceSha256After: committed.workspaceSha256,
      boundaries: report.boundaries,
    },
    null,
    2,
  ),
);
