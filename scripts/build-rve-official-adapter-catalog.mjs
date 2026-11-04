import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "public", "template-confirmations", "rve-official-template-registry.json");
const outputPath = path.join(root, "lib", "storyboard-rve-official-adapter-catalog.js");
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

const slotPolicyByCategory = {
  "Charts & Data": {
    a1CategoryIds: ["metric-chart"],
    requiredSlots: ["title", "metric-or-series", "source"],
    optionalSlots: ["comparison-label", "caption"],
    bestFor: ["numbers", "metrics", "proof", "trend"],
    assetRoles: ["repo-evidence"],
  },
  Text: {
    a1CategoryIds: ["kinetic-title", "caption-quote"],
    requiredSlots: ["title"],
    optionalSlots: ["body", "highlight-token", "quote-attribution"],
    bestFor: ["claim", "quote", "hook", "caption"],
    assetRoles: [],
  },
  "Content Animation": {
    a1CategoryIds: ["process-flow", "role-grid"],
    requiredSlots: ["title", "items"],
    optionalSlots: ["body", "entity-mark"],
    bestFor: ["steps", "roles", "notifications", "lists"],
    assetRoles: ["entity-mark", "webpage-preview"],
  },
  Background: {
    a1CategoryIds: ["kinetic-title", "cinematic-camera"],
    requiredSlots: ["title"],
    optionalSlots: ["body", "texture-intensity"],
    bestFor: ["supporting-background", "atmosphere"],
    assetRoles: [],
  },
  Cinematic: {
    a1CategoryIds: ["cinematic-camera", "image-media"],
    requiredSlots: ["asset", "title"],
    optionalSlots: ["caption", "source", "focal-plan"],
    bestFor: ["real-media", "camera-motion", "cinematic-proof"],
    assetRoles: ["reference-media", "webpage-preview", "user-media"],
  },
  Transition: {
    a1CategoryIds: ["transition-grammar", "comparison-explainer"],
    requiredSlots: ["from-scene", "to-scene", "relation"],
    optionalSlots: ["title"],
    bestFor: ["relation-change", "contrast", "section-break"],
    assetRoles: [],
  },
  "Logo & Branding": {
    a1CategoryIds: ["logo-brand", "role-grid"],
    requiredSlots: ["entity-mark", "title"],
    optionalSlots: ["caption", "brand-name"],
    bestFor: ["brand", "tool", "entity"],
    assetRoles: ["entity-mark"],
  },
  "Intro & Outro": {
    a1CategoryIds: ["kinetic-title", "closing-outro", "caption-quote"],
    requiredSlots: ["title"],
    optionalSlots: ["body", "attribution", "continuity-token"],
    bestFor: ["opening", "closing", "chapter", "quote"],
    assetRoles: [],
  },
  "Image & Media": {
    a1CategoryIds: ["image-media", "cinematic-camera", "comparison-explainer"],
    requiredSlots: ["asset", "title", "source"],
    optionalSlots: ["body", "caption", "focal-plan", "secondary-asset"],
    bestFor: ["real-image", "webpage-screenshot", "gallery", "before-after"],
    assetRoles: ["reference-media", "webpage-preview", "user-media"],
  },
};

const explicitRoutes = {
  "poster-stack": ["cinematic-title-intro", "chapter-title", "title-split", "animated-text", "bounce-text"],
  "brief-left": ["lower-third", "animated-list", "slide-text", "typewriter-subtitle"],
  "center-title": ["animated-text", "bounce-text", "pulsing-text", "typewriter-subtitle"],
  "quote-focus": ["quote-card", "text-highlight", "typewriter-subtitle", "glitch-text"],
  "data-split": ["chart-animation", "line-chart", "donut-chart", "stat-counter", "comparison-chart", "circular-progress"],
  "compare-split": ["split-screen", "image-comparison-slider", "comparison-chart", "morph-transition", "push-transition"],
  "key-list": ["animated-list", "progress-steps", "card-flip", "notification-pop"],
  "timeline-flow": ["progress-steps", "animated-list", "rotating-carousel", "countdown-timer"],
  "chapter-marker": ["ken-burns", "parallax-pan", "letterbox-reveal", "image-zoom-reveal"],
  "lower-third": ["lower-third", "picture-in-picture", "image-zoom-reveal", "ken-burns"],
  "ending-card": ["end-card", "credits-roll", "subscribe-reminder", "quote-card"],
};

