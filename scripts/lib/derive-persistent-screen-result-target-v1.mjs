import crypto from "node:crypto";

export const A1_PERSISTENT_SCREEN_RESULT_TARGET_CONTRACT = "A1PersistentScreenResultTarget/v1";

export const A1_PERSISTENT_SCREEN_RESULT_TARGET_POLICY = Object.freeze({
  contract: "A1PersistentScreenResultTargetPolicy/v1",
  coordinateSpace: "NORMALIZED_SOURCE_FRAME",
  minimumAreaRatio: 0.01,
  maximumAreaRatio: 0.68,
  minimumWidthPx: 72,
  minimumHeightPx: 36,
  maximumWidthRatio: 0.92,
  maximumHeightRatio: 0.88,
  edgeInsetRatio: 0.04,
  cornerCenterInsetRatio: 0.2,
  maximumToastAreaRatio: 0.14,
  maximumToastWidthRatio: 0.4,
  maximumToastHeightRatio: 0.28,
  maximumCameraScale: 1.45,
  framingPaddingRatio: 0.16,
  admittedSemanticSources: [
    "DOM_VERIFIED_RESULT",
    "MANUAL_VERIFIED_PERSISTENT",
    "PIXEL_DELTA_WITH_PERSISTENT_FRAME_AGREEMENT",
  ],
  pixelDeltaAloneAdmitted: false,
  finalHoldPersistenceRequired: true,
  rejectInsteadOfGuess: true,
});

const round = (value) => Number(Number(value).toFixed(6));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
      if (value[key] === undefined) return [];
      return [[key, canonicalize(value[key])]];
    }));
  }
  return value;
};

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

const sourceValue = (input) => {
  const source = input.semanticSource ?? input.resultTargetSource ?? input.regionSource ?? input.source ?? null;
  if (typeof source === "string") return source;
  if (!source || typeof source !== "object") return null;
  return source.type ?? source.id ?? source.source ?? source.kind ?? null;
};

const sourceObject = (input) => {
  const source = input.semanticSource ?? input.resultTargetSource ?? input.regionSource ?? input.source ?? null;
  return source && typeof source === "object" ? source : null;
};

const classifySource = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "DOM_VERIFIED_RESULT" || normalized.startsWith("DOM_VERIFIED_RESULT_")) return "DOM_VERIFIED_RESULT";
  if (normalized === "MANUAL_VERIFIED_PERSISTENT" || normalized.startsWith("MANUAL_VERIFIED_PERSISTENT_")) return "MANUAL_VERIFIED_PERSISTENT";
  if (/PIXEL[_-]?DELTA/u.test(normalized)) return "PIXEL_DELTA";
  return null;
};

const frameDimensions = (input) => ({
  width: Number(input.frameWidth ?? input.frame?.width ?? input.sourceFrame?.width),
  height: Number(input.frameHeight ?? input.frame?.height ?? input.sourceFrame?.height),
});

const normalizeRegion = (region, frame) => {
  if (!region || typeof region !== "object") return null;
  const raw = {
    x: Number(region.x),
    y: Number(region.y),
    width: Number(region.width),
    height: Number(region.height),
  };
  if (Object.values(raw).some((value) => !Number.isFinite(value))) return null;
  const normalizedInput = raw.x <= 1 && raw.y <= 1 && raw.width <= 1 && raw.height <= 1;
  const normalized = normalizedInput ? raw : {
    x: raw.x / frame.width,
    y: raw.y / frame.height,
    width: raw.width / frame.width,
    height: raw.height / frame.height,
  };
  if (
    normalized.x < 0
    || normalized.y < 0
    || normalized.width <= 0
    || normalized.height <= 0
    || normalized.x + normalized.width > 1.000001
    || normalized.y + normalized.height > 1.000001
  ) return null;
  return Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, round(value)]));
};

const persistenceFlag = (evidence) => Boolean(
  evidence?.finalHoldVerified === true
  || evidence?.persistsThroughFinalHold === true
  || evidence?.observedAtFinalHold === true
  || evidence?.verifiedAt === "FINAL_HOLD"
  || evidence?.scope === "FINAL_HOLD",
);

const persistenceEvidencePasses = (evidence) => Boolean(
  evidence
  && evidence.status === "PASS"
  && persistenceFlag(evidence),
);

const frameAgreementPasses = (agreement) => Boolean(
  agreement
  && agreement.status === "PASS"
  && agreement.finalHoldVerified !== false
  && agreement.persistsThroughFinalHold !== false,
);

const rejection = (body, reason) => {
  const result = {...body, status: "REJECT", cameraTarget: null, reason};
  return {...result, sha: sha256(result)};
};

/**
 * Turns a result rectangle into a camera-safe semantic target.
 *
 * Pixel delta is deliberately treated as change evidence, not semantic result
 * evidence. It is admitted only when independent final-hold frame agreement
 * proves that the same changed region persists. Callers without a trustworthy
 * target receive REJECT/null and must keep the current camera composition.
 */
