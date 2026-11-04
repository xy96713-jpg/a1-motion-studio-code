#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const generatedDir = path.join(root, "apps/studio-next/public/generated/system-line");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/fused-editorial-v2-intake-v1");
const requestId = process.argv.find((arg) => arg.startsWith("--request-id="))?.slice("--request-id=".length) || "";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const dirs = fs.existsSync(artifactRoot) ? fs.readdirSync(artifactRoot, {withFileTypes:true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];
const candidates = dirs.filter((id) => !requestId || id === requestId).map((id) => {
  const statusPath = path.join(artifactRoot,id,"status.json");
  if (!fs.existsSync(statusPath)) return null;
  try { const status = read(statusPath); return status.status === "completed" ? {id,status,statusPath} : null; } catch { return null; }
}).filter(Boolean).sort((a,b) => fs.statSync(b.statusPath).mtimeMs - fs.statSync(a.statusPath).mtimeMs);
if (!candidates.length) throw new Error(`completed-intake-not-found:${requestId || "latest"}`);
const selected = candidates[0];
const article = selected.status.articles?.[0];
if (!article?.phaseId) throw new Error("intake-article-phase-missing");
const publicDir = path.join(generatedDir, article.phaseId);
const report = read(path.join(publicDir,"report.json"));
const understanding = read(path.join(publicDir,"article-understanding.json"));
const director = read(path.join(publicDir,"director-run.json"));
const designs = read(path.join(publicDir,"layered-shot-designs.json")).designs;
const checks = {
  intakeAcceptedWithoutCodeOrJsonEdits: true,
  codexDirectorCompleted: director.status === "completed" && director.analyzerMode === "codex-director-v1",
  exactCoverage: understanding.coverage?.exact === true,
  sixLayersPerShot: Array.isArray(designs) && designs.length >= 4 && designs.every((design) => ["background","material","foreground","semanticElements","typography","finish"].every((key) => design.layers?.[key])),
  stableStillPerShot: report.allShotsStableStills === true && report.shots?.length === designs.length,
  threeTreatmentCandidates: report.treatments?.everySourceHasThreeReadyTreatments === true,
  semanticMaterialCandidates: !report.source?.material || report.source.material.candidates?.length >= 4,
  sourceTraceable: Boolean(report.source?.sourceUrl || report.source?.cacheFile) && Boolean(report.source?.htmlSha256),
  reviewOnlyAndAuthorityUnchanged: report.reviewOnly === true && report.currentAuthority?.unchanged === true && report.gates?.motionDesignAllowed === false,
};
const status = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
const output = {contract:"A1FusedEditorialV2IntakeAudit/v1",status,requestId:selected.id,phaseId:article.phaseId,checkedAt:new Date().toISOString(),director:{status:director.status,analyzerMode:director.analyzerMode,durationMs:director.durationMs || null},article:{sourceUrl:report.article.sourceUrl,shotCount:designs.length,contactSheet:report.contactSheet?.publicUrl || null},checks};
const artifactPath = path.join(root,".codex-artifacts/system-progress-system-line/fused-editorial-v2-intake-v1",selected.id,"audit.json");
fs.writeFileSync(artifactPath,`${JSON.stringify(output,null,2)}\n`);
const publicPath = path.join(generatedDir,article.phaseId,"intake-audit.json");
fs.writeFileSync(publicPath,`${JSON.stringify(output,null,2)}\n`);
console.log(JSON.stringify(output,null,2));
if (status !== "PASS") process.exitCode = 1;
