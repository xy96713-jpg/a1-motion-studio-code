import crypto from "node:crypto";

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const TOPOLOGY_OCCLUSION_TARGET = {
  SUBJECT_CARVED_WALL: 0.1,
  ORBITAL_PHRASE_FIELD: 0.06,
  EDGE_CROP_TAKEOVER: 0.06,
};

export function scoreTypographyCandidate(candidate) {
  const audit = candidate?.pixelAudit;
  if (!audit) throw new Error("typography-score-pixel-audit-required");
  const glyphs = audit.glyphVisibility || [];
  const minimumVisible = glyphs.length ? Math.min(...glyphs.map((glyph) => glyph.visibleRatio)) : 0;
  const minimumCanvas = glyphs.length ? Math.min(...glyphs.map((glyph) => glyph.canvasCoverageRatio)) : 0;
  const occlusionTarget = TOPOLOGY_OCCLUSION_TARGET[candidate.topology] ?? 0.08;
  const occlusionRatio = audit.titleRelationship?.occlusionRatio ?? 0;
  const dimensions = {
    sourceIntegrity: audit.sourceProtection?.changedPixels === 0 ? 1 : 0,
    glyphLegibility: clamp01(minimumVisible),
    canvasCoverage: clamp01(minimumCanvas),
    contactCoverage: clamp01((audit.contactGraph?.actualZones?.length || 0) / 3),
    titleContinuity: clamp01((audit.titleRelationship?.continuationSides || 0) / 2),
    occlusionFitness: clamp01(1 - Math.abs(occlusionRatio - occlusionTarget) / Math.max(0.04, occlusionTarget)),
  };
  return {
    contract: "A1TypographyMechanicalScore/v1",
    candidateId: candidate.candidateId,
    machineEligibility: audit.status === "PASS" ? "PASS" : "FAIL",
    dimensions,
    visualDimensions: {
      semanticHierarchy: "PENDING_VISUAL_REVIEW",
      subjectTypeInterdependence: "PENDING_VISUAL_REVIEW",
      balanceAndWhitespace: "PENDING_VISUAL_REVIEW",
      backgroundInterference: "PENDING_VISUAL_REVIEW",
      sequenceContrast: "PENDING_TIMELINE_REVIEW",
    },
  };
}

export function buildTypographyPairwiseReview({candidates, maximumCandidates = 6}) {
  if (!Array.isArray(candidates) || candidates.length < 2) throw new Error("typography-pairwise-candidates-required");
  if (candidates.some((candidate) => candidate.pixelAudit?.status !== "PASS")) throw new Error("typography-pairwise-hard-pass-candidates-only");
  const selected = [...candidates]
    .map((candidate) => ({candidate, score: scoreTypographyCandidate(candidate)}))
    .sort((left, right) => {
      const dimensions = ["glyphLegibility", "canvasCoverage", "titleContinuity", "contactCoverage", "occlusionFitness"];
      for (const dimension of dimensions) {
        const delta = right.score.dimensions[dimension] - left.score.dimensions[dimension];
        if (delta) return delta;
      }
      return String(left.candidate.candidateId).localeCompare(String(right.candidate.candidateId));
    })
    .slice(0, maximumCandidates)
    .map(({candidate}) => candidate);
  const boundCandidates = selected.map((candidate) => ({
    candidateId: candidate.candidateId,
    topology: candidate.topology,
    materialRecipeId: candidate.materialRecipeId,
    planSha256: candidate.planSha256 || candidate.structurePlanSha256 || null,
    outputFile: candidate.output.file,
    outputSha256: candidate.output.sha256,
  }));
  const pairs = [];
  for (let left = 0; left < boundCandidates.length; left += 1) {
    for (let right = left + 1; right < boundCandidates.length; right += 1) {
      pairs.push({
        pairId: `pair-${String(pairs.length + 1).padStart(2, "0")}`,
        left: boundCandidates[left],
        right: boundCandidates[right],
        verdict: "PENDING_VISUAL_CRITIC",
      });
    }
  }
  return {
    contract: "A1TypographyPairwiseVisualReview/v1",
    version: 1,
    criteria: ["semanticHierarchy", "readingPath", "subjectTypeInterdependence", "contactPurpose", "balanceAndWhitespace", "backgroundInterference", "smallScaleLegibility", "materialDuty"],
    candidates: boundCandidates,
    pairs,
    decisionAuthority: "VISUAL_CRITIC_COMPARISON_ONLY",
    userVisualApproval: "NOT_APPROVED",
    productionAdmission: false,
  };
}

export function createTypographyPreferenceLedger({shotId, candidateIds}) {
  if (!shotId || !Array.isArray(candidateIds) || !candidateIds.length || new Set(candidateIds).size !== candidateIds.length) throw new Error("typography-preference-ledger-input-invalid");
  const ledger = {
    contract: "A1TypographyPreferenceLedger/v1",
    version: 1,
    shotId,
    candidateIds: [...candidateIds],
    status: "AWAITING_USER_DECISION",
    entries: [],
    productionAdmission: false,
  };
  return {...ledger, ledgerSha256: hash(ledger)};
}