export function derivePersistentScreenResultTarget(input = {}) {
  const policy = A1_PERSISTENT_SCREEN_RESULT_TARGET_POLICY;
  const frame = frameDimensions(input);
  const base = {
    contract: A1_PERSISTENT_SCREEN_RESULT_TARGET_CONTRACT,
    policy,
  };
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
    return rejection(base, "FRAME_DIMENSIONS_INVALID");
  }

  const region = normalizeRegion(input.region, frame);
  if (!region) return rejection(base, "REGION_INVALID");

  const right = region.x + region.width;
  const bottom = region.y + region.height;
  const center = {x: round(region.x + region.width / 2), y: round(region.y + region.height / 2)};
  const areaRatio = round(region.width * region.height);
  const regionWidthPx = region.width * frame.width;
  const regionHeightPx = region.height * frame.height;

  if (
    areaRatio >= policy.maximumAreaRatio
    || region.width >= policy.maximumWidthRatio
    || region.height >= policy.maximumHeightRatio
  ) return rejection(base, "NEAR_FULL_FRAME");

  const atHorizontalEdge = region.x <= policy.edgeInsetRatio || right >= 1 - policy.edgeInsetRatio;
  const atVerticalEdge = region.y <= policy.edgeInsetRatio || bottom >= 1 - policy.edgeInsetRatio;
  const centerNearHorizontalCorner = center.x <= policy.cornerCenterInsetRatio || center.x >= 1 - policy.cornerCenterInsetRatio;
  const centerNearVerticalCorner = center.y <= policy.cornerCenterInsetRatio || center.y >= 1 - policy.cornerCenterInsetRatio;
  const toastSized = areaRatio <= policy.maximumToastAreaRatio
    && region.width <= policy.maximumToastWidthRatio
    && region.height <= policy.maximumToastHeightRatio;
  if ((atHorizontalEdge || atVerticalEdge) && centerNearHorizontalCorner && centerNearVerticalCorner && toastSized) {
    return rejection(base, "EDGE_TOAST");
  }

  if (
    areaRatio < policy.minimumAreaRatio
    || regionWidthPx < policy.minimumWidthPx
    || regionHeightPx < policy.minimumHeightPx
  ) return rejection(base, "TRANSIENT_REGION_TOO_SMALL");

  const rawSource = sourceValue(input);
  const semanticSource = classifySource(rawSource);
  if (!semanticSource) return rejection(base, "SEMANTIC_SOURCE_UNVERIFIED");

  const explicitSource = sourceObject(input);
  const persistenceEvidence = input.persistenceEvidence ?? input.persistence ?? null;
  const persistentFrameAgreement = input.persistentFrameAgreement ?? null;
  const contradictorySourceEvidence = explicitSource?.status === "FAIL"
    || explicitSource?.finalHoldVerified === false
    || explicitSource?.persistsThroughFinalHold === false;
  let persistenceProof = null;

  if (semanticSource === "PIXEL_DELTA") {
    if (!frameAgreementPasses(persistentFrameAgreement)) return rejection(base, "PERSISTENCE_UNPROVEN");
    persistenceProof = "PERSISTENT_FRAME_AGREEMENT";
  } else if (semanticSource === "MANUAL_VERIFIED_PERSISTENT") {
    if (contradictorySourceEvidence) return rejection(base, "PERSISTENCE_UNPROVEN");
    persistenceProof = persistenceEvidencePasses(persistenceEvidence)
      ? "FINAL_HOLD_EVIDENCE"
      : "MANUAL_PERSISTENT_VERIFICATION";
  } else {
    const sourceProvesFinalHold = explicitSource?.status === "PASS" && persistenceFlag(explicitSource);
    if (contradictorySourceEvidence || (!sourceProvesFinalHold && !persistenceEvidencePasses(persistenceEvidence))) {
      return rejection(base, "PERSISTENCE_UNPROVEN");
    }
    persistenceProof = sourceProvesFinalHold ? "DOM_FINAL_HOLD_VERIFICATION" : "FINAL_HOLD_EVIDENCE";
  }

  const fitScale = 1 / Math.max(
    region.width * (1 + policy.framingPaddingRatio),
    region.height * (1 + policy.framingPaddingRatio),
  );
  const cameraTarget = {
    coordinateSpace: policy.coordinateSpace,
    frame,
    region,
    center,
    areaRatio,
    semanticSource,
    persistenceProof,
    suggestedScale: round(Math.max(1, Math.min(policy.maximumCameraScale, fitScale))),
    maximumScale: policy.maximumCameraScale,
  };
  const result = {
    ...base,
    status: "PASS",
    cameraTarget,
    reason: "ADMITTED_PERSISTENT_SEMANTIC_RESULT",
  };
  return {...result, sha: sha256(result)};
}
