import assert from "node:assert/strict";
import fs from "node:fs/promises";

const sourceGates = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-source-evidence-gates.ts", import.meta.url), "utf8");
const productionGates = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-production-gates.ts", import.meta.url), "utf8");

assert.match(sourceGates, /runtimeFallbackSafe\?: boolean/u, "source evidence contract must identify safe runtime fallback");
assert.match(sourceGates, /runtimeFallbackSafe: true/u, "source-safe text route must set the fallback flag");
assert.match(productionGates, /sourceEvidence\?\.runtimeFallbackSafe === true/u, "production gate must consume the fallback flag");
assert.match(productionGates, /slotPlan\.status === "blocked" && !runtimeFallbackSafe/u, "safe runtime fallback must suppress the planned asset blocker");

console.log(JSON.stringify({ ok: true, contract: "A1SourceSafeProductionGateAudit/v1" }, null, 2));
