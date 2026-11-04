import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";
const mp4Path = path.join(root, "apps", "studio-next", "public", "generated", "studio-next-template-timeline", "article-template-timeline.mp4");
const projectTitle = "任意文章渲染测试";
const compileResponse = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: projectTitle,
    sourceText: "很多人以为写作问题只需要修改提示词。真正的问题是文章没有清晰判断。更可靠的做法是先整理材料和反例。然后把材料分配给开场、问题、方法和依据。最后沉淀成可以反复复用的写作流程。",
  }),
});
const compiled = await compileResponse.json().catch(() => ({}));
if (!compileResponse.ok || !compiled.ok || !compiled.state) {
  console.error(JSON.stringify({ ok: false, stage: "compile", status: compileResponse.status, compiled }, null, 2));
  process.exit(1);
}

const before = await fs.stat(mp4Path);
const response = await fetch(`${rootUrl}/api/a1-actions/render-film`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state: compiled.state, reason: "state-aware-render-integration-test" }),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok || payload.ok !== true || payload.contract !== "A1RenderedFilmRefresh/v1") {
  console.error(JSON.stringify({ ok: false, status: response.status, payload }, null, 2));
  process.exit(1);
}

const report = JSON.parse(await fs.readFile(payload.reportPath, "utf8"));
const after = await fs.stat(report.nextPublicOutputPath);
const mediaResponse = await fetch(`${rootUrl}${payload.publicUrl}`, { cache: "no-store" });
if (
  !Number.isFinite(Number(payload.version))
  || Number(payload.version) !== Math.trunc(after.mtimeMs)
  || after.size <= 0
  || !mediaResponse.ok
  || !String(mediaResponse.headers.get("content-type") || "").startsWith("video/mp4")
  || payload.projectTitle !== projectTitle
  || payload.shotCount !== compiled.state.shots.length
  || report.projectTitle !== projectTitle
  || report.itemCount !== compiled.state.shots.length
  || report.renderConcurrency !== 2
) {
  console.error(JSON.stringify({
    ok: false,
    payload,
    beforeMtimeMs: before.mtimeMs,
    afterMtimeMs: after.mtimeMs,
    size: after.size,
    mediaStatus: mediaResponse.status,
    mediaType: mediaResponse.headers.get("content-type"),
    expectedProjectTitle: projectTitle,
    report,
  }, null, 2));
  process.exit(1);
}

const secondProjectTitle = "第二篇不可覆盖第一篇";
const secondCompileResponse = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: secondProjectTitle,
    sourceText: "第二篇文章用来验证新的渲染不会覆盖第一篇文章。它有自己的标题、镜头和输出地址。最后保留独立成片。",
  }),
});
const secondCompiled = await secondCompileResponse.json().catch(() => ({}));
const secondRenderResponse = await fetch(`${rootUrl}/api/a1-actions/render-film`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state: secondCompiled.state, reason: "immutable-render-url-regression" }),
});
const secondPayload = await secondRenderResponse.json().catch(() => ({}));
if (
  !secondCompileResponse.ok
  || !secondCompiled.ok
  || !secondRenderResponse.ok
  || !secondPayload.ok
  || secondPayload.publicUrl === payload.publicUrl
  || secondPayload.reportPath === payload.reportPath
) {
  console.error(JSON.stringify({
    ok: false,
    stage: "immutable-render-url",
    first: { publicUrl: payload.publicUrl, reportPath: payload.reportPath, projectTitle: payload.projectTitle },
    second: { publicUrl: secondPayload.publicUrl, reportPath: secondPayload.reportPath, projectTitle: secondPayload.projectTitle },
  }, null, 2));
  process.exit(1);
}

const firstReportAfterSecondRender = JSON.parse(await fs.readFile(payload.reportPath, "utf8"));
if (firstReportAfterSecondRender.projectTitle !== projectTitle) {
  console.error(JSON.stringify({
    ok: false,
    stage: "first-render-overwritten",
    expectedProjectTitle: projectTitle,
    firstReportAfterSecondRender,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: payload.contract,
  version: payload.version,
  size: after.size,
  publicUrl: payload.publicUrl,
  reportPath: payload.reportPath,
  projectTitle: payload.projectTitle,
  shotCount: payload.shotCount,
  secondPublicUrl: secondPayload.publicUrl,
}, null, 2));
