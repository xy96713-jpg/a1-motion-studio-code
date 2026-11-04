import assert from "node:assert/strict";
import fs from "node:fs/promises";

const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
const scripts = packageJson.scripts || {};

assert.equal(scripts.audit, "node scripts/audit-canonical-next.mjs", "default audit must target the canonical Next orchestrator");
assert.match(scripts["audit:legacy-full"] || "", /audit:storyboard-frontend-actions/u, "legacy full audit must preserve the old frontend-actions gate");
assert.match(scripts["audit:legacy-full"] || "", /^npm run check &&/u, "legacy full audit must preserve the original check-first chain");

let source = "";
try {
  source = await fs.readFile(new URL("./audit-canonical-next.mjs", import.meta.url), "utf8");
} catch (error) {
  assert.fail(`canonical Next orchestrator is missing: ${error instanceof Error ? error.message : error}`);
}

for (const required of [
  "A1CanonicalNextAuditReport/v1",
  "test:data-source-evidence-route",
  "test:visual-material-route",
  "audit:template-routing-readiness",
  "audit:next-article-film",
  "audit:next-article-pressure",
  "audit:next-workbench",
  "audit:storyboard-render-props",
  "audit:storyboard-template-match-plan",
  "audit:template-only-render-contract",
  "audit:remotion-renderer",
  "A1_NEXT_WORKBENCH_URL",
  "A1_LEGACY_STUDIO_URL",
  "A1_PROJECTS_DIR",
  "A1_CODEX_TASKS_DIR",
  "finally",
]) {
  assert.ok(source.includes(required), `orchestrator must declare ${required}`);
}
assert.match(source, /listen\(0/u, "orchestrator must allocate a free temporary port");
assert.match(source, /SIGTERM|kill\(/u, "orchestrator must terminate its temporary server");

console.log(JSON.stringify({ ok: true, contract: "A1CanonicalNextAuditEntryTest/v1" }, null, 2));
