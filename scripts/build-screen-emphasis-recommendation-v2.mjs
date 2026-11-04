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
    "generated/system-line/editorial-asset-workbench-v1/screen-emphasis-recommendation-v2",
  publicOut = path.join(publicRoot, phase),
  artifactOut = path.join(
    root,
    ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-emphasis-recommendation-v2",
  ),
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  ffprobe = path.join(root, ".tools/bin/ffprobe"),
  cap = "/Applications/Cap.app/Contents/MacOS/cap-cli",
  python = process.env.A1_PYTHON || "python3",
  transformScript = path.join(
    root,
    "scripts/compute-screen-canvas-transform-v1.py",
  ),
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
  geometry = JSON.parse(
    fs.readFileSync(
      path.join(
        publicRoot,
        "generated/system-line/editorial-asset-workbench-v1/screen-emphasis-geometry-v1/report.json",
      ),
      "utf8",
    ),
  ),
  shotById = new Map(
    workspace.production.shotIntelligence.currentStoryboardAuthority.shots.map(
      (shot) => [shot.shotId, shot],
    ),
  ),
  auditById = new Map(audit.fixtures.map((item) => [item.id, item])),
  shaFile = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  shaValue = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function latestCap(shotId) {
  for (const run of fs
    .readdirSync(path.join(root, "work/background-cap-production-v1/runs"))
    .sort()
    .reverse()) {
    const file = path.join(
      root,
      "work/background-cap-production-v1/runs",
      run,
      `${shotId.toLowerCase()}.cap`,
    );
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`screen-emphasis-v2-cap-missing:${shotId}`);
}
function captureReport(current, fixture) {
  const rel =
    current.backgroundScreenCandidate?.storyboardReviewCaptureReport ||
    fixture.reportPath;
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}
function choose(shot, events) {
  const hold = shot.actionContract?.hold || "",
    before = shot.actionContract?.before || "";
  if (events.some((event) => event.name === "save_shortcut"))
    return {
      status: "APPLY",
      family: "KEYSTROKE_BADGE",
      shape: "NONE",
      geometryKey: null,
      reason: "keyboard-action-is-invisible-without-keycap",
      confidence: 0.98,
    };
  if (shot.actionId === "historyIsolation")
    return {
      status: "APPLY",
      family: "PANEL_SPOTLIGHT",
      shape: "ROUNDED_RECTANGLE",
      geometryKey: "history-panel",
      reason: "multi-version-panel-is-dense-and-needs-one-reading-focus",
      confidence: 0.94,
    };
  if (shot.actionId === "presentation")
    return {
      status: "APPLY",
      family: "STATE_CROSSFADE",
      shape: "NONE",
      geometryKey: null,
      reason: "full-interface-mode-change-needs-state-transition-not-callout",
      confidence: 0.96,
    };
  if (
    shot.actionId === "paragraph" &&
    /输入|双击/u.test(hold) &&
    /空|空行|语义缺/u.test(before)
  )
    return {
      status: "SKIP",
      family: "NONE",
      shape: "NONE",
      geometryKey: null,
      reason:
        "paragraph-assist-slot-has-no-independent-visible-boundary-native-status-card-already-explains-action",
      confidence: 0.97,
    };
  if (shot.actionId === "negativePreferenceRecord")
    return {
      status: "APPLY",
      family: "CLICK_RING",
      shape: "CIRCLE",
      geometryKey: "ban-click",
      reason: "single-confirmation-click-benefits-from-short-click-feedback",
      confidence: 0.86,
    };
  return {
    status: "SKIP",
    family: "NONE",
    shape: "NONE",
    geometryKey: null,
    reason: "native-ui-state-and-cursor-already-explain-the-action",
    confidence: 0.9,
  };
}
function pointerFor(report, eventName) {
  const exact = (report.pointerTargets || []).find(
    (item) => item.event === eventName,
  );
  return exact ? { x: exact.x, y: exact.y } : null;
}
function sourceGeometry(decision, report, actionMs) {
  if (!decision.geometryKey) return null;
  if (decision.geometryKey === "ban-click") {
    const point = pointerFor(report, "ban_click");
    return point
      ? { kind: "point", ...point, source: "CLICK_TELEMETRY", shape: "CIRCLE" }
      : null;
  }
  const exact = (report.domTargets || [])
    .filter((item) => item.targetKey === decision.geometryKey)
    .sort(
      (a, b) =>
        Math.abs(a.capturedAtMs - actionMs) -
        Math.abs(b.capturedAtMs - actionMs),
    )[0];
  if (!exact?.sourceRect) return null;
  return {
    kind: "rect",
    ...exact.sourceRect,
    source: exact.source,
    shape: exact.shape,
    capturedAtMs: exact.capturedAtMs,
    event: exact.event,
    viewport: exact.viewport,
    scroll: exact.scroll,
    validUntil: "target-mutation-or-scroll",
  };
}
const specs = [],
  outputs = [];
