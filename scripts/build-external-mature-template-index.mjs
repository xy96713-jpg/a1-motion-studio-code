import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "external", "motion-template-sources");
const artifactDir = path.join(root, ".codex-artifacts", "external-mature-template-index");
await fs.mkdir(artifactDir, { recursive: true });

const sourceMeta = {
  remocn: {
    repo: "kapishdima/remocn",
    homepage: "https://www.remocn.dev/",
    license: "MIT",
    stars: 880,
    maturity: "high",
    integrationMode: "registry-copy-in-source-owned",
    basePath: path.join(sourceRoot, "remocn"),
  },
  rve: {
    repo: "reactvideoeditor/remotion-templates",
    homepage: "https://www.reactvideoeditor.com/remotion-templates",
    license: "unverified-in-repo",
    stars: 162,
    maturity: "medium",
    integrationMode: "single-file-remotion-template-adapter",
    basePath: path.join(sourceRoot, "remotion-templates"),
  },
  bits: {
    repo: "av/remotion-bits",
    homepage: "https://remotion-bits.dev/",
    license: "MIT",
    stars: 399,
    maturity: "medium",
    integrationMode: "registry-or-npm-component-bits",
    basePath: path.join(sourceRoot, "remotion-bits"),
  },
  shotcraft: {
    repo: "Vincentwei1021/video-shotcraft",
    homepage: "https://vincentwei1021.github.io/video-shotcraft/library.html",
    license: "Apache-2.0",
    stars: 0,
    maturity: "high",
    integrationMode: "complete-recipe-index-plus-a1-owned-copy-adapt",
    basePath: path.join(sourceRoot, "video-shotcraft"),
  },
};

const shotTasks = {
  kinetic_text_lead: {
    a1ShotTemplate: "MagazineLead",
    requiredTraits: ["large typography", "line mask", "strong still frame", "not six-line title"],
    keywords: ["title", "text", "character", "rise", "shimmer", "highlight", "typewriter", "chapter"],
  },
  kinetic_text_claim: {
    a1ShotTemplate: "KineticClaim",
    requiredTraits: ["phrase emphasis", "quote/claim lockup", "highlight sweep"],
    keywords: ["quote", "highlight", "shimmer", "text", "marker", "claim"],
  },
  real_evidence_image: {
    a1ShotTemplate: "EvidenceImage",
    requiredTraits: ["image as primary surface", "focal crop", "source label", "minimal annotation"],
    keywords: ["ken", "image", "photo", "gallery", "zoom", "comparison", "expand", "fullscreen"],
  },
  generated_editorial_poster: {
    a1ShotTemplate: "ConceptPoster",
    requiredTraits: ["bitmap/poster main surface", "not line art", "topic-specific atmosphere"],
    keywords: ["mesh", "gradient", "spotlight", "shader", "backdrop", "silk", "dither", "bento", "hero"],
  },
  comparison_split: {
    a1ShotTemplate: "ComparisonSplit",
    requiredTraits: ["two semantic sides", "before/after", "hinge transition"],
    keywords: ["comparison", "split", "diff", "before", "after", "wipe", "slider"],
  },
  data_timeline: {
    a1ShotTemplate: "DataTimeline",
    requiredTraits: ["ordered steps/data", "chart/timeline", "real values or explicit process"],
    keywords: ["chart", "bar", "line", "progress", "steps", "counter", "number", "timeline"],
  },
  resolve_ending: {
    a1ShotTemplate: "ResolveEnd",
    requiredTraits: ["quiet final lock", "outro", "controlled fade"],
    keywords: ["end", "outro", "credits", "fade", "resolve", "focus", "blur"],
  },
  transition_system: {
    a1ShotTemplate: "ArticleFilmTransition",
    requiredTraits: ["scene-to-scene connection", "not visible debug line", "semantic transition"],
    keywords: ["transition", "wipe", "push", "zoom", "dissolve", "pixel", "through"],
  },
  screen_product_demo: {
    a1ShotTemplate: "VerifiedScreenOperation",
    requiredTraits: ["real screen pixels", "event-bound motion", "cursor telemetry when required", "readable result hold"],
    keywords: ["cursor", "click", "input", "ui", "page", "camera", "screen", "scroll", "panel", "interface"],
  },
};

const clean = (value = "") => String(value || "").trim();
const slug = (value = "") => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function taskScores(name = "", description = "") {
  const haystack = `${name} ${description}`.toLowerCase();
  return Object.fromEntries(Object.entries(shotTasks).map(([task, config]) => {
    const score = config.keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
    return [task, score];
  }));
}

function bestTaskFor(name = "", description = "") {
  const scores = taskScores(name, description);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [task, score] = ranked[0] || ["kinetic_text_claim", 0];
  return {
    task: score > 0 ? task : "kinetic_text_claim",
    score,
    scores,
  };
}

