#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const project = path.resolve(root, process.argv[2] || "");
const reviewVideo = path.resolve(root, process.argv[3] || "");
if (!process.argv[2] || !process.argv[3] || !fs.existsSync(project) || !fs.existsSync(reviewVideo)) throw new Error("usage:finalize-background-cap-receipt-v1 <project.cap> <review.mp4>");
const receiptPath = path.join(project, "a1-background-receipt.json");
const configPath = path.join(project, "project-config.json");
if (!fs.existsSync(receiptPath) || !fs.existsSync(configPath)) throw new Error("background-cap-receipt-or-config-missing");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (receipt.contract !== "A1BackgroundCapProjectReceipt/v1" || receipt.coveragePlan?.status !== "PASS") throw new Error("background-cap-receipt-not-coverage-ready");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", reviewVideo], {encoding: "utf8"}));
const stream = probe.streams.find((item) => item.codec_type === "video");
if (probe.streams.length !== 1 || stream?.width !== 960 || stream?.height !== 540 || stream?.r_frame_rate !== "60/1") throw new Error("background-cap-post-export-video-contract");
receipt.projectConfigSha256 = sha256(configPath);
receipt.postExport = {contract: "A1BackgroundCapPostExportReceipt/v1", status: "PASS", projectConfigSha256: receipt.projectConfigSha256, reviewVideo: {path: path.relative(root, reviewVideo), sha256: sha256(reviewVideo), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames), durationMs: Math.round(Number(probe.format.duration) * 1000)}};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({status: "PASS", shotId: receipt.shotId, receiptPath: path.relative(root, receiptPath), receiptSha256: sha256(receiptPath), postExport: receipt.postExport}, null, 2));