export function recordTypographyPreference(ledger, decision) {
  if (ledger?.contract !== "A1TypographyPreferenceLedger/v1") throw new Error("typography-preference-ledger-invalid");
  if (decision?.actor !== "USER" || !String(decision.evidence || "").trim()) throw new Error("typography-preference-explicit-user-decision-required");
  if (!ledger.candidateIds.includes(decision.selectedCandidateId)) throw new Error("typography-preference-candidate-not-in-ledger");
  const rejected = decision.rejectedCandidateIds || [];
  if (rejected.some((candidateId) => !ledger.candidateIds.includes(candidateId))) throw new Error("typography-preference-rejected-candidate-not-in-ledger");
  const next = structuredClone(ledger);
  next.status = "USER_SELECTION_RECORDED";
  next.entries.push({
    actor: "USER",
    selectedCandidateId: decision.selectedCandidateId,
    rejectedCandidateIds: [...rejected],
    evidence: String(decision.evidence),
  });
  next.ledgerSha256 = hash({...next, ledgerSha256: null});
  return next;
}

const PHYSICS_BY_TOPOLOGY = {
  SUBJECT_CARVED_WALL: {mass: 1.05, stiffness: 185, dampingRatio: 0.84, maximumOvershoot: 0.04},
  ORBITAL_PHRASE_FIELD: {mass: 0.92, stiffness: 156, dampingRatio: 0.78, maximumOvershoot: 0.06},
  EDGE_CROP_TAKEOVER: {mass: 1.12, stiffness: 205, dampingRatio: 0.88, maximumOvershoot: 0.03},
};

const phaseLengths = (durationFrames) => {
  const ratios = [0.1, 0.18, 0.1, 0.36, 0.18];
  const lengths = ratios.map((ratio) => Math.max(1, Math.round(durationFrames * ratio)));
  const used = lengths.reduce((sum, value) => sum + value, 0);
  lengths.push(Math.max(1, durationFrames - used));
  const excess = lengths.reduce((sum, value) => sum + value, 0) - durationFrames;
  if (excess > 0) lengths[3] = Math.max(1, lengths[3] - excess);
  return lengths;
};

export function compileTypographyMotionSpec(candidate, {fps, durationFrames, motionAllowed}) {
  if (candidate?.pixelAudit?.status !== "PASS") throw new Error("typography-motion-hard-pass-candidate-required");
  if (!Number.isInteger(fps) || fps <= 0 || !Number.isInteger(durationFrames) || durationFrames < 30) throw new Error("typography-motion-timing-invalid");
  if (motionAllowed && (candidate.userVisualApproval !== "APPROVED" || candidate.productionAdmission !== true)) throw new Error("typography-motion-user-admission-required");
  const ids = ["PRE", "ENTER", "PEAK", "HOLD", "EXIT", "POST"];
  const actions = ["NO_TITLE", "ESTABLISH_TYPE_MASS", "LOCK_SUBJECT_DEPTH", "READABLE_HOLD", "RETRACT_WITH_MOMENTUM", "RESTORE_CLEAN_PRESENTER"];
  const lengths = phaseLengths(durationFrames);
  let cursor = 0;
  const phases = ids.map((id, index) => {
    const startFrame = cursor;
    const endFrame = index === ids.length - 1 ? durationFrames - 1 : cursor + lengths[index] - 1;
    cursor = endFrame + 1;
    return {id, action: actions[index], startFrame, endFrame};
  });
  const physics = PHYSICS_BY_TOPOLOGY[candidate.topology] || PHYSICS_BY_TOPOLOGY.SUBJECT_CARVED_WALL;
  return {
    contract: "A1TypographyPhysicsMotionSpec/v1",
    version: 1,
    candidateId: candidate.candidateId,
    candidateOutputSha256: candidate.output?.sha256 || null,
    exactCopy: candidate.exactCopy,
    topology: candidate.topology,
    fps,
    durationFrames,
    phases,
    physics: {model: "DAMPED_SPRING", ...physics, settleVelocityThreshold: 0.002, deterministic: true},
    allowedChannels: ["x", "y", "scale", "rotation", "opacity"],
    forbiddenChannels: ["width", "height", "top", "left", "display", "rawVisibility"],
    constraints: {
      preStateHasNoAddedTitle: true,
      holdIsStaticAndReadable: true,
      foregroundContactGraphMustRemainBound: true,
      protectedSourcePixelsMayChange: false,
      randomSourcesAllowed: false,
    },
    renderAllowed: motionAllowed === true,
    productionAdmission: motionAllowed === true,
  };
}
