import assert from "node:assert/strict";
import fs from "node:fs/promises";

const route = await fs.readFile(new URL("../apps/studio-next/src/app/api/a1-actions/render-film/route.ts", import.meta.url), "utf8");
const renderer = await fs.readFile(new URL("../apps/studio-next/scripts/render-template-timeline-proof.mjs", import.meta.url), "utf8");

assert.match(route, /detached:\s*true/u, "render wrapper must own a process group");
assert.match(route, /process\.kill\(-child\.pid/u, "timeout must terminate the whole render process group");
assert.match(route, /A1_FILM_RENDER_TIMEOUT_MS/u, "render wrapper must support a shorter isolated diagnostic timeout");
assert.match(route, /render timed out after[\s\S]*output/u, "timeout error must include captured render output");
assert.match(renderer, /A1_RENDER_STAGE=generate-sfx:start/u);
assert.match(renderer, /A1_RENDER_STAGE=remotion-render:start/u);
assert.match(renderer, /A1_RENDER_STAGE=remotion-render:complete/u);
assert.match(renderer, /A1_RENDER_STAGE=remotion-still:start/u);
assert.match(renderer, /A1_RENDER_STAGE=complete/u);

console.log(JSON.stringify({ ok: true, contract: "A1RenderFilmDiagnosticsAudit/v1" }, null, 2));
