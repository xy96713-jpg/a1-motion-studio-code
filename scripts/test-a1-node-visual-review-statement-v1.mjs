import assert from "node:assert/strict";
import {
  A1_NODE_VISUAL_REVIEW_PREDICATE_TYPE,
  A1_NODE_VISUAL_REVIEW_STATEMENT_TYPE,
  assertA1NodeVisualReviewStatementV1,
  createA1NodeVisualReviewStatementV1,
} from "../apps/studio-next/src/lib/a1-node-visual-review-statement-v1.mjs";

const sha = (character) => character.repeat(64);
const fixtureRows = [
  {id: "case-alpha", genre: "explainer", compositeNodeId: "node-alpha", png: "1", composite: "2", diagram: "3"},
  {id: "case-beta", genre: "tutorial", compositeNodeId: "node-beta", png: "4", composite: "5", diagram: "6"},
  {id: "case-gamma", genre: "opinion", compositeNodeId: "node-gamma", png: "7", composite: "8", diagram: "9"},
];
const inputHashes = {resultSha256: sha("a"), reviewEvidenceSha256: sha("b"), reviewerId: "independent-read-only-subagent"};

function makeFixtureRows() {
  return fixtureRows.map((item, index) => ({
    id: item.id,
    genre: item.genre,
    status: "PASS",
    compositeNodeId: item.compositeNodeId,
    previewArtifactPath: `outputs/${item.id}.png`,
    compositePngSha256: sha(item.png),
    compositeManifestSha256: sha(item.composite),
    diagramManifestSha256: sha(item.diagram),
    technicalAcceptance: "BYTES_AND_FORMAT_ONLY",
    diagramManifestSha256: sha(item.diagram),
    sourceEvidenceIds: [],
    sourceEvidenceResolved: false,
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
    fixtureIndex: index,
  }));
}

function makeInputs(overrides = {}) {
  const fixtures = overrides.fixtures || makeFixtureRows();
  const genres = [...new Set(fixtures.map((fixture) => fixture.genre))].sort();
  const result = overrides.result || {
    contract: "A1DirectorPlanCompositeDagIntegration/v1",
    status: "PASS",
    fixtures,
    proofBoundary: {
      sourceEvidenceResolved: false,
      technicalAcceptance: "BYTES_AND_FORMAT_ONLY",
      visualApproval: "NOT_GRANTED",
      productionAdmission: false,
      productionAuthorityChanged: false,
    },
    visibleArtifact: {path: "review/contact-sheet.png", sha256: sha("c")},
  };
  const count = result.fixtures.length;
  const reviewEvidence = overrides.reviewEvidence || {
    contract: "A1NodeVisualReviewEvidenceProjection/v1",
    status: "PASS",
    reviewerRole: "independent-read-only-subagent",
    reviewReportSha256: sha("d"),
    reviewedResultSha256: inputHashes.resultSha256,
    reviewedContactSheetPath: "review/contact-sheet.png",
    reviewedContactSheetSha256: sha("c"),
    visualDecision: "PASS",
    coverage: {fixtureCount: count, genreCount: genres.length, fixturesPass: count, genres},
    pixelChecks: {
      decodedPngCount: count,
      dimensions: "1280x720",
      channels: 4,
      alphaBoundsMatchResultAndStayInFrame: true,
      nonzeroAlphaPixelCountsMatchResult: true,
    },
    outputs: result.fixtures.map((fixture) => ({
      fixtureId: fixture.id,
      artifactSha256: fixture.compositePngSha256,
      compositeManifestSha256: fixture.compositeManifestSha256,
      diagramManifestSha256: fixture.diagramManifestSha256,
      decision: "PASS",
      reasonCodes: [],
      fullSizeInspected: true,
      legible: true,
      obviousClipping: false,
      blank: false,
    })),
    boundary: {
      signed: false,
      visualApproval: "NOT_GRANTED",
      productionAdmission: false,
    },
  };
  return {...inputHashes, result, reviewEvidence, ...overrides, result, reviewEvidence};
}

const input = makeInputs();
const statement = createA1NodeVisualReviewStatementV1(input);

