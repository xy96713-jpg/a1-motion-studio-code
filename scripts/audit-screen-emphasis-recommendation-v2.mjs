#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const root = path.resolve(import.meta.dirname, ".."),
  publicRoot = path.join(root, "apps/studio-next/public"),
  phase =
    "generated/system-line/editorial-asset-workbench-v1/screen-emphasis-recommendation-v2",
  out = path.join(publicRoot, phase),
  artifactOut = path.join(
    root,
    ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-emphasis-recommendation-v2",
  ),
  report = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")),
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  shaFile = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  shaValue = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  checks = [],
  failures = [],
  record = (id, pass, detail) => {
    checks.push({ id, status: pass ? "PASS" : "FAIL", detail });
    if (!pass) failures.push(id);
  };
record(
  "REPORT_STATE",
  report.status === "READY_FOR_USER_EFFECT_REVIEW" &&
    report.contract === "A1ScreenEmphasisRecommendation/v2",
  { status: report.status },
);
record(
  "DEFAULT_NONE",
  report.audit?.defaultNone === true &&
    report.skippedShotIds?.length >= report.appliedShotIds?.length,
  {
    applied: report.appliedShotIds?.length,
    skipped: report.skippedShotIds?.length,
  },
);
record("NO_SAFE_DEFAULT", report.audit?.safeManualDefaultCount === 0, {
  count: report.audit?.safeManualDefaultCount,
});
record(
  "SHAPE_CATALOG",
  ["RECTANGLE", "ROUNDED_RECTANGLE", "ELLIPSE", "CIRCLE", "NONE"].every(
    (shape) => report.shapeCatalog?.supported?.includes(shape),
  ),
  report.shapeCatalog,
);
for (const spec of report.specs || []) {
  const body = structuredClone(spec),
    expected = body.specSha256;
  delete body.specSha256;
  record(`SPEC_SHA:${spec.shotId}`, expected === shaValue(body), {});
  if (spec.decision.status === "SKIP")
    record(
      `SKIP_NONE:${spec.shotId}`,
      spec.effect.family === "NONE" &&
        spec.effect.sourceTarget == null &&
        spec.budget.maximumPrimaryEffects === 0,
      { effect: spec.effect.family },
    );
  else {
    record(
      `APPLY_NECESSITY:${spec.shotId}`,
      spec.decision.reason && spec.decision.confidence >= 0.8,
      { decision: spec.decision },
    );
    if (spec.effect.shape !== "NONE") {
      record(
        `VERIFIED_GEOMETRY:${spec.shotId}`,
        ["EVENT_DOM_RECT", "DOM_RANGE", "CLICK_TELEMETRY"].includes(
          spec.effect.sourceTarget?.source,
        ),
        { source: spec.effect.sourceTarget?.source },
      );
      if (spec.effect.sourceTarget?.source === "EVENT_DOM_RECT")
        record(
          `EVENT_DOM_RECT_BINDING:${spec.shotId}`,
          Number.isFinite(spec.effect.sourceTarget.capturedAtMs) &&
            Boolean(spec.effect.sourceTarget.event) &&
            spec.effect.sourceTarget.viewport?.width === 1280 &&
            spec.effect.sourceTarget.viewport?.height === 720,
          spec.effect.sourceTarget,
        );
      record(
        `TRANSFORM_CONFIDENCE:${spec.shotId}`,
        spec.canvasTransform?.inliers >= 20 &&
          spec.canvasTransform?.inlierRatio >= 0.6 &&
          spec.canvasTransform?.medianReprojectionErrorPx <= 3,
        {
          inliers: spec.canvasTransform?.inliers,
          ratio: spec.canvasTransform?.inlierRatio,
          error: spec.canvasTransform?.medianReprojectionErrorPx,
        },
      );
      const target = spec.effect.renderTarget;
      record(
        `RENDER_TARGET_BOUNDS:${spec.shotId}`,
        target &&
          target.x >= 0 &&
          target.y >= 0 &&
          (target.kind === "point" ||
            (target.x + target.width <= 1 && target.y + target.height <= 1)),
        target,
      );
    }
  }
}
async function raw(file, time) {
  const frame = path.join(
    out,
    `.audit-${path.basename(file)}-${String(time).replace(".", "_")}.png`,
  );
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    frame,
  ]);
  const data = await sharp(frame)
    .resize(160, 90)
    .removeAlpha()
    .raw()
    .toBuffer();
  fs.unlinkSync(frame);
  return data;
}
function delta(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index++)
    sum += Math.abs(a[index] - b[index]);
  return sum / a.length / 255;
}
for (const output of report.outputs || []) {
  const video = path.join(
      publicRoot,
      output.video.publicUrl.replace(/^\//u, ""),
    ),
    base = path.join(out, `${output.shotId}-base.mp4`),
    spec = report.specs.find((item) => item.shotId === output.shotId),
    time = (spec.effect.timing.startMs + spec.effect.timing.endMs) / 2000;
  record(
    `VIDEO_SHA:${output.shotId}`,
    fs.existsSync(video) && shaFile(video) === output.video.sha256,
    { sha256: output.video.sha256 },
  );
  if (spec.effect.family !== "STATE_CROSSFADE") {
    const [before, after] = await Promise.all([
        raw(base, time),
        raw(video, time),
      ]),
      visible = delta(before, after);
    record(`EFFECT_VISIBLE:${output.shotId}`, visible > 0.0015, {
      delta: Number(visible.toFixed(5)),
      effect: spec.effect.family,
    });
  }
}
record(
  "BOUNDARIES",
  report.boundaries?.reviewOnly === true &&
    report.boundaries?.productionAdmission === false &&
    report.boundaries?.wholeFilmRenderPerformed === false &&
    report.boundaries?.resolveWritePerformed === false,
  report.boundaries,
);
const audit = {
  contract: "A1ScreenEmphasisRecommendationAudit/v2",
  status: failures.length ? "FAIL" : "PASS",
  sourceReportSha256: shaFile(path.join(out, "report.json")),
  checks,
  failures,
  auditedAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(out, "audit-report.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(artifactOut, "audit-report.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      status: audit.status,
      checkCount: checks.length,
      appliedCount: report.appliedShotIds.length,
      skippedCount: report.skippedShotIds.length,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
