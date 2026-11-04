import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {
  A1_FILM_TYPOGRAPHY_DIRECTOR_V3,
  A1_TYPOGRAPHY_VISUAL_CONTEXT_V2,
  buildTypographyFontProfileV1,
  compileFilmTypographyDirectorV3,
  validateFilmTypographyDirectorV3,
} from "../apps/studio-next/src/lib/a1-film-typography-director-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json";
const timelinePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json";
const fixturePath = "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json";
const referenceBoardPath = "work/typography-design-board-v1/board.json";
const currentPhasePath = ".codex-artifacts/system-progress-system-line/current-phase.json";
  const authorityAuditPath = ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json";
const outputDir = "work/typography-director-v3-shadow-v1";
const visualContextProviderPath = "apps/studio-next/src/lib/a1-typography-visual-context-provider-v1.mjs";
const directorSourcePath = "apps/studio-next/src/lib/a1-film-typography-director-v3.mjs";
const contextCheckpointDir = `${outputDir}/visual-context-canary/three-shot-context-checkpoints-v1`;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readBytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));

function isInside(candidate, base) {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = Array(items.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function buildFontProfile(profileId, binaryDefinitions) {
  return buildTypographyFontProfileV1({
    profileId,
    binaryAssets: binaryDefinitions.map((definition) => {
      const fontPath = path.isAbsolute(definition.sourcePath) ? definition.sourcePath : path.join(root, definition.sourcePath);
      const bytes = fs.readFileSync(fontPath);
      return {
        role: definition.role,
        fontFamily: definition.fontFamily,
        sourcePath: definition.sourcePath,
        sha256: sha256(bytes),
        verified: true,
        license: definition.license,
      };
    }),
  });
}

async function verifyTimelineFrame(item) {
  const publicUrl = String(item.preview?.publicUrl || "");
  const expectedSha256 = item.preview?.sha256 || item.artifactSha256 || null;
  const declaredSha256s = [item.preview?.sha256, item.artifactSha256].filter(Boolean);
  const proof = {
    publicUrl: publicUrl || null,
    expectedSha256,
    actualSha256: null,
    byteShaVerified: false,
    decoded: false,
    width: null,
    height: null,
    format: null,
    failure: null,
  };
  try {
    const prefix = "/generated/system-line/editorial-asset-workbench-v1/";
    if (!publicUrl.startsWith(prefix) || publicUrl.includes("..")) throw new Error("FRAME_PATH_OUTSIDE_CURRENT_WORKSPACE");
    const publicRoot = path.resolve(root, "apps/studio-next/public");
    const framePath = path.resolve(publicRoot, publicUrl.replace(/^\/+/, ""));
    if (!isInside(framePath, publicRoot)) throw new Error("FRAME_PATH_OUTSIDE_PUBLIC_ROOT");
    const bytes = fs.readFileSync(framePath);
    proof.actualSha256 = sha256(bytes);
    proof.byteShaVerified = declaredSha256s.length > 0 && declaredSha256s.every((value) => value === proof.actualSha256);
    const metadata = await sharp(bytes, {limitInputPixels: 64_000_000}).metadata();
    await sharp(bytes, {limitInputPixels: 64_000_000}).stats();
    proof.decoded = true;
    proof.width = metadata.width || null;
    proof.height = metadata.height || null;
    proof.format = metadata.format || null;
    if (!proof.byteShaVerified) proof.failure = "FRAME_SHA_MISMATCH";
    if (!proof.width || !proof.height || !["png", "jpeg", "webp"].includes(proof.format)) {
      proof.decoded = false;
      proof.failure = "FRAME_DECODE_OR_FORMAT_INVALID";
    }
  } catch (error) {
    proof.failure = String(error?.message || "FRAME_READ_FAILED").split(":")[0];
  }
  return proof;
}

function carrierForTimeline(item, priorCanaryBySha) {
  const frameSha = item.preview?.sha256 || item.artifactSha256 || "";
  const prior = priorCanaryBySha.get(frameSha);
  if (prior?.carrierClass) return {carrierClass: prior.carrierClass, source: "EXISTING_SHA_BOUND_VISUAL_CANARY"};
  if (item.route === "SCREEN_EVIDENCE" || item.sourceRole === "REAL_SOURCE") {
    return {carrierClass: item.titleRole === "EXPLAINER_LABEL" ? "EVIDENCE_DOCUMENT" : "SCREEN_UI", source: "CURRENT_TIMELINE_SOURCE_ROLE_HINT"};
  }
  if (item.sourceRole === "PRESENTER" || item.sourceRole === "PRESENTER_BASE") {
    return {carrierClass: "PRESENTER", source: "CURRENT_TIMELINE_SOURCE_ROLE_HINT"};
  }
  if (item.sourceRole === "GENERATED_EDITORIAL") return {carrierClass: "MIXED", source: "CURRENT_TIMELINE_SOURCE_ROLE_HINT"};
  if (item.sourceRole === "TYPOGRAPHY") return {carrierClass: "ABSTRACT", source: "CURRENT_TIMELINE_SOURCE_ROLE_HINT"};
  return {carrierClass: "OTHER", source: "UNCLASSIFIED_CURRENT_TIMELINE_ROLE"};
}

function visualContextPlaceholder({carrierClass, frame, provenanceKind}) {
  return {
    contract: A1_TYPOGRAPHY_VISUAL_CONTEXT_V2,
    carrierClass,
    frame: {
      sha256: frame.actualSha256 || frame.expectedSha256 || null,
      byteShaVerified: frame.byteShaVerified === true && frame.decoded === true,
      width: frame.width,
      height: frame.height,
    },
    visualAssessment: {
      frameSha256: frame.actualSha256 || null,
      method: "NOT_RUN_IN_SHADOW_COMPILER",
      confidence: 0,
      note: "No per-beat image-bound visual assessment was run by this shadow compile.",
    },
    protectedRegions: [],
    availableRegions: [],
    nativeText: {},
    sourceProvenance: {kind: provenanceKind, sourceIdentityVerified: false, renderAllowed: false},
  };
}

function loadVisualContextCheckpoint({shotId, frameSha256, carrierClass, semanticDuty, semanticImportance, exactCopy, sourceProvenance, providerSourceSha256, directorSourceSha256}) {
  const checkpointPath = path.join(root, contextCheckpointDir, `${shotId}.json`);
  if (!fs.existsSync(checkpointPath)) return {status: "NOT_ANALYZED", requestSha256: null, context: null, cacheHit: false, failure: null};
  try {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    const requestSha256 = sha256(Buffer.from(JSON.stringify({
      frameSha256,
      carrierHint: carrierClass,
      semanticDuty,
      semanticImportance,
      exactCopy,
      sourceProvenance,
      providerSourceSha256,
      directorSourceSha256,
      visualModel: process.env.A1_VISUAL_AI_DIRECTOR_MODEL || "codex-cli-configured-default",
    }), "utf8"));
    if (checkpoint.requestSha256 !== requestSha256 || checkpoint.frame?.actualSha256 !== frameSha256) {
      return {status: "STALE_CHECKPOINT", requestSha256: checkpoint.requestSha256 || null, context: null, cacheHit: false, failure: "INPUT_SHA_MISMATCH"};
    }
    if (checkpoint.status === "READY_FOR_REVIEW_ONLY_ROUTING"
      && checkpoint.context?.frame?.sha256 === frameSha256
      && checkpoint.context?.sourceProvenance?.sourceIdentityVerified === sourceProvenance.sourceIdentityVerified
      && checkpoint.context?.sourceProvenance?.renderAllowed === sourceProvenance.renderAllowed) {
      return {status: checkpoint.status, requestSha256, context: checkpoint.context, cacheHit: true, failure: null};
    }
    return {status: checkpoint.status || "BLOCKED_REVIEW_ONLY", requestSha256, context: null, cacheHit: true, failure: checkpoint.failure || "CONTEXT_NOT_READY"};
  } catch (error) {
    return {status: "INVALID_CHECKPOINT", requestSha256: null, context: null, cacheHit: false, failure: String(error?.message || "CHECKPOINT_INVALID").split(":")[0]};
  }
}

function loadVerifiedReviewCandidate({shotId, item, frameSha256, currentDirectorSourceSha256, currentCompositionSourceSha256, expectedBibleSha256, expectedFontProfileSha256}) {
  const candidateRelativePath = `${outputDir}/${shotId}-ui-margin-candidate-v1/candidate.json`;
  const candidatePath = path.join(root, candidateRelativePath);
  if (!fs.existsSync(candidatePath)) return null;
  try {
    const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    const binding = candidate.sourceBinding || {};
    const text = String(item.sourceText || "");
    if (candidate.status !== "REVIEW_READY_CANDIDATE"
      || candidate.productionAdmission !== false
      || candidate.visualReview?.userApproval !== false
      || candidate.filmTypographyBibleSha256 !== expectedBibleSha256
      || candidate.sourceCodeBinding?.directorSourceSha256 !== currentDirectorSourceSha256
      || candidate.sourceCodeBinding?.compositionSourceSha256 !== currentCompositionSourceSha256
      || binding.shotId !== shotId || binding.frameSha256 !== frameSha256
      || binding.sourceExactCopy !== text || binding.sourceExactCopySha256 !== sha256(Buffer.from(text, "utf8"))
      || binding.fontProfileSha256 !== expectedFontProfileSha256
      || candidate.decision?.status !== "READY_FOR_PACKAGE_CANDIDATES_REVIEW_ONLY"
      || candidate.decision?.blockers?.length !== 0
      || candidate.copyFit?.status !== "PASS"
      || candidate.copyFit?.frameSha256 !== frameSha256
      || candidate.copyFit?.displayCopySha256 !== sha256(Buffer.from(binding.displayCopy || "", "utf8"))
      || candidate.copyFit?.fontProfileSha256 !== expectedFontProfileSha256
      || candidate.compositedReviewFrame?.changedPixelsOutsideDirectorSelectedSafeRegion !== 0
      || candidate.textAudit?.everyGlyphCovered !== true
      || candidate.textAudit?.exactDisplayCopyOcrMatch !== true) {
      return null;
    }
    const boundArtifacts = [];
    for (const [relativePath, expectedSha] of [
      [candidate.typographyAsset?.svgPath, candidate.typographyAsset?.svgSha256],
      [candidate.typographyAsset?.transparentOverlayPath, candidate.typographyAsset?.transparentOverlaySha256],
      [candidate.compositedReviewFrame?.path, candidate.compositedReviewFrame?.sha256],
    ]) {
      if (typeof relativePath !== "string" || !relativePath.startsWith(`${outputDir}/`)) return null;
      const resolved = path.resolve(root, relativePath);
      if (!isInside(resolved, path.join(root, outputDir))) return null;
      const actualSha = sha256(fs.readFileSync(resolved));
      if (actualSha !== expectedSha) return null;
      boundArtifacts.push({path: relativePath, sha256: actualSha});
    }
    return {
      candidate,
      path: candidateRelativePath,
      sha256: sha256(fs.readFileSync(candidatePath)),
      boundArtifacts,
      status: "VERIFIED_REVIEW_CANDIDATE",
    };
  } catch {
    return null;
  }
}

function semanticDutyFromTimeline(item, legacySemantic) {
  if (item.titleRole === "CHAPTER" || item.titleRole === "CHAPTER_TITLE") return "CHAPTER";
  if (!String(item.sourceText || "").trim()) return "NONE";
  return legacySemantic || "EXPLANATION";
}

function semanticDutyFromFixture(copy, legacySemantic) {
  if (legacySemantic === "BREATH") return "NONE";
  if (!String(copy || "").trim()) return "NONE";
  return legacySemantic || "EXPLANATION";
}

function importanceFor(duty) {
  if (duty === "CONCLUSION" || duty === "VERDICT") return "CRITICAL";
  if (["IDENTITY", "QUESTION", "CHAPTER"].includes(duty)) return "HIGH";
  if (duty === "NONE" || duty === "CAPTION") return "LOW";
  return "MEDIUM";
}

function semanticForTimeline(item, index, totalBeats) {
  const role = String(item.titleRole || "");
  const copy = String(item.sourceText || "");
  if (role === "HERO_TAKEOVER" && index === totalBeats - 1) return "CONCLUSION";
  if (role === "HERO_TAKEOVER" && /废稿|失败|错/u.test(copy)) return "VERDICT";
  if (role === "PRESENTER_HEADLINE" && index === 0) return "IDENTITY";
  if (/[？?]/u.test(copy)) return "QUESTION";
  if (/先.{0,12}再|步骤|流程/u.test(copy)) return "PROCESS";
  if (item.route === "SCREEN_EVIDENCE") return "PROCESS";
  if (item.sourceRole === "REAL_SOURCE" && role === "EXPLAINER_LABEL") return "EVIDENCE";
  return "EXPLANATION";
}

function semanticForFixture(article, copy, index) {
  if (!String(copy || "").trim()) return "NONE";
  if (index === 0 && article.genre === "personal-opinion") return "IDENTITY";
  if (index === 0 && article.genre === "evidence-explainer") return "EVIDENCE";
  if (index === 0 && article.genre === "product-tutorial") return "PROCESS";
  if (index === 1) return "QUESTION";
  if (index === 2) return "VERDICT";
  if (index === 3) return "BREATH";
  if (index === 4) return article.genre === "evidence-explainer" ? "EVIDENCE" : "PROCESS";
  if (index === 5) return "EXPLANATION";
  if (index === 6) return article.genre === "personal-opinion" ? "PROCESS" : article.genre === "evidence-explainer" ? "EVIDENCE" : "PROCESS";
  return "CONCLUSION";
}

function incumbentRoleForFixture(article, index) {
  if (index === 0) return article.genre === "evidence-explainer" ? "EVIDENCE_HIGHLIGHT" : article.genre === "product-tutorial" ? "SOURCE_NATIVE" : "PRESENTER_MARKER";
  if (index === 1) return article.genre === "product-tutorial" ? "SOURCE_NATIVE" : "FULLSCREEN_HERO";
  if (index === 2) return article.genre === "evidence-explainer" ? "EVIDENCE_TRANSLATION" : article.genre === "product-tutorial" ? "OBJECT_ATTACHED_LABEL" : "PRESENTER_MARKER";
  if (index === 3) return "NO_TYPE";
  if (index === 4) return "SOURCE_NATIVE";
  if (index === 5) return "EXPLANATION_DIAGRAM";
  if (index === 6) return article.genre === "product-tutorial" ? "SOURCE_NATIVE" : "OBJECT_ATTACHED_LABEL";
  return "CONCLUSION_STAMP";
}

function incumbentRouteForFixture(role) {
  if (role === "NO_TYPE") return "NO_TYPE";
  if (role === "SOURCE_NATIVE" || role === "EVIDENCE_HIGHLIGHT") return "SOURCE_NATIVE";
  return "EDITABLE_LOCAL_TYPE";
}

function incumbentRouteForTimeline(item) {
  if (item.titleRole === "NONE") return item.sourceRole === "REAL_SOURCE" || item.route === "SCREEN_EVIDENCE" ? "SOURCE_NATIVE" : "NO_TYPE";
  return "EDITABLE_LOCAL_TYPE";
}

function compileFilm(articleId, beats, bible) {
  const director = compileFilmTypographyDirectorV3({
    articleId,
    programMode: "SHADOW_REVIEW_ONLY",
    bible,
    beats,
  });
  const decisions = director.decisions.map((decision, index) => ({
    ...decision,
    incumbent: beats[index].incumbent || null,
    shadowEvidence: beats[index].evidence || null,
  }));
  return {
    director,
    directorValidationFailures: validateFilmTypographyDirectorV3(director),
    decisions,
    summary: director.summary,
  };
}

async function main() {
  const workspaceBytes = readBytes(workspacePath);
  const workspace = JSON.parse(workspaceBytes);
  const timelineBytes = readBytes(timelinePath);
  const board = JSON.parse(timelineBytes);
  const fixtureBytes = readBytes(fixturePath);
  const fixtureData = JSON.parse(fixtureBytes);
  const referenceBoardBytes = readBytes(referenceBoardPath);
  const referenceBoard = JSON.parse(referenceBoardBytes);
  const currentPhase = JSON.parse(readBytes(currentPhasePath));
  const authorityAudit = JSON.parse(readBytes(authorityAuditPath));
  const priorCanonicalReport = JSON.parse(readBytes(`${outputDir}/report.json`));
  const priorCanaries = JSON.parse(readBytes(`${outputDir}/visual-context-canary/carrier-matrix-real-canaries.json`));
  const contextCanaryReportPath = `${outputDir}/visual-context-canary/three-shot-current-frame-context-v1.json`;
  const contextCanaryReport = fs.existsSync(path.join(root, contextCanaryReportPath))
    ? JSON.parse(readBytes(contextCanaryReportPath))
    : null;
  const providerSourceSha256 = sha256(readBytes(visualContextProviderPath));
  const directorSourceSha256 = sha256(readBytes(directorSourcePath));
  const compositionSourceSha256 = sha256(readBytes("apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs"));
  const contextEvidenceDirectorSourceSha256 = contextCanaryReport?.sourceBinding?.directorSourceSha256 || directorSourceSha256;
  const priorCanaryBySha = new Map((priorCanaries.cases || []).map((item) => [item.frameSha256, item]));

  if (board.timelineItems?.length !== 34) throw new Error(`expected-current-34-beat-timeline:${board.timelineItems?.length}`);
  if (fixtureData.articles?.length !== 6) throw new Error(`expected-six-blind-fixtures:${fixtureData.articles?.length}`);
  if (referenceBoard.contract !== "A1TypographyDesignReferenceBoard/v1") throw new Error("current-typography-reference-board-contract-invalid");

  const frameProofs = await mapWithConcurrency(board.timelineItems, 2, verifyTimelineFrame);
  const currentBeats = board.timelineItems.map((item, index) => {
    const legacySemantic = semanticForTimeline(item, index, board.timelineItems.length);
    const semanticDuty = semanticDutyFromTimeline(item, legacySemantic);
    const semanticImportance = importanceFor(semanticDuty);
    const carrier = carrierForTimeline(item, priorCanaryBySha);
    const frame = frameProofs[index];
    const previous = index > 0 ? frameProofs[index - 1] : null;
    const next = index < frameProofs.length - 1 ? frameProofs[index + 1] : null;
    const provenanceKind = `CURRENT_TIMELINE_${item.sourceRole || "UNKNOWN"}_UNAPPROVED_BOARD_FRAME`;
    const sourceProvenance = {kind: provenanceKind, sourceIdentityVerified: false, renderAllowed: false};
    const visualContextEvidence = loadVisualContextCheckpoint({
      shotId: item.shotId,
      frameSha256: frame.actualSha256,
      carrierClass: carrier.carrierClass,
      semanticDuty,
      semanticImportance,
      exactCopy: item.sourceText || "",
      sourceProvenance,
      providerSourceSha256,
      directorSourceSha256: contextEvidenceDirectorSourceSha256,
    });
    const reviewCandidate = loadVerifiedReviewCandidate({
      shotId: item.shotId,
      item,
      frameSha256: frame.actualSha256,
      currentDirectorSourceSha256: directorSourceSha256,
      currentCompositionSourceSha256: compositionSourceSha256,
      expectedBibleSha256: priorCanonicalReport.filmTypographyBible?.bibleSha256,
      expectedFontProfileSha256: priorCanonicalReport.filmTypographyBible?.fontProfiles?.FUSION_PIXEL?.profileSha256,
    });
    const candidateInput = reviewCandidate?.candidate || null;
    const sourceExactCopy = item.sourceText || "";
    const displayCopy = candidateInput?.sourceBinding?.displayCopy || sourceExactCopy;
    return {
      shotId: item.shotId,
      sourceExactCopy,
      exactCopy: sourceExactCopy,
      displayCopy,
      displayAdaptationReason: candidateInput?.sourceBinding?.displayAdaptationReason || "",
      semanticDuty,
      semanticImportance,
      sequenceBoundary: index === 0 ? "START" : index === board.timelineItems.length - 1 ? "END" : "INTERIOR",
      visualContext: visualContextEvidence.context || visualContextPlaceholder({carrierClass: carrier.carrierClass, frame, provenanceKind}),
      reference: candidateInput?.sourceBinding?.referenceCell || null,
      neighbors: {
        previousFrameSha256: previous?.byteShaVerified && previous?.decoded ? previous.actualSha256 : null,
        nextFrameSha256: next?.byteShaVerified && next?.decoded ? next.actualSha256 : null,
      },
      copyFit: candidateInput?.copyFit || null,
      incumbent: {
        route: incumbentRouteForTimeline(item),
        timelineRoute: item.route,
        titleRole: item.titleRole,
        sourceRole: item.sourceRole,
      },
      evidence: {
        carrierClassSource: carrier.source,
        frame: {
          publicUrl: frame.publicUrl,
          expectedSha256: frame.expectedSha256,
          actualSha256: frame.actualSha256,
          byteShaVerified: frame.byteShaVerified,
          decoded: frame.decoded,
          width: frame.width,
          height: frame.height,
          format: frame.format,
          failure: frame.failure,
        },
        semanticSource: "CURRENT_TIMELINE_COPY_AND_ROLE_HEURISTIC",
        visualContextEvidence: {
          status: visualContextEvidence.status,
          requestSha256: visualContextEvidence.requestSha256,
          cacheHit: visualContextEvidence.cacheHit,
          failure: visualContextEvidence.failure,
        },
        reviewPackageCandidate: reviewCandidate ? {
          status: reviewCandidate.status,
          path: reviewCandidate.path,
          sha256: reviewCandidate.sha256,
          compositeSha256: reviewCandidate.candidate.compositedReviewFrame.sha256,
          typographyAssetSha256: reviewCandidate.candidate.typographyAsset.svgSha256,
          referenceCellId: reviewCandidate.candidate.sourceBinding.referenceCell.cellId,
          displayCopy: reviewCandidate.candidate.sourceBinding.displayCopy,
          allArtifactsShaVerified: true,
        } : null,
      },
    };
  });

  const currentBibles = {
    fontProfiles: {
      EVA: buildFontProfile("EVA", [
        {
          role: "CJK_HERO_SHADOW",
          fontFamily: "Source Han Serif CN Heavy",
          sourcePath: "remotion-renderer/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf",
          license: "OFL",
        },
        {
          role: "LATIN_HERO_SHADOW",
          fontFamily: "Times New Roman Bold",
          sourcePath: "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
          license: "SYSTEM_FONT_LOCAL_ONLY_DISTRIBUTION_REVIEW_REQUIRED",
        },
      ]),
      FUSION_PIXEL: buildFontProfile("FUSION_PIXEL", [
        {
          role: "MICRO_AND_SUPPORT_COPY",
          fontFamily: "Fusion Pixel Regular",
          sourcePath: "remotion-renderer/public/a1-editorial-fonts/fusion-pixel.ttf",
          license: "USER_APPROVED_LOCAL_FONT",
        },
      ]),
    },
    referenceBoard: {path: referenceBoardPath, sha256: sha256(referenceBoardBytes)},
    heroBudget: {maxPerSixBeatWindow: 1},
    effectBudget: {maxHighIntensityPerSixBeatWindow: 1},
    palette: {base: ["NEAR_BLACK", "NEAR_WHITE"], accentCount: 1},
  };
  const current = compileFilm("current-whole-film", currentBeats, currentBibles);
  const verifiedReviewCandidateCount = current.decisions.filter((decision) =>
    decision.shadowEvidence?.reviewPackageCandidate?.status === "VERIFIED_REVIEW_CANDIDATE").length;
  const visualContextReuse = current.decisions.map((decision) => ({
    shotId: decision.shotId,
    ...(decision.shadowEvidence?.visualContextEvidence || {status: "NOT_ANALYZED", cacheHit: false}),
  }));
  const imageBoundContextCount = visualContextReuse.filter((item) => item.status === "READY_FOR_REVIEW_ONLY_ROUTING").length;
  const attemptedContextCount = visualContextReuse.filter((item) => item.status !== "NOT_ANALYZED").length;
  const visualContextTimeoutCount = visualContextReuse.filter((item) => item.failure === "typography-visual-assessment-timeout").length;
  const fixtures = fixtureData.articles.map((article) => {
    const beats = article.shots.map((copy, index) => {
      const legacySemantic = semanticForFixture(article, copy, index);
      const semanticDuty = semanticDutyFromFixture(copy, legacySemantic);
      const incumbentRole = incumbentRoleForFixture(article, index);
      const noFrame = {expectedSha256: null, actualSha256: null, byteShaVerified: false, decoded: false, width: null, height: null};
      return {
        shotId: `${article.id}-${String(index + 1).padStart(2, "0")}`,
        exactCopy: copy,
        semanticDuty,
        semanticImportance: importanceFor(semanticDuty),
        sequenceBoundary: index === 0 ? "START" : index === article.shots.length - 1 ? "END" : "INTERIOR",
        visualContext: visualContextPlaceholder({
          carrierClass: "OTHER",
          frame: noFrame,
          provenanceKind: "FROZEN_ARTICLE_FIXTURE_WITHOUT_FRAME_BINDING",
        }),
        reference: null,
        neighbors: {previousFrameSha256: null, nextFrameSha256: null},
        copyFit: null,
        incumbent: {role: incumbentRole, route: incumbentRouteForFixture(incumbentRole)},
        evidence: {
          fixtureOnly: true,
          fixtureFrameAvailable: false,
          semanticSource: "FROZEN_FIXTURE_GENRE_AND_BEAT_POSITION_REVIEW_MAP",
          frame: {expectedSha256: null, actualSha256: null, byteShaVerified: false, decoded: false},
        },
      };
    });
    return {
      articleId: article.id,
      genre: article.genre,
      frozen: fixtureData.frozen === true,
      compiled: compileFilm(article.id, beats, currentBibles),
    };
  });

  const changes = current.decisions.filter((decision, index) => decision.incumbent?.route !== decision.route).map((decision) => ({
    shotId: decision.shotId,
    incumbent: decision.incumbent?.route || null,
    v3: decision.route,
    semanticDuty: decision.semanticDuty,
    blockers: decision.blockers,
  }));
  const blindFixtures = fixtures.map((fixture) => ({
    articleId: fixture.articleId,
    genre: fixture.genre,
    frozen: fixture.frozen,
    routeCounts: fixture.compiled.summary.routeCounts,
    blockedBeatCount: fixture.compiled.summary.blockedBeatCount,
    changedCount: fixture.compiled.decisions.filter((decision) => decision.incumbent?.route !== decision.route).length,
    changes: fixture.compiled.decisions.filter((decision) => decision.incumbent?.route !== decision.route).map((decision) => ({
      shotId: decision.shotId,
      incumbent: decision.incumbent?.route || null,
      v3: decision.route,
      semanticDuty: decision.semanticDuty,
      blockers: decision.blockers,
    })),
  }));
  const allFilms = [current, ...fixtures.map((fixture) => fixture.compiled)];
  const allDecisions = allFilms.flatMap((film) => film.decisions);
  const singleRoutePerBeat = allDecisions.every((decision) => ["NO_TYPE", "SOURCE_NATIVE", "EDITABLE_LOCAL_TYPE", "GENERATED_HERO_GLYPH"].includes(decision.route));
  const heroCapSixBeatWindow = allFilms.every((film) => film.decisions.every((_, index) => film.decisions
    .slice(Math.max(0, index - 5), index + 1)
    .filter((decision) => decision.route === "GENERATED_HERO_GLYPH").length <= 1));
  const sharedBibleSha256s = [...new Set(allFilms.map((film) => film.director.bible.bibleSha256))];
  const totalFrameProofs = frameProofs.length;
  const verifiedFrameCount = frameProofs.filter((frame) => frame.byteShaVerified && frame.decoded).length;
  const currentReportPath = path.join(root, outputDir, "report.json");
  const preservedHeuristicReportPath = path.join(root, outputDir, "report.pre-canonical-route-heuristic.json");
  const currentReportBytes = fs.existsSync(currentReportPath) ? fs.readFileSync(currentReportPath) : Buffer.alloc(0);
  const priorReportBytes = fs.existsSync(preservedHeuristicReportPath)
    ? fs.readFileSync(preservedHeuristicReportPath)
    : currentReportBytes;

  const report = {
    contract: "A1TypographyDirectorV3CanonicalShadowReport/v1",
    status: "SHADOW_COMPILED_BLOCKED_REVIEW_ONLY",
    generatedAt: new Date().toISOString(),
    canonicalDirectorContract: A1_FILM_TYPOGRAPHY_DIRECTOR_V3,
    filmTypographyBible: {
      ...current.director.bible,
      validationFailures: current.director.bibleValidationFailures,
      sharedAcrossAllInputs: sharedBibleSha256s.length === 1,
    },
    scopeNotice: "This report invokes the current A1FilmTypographyDirector/v3 implementation for one current 34-beat film and six frozen text fixtures. It is routing evidence only; it is not visual qualification or production authority.",
    supersedes: priorReportBytes.length ? {
      path: `${outputDir}/report.pre-canonical-route-heuristic.json`,
      sha256: sha256(priorReportBytes),
      reason: "The prior report was emitted by an independent routeBeat approximation and did not call the canonical v3 director.",
    } : null,
    authoritySnapshot: {
      currentPhase: {
        contract: currentPhase.contract,
        status: currentPhase.status,
        currentStage: currentPhase.authority?.currentStage || null,
        nextAction: currentPhase.authority?.nextAction?.id || null,
        generationQueue: currentPhase.authority?.generationQueueProjection || null,
      },
      authorityAudit: {
        status: authorityAudit.status,
        generatedAt: authorityAudit.generatedAt,
        workspaceSha256: authorityAudit.authority?.workspaceSha256 || null,
        matchesCurrentDeclaredWorkspaceSha: (authorityAudit.authority?.workspaceSha256 || null) === (workspace.workspaceSha256 || null),
      },
    },
    sourceBinding: {
      workspaceSha256: sha256(workspaceBytes),
      workspaceDeclaredSha256: workspace.workspaceSha256 || null,
      currentPhaseSha256: sha256(readBytes(currentPhasePath)),
      authorityAuditSha256: sha256(readBytes(authorityAuditPath)),
      currentDirectorSourceSha256: directorSourceSha256,
      visualContextEvidenceDirectorSourceSha256: contextEvidenceDirectorSourceSha256,
      timelineManifestSha256: sha256(timelineBytes),
      timelineDeclaredSha256: board.boardManifestSha256 || null,
      fixtureSha256: sha256(fixtureBytes),
      typographyReferenceBoardSha256: sha256(referenceBoardBytes),
      currentTimelineBeatCount: board.timelineItems.length,
      fixtureArticleCount: fixtureData.articles.length,
      fixtureBeatCount: fixtureData.articles.reduce((count, article) => count + article.shots.length, 0),
      currentFrameCount: totalFrameProofs,
      currentFrameShaAndDecodePassCount: verifiedFrameCount,
      currentVisualContextCapturedCount: imageBoundContextCount,
      currentVisualContextAttemptedCount: attemptedContextCount,
      currentVisualContextTimeoutCount: visualContextTimeoutCount,
      verifiedReviewPackageCandidateCount: verifiedReviewCandidateCount,
    },
    incumbentComparison: {
      definition: "Current film uses the prior timeline role-to-route adapter. Frozen fixtures use the prior v1 role mapping retained from the first shadow report. These are comparison baselines, not production decisions.",
      changedCount: changes.length,
      changes,
      current: {
        routeCounts: current.summary.routeCounts,
        blockedBeatCount: current.summary.blockedBeatCount,
        directorValidationFailures: current.directorValidationFailures,
        directorSha256: current.director.directorSha256,
        decisions: current.decisions,
      },
    },
    blindFixtures: fixtures.map((fixture, index) => ({
      ...blindFixtures[index],
      directorSha256: fixture.compiled.director.directorSha256,
      directorValidationFailures: fixture.compiled.directorValidationFailures,
      decisions: fixture.compiled.decisions,
    })),
    shadowChecks: {
      canonicalDirectorInvoked: true,
      singleSharedFilmBibleAcrossAllInputs: sharedBibleSha256s.length === 1,
      singleFinalRoutePerBeat: singleRoutePerBeat,
      heroCapSixBeatWindow: heroCapSixBeatWindow,
      visualDensity: imageBoundContextCount === board.timelineItems.length
        ? "ROUTE_DENSITY_COMPUTED_BUT_REQUIRES_ACTUAL_COMPOSITE_REVIEW"
        : "NOT_SCOREABLE_WITH_PARTIAL_IMAGE_BOUND_VISUAL_CONTEXT",
      imageBoundVisualContextReuse: imageBoundContextCount,
      visualContextAttemptCount: attemptedContextCount,
      visualContextTimeoutCount,
      verifiedReviewPackageCandidateCount: verifiedReviewCandidateCount,
      allDirectorsRemainReviewOnly: allFilms.every((film) => film.director.productionAdmission === false),
      noProductionAdmission: allFilms.every((film) => film.director.proofBoundary.productionAdmission === false),
    },
    blockingGaps: [
      `The current 34 shots have byte-SHA and image-decode receipts; image-bound context is available for ${imageBoundContextCount}/34, ${visualContextTimeoutCount} attempted analyses timed out, and the remaining shots are unassessed.`,
      "The six frozen article fixtures have exact copy only and no source-frame bindings, adjacent-frame hashes, reference-cell hashes, or copy-fit evidence.",
      `${verifiedReviewCandidateCount} current shot(s) have a source-bound review candidate with reference-cell record SHA, copy-fit, verified font binary, and composite; the other text-bearing shots still lack these bindings.`,
      "The reviewed ED-28 overlay uses a local editable support-font path; generated EVA hero assets and whole-film 03/04 mechanism, hold-duration, and adjacency review remain unproven.",
    ],
    boundaries: {
      formalWorkspaceMutation: false,
      formalBoardMutation: false,
      generatedAssets: false,
      assembly: false,
      layerExtraction: false,
      motion: false,
      render: false,
      productionAdmission: false,
      status: "REVIEW_ONLY",
    },
  };

  const out = path.join(root, outputDir);
  fs.mkdirSync(out, {recursive: true});
  for (const extension of ["json", "md"]) {
    const priorPath = path.join(out, `report.${extension}`);
    const backupPath = path.join(out, `report.pre-canonical-route-heuristic.${extension}`);
    if (fs.existsSync(priorPath) && !fs.existsSync(backupPath)) fs.copyFileSync(priorPath, backupPath);
  }
  fs.writeFileSync(path.join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    "# A1 Film Typography Director v3 — Canonical Shadow Report",
    "",
    `Status: ${report.status} · current film ${board.timelineItems.length} beats · ${fixtures.length} frozen articles / ${fixtureData.articles.reduce((count, article) => count + article.shots.length, 0)} beats`,
    "",
    `**Canonical director:** \`${A1_FILM_TYPOGRAPHY_DIRECTOR_V3}\` imported from \`apps/studio-next/src/lib/a1-film-typography-director-v3.mjs\` and invoked once per film/fixture.`,
    `**FilmTypographyBible:** \`${current.director.bible.contract}\` · SHA-256 \`${current.director.bible.bibleSha256}\` · validation ${current.director.bibleValidationFailures.length ? "BLOCKED" : "PASS"} · shared across all inputs ${sharedBibleSha256s.length === 1}.`,
    `Sole design reference board: \`${current.director.bible.referenceBoard.path}\` · SHA-256 \`${current.director.bible.referenceBoard.sha256}\`.`,
    `Verified font profiles: ${Object.entries(current.director.bible.fontProfiles).map(([id, profile]) => `${id} ${profile.binaryAssets.length} binary SHA(s) · profile ${profile.profileSha256}`).join("; ")}.`,
    `Role boundaries: EVA ${current.director.bible.referenceAuthority.EVA} · GAWX ${current.director.bible.referenceAuthority.GAWX} · Pinterest ${current.director.bible.referenceAuthority.Pinterest} · Fusion Pixel ${current.director.bible.referenceAuthority.FUSION_PIXEL}.`,
    `**Current source frames:** ${verifiedFrameCount}/${totalFrameProofs} matched their declared SHA and decoded.`,
    `**Image-bound context reuse:** ${imageBoundContextCount}/${board.timelineItems.length} current shots · ${visualContextTimeoutCount} analysis timeouts · ${attemptedContextCount} attempted.`,
    `**Current routes:** ${Object.entries(current.summary.routeCounts).map(([route, count]) => `${route} ${count}`).join(" · ")} · blocked beats ${current.summary.blockedBeatCount} · incumbent route changes ${changes.length}.`,
    `**Verified real-frame typography candidates:** ${verifiedReviewCandidateCount}. ED-28 is one review-only support-label sample; it does not approve the whole film.`,
    "",
    "This is routing evidence only. The prior `report.json` was produced by an independent `routeBeat` approximation; it has been preserved as `report.pre-canonical-route-heuristic.json` and is superseded by this report.",
    "",
    "## Six frozen article fixtures",
    "",
    ...blindFixtures.map((fixture) => `- ${fixture.articleId}: ${Object.entries(fixture.routeCounts).map(([route, count]) => `${route} ${count}`).join(", ")}; blocked ${fixture.blockedBeatCount}/8; incumbent route changes ${fixture.changedCount}.`),
    "",
    "## Blocking evidence",
    "",
    ...report.blockingGaps.map((gap) => `- ${gap}`),
    "",
    "## Authority and boundaries",
    "",
    `Current stage: \`${report.authoritySnapshot.currentPhase.currentStage}\`; next action: \`${report.authoritySnapshot.currentPhase.nextAction}\`; generation queue: ${JSON.stringify(report.authoritySnapshot.currentPhase.generationQueue)}.`,
    `Authority audit matches the current declared workspace SHA: ${report.authoritySnapshot.authorityAudit.matchesCurrentDeclaredWorkspaceSha}.`,
    "No formal workspace, current board, generated asset, Assembly, motion, render, or production authority was changed.",
    "",
  ];
  fs.writeFileSync(path.join(out, "report.md"), lines.join("\n"));
  console.log(JSON.stringify({
    status: report.status,
    canonicalDirector: report.canonicalDirectorContract,
    currentBeats: board.timelineItems.length,
    currentFramesVerified: `${verifiedFrameCount}/${totalFrameProofs}`,
    currentRouteCounts: current.summary.routeCounts,
    blockedCurrentBeats: current.summary.blockedBeatCount,
    blindArticles: fixtures.length,
    blindBeats: fixtureData.articles.reduce((count, article) => count + article.shots.length, 0),
    output: path.join(outputDir, "report.json"),
  }, null, 2));
}

await main();