const shapeCatalog = {
  contract: "A1ScreenEffectShapeCatalog/v1",
  supported: ["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE", "CIRCLE", "NONE"],
  selectionPolicy: "semantic-target-geometry-first",
  productionFallback: "NONE",
};
for (const shot of report15.shots) {
  const current = shotById.get(shot.shotId),
    fixture = auditById.get(shot.shotId),
    capture = captureReport(current, fixture),
    events =
      current.backgroundScreenCandidate?.storyboardReviewEvents ||
      capture.events ||
      [],
    decision = choose(shot, events),
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
    sourceTarget = sourceGeometry(decision, capture, actionMs),
    emphasisAnchorMs = sourceTarget?.capturedAtMs ?? actionMs;
  if (
    decision.status === "APPLY" &&
    decision.shape !== "NONE" &&
    !sourceTarget
  ) {
    decision.status = "SKIP";
    decision.family = "NONE";
    decision.shape = "NONE";
    decision.reason = "verified-geometry-unavailable-default-none";
    decision.confidence = 1;
  }
  const spec = {
    contract: "A1ScreenEmphasisSpec/v2",
    version: 2,
    shotId: shot.shotId,
    source: {
      storyboardVersionId: current.versionId,
      storyboardRevisionSha256: current.revisionSha256,
      videoSha256: shot.video.sha256,
      captureReport:
        current.backgroundScreenCandidate?.storyboardReviewCaptureReport ||
        fixture.reportPath,
      actionId: shot.actionId,
    },
    decision,
    effect: {
      family: decision.family,
      shape: decision.shape,
      sourceTarget,
      renderTarget: null,
      timing: {
        startMs: Math.max(0, emphasisAnchorMs - 180),
        endMs: Math.min(durationMs - 120, emphasisAnchorMs + 900),
        fadeInMs: 160,
        fadeOutMs: 200,
      },
      outsideDarkness: decision.family.includes("SPOTLIGHT") ? 0.18 : 0,
      outlineWidth:
        decision.family === "INPUT_OUTLINE"
          ? 3
          : decision.family.includes("SPOTLIGHT")
            ? 2
            : 0,
    },
    budget: {
      maximumPrimaryEffects: decision.status === "APPLY" ? 1 : 0,
      maximumSemanticZooms: 0,
      particlesAllowed: false,
      decorativeArrowAllowed: false,
    },
    camera: {
      existingZoomSuppressed:
        decision.status === "APPLY" && decision.family !== "STATE_CROSSFADE",
      sourceSpeed: 1,
      resultHoldMs: Math.max(800, shot.cameraDirection.resultHoldMs || 0),
    },
    approval: {
      reviewOnly: true,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
    },
  };
  spec.specSha256 = shaValue(spec);
  specs.push(spec);
}
const badge = path.join(publicOut, "cmd-s-badge.png");
await sharp(
  Buffer.from(
    `<svg width="180" height="64"><rect x="2" y="2" width="176" height="60" rx="12" fill="#101415" fill-opacity=".92" stroke="#ffffff" stroke-opacity=".32"/><text x="90" y="42" text-anchor="middle" fill="#fff" font-family="Arial" font-size="28" font-weight="700">CMD + S</text></svg>`,
  ),
)
  .png()
  .toFile(badge);
