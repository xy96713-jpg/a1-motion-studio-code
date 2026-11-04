import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://127.0.0.1:4311";
const sourceText = "NASA公布月球基地漫游车与着陆器计划。首个任务预计在2026年秋季发射，先把基础设施送到月球南极。团队将通过漫游车和无人着陆器建立持续运行能力。真正的难点不是抵达，而是如何在极端环境里长期工作。最后，持续监测和分阶段推进比一次性预测更可靠。";

const response = await fetch(`${baseUrl}/api/a1-compile-template-timeline`, {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify({title: "月球基地计划", sourceText}),
});
const payload = await response.json();
if (!response.ok || !payload.ok) throw new Error(payload.error || `layer audit request failed: ${response.status}`);
const results = Array.isArray(payload.gates?.results) ? payload.gates.results : [];
const required = ["background", "typography", "semantic-elements", "asset-route", "motion", "continuity"];
const failures = [];
for (const result of results) {
  if (result.layerGate !== "pass" || result.layerCompleteness !== "pass") failures.push(`${result.shotId}: layer gate ${result.layerGate || "missing"}`);
}
if (results.length !== Number(payload.state?.shots?.length || 0)) failures.push("shot count and gate count differ");
if (payload.gates?.exportReady !== true) failures.push("compiled sample is not export-ready");

const report = {
  contract: "A1ArticleLayerCompletenessAudit/v1",
  generatedAt: new Date().toISOString(),
  baseUrl,
  source: {title: "月球基地计划", sentenceCount: sourceText.split("。").filter(Boolean).length},
  requiredLayers: required,
  status: failures.length ? "FAIL" : "PASS",
  shotCount: results.length,
  layerPassShotCount: results.filter((result) => result.layerGate === "pass").length,
  gateExportReady: payload.gates?.exportReady === true,
  failures,
  results: results.map((result) => ({shotId: result.shotId, layerGate: result.layerGate, layerCompleteness: result.layerCompleteness, blockers: result.blockers.filter((item) => item.includes("层"))})),
};
const artifactDir = path.join(root, ".codex-artifacts", "system-progress-system-line", "article-layer-completeness-v1");
const publicDir = path.join(root, "apps", "studio-next", "public", "generated", "system-line", "article-layer-completeness-v1");
await fs.mkdir(artifactDir, {recursive: true});
await fs.mkdir(publicDir, {recursive: true});
await fs.writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(publicDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
