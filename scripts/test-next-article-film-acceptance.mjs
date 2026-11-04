import { spawn } from "node:child_process";

const appDir = new URL("../apps/studio-next/", import.meta.url).pathname;
const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";

const result = await new Promise((resolve) => {
  const child = spawn(process.execPath, ["scripts/audit-next-article-film-acceptance.mjs"], {
    cwd: appDir,
    env: { ...process.env, A1_NEXT_WORKBENCH_URL: rootUrl, A1_ACCEPTANCE_RENDER: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stdout, stderr }));
});

if (result.code !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.code || 1);
}

const report = JSON.parse(result.stdout);
const requiredKinds = ["product-source", "data-report", "location-map", "method", "comparison", "opinion"];
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(report.contract === "A1CurrentArticleFilmAcceptance/v1", "missing current article-film acceptance contract");
assert(report.caseCount === requiredKinds.length, `expected ${requiredKinds.length} representative articles, got ${report.caseCount}`);
assert(report.summaries?.map((summary) => summary.kind).join("/") === requiredKinds.join("/"), "article acceptance corpus kinds are incomplete or unstable");
assert(report.summaries?.every((summary) => summary.connected && summary.hasOpening && summary.hasClosing), "every representative article must be a connected opening-to-closing film");
assert(report.summaries?.every((summary) => summary.templateCount >= 2), "every representative article needs at least two template families");
assert(report.summaries?.find((summary) => summary.kind === "product-source")?.sourceQualifiedAssetCount >= 1, "product source case needs a reviewed source-qualified asset");
assert(report.summaries?.find((summary) => summary.kind === "comparison")?.hasMultiImageRoute === true, "comparison case needs a multi-image route");
assert(report.summaries?.find((summary) => summary.kind === "data-report")?.editorialDirection === "data-observatory", "data report needs the data editorial direction");
assert(report.summaries?.find((summary) => summary.kind === "location-map")?.editorialDirection === "location-atlas", "location article needs the location editorial direction");
assert(report.renderRequestPaths?.length === requiredKinds.length, "every accepted article needs a reproducible render request");
assert(report.renderRequestPaths?.every((requestPath) => typeof requestPath === "string" && requestPath.endsWith(".json")), "render requests must be persisted JSON artifacts");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, report }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, contract: "A1CurrentArticleFilmAcceptanceTest/v1", caseCount: report.caseCount }, null, 2));