async function readRveCandidates() {
  const dir = path.join(sourceMeta.rve.basePath, "templates");
  if (!await exists(dir)) return [];
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".tsx")).sort();
  return Promise.all(files.map(async (file) => {
    const filePath = path.join(dir, file);
    const source = await fs.readFile(filePath, "utf8");
    const base = file.replace(/\.tsx$/u, "");
    const description = source
      .split("\n")
      .filter((line) => /export|function|const|interpolate|spring|useCurrentFrame|useVideoConfig|clip|transform|opacity/u.test(line))
      .slice(0, 10)
      .join(" ");
    const best = bestTaskFor(base, description);
    return {
      id: `rve-${base}`,
      sourceId: "rve",
      sourceRepo: sourceMeta.rve.repo,
      sourcePath: `templates/${file}`,
      name: base,
      description: clean(description).slice(0, 520),
      a1VisualTask: best.task,
      a1ShotTemplate: shotTasks[best.task].a1ShotTemplate,
      matchScore: best.score,
      integrationMode: sourceMeta.rve.integrationMode,
      license: sourceMeta.rve.license,
      stars: sourceMeta.rve.stars,
      risk: sourceMeta.rve.license === "unverified-in-repo" ? "license-must-be-confirmed-before-copy" : "low",
      recommendedUse: "normalize pattern into A1-owned Remotion/HTML adapter; do not blindly rotate templates",
    };
  }));
}

async function readRemocnCandidates() {
  const registryPath = path.join(sourceMeta.remocn.basePath, "public", "r", "registry.json");
  if (!await exists(registryPath)) return [];
  const registry = await readJson(registryPath);
  const items = Array.isArray(registry.items) ? registry.items : [];
  return items.map((item = {}) => {
    const name = clean(item.name || item.title || "");
    const description = clean(item.description || item.type || item.registryDependencies?.join(" ") || "");
    const best = bestTaskFor(name, description);
    return {
      id: `remocn-${slug(name)}`,
      sourceId: "remocn",
      sourceRepo: sourceMeta.remocn.repo,
      sourcePath: `public/r/${slug(name)}.json`,
      name,
      description,
      a1VisualTask: best.task,
      a1ShotTemplate: shotTasks[best.task].a1ShotTemplate,
      matchScore: best.score,
      integrationMode: sourceMeta.remocn.integrationMode,
      license: sourceMeta.remocn.license,
      stars: sourceMeta.remocn.stars,
      risk: "dependency-heavy-copy-in-needs-adapter",
      recommendedUse: "prefer scene-ready typography, transitions, UI flows, shaders, and rich backgrounds as source-owned A1 adapters",
    };
  }).filter((item) => item.name);
}

async function readBitsCandidates() {
  const inventoryPath = path.join(sourceMeta.bits.basePath, "src", "catalog", "inventory.generated.json");
  if (!await exists(inventoryPath)) return [];
  const inventory = await readJson(inventoryPath);
  const items = Array.isArray(inventory) ? inventory : Array.isArray(inventory.items) ? inventory.items : [];
  return items.map((item = {}) => {
    const name = clean(item.name || item.id || item.slug || "");
    const description = clean(item.description || item.category || item.tags?.join(" ") || "");
    const best = bestTaskFor(name, description);
    return {
      id: `bits-${slug(name)}`,
      sourceId: "bits",
      sourceRepo: sourceMeta.bits.repo,
      sourcePath: item.path || item.file || "src/catalog/inventory.generated.json",
      name,
      description,
      a1VisualTask: best.task,
      a1ShotTemplate: shotTasks[best.task].a1ShotTemplate,
      matchScore: best.score,
      integrationMode: sourceMeta.bits.integrationMode,
      license: sourceMeta.bits.license,
      stars: sourceMeta.bits.stars,
      risk: "component-bit-needs-renderer-compatibility-check",
      recommendedUse: "use as supporting effects/components after primary still-frame template is chosen",
    };
  }).filter((item) => item.name);
}

async function readShotcraftCandidates() {
  const catalogPath = path.join(root, "apps/studio-next/src/data/video-shotcraft-catalog-v1.json");
  if (!await exists(catalogPath)) return [];
  const catalog = await readJson(catalogPath);
  return (catalog.cards || []).map((card = {}) => {
    const description = clean(`${card.summary || ""} ${card.use || ""} ${card.intention || ""}`);
    const best = bestTaskFor(card.name, description);
    const screenScore = shotTasks.screen_product_demo.keywords.reduce((sum, keyword) => sum + (`${card.name} ${description}`.toLowerCase().includes(keyword) ? 1 : 0), 0);
    const visualTask = screenScore >= best.score ? "screen_product_demo" : best.task;
    return {
      id: `shotcraft-${card.id}`,
      sourceId: "shotcraft",
      sourceRepo: sourceMeta.shotcraft.repo,
      sourcePath: card.sourcePath,
      name: card.name,
      description: description.slice(0, 520),
      a1VisualTask: visualTask,
      a1ShotTemplate: shotTasks[visualTask].a1ShotTemplate,
      matchScore: Math.max(screenScore, best.score),
      integrationMode: sourceMeta.shotcraft.integrationMode,
      license: sourceMeta.shotcraft.license,
      stars: sourceMeta.shotcraft.stars,
      risk: card.demoPaths?.length ? "exact-demo-must-be-read-and-normalized" : "exact-demo-source-missing",
      recommendedUse: "select exact recipe and style first, then copy-adapt its exact demo into an A1-owned source-bound adapter; do not hand-author while a fitting recipe exists",
      styleCount: card.styles?.length || 0,
      previewUrl: card.styles?.[0]?.previewUrl || null,
      demoPaths: card.demoPaths || [],
      sourceSha256: card.sourceSha256,
    };
  });
}

