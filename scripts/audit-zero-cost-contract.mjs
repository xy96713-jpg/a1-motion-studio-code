#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "apps/studio-next/src/lib/editorial-production/index.mjs",
  "apps/studio-next/src/lib/a1-project-asset-workspace-v1.mjs",
  "scripts/run-editorial-asset-workbench-jobs-v2.mjs",
  "scripts/run-editorial-project-asset-jobs-v1.mjs",
  "apps/studio-next/src/lib/a1-visual-asset-executor.ts",
].map((relative) => ({relative, source: fs.readFileSync(path.join(root, relative), "utf8")}));

const checks = [];
const check = (id, pass, evidence) => checks.push({id, status: pass ? "PASS" : "FAIL", evidence});
const source = files.map((item) => item.source).join("\n");

check("subscription-generation-provider-only", files.every((item) => !/provider:\s*["'](?:openai-api|anthropic|replicate|fal|paid)/iu.test(item.source)) && source.includes("subscription-zero-extra-cost") && source.includes("codex-imagegen"), "production image jobs use the Codex/ChatGPT subscription route");
check("no-paid-api-default-or-key", !/OPENAI_API_KEY|ANTHROPIC_API_KEY|REPLICATE_API_TOKEN|fal\.ai|paid-api|openai-api/iu.test(source), "no paid API key, provider or fallback is present in production generation adapters");
check("generation-concurrency-max-two", source.includes("Math.min(2, queued.length)") && !/concurrency:\s*(?:[3-9]|[1-9]\d)/u.test(source), "generation workers stay bounded at concurrency two");
check("generation-provenance-and-cache", source.includes("promptSha256") && source.includes("cacheKey") && source.includes("cacheHit") && source.includes("outputSha256"), "jobs persist prompt/output hashes and cache state");
check("commercial-cutout-not-default", !/RMBG-2\.0|commercial-rmbg|replicate.*background/iu.test(source), "commercial cutout providers are not wired into the generation default");

const failures = checks.filter((item) => item.status === "FAIL");
const report = {contract: "A1ZeroCostGenerationContractAudit/v1", status: failures.length ? "FAIL" : "PASS", generatedAt: new Date().toISOString(), policy: {providerMode: "subscription-zero-extra-cost", provider: "codex-imagegen", maximumConcurrency: 2, paidApiFallback: false}, checks, failures: failures.map((item) => item.id)};
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/zero-cost-contract-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/zero-cost-contract-v1");
fs.mkdirSync(artifactDir, {recursive: true}); fs.mkdirSync(publicDir, {recursive: true});
fs.writeFileSync(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, failures: report.failures, reportPath: path.relative(root, path.join(artifactDir, "report.json"))}, null, 2));
if (failures.length) process.exitCode = 1;