assert.deepEqual(statement, createA1NodeVisualReviewStatementV1(makeInputs()), "statement creation is deterministic");
assert.equal(statement._type, A1_NODE_VISUAL_REVIEW_STATEMENT_TYPE);
assert.equal(statement.predicateType, A1_NODE_VISUAL_REVIEW_PREDICATE_TYPE);
assert.deepEqual(statement.subject, [
  {name: "outputs/case-alpha.png", digest: {sha256: sha("1")}},
  {name: "outputs/case-beta.png", digest: {sha256: sha("4")}},
  {name: "outputs/case-gamma.png", digest: {sha256: sha("7")}},
]);
assert.deepEqual(statement.predicate.outputs, [
  {id: "case-alpha", nodeId: "node-alpha", previewArtifactPath: "outputs/case-alpha.png", compositePngSha256: sha("1"), compositeManifestSha256: sha("2"), diagramManifestSha256: sha("3"), technicalAcceptance: "BYTES_AND_FORMAT_ONLY", decision: "PASS", reasonCodes: []},
  {id: "case-beta", nodeId: "node-beta", previewArtifactPath: "outputs/case-beta.png", compositePngSha256: sha("4"), compositeManifestSha256: sha("5"), diagramManifestSha256: sha("6"), technicalAcceptance: "BYTES_AND_FORMAT_ONLY", decision: "PASS", reasonCodes: []},
  {id: "case-gamma", nodeId: "node-gamma", previewArtifactPath: "outputs/case-gamma.png", compositePngSha256: sha("7"), compositeManifestSha256: sha("8"), diagramManifestSha256: sha("9"), technicalAcceptance: "BYTES_AND_FORMAT_ONLY", decision: "PASS", reasonCodes: []},
]);
assert.equal(statement.predicate.inputs.resultSha256, inputHashes.resultSha256);
assert.equal(statement.predicate.inputs.independentReviewSha256, inputHashes.reviewEvidenceSha256);
assert.equal(statement.predicate.inputs.sourceReviewReportSha256, sha("d"));
assert.equal(statement.predicate.inputs.contactSheetSha256, sha("c"));
assert.equal(statement.predicate.review.decision, "PASS");
assert.equal(statement.predicate.review.method, "FULL_SIZE_PNG_DECODE_AND_ACTUAL_PIXEL_INSPECTION");
assert.equal(statement.predicate.review.checks.fullSizePreviewsInspected, 3);
assert.equal(statement.predicate.statementSecurity.signed, false);
assert.equal(statement.predicate.statementSecurity.signatureFormat, "NONE");
assert.equal(statement.predicate.statementSecurity.productionEnabled, false);
assert.equal(statement.predicate.boundary.visualApproval, "NOT_GRANTED");
assert.equal(statement.predicate.boundary.productionAdmission, false);
assert.equal(assertA1NodeVisualReviewStatementV1(statement, input), statement);

const missingOutput = structuredClone(input);
missingOutput.result.fixtures.pop();
assert.throws(() => createA1NodeVisualReviewStatementV1(missingOutput), /coverage-mismatch/u, "missing output fails coverage");
const duplicatePixels = structuredClone(input);
duplicatePixels.result.fixtures[1].compositePngSha256 = duplicatePixels.result.fixtures[0].compositePngSha256;
assert.throws(() => createA1NodeVisualReviewStatementV1(duplicatePixels), /output-identity-duplicate/u, "duplicate output digest is rejected");

const projectBound = structuredClone(input);
projectBound.result.fixtures[0].projectId = "project-a";
const projectBoundStatement = createA1NodeVisualReviewStatementV1(projectBound);
assert.equal(projectBoundStatement.predicate.outputs.find((item) => item.id === "case-alpha").projectId, "project-a", "available project identity is carried into its output receipt");

const changedManifest = structuredClone(input);
changedManifest.result.fixtures[0].compositeManifestSha256 = sha("f");
assert.throws(() => assertA1NodeVisualReviewStatementV1(statement, changedManifest), /output-decision-invalid/u, "changed accepted manifest invalidates its per-output review binding");

assert.throws(() => assertA1NodeVisualReviewStatementV1(statement, {...input, resultSha256: sha("d")}), /result-sha-stale/u, "review evidence cannot point at stale result bytes");
assert.throws(() => assertA1NodeVisualReviewStatementV1(statement, {...input, reviewEvidenceSha256: sha("e")}), /binding-invalid/u, "stale independent-review SHA is rejected");

