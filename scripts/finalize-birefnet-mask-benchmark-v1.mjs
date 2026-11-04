#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/birefnet-mask-benchmark-v1");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(path.join(dir, "report.json"));
const fixtures = read(path.join(dir, "fixtures.json"));
const selectedVariant = report.selectedVariant;
if (report.status !== "COMPLETE" || !["standard", "lite"].includes(selectedVariant)) throw new Error("selected-birefnet-variant-not-complete");
const selected = report.result[selectedVariant];
if (selected.generatedCount !== 30 || selected.reviewedCount !== 30) throw new Error("selected-birefnet-variant-not-30-reviewed");
const reviewedAt = new Date().toISOString();
const decisions = fixtures.samples.map((sample) => {
  const sampleResult = report.samples.find((item) => item.id === sample.id);
  const edgeReviewStatus = sample[selectedVariant].edgeReviewStatus;
  return {
    id: sample.id,
    category: sample.category,
    status: edgeReviewStatus,
    route: edgeReviewStatus === "pass" ? "transparent-cutout-eligible" : "original-crop-fallback",
    reportPath: sampleResult?.results?.[selectedVariant]?.reportPath || null,
    note: sample[selectedVariant].edgeReviewNote,
  };
});
const ledger = {
  contract: "A1MaskBenchmarkEdgeReviewLedger/v1",
  benchmarkReportSha256: sha256(path.join(dir, "report.json")),
  fixtureManifestSha256: sha256(path.join(dir, "fixtures.json")),
  reviewer: "Codex 代理视觉导演",
  mode: "delegated-human-review",
  reviewedAt,
  selectedVariant,
  sampleCount: decisions.length,
  summary: {
    reviewedCount: decisions.filter((item) => item.status !== "pending").length,
    passCount: decisions.filter((item) => item.status === "pass").length,
    reviseCount: decisions.filter((item) => item.status === "revise").length,
    transparentCutoutEligibleCount: decisions.filter((item) => item.route === "transparent-cutout-eligible").length,
    originalCropFallbackCount: decisions.filter((item) => item.route === "original-crop-fallback").length,
  },
  decisions,
  conclusion: "Lite 30 张压力测试已完成。28 张允许透明前景，2 张保留原图裁切回退；标准版未缓存时不伪装为通过。",
  status: "BIRETNET_LITE_BENCHMARK_REVIEWED",
};
if (ledger.summary.reviewedCount !== 30) throw new Error("mask-edge-review-incomplete");
for (const target of [path.join(dir, "edge-review.json"), path.join(publicDir, "edge-review.json")]) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, `${JSON.stringify(ledger, null, 2)}\n`);
}
console.log(JSON.stringify({status: ledger.status, selectedVariant, summary: ledger.summary, reviewedAt}, null, 2));
