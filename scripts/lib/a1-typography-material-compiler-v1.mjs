import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {buildGlyphPathRun, loadBilingualTitleFont} from "./a1-bilingual-title-svg-v1.mjs";

const CONFIG_FILE = path.resolve(import.meta.dirname, "../../configs/typography-packaging/a1-intelligent-typography-materials-v1.json");
const TOPOLOGIES = ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const stableHash = (value) => sha256(JSON.stringify(value));

export function loadTypographyMaterialConfig(file = CONFIG_FILE) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (config.contract !== "A1IntelligentTypographyMaterialConfig/v1") throw new Error("typography-material-config-contract-invalid");
  if (!Array.isArray(config.recipes) || config.recipes.length < 2) throw new Error("typography-material-recipes-required");
  const ids = config.recipes.map((recipe) => recipe.id);
  if (new Set(ids).size !== ids.length) throw new Error("typography-material-recipe-id-duplicate");
  return config;
}

const selectStructureSurvivor = (candidates, topology) => {
  const eligible = candidates
    .filter((candidate) => candidate.topology === topology && candidate.pixelAudit?.status === "PASS" && Array.isArray(candidate.runs) && candidate.runs.length > 0)
    .sort((left, right) => {
      const leftRatio = left.pixelAudit?.titleRelationship?.occlusionRatio ?? 0.08;
      const rightRatio = right.pixelAudit?.titleRelationship?.occlusionRatio ?? 0.08;
      return Math.abs(leftRatio - 0.08) - Math.abs(rightRatio - 0.08) || String(left.candidateId).localeCompare(String(right.candidateId));
    });
  if (!eligible.length) throw new Error(`typography-material-missing-structure-survivor:${topology}`);
  return eligible[0];
};

const bindFont = ({role, file, exactCopy}) => {
  if (!file || !fs.existsSync(file)) throw new Error(`typography-material-font-missing:${role}`);
  const binding = loadBilingualTitleFont(file, role.toLowerCase());
  const glyphIds = binding.font.layout(exactCopy).glyphs.map((glyph) => glyph?.id || 0);
  if (!glyphIds.length || glyphIds.some((glyphId) => glyphId <= 0)) throw new Error(`typography-material-font-missing-glyph:${role}`);
  return {binding, metadata: {
    role,
    file,
    sha256: fileSha256(file),
    family: binding.family,
    postscriptName: binding.postscriptName,
    glyphIds,
  }};
};

const fitRunToStructureInk = ({run, target, fontBinding, initialScaleMultiplier}) => {
  if (!target?.bounds) throw new Error(`typography-material-structure-ink-bounds-required:${run.id}`);
  const initialScaleX = run.scaleX * initialScaleMultiplier;
  const probe = buildGlyphPathRun({...run, id: `${run.id}-fit-probe`, fontBinding, scaleX: initialScaleX, fill: "#ffffff"});
  const heightFactor = target.bounds.height / probe.bounds.height;
  const fittedSize = run.size * heightFactor;
  const widthAfterHeightFit = probe.bounds.width * heightFactor;
  const fittedScaleX = initialScaleX * target.bounds.width / widthAfterHeightFit;
  const fitted = buildGlyphPathRun({...run, id: `${run.id}-fit-result`, fontBinding, left: target.bounds.left, top: target.bounds.top, size: fittedSize, scaleX: fittedScaleX, fill: "#ffffff"});
  return {
    ...run,
    left: target.bounds.left,
    top: target.bounds.top,
    size: fittedSize,
    scaleX: fittedScaleX,
    fitMode: "MATCH_STRUCTURE_INK_BOUNDS",
    structureTargetBounds: target.bounds,
    fitAudit: {
      widthErrorRatio: Math.abs(fitted.bounds.width - target.bounds.width) / target.bounds.width,
      heightErrorRatio: Math.abs(fitted.bounds.height - target.bounds.height) / target.bounds.height,
      fittedBounds: fitted.bounds,
    },
  };
};

export function compileTypographyMaterialCandidates({structureCandidates, fontCatalog, config = loadTypographyMaterialConfig()}) {
  if (!Array.isArray(structureCandidates)) throw new Error("typography-material-structure-candidates-required");
  const survivors = Object.fromEntries(TOPOLOGIES.map((topology) => [topology, selectStructureSurvivor(structureCandidates, topology)]));
  const plans = [];
  for (const topology of TOPOLOGIES) {
    const structure = survivors[topology];
    for (const recipe of config.recipes) {
      const fontBinding = bindFont({role: recipe.fontRole, file: fontCatalog?.[recipe.fontRole], exactCopy: structure.exactCopy});
      const runs = structure.runs.map((run) => fitRunToStructureInk({
        run,
        target: structure.glyphRuns?.find((glyphRun) => glyphRun.id === run.id),
        fontBinding: fontBinding.binding,
        initialScaleMultiplier: recipe.fontScaleXMultiplier,
      }));
      const plan = {
        contract: "A1TypographyMaterialCandidatePlan/v1",
        version: 1,
        candidateId: `${structure.candidateId}-${recipe.id.toLowerCase().replaceAll("_", "-")}`,
        topology,
        exactCopy: structure.exactCopy,
        visibleCopy: runs.map((run) => run.text),
        structureCandidateId: structure.candidateId,
        structurePlanSha256: structure.planSha256,
        structurePixelAuditStatus: structure.pixelAudit.status,
        materialRecipeId: recipe.id,
        font: fontBinding.metadata,
        runs,
        material: {
          gradient: recipe.gradient,
          stroke: recipe.stroke,
          depth: recipe.depth,
          glow: recipe.glow,
          addedDecorativeCopy: [...config.policy.addedDecorativeCopy],
        },
        renderStage: "MATERIAL_CANDIDATE",
        reviewOnly: true,
        productionAdmission: false,
        userVisualApproval: "NOT_APPROVED",
        planSha256: null,
      };
      plan.planSha256 = stableHash({...plan, planSha256: null});
      plans.push(plan);
    }
  }
  return plans;
}
