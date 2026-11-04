import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// Source-only guard: never import/execute routes, historical scripts or route traces.
const action = 'dry-run-package-layer-partition';
const base = '/api/system-line/editorial-asset-workbench/';
const callers = [];
const failures = [];
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['archive','history','node_modules','.next','generated'].includes(entry.name)) scan(file);
    } else if (/\.(?:[cm]?[jt]sx?|py|sh)$/.test(file) && file !== 'scripts/test-partition-client-endpoint-v1.mjs') {
      const source = fs.readFileSync(file,'utf8');
      if (!source.includes(action) || file.includes('/api/')) continue;
      if (source.includes(base+'actions')) failures.push(file);
      if (/\bfetch\s*\(/.test(source)) {
        callers.push(file);
        if (!source.includes(base+'partition-dry-run')) failures.push(file);
      }
    }
  }
}
for (const dir of ['apps/studio-next/src','scripts','tests']) scan(dir);
assert.deepEqual(failures, [], 'partition callers must use bounded dedicated endpoint, not shared actions');
for (const file of ['scripts/verify-single-shot-partition-http-v1.mjs','scripts/verify-partition-conflict-current-v1.mjs','scripts/verify-partition-api-budget-http-v1.mjs']) assert.ok(callers.includes(file), file);
const route = fs.readFileSync('apps/studio-next/src/app/api/system-line/editorial-asset-workbench/partition-dry-run/route.ts','utf8');
assert.ok(route.includes('readPartitionBody(request)'));
assert.ok(route.includes('runSingleShotPartitionDryRun'));
console.log(JSON.stringify({status:'PASS',httpCallers:callers,scope:'SOURCE_ONLY_LITERAL_ENDPOINT_REGRESSION_NO_ROUTE_EXECUTION'}));