const skillRoutes = {
  "opening-hook": ["cinematic-title-intro", "chapter-title", "title-split", "animated-text"],
  typography: ["animated-text", "slide-text", "bounce-text", "typewriter-subtitle"],
  "quote-highlight": ["quote-card", "text-highlight", "typewriter-subtitle"],
  "evidence-metric": ["chart-animation", "line-chart", "donut-chart", "stat-counter", "comparison-chart", "circular-progress"],
  "data-viz": ["chart-animation", "area-chart", "line-chart", "progress-bars", "circular-progress"],
  "repo-demo": ["stat-counter", "comparison-chart", "picture-in-picture"],
  "problem-contrast": ["split-screen", "image-comparison-slider", "comparison-chart", "push-transition"],
  comparison: ["split-screen", "image-comparison-slider", "comparison-chart"],
  "process-flow": ["progress-steps", "animated-list", "rotating-carousel"],
  "method-flow": ["progress-steps", "animated-list", "countdown-timer"],
  "actor-role-grid": ["animated-list", "card-flip", "logo-typewriter", "progress-steps"],
  "role-grid": ["animated-list", "card-flip", "logo-typewriter"],
  "real-media-proof": ["ken-burns", "image-zoom-reveal", "picture-in-picture", "image-comparison-slider", "gallery-grid"],
  "real-media": ["ken-burns", "image-carousel", "photo-stack", "masonry-gallery", "polaroid-frame"],
  "closing-memory": ["end-card", "quote-card", "credits-roll", "subscribe-reminder"],
  closing: ["end-card", "quote-card", "credits-roll"],
  "cinematic-camera": ["ken-burns", "parallax-pan", "letterbox-reveal", "spotlight-reveal", "whip-pan", "zoom-pulse"],
  "transition-grammar": ["pixel-transition", "blinds-transition", "clock-wipe", "cross-dissolve", "fade-through-black", "iris-transition", "push-transition", "slide-wipe", "zoom-through"],
};

const bySlug = new Map(registry.templates.map((template) => [template.slug, template]));
const toCandidate = (template) => {
  const policy = slotPolicyByCategory[template.category];
  return {
    id: `rve-official:${template.slug}`,
    slug: template.slug,
    title: template.title,
    category: template.category,
    description: template.description,
    compositionId: template.compositionId,
    sourcePath: template.sourcePath,
    originalDemo: template.originalDemo,
    previewVideo: template.mp4,
    status: "official-source-rendered-adapter-candidate",
    sourceRepository: registry.sourceRepository,
    a1CategoryIds: policy.a1CategoryIds,
    requiredSlots: policy.requiredSlots,
    optionalSlots: policy.optionalSlots,
    bestFor: policy.bestFor,
    assetRoles: policy.assetRoles,
    previewRenderAvailable: true,
    directArticleRenderAllowed: false,
    adapterRequiredBeforeArticleRender: true,
    rejectIf: [
      "slotBindingMissing",
      "unverifiedAssetRender",
      "templateNameVisibleInStage",
      "sourcePreviewMistakenForFinalArticleShot",
    ],
  };
};

const candidates = registry.templates.map(toCandidate);
const candidatesBySlug = Object.fromEntries(candidates.map((candidate) => [candidate.slug, candidate]));

const normalizeSlugs = (slugs) => slugs.filter((slug) => bySlug.has(slug));
const routes = {
  byA1TemplateId: Object.fromEntries(Object.entries(explicitRoutes).map(([key, slugs]) => [key, normalizeSlugs(slugs)])),
  bySkill: Object.fromEntries(Object.entries(skillRoutes).map(([key, slugs]) => [key, normalizeSlugs(slugs)])),
};

