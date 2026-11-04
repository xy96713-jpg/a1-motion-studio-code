#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const artifactFile = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const pending = JSON.parse(fs.readFileSync(publicFile, "utf8"));
if (pending.contract !== "A1WholeFilmStaticBoardPendingUserApprovalBuild/v1" || pending.status !== "PENDING_USER_APPROVAL") throw new Error("static-board-current-authority-pending-manifest-required");
for (const board of [pending.packageBoard, pending.timelineBoard]) {
  const file = path.join(root, "apps/studio-next/public", board.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== board.sha256) throw new Error(`static-board-current-authority-pixel-sha-mismatch:${board.publicUrl}`);
}
const body = {...pending, contract: "A1WholeFilmStaticBoardCurrentAuthorityManifest/v2", version: 2, current: true, authorityScope: "CURRENT", promotedFromContract: pending.contract, promotedAt: new Date().toISOString()};
delete body.boardManifestSha256;
const manifest = {...body, boardManifestSha256: sha(body)};
const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(publicFile, bytes);
fs.mkdirSync(path.dirname(artifactFile), {recursive: true});
fs.writeFileSync(artifactFile, bytes);
console.log(JSON.stringify({status: "PASS", contract: manifest.contract, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, boardManifestSha256: manifest.boardManifestSha256, pixelBytesChanged: false}, null, 2));
