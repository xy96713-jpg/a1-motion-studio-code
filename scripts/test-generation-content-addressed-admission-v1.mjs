#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workerPaths = [
  "scripts/run-editorial-asset-workbench-jobs-v2.mjs",
  "scripts/run-editorial-project-asset-jobs-v1.mjs",
];

for (const relativePath of workerPaths) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.match(source, /import \{commitContentAddressedMedia\} from "\.\.\/apps\/studio-next\/src\/lib\/a1-content-addressed-media-v1\.mjs";/u, `${relativePath}:content-addressed-import-missing`);
  assert.match(source, /const stagingPath = `\$\{outputPath\}\.staging-/u, `${relativePath}:staging-output-missing`);
  assert.match(source, /Save the PNG to this exact path: \$\{stagingPath\}/u, `${relativePath}:provider-bypasses-staging`);
  assert.match(source, /commitContentAddressedMedia\(\{stagingPath, outputPath, blobRoot: generatedBlobRoot, publicRoot, extension: "\.png"\}\)/u, `${relativePath}:content-addressed-commit-missing`);
  assert.match(source, /contentAddressedStorage/u, `${relativePath}:content-addressed-evidence-missing`);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1GenerationContentAddressedAdmissionWiring/v1",
  officialWorkersChecked: workerPaths.length,
  providerWritesStableOutputDirectly: false,
  contentShaAdmissionRequired: true,
}, null, 2));
