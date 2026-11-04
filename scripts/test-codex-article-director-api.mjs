import fs from "node:fs";

const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${rootUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 200) }; }
  return { response, payload };
}

const capability = await jsonRequest("/api/a1-codex-director");
assert(capability.response.ok, `capability route failed: ${capability.response.status}`);
assert(capability.payload?.contract === "A1CodexArticleDirectorCapability/v1", `wrong capability contract: ${JSON.stringify(capability.payload)}`);
assert(capability.payload?.codexAvailable === true, `local Codex CLI should be available: ${JSON.stringify(capability.payload)}`);
assert(typeof capability.payload?.codexVersion === "string" && capability.payload.codexVersion.includes("codex-cli"), "Codex version is missing");
assert(!JSON.stringify(capability.payload).match(/token|api[_-]?key|authorization/iu), "capability payload exposes credential-like fields");

const empty = await jsonRequest("/api/a1-codex-director", {
  method: "POST",
  body: JSON.stringify({ title: "空文稿", sourceText: "" }),
});
assert(empty.response.status === 400, `empty source must return 400, got ${empty.response.status}`);
assert(empty.payload?.contract === "A1CodexArticleDirectorResponse/v1", `wrong error contract: ${JSON.stringify(empty.payload)}`);

const compiled = await jsonRequest("/api/a1-codex-director", {
  method: "POST",
  body: JSON.stringify({
    title: "来源素材准备测试",
    sourceText: "团队先理解整篇文章，再判断每个镜头需要什么。真正可靠的成片必须让来源和画面一起接受审核。",
    sourceUrl: "https://example.test/article",
  }),
});
assert(compiled.response.ok && compiled.payload?.ok, `compiled request failed: ${compiled.response.status} ${JSON.stringify(compiled.payload)}`);
assert(compiled.payload?.assetDiscovery?.contract === "A1AutomaticAssetCandidateDiscovery/v1", "compiled response is missing automatic asset discovery contract");
assert(["completed", "partial", "not-needed", "unavailable", "source-required"].includes(compiled.payload?.assetDiscovery?.status), `invalid asset discovery status: ${JSON.stringify(compiled.payload?.assetDiscovery)}`);
assert(compiled.payload?.state?.assetCount === compiled.payload?.state?.assets?.length, "compiled state asset count diverged");
assert(compiled.payload?.props?.items?.length === compiled.payload?.beats?.length, "compiled timeline and beat counts diverged");

const manualRouteSource = fs.readFileSync("apps/studio-next/src/app/api/a1-actions/discover-compiled-assets/route.ts", "utf8");
assert(manualRouteSource.includes("discoverAutomaticAssetCandidates"), "manual discovery route does not use the shared candidate module");

const directorRouteSource = fs.readFileSync("apps/studio-next/src/app/api/a1-codex-director/route.ts", "utf8");
assert(/timeoutMs:\s*20_000/u.test(directorRouteSource), "article compilation must give a cold source page the full 20 second discovery budget");
assert(directorRouteSource.includes("hasVerifiedMaterialEffectAnchor"), "automatic adoption must fail closed when a candidate lacks the effect carrier anchor");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1CodexArticleDirectorApiTest/v1",
  capability: capability.payload,
  assetDiscovery: compiled.payload.assetDiscovery,
}, null, 2));