for (const spec of specs.filter((item) => item.decision.status === "APPLY")) {
  const shot = report15.shots.find((item) => item.shotId === spec.shotId),
    fixture = auditById.get(spec.shotId),
    current = shotById.get(spec.shotId),
    capture = captureReport(current, fixture),
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
      fs.cpSync(latestCap(spec.shotId), project, { recursive: true });
    const configPath = path.join(project, "project-config.json"),
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.timeline.zoomSegments = [];
    config.screenEmphasisSpec = {
      contract: spec.contract,
      specSha256: spec.specSha256,
      decision: spec.decision,
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
  if (spec.effect.sourceTarget) {
    const time = (spec.effect.timing.startMs + spec.effect.timing.endMs) / 2000,
      rawVideo = path.join(root, capture.output.path),
      rawFrame = path.join(publicOut, `${spec.shotId}-raw-transform.png`),
      baseFrame = path.join(publicOut, `${spec.shotId}-base-transform.png`);
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-ss",
      time.toFixed(3),
      "-i",
      rawVideo,
      "-frames:v",
      "1",
      rawFrame,
    ]);
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-ss",
      time.toFixed(3),
      "-i",
      base,
      "-frames:v",
      "1",
      baseFrame,
    ]);
    const transform = JSON.parse(
      execFileSync(
        python,
        [
          transformScript,
          rawFrame,
          baseFrame,
          JSON.stringify(spec.effect.sourceTarget),
        ],
        { encoding: "utf8" },
      ),
    );
    spec.effect.renderTarget = transform.renderGeometry;
    spec.canvasTransform = transform;
    delete spec.specSha256;
    spec.specSha256 = shaValue(spec);
  }
  const start = (spec.effect.timing.startMs / 1000).toFixed(3),
    end = (spec.effect.timing.endMs / 1000).toFixed(3),
    enable = `between(t,${start},${end})`,
    target = spec.effect.renderTarget,
    x = Math.round((target?.x || 0.5) * 960),
    y = Math.round((target?.y || 0.5) * 540),
    w = Math.round((target?.width || 0.12) * 960),
    h = Math.round((target?.height || 0.12) * 540),
    overlay = path.join(publicOut, `${spec.shotId}-effect-overlay.png`);
  let inputs = ["-i", base],
    filter = "[0:v]fps=60,format=yuv420p[v]";
  if (spec.effect.family === "KEYSTROKE_BADGE") {
    inputs.push("-i", badge);
    filter = `[1:v]format=rgba[e];[0:v][e]overlay=x=40:y=H-h-38:enable='${enable}',fps=60,format=yuv420p[v]`;
  } else if (spec.effect.family !== "STATE_CROSSFADE") {
    const shape = spec.effect.shape,
      rx = shape === "ROUNDED_RECTANGLE" ? 12 : 0,
      svg = spec.effect.family.includes("SPOTLIGHT")
        ? `<svg width="960" height="540"><defs><mask id="m"><rect width="960" height="540" fill="white"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="black"/></mask></defs><rect width="960" height="540" fill="#000" fill-opacity=".18" mask="url(#m)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="#12a8bd" stroke-width="2"/></svg>`
        : shape === "CIRCLE"
          ? `<svg width="960" height="540"><circle cx="${x}" cy="${y}" r="42" fill="none" stroke="#12a8bd" stroke-width="6"/><circle cx="${x}" cy="${y}" r="10" fill="#12a8bd" fill-opacity=".22"/></svg>`
          : `<svg width="960" height="540"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="#12a8bd" stroke-width="3"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(overlay);
    inputs.push("-i", overlay);
    filter = `[1:v]format=rgba[e];[0:v][e]overlay=0:0:enable='${enable}',fps=60,format=yuv420p[v]`;
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
    still = path.join(publicOut, `${spec.shotId}-recommended.png`),
    time = (spec.effect.timing.startMs + spec.effect.timing.endMs) / 2000;
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-ss",
    time.toFixed(3),
    "-i",
    output,
    "-frames:v",
    "1",
    still,
  ]);
  outputs.push({
    shotId: spec.shotId,
    effectFamily: spec.effect.family,
    shape: spec.effect.shape,
    specSha256: spec.specSha256,
    video: {
      publicUrl: `/${phase}/${path.basename(output)}`,
      sha256: shaFile(output),
      width: probe.streams[0].width,
      height: probe.streams[0].height,
      durationMs: Math.round(Number(probe.format.duration) * 1000),
    },
    still: {
      publicUrl: `/${phase}/${path.basename(still)}`,
      sha256: shaFile(still),
      width: 960,
      height: 540,
    },
    geometrySource: spec.effect.sourceTarget?.source || "NOT_REQUIRED",
    transform: spec.canvasTransform
      ? {
          inliers: spec.canvasTransform.inliers,
          medianReprojectionErrorPx:
            spec.canvasTransform.medianReprojectionErrorPx,
        }
      : null,
    failures: [],
  });
}
const tileW = 480,
  tileH = 270,
  labelH = 58,
  tiles = [];
for (const output of outputs) {
  const file = path.join(
      publicRoot,
      output.still.publicUrl.replace(/^\//u, ""),
    ),
    label = Buffer.from(
      `<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#111516"/><text x="14" y="22" fill="#dfff68" font-family="Arial" font-size="14" font-weight="700">${output.shotId} · ${output.effectFamily}</text><text x="14" y="43" fill="#9aa7a1" font-family="Arial" font-size="10">${output.shape} · ${output.geometrySource} · DEFAULT NONE ELSEWHERE</text></svg>`,
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
  "recommended-screen-effects-contact-sheet.png",
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
  applied = specs.filter((item) => item.decision.status === "APPLY"),
  skipped = specs.filter((item) => item.decision.status === "SKIP"),
  report = {
    contract: "A1ScreenEmphasisRecommendation/v2",
    status: "READY_FOR_USER_EFFECT_REVIEW",
    sourceWorkspaceSha256: workspace.workspaceSha256,
    geometryProbeSha256: geometry.probeSha256,
    shapeCatalog,
    specCount: specs.length,
    appliedShotIds: applied.map((item) => item.shotId),
    skippedShotIds: skipped.map((item) => item.shotId),
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
      defaultNone: true,
      safeManualDefaultCount: specs.filter(
        (item) => item.effect.sourceTarget?.source === "SAFE_MANUAL_DEFAULT",
      ).length,
      appliedCount: applied.length,
      skippedCount: skipped.length,
      failures: [],
    },
    boundaries: {
      reviewOnly: true,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
      wholeFilmRenderPerformed: false,
      resolveWritePerformed: false,
      legacyTechniqueDemoStatus: "TECHNIQUE_DEMO_ONLY",
    },
    generatedAt,
  };
