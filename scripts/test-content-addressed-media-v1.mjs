#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {commitContentAddressedMedia} from "../apps/studio-next/src/lib/a1-content-addressed-media-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-content-addressed-media-"));
try {
  const blobRoot = path.join(root, "blobs");
  const firstStaging = path.join(root, "first.staging");
  const secondStaging = path.join(root, "second.staging");
  const thirdStaging = path.join(root, "third.staging");
  fs.writeFileSync(firstStaging, Buffer.from("same-pixel-bytes"));
  fs.writeFileSync(secondStaging, Buffer.from("same-pixel-bytes"));
  fs.writeFileSync(thirdStaging, Buffer.from("different-pixel-bytes"));
  const first = commitContentAddressedMedia({stagingPath: firstStaging, outputPath: path.join(root, "review/a.png"), blobRoot, publicRoot: root});
  const second = commitContentAddressedMedia({stagingPath: secondStaging, outputPath: path.join(root, "export/b.png"), blobRoot, publicRoot: root});
  const third = commitContentAddressedMedia({stagingPath: thirdStaging, outputPath: path.join(root, "review/c.png"), blobRoot, publicRoot: root});
  assert.equal(first.blobCacheHit, false);
  assert.equal(second.blobCacheHit, true);
  assert.equal(first.contentSha256, second.contentSha256);
  assert.notEqual(first.contentSha256, third.contentSha256);
  assert.equal(fs.readdirSync(blobRoot).length, 2);
  const firstStat = fs.statSync(path.join(root, "review/a.png"));
  const secondStat = fs.statSync(path.join(root, "export/b.png"));
  const blobStat = fs.statSync(path.join(root, first.blobRelativePath));
  assert.equal(firstStat.ino, blobStat.ino);
  assert.equal(secondStat.ino, blobStat.ino);
  assert.equal(first.duplicateBytesWrittenToStableOutput, false);
  assert.equal(second.duplicateBytesWrittenToStableOutput, false);
  console.log(JSON.stringify({status: "PASS", contract: first.contract, blobCount: 2, aliasCount: 3, duplicateHit: second.blobCacheHit, sameInodeVerified: first.sameInodeVerified && second.sameInodeVerified}, null, 2));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
