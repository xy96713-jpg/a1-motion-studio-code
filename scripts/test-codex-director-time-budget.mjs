import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../apps/studio-next/src/lib/a1-codex-article-director.ts", import.meta.url), "utf8");

assert.match(source, /A1_CODEX_DIRECTOR_TIMEOUT_MS/u, "director must expose a bounded runtime budget");
assert.match(source, /25_000/u, "interactive director default budget must be 25 seconds");
assert.match(source, /detached:\s*true/u, "director must own a process group");
assert.match(source, /process\.kill\(-child\.pid/u, "director timeout must terminate the process group");
assert.match(source, /timed out after \$\{Math\.round\(timeoutMs \/ 1000\)\} seconds/u);
assert.match(source, /first opening sentence in its own section/u, "director prompt must protect the opening anchor from swallowing evidence");
assert.match(source, /opening section must preserve only the first source sentence/u, "director normalizer must reject merged opening evidence");

console.log(JSON.stringify({ ok: true, contract: "A1CodexDirectorTimeBudgetAudit/v1" }, null, 2));
