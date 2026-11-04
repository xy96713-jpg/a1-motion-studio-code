import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const timeline = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-template-timeline.ts"), "utf8");
const roleTemplate = fs.readFileSync(path.join(root, "external/rve-remotion-templates/templates/animated-list.tsx"), "utf8");

assert.match(timeline, /templateProps\.transitionPlan/u, "compiled relation plan must enter template props");
assert.match(roleTemplate, /transitionPlan/u, "role template must accept the compiled relation plan");
assert.match(roleTemplate, /role-handoff/u, "role template must distinguish a role-handoff entrance");
assert.match(roleTemplate, /handoffProgress/u, "role-handoff needs a bounded frame-derived progress value");

console.log(JSON.stringify({ ok: true, contract: "A1TemplateRelationHandoffTest/v1" }, null, 2));
