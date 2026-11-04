import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line");
const workspacePath = path.join(publicRoot, "editorial-asset-workbench-v1/workspace.json");
const currentRunPath = path.join(publicRoot, "current-project-visual-contract-upgrade-v1/current-article-run.json");
const phaseInputPath = path.join(publicRoot, "editorial-asset-workbench-v1/whole-film-director-input.json");
const rawSrtPath = "/Users/a1/Documents/Codex/声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readText = (file) => fs.readFileSync(file, "utf8");

const sourceFiles = [
  workspacePath,
  currentRunPath,
  phaseInputPath,
  path.join(repoRoot, "scripts/build-editorial-asset-workbench-v1.mjs"),
  path.join(appRoot, "src/lib/editorial-production/index.mjs"),
  path.join(appRoot, "src/lib/a1-microbeat-layered-full-plan.ts"),
];

const classifyApiLine = (file, line) => {
  const lower = line.toLowerCase();
  if (/deepseek|api[\s_-]*(调用|handoff|bridge)|通过 api|api.*全文|全文.*deepseek/.test(lower)) return "old-deepseek-workflow-claim";
  if (/codex.*(内置|imagegen|生图)|imagegen.*codex|codex-imagegen|built-in image/.test(lower)) return "codex-built-in-imagegen";
  if (/\/api\/|fetch\([^\n]*api|route\.ts|local.?app.?route|本地动作接口/.test(lower)) return "local-app-route";
  return "other-api-reference";
};

const collectHits = (file) => {
  if (!fs.existsSync(file)) return [];
  return readText(file).split(/\r?\n/).flatMap((line, index) => /api/i.test(line)
    ? [{file: path.relative(repoRoot, file), line: index + 1, text: line.trim().slice(0, 360), classification: classifyApiLine(file, line)}]
    : []);
};

const walk = (root, out = []) => {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (["node_modules", ".next", ".git", ".codex-artifacts", "dist", "build"].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(mjs|js|ts|tsx|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
};

const workspace = readJson(workspacePath);
const run = readJson(currentRunPath);
const phaseInput = readJson(phaseInputPath);
const ed20Demand = workspace.assetRequirementGraph.shotDemands.find((shot) => shot.shotId === "ED-20");
const ed20Asset = workspace.library.assets.find((asset) => asset.id === "composition-ED-20");
const ed20Brief = workspace.production.visualDirector.shotBriefs.find((brief) => brief.shotId === "ED-20");
const rawSrtSha256 = sha256File(rawSrtPath);
const allActiveFiles = [...new Set([...sourceFiles, ...walk(path.join(appRoot, "src")), ...walk(path.join(repoRoot, "scripts"))])];
const apiHits = allActiveFiles.flatMap(collectHits);
const byClassification = Object.fromEntries([...new Set(apiHits.map((hit) => hit.classification))].map((classification) => [classification, apiHits.filter((hit) => hit.classification === classification)]));

const report = {
  contract: "A1ED20SourceFactCorrectionImpactAudit/v1",
  status: "READ_ONLY_IMPACT_AUDIT",
  generatedAt: new Date().toISOString(),
  authority: {
    workspacePath: path.relative(repoRoot, workspacePath),
    workspaceSha256: workspace.workspaceSha256,
    phaseInputSha256: sha256File(phaseInputPath),
    currentRunSha256: sha256File(currentRunPath),
    policySha256: workspace.policy?.visualGenerationPolicySha256 || workspace.visualBible?.visualGenerationPolicy?.sha256 || null,
  },
  rawSource: {
    path: rawSrtPath,
    sha256: rawSrtSha256,
    cueIdsRetained: [58, 59],
    cueIdsExcludedFromSemanticLayer: [60, 61],
    nonDestructive: true,
  },
  ed20: {
    currentDemand: {
      sourceText: ed20Demand?.sourceText,
      sourceCueIds: ed20Demand?.cueIds,
      keyPhrases: ed20Demand?.keyPhrases,
      visualJob: ed20Demand?.visualJob,
      primaryActor: ed20Demand?.primaryActor,
      requiredMaterialIds: ed20Demand?.requiredMaterialIds,
      candidateAssetIds: ed20Demand?.candidateAssetIds,
      materialGate: ed20Demand?.materialGate,
      handoffActor: ed20Demand?.referenceConditioning?.handoffActor,
    },
    currentAsset: {
      id: ed20Asset?.id,
      candidateCount: ed20Asset?.candidates?.length || 0,
      selectedCandidateId: ed20Asset?.selectedCandidateId || null,
      revisionHistoryCount: ed20Asset?.revisionHistory?.length || 0,
      bestEffectHeroFrame: ed20Asset?.bestEffectHeroFrame || null,
      candidateSetAudit: ed20Asset?.candidateSetAudit || null,
    },
    currentVisualBrief: {
      semanticBeat: ed20Brief?.semanticBeat,
      visualTask: ed20Brief?.visualTask,
      subject: ed20Brief?.subject,
      assignedPackagingAssetIds: ed20Brief?.assignedPackagingAssetIds,
      referenceInputs: ed20Brief?.referenceInputs?.filter((item) => /deepseek|api|approved-/i.test(JSON.stringify(item))) || [],
    },
    currentRunShot: run.plan?.shots?.find((shot) => shot.shotId === "ED-20") || null,
    phaseInputShot: phaseInput.plan?.shots?.find((shot) => shot.shotId === "ED-20") || null,
  },
  downstreamDependencies: {
    oldRequiredMaterialIds: ed20Asset?.shotDemand?.requiredMaterialIds || [],
    oldCandidateAssetIds: ed20Asset?.shotDemand?.candidateAssetIds || [],
    invalidationScope: ["ED-20 candidate set", "ED-20 visual review", "ED-20 downstream binding", "ED-20 DeepSeek/API requirement records"],
    preservedShotIds: workspace.library.assets.filter((asset) => asset.route === "shot-composition" && asset.id !== "composition-ED-20").map((asset) => asset.shotDemand?.shotId).filter(Boolean),
  },
  apiAudit: {
    scannedFileCount: allActiveFiles.length,
    hitCount: apiHits.length,
    counts: Object.fromEntries(Object.entries(byClassification).map(([key, hits]) => [key, hits.length])),
    samples: Object.fromEntries(Object.entries(byClassification).map(([key, hits]) => [key, hits.slice(0, 24)])),
    rule: "local-app-route 保留技术名；Codex 内置生图不得写成外部付费 API；旧 DeepSeek workflow claim 从当前叙事移除，历史证据只保留为 invalidated read-only history。",
  },
};

if (process.argv.includes("--persist")) {
  const artifactDir = path.join(repoRoot, ".codex-artifacts/system-progress-system-line/ed20-source-fact-correction-v1");
  const publicDir = path.join(publicRoot, "ed20-source-fact-correction-v1");
  for (const dir of [artifactDir, publicDir]) fs.mkdirSync(dir, {recursive: true});
  const suffix = process.argv.includes("--after") ? "after" : "before";
  for (const file of [path.join(artifactDir, `impact-audit-${suffix}.json`), path.join(publicDir, `impact-audit-${suffix}.json`)]) {
    const temporary = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, file);
  }
}

console.log(JSON.stringify(report, null, 2));
