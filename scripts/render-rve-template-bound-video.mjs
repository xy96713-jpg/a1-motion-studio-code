import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRveEvidenceAdapterForScene } from "../lib/storyboard-rve-evidence-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const outputRel = "../public/generated/rve-template-bound/ken-burns-fixture.mp4";
const outputPath = path.join(root, "public", "generated", "rve-template-bound", "ken-burns-fixture.mp4");
const propsPath = path.join(root, "public", "template-confirmations", "rve-template-bound-ken-burns-props.json");

const scene = {
  id: "rve-evidence-fixture",
  type: "image",
  headline: "真实来源先进入模板",
  body: "文章句子提到网页、论文、产品页或证据时，只允许绑定到真实模板 slot。",
  duration: 5.2,
  assets: [{
    id: "verified:webpage:jitter-templates",
    kind: "webpage-preview",
    url: "/assets/web-assets/fixtures/jitter-templates-page.png",
    sourceUrl: "https://jitter.video/templates/",
    attribution: "https://jitter.video/templates/",
    license: "reviewed-reference-screenshot",
    renderAllowed: true,
    verifiedForRender: true,
    imageFocalPlan: {
      objectPosition: { x: 52, y: 46 },
      zoom: 116,
    },
  }],
};

const match = {
  sceneId: scene.id,
  detectedSkill: "real-media-proof",
  assetNeeds: ["webpage-preview"],
  rveOfficialAdapterCandidates: [
    {
      id: "rve-official:ken-burns",
      slug: "ken-burns",
      compositionId: "RVEKenBurns",
      sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
      sourcePath: "external/rve-remotion-templates/templates/ken-burns.tsx",
      originalDemo: "https://www.reactvideoeditor.com/remotion-templates/ken-burns",
      previewVideo: "generated/rve-official-effect-preview/ken-burns.mp4",
    },
  ],
};

const adapter = buildRveEvidenceAdapterForScene(scene, match);
const sourceImagePath = path.join(root, "public", "assets", "web-assets", "fixtures", "jitter-templates-page.png");
const sourceImage = await fs.readFile(sourceImagePath);
const imageUrl = `data:image/png;base64,${sourceImage.toString("base64")}`;
const props = {
  ...adapter.params,
  imageUrl,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(propsPath), { recursive: true });
await fs.writeFile(propsPath, `${JSON.stringify({
  contract: "A1RveTemplateBoundProps/v1",
  generatedAt: "2026-07-07",
  sourceCompositionId: adapter.sourceCompositionId,
  sourceSlug: adapter.sourceSlug,
  sourcePath: adapter.sourcePath,
  output: "generated/rve-template-bound/ken-burns-fixture.mp4",
  props: {
    ...props,
    imageUrl: "data:image/png;base64,<cached-webpage-screenshot>",
  },
  metadata: adapter.metadata,
}, null, 2)}\n`);

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    }
  });
});

await run("npm", [
  "exec",
  "--",
  "remotion",
  "render",
  "src/index.ts",
  adapter.sourceCompositionId,
  outputRel,
  "--props",
  JSON.stringify(props),
  "--overwrite",
], { cwd: rendererDir });

const stat = await fs.stat(outputPath);
console.log(JSON.stringify({
  contract: "A1RveTemplateBoundRenderArtifact/v1",
  outputPath,
  propsPath,
  sourceCompositionId: adapter.sourceCompositionId,
  sourceSlug: adapter.sourceSlug,
  bytes: stat.size,
}, null, 2));