fs.writeFileSync(
  path.join(publicOut, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
for (const file of fs
  .readdirSync(publicOut)
  .filter((name) => /\.(json|png|mp4)$/u.test(name)))
  fs.copyFileSync(path.join(publicOut, file), path.join(artifactOut, file));
const committed = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(current.workspaceSha256, workspace.workspaceSha256);
  let next = structuredClone(current),
    authority = next.production.shotIntelligence.currentStoryboardAuthority;
  authority.screenEmphasisCanary = {
    contract: report.contract,
    status: report.status,
    reportPublicUrl: `/${phase}/report.json`,
    contactSheet: report.contactSheet,
    representativeShotIds: report.appliedShotIds,
    userVisualApproval: "NOT_APPROVED",
    productionAdmission: false,
    generatedAt,
  };
  for (const spec of specs) {
    const shot = authority.shots.find((item) => item.shotId === spec.shotId);
    if (shot?.screenStoryboard) shot.screenStoryboard.emphasisSpec = spec;
  }
  next = recalculateEditorialAssetWorkbench(next, generatedAt);
  const event = createProductionEvent({
    workspace: current,
    action: "build-screen-emphasis-recommendation-v2",
    targetId: report.contactSheet.sha256,
    payload: {
      appliedShotIds: report.appliedShotIds,
      skippedShotIds: report.skippedShotIds,
      defaultNone: true,
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
    files: { "screen-emphasis-recommendation-v2/report.json": report },
  });
});
console.log(
  JSON.stringify(
    {
      status: report.status,
      appliedShotIds: report.appliedShotIds,
      skippedShotIds: report.skippedShotIds,
      contactSheet: report.contactSheet,
      safeManualDefaultCount: report.audit.safeManualDefaultCount,
      workspaceSha256After: committed.workspaceSha256,
      boundaries: report.boundaries,
    },
    null,
    2,
  ),
);
