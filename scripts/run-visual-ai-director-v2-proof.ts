#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {runCodexArticleDirector} from "../apps/studio-next/src/lib/a1-codex-article-director.ts";
import {runVisualAiDirectorV2} from "../apps/studio-next/src/lib/a1-visual-ai-director-v2.ts";

const root = process.cwd();
const phaseId = "visual-ai-director-v2-proof";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const title = "换了不同 AI 模型，文章为什么还是有 AI 味";
const sourceText = `换了不同 AI 模型，文章为什么还是有 AI 味。\n我试过 GPT、Claude、Kimi 和 DeepSeek，模型变多并没有自动解决文章的问题。\n真正的问题不是模型名字，而是通篇没重点，读完留不下什么。\n写作工作台会保留最近五次修改，让每次判断都能被追溯。\n证据页只是材料，作者仍然要决定哪些句子值得强调。\n最后的文章仍然会有不通顺和 AI 味，最后还需要人来修改。`;

const authorityBefore = shaFile(authorityPath);
const startedAt = Date.now();
const articleRun = await runCodexArticleDirector(sourceText, {title});
const priorReportPath = path.join(publicDir, "report.json");
const priorReport = fs.existsSync(priorReportPath) ? JSON.parse(fs.readFileSync(priorReportPath, "utf8")) : null;
const resume = priorReport?.visualDirector?.partial?.strategy && priorReport?.visualDirector?.partial?.strategyTrace
  ? priorReport.visualDirector.partial
  : undefined;
const visualRun = await runVisualAiDirectorV2({title, understanding: articleRun.understanding, resume});
const report = {
  contract: "A1VisualAiDirectorProofReport/v2", phaseId,
  status: visualRun.status === "completed" ? "PASS" : "BLOCKED",
  truth: {aiDesigned: visualRun.status === "completed", fallbackUsed: false, rendererProofSeparate: true},
  source: {title, sourceTextSha256: crypto.createHash("sha256").update(sourceText).digest("hex")},
  articleDirector: {taskId: articleRun.taskId, codexVersion: articleRun.codexVersion, durationMs: articleRun.durationMs, sectionCount: articleRun.understanding.sections.length},
  articleUnderstanding: articleRun.understanding,
  visualDirector: visualRun,
  durationMs: Date.now() - startedAt,
  currentAuthority: {sha256Before: authorityBefore, sha256After: shaFile(authorityPath), unchanged: authorityBefore === shaFile(authorityPath)},
  gates: {aiVisualDirection: visualRun.status === "completed" ? "PASS" : "BLOCKED", resumedArticleVisualStrategy: Boolean(resume), deterministicFallbackAllowedToClaimAiDesign: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
};
writeJson(path.join(artifactDir, "report.json"), report);
writeJson(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, phaseId, articleDirector: report.articleDirector, visualStatus: visualRun.status, traces: visualRun.traces, currentAuthorityUnchanged: report.currentAuthority.unchanged}, null, 2));
if (visualRun.status !== "completed") process.exitCode = 2;
