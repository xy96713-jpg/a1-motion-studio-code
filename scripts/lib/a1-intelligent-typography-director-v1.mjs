import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONFIG_FILE = path.resolve(import.meta.dirname, "../../configs/typography-packaging/a1-intelligent-typography-director-v1.json");
const SHA256 = /^[a-f0-9]{64}$/u;
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clone = (value) => structuredClone(value);

export function loadIntelligentTypographyConfig(file = CONFIG_FILE) {
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (value?.contract !== "A1IntelligentTypographyDirectorConfig/v1") throw new Error("intelligent-typography-config-contract-invalid");
  const totalWeight = Object.values(value.scoringWeights || {}).reduce((sum, item) => sum + Number(item), 0);
  if (Math.abs(totalWeight - 1) > 1e-9) throw new Error(`intelligent-typography-score-weight-total-invalid:${totalWeight}`);
  if (value.authority?.productionAdmission !== false || value.authority?.workspaceMutationAllowed !== false) throw new Error("intelligent-typography-authority-boundary-invalid");
  return value;
}

const validateSha = (value, label) => {
  if (!SHA256.test(String(value || ""))) throw new Error(`${label}-sha-invalid`);
};

const validateBounds = (bounds, label, width, height) => {
  if (!bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)) throw new Error(`${label}-bounds-invalid`);
  if (bounds.left < 0 || bounds.top < 0 || bounds.right <= bounds.left || bounds.bottom <= bounds.top || bounds.right > width || bounds.bottom > height) throw new Error(`${label}-bounds-out-of-range`);
};

const resolveTypographyRole = ({semanticEvent, carrier}) => {
  const event = String(semanticEvent || "").trim().toUpperCase();
  if (carrier === "PRESENTER_BASE" && ["IDENTITY", "STRONG_CONTRAST", "PERSONAL_STAKES", "EMOTIONAL_REACTION"].includes(event)) return "PRESENTER_HERO";
  if (["QUESTION", "VERDICT", "CONCLUSION", "CHAPTER_BREAK"].includes(event)) return "FULLSCREEN_HERO";
  return "NO_TYPE";
};

export function buildTypographyDesignBrief(input = {}, {config = loadIntelligentTypographyConfig()} = {}) {
  const exactCopy = String(input.exactCopy || "");
  if (!exactCopy.trim()) throw new Error("intelligent-typography-exact-copy-required");
  if (!Array.isArray(input.semanticRuns) || input.semanticRuns.length < 1 || input.semanticRuns.some((item) => !String(item).trim())) throw new Error("intelligent-typography-semantic-runs-required");
  if (input.semanticRuns.join("") !== exactCopy) throw new Error("intelligent-typography-semantic-runs-copy-mismatch");
  const source = clone(input.source || {});
  validateSha(source.sha256, "intelligent-typography-source");
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0) throw new Error("intelligent-typography-source-dimensions-invalid");
  const requiredMasks = ["unified", "face", "hair", "eyes", "mouth", "microphone"];
  const masks = clone(input.masks || {});
  for (const role of requiredMasks) {
    if (!masks[role]?.file) throw new Error(`intelligent-typography-mask-file-missing:${role}`);
    validateSha(masks[role].sha256, `intelligent-typography-mask-${role}`);
  }
  const geometry = clone(input.geometry || {});
  validateBounds(geometry.subjectBounds, "intelligent-typography-subject", source.width, source.height);
  validateBounds(geometry.faceBounds, "intelligent-typography-face", source.width, source.height);
  const typographyRole = resolveTypographyRole(input);
  const allowedTopologies = typographyRole === "PRESENTER_HERO" ? [...config.presenterHeroTopologies] : [];
  const brief = {
    contract: "A1TypographyDesignBrief/v1",
    version: 1,
    shotId: String(input.shotId || ""),
    exactCopy,
    semanticEvent: String(input.semanticEvent || "").trim().toUpperCase(),
    carrier: String(input.carrier || ""),
    typographyRole,
    copyStructure: {
      readingOrder: input.semanticRuns.map((_, index) => index),
      semanticRuns: input.semanticRuns.map((text, index) => ({id: `run-${index + 1}`, text})),
    },
    source,
    masks,
    geometry,
    allowedTopologies,
    renderStage: config.candidateGeneration.renderStage,
    productionAdmission: false,
    userVisualApproval: config.authority.userVisualApproval,
    workspaceMutationAllowed: false,
    motionAllowed: false,
    briefSha256: null,
  };
  brief.briefSha256 = hash({...brief, briefSha256: null});
  return brief;
}