const source = `export const RVE_OFFICIAL_ADAPTER_CATALOG_CONTRACT = "A1RveOfficialAdapterCatalog/v1";

export const rveOfficialAdapterCatalog = Object.freeze(${JSON.stringify({
  contract: "A1RveOfficialAdapterCatalog/v1",
  generatedAt: "2026-07-07",
  sourceRegistryContract: registry.contract,
  sourceRepository: registry.sourceRepository,
  sourceReadme: registry.sourceReadme,
  integrationMode: "official-source-preview-to-a1-adapter",
  directArticleRenderAllowed: false,
  adapterRequiredBeforeArticleRender: true,
  categories: registry.categories,
  candidateCount: candidates.length,
  candidates,
  candidatesBySlug,
  routes,
  qualityGate: {
    contract: "A1RveOfficialAdapterQualityGate/v1",
    previewVideoRequired: true,
    slotBindingRequired: true,
    assetProvenanceRequired: true,
    visualAuditRequired: true,
    rejectIf: [
      "unadaptedSourceTemplateUsedAsFinalShot",
      "fakeMedia",
      "missingSlotContract",
      "missingPreviewVideo",
      "copiedProductShell",
    ],
  },
}, null, 2)});

const unique = (values = []) => [...new Set(values.filter(Boolean))];

function candidatesForSlugs(slugs = []) {
  return unique(slugs).map((slug) => rveOfficialAdapterCatalog.candidatesBySlug[slug]).filter(Boolean);
}

export function getRveOfficialAdapterCandidate(slug = "") {
  return rveOfficialAdapterCatalog.candidatesBySlug[String(slug || "").trim()] || null;
}

export function rveOfficialCandidatesForA1Template(templateId = "", limit = 6) {
  return candidatesForSlugs(rveOfficialAdapterCatalog.routes.byA1TemplateId[String(templateId || "").trim()] || []).slice(0, limit);
}

export function rveOfficialCandidatesForSkill(skill = "", limit = 6) {
  return candidatesForSlugs(rveOfficialAdapterCatalog.routes.bySkill[String(skill || "").trim()] || []).slice(0, limit);
}

export function rveOfficialCandidatesForCategory(categoryId = "", limit = 6) {
  const id = String(categoryId || "").trim();
  return rveOfficialAdapterCatalog.candidates.filter((candidate) => candidate.a1CategoryIds.includes(id)).slice(0, limit);
}

export function rveOfficialCandidatesForMatch(match = {}, limit = 6) {
  const candidates = [
    ...rveOfficialCandidatesForA1Template(match.selectedTemplateId, limit),
    ...rveOfficialCandidatesForSkill(match.detectedSkill, limit),
    ...(match.externalTemplateCategoryReferences || []).flatMap((reference) => rveOfficialCandidatesForCategory(reference.categoryId, limit)),
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).slice(0, limit);
}

export function validateRveOfficialAdapterCatalog(catalog = rveOfficialAdapterCatalog) {
  const failures = [];
  if (catalog.contract !== RVE_OFFICIAL_ADAPTER_CATALOG_CONTRACT) failures.push("missing RVE official adapter catalog contract");
  if (catalog.sourceRegistryContract !== "A1RveOfficialTemplateRegistry/v1") failures.push("missing source registry contract");
  if (catalog.candidateCount !== 81 || catalog.candidates?.length !== 81) failures.push("RVE adapter catalog must cover all 81 official templates");
  if (catalog.directArticleRenderAllowed !== false) failures.push("RVE source templates must not direct-render as final article shots");
  if (catalog.adapterRequiredBeforeArticleRender !== true) failures.push("RVE source templates must require A1 adapter before article render");
  if (catalog.qualityGate?.contract !== "A1RveOfficialAdapterQualityGate/v1") failures.push("missing RVE adapter quality gate");
  for (const required of ["previewVideoRequired", "slotBindingRequired", "assetProvenanceRequired", "visualAuditRequired"]) {
    if (catalog.qualityGate?.[required] !== true) failures.push(\`quality gate missing \${required}\`);
  }
  const requiredRoutes = ["poster-stack", "quote-focus", "data-split", "compare-split", "timeline-flow", "chapter-marker", "lower-third", "ending-card"];
  for (const route of requiredRoutes) {
    if (!catalog.routes?.byA1TemplateId?.[route]?.length) failures.push(\`missing A1 template route: \${route}\`);
  }
  for (const candidate of catalog.candidates || []) {
    if (candidate.status !== "official-source-rendered-adapter-candidate") failures.push(\`candidate \${candidate.slug} has wrong status\`);
    if (!candidate.previewVideo?.endsWith(".mp4")) failures.push(\`candidate \${candidate.slug} missing preview video\`);
    if (!candidate.compositionId?.startsWith("RVE")) failures.push(\`candidate \${candidate.slug} missing composition id\`);
    if (!Array.isArray(candidate.requiredSlots) || !candidate.requiredSlots.length) failures.push(\`candidate \${candidate.slug} missing required slots\`);
    if (candidate.directArticleRenderAllowed !== false) failures.push(\`candidate \${candidate.slug} must not direct-render\`);
    if (candidate.adapterRequiredBeforeArticleRender !== true) failures.push(\`candidate \${candidate.slug} must require adapter\`);
    if (!candidate.rejectIf?.includes("sourcePreviewMistakenForFinalArticleShot")) failures.push(\`candidate \${candidate.slug} missing source-preview rejection\`);
  }
  return { ok: failures.length === 0, failures };
}
`;

await fs.writeFile(outputPath, source);
console.log(JSON.stringify({
  contract: "A1RveOfficialAdapterCatalogBuild/v1",
  outputPath,
  candidates: candidates.length,
  categories: registry.categories.length,
}, null, 2));
