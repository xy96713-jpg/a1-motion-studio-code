#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const shots = {"ED-09": "work/xyq-non-screen/ED-09/v0dc76g10004dabt21i7dldbdncrl890.mp4", "ED-16": "work/xyq-non-screen/ED-16/v0dc76g10004dabt1n27dld13d2v0c2g.mp4", "ED-17": "work/xyq-non-screen/ED-17/v02c76g10004dabt41a7dldeiuaq1360.mp4"};
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const receipts = Object.entries(shots).map(([shotId, relative]) => {
  const file = path.join(root, relative); if (!fs.existsSync(file)) throw new Error(`xyq-output-missing:${shotId}`);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate", "-of", "json", file], {encoding: "utf8"}));
  const shot = authority.shots.find((item) => item.shotId === shotId); if (!shot) throw new Error(`xyq-current-shot-missing:${shotId}`);
  return {contract: "A1ExternalGenerationReceipt/v1", provider: "XYQ", shotId, usageMode: "MOTION_REFERENCE_ONLY", source: {versionId: shot.versionId, artifactSha256: shot.artifactSha256}, output: {path: relative, sha256: sha(file), durationMs: Math.round(Number(probe.format.duration) * 1000), bytes: Number(probe.format.size), streams: probe.streams}, localGeometryOwner: "REMOTION", finalGeometryOwnedLocally: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED"};
});
const out = path.join(root, "work/xyq-non-screen/motion-reference-receipts-v1.json");
fs.writeFileSync(out, `${JSON.stringify({contract: "A1XYQMotionReferenceReceiptSet/v1", status: "PASS", receipts}, null, 2)}\n`);
console.log(JSON.stringify({status: "PASS", receiptCount: receipts.length, shotIds: receipts.map((item) => item.shotId), output: path.relative(root, out), productionAdmission: false}, null, 2));
