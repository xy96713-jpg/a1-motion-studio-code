import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".codex-artifacts", "film-readiness-test");
const reportPath = path.join(outDir, "film-readiness-report.json");
const propsPath = path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline-props.json");

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const result = await run([
  "scripts/audit-film-readiness.mjs",
  "--out-dir",
  outDir,
]);

if (result.code !== 0) {
  fail(result.output || `audit-film-readiness exited ${result.code}`);
}

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const props = JSON.parse(await fs.readFile(propsPath, "utf8"));

if (report.contract !== "A1FilmReadinessReport/v1") fail("missing film readiness contract");
if (!Array.isArray(report.shots) || report.shots.length !== props.items.length) fail("report must evaluate every submitted article shot");
if (report.shots.some((shot) => shot.motionGrammar?.reason?.includes("volcano monitoring motif"))) fail("generic article audit must not require the old volcano motif");
if (report.shots.some((shot) => shot.transitionFit?.status !== "pass")) fail("relation-aware article transitions must pass");
const issueCount = (report.summary?.blockingIssueCount || 0) + (report.summary?.warningIssueCount || 0);
if (report.filmReady !== true || issueCount !== 0) fail(`current arbitrary article must be film ready with zero issues: ${JSON.stringify(report.summary)}`);
if (report.filmReady === true && issueCount !== 0) {
  fail("filmReady true requires zero blocking and warning issues");
}
if (report.filmReady === false && issueCount <= 1) {
  fail("filmReady false must contain enough film-level issues to explain why it is false");
}
if (!report.artifacts?.montagePath) fail("report must include a montage path");

const requiredFields = [
  "shotId",
  "narrativeRole",
  "screenTitle",
  "templateSlug",
  "assetSlotKind",
  "source",
  "materialSpecificity",
  "templateFit",
  "readability",
  "continuity",
  "motionGrammar",
  "transitionFit",
  "hyperframesLayout",
  "blockingIssues",
  "recommendedFix",
];

for (const shot of report.shots) {
  for (const field of requiredFields) {
    if (!(field in shot)) fail(`shot ${shot.shotId || "unknown"} missing ${field}`);
  }
  if (!Array.isArray(shot.blockingIssues)) fail(`shot ${shot.shotId} blockingIssues must be an array`);
  if (!shot.recommendedFix) fail(`shot ${shot.shotId} must include recommendedFix`);
}

await fs.access(report.artifacts.montagePath);
await fs.access(path.join(outDir, "film-readiness-report.md"));

console.log(JSON.stringify({
  ok: true,
  filmReady: report.filmReady,
  shotCount: report.shots.length,
  blockingIssueCount: report.summary.blockingIssueCount,
  warningIssueCount: report.summary.warningIssueCount,
  reportPath,
  montagePath: report.artifacts.montagePath,
}, null, 2));
