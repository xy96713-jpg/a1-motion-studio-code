import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "docs/SYSTEM_LINE_OPERATOR_CARD.md",
  "docs/A1_MOTION_ENGINE_SOP.md",
  "docs/A1_MOTION_ENGINE_SOP_ARCHIVE_2026-08-20.md",
  ".codex/skills/a1-motion-studio/SKILL.md",
  "AGENTS.md",
];

const requiredTerms = [
  ["docs/A1_MOTION_ENGINE_SOP.md", "## Goal"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "## Source Of Truth"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "## Safety Boundaries"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "## Workflow Pointers"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "## Verification"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "Fail closed"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "No fake evidence"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "Template-first"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "User approval remains mandatory"],
  ["docs/A1_MOTION_ENGINE_SOP.md", "A1_MOTION_ENGINE_SOP_ARCHIVE_2026-08-20.md"],
  ["docs/A1_MOTION_ENGINE_SOP_ARCHIVE_2026-08-20.md", "Historical detail; read only when a specific legacy rule is in question."],
  ["docs/SYSTEM_LINE_OPERATOR_CARD.md", "## NOOP breaker"],
  ["docs/SYSTEM_LINE_OPERATOR_CARD.md", "ORCHESTRATION_STALLED"],
  [".codex/skills/a1-motion-studio/SKILL.md", "# A1 Motion Studio Router"],
  [".codex/skills/a1-motion-studio/SKILL.md", "Choose and read exactly one primary playbook completely."],
  ["AGENTS.md", "Read [docs/README.md](docs/README.md) and the dynamic authority chain before inheriting work."],
];

const hotPathBudgets = [
  ["docs/A1_MOTION_ENGINE_SOP.md", 12_000],
  [".codex/skills/a1-motion-studio/SKILL.md", 8_000],
  ["docs/SYSTEM_LINE_OPERATOR_CARD.md", 10_000],
];

const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`missing required file: ${file}`);
}

for (const [file, term] of requiredTerms) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(term)) failures.push(`${file} is missing required SOP term: ${term}`);
}

for (const [file, maxBytes] of hotPathBudgets) {
  if (!fs.existsSync(file)) continue;
  const bytes = fs.statSync(file).size;
  if (bytes > maxBytes) failures.push(`${file} exceeds hot-path budget: ${bytes} > ${maxBytes}`);
}

const activeSopPath = "docs/A1_MOTION_ENGINE_SOP.md";
const activeSop = fs.existsSync(activeSopPath) ? fs.readFileSync(activeSopPath, "utf8") : "";
const activeSopLines = activeSop ? activeSop.split("\n").length : 0;
if (activeSopLines > 120) failures.push(`${activeSopPath} exceeds line budget: ${activeSopLines} > 120`);

const archivePath = "docs/A1_MOTION_ENGINE_SOP_ARCHIVE_2026-08-20.md";
if (fs.existsSync(archivePath) && fs.statSync(archivePath).size < 95_000) {
  failures.push(`${archivePath} does not preserve the full historical body`);
}

const localMarkdownLinks = [...activeSop.matchAll(/\]\(([^)]+\.md)\)/gu)].map((match) => match[1]);
for (const link of new Set(localMarkdownLinks)) {
  const target = path.resolve(path.dirname(activeSopPath), link);
  if (!fs.existsSync(target)) failures.push(`${activeSopPath} points to missing document: ${link}`);
}

const router = fs.existsSync(".codex/skills/a1-motion-studio/SKILL.md")
  ? fs.readFileSync(".codex/skills/a1-motion-studio/SKILL.md", "utf8")
  : "";
if (router.includes("Read `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, and `docs/A1_MOTION_ENGINE_SOP.md`")) {
  failures.push("skill regressed to the legacy mandatory full-SOP hot path");
}

const routedPlaybooks = [...router.matchAll(/`(docs\/playbooks\/[^`]+\.md)`/gu)].map((match) => match[1]);
for (const file of new Set(routedPlaybooks)) {
  if (!fs.existsSync(file)) failures.push(`router points to missing playbook: ${file}`);
  else if (fs.statSync(file).size > 5_000) failures.push(`${file} exceeds routed playbook budget: ${fs.statSync(file).size} > 5000`);
  else if (path.extname(file) !== ".md") failures.push(`router playbook is not Markdown: ${file}`);
}
if (new Set(routedPlaybooks).size < 5) failures.push("router must expose the five current task surfaces");

if (failures.length) {
  console.error("Motion SOP audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1MotionSopRoutingAudit/v2",
  requiredFileCount: requiredFiles.length,
  routedPlaybookCount: new Set(routedPlaybooks).size,
  activeSop: {bytes: fs.statSync(activeSopPath).size, lines: activeSopLines, maxBytes: 12_000, maxLines: 120},
  archiveBytes: fs.statSync(archivePath).size,
  hotPathBudgets: Object.fromEntries(hotPathBudgets.map(([file, maxBytes]) => [file, {bytes: fs.statSync(file).size, maxBytes}])),
}, null, 2));