const candidates = [
  ...await readRemocnCandidates(),
  ...await readRveCandidates(),
  ...await readBitsCandidates(),
  ...await readShotcraftCandidates(),
];

const priorityBoost = {
  remocn: 8,
  rve: 5,
  bits: 3,
  shotcraft: 9,
};

const rankedCandidates = candidates
  .map((item) => ({
    ...item,
    priorityScore: Number((item.matchScore * 10 + priorityBoost[item.sourceId] + Math.log10(Math.max(1, item.stars))).toFixed(3)),
  }))
  .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));

const byTask = Object.fromEntries(Object.keys(shotTasks).map((task) => [
  task,
  rankedCandidates.filter((item) => item.a1VisualTask === task).slice(0, 12),
]));

const firstWave = {
  kinetic_text_lead: ["remocn-per-character-rise", "remocn-shimmer-sweep", "rve-cinematic-title-intro", "rve-chapter-title"],
  kinetic_text_claim: ["remocn-inline-highlight", "rve-quote-card", "rve-text-highlight", "rve-title-split"],
  real_evidence_image: ["rve-ken-burns", "rve-image-zoom-reveal", "rve-image-comparison-slider", "rve-gallery-grid"],
  generated_editorial_poster: ["remocn-mesh-gradient-bg", "remocn-spotlight-card", "remocn-shader-swirl", "rve-film-burn"],
  comparison_split: ["rve-comparison-chart", "rve-image-comparison-slider", "rve-split-screen", "remocn-slider"],
  data_timeline: ["rve-progress-steps", "rve-line-chart", "rve-stat-counter", "remocn-progress-steps"],
  resolve_ending: ["rve-end-card", "rve-fade-through-black", "remocn-focus-blur-resolve", "rve-credits-roll"],
  transition_system: ["rve-zoom-through", "rve-pixel-transition", "remocn-push-through", "remocn-perlin-dissolve"],
  screen_product_demo: ["shotcraft-input-trigger-moves", "shotcraft-cursor-flyover", "shotcraft-ai-stream-response", "shotcraft-document-typewriter-reveal"],
};

const report = {
  contract: "A1ExternalMatureTemplateIndex/v1",
  generatedAt: new Date().toISOString(),
  sourceRoot,
  sources: sourceMeta,
  policy: {
    directCopyAllowed: false,
    firstUse: "source-backed candidate selection and A1 adapter design",
    qualityGate: [
      "still-frame screenshot before promotion",
      "license confirmed before copying code",
      "source-owned adapter rather than imported product shell",
      "no SVG line-art as universal fallback",
      "real image templates must preserve provenance",
    ],
  },
  totalCandidates: rankedCandidates.length,
  tasks: shotTasks,
  byTask,
  firstWave,
  rankedCandidates,
};

const reportPath = path.join(artifactDir, "external-mature-template-index.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

const md = [
  "# A1 External Mature Template Index",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Sources",
  "",
  ...Object.entries(sourceMeta).map(([id, meta]) => `- ${id}: ${meta.repo}, ${meta.stars} stars, ${meta.license}, ${meta.integrationMode}`),
  "",
  "## First Wave",
  "",
  ...Object.entries(firstWave).flatMap(([task, ids]) => [
    `### ${task} -> ${shotTasks[task].a1ShotTemplate}`,
    "",
    ...ids.map((id) => {
      const candidate = rankedCandidates.find((item) => item.id === id);
      return candidate
        ? `- ${candidate.id} (${candidate.sourceRepo}/${candidate.sourcePath}) - ${candidate.recommendedUse}`
        : `- ${id} - MISSING IN LOCAL INDEX, inspect source manually before use`;
    }),
    "",
  ]),
  "## Top Candidates By Task",
  "",
  ...Object.entries(byTask).flatMap(([task, items]) => [
    `### ${task}`,
    "",
    ...items.slice(0, 8).map((item) => `- ${item.id} | ${item.sourceRepo}/${item.sourcePath} | score ${item.priorityScore} | risk: ${item.risk}`),
    "",
  ]),
].join("\n");

const mdPath = path.join(artifactDir, "external-mature-template-index.md");
await fs.writeFile(mdPath, md);

console.log(`External mature template index built.`);
console.log(`JSON: ${reportPath}`);
console.log(`Markdown: ${mdPath}`);
