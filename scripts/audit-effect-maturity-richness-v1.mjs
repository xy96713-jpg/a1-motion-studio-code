#!/usr/bin/env node
import path from "node:path";
import {inspectEvidenceBindings, isEvidencePass, readJson, shaFile, summarizeFindings, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const base = "work/screen-recording-maturity-test-v1";
const paths = {
  matrix: `${base}/effect-capability-matrix.json`,
  regression: `${base}/effect-maturity-regression-v2/audit-report.json`,
  executionChain: `${base}/execution-chain-v2-audit.json`,
  screenOnly: `${base}/screen-only-output-audit.json`,
  cleanRegression: `${base}/effect-maturity-clean-regression-v1/audit-report.json`,
  narrativeCanary: `${base}/causal-narrative-canary-v1/audit-report.json`,
  readability: `${base}/screen-readability-audit.json`,
};
const reports = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, readJson(path.join(root, file))]));
const sources = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, {path: file, sha256: shaFile(path.join(root, file))}]));
const {matrix, regression, cleanRegression, narrativeCanary, readability, screenOnly, executionChain} = reports;
const items = matrix.items || [];
const counts = items.reduce((out, item) => {out[item.status || "UNKNOWN"] = (out[item.status || "UNKNOWN"] || 0) + 1; return out;}, {});
const families = items.reduce((out, item) => {out[item.family] = (out[item.family] || 0) + 1; return out;}, {});
const bindingAudit = inspectEvidenceBindings(root, sources);
const findings = [
  {id: "LAB_CLIP_COLLECTION", status: "MITIGATED_PARTIAL", reason: "One same-product narrative sample does not qualify all scenarios or an unseen project.", evidence: narrativeCanary.status},
  {id: "CAMERA_SUITABILITY", status: "INCOMPLETE", reason: "Effect counts and camera percentage do not establish appropriate directing; continuous source/output comparison is required."},
  {id: "SOURCE_READABILITY", status: isEvidencePass(readability.status) ? "PASS" : readability.status, evidence: sources.readability},
  {id: "REVIEW_LABEL_CONTAMINATION", status: "INCOMPLETE", reason: "A cleanPolicy declaration alone is not an encoded-frame or playback review."},
  {id: "SCREEN_ONLY", status: screenOnly.status, evidence: sources.screenOnly},
  {id: "EFFECT_ID_COVERAGE", status: !items.length ? "INCOMPLETE" : summarizeFindings(items).status, counts},
  {id: "EXECUTION_CHAIN", status: executionChain.status, evidence: sources.executionChain},
  {id: "PRODUCTION_ADMISSION", severity: "BOUNDARY", status: "LOCKED"},
  ...bindingAudit.failures.map((failure) => ({...failure, status: "FAIL"})),
];
const decision = summarizeFindings(findings);
const report = writeAudit(root, `${base}/effect-maturity-richness-audit.json`, {
  contract: "A1EffectMaturityRichnessAudit/v1", ...decision,
  scope: {effectIdCount: items.length, matrixCounts: counts, families, clipCount: (cleanRegression.clips || []).length, regressionDurationMs: cleanRegression.media?.durationMs ?? regression.media?.durationMs},
  sources, findings, bindingAudit,
  producer: {path: "scripts/audit-effect-maturity-richness-v1.mjs", sha256: shaFile(import.meta.filename)},
  boundary: {reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
}, Object.values(sources));
console.log(JSON.stringify({status: report.status, unresolved: report.unresolved.map((row) => ({id: row.id, status: row.status})), output: `${base}/effect-maturity-richness-audit.json`}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
