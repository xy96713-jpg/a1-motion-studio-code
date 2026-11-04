import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {analyzeTypographyVisualContextV1} from "../apps/studio-next/src/lib/a1-typography-visual-context-provider-v1.mjs";
import {
  A1_FILM_TYPOGRAPHY_DIRECTOR_V3,
  A1_TYPOGRAPHY_VISUAL_CONTEXT_V2,
  compileFilmTypographyDirectorV3,
  validateFilmTypographyDirectorV3,
} from "../apps/studio-next/src/lib/a1-film-typography-director-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timelinePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json";
const shadowReportPath = "work/typography-director-v3-shadow-v1/report.json";
const priorCanaryPath = "work/typography-director-v3-shadow-v1/visual-context-canary/carrier-matrix-real-canaries.json";
const outputPath = "work/typography-director-v3-shadow-v1/visual-context-canary/three-shot-current-frame-context-v1.json";
const checkpointDir = "work/typography-director-v3-shadow-v1/visual-context-canary/three-shot-context-checkpoints-v1";
const selectedShotIds = ["ED-13", "ED-28", "ED-17"];
const shotIntent = {
  "ED-13": {carrierHint: "PRESENTER", semanticDuty: "EXPLANATION", semanticImportance: "MEDIUM"},
  "ED-28": {carrierHint: "SCREEN_UI", semanticDuty: "PROCESS", semanticImportance: "MEDIUM"},
  "ED-17": {carrierHint: "MIXED", semanticDuty: "PROCESS", semanticImportance: "MEDIUM"},
};
const visualTimeoutMs = 120_000;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));

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

function resolveFrame(item, publicRoot, declaredFrameProof) {
  const publicUrl = String(item.preview?.publicUrl || "");
  const expectedSha256 = item.preview?.sha256 || item.artifactSha256 || null;
  if (!publicUrl.startsWith("/generated/system-line/editorial-asset-workbench-v1/") || publicUrl.includes("..")) {
    throw new Error(`frame-path-invalid:${item.shotId}`);
  }
  const framePath = path.resolve(publicRoot, publicUrl.replace(/^\/+/, ""));
  if (!isInside(framePath, publicRoot)) throw new Error(`frame-path-outside-public-root:${item.shotId}`);
  const bytes = fs.readFileSync(framePath);
  const actualSha256 = hash(bytes);
  if (!expectedSha256 || actualSha256 !== expectedSha256) throw new Error(`frame-sha-mismatch:${item.shotId}`);
  if (declaredFrameProof?.actualSha256 !== actualSha256 || declaredFrameProof?.byteShaVerified !== true || declaredFrameProof?.decoded !== true) {
    throw new Error(`current-shadow-frame-proof-missing:${item.shotId}`);
  }
  return {framePath, publicUrl, expectedSha256, actualSha256, byteShaVerified: true, decoded: true, byteCount: bytes.length};
}

