import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const timelineSource = fs.readFileSync(path.join(root, "remotion-renderer", "src", "ArticleTemplateTimeline.tsx"), "utf8");
const propsSource = fs.readFileSync(path.join(root, "apps", "studio-next", "src", "lib", "a1-template-timeline.ts"), "utf8");
const renderSource = fs.readFileSync(path.join(root, "apps", "studio-next", "scripts", "render-template-timeline-proof.mjs"), "utf8");

assert.match(timelineSource, /audioMode:\s*z\.enum\(\["silent", "sfx"\]\)\.default\("silent"\)/u, "timeline props must default to silent audio");
assert.match(timelineSource, /audioMode === "sfx" \? <SfxLayer item=\{item\} \/> : null/u, "silent timelines must not mount the audio layer");
assert.match(propsSource, /audioMode:\s*"silent"/u, "compiled article timelines must request silent delivery");
assert.match(renderSource, /const audioMode = payload\.props\.audioMode === "sfx" \? "sfx" : "silent";/u, "render script must resolve an explicit audio mode");
assert.match(renderSource, /if \(audioMode === "sfx"\)/u, "render script must generate sound effects only when requested");
assert.match(renderSource, /const audioArgs = audioMode === "silent" \? \["--muted"\] : \[\];/u, "silent renders must disable audio encoding entirely");
assert.match(renderSource, /mode: audioMode/u, "render report must record the actual audio mode");

console.log(JSON.stringify({ ok: true, contract: "A1TemplateTimelineSilentAudioTest/v1" }, null, 2));