const TOPOLOGY_VARIANTS = Object.freeze({
  SUBJECT_CARVED_WALL: [
    {run1: [0.02, -0.12, 0.34, 0.72, -2], run2: [-0.18, 0.43, 0.37, 0.82, 1], contacts: ["HEAD", "LEFT_SHOULDER", "RIGHT_SHOULDER"]},
    {run1: [-0.08, -0.08, 0.37, 0.68, 1], run2: [-0.10, 0.48, 0.35, 0.88, -2], contacts: ["HEAD", "RIGHT_SHOULDER", "MICROPHONE"]},
    {run1: [-0.033, -0.20, 0.32, 0.78, -4], run2: [-0.327, 0.24, 0.30, 0.68, 2], contacts: ["HEAD", "LEFT_SHOULDER", "MICROPHONE"]},
    {run1: [-0.14, -0.04, 0.39, 0.66, 3], run2: [0.02, 0.50, 0.33, 0.92, -1], contacts: ["HEAD", "RIGHT_SHOULDER", "HAND"]},
  ],
  ORBITAL_PHRASE_FIELD: [
    {run1: [-0.38, -0.02, 0.31, 0.68, -5], run2: [0.24, 0.28, 0.32, 0.78, 5], contacts: ["HEAD", "HAND", "RIGHT_SHOULDER"]},
    {run1: [-0.42, 0.08, 0.34, 0.62, 4], run2: [0.18, 0.36, 0.29, 0.86, -4], contacts: ["HEAD", "LEFT_SHOULDER", "HAND"]},
    {run1: [-0.39, -0.20, 0.29, 0.76, -2], run2: [0.09, 0.24, 0.27, 0.68, 3], contacts: ["HEAD", "RIGHT_SHOULDER", "MICROPHONE"]},
    {run1: [-0.46, 0.00, 0.36, 0.60, 6], run2: [0.14, 0.44, 0.30, 0.90, -6], contacts: ["HEAD", "LEFT_SHOULDER", "MICROPHONE"]},
  ],
  EDGE_CROP_TAKEOVER: [
    {run1: [-0.10, -0.10, 0.42, 0.76, -3], run2: [0.10, 0.46, 0.41, 0.84, 2], contacts: ["HEAD", "LEFT_SHOULDER", "MICROPHONE"]},
    {run1: [-0.18, -0.02, 0.38, 0.86, 2], run2: [0.18, 0.40, 0.44, 0.76, -3], contacts: ["HEAD", "RIGHT_SHOULDER", "HAND"]},
    {run1: [0.012, -0.27, 0.42, 0.66, -5], run2: [0.32, 0.23, 0.27, 0.72, 4], contacts: ["HEAD", "LEFT_SHOULDER", "RIGHT_SHOULDER"]},
    {run1: [-0.22, 0.04, 0.40, 0.82, 4], run2: [0.22, 0.34, 0.42, 0.80, -5], contacts: ["HEAD", "RIGHT_SHOULDER", "MICROPHONE"]},
  ],
});

const runFromSeed = ({seed, run, index, topology, width, height, subjectBounds, faceBounds}) => {
  const [offsetX, offsetY, sizeRatio, scaleX, rotation] = seed;
  const faceCenterX = (faceBounds.left + faceBounds.right) / 2;
  const anchorX = topology === "ORBITAL_PHRASE_FIELD"
    ? faceCenterX
    : topology === "EDGE_CROP_TAKEOVER"
      ? (index === 0 ? 0 : subjectBounds.left)
      : subjectBounds.left;
  const anchorY = index === 0 ? faceBounds.top : subjectBounds.top;
  return {
    id: run.id,
    text: run.text,
    left: anchorX + offsetX * width,
    top: anchorY + offsetY * height,
    size: sizeRatio * height,
    scaleX,
    scaleY: 1,
    rotation,
    fill: index === 0 ? "#f4ead7" : "#ffffff",
  };
};

export function compilePresenterHeroStructureCandidates(brief, {config = loadIntelligentTypographyConfig()} = {}) {
  if (brief?.contract !== "A1TypographyDesignBrief/v1" || brief.typographyRole !== "PRESENTER_HERO") throw new Error("intelligent-typography-presenter-brief-required");
  if (brief.renderStage !== "STRUCTURE_ONLY" || brief.productionAdmission !== false) throw new Error("intelligent-typography-brief-stage-invalid");
  if (!Array.isArray(brief.copyStructure?.semanticRuns) || brief.copyStructure.semanticRuns.length !== 2) throw new Error("intelligent-typography-presenter-structure-requires-exactly-two-semantic-runs");
  if (brief.copyStructure.semanticRuns.some((run) => !String(run.text || "").trim()) || brief.copyStructure.semanticRuns.map((run) => run.text).join("") !== brief.exactCopy) throw new Error("intelligent-typography-presenter-structure-copy-binding-invalid");
  const {width, height} = brief.source;
  const candidates = [];
  for (const topology of brief.allowedTopologies) {
    const variants = TOPOLOGY_VARIANTS[topology];
    if (!variants || variants.length !== config.candidateGeneration.perTopology) throw new Error(`intelligent-typography-topology-variants-invalid:${topology}`);
    for (const [index, variant] of variants.entries()) {
      const runs = brief.copyStructure.semanticRuns.map((run, runIndex) => runFromSeed({
        seed: runIndex === 0 ? variant.run1 : variant.run2,
        run,
        index: runIndex,
        topology,
        width,
        height,
        subjectBounds: brief.geometry.subjectBounds,
        faceBounds: brief.geometry.faceBounds,
      }));
      const candidate = {
        contract: "A1TypographyStructureCandidatePlan/v1",
        version: 1,
        candidateId: `${brief.shotId}-${topology.toLowerCase().replaceAll("_", "-")}-v${index + 1}`,
        briefSha256: brief.briefSha256,
        topology,
        variant: index + 1,
        exactCopy: brief.exactCopy,
        runs,
        contactTargets: [...variant.contacts],
        structureStyle: {offset: {x: 7, y: 7, fill: "#111217", opacity: 0.74}},
        materialRecipe: null,
        renderStage: "STRUCTURE_ONLY",
        productionAdmission: false,
        userVisualApproval: "NOT_APPROVED",
        planSha256: null,
      };
      candidate.planSha256 = hash({...candidate, planSha256: null});
      candidates.push(candidate);
    }
  }
  return candidates;
}
