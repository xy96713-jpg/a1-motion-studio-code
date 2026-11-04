#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {resolveEntryImagePath} from "../lib/visual-sourcing/verified-material-index-v1.mjs";

// Checks that every entry in the verified manifest still has its material on disk.
//
// A manifest entry is a claim that an asset exists and was approved. If the cached
// file behind it is gone, the claim is stale and nothing can be reused from it - and
// nothing downstream notices, because the manifest itself still validates. This turns
// that silent divergence into a reported fact.
//
// Read-only. Reports; does not repair.

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "assets", "web-assets", "verified-manifest.json");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

const present = [];
const missing = [];
const external = [];
const noReference = [];

for (const entry of entries) {
  const webPath = String(entry.cachedImageUrl || entry.imageUrl || "");
  if (/^https?:/iu.test(webPath)) {
    external.push({id: entry.id, url: webPath, reason: "external-url-not-cached"});
    continue;
  }
  if (!webPath) {
    noReference.push({id: entry.id, reason: "entry-records-no-image"});
    continue;
  }
  const imagePath = resolveEntryImagePath(entry, root);
  if (!imagePath) {
    noReference.push({id: entry.id, reason: `unresolvable-path: ${webPath.slice(0, 120)}`});
    continue;
  }
  try {
    const stat = await fs.stat(imagePath);
    present.push({id: entry.id, path: imagePath, bytes: stat.size});
  } catch {
    missing.push({id: entry.id, expectedPath: imagePath, recordedUrl: webPath, sourceUrl: String(entry.sourceUrl || "").slice(0, 200)});
  }
}

// Files sitting in the cache that no verified entry points at: rebuilt material or
// leftovers, and the other half of the divergence.
const cacheDir = path.join(root, "assets", "web-assets", "cache");
const referencedNames = new Set(
  [...present, ...missing]
    .flatMap((item) => [String(item.path || item.expectedPath || "")])
    .map((value) => path.basename(value))
    .filter(Boolean),
);
const cacheFiles = await fs.readdir(cacheDir).catch(() => []);
const orphanFiles = cacheFiles.filter((name) => !referencedNames.has(name));

const total = entries.length;
const report = {
  ok: missing.length === 0 && present.length > 0,
  contract: "A1VerifiedMaterialIntegrity/v1",
  manifestPath,
  manifestGeneratedAt: manifest.generatedAt || null,
  entryCount: total,
  presentCount: present.length,
  missingCount: missing.length,
  externalCount: external.length,
  noReferenceCount: noReference.length,
  orphanCacheFileCount: orphanFiles.length,
  verdict: missing.length === 0
    ? "verified-material-intact"
    : present.length === 0
      ? "verified-material-entirely-missing"
      : "verified-material-partially-missing",
  missing,
  external,
  noReference,
  orphanCacheFiles: orphanFiles.slice(0, 30),
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