async function main() {
  const startedAt = Date.now();
  const timelineBytes = read(timelinePath);
  const board = JSON.parse(timelineBytes);
  const shadowReport = JSON.parse(read(shadowReportPath));
  const priorCanary = JSON.parse(read(priorCanaryPath));
  const providerSourceSha256 = hash(read("apps/studio-next/src/lib/a1-typography-visual-context-provider-v1.mjs"));
  const directorSourceSha256 = hash(read("apps/studio-next/src/lib/a1-film-typography-director-v3.mjs"));
  fs.mkdirSync(path.join(root, checkpointDir), {recursive: true});
  const priorFrameShas = new Set((priorCanary.cases || []).map((item) => item.frameSha256).filter(Boolean));
  const decisionsByShot = new Map(shadowReport.incumbentComparison.current.decisions.map((decision) => [decision.shotId, decision]));
  const timelineByShot = new Map(board.timelineItems.map((item) => [item.shotId, item]));
  const publicRoot = fs.realpathSync(path.join(root, "apps/studio-next/public"));
  const allowedRoot = fs.realpathSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1"));

  const inputItems = selectedShotIds.map((shotId) => {
    const item = timelineByShot.get(shotId);
    const priorDecision = decisionsByShot.get(shotId);
    if (!item || !priorDecision) throw new Error(`selected-shot-not-in-current-shadow:${shotId}`);
    const proof = resolveFrame(item, publicRoot, priorDecision.shadowEvidence?.frame);
    if (priorFrameShas.has(proof.actualSha256)) throw new Error(`unchanged-visual-context-already-audited:${shotId}`);
    return {item, proof, intent: shotIntent[shotId], priorDecision};
  });
  if (new Set(inputItems.map((item) => item.proof.actualSha256)).size !== inputItems.length) {
    throw new Error("selected-canary-frames-must-be-distinct");
  }

  const analyzed = await mapWithConcurrency(inputItems, 2, async ({item, proof, intent, priorDecision}) => {
    const sourceProvenance = {
      kind: `CURRENT_TIMELINE_${item.sourceRole || "UNKNOWN"}_UNAPPROVED_BOARD_FRAME`,
      sourceIdentityVerified: false,
      renderAllowed: false,
    };
    const request = {
      framePath: proof.framePath,
      expectedFrameSha256: proof.actualSha256,
      allowedRoots: [allowedRoot],
      carrierHint: intent.carrierHint,
      semanticDuty: intent.semanticDuty,
      exactCopy: item.sourceText || "",
      sourceProvenance,
      visualTimeoutMs,
    };
    const requestSha256 = hash(JSON.stringify({
      frameSha256: proof.actualSha256,
      carrierHint: intent.carrierHint,
      semanticDuty: intent.semanticDuty,
      semanticImportance: intent.semanticImportance,
      exactCopy: item.sourceText || "",
      sourceProvenance,
      providerSourceSha256,
      directorSourceSha256,
      visualModel: process.env.A1_VISUAL_AI_DIRECTOR_MODEL || "codex-cli-configured-default",
    }));
    const checkpointPath = path.join(root, checkpointDir, `${item.shotId}.json`);
    const frameReceipt = {...proof};
    delete frameReceipt.framePath;
    if (fs.existsSync(checkpointPath)) {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      if (checkpoint.requestSha256 === requestSha256 && checkpoint.frame?.actualSha256 === proof.actualSha256) {
        return {...checkpoint, cacheHit: true};
      }
      throw new Error(`stale-visual-context-checkpoint:${item.shotId}`);
    }
    let result;
    try {
      const assessment = await analyzeTypographyVisualContextV1(request);
      result = {
        shotId: item.shotId,
        status: assessment.status,
    requestSha256,
        frame: {...frameReceipt, width: assessment.context.frame.width, height: assessment.context.frame.height, format: assessment.context.frame.format},
        carrierHint: intent.carrierHint,
        semanticDuty: intent.semanticDuty,
        semanticImportance: intent.semanticImportance,
        exactCopySha256: hash(Buffer.from(item.sourceText || "", "utf8")),
        context: assessment.context,
        trace: assessment.trace,
        priorDecision: {route: priorDecision.route, semanticDuty: priorDecision.semanticDuty},
        failure: null,
        cacheHit: false,
      };
    } catch (error) {
      result = {
        shotId: item.shotId,
        status: "BLOCKED_REVIEW_ONLY",
        requestSha256,
        frame: frameReceipt,
        carrierHint: intent.carrierHint,
        semanticDuty: intent.semanticDuty,
        semanticImportance: intent.semanticImportance,
        exactCopySha256: hash(Buffer.from(item.sourceText || "", "utf8")),
        context: null,
        trace: null,
        priorDecision: {route: priorDecision.route, semanticDuty: priorDecision.semanticDuty},
        failure: String(error?.message || "VISUAL_CONTEXT_ANALYSIS_FAILED").split(":")[0],
        cacheHit: false,
      };
    }
    const checkpointTempPath = `${checkpointPath}.tmp`;
    fs.writeFileSync(checkpointTempPath, `${JSON.stringify(result, null, 2)}\n`);
    fs.renameSync(checkpointTempPath, checkpointPath);
    return result;
  });

  const bible = shadowReport.filmTypographyBible;
  const isolatedDirectors = analyzed.map((result) => {
    const item = timelineByShot.get(result.shotId);
    const index = board.timelineItems.findIndex((candidate) => candidate.shotId === result.shotId);
    const previous = shadowReport.incumbentComparison.current.decisions[index - 1];
    const next = shadowReport.incumbentComparison.current.decisions[index + 1];
    const failedContext = {
      contract: A1_TYPOGRAPHY_VISUAL_CONTEXT_V2,
      carrierClass: result.carrierHint,
      frame: {sha256: result.frame.actualSha256, byteShaVerified: true, width: result.frame.width, height: result.frame.height},
      visualAssessment: {frameSha256: result.frame.actualSha256, method: "PROVIDER_FAILED", confidence: 0},
      protectedRegions: [],
      availableRegions: [],
      nativeText: {},
      sourceProvenance: {
        kind: `CURRENT_TIMELINE_${item.sourceRole || "UNKNOWN"}_UNAPPROVED_BOARD_FRAME`,
        sourceIdentityVerified: false,
        renderAllowed: false,
      },
    };
    const beat = {
      shotId: result.shotId,
      exactCopy: item.sourceText || "",
      semanticDuty: result.semanticDuty,
      semanticImportance: result.semanticImportance,
      sequenceBoundary: "ONLY",
      visualContext: result.context || failedContext,
      reference: null,
      neighbors: {
        previousFrameSha256: previous?.shadowEvidence?.frame?.byteShaVerified && previous?.shadowEvidence?.frame?.decoded
          ? previous.shadowEvidence.frame.actualSha256 : null,
        nextFrameSha256: next?.shadowEvidence?.frame?.byteShaVerified && next?.shadowEvidence?.frame?.decoded
          ? next.shadowEvidence.frame.actualSha256 : null,
      },
      copyFit: null,
    };
    const director = compileFilmTypographyDirectorV3({
      articleId: `isolated-visual-context-${result.shotId}`,
      programMode: "SHADOW_REVIEW_ONLY",
      bible,
      beats: [beat],
    });
    return {
      shotId: result.shotId,
      director: {
        contract: director.contract,
        status: director.status,
        directorSha256: director.directorSha256,
        summary: director.summary,
        validationFailures: validateFilmTypographyDirectorV3(director),
        decision: director.decisions[0],
        productionAdmission: false,
      },
    };
  });
  const aggregateRouteCounts = Object.fromEntries(
    ["NO_TYPE", "SOURCE_NATIVE", "EDITABLE_LOCAL_TYPE", "GENERATED_HERO_GLYPH"]
      .map((route) => [route, isolatedDirectors.filter((entry) => entry.director.decision.route === route).length]),
  );
  const allContextsCaptured = analyzed.every((result) => result.status === "READY_FOR_REVIEW_ONLY_ROUTING");
  const output = {
    contract: "A1TypographyThreeShotVisualContextCanary/v1",
    status: allContextsCaptured ? "CONTEXT_CAPTURED_REVIEW_ONLY" : "CONTEXT_CAPTURE_PARTIAL_REVIEW_ONLY",
    packageReadiness: "BLOCKED_REVIEW_ONLY",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    concurrency: 2,
    visualTimeoutMs,
    canonicalDirector: A1_FILM_TYPOGRAPHY_DIRECTOR_V3,
    filmTypographyBibleSha256: bible.bibleSha256,
    sourceBinding: {
      timelineManifestSha256: hash(timelineBytes),
      referenceBoardSha256: bible.referenceBoard.sha256,
      currentWholeFilmSha256: shadowReport.sourceBinding.workspaceSha256,
      providerSourceSha256,
      directorSourceSha256,
      visualTimeoutMs,
      selectedShots: analyzed.map(({shotId, requestSha256, frame, status, failure}) => ({
        shotId, requestSha256, frameSha256: frame.actualSha256, byteCount: frame.byteCount, status, failure,
      })),
      newUniqueFrameCount: analyzed.filter((result) => !priorFrameShas.has(result.frame.actualSha256)).length,
    },
    visualContextReceipts: analyzed.map(({shotId, status, requestSha256, frame, context, failure}) => ({
      shotId,
      status,
      cacheHit: analyzed.find((result) => result.shotId === shotId)?.cacheHit || false,
      requestSha256,
      frameSha256: frame.actualSha256,
      byteShaVerified: frame.byteShaVerified ?? true,
      decoded: frame.decoded ?? true,
      width: context?.frame.width || frame.width || null,
      height: context?.frame.height || frame.height || null,
      carrierClass: context?.carrierClass || null,
      visualConfidence: context?.visualAssessment.confidence ?? null,
      protectedRegionCount: context?.protectedRegions.length ?? null,
      safeRegionCount: context?.availableRegions.length ?? null,
      ocrRegionCount: context?.nativeText.ocrRegionCount ?? null,
      nativeTextAdequacy: context?.nativeText.sufficientForDuty ?? null,
      failure,
    })),
    directorResults: isolatedDirectors,
    aggregateRoutes: aggregateRouteCounts,
    blockedBeatCount: isolatedDirectors.filter((entry) => entry.director.decision.blockers.length > 0).length,
    previousAttemptHistory: [
      {
        shotIds: ["ED-07", "ED-24", "ED-16"],
        outcome: "provider tasks returned to the in-memory aggregation, but report construction failed before persistence; their outputs are unavailable and those frame SHAs were not retried",
      },
      ...(fs.existsSync(path.join(root, checkpointDir, "ED-27.json")) ? [{
        shotId: "ED-27",
        frameSha256: JSON.parse(fs.readFileSync(path.join(root, checkpointDir, "ED-27.json"), "utf8")).frame.actualSha256,
        outcome: "BLOCKED_REVIEW_ONLY: typography-visual-assessment-timeout; checkpoint retained and frame not retried",
      }] : []),
    ],
    proofBoundary: {
      frameContextOnly: true,
      glyphAssetsGenerated: false,
      compositeGenerated: false,
      userVisualApproval: false,
      productionAdmission: false,
      formalWorkspaceMutation: false,
      currentBoardMutation: false,
    },
    traces: analyzed.map(({shotId, requestSha256, trace, failure}) => ({shotId, requestSha256, trace, failure})),
  };
  const fullOut = path.join(root, outputPath);
  fs.mkdirSync(path.dirname(fullOut), {recursive: true});
  fs.writeFileSync(fullOut, `${JSON.stringify(output, null, 2)}\n`);
  const markdown = [
    "# Typography v3 three-shot real-frame context canary",
    "",
    `Status: ${output.status} · frames analyzed ${analyzed.length} · concurrency ${output.concurrency} · timeout ${output.visualTimeoutMs}ms · duration ${output.elapsedMs}ms`,
    `Canonical director: ${A1_FILM_TYPOGRAPHY_DIRECTOR_V3} · FilmTypographyBible SHA ${bible.bibleSha256}`,
    "",
    "| Shot | Carrier | Confidence | Protected regions | Safe regions | OCR regions | Director route | Blockers |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...isolatedDirectors.map((entry, index) => {
      const decision = entry.director.decision;
      const receipt = output.visualContextReceipts[index];
      return `| ${decision.shotId} | ${receipt.carrierClass || "unavailable"} | ${receipt.visualConfidence ?? "—"} | ${receipt.protectedRegionCount ?? "—"} | ${receipt.safeRegionCount ?? "—"} | ${receipt.ocrRegionCount ?? "—"} | ${decision.route} | ${decision.blockers.join(", ") || "none"} |`;
    }),
    "",
    "These frames are current timeline carriers selected by source role: presenter, screen UI and mixed editorial. The existing canary matrix did not contain these frame SHAs, so they were new image-bound inputs. This remains a routing/context receipt only; it creates no glyphs or composites.",
    "",
  ].join("\n");
  fs.writeFileSync(fullOut.replace(/\.json$/u, ".md"), markdown);
  console.log(JSON.stringify({status: output.status, analyzed: analyzed.length, routeCounts: aggregateRouteCounts, blockedBeatCount: output.blockedBeatCount, elapsedMs: output.elapsedMs, output: outputPath}, null, 2));
}

await main();
