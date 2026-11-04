#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveA1NodeSourceLockV1, A1_NODE_SOURCE_LOCK_RESOLUTION_V1, A1_NODE_SOURCE_LOCK_RESOLVED_STATUS_V1} from "../apps/studio-next/src/lib/a1-node-source-lock-resolver-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(root, "work");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const evidenceId = "article-paragraph-01";
const sourceUrl = "https://example.org/source/article";
const sourceTitle = "Verified Local Source Fixture";
const sourceCopy = "Coral structures can increase regional biodiversity.";
const sourceBody = `Intro. ${sourceCopy} Closing.`;
const tempRoot = fs.mkdtempSync(path.join(workRoot, ".a1-node-source-lock-resolver-test-"));
const captureDir = path.join(tempRoot, "source-capture");
const manifestPath = path.join(tempRoot, "source-lock.json");
fs.mkdirSync(captureDir);
let outsideRoot = null;
let currentManifest = null;

const bodyPath = path.join(captureDir, "body.txt");
const pagePath = path.join(captureDir, "page.json");
const bodyBytes = Buffer.from(sourceBody, "utf8");
const bodySha256 = sha256(bodyBytes);
const excerptSha256 = sha256(Buffer.from(sourceCopy, "utf8"));

function pageCapture(overrides = {}) {
  return {
    contract: "A1ArticlePageSource/v1",
    sourceUrl,
    targetUrl: sourceUrl,
    title: sourceTitle,
    capturedAt: "2026-09-28T00:00:00.000Z",
    ...overrides,
  };
}

function sourceLock({bodyRef = "source-capture/body.txt", captureRef = "source-capture/page.json", excerptHash = excerptSha256, url = sourceUrl, title = sourceTitle} = {}) {
  return {
    contract: "A1ArticleClaimSourceLock/v1",
    source: {
      publisher: "Fixture Publisher",
      title,
      canonicalUrl: url,
      articleBodyPath: bodyRef,
      articleBodySha256: bodySha256,
      localPageCapture: captureRef,
    },
    claims: [{
      evidenceId,
      sourceParagraph: 1,
      sourcePageLines: [12, 12],
      exactText: sourceCopy,
      exactTextSha256: excerptHash,
      faithfulSummary: "Coral structures can increase biodiversity.",
    }],
  };
}

function writeManifest(value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.writeFileSync(manifestPath, bytes);
  return {bytes, sha256: sha256(bytes)};
}

function manifestRelativePath(filename = manifestPath) {
  return path.relative(root, filename).split(path.sep).join("/");
}

function resolveWith({manifestSha = currentManifest.sha256, bodySha = bodySha256, ids = [evidenceId], copy = sourceCopy, url = sourceUrl, path: selectedPath = manifestRelativePath()} = {}) {
  return resolveA1NodeSourceLockV1({
    sourceEvidenceManifestPath: selectedPath,
    sourceEvidenceManifestSha256: manifestSha,
    sourceBodySha256: bodySha,
    sourceEvidenceIds: ids,
    sourceCopy: copy,
    sourceUrl: url,
  });
}

