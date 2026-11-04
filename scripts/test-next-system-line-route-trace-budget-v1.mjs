import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const traceRoot = path.join(repoRoot, "apps/studio-next/.next/server/app/api/system-line");
const readRouteBudget = {files: 220, bytes: 40 * 1024 * 1024};
// Keep a narrow buffer for Next.js trace-graph variation across builds while
// preserving the runtime-state, heavyweight-reviewer, and byte hard gates.
const actionRouteBudget = {files: 662, bytes: 120 * 1024 * 1024};

function listTraceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? listTraceFiles(target) : entry.name.endsWith(".nft.json") ? [target] : [];
  });
}

const traceFiles = listTraceFiles(traceRoot).sort();
assert.ok(traceFiles.length >= 4, "next-system-line-trace-output-missing-run-npm-build-first");

const routeReports = traceFiles.map((traceFile) => {
  const trace = JSON.parse(fs.readFileSync(traceFile, "utf8"));
  const resolvedFiles = (trace.files || []).map((item) => path.resolve(path.dirname(traceFile), item));
  const presentFiles = resolvedFiles.filter((file) => fs.existsSync(file));
  const bytes = presentFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const forbidden = resolvedFiles.filter((file) => (
    file.includes(`${path.sep}public${path.sep}`)
    || file.includes(`${path.sep}.codex-artifacts${path.sep}`)
    || /(?:^|[/\\])workspace\.json$/u.test(file)
    || /\.tmp-|checkpoint-staging/u.test(file)
  ));
  const heavyweightReviewer = resolvedFiles.filter((file) => file.endsWith(`${path.sep}a1-package-look-master-reviewer-v1.mjs`));
  const route = path.relative(traceRoot, traceFile).replace(/[/\\]route\.js\.nft\.json$/u, "").replaceAll(path.sep, "/") || "/";
  const sourcePath = path.join(repoRoot, "apps/studio-next/src/app/api/system-line", route, "route.ts");
  const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
  const explicitMutationRoute = route !== "editorial-asset-workbench" && /export async function POST\(/u.test(source);
  const budget = explicitMutationRoute ? actionRouteBudget : readRouteBudget;

  assert.equal(forbidden.length, 0, `next-route-trace-runtime-state-leak:${route}:${forbidden.join(",")}`);
  assert.equal(heavyweightReviewer.length, 0, `next-route-trace-heavy-reviewer-leak:${route}`);
  assert.ok(presentFiles.length <= budget.files, `next-route-trace-file-budget-exceeded:${route}:${presentFiles.length}/${budget.files}`);
  assert.ok(bytes <= budget.bytes, `next-route-trace-byte-budget-exceeded:${route}:${bytes}/${budget.bytes}`);
  return {route, kind: explicitMutationRoute ? "explicit-mutation" : "read-hot-path", files: presentFiles.length, bytes, budget};
});

for (const requiredRoute of ["editorial-asset-workbench", "editorial-asset-workbench/actions", "editorial-asset-workbench/import-project", "execution-status", "packaging-review"]) {
  assert.ok(routeReports.some((item) => item.route === requiredRoute), `next-route-trace-required-route-missing:${requiredRoute}`);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1NextSystemLineRouteTraceBudget/v1",
  routeCount: routeReports.length,
  readRouteBudget,
  actionRouteBudget,
  observedMaxFiles: Math.max(...routeReports.map((item) => item.files)),
  observedMaxBytes: Math.max(...routeReports.map((item) => item.bytes)),
  mutableRuntimeStateTraced: false,
  heavyweightVisualReviewerTraced: false,
  routes: routeReports,
}, null, 2));
