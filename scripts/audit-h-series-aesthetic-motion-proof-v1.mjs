#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidateName = 'h-series-director-candidate-v1';
const artifactRoot = join(
  projectRoot,
  '.codex-artifacts',
  'system-progress-system-line',
  candidateName,
);
const publicRoot = join(
  projectRoot,
  'apps',
  'studio-next',
  'public',
  'generated',
  'system-line',
  candidateName,
);
const proofDirectoryName = 'aesthetic-motion-proof-v2-postpatch';
const proofArtifactRoot = join(artifactRoot, proofDirectoryName);
const proofPublicRoot = join(publicRoot, proofDirectoryName);

const contractPath = join(artifactRoot, 'production-sop-contract.json');
const planPath = join(artifactRoot, 'aesthetic-motion-upgrade-plan.json');
const proofReportPath = join(proofArtifactRoot, 'report.json');
const proofContactSheetPath = join(proofArtifactRoot, 'contact-sheet.png');
const publicContractPath = join(publicRoot, 'production-sop-contract.json');
const publicPlanPath = join(publicRoot, 'aesthetic-motion-upgrade-plan.json');
const publicProofReportPath = join(proofPublicRoot, 'report.json');
const publicProofContactSheetPath = join(proofPublicRoot, 'contact-sheet.png');

const checks = [];

