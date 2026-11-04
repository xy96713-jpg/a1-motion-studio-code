import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".codex-artifacts", "motion-quality-readiness-test");
const reportPath = path.join(outDir, "motion-quality-report.json");

await fs.rm(outDir, { recursive: true, force: true });
execFileSync(process.execPath, ["scripts/audit-motion-quality.mjs", "--out-dir", outDir], {
  cwd: root,
  stdio: "pipe",
});

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const props = JSON.parse(await fs.readFile(path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline-props.json"), "utf8"));
const realEdges = props.items.slice(0, -1);
const terminalItem = props.items.at(-1);
const terminalShot = report.shots.find((shot) => shot.shotId === terminalItem?.id);

if (!realEdges.every((item) => item.transitionPlan?.mode !== "hard-cut")) throw new Error("test fixture expects authored transitions on every real tutorial edge");
if (terminalItem?.transitionPlan?.mode !== "hard-cut") throw new Error("terminal sentinel should stay a hard-cut because it has no outgoing edge");
if (report.aeLikeReady !== true) throw new Error("authored real edges plus strong template motion should be labeled AE-like ready");
if (report.summary.hardCutCount !== 0) throw new Error("terminal sentinel must not be counted as a real hard-cut edge");
if (!terminalShot || terminalShot.scores.transitionStrength < 90) throw new Error("terminal shot must not lose transition score when no outgoing edge exists");
if (terminalShot.aeGap.some((gap) => /visual bridge/iu.test(gap))) throw new Error("terminal shot must not request an outgoing visual bridge");
if (/visual bridge/iu.test(report.summary.highestPriorityFix)) throw new Error("completed real edges must not leave a stale visual-bridge priority");

console.log(JSON.stringify({
  ok: true,
  contract: "A1MotionQualityReadinessTest/v1",
  aeLikeReady: report.aeLikeReady,
  hardCutCount: report.summary.hardCutCount,
  transitionScores: report.shots.map((shot) => shot.scores.transitionStrength),
}, null, 2));
