#!/usr/bin/env node
/**
 * Publish the current intelligent storyboard output as an isolated review draft.
 *
 * This intentionally does NOT make the storyboard draft the system-line review
 * authority. The H-series review renderer keeps using
 * remotion-renderer/src/generated/microbeatLayeredFullProps.json.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const args = process.argv.slice(2);
const preserveArtwork = args.includes("--preserve-artwork");

function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

const sourcePath = path.resolve(root, argValue("--source", "remotion-renderer/src/generated/microbeatLayeredFullProps.json"));
const outDir = path.resolve(root, argValue("--out-dir", "apps/studio-next/public/generated/storyboard/current"));
const propsOutPath = path.join(outDir, "storyboard-props.json");
const manifestOutPath = path.join(outDir, "storyboard-manifest.json");
const approvalPath = path.join(outDir, "storyboard-approval.json");
const stillsDir = path.resolve(root, "apps/studio-next/public/generated/storyboard-stills");
const artworkDir = path.resolve(root, "apps/studio-next/public/generated-artwork");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`source props not found: ${sourcePath}`);
}

const sourceRaw = fs.readFileSync(sourcePath, "utf8");
const props = JSON.parse(sourceRaw);
const existingDraft = fs.existsSync(propsOutPath)
  ? JSON.parse(fs.readFileSync(propsOutPath, "utf8"))
  : null;
const preservedArtworkByBeatId = new Map(
  (preserveArtwork ? existingDraft?.scenes || [] : [])
    .filter((scene) => {
      const artwork = scene.storyboard;
      return artwork?.artworkFile && ["pending-visual-review", "adopted"].includes(artwork.artworkStatus);
    })
    .map((scene) => [scene.beatId, scene.storyboard]),
);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
for (const scene of scenes) {
  const preservedArtwork = preservedArtworkByBeatId.get(scene.beatId);
  if (!preservedArtwork || scene.storyboard?.artworkFile) continue;
  scene.storyboard = {
    ...(scene.storyboard || {}),
    ...preservedArtwork,
  };
}
const macroIds = [...new Set(scenes.map((scene) => scene.macroId || String(scene.beatId || "").split("-")[0]).filter(Boolean))];
const adoptedArtwork = scenes
  .filter((scene) => scene.storyboard?.artworkStatus === "adopted" && scene.storyboard?.artworkFile)
  .map((scene) => ({
    beatId: scene.beatId,
    file: scene.storyboard.artworkFile,
    exists: fs.existsSync(path.join(artworkDir, scene.storyboard.artworkFile)),
  }));

const stillFiles = fs.existsSync(stillsDir)
  ? fs.readdirSync(stillsDir).filter((file) => file.endsWith(".png"))
  : [];
const stillBeatIds = new Set(stillFiles.map((file) => file.replace(/\.png$/u, "")));
const missingStills = scenes
  .map((scene) => scene.beatId)
  .filter((beatId) => !stillBeatIds.has(beatId));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(propsOutPath, `${JSON.stringify(props, null, 2)}\n`, "utf8");
if (fs.existsSync(approvalPath)) fs.unlinkSync(approvalPath);

const propsSha = sha256File(propsOutPath);
const sourceSha = sha256Text(sourceRaw);
const manifest = {
  contract: "A1StoryboardDraftManifest/v1",
  status: "review-only-isolated-draft",
  authority: "storyboard-draft-not-system-line-review",
  generatedAt: new Date().toISOString(),
  source: {
    path: rel(sourcePath),
    sha256: sourceSha,
  },
  current: {
    propsPath: rel(propsOutPath),
    propsSha256: propsSha,
    sceneCount: scenes.length,
    macroCount: macroIds.length,
    macroIds,
    reviewBeatIds: props.reviewBeatIds || [],
    totalDurationMs: scenes.length ? Math.max(...scenes.map((scene) => scene.sourceEndMs || 0)) : 0,
  },
  assets: {
    stillsDir: rel(stillsDir),
    stillCount: stillFiles.length,
    missingStillCount: missingStills.length,
    missingStills,
    artworkDir: rel(artworkDir),
    adoptedArtworkCount: adoptedArtwork.length,
    adoptedArtwork,
    webGptArtworkCount: scenes.filter((scene) => scene.storyboard?.artworkSource === "chatgpt-web-manual" && scene.storyboard?.artworkFile).length,
    codexArtworkCount: scenes.filter((scene) => scene.storyboard?.artworkSource === "codex-built-in" && scene.storyboard?.artworkFile).length,
    chatgptBrowserAutomationArtworkCount: scenes.filter((scene) => scene.storyboard?.artworkSource === "chatgpt-web-browser-automation" && scene.storyboard?.artworkFile).length,
    generatedArtworkCount: scenes.filter((scene) => ["chatgpt-web-manual", "chatgpt-web-browser-automation", "codex-built-in"].includes(scene.storyboard?.artworkSource) && scene.storyboard?.artworkFile).length,
  pendingVisualReviewArtworkCount: scenes.filter((scene) => scene.storyboard?.artworkStatus === "pending-visual-review").length,
  preservedArtworkCount: preservedArtworkByBeatId.size,
  exactSourceParity: !preserveArtwork,
  },
  isolation: {
    mustNotMutateSystemLineProps: true,
    systemLinePropsPath: "remotion-renderer/src/generated/microbeatLayeredFullProps.json",
    systemLineReviewPage: "/system-line-review",
    storyboardPage: "/storyboard",
  },
  notes: [
    "This draft can drive the storyboard table and image-generation review UI.",
    "It is not proof that the H-series 540p review MP4, audit reports, or human-review packet are current.",
    "Promote into the system line only through an explicit adoption/render/audit step.",
    "Publishing a new storyboard draft invalidates any prior storyboard-approval.json; a full 540p review render requires a fresh approval bound to this draft hash.",
    preserveArtwork ? "Existing storyboard artwork metadata was explicitly preserved." : "Published props retain exact byte-level parity with the renderer source props.",
  ],
};

fs.writeFileSync(manifestOutPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  contract: manifest.contract,
  status: manifest.status,
  propsPath: manifest.current.propsPath,
  propsSha256: manifest.current.propsSha256,
  sceneCount: manifest.current.sceneCount,
  macroIds: manifest.current.macroIds,
  adoptedArtworkCount: manifest.assets.adoptedArtworkCount,
  webGptArtworkCount: manifest.assets.webGptArtworkCount,
  pendingVisualReviewArtworkCount: manifest.assets.pendingVisualReviewArtworkCount,
  preservedArtworkCount: manifest.assets.preservedArtworkCount,
}, null, 2));
