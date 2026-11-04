import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const registryPath = path.join(root, "public", "template-confirmations", "rve-official-template-registry.json");
const outputDir = path.join(root, "public", "generated", "rve-official-effect-preview");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const failures = [];
const rendered = [];
const skipped = [];

await fs.mkdir(outputDir, { recursive: true });

const run = (args) => new Promise((resolve) => {
  const child = spawn(remotionBin, args, {
    cwd: rendererDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.on("close", (code) => resolve({ code, output }));
});

for (const template of registry.templates) {
  const outputPath = path.join(root, "public", template.mp4);
  const existing = await fs.stat(outputPath).catch(() => null);
  if (existing?.isFile() && existing.size > 1000) {
    skipped.push(template.slug);
    continue;
  }

  console.log(`render ${template.compositionId} -> ${template.mp4}`);
  const result = await run([
    "render",
    "src/index.ts",
    template.compositionId,
    outputPath,
    "--overwrite",
    "--codec=h264",
    "--log=warn",
  ]);

  if (result.code !== 0) {
    failures.push({
      slug: template.slug,
      compositionId: template.compositionId,
      output: result.output.slice(-2400),
    });
  } else {
    rendered.push(template.slug);
  }
}

const report = {
  contract: "A1RveOfficialPreviewVideoRender/v1",
  rendered: rendered.length,
  skipped: skipped.length,
  failures,
};

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
