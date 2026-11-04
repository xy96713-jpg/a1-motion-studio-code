#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import sharp from "sharp";

import {buildEd01IntelligentTypographyCanary} from "./lib/a1-typography-canary-renderer-v1.mjs";
import {buildEd01TypographyMaterialReview} from "./lib/a1-typography-material-renderer-v1.mjs";
import {buildTypographyPairwiseReview, compileTypographyMotionSpec, createTypographyPreferenceLedger, scoreTypographyCandidate} from "./lib/a1-typography-decision-system-v1.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED = path.join(ROOT, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const FONT_ROOT = path.join(ROOT, "apps/studio-next/public/a1-editorial-fonts");
const TOPOLOGIES = ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"];
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const compareScores = (left, right) => {
  const dimensions = ["glyphLegibility", "canvasCoverage", "titleContinuity", "contactCoverage", "occlusionFitness"];
  for (const dimension of dimensions) {
    const delta = right.score.dimensions[dimension] - left.score.dimensions[dimension];
    if (delta) return delta;
  }
  return String(left.candidate.candidateId).localeCompare(String(right.candidate.candidateId));
};

const buildShortlistBoard = async ({shortlist, outputFile}) => {
  const canvas = sharp({create: {width: 1920, height: 720, channels: 4, background: "#101217"}});
  const composites = [];
  for (const [index, candidate] of shortlist.entries()) {
    const left = (index % 3) * 640;
    const top = Math.floor(index / 3) * 360;
    const frame = await sharp(candidate.output.file).resize(640, 360, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="42"><rect width="100%" height="100%" fill="#101217" fill-opacity="0.9"/><text x="12" y="18" fill="#f4ead7" font-family="monospace" font-size="13">${escapeXml(candidate.topology)} · ${escapeXml(candidate.materialRecipeId)}</text><text x="12" y="34" fill="#88d498" font-family="monospace" font-size="11">PASS · min glyph ${(Math.min(...candidate.pixelAudit.glyphVisibility.map((glyph) => glyph.visibleRatio)) * 100).toFixed(1)}% · occ ${(candidate.pixelAudit.titleRelationship.occlusionRatio * 100).toFixed(1)}%</text></svg>`);
    composites.push({input: frame, left, top}, {input: label, left, top});
  }
  await canvas.composite(composites).png().toFile(outputFile);
};

export async function runEd01IntelligentTypographyReview({outputRoot = path.join(ROOT, "work/ed01-intelligent-typography-review-v1")} = {}) {
  fs.mkdirSync(outputRoot, {recursive: true});
  const sourceFile = path.join(GENERATED, "imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
  const maskRoot = path.join(GENERATED, "presenter-depth-title-canary-v1/assets/ED-01");
  const maskFiles = {
    unified: path.join(maskRoot, "ed-01-unified-exclusion-mask.png"),
    face: path.join(maskRoot, "ed-01-face-mask.png"),
    hair: path.join(maskRoot, "ed-01-hair-mask.png"),
    eyes: path.join(maskRoot, "ed-01-eyes-mask.png"),
    mouth: path.join(maskRoot, "ed-01-mouth-mask.png"),
    microphone: path.join(maskRoot, "ed-01-microphone-mask.png"),
    body: path.join(maskRoot, "ed-01-body-mask.png"),
  };
  const geometry = {
    subjectBounds: {left: 634, top: 390, right: 1399, bottom: 1067},
    faceBounds: {left: 964, top: 409, right: 1283, bottom: 627},
  };
  const structure = await buildEd01IntelligentTypographyCanary({
    outputDir: path.join(outputRoot, "structure"),
    sourceFile,
    fontFile: path.join(FONT_ROOT, "SourceHanSerifCN-Heavy.otf"),
    maskFiles,
    exactCopy: "智能写作工具台",
    semanticRuns: ["智能写作", "工具台"],
    geometry,
  });
  const material = await buildEd01TypographyMaterialReview({
    outputDir: path.join(outputRoot, "material"),
    sourceFile,
    maskFiles,
    geometry,
    structureReport: structure.report,
    fontCatalog: {
      SOURCE_HAN_SERIF_HEAVY: path.join(FONT_ROOT, "SourceHanSerifCN-Heavy.otf"),
      SOURCE_HAN_SANS_HEAVY: path.join(FONT_ROOT, "SourceHanSansCN-Heavy.otf"),
      SMILEY_SANS_OBLIQUE: path.join(FONT_ROOT, "SmileySans-Oblique.otf"),
      MA_SHAN_ZHENG: path.join(FONT_ROOT, "MaShanZheng-Regular.ttf"),
    },
  });
  const scored = material.report.candidates.map((candidate) => ({candidate, score: scoreTypographyCandidate(candidate)}));
  const hardPass = scored.filter(({candidate}) => candidate.pixelAudit.status === "PASS");
  const shortlistScored = TOPOLOGIES.flatMap((topology) => hardPass.filter(({candidate}) => candidate.topology === topology).sort(compareScores).slice(0, 2));
  if (shortlistScored.length !== 6) throw new Error(`ed01-typography-shortlist-incomplete:${shortlistScored.length}`);
  const shortlistCandidates = shortlistScored.map(({candidate}) => candidate);
  const pairwise = buildTypographyPairwiseReview({candidates: shortlistCandidates, maximumCandidates: 6});
  const preferenceLedger = createTypographyPreferenceLedger({shotId: "ED-01", candidateIds: pairwise.candidates.map((candidate) => candidate.candidateId)});
  const motionSpecs = {
    contract: "A1Ed01TypographyBlockedMotionSpecs/v1",
    status: "COMPILED_NOT_RENDER_AUTHORIZED",
    specs: shortlistCandidates.map((candidate) => compileTypographyMotionSpec(candidate, {fps: 30, durationFrames: 90, motionAllowed: false})),
  };
  const decisionDir = path.join(outputRoot, "decision");
  const mechanicalScoresFile = path.join(decisionDir, "mechanical-scores.json");
  const pairwiseReviewFile = path.join(decisionDir, "pairwise-review.json");
  const preferenceLedgerFile = path.join(decisionDir, "preference-ledger.json");
  const motionSpecsFile = path.join(decisionDir, "motion-specs.json");
  writeJson(mechanicalScoresFile, {contract: "A1Ed01TypographyMechanicalScoreSet/v1", scores: scored.map(({score}) => score)});
  writeJson(pairwiseReviewFile, pairwise);
  writeJson(preferenceLedgerFile, preferenceLedger);
  writeJson(motionSpecsFile, motionSpecs);
  const preview960Dir = path.join(outputRoot, "shortlist");
  const preview480Dir = path.join(outputRoot, "shortlist-480p");
  fs.mkdirSync(preview960Dir, {recursive: true});
  fs.mkdirSync(preview480Dir, {recursive: true});
  const shortlist = [];
  for (const candidate of shortlistCandidates) {
    const filename = `${candidate.candidateId}.png`;
    const preview960 = path.join(preview960Dir, filename);
    const preview480 = path.join(preview480Dir, filename);
    await sharp(candidate.output.file).resize(960, 540, {fit: "fill"}).png().toFile(preview960);
    await sharp(candidate.output.file).resize(480, 270, {fit: "fill"}).png().toFile(preview480);
    shortlist.push({
      candidateId: candidate.candidateId,
      topology: candidate.topology,
      materialRecipeId: candidate.materialRecipeId,
      sourceFile: candidate.output.file,
      preview960,
      preview480,
      cjkRoleAuditStatus: candidate.cjkRoleAudit.status,
      pixelBalanceStatus: candidate.pixelBalanceAudit.status,
    });
  }
  const shortlistBoardFile = path.join(outputRoot, "ED-01-typography-shortlist-board.png");
  await buildShortlistBoard({shortlist: shortlistCandidates, outputFile: shortlistBoardFile});
  const report = {
    contract: "A1Ed01IntelligentTypographyReviewRun/v1",
    status: material.report.status,
    reviewOnly: true,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    workspaceMutationPerformed: false,
    motionRenderAllowed: false,
    exactCopy: "智能写作工具台",
    auditEngines: {
      cjkRole: {contract: "A1CjkRoleLayoutAudit/v1", heroScope: "DISPLAY_GLYPH_ONLY"},
      pixelBalance: {contract: "A1TypographyPixelBalanceAudit/v1", disposition: "SIGNAL_ONLY_NEVER_AESTHETIC_APPROVAL"},
    },
    counts: {
      structureCandidates: structure.report.candidates.length,
      materialCandidates: material.report.candidates.length,
      materialHardPass: hardPass.length,
      cjkRoleAudited: material.report.candidates.filter((candidate) => candidate.cjkRoleAudit?.contract === "A1CjkRoleLayoutAudit/v1").length,
      pixelBalanceMeasured: material.report.candidates.filter((candidate) => candidate.pixelBalanceAudit?.contract === "A1TypographyPixelBalanceAudit/v1").length,
      shortlist: shortlist.length,
    },
    shortlist,
    files: {
      structureReport: structure.reportFile,
      structureBoard: structure.report.board.file,
      materialReport: material.reportFile,
      materialBoard: material.report.board.file,
      mechanicalScores: mechanicalScoresFile,
      pairwiseReview: pairwiseReviewFile,
      preferenceLedger: preferenceLedgerFile,
      motionSpecs: motionSpecsFile,
      shortlistBoard: shortlistBoardFile,
    },
  };
  const reportFile = path.join(outputRoot, "report.json");
  writeJson(reportFile, report);
  return {report, reportFile};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = await runEd01IntelligentTypographyReview({outputRoot});
  console.log(JSON.stringify({status: result.report.status, reportFile: result.reportFile, counts: result.report.counts}, null, 2));
}
