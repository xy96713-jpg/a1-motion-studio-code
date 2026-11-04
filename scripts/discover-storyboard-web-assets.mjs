import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  buildStoryboardWebAssetPlan,
  discoverStoryboardWebAssetCandidates,
  validateStoryboardWebAssetDiscovery,
} from "../lib/storyboard-web-asset-resolver.js";

const root = process.cwd();
const assetDir = path.join(root, "assets", "web-assets");
const manifestPath = path.join(assetDir, "manifest.json");

const defaultSourceText = `文章提到 vibe-motion/auto-motion、nexu-io/html-video 和 ImaginaryToolXYZ。
Codex、Kimi、DeepSeek、GitHub 是已知实体。
文章引用 https://www.wikipedia.org/ 作为网页资料，也需要「Moon」背景图片候选。
未知实体只能联网查候选，不能直接生成假 Logo 或假截图。`;

async function readInputText() {
  if (process.env.A1_WEB_ASSET_TEXT) return process.env.A1_WEB_ASSET_TEXT;
  if (process.env.A1_WEB_ASSET_TEXT_FILE) {
    return fs.readFile(process.env.A1_WEB_ASSET_TEXT_FILE, "utf8");
  }
  return defaultSourceText;
}

async function main() {
  const sourceText = await readInputText();
  const plan = buildStoryboardWebAssetPlan({ sourceText });
  const discovery = await discoverStoryboardWebAssetCandidates(plan, {
    maxCandidates: Number(process.env.A1_WEB_ASSET_MAX_CANDIDATES || 8),
    maxProbesPerCandidate: Number(process.env.A1_WEB_ASSET_MAX_PROBES || 4),
    timeoutMs: Number(process.env.A1_WEB_ASSET_TIMEOUT_MS || 6000),
  });
  const validation = validateStoryboardWebAssetDiscovery(discovery);
  if (!validation.ok) {
    console.error(`Storyboard web asset discovery invalid:\n${validation.failures.map((failure) => `- ${failure}`).join("\n")}`);
    process.exit(1);
  }

  await fs.mkdir(assetDir, { recursive: true });
  const manifest = {
    contract: "A1WebAssetCandidateCache/v1",
    resolverContract: "A1WebAssetResolver/v1",
    extractionVersion: "cli-discovery-priority-evidence-2026-07-04",
    generatedAt: discovery.generatedAt,
    policy: discovery.policy,
    sourceTextHash: crypto.createHash("sha256").update(sourceText).digest("hex").slice(0, 32),
    discoveryPriorityPolicy: plan.discoveryPriorityPolicy || "",
    discoveryQueue: Array.isArray(discovery.discoveryQueue) ? discovery.discoveryQueue : [],
    evidenceSummary: discovery.evidenceSummary || {},
    sceneAssetBriefs: Array.isArray(plan.sceneAssetBriefs) ? plan.sceneAssetBriefs : [],
    summary: {
      candidateCount: plan.candidates.length,
      sceneAssetBriefCount: Array.isArray(plan.sceneAssetBriefs) ? plan.sceneAssetBriefs.length : 0,
      discoveryQueueCount: Array.isArray(discovery.discoveryQueue) ? discovery.discoveryQueue.length : 0,
      discoveredCount: discovery.discovered.length,
      promotableCount: discovery.promotable.length,
      unresolvedCount: discovery.unresolved.length,
      metadataCandidateCount: discovery.evidenceSummary?.metadataCandidateCount || 0,
      fallbackCandidateCount: discovery.evidenceSummary?.fallbackCandidateCount || 0,
      diagnosticCandidateCount: discovery.evidenceSummary?.diagnosticCandidateCount || 0,
      retryableCandidateCount: discovery.evidenceSummary?.retryableCandidateCount || 0,
      renderAllowedCount: discovery.evidenceSummary?.renderAllowedCount || 0,
      repoFallbackCount: discovery.evidenceSummary?.repo?.pageFallbackCount || 0,
      evidenceQualityLevel: discovery.evidenceSummary?.quality?.level || "empty",
      needsHumanReview: discovery.evidenceSummary?.quality?.needsHumanReview === true,
    },
    discovered: discovery.discovered,
    promotable: discovery.promotable,
    unresolved: discovery.unresolved,
    verifiedForRender: [],
    rejectIf: discovery.rejectIf,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Discovered ${discovery.discovered.length} web asset candidates.`);
  console.log(`Promotable candidates: ${discovery.promotable.length}`);
  console.log(`Evidence quality: ${manifest.summary.evidenceQualityLevel}${manifest.summary.needsHumanReview ? " (review)" : ""}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
