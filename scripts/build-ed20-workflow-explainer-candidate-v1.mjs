#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const source = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/canonical-web-generation-v1/ed-20/ed-20-dd38c7cc91a5b1c2.png");
const publicDir = path.join(renderer, "public/proof-only/ed20-workflow-explainer-v1");
const outputDir = path.join(root, "work/ed20-workflow-explainer-v1");
const output = path.join(outputDir, "ed20-workflow-explainer-candidate-960x540.mp4");
const reportPath = path.join(outputDir, "report.json");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

fs.mkdirSync(publicDir, {recursive: true});
fs.mkdirSync(outputDir, {recursive: true});
fs.copyFileSync(source, path.join(publicDir, "source.png"));
const rendered = spawnSync("npx", [
  "remotion", "render",
  "src/ed20-workflow-explainer-entry.tsx",
  "A1Ed20WorkflowExplainerCandidateV1",
  output,
  "--codec", "h264",
  "--crf", "16",
  "--concurrency", "1",
], {cwd: renderer, encoding: "utf8", maxBuffer: 8 * 1024 * 1024});
if (rendered.status !== 0) throw new Error(`ed20-explainer-render:${rendered.stderr || rendered.stdout}`);
const probe = spawnSync(path.join(root, ".tools/bin/ffprobe"), [
  "-v", "error", "-show_entries", "format=duration,size",
  "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_frames",
  "-of", "json", output,
], {encoding: "utf8"});
if (probe.status !== 0) throw new Error(`ed20-explainer-probe:${probe.stderr}`);
const media = JSON.parse(probe.stdout), stream = media.streams[0];
const report = {
  contract: "A1Ed20WorkflowExplainerCandidate/v1",
  status: "READY_FOR_USER_ROUTE_DECISION",
  shotId: "ED-20",
  routeCandidate: "PACKAGE_LOOK_MASTER",
  semanticAction: "整理材料 → 明确约束 → 继续编辑 → 收稿",
  source: {path: path.relative(root, source), sha256: sha256(source), provenance: "EXISTING_SEMANTICALLY_CORRECT_CURRENT_CANDIDATE"},
  output: {path: path.relative(root, output), sha256: sha256(output), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_frames), durationMs: Math.round(Number(media.format.duration) * 1000), bytes: Number(media.format.size)},
  motion: {runtime: "REMOTION", camera: "FAMILY_STAGE_HARD_CUT", continuousPan: false, motionBlur: false, stageCount: 4},
  boundaries: {currentAuthorityMutated: false, routeChanged: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