try {
  fs.writeFileSync(bodyPath, bodyBytes);
  fs.writeFileSync(pagePath, `${JSON.stringify(pageCapture(), null, 2)}\n`);
  currentManifest = writeManifest(sourceLock());

  const receipt = resolveWith();
  assert.equal(receipt.contract, A1_NODE_SOURCE_LOCK_RESOLUTION_V1);
  assert.equal(receipt.status, A1_NODE_SOURCE_LOCK_RESOLVED_STATUS_V1);
  assert.equal(receipt.sourceEvidenceResolved, true);
  assert.equal(receipt.manifest.sha256, currentManifest.sha256);
  assert.equal(receipt.sourceBody.sha256, bodySha256);
  assert.equal(receipt.sourceCopy.sha256, excerptSha256);
  assert.deepEqual(receipt.evidenceSpans.map((span) => span.evidenceId), [evidenceId]);
  assert.equal(receipt.evidenceSpans[0].exactTextSha256, excerptSha256);
  assert.equal(receipt.factualClaimApproval, "NOT_APPROVED");
  assert.equal(receipt.rightsApproval, "NOT_WITHIN_SCOPE");
  assert.equal(receipt.visualApproval, false);
  assert.equal(receipt.productionAdmission, false);

  assert.throws(() => resolveWith({manifestSha: "f".repeat(64)}), /NODE_SOURCE_LOCK_MANIFEST_SHA_MISMATCH/u);
  assert.throws(() => resolveWith({bodySha: "e".repeat(64)}), /NODE_SOURCE_LOCK_BODY_SHA_MISMATCH/u);
  assert.throws(() => resolveWith({ids: ["missing-evidence-id"]}), /NODE_SOURCE_LOCK_EVIDENCE_ID_MISSING/u);
  assert.throws(() => resolveWith({ids: [evidenceId, evidenceId]}), /NODE_SOURCE_LOCK_EVIDENCE_IDS_INVALID/u);
  assert.throws(() => resolveWith({copy: "different text"}), /NODE_SOURCE_LOCK_SOURCE_COPY_NOT_IN_BODY/u);
  assert.throws(() => resolveWith({url: "https://other.example/source"}), /NODE_SOURCE_LOCK_SOURCE_URL_MISMATCH/u);
  assert.throws(() => resolveWith({path: "work\/..\/outside\/source-lock.json"}), /NODE_SOURCE_LOCK_MANIFEST_PATH_INVALID/u);

  currentManifest = writeManifest(sourceLock({excerptHash: "a".repeat(64)}));
  assert.throws(() => resolveWith({manifestSha: currentManifest.sha256}), /NODE_SOURCE_LOCK_EXCERPT_SHA_MISMATCH/u);

  fs.writeFileSync(pagePath, `${JSON.stringify(pageCapture({sourceUrl: "https://other.example/"}), null, 2)}\n`);
  currentManifest = writeManifest(sourceLock());
  assert.throws(() => resolveWith({manifestSha: currentManifest.sha256}), /NODE_SOURCE_LOCK_CAPTURE_URL_MISMATCH/u);
  fs.writeFileSync(pagePath, `${JSON.stringify(pageCapture({title: "Different title"}), null, 2)}\n`);
  assert.throws(() => resolveWith({manifestSha: currentManifest.sha256}), /NODE_SOURCE_LOCK_CAPTURE_TITLE_MISMATCH/u);

  outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-source-lock-outside-"));
  const externalManifest = path.join(outsideRoot, "source-lock.json");
  fs.writeFileSync(externalManifest, currentManifest.bytes);
  const manifestSymlink = path.join(tempRoot, "manifest-symlink.json");
  fs.symlinkSync(externalManifest, manifestSymlink);
  assert.throws(() => resolveWith({path: manifestRelativePath(manifestSymlink)}), /NODE_SOURCE_LOCK_MANIFEST_SYMLINK_FORBIDDEN/u);

  const bodySymlink = path.join(captureDir, "body-symlink.txt");
  fs.symlinkSync(bodyPath, bodySymlink);
  currentManifest = writeManifest(sourceLock({bodyRef: "source-capture/body-symlink.txt"}));
  assert.throws(() => resolveWith({manifestSha: currentManifest.sha256}), /NODE_SOURCE_LOCK_BODY_SYMLINK_FORBIDDEN/u);

  console.log(JSON.stringify({
    contract: "A1NodeSourceLockResolverTest/v1",
    status: "PASS",
    manifestBodyExcerptEvidenceAndCaptureVerified: true,
    mismatchAndTraversalCasesRejected: true,
    symlinkManifestAndBodyRejected: true,
    approvalsRemainUnchanged: true,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
  if (outsideRoot) fs.rmSync(outsideRoot, {recursive: true, force: true});
}