const duplicateSubject = structuredClone(statement);
duplicateSubject.subject[2] = structuredClone(duplicateSubject.subject[1]);
assert.throws(() => assertA1NodeVisualReviewStatementV1(duplicateSubject, input), /binding-invalid|subject-invalid/u, "duplicate subjects are rejected");
const missingSubject = structuredClone(statement);
missingSubject.subject.pop();
assert.throws(() => assertA1NodeVisualReviewStatementV1(missingSubject, input), /binding-invalid/u, "missing subject is rejected");
const extraSubject = structuredClone(statement);
extraSubject.subject.push({name: "outputs/extra.png", digest: {sha256: sha("f")}});
assert.throws(() => assertA1NodeVisualReviewStatementV1(extraSubject, input), /binding-invalid/u, "extra subject is rejected");
const wrongSubject = structuredClone(statement);
wrongSubject.subject[0].digest.sha256 = sha("e");
assert.throws(() => assertA1NodeVisualReviewStatementV1(wrongSubject, input), /binding-invalid/u, "wrong subject digest is rejected");

assert.throws(() => assertA1NodeVisualReviewStatementV1(statement, {...input, reviewerId: "different-agent"}), /binding-invalid/u, "reviewer identity is bound");
const humanReviewerEvidence = structuredClone(input.reviewEvidence);
humanReviewerEvidence.human = true;
assert.throws(() => createA1NodeVisualReviewStatementV1({...input, reviewEvidence: humanReviewerEvidence}), /reviewer-boundary-invalid/u, "human approval cannot be represented as an agent review");

for (const [field, value] of [["visualApproval", "APPROVED"], ["productionAdmission", true], ["signed", true]]) {
  const escalatedReview = structuredClone(input.reviewEvidence);
  escalatedReview.boundary[field] = value;
  assert.throws(() => createA1NodeVisualReviewStatementV1({...input, reviewEvidence: escalatedReview}), /escalation|projection-boundary/u, `${field} escalation is rejected`);
}
const promotedStatement = structuredClone(statement);
promotedStatement.predicate.boundary.visualApproval = "APPROVED";
assert.throws(() => assertA1NodeVisualReviewStatementV1(promotedStatement, input), /binding-invalid|boundary-invalid/u, "statement cannot promote visual approval");

const rejectedInput = structuredClone(input);
rejectedInput.reviewEvidence.outputs[1].decision = "REJECT";
rejectedInput.reviewEvidence.outputs[1].reasonCodes = ["WEAK_VISUAL_HIERARCHY"];
rejectedInput.reviewEvidence.visualDecision = "REJECT";
rejectedInput.reviewEvidence.coverage.fixturesPass = 2;
const rejectedStatement = createA1NodeVisualReviewStatementV1(rejectedInput);
assert.equal(rejectedStatement.predicate.review.decision, "REJECT");
assert.equal(rejectedStatement.predicate.outputs[1].decision, "REJECT");
assert.deepEqual(rejectedStatement.predicate.outputs[1].reasonCodes, ["WEAK_VISUAL_HIERARCHY"]);
assert.equal(rejectedStatement.predicate.boundary.visualApproval, "NOT_GRANTED");
assert.equal(rejectedStatement.predicate.boundary.productionAdmission, false);
assertA1NodeVisualReviewStatementV1(rejectedStatement, rejectedInput);
const inconsistentDecision = structuredClone(rejectedInput);
inconsistentDecision.reviewEvidence.visualDecision = "PASS";
assert.throws(() => createA1NodeVisualReviewStatementV1(inconsistentDecision), /overall-decision-inconsistent/u, "overall decision must agree with output decisions");
const reasonlessReject = structuredClone(rejectedInput);
reasonlessReject.reviewEvidence.outputs[1].reasonCodes = [];
assert.throws(() => createA1NodeVisualReviewStatementV1(reasonlessReject), /output-reasons-invalid/u, "rejected output needs reason codes");

const fabricatedEvidence = structuredClone(input);
fabricatedEvidence.result.fixtures[0].sourceEvidenceIds = ["invented-source-id"];
assert.throws(() => createA1NodeVisualReviewStatementV1(fabricatedEvidence), /source-evidence-fabricated/u, "fabricated source evidence is rejected");

const malformed = {...statement, dsseEnvelope: {payload: "unsigned"}};
assert.throws(() => assertA1NodeVisualReviewStatementV1(malformed, input), /in-toto-statement-invalid/u, "DSSE envelope or unknown top-level fields are rejected");
const missingPixelCoverage = structuredClone(input.reviewEvidence);
missingPixelCoverage.outputs[0].fullSizeInspected = false;
assert.throws(() => createA1NodeVisualReviewStatementV1({...input, reviewEvidence: missingPixelCoverage}), /output-decision-invalid/u, "incomplete full-size pixel review is rejected");

process.stdout.write("PASS a1-node-visual-review-statement-v1: deterministic unsigned in-toto bindings, exact composite subjects, stale SHA/object detection, independent pixel coverage, and non-approval boundary\n");
