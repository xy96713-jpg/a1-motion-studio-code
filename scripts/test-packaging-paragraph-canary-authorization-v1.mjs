#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {assertPackagingParagraphCanaryAuthorization, createPackagingParagraphCanaryAuthorization} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-authorization-v1.mjs";
import {buildPackagingParagraphCanaryImplementationBinding} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";
import {readCurrentProductionAuthorizationBinding} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const boundedTreeSnapshot = (root) => {
  if (!fs.existsSync(root)) return [];
  const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(root, absolutePath);
    return entry.isDirectory() ? [{relativePath, kind: "directory"}, ...walk(absolutePath)] : [{relativePath, kind: "file", bytes: fs.statSync(absolutePath).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex")}];
  });
  return walk(root);
};
const implementation = buildPackagingParagraphCanaryImplementationBinding(projectRoot);
const expected = {workspaceSha256: "1".repeat(64), workspaceFileSha256: "2".repeat(64), transitionSha256: "3".repeat(64), storyboardRevisionSha256: "4".repeat(64), canaryPlanSha256: "5".repeat(64), requestPackSha256: "6".repeat(64), implementationSha256: implementation.implementationSha256};
const receipt = createPackagingParagraphCanaryAuthorization({authorizationId: "test-only-not-persisted", authorized: true, issuedBy: "focused-test", intent: "three review-only static candidates", userAuthorizationText: `授权执行 Pack SHA ${expected.requestPackSha256}`, operatorAttestedUserMessage: true, ...expected, issuedAt: "2026-08-12T20:00:00.000Z"});
assertPackagingParagraphCanaryAuthorization(receipt, expected);
const safeAutostartText = "把你说的这些都执行好 客观验证也要专业 做到成熟 默认都启动 懂吗 别停做成熟";
const safeAutostartReceipt = createPackagingParagraphCanaryAuthorization({authorizationId: "test-safe-autostart-not-persisted", authorized: true, issuedBy: "focused-test", intent: "resolve the current bounded action from the user's persistent directive", authorizationMode: "CURRENT_THREAD_SAFE_AUTOSTART_DIRECTIVE_BOUND_AT_ISSUANCE", userAuthorizationText: safeAutostartText, operatorAttestedUserMessage: true, resolvedActionId: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", safeAutostartScopeNarrowedToCurrentPack: true, ...expected, issuedAt: "2026-08-12T20:00:00.000Z"});
assertPackagingParagraphCanaryAuthorization(safeAutostartReceipt, expected);
assert.equal(safeAutostartReceipt.userAuthorizationEvidence.exactText, safeAutostartText);
assert.equal(safeAutostartReceipt.userAuthorizationEvidence.scopeNarrowing, "CURRENT_HASH_BOUND_PACK_ONLY");
assert.equal(receipt.productionAdmissionAllowed, false);
assert.equal(receipt.workspaceMutationAllowed, false);
assert.equal(receipt.userVisualApproval, "NOT_APPROVED");
assert.equal(receipt.motionAllowed, false);
assert.equal(receipt.userAuthorizationEvidence.exactText, `授权执行 Pack SHA ${expected.requestPackSha256}`);
assert.throws(() => createPackagingParagraphCanaryAuthorization({...receipt, authorized: false}), /explicit-true/u);
assert.throws(() => createPackagingParagraphCanaryAuthorization({...receipt, userAuthorizationText: "授权执行", operatorAttestedUserMessage: true}), /exact-user-command/u);
assert.throws(() => createPackagingParagraphCanaryAuthorization({...safeAutostartReceipt, authorizationMode: "CURRENT_THREAD_SAFE_AUTOSTART_DIRECTIVE_BOUND_AT_ISSUANCE", userAuthorizationText: "执行", operatorAttestedUserMessage: true, resolvedActionId: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", safeAutostartScopeNarrowedToCurrentPack: true}), /safe-autostart-directive/u);
assert.throws(() => createPackagingParagraphCanaryAuthorization({...safeAutostartReceipt, authorizationMode: "CURRENT_THREAD_SAFE_AUTOSTART_DIRECTIVE_BOUND_AT_ISSUANCE", userAuthorizationText: safeAutostartText, operatorAttestedUserMessage: true, resolvedActionId: "EXPAND_ALL_SHOTS", safeAutostartScopeNarrowedToCurrentPack: true}), /safe-autostart-resolution/u);
for (const key of ["workspaceSha256", "workspaceFileSha256", "transitionSha256", "storyboardRevisionSha256", "canaryPlanSha256", "requestPackSha256", "implementationSha256"]) assert.throws(() => assertPackagingParagraphCanaryAuthorization(receipt, {...expected, [key]: "f".repeat(64)}), /binding-mismatch/u);
const widened = structuredClone(receipt);
widened.productionAdmissionAllowed = true;
assert.throws(() => assertPackagingParagraphCanaryAuthorization(widened, expected), /hash|boundary/u);
const executor = fs.readFileSync(path.join(projectRoot, "scripts/execute-packaging-paragraph-canary-v1.mjs"), "utf8");
const authReadIndex = executor.indexOf("readPackagingParagraphCanaryAuthorization(receiptPath");
const stagingCreateIndex = executor.indexOf("fs.mkdirSync(stagingRoot");
const publishIndex = executor.indexOf("fs.renameSync(stagingRoot, reviewRoot)");
const objectiveAuditDeclarationIndex = executor.indexOf("objectivePixelAuditRequired: true");
assert.ok(authReadIndex > 0 && stagingCreateIndex > authReadIndex && publishIndex > stagingCreateIndex && objectiveAuditDeclarationIndex > 0);
assert.match(executor, /productionAdmitted: false/u);
assert.match(executor, /userVisualApproval: "NOT_APPROVED"/u);
assert.match(executor, /if \(!published && fs\.existsSync\(stagingRoot\)\) fs\.rmSync\(stagingRoot/u);
const pack = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-request-pack.json"), "utf8"));
const stagingBefore = boundedTreeSnapshot(pack.isolationPolicy.stagingRoot);
const reviewBefore = boundedTreeSnapshot(pack.isolationPolicy.reviewPublicRoot);
const workspacePath = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspaceBefore = fs.readFileSync(workspacePath);
const rejected = spawnSync(process.execPath, [path.join(projectRoot, "scripts/execute-packaging-paragraph-canary-v1.mjs")], {cwd: projectRoot, env: {...process.env, A1_EXECUTE_PACKAGING_PARAGRAPH_CANARY: "1", A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT: "", A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT: ""}, encoding: "utf8"});
assert.notEqual(rejected.status, 0);
assert.match(`${rejected.stdout}\n${rejected.stderr}`, /explicit-packaging-paragraph-canary-authorization-receipt-required/u);
assert.deepEqual(boundedTreeSnapshot(pack.isolationPolicy.stagingRoot), stagingBefore);
assert.deepEqual(boundedTreeSnapshot(pack.isolationPolicy.reviewPublicRoot), reviewBefore);
assert.equal(Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)), 0);
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-auth-test-"));
try {
  const current = readCurrentProductionAuthorizationBinding(path.join(projectRoot, "apps/studio-next"));
  const validCurrentAuthorization = createPackagingParagraphCanaryAuthorization({authorizationId: "test-current-not-persisted", authorized: true, issuedBy: "focused-test", intent: "prove result receipt is required before writes", userAuthorizationText: `授权执行 Pack SHA ${pack.packSha256}`, operatorAttestedUserMessage: true, workspaceSha256: current.workspaceSha256, workspaceFileSha256: current.workspaceFileSha256, transitionSha256: current.transitionSha256, storyboardRevisionSha256: pack.source.storyboardRevisionSha256, canaryPlanSha256: pack.source.canaryPlanSha256, requestPackSha256: pack.packSha256, implementationSha256: implementation.implementationSha256, issuedAt: "2026-08-12T21:00:00.000Z"});
  const currentReceiptPath = path.join(testRoot, "authorization.json");
  fs.writeFileSync(currentReceiptPath, JSON.stringify(validCurrentAuthorization));
  const noResult = spawnSync(process.execPath, [path.join(projectRoot, "scripts/execute-packaging-paragraph-canary-v1.mjs")], {cwd: projectRoot, env: {...process.env, A1_EXECUTE_PACKAGING_PARAGRAPH_CANARY: "1", A1_PACKAGING_PARAGRAPH_CANARY_AUTH_RECEIPT: currentReceiptPath, A1_PACKAGING_PARAGRAPH_ED13_IMAGEGEN_RESULT_RECEIPT: ""}, encoding: "utf8"});
  assert.notEqual(noResult.status, 0);
  assert.match(`${noResult.stdout}\n${noResult.stderr}`, /paragraph-imagegen-result-receipt-required/u);
  assert.deepEqual(boundedTreeSnapshot(pack.isolationPolicy.stagingRoot), stagingBefore);
  assert.deepEqual(boundedTreeSnapshot(pack.isolationPolicy.reviewPublicRoot), reviewBefore);
  assert.equal(Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)), 0);
} finally {
  fs.rmSync(testRoot, {recursive: true, force: true});
}
console.log(JSON.stringify({status: "PASS", contract: receipt.contract, authorizationModes: [receipt.userAuthorizationEvidence.mode, safeAutostartReceipt.userAuthorizationEvidence.mode], safeAutostartVerbatimEvidenceBoundToCurrentPack: true, safeAutostartCannotWidenAction: true, receiptPersistence: false, implementationSha256: implementation.implementationSha256, implementationFileCount: implementation.entries.length, authorizationBeforeAnyStagingWrite: true, imagegenResultReceiptRequiredBeforeAnyStagingWrite: true, objectivePixelAuditRequiredAfterExecution: true, unauthorizedExecutionRejectedWithZeroWrites: true, validAuthorizationWithoutResultReceiptRejectedWithZeroWrites: true, atomicReviewOnlyPublication: true, productionAdmissionAllowed: false, workspaceMutationAllowed: false}, null, 2));
