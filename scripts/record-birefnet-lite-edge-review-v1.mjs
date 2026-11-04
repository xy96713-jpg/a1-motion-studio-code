#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const revise = new Set(["transparent-reflective-01", "device-product-04"]);
const reviewedAt = new Date().toISOString();
for (const sample of manifest.samples) {
  const status = revise.has(sample.id) ? "revise" : "pass";
  sample.lite.edgeReviewStatus = status;
  sample.lite.edgeReviewNote = status === "pass" ? "联系表审片通过：主体边界可用，未见大面积丢失或明显光晕。" : "联系表审片返修：主体边界/主体保留不足，生产路由必须回退原图裁切。";
  sample.lite.reviewedAt = reviewedAt;
}
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status:"LITE_EDGE_REVIEW_RECORDED",reviewedCount:manifest.samples.filter((sample)=>sample.lite.edgeReviewStatus !== "pending").length,passCount:manifest.samples.filter((sample)=>sample.lite.edgeReviewStatus === "pass").length,reviseCount:manifest.samples.filter((sample)=>sample.lite.edgeReviewStatus === "revise").length,reviewedAt},null,2));
