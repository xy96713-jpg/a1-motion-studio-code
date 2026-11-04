#!/usr/bin/env node
/**
 * Restore the H-series system-line review authority props from the last
 * generated-artwork adoption candidate.
 *
 * This is deliberately separate from the intelligent storyboard draft so the
 * storyboard table cannot silently replace the current review MP4 contract.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const sourcePath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-generated-artwork-adoption-plan-v1/candidate-microbeatLayeredFullProps.json");
const targetPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const reportDir = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-system-line-baseline-restore-v1");
const reportPath = path.join(reportDir, "restore-report.json");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`restore source not found: ${rel(sourcePath)}`);
}

const sourceProps = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const scenes = Array.isArray(sourceProps.scenes) ? sourceProps.scenes : [];
const macroIds = [...new Set(scenes.map((scene) => scene.macroId || String(scene.beatId || "").split("-")[0]).filter(Boolean))];
const reviewBeatIds = sourceProps.reviewBeatIds || [];
const missingRequiredAnchors = ["H08", "H11"].filter((macroId) => !reviewBeatIds.some((beatId) => String(beatId).startsWith(`${macroId}-`)));

if (scenes.length !== 47) {
  throw new Error(`refusing to restore non-H-series baseline: expected 47 scenes, got ${scenes.length}`);
}
if (!macroIds.includes("H08") || !macroIds.includes("H11") || missingRequiredAnchors.length) {
  throw new Error(`refusing to restore incomplete H-series baseline; macros=${macroIds.join(",")} missingAnchors=${missingRequiredAnchors.join(",")}`);
}

const before = fs.existsSync(targetPath)
  ? {
      path: rel(targetPath),
      sha256: sha256File(targetPath),
      sceneCount: (JSON.parse(fs.readFileSync(targetPath, "utf8")).scenes || []).length,
    }
  : null;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, `${JSON.stringify(sourceProps, null, 2)}\n`, "utf8");

const after = {
  path: rel(targetPath),
  sha256: sha256File(targetPath),
  sceneCount: scenes.length,
  macroIds,
  reviewBeatIds,
};

fs.mkdirSync(reportDir, { recursive: true });
const report = {
  contract: "A1HSeriesSystemLineBaselineRestore/v1",
  status: "restored",
  restoredAt: new Date().toISOString(),
  source: { path: rel(sourcePath), sha256: sha256File(sourcePath) },
  before,
  after,
  reason: "The intelligent storyboard draft had overwritten the shared system-line props. Restore H01-H11/47-scene authority before review rendering.",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  reportPath: rel(reportPath),
  before,
  after,
}, null, 2));
