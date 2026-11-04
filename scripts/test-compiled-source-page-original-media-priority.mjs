import assert from "node:assert/strict";

const backendUrl = process.env.A1_BACKEND_URL || "http://127.0.0.1:4288";
const sourceUrl = `${backendUrl}/generated/source-page-original-media-priority-fixture.html`;

const response = await fetch(`${backendUrl}/api/a1-compiled-image-search`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    shotId: "05",
    query: "车辆运动提示 动态圆点 感官冲突",
    sourceText: "车辆运动提示利用屏幕上的动态圆点减少乘车时的感官冲突",
    sourceUrl,
    maxCandidates: 3,
    timeoutMs: 8000,
    usageMode: "personal-noncommercial",
    allowSourcePageScreenshots: true,
  }),
});

const payload = await response.json().catch(() => ({}));
assert.equal(response.ok && payload.ok, true, JSON.stringify(payload));
assert.equal(payload.sourcePageMediaCandidateCount, 3, "all available original page media must be returned before screenshot fallback");
assert.equal(payload.sourcePageScreenshotCandidateCount, 0, "screenshot fallback must not run when original media fills the candidate budget");
assert.equal(payload.candidates.length, 3);
assert(payload.candidates.every((candidate) => candidate.source === "source-page-media"));

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledSourcePageOriginalMediaPriorityTest/v1",
  sourcePageMediaCandidateCount: payload.sourcePageMediaCandidateCount,
  sourcePageScreenshotCandidateCount: payload.sourcePageScreenshotCandidateCount,
}, null, 2));