function addCheck(id, passed, detail) {
  checks.push({ id, passed: Boolean(passed), detail });
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { __parseError: error instanceof Error ? error.message : String(error) };
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sameFile(left, right) {
  return existsSync(left) && existsSync(right) && sha256(left) === sha256(right);
}

function hasNoEnabledLock(value) {
  return value === false || value === undefined || value === null;
}

function reportStatus(value) {
  return value?.status ?? value?.summary?.status ?? value?.result?.status ?? null;
}

const contract = readJson(contractPath);
const plan = readJson(planPath);
const proofReport = readJson(proofReportPath);

addCheck(
  'production-sop-contract-present',
  contract && !contract.__parseError,
  contract?.__parseError ?? contractPath,
);
addCheck(
  'production-sop-contract-ready',
  contract?.contract === 'A1ArticleMotionProductionSOP/v1' &&
    contract?.status === 'READY_FOR_AESTHETIC_MOTION_UPGRADE',
  `status=${contract?.status ?? 'missing'}`,
);
addCheck(
  'production-sop-locks-closed',
  contract &&
    hasNoEnabledLock(contract.rendererAdoptionAllowed) &&
    hasNoEnabledLock(contract.fullMp4RenderAllowed) &&
    hasNoEnabledLock(contract.finalRenderAllowed) &&
    hasNoEnabledLock(contract.resolveExportAllowed),
  'rendererAdoptionAllowed/fullMp4RenderAllowed/finalRenderAllowed/resolveExportAllowed=false',
);
addCheck(
  'aesthetic-motion-plan-present',
  plan && !plan.__parseError,
  plan?.__parseError ?? planPath,
);
addCheck(
  'aesthetic-motion-plan-gated-by-sop',
  plan?.contract === 'A1HSeriesAestheticMotionUpgradePlan/v1' &&
    plan?.sourceProductionContract ===
      '.codex-artifacts/system-progress-system-line/h-series-director-candidate-v1/production-sop-contract.json' &&
    plan?.status === 'READY_FOR_REVIEW_ONLY_PROOF',
  `status=${plan?.status ?? 'missing'}`,
);
addCheck(
  'aesthetic-motion-plan-remains-review-only',
  plan &&
    plan?.proofOnly === true &&
    hasNoEnabledLock(plan.rendererPatchAllowed) &&
    hasNoEnabledLock(plan.rendererAdoptionAllowed) &&
    hasNoEnabledLock(plan.fullMp4RenderAllowed) &&
    hasNoEnabledLock(plan.finalRenderAllowed) &&
    hasNoEnabledLock(plan.resolveExportAllowed),
  'proofOnly=true; renderer/source/final locks remain closed',
);
addCheck(
  'aesthetic-motion-proof-report-present',
  proofReport && !proofReport.__parseError,
  proofReport?.__parseError ?? proofReportPath,
);
addCheck(
  'aesthetic-motion-proof-report-is-passing',
  proofReport &&
    (reportStatus(proofReport) === null ||
      ['PASS', 'READY_FOR_REVIEW_ONLY_PROOF'].includes(reportStatus(proofReport))),
  `status=${reportStatus(proofReport) ?? 'not-declared'}`,
);
addCheck(
  'aesthetic-motion-proof-contact-sheet-present',
  existsSync(proofContactSheetPath),
  proofContactSheetPath,
);
addCheck(
  'aesthetic-motion-proof-public-report-identical',
  sameFile(proofReportPath, publicProofReportPath),
  `${proofReportPath} == ${publicProofReportPath}`,
);
addCheck(
  'aesthetic-motion-proof-public-contact-sheet-identical',
  sameFile(proofContactSheetPath, publicProofContactSheetPath),
  `${proofContactSheetPath} == ${publicProofContactSheetPath}`,
);
addCheck(
  'production-sop-contract-public-identical',
  sameFile(contractPath, publicContractPath),
  `${contractPath} == ${publicContractPath}`,
);
addCheck(
  'aesthetic-motion-plan-public-identical',
  sameFile(planPath, publicPlanPath),
  `${planPath} == ${publicPlanPath}`,
);

const passed = checks.every((check) => check.passed);
const output = {
  contract: 'A1HSeriesAestheticMotionProofAudit/v1',
  generatedAt: new Date().toISOString(),
  candidate: candidateName,
  proofDirectory: proofDirectoryName,
  status: passed ? 'PASS' : 'BLOCKED',
  proofOnly: true,
  rendererAdoptionAllowed: false,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  nextAction: passed
    ? 'show-review-only-proof-on-4311-then-prepare-targeted-motion-preview'
    : 'repair-aesthetic-motion-proof-gate-before-any-new-visual-upgrade',
  checks,
  evidence: {
    productionSopContract: contractPath,
    aestheticMotionPlan: planPath,
    proofReport: proofReportPath,
    proofContactSheet: proofContactSheetPath,
    publicProofReport: publicProofReportPath,
    publicProofContactSheet: publicProofContactSheetPath,
  },
};

const reportDirectory = join(artifactRoot, 'aesthetic-motion-proof-audit-v1');
const publicReportDirectory = join(publicRoot, 'aesthetic-motion-proof-audit-v1');
mkdirSync(reportDirectory, { recursive: true });
mkdirSync(publicReportDirectory, { recursive: true });

const reportJson = `${JSON.stringify(output, null, 2)}\n`;
const reportMarkdown = [
  '# H-series aesthetic motion proof audit',
  '',
  `- Status: **${output.status}**`,
  `- Proof mode: **review-only**`,
  `- Candidate: \`${candidateName}\``,
  `- Proof set: \`${proofDirectoryName}\``,
  '',
  'This gate is downstream of the production SOP contract. It does not authorize renderer adoption, full MP4 rendering, final rendering, or Resolve export.',
  '',
  '## Checks',
  '',
  ...checks.map((check) => `- ${check.passed ? 'PASS' : 'BLOCKED'} \`${check.id}\`: ${check.detail}`),
  '',
  `Next action: \`${output.nextAction}\``,
  '',
].join('\n');

writeFileSync(join(reportDirectory, 'report.json'), reportJson);
writeFileSync(join(reportDirectory, 'report.md'), reportMarkdown);
writeFileSync(join(publicReportDirectory, 'report.json'), reportJson);
writeFileSync(join(publicReportDirectory, 'report.md'), reportMarkdown);

console.log(JSON.stringify({
  status: output.status,
  checkCount: checks.length,
  failedChecks: checks.filter((check) => !check.passed).map((check) => check.id),
  report: join(reportDirectory, 'report.json'),
  publicReport: join(publicReportDirectory, 'report.json'),
  nextAction: output.nextAction,
}, null, 2));

if (!passed) process.exitCode = 1;
