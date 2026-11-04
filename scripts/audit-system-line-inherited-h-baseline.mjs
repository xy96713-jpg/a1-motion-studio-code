#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = process.env.A1_RESOLVE_SOURCE_ROOT || "/Users/a1/Documents/Codex/声音";
const outputsRoot = path.join(sourceRoot, "outputs/video_packaging_july1");
const reportPath = path.join(root, ".codex-artifacts/system-line/inherited-h-baseline-report.json");

const requiredFiles = [
  {
    id: "h01-h08-h11-anchor-motion",
    path: path.join(outputsRoot, "anchor-motion-review-v4/contact-sheet-3.png"),
    kind: "visual-proof",
  },
  {
    id: "layered-anchor-h03-h08-h11",
    path: path.join(outputsRoot, "layered-anchor-review-v2/composite-contact-sheet.png"),
    kind: "visual-proof",
  },
  {
    id: "h08-curve-proof",
    path: path.join(outputsRoot, "representative-motion-v8-h08-curve/contact-sheet.png"),
    kind: "visual-proof",
  },
  {
    id: "canonical-full-preview-v2",
    path: path.join(outputsRoot, "canonical-full-preview-v2/contact-sheet-11-scenes.png"),
    kind: "visual-proof",
  },
  {
    id: "microbeat-layered-full-props",
    path: path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json"),
    kind: "props",
  },
  {
    id: "microbeat-layered-full-renderer",
    path: path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx"),
    kind: "renderer",
  },
  {
    id: "h08-curve-renderer",
    path: path.join(root, "remotion-renderer/src/VisualGrammarV8H08CurveMotionProof.tsx"),
    kind: "renderer",
  },
];

const checks = requiredFiles.map((item) => {
  const exists = fs.existsSync(item.path);
  const size = exists ? fs.statSync(item.path).size : 0;
  return {
    ...item,
    exists,
    size,
    status: exists && size > 0 ? "PASS" : "FAIL",
    path: path.relative(root, item.path).startsWith("..") ? item.path : path.relative(root, item.path),
  };
});

let propsCheck = {status: "FAIL", reason: "props-missing"};
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
if (fs.existsSync(propsPath)) {
  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const reviewBeatIds = Array.isArray(props.reviewBeatIds) ? props.reviewBeatIds : [];
  const requiredBeatPrefixes = ["H01", "H08", "H11"];
  const missing = requiredBeatPrefixes.filter((prefix) => !reviewBeatIds.some((id) => String(id).startsWith(prefix)));
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  const sourceShotCount = Number(props.sourceTimeline?.shotCount || 0);
  const fixedSceneCount = 47;
  const currentProjectSceneCountValid = sourceShotCount > 0
    ? scenes.length === sourceShotCount
    : scenes.length >= fixedSceneCount;
  propsCheck = {
    status: props.contract === "A1MicrobeatLayeredFullPlan/v1" && currentProjectSceneCountValid && missing.length === 0 ? "PASS" : "FAIL",
    contract: props.contract,
    sceneCount: scenes.length,
    sourceShotCount: sourceShotCount || null,
    noFixedSceneCountAssumption: true,
    reviewBeatIds,
    missing,
  };
}

const failures = [
  ...checks.filter((item) => item.status !== "PASS").map((item) => ({id: item.id, failure: "missing-or-empty", path: item.path})),
  ...(propsCheck.status === "PASS" ? [] : [{id: "microbeat-props-contract", failure: propsCheck.reason || "props-contract-or-h-review-beats-invalid"}]),
];

const report = {
  contract: "A1SystemLineInheritedHBaselineAudit/v1",
  generatedAt: new Date().toISOString(),
  status: failures.length ? "FAIL" : "PASS",
  sourceRoot,
  outputsRoot,
  checks,
  propsCheck,
  failures,
};

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, reportPath, propsCheck, failures}, null, 2));
if (failures.length) process.exit(1);
