import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const timeline = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-template-timeline.ts"), "utf8");
const theme = fs.readFileSync(path.join(root, "external/rve-remotion-templates/templates/a1-editorial-theme.ts"), "utf8");
const templates = ["polaroid-frame.tsx", "image-carousel.tsx", "end-card.tsx", "progress-steps.tsx", "quote-card.tsx", "animated-list.tsx"].map((name) => fs.readFileSync(path.join(root, "external/rve-remotion-templates/templates", name), "utf8"));

assert.match(timeline, /A1ArticleEditorialDirection\/v1/u, "compiled template props must carry an article-level editorial direction");
assert.match(timeline, /data-observatory/u, "data articles need a distinct editorial direction");
assert.match(timeline, /location-atlas/u, "location articles need a distinct editorial direction");
assert.match(theme, /resolveEditorialTheme/u, "adapted templates need a shared direction resolver");
assert(templates.every((source) => /editorialDirection/u.test(source) && /resolveEditorialTheme/u.test(source)), "current evidence, method, opinion, roles, and closing templates must consume the article direction");

console.log(JSON.stringify({ ok: true, contract: "A1ArticleEditorialDirectionTest/v1" }, null, 2));
