#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "external/motion-template-sources/video-shotcraft");
const libraryPath = path.join(sourceRoot, "gallery/api/library.json");
const licensePath = path.join(sourceRoot, "LICENSE");
const outputPath = path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json");
const workRoot = path.join(root, "work/video-shotcraft-integration-v1");
const expectedCommit = "5e71af35a2daee492dd3ea93e5e8903f32dcd13c";
const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const jsonHash = (value) => shaBuffer(Buffer.from(JSON.stringify(value)));
const rel = (file) => path.relative(root, file).split(path.sep).join("/");

if (!fs.existsSync(libraryPath) || !fs.existsSync(licensePath)) throw new Error("video-shotcraft-pinned-source-required");
const commit = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {encoding: "utf8"}).trim();
if (commit !== expectedCommit) throw new Error(`video-shotcraft-source-commit-mismatch:${commit}`);
if (!fs.readFileSync(licensePath, "utf8").includes("Apache License")) throw new Error("video-shotcraft-apache-license-required");
const upstream = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
if (upstream.stats?.cardCount !== 157 || upstream.stats?.styleCount !== 214 || upstream.stats?.previewCount !== 214)
  throw new Error("video-shotcraft-upstream-library-count-mismatch");

const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
}) : [];
const allDemoFiles = walk(path.join(sourceRoot, "demos")).filter((file) => file.endsWith(".tsx")).sort();
const cards = upstream.cards.map((card) => {
  const sourcePath = path.join(sourceRoot, card.source);
  if (!fs.existsSync(sourcePath)) throw new Error(`video-shotcraft-card-source-missing:${card.name}`);
  const cardSource = fs.readFileSync(sourcePath, "utf8");
  const demoDir = path.join(sourceRoot, "demos", card.category, card.name);
  const documentedDemoPaths = [...cardSource.matchAll(/demos\/[a-z0-9/_-]+\.tsx/giu)]
    .map((match) => path.join(sourceRoot, match[0]))
    .filter((file) => fs.existsSync(file));
  const demoFiles = [...new Set([
    ...walk(demoDir).filter((file) => file.endsWith(".tsx")),
    ...documentedDemoPaths,
    ...allDemoFiles.filter((file) => path.basename(path.dirname(file)) === card.name),
  ])].sort();
  const styles = card.styles.map((style) => ({
    key: style.key,
    label: style.label,
    description: style.description,
    previewUrl: `https://vincentwei1021.github.io/video-shotcraft/${String(style.media?.url || "").replace(/^\.\//u, "")}`,
    mediaType: style.media?.type || null,
  }));
  return {
    id: card.name,
    name: card.name,
    summary: card.summary,
    use: card.use,
    duration: card.duration,
    energy: card.energy,
    intention: card.intention,
    category: card.category,
    tags: card.tags || [],
    addedAt: card.addedAt || null,
    updatedAt: card.updatedAt || null,
    sourcePath: rel(sourcePath),
    sourceSha256: sha(sourcePath),
    demoPaths: demoFiles.map(rel),
    demoSha256: Object.fromEntries(demoFiles.map((file) => [rel(file), sha(file)])),
    styles,
    integrationMode: "A1_OWNED_COPY_ADAPT",
    directExternalRender: false,
  };
});
const missingDemoCards = cards.filter((card) => card.demoPaths.length === 0).map((card) => card.id);
const categories = Object.fromEntries(Object.entries(upstream.categories).map(([id, value]) => [id, value]));
const body = {
  contract: "A1VideoShotcraftCatalog/v1",
  generatedAt: upstream.generatedAt,
  source: {
    repository: "https://github.com/Vincentwei1021/video-shotcraft",
    commit,
    license: "Apache-2.0",
    localPath: "external/motion-template-sources/video-shotcraft",
    libraryPath: rel(libraryPath),
    librarySha256: sha(libraryPath),
    licensePath: rel(licensePath),
    licenseSha256: sha(licensePath),
    onlineGallery: "https://vincentwei1021.github.io/video-shotcraft/library.html",
  },
  stats: {...upstream.stats, localCardCount: cards.length, localStyleCount: cards.reduce((sum, card) => sum + card.styles.length, 0), cardsWithExactDemo: cards.length - missingDemoCards.length, missingDemoCount: missingDemoCards.length},
  categories,
  policy: {
    selectionMode: "EXISTING_RECIPE_FIRST",
    exactCardAndDemoReadRequired: true,
    directExternalRender: false,
    a1OwnedAdapterRequired: true,
    productReskinRequired: true,
    customMotion: "ONLY_WITH_EXPLICIT_GAP_JUSTIFICATION",
    currentStoryboardAuthorityUnchanged: true,
    productionAdmission: false,
  },
  missingDemoCards,
  cards,
};
const catalog = {...body, catalogSha256: jsonHash(body)};
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.mkdirSync(workRoot, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
const baselinePath = path.join(workRoot, "baseline.json");
if (!fs.existsSync(baselinePath)) fs.writeFileSync(baselinePath, `${JSON.stringify({contract: "A1VideoShotcraftIntegrationBaseline/v1", status: "FAIL", catalogAvailable: false, cardsIndexed: 0, stylesIndexed: 0, storyboardRecipeBinding: false, exactDemoReuseEnforced: false, customMotionBlockedWhenRecipeFits: false}, null, 2)}\n`);
console.log(JSON.stringify({status: "PASS", outputPath: rel(outputPath), catalogSha256: catalog.catalogSha256, stats: catalog.stats, missingDemoCards}, null, 2));
