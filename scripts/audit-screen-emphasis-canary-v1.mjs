#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const root = path.resolve(import.meta.dirname, ".."),
  publicRoot = path.join(root, "apps/studio-next/public"),
  phase =
    "generated/system-line/editorial-asset-workbench-v1/screen-emphasis-canary-v1",
  out = path.join(publicRoot, phase),
  artifactOut = path.join(
    root,
    ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-emphasis-canary-v1",
  ),
  report = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")),
  ffmpeg = path.join(root, ".tools/bin/ffmpeg"),
  shaFile = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  shaValue = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  failures = [],
  checks = [];
const record = (id, pass, detail) => {
  checks.push({ id, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) failures.push(id);
};
record("SPEC_COUNT", report.specs?.length === 15, {
  count: report.specs?.length,
});
for (const spec of report.specs || []) {
  const body = structuredClone(spec),
    expected = body.specSha256;
  delete body.specSha256;
  record(`SPEC_SHA:${spec.shotId}`, expected === shaValue(body), {
    expected,
    actual: shaValue(body),
  });
  record(
    `EFFECT_BUDGET:${spec.shotId}`,
    spec.budget?.maximumPrimaryEffects === 1 &&
      spec.budget?.particlesAllowed === false &&
      spec.budget?.decorativeArrowAllowed === false,
    { budget: spec.budget },
  );
  if (spec.effect?.target)
    record(
      `TARGET_BOUNDS:${spec.shotId}`,
      spec.effect.target.x >= 0 &&
        spec.effect.target.y >= 0 &&
        spec.effect.target.x + spec.effect.target.width <= 1 &&
        spec.effect.target.y + spec.effect.target.height <= 1 &&
        spec.effect.target.width * spec.effect.target.height <= 0.12,
      { target: spec.effect.target },
    );
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
function targetDelta(a, b, target) {
  const width = 160,
    height = 90,
    left = Math.max(0, Math.floor(target.x * width) - 2),
    top = Math.max(0, Math.floor(target.y * height) - 2),
    right = Math.min(width, Math.ceil((target.x + target.width) * width) + 2),
    bottom = Math.min(height, Math.ceil((target.y + target.height) * height) + 2);
  let sum = 0,
    count = 0;
  for (let y = top; y < bottom; y += 1)
    for (let x = left; x < right; x += 1)
      for (let channel = 0; channel < 3; channel += 1) {
        const index = (y * width + x) * 3 + channel;
        sum += Math.abs(a[index] - b[index]);
        count += 1;
      }
  return count ? sum / count / 255 : 0;
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
  if (output.zoomSuppressed) {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(out, `${output.shotId}.cap/project-config.json`),
        "utf8",
      ),
    );
    record(
      `ZOOM_SUPPRESSED:${output.shotId}`,
      config.timeline?.zoomSegments?.length === 0,
      { zoomSegments: config.timeline?.zoomSegments?.length },
    );
  }
  if (spec.effect.family !== "STATE_CROSSFADE") {
    const [before, after] = await Promise.all([
        raw(base, time),
        raw(video, time),
      ]),
      targetMeasured = ["INPUT_OUTLINE", "CLICK_RING"].includes(
        spec.effect.family,
      ),
      visible =
        targetMeasured && spec.effect.target
          ? targetDelta(before, after, spec.effect.target)
          : delta(before, after),
      threshold = targetMeasured ? 0.01 : 0.004;
    record(`EFFECT_VISIBLE:${output.shotId}`, visible > threshold, {
      delta: Number(visible.toFixed(5)),
      measurement: targetMeasured ? "TARGET_REGION" : "FULL_FRAME",
      threshold,
      effect: spec.effect.family,
    });
  }
}
const audit = {
  contract: "A1ScreenEmphasisCanaryAudit/v1",
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
    { status: audit.status, checkCount: checks.length, failures },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
