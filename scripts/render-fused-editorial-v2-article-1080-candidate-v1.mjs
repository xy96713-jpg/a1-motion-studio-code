#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const sharp = rendererRequire("sharp");
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const requested = process.argv.find((arg) => arg.startsWith("--article-id="))?.split("=")[1] || "nasa-solar-eclipse-photography";
const phaseId = `article-${requested}-fused-editorial-v2-v1`;
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file); };
const report = read(path.join(publicDir, "report.json"));
const designs = read(path.join(publicDir, "layered-shot-designs.json")).designs;
const board = read(path.join(publicDir, "design-board-manifest.json"));
const motionLedger = read(path.join(publicDir, "540p-review-decisions.json"));
if (report.status !== "ARTICLE_540P_APPROVED_BY_DELEGATE" || motionLedger.status !== "ARTICLE_540P_APPROVED_BY_DELEGATE" || board.summary.approvedCount !== designs.length) throw new Error("article-1080-blocked-until-540p-approval");
if (designs.length < 4) throw new Error("article-1080-needs-complete-shot-sequence");

async function contactSheet(files, output) {
  const width = 640; const height = 360; const labelHeight = 36; const columns = 3; const rows = Math.ceil(files.length / columns); const composites = [];
  for (const [index, file] of files.entries()) {
    const left = (index % columns) * width; const top = Math.floor(index / columns) * (height + labelHeight);
    composites.push({input: await sharp(file.path).resize(width, height, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111315"/><text x="12" y="25" fill="#f2efe7" font-family="Arial" font-size="16">${file.shotId} · ${file.frame}</text></svg>`), left, top: top + height});
  }
  await sharp({create: {width: columns * width, height: rows * (height + labelHeight), channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 92}).toFile(output);
}

const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const inputProps = {designs, shotDurationInFrames: 90};
const candidatePath = path.join(artifactDir, "formal-1080-candidate.mp4");
const publicCandidatePath = path.join(publicDir, "formal-1080-candidate.mp4");
const stills = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1FusedEditorialV2MotionProof", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  const indices = [...new Set([0, Math.floor(designs.length / 2), designs.length - 1])];
  for (const index of indices) {
    for (const frame of [14, 54, 78]) {
      const name = `formal-${String(index + 1).padStart(2, "0")}-${designs[index].shotId}-${frame === 14 ? "enter" : frame === 54 ? "hold" : "exit"}.png`;
      const output = path.join(artifactDir, "formal-1080-stills", name); const publicOutput = path.join(publicDir, "formal-1080-stills", name);
      fs.mkdirSync(path.dirname(output), {recursive: true}); fs.mkdirSync(path.dirname(publicOutput), {recursive: true});
      await renderStill({serveUrl, composition, inputProps, frame: index * 90 + frame, output, imageFormat: "png", scale: 1, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      fs.copyFileSync(output, publicOutput); stills.push({shotId: designs[index].shotId, frame: frame === 14 ? "enter" : frame === 54 ? "hold" : "exit", path: output, publicUrl: `/generated/system-line/${phaseId}/formal-1080-stills/${name}`});
    }
  }
  await renderMedia({serveUrl, composition, inputProps, frameRange: [0, designs.length * 90 - 1], outputLocation: candidatePath, scale: 1, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 90, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
} finally { await browser.close({silent: true}); }
fs.copyFileSync(candidatePath, publicCandidatePath);
const contactPath = path.join(artifactDir, "formal-1080-contact-sheet.jpg"); const publicContactPath = path.join(publicDir, "formal-1080-contact-sheet.jpg");
await contactSheet(stills, contactPath); fs.copyFileSync(contactPath, publicContactPath);
const candidateReport = {contract: "A1FusedEditorialV2ArticleFormal1080CandidateReport/v1", phaseId, article: report.article, source: {designBoardSha256: sha256(path.join(publicDir, "design-board-manifest.json")), motionPlanSha256: report.motionPlanSha256 || null, shotCount: designs.length}, video: {publicUrl: `/generated/system-line/${phaseId}/formal-1080-candidate.mp4`, path: path.relative(root, candidatePath).split(path.sep).join("/"), sha256: sha256(candidatePath), width: 1920, height: 1080, fps: 30, frameCount: designs.length * 90}, stills, contactSheet: {publicUrl: `/generated/system-line/${phaseId}/formal-1080-contact-sheet.jpg`, sha256: sha256(contactPath)}, reviewOnly: true, status: "READY_FOR_EXPLICIT_1080_REVIEW", nextAction: "review-formal-1080-contact-sheet-and-approve-explicitly"};
write(path.join(artifactDir, "formal-1080-candidate-report.json"), candidateReport); write(path.join(publicDir, "formal-1080-candidate-report.json"), candidateReport);
console.log(JSON.stringify(candidateReport, null, 2));
