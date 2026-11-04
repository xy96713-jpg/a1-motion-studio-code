import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";
const shotId = process.env.A1_RENDER_TEST_SHOT_ID || "shot-02";
const outputPath = path.join(
  root,
  "apps",
  "studio-next",
  "public",
  "generated",
  "studio-next-shot-proxy",
  `${shotId}.mp4`,
);

const response = await fetch(`${rootUrl}/api/a1-actions/render-shot`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ shotId }),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok || payload.ok !== true || payload.contract !== "A1RenderedShotProxy/v1") {
  console.error(JSON.stringify({ ok: false, status: response.status, payload }, null, 2));
  process.exit(1);
}

const stat = await fs.stat(outputPath);
const mediaResponse = await fetch(`${rootUrl}${payload.publicUrl}`, { cache: "no-store" });
const expectedPublicUrl = `/generated/studio-next-shot-proxy/${shotId}.mp4`;

if (
  payload.shotId !== shotId
  || payload.publicUrl !== expectedPublicUrl
  || !Number.isFinite(Number(payload.durationSec))
  || Number(payload.durationSec) <= 0
  || !Number.isFinite(Number(payload.version))
  || Number(payload.version) !== Math.trunc(stat.mtimeMs)
  || stat.size <= 0
  || !mediaResponse.ok
  || !String(mediaResponse.headers.get("content-type") || "").startsWith("video/mp4")
) {
  console.error(JSON.stringify({
    ok: false,
    payload,
    outputPath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mediaStatus: mediaResponse.status,
    mediaType: mediaResponse.headers.get("content-type"),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: payload.contract,
  shotId,
  version: payload.version,
  durationSec: payload.durationSec,
  size: stat.size,
  publicUrl: payload.publicUrl,
  reportPath: payload.reportPath,
}, null, 2));
