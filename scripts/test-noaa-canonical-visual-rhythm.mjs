import fs from "node:fs/promises";
import path from "node:path";
import { toStoryboardRenderProps, validateStoryboardRenderProps } from "../lib/storyboard-render-props.js";

const root = process.cwd();
const projectId = "2026-07-17T03-49-04-771Z-330f03";
const projectPath = path.join(root, "projects", projectId, "project.json");
const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
const props = toStoryboardRenderProps(project);
const validation = validateStoryboardRenderProps(props);
const adapters = props.scenes.map((scene) => scene.sourceAssetPack?.adapter?.id || "");
const expectedAdapters = [
  "verified-web-polaroid-frame",
  "verified-web-split-screen",
  "editorial-evidence-window",
  "verified-web-polaroid-frame",
  "verified-web-split-screen",
  "verified-web-polaroid-frame",
  "verified-web-split-screen",
  "editorial-evidence-window",
  "verified-web-polaroid-frame",
  "verified-web-split-screen",
  "editorial-method-grid",
  "editorial-closing-crop",
];
const rhythm = props.qaMetadata?.articleFilmRhythmGate || {};
const checks = {
  projectRecovered: project.project?.id === projectId || project.savedAt,
  sceneCount: props.scenes.length === 12,
  adapterSequence: JSON.stringify(adapters) === JSON.stringify(expectedAdapters),
  noConsecutiveAdapters: adapters.every((adapter, index) => index === 0 || adapter !== adapters[index - 1]),
  rhythmGateReady: rhythm.contract === "A1ArticleFilmRhythmGate/v1"
    && rhythm.shouldRender === true
    && Object.values(rhythm.rules || {}).every((rule) => rule?.ok === true),
  productionVisualsAllowed: props.scenes.every((scene) => scene.productionVisualAdmission?.allowed === true),
  renderPropsValid: validation.ok === true,
};
const outputDir = path.join(root, ".codex-artifacts", "unseen-article", "noaa-current-monitoring", "canonical-visual-rhythm");
await fs.mkdir(outputDir, { recursive: true });
const report = {
  contract: "A1NoaaCanonicalVisualRhythm/v1",
  projectId,
  adapters,
  expectedAdapters,
  rhythm,
  validation,
  checks,
};
const reportPath = path.join(outputDir, "report.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([id]) => id);
if (failures.length) {
  console.error(`NOAA canonical visual rhythm failed: ${failures.join(", ")}`);
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}
console.log(JSON.stringify({ contract: report.contract, reportPath, adapters, rhythmReady: rhythm.shouldRender }, null, 2));
