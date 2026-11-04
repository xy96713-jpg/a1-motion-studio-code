import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const templates = [
  "external/rve-remotion-templates/templates/image-zoom-reveal.tsx",
  "external/rve-remotion-templates/templates/polaroid-frame.tsx",
  "external/rve-remotion-templates/templates/progress-bars.tsx",
  "external/rve-remotion-templates/templates/title-split.tsx",
  "external/rve-remotion-templates/templates/end-card.tsx",
  "external/rve-remotion-templates/templates/stat-counter.tsx",
  "external/rve-remotion-templates/templates/quote-card.tsx",
  "external/rve-remotion-templates/templates/progress-steps.tsx",
  "external/rve-remotion-templates/templates/animated-list.tsx",
  "external/rve-remotion-templates/templates/image-carousel.tsx",
  "external/rve-remotion-templates/templates/remocn-data-flow-pipes.tsx",
];
const timelineSource = await readFile("apps/studio-next/src/lib/a1-template-timeline.ts", "utf8");

assert.match(timelineSource, /A1TemplateMotionBeatAdapter\/v1/u, "timeline compiler must publish the shared beat-adapter contract");
for (const slug of ["title-split", "image-zoom-reveal", "polaroid-frame", "progress-bars", "stat-counter", "quote-card", "progress-steps", "end-card", "animated-list", "image-carousel", "remocn-data-flow-pipes"]) {
  assert.match(timelineSource, new RegExp(`"${slug}"`, "u"), `${slug} must be registered as a primary beat consumer`);
}

for (const template of templates) {
  const source = await readFile(template, "utf8");
  assert.match(source, /motionBeatPlan\??:/u, `${template} must accept the compiled beat plan`);
  assert.match(source, /findBeat\(|resolveMotionBeat\(/u, `${template} must resolve named beats from the plan`);
  assert.match(source, /establishBeat/u, `${template} must drive its entry from establish`);
  assert.match(source, /resolveBeat/u, `${template} must reserve a resolution beat`);
  assert.match(source, /bridgeBeat/u, `${template} must reserve a bridge beat`);
}

console.log("Evidence template motion-beat adapters: PASS");
