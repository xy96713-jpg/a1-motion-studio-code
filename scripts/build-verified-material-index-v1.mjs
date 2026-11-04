#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {buildMaterialIndex, matchIndexedMaterial, MATERIAL_INDEX_CONTRACT} from "../lib/visual-sourcing/verified-material-index-v1.mjs";

// Builds (or refreshes) the searchable index over already-verified material so a
// matching asset can be reused instead of re-searching the web.
//
//   node scripts/build-verified-material-index-v1.mjs            # build + report
//   node scripts/build-verified-material-index-v1.mjs --write    # also persist the index
//
// The verified manifest itself is never modified: the index is a separate artifact
// that can always be rebuilt from source pixels.

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "assets", "web-assets", "verified-manifest.json");
const indexPath = path.join(root, "assets", "web-assets", "material-index.json");
const shouldWrite = process.argv.includes("--write");

const started = Date.now();

let previousIndex = null;
if (shouldWrite) {
  previousIndex = await fs.readFile(indexPath, "utf8").then(JSON.parse).catch(() => null);
}

const index = await buildMaterialIndex({verifiedManifestPath: manifestPath, root, previousIndex});

const report = {
  ok: index.indexedCount > 0,
  contract: MATERIAL_INDEX_CONTRACT,
  elapsedMs: Date.now() - started,
  entryCount: index.entryCount,
  indexedCount: index.indexedCount,
  analyzedCount: index.analyzedCount,
  reusedCount: index.reusedCount,
  skipped: index.skipped,
  entries: index.entries.map((entry) => ({
    id: entry.id,
    label: entry.canonicalName || entry.label,
    source: entry.source,
    kind: entry.kind,
    labels: entry.labels,
    ocrTextLength: entry.ocrTextLength,
    textRegionCount: entry.textRegionCount,
    featurePrintDigest: entry.featurePrintDigest,
    ocrPreview: entry.ocrText.slice(0, 120),
  })),
  written: false,
  indexPath: null,
};

if (shouldWrite) {
  await fs.mkdir(path.dirname(indexPath), {recursive: true});
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  report.written = true;
  report.indexPath = indexPath;
}

// Demonstrate reuse: can the indexed material answer a real shot requirement?
const sampleRequirement = {
  contract: "A1MaterialCarrierRequirement/v1",
  role: "evidence",
  requiredEntity: null,
  requiredAction: "append",
  requiredReadableDetail: "readable-source-detail",
  requiredVisualSignals: ["laundromat", "ledger"],
  sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED", generationAllowed: true, requiresArticleSource: false},
  effectBinding: {targetType: "source-text-range", semanticAction: "append", requiresVerifiedCarrier: true},
};
const reuse = matchIndexedMaterial({entries: index.entries, requirement: sampleRequirement, limit: 3});
report.reuseProbe = {
  requirement: "evidence/append needing a text anchor",
  reusable: reuse.reusable.map((match) => ({id: match.id, score: match.score, matchedTokens: match.matchedTokens})),
  uncertainCount: reuse.uncertain.length,
  rejectedCount: reuse.rejected.length,
};

console.log(JSON.stringify(report, null, 2));
