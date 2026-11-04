#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileA1VisualAiDesignBoardV2, type A1VisualFamilyId, type A1VisualMaterialBindingV2} from "../apps/studio-next/src/lib/a1-visual-ai-design-board-v2.ts";

const root = process.cwd();
const phaseId = "visual-ai-design-board-v2-proof";
const sourcePath = path.join(root, "apps/studio-next/public/generated/system-line/visual-ai-director-v2-proof/report.json");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const shaFile = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const rendererPublic = path.join(root, "remotion-renderer/public");
const material = (binding: Omit<A1VisualMaterialBindingV2, "sha256"> & {assetUri: string}): A1VisualMaterialBindingV2 => ({...binding, sha256: shaFile(path.join(rendererPublic, binding.assetUri))});

const materials: A1VisualMaterialBindingV2[] = [
  material({bindingId: "official-openai", route: "official-entity", assetUri: "entity-icons/openai.svg", sourceUri: "https://openai.com/brand/", reviewed: true, generatedTextReviewed: false, shotIds: ["section-02"], entityLabels: ["GPT"], provenance: "project official entity icon registry"}),
  material({bindingId: "official-anthropic", route: "official-entity", assetUri: "brand-evidence-calibration/anthropic-official.png", sourceUri: "https://www.anthropic.com/", reviewed: true, generatedTextReviewed: false, shotIds: ["section-02"], entityLabels: ["Claude"], provenance: "captured official Anthropic entity evidence"}),
  material({bindingId: "official-kimi", route: "official-entity", assetUri: "brand-evidence-calibration/kimi-official.svg", sourceUri: "https://www.kimi.com/", reviewed: true, generatedTextReviewed: false, shotIds: ["section-02"], entityLabels: ["Kimi"], provenance: "captured official Kimi entity evidence"}),
  material({bindingId: "official-deepseek", route: "official-entity", assetUri: "brand-evidence-calibration/deepseek-official.png", sourceUri: "https://www.deepseek.com/", reviewed: true, generatedTextReviewed: false, shotIds: ["section-02"], entityLabels: ["DeepSeek"], provenance: "captured official DeepSeek entity evidence"}),
  material({bindingId: "current-writing-source", route: "real-evidence", assetUri: "editorial-documentary-reset-v1/source/document-surface.png", sourceUri: "local://current-writing-workflow/document-surface", reviewed: true, generatedTextReviewed: false, shotIds: ["section-05"], entityLabels: [], provenance: "real current writing-workflow source capture"}),
];

const families = [
  "R01-image-title-collision", "R02-document-macro-scan", "R03-evidence-number-impact", "R04-image-repeat-collage", "R05-triptych-roles",
  "R06-editorial-quote-strip", "R07-isolated-glyph-poster", "R08-vertical-shutter-expansion", "R09-object-path-annotation", "R10-dark-finale",
] as A1VisualFamilyId[];
const rendererFamilies = Object.fromEntries(families.map((family) => [family, fs.existsSync(path.join(root, "remotion-renderer/src/visual-ai-v2/families", `${family.slice(0, 3)}.tsx`))])) as Record<A1VisualFamilyId, boolean>;

const board = compileA1VisualAiDesignBoardV2({
  projectId: phaseId,
  sourceTextSha256: source.source.sourceTextSha256,
  director: source.visualDirector,
  rendererFamilies,
  materials,
});
const report = {
  ...board,
  proof: {sourceReport: path.relative(root, sourcePath), sourceReportSha256: shaFile(sourcePath), rendererRegistryDerivedFromFiles: true},
  currentAuthority: source.currentAuthority,
};
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "design-board.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId, "design-board.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/visualAiDesignBoardV2Props.json");
writeJson(publicPath, report);
writeJson(artifactPath, report);
writeJson(rendererPropsPath, report);
console.log(JSON.stringify({status: report.status, aiDesigned: report.aiDesigned, fallbackUsed: report.fallbackUsed, summary: "summary" in report ? report.summary : null, blockers: report.blockers, publicPath: path.relative(root, publicPath)}, null, 2));
