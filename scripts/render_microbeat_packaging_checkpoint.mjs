import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(repoRoot, "remotion-renderer");
const sourceRoot = process.env.A1_RESOLVE_SOURCE_ROOT || "/Users/a1/Documents/Codex/声音";
const outputRoot = path.join(sourceRoot, "outputs/video_packaging_july1/preflight/microbeat-packaging-checkpoint-v1");
const framesRoot = path.join(outputRoot, "frames");
const clipsRoot = path.join(outputRoot, "clips");
const propsPath = path.join(rendererRoot, "src/generated/microbeatFullTimelineReviewProps.json");
const rendererPath = path.join(rendererRoot, "src/MicrobeatNoveltyStressReview.tsx");
const remotion = path.join(rendererRoot, "node_modules/.bin/remotion");
const entry = "src/microbeat-full-timeline-index.ts";
const composition = "A1MicrobeatFullTimelineReview";

const sha256 = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
const relative = (file) => path.relative(sourceRoot, file);
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(remotion, args, {cwd: rendererRoot, stdio: "inherit"});
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`remotion-exited-${code}`)));
});

const props = JSON.parse(await fs.readFile(propsPath, "utf8"));
if (props.contract !== "A1MicrobeatFullTimelineReview/v1" || props.scenes.length !== 47) throw new Error("checkpoint-props-invalid");
if (props.scenes.some((scene) => scene.route === "real-evidence" || scene.evidence)) throw new Error("checkpoint-must-not-embed-recording-or-evidence");

const sampleIds = ["H01-B01", "H03-B03", "H06-B02", "H07-B03", "H08-B04", "H11-B03"];
const samples = sampleIds.map((beatId) => {
  const scene = props.scenes.find((candidate) => candidate.beatId === beatId);
  if (!scene) throw new Error(`checkpoint-sample-missing:${beatId}`);
  return {
    beatId,
    macroId: scene.id,
    title: scene.title,
    animationTier: scene.animationTier,
    recordingReplaceable: scene.recordingReplaceable,
    frame: scene.startFrame + Math.min(84, Math.max(34, Math.round(scene.durationInFrames * .45))),
  };
});
if (!samples.some((sample) => sample.animationTier === "formal-highlight") || !samples.some((sample) => sample.animationTier === "standard-typography")) throw new Error("checkpoint-tier-coverage-missing");
if (!samples.some((sample) => sample.recordingReplaceable)) throw new Error("checkpoint-recording-replaceable-coverage-missing");

const clips = [
  {id: "standard-typography", startFrame: 0, endFrame: 165, purpose: "ordinary narration with restrained typography"},
  {id: "formal-highlight", startFrame: 2170, endFrame: 2392, purpose: "key argument with formal emphasis"},
  {id: "recording-replaceable", startFrame: 3836, endFrame: 4154, purpose: "usable animation for an editor-replaceable demonstration passage"},
];

await fs.mkdir(framesRoot, {recursive: true});
await fs.mkdir(clipsRoot, {recursive: true});

for (const [index, sample] of samples.entries()) {
  const file = path.join(framesRoot, `${String(index + 1).padStart(2, "0")}-${sample.beatId}.png`);
  await run(["still", entry, composition, file, `--props=${propsPath}`, `--frame=${sample.frame}`, "--scale=0.5", "--overwrite", "--log=warn"]);
  sample.file = relative(file);
  sample.sha256 = await sha256(file);
}

for (const clip of clips) {
  const file = path.join(clipsRoot, `${clip.id}.mp4`);
  await run(["render", entry, composition, file, `--props=${propsPath}`, `--frames=${clip.startFrame}-${clip.endFrame}`, "--scale=0.5", "--codec=h264", "--pixel-format=yuv420p", "--crf=22", "--overwrite", "--log=warn"]);
  clip.durationFrames = clip.endFrame - clip.startFrame + 1;
  clip.durationSeconds = clip.durationFrames / props.fps;
  clip.file = relative(file);
  clip.sha256 = await sha256(file);
  clip.bytes = (await fs.stat(file)).size;
}

const tileWidth = 960;
const tileHeight = 540;
const labelHeight = 64;
const composites = [];
for (const [index, sample] of samples.entries()) {
  const image = await sharp(path.join(sourceRoot, sample.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#121315"/><text x="24" y="40" fill="#f2efe7" font-family="Arial, sans-serif" font-size="25">${sample.beatId} · ${sample.animationTier}${sample.recordingReplaceable ? " · recording-replaceable" : ""}</text></svg>`);
  composites.push({input: image, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)});
  composites.push({input: label, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight) + tileHeight});
}
const contactSheet = path.join(outputRoot, "contact-sheet-3x2.png");
await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 2, channels: 4, background: "#121315"}}).composite(composites).png().toFile(contactSheet);

const manifest = {
  contract: "A1MicrobeatPackagingCheckpoint/v1",
  generatedAt: new Date().toISOString(),
  status: "review-ready",
  scope: "cross-chapter stills and bounded short-range previews; not a full-film render",
  reviewOnly: true,
  finalRenderAllowed: false,
  sourceBinding: {
    props: {file: path.relative(repoRoot, propsPath), sha256: await sha256(propsPath), productionPlanHash: props.productionPlanHash, variationPlanHash: props.variationPlanHash},
    renderer: {file: path.relative(repoRoot, rendererPath), sha256: await sha256(rendererPath)},
  },
  checks: {
    totalScenes: props.scenes.length,
    formalHighlightScenes: props.scenes.filter((scene) => scene.animationTier === "formal-highlight").length,
    standardTypographyScenes: props.scenes.filter((scene) => scene.animationTier === "standard-typography").length,
    recordingReplaceableScenes: props.scenes.filter((scene) => scene.recordingReplaceable).length,
    realEvidenceScenes: props.scenes.filter((scene) => scene.route === "real-evidence").length,
    embeddedEvidenceScenes: props.scenes.filter((scene) => scene.evidence).length,
    automaticDarkBackgrounds: 0,
  },
  samples,
  clips,
  contactSheet: {file: relative(contactSheet), sha256: await sha256(contactSheet), width: tileWidth * 3, height: (tileHeight + labelHeight) * 2},
  nextAction: "visual-review-before-full-length-low-resolution-render",
};
const manifestPath = path.join(outputRoot, "manifest.json");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ok: true, outputRoot, contactSheet: manifest.contactSheet, clips, checks: manifest.checks, manifest: relative(manifestPath)}, null, 2));
