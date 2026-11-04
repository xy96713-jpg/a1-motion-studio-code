#!/usr/bin/env node
import {createHash} from "node:crypto";
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererRoot, "node_modules", ".bin", "remotion");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/motion-template-pack-v1-visual-preview");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/motion-template-pack-v1-visual-preview");
const rendererAssetDir = path.join(rendererRoot, "public/assets/motion-template-pack-v1");
const abstractSource = path.join(root, ".codex-artifacts/system-progress-system-line/visual-sourcing-smoke/abstract-route-v3/article-abstract-1-6703f48f-locator.png");
const abstractDest = path.join(rendererAssetDir, "article-abstract-1-6703f48f-locator.png");
const compositionId = "A1MotionTemplatePackPreview";
const previewProps = {
  scenes: [
    {
      templateId: "article-abstract-crop",
      headline: "摘要不是配图，是证据块",
      supportingText: "中文解释保持本地可编辑；原文截图只承担来源证据。",
      evidenceQuote: "at least 10% of 2024 abstracts were processed with LLMs",
    },
    {
      templateId: "official-brand-card",
      headline: "官方标识只能来自官方来源",
      supportingText: "品牌镜头只接入已验证的本地官方素材。",
      primaryEntity: "DeepSeek",
      secondaryEntity: "Kimi",
      evidenceQuote: "官方来源",
    },
    {
      templateId: "compare-split",
      headline: "不是堆模板，而是语义选择",
      rejectedText: "随机换动效，看起来很忙",
      selectedText: "证据 / 解释 / 文字 各走自己的模板",
      verdict: "模板由语义决定",
    },
  ],
};

mkdirSync(artifactDir, {recursive: true});
mkdirSync(publicDir, {recursive: true});
mkdirSync(rendererAssetDir, {recursive: true});
writeFileSync(path.join(artifactDir, "preview-props.json"), `${JSON.stringify(previewProps, null, 2)}\n`);

if (!existsSync(abstractSource)) {
  throw new Error(`missing abstract source evidence image: ${abstractSource}`);
}
copyFileSync(abstractSource, abstractDest);

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

if (process.argv.includes("--creative-core-canary")) {
  const phaseId = "representative-creative-core-motion-canary-v1";
  const canaryArtifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
  const canaryPublicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
  const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
  const currentPhaseFile = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
  const ed10Proof = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/ed10-direction-c-eva-editable-layer-v1/actual-pixel-proof.png");
  const workspaceBefore = sha256(workspaceFile);
  const phaseBefore = sha256(currentPhaseFile);
  const workspace = JSON.parse(readFileSync(workspaceFile, "utf8"));
  if (workspace.production?.ed10LookMasterCandidateAuthority?.typographyRoute?.actualPixelProof?.sha256 !== sha256(ed10Proof)) throw new Error("creative-core-canary-ed10-proof-binding-invalid");
  mkdirSync(canaryArtifactDir, {recursive: true}); mkdirSync(canaryPublicDir, {recursive: true});
  copyFileSync(ed10Proof, path.join(rendererAssetDir, "ed10-direction-c-actual-pixel-proof.png"));
  const props = {scenes: [
    {templateId: "article-abstract-crop", headline: "研究结论必须回到原文", supportingText: "真实来源是画面主体；中文解释只做本地可编辑标记。", evidenceQuote: "较新的 instruction-tuned 模型呈现更低的语言多样性", evidenceAssetPath: "assets/motion-template-pack-v1/article-abstract-1-6703f48f-locator.png"},
    {templateId: "quote-pull", headline: "完成度很高的废稿", evidenceAssetPath: "assets/motion-template-pack-v1/ed10-direction-c-actual-pixel-proof.png"},
    {templateId: "conclusion-echo", headline: "服务端不会替你写入审批", echo: "页面加载、刷新或播放样片，都不能改变人工门禁。"},
  ]};
  const propsFile = path.join(canaryArtifactDir, "input-props.json");
  writeFileSync(propsFile, `${JSON.stringify(props, null, 2)}\n`);
  const phaseContractBody = {contract: "A1SystemProgressPhaseContract/v1", phaseId, status: "authorized", objective: "用三个连续镜头验证创作核心的来源证据、ED-10 精确文字裁决与安静收束动效语法。", authorization: {kind: "EXPLICIT_USER_APPROVAL", quote: "确认 批准了", workspaceSha256: workspace.workspaceSha256}, scope: {shotCount: 3, width: 960, height: 540, fps: 30, durationFrames: 270, assemblyAllowed: false, resolveAllowed: false, releaseAllowed: false}, sourceBindings: {workspaceSha256: workspace.workspaceSha256, ed10ActualPixelProofSha256: sha256(ed10Proof), abstractEvidenceSha256: sha256(abstractSource)}, createdAt: new Date().toISOString()};
  const contractHash = createHash("sha256").update(JSON.stringify(phaseContractBody)).digest("hex");
  writeFileSync(path.join(canaryArtifactDir, "phase-contract.json"), `${JSON.stringify({...phaseContractBody, contractSha256: contractHash}, null, 2)}\n`);
  const tempRoot = os.mkdtempSync(path.join(os.tmpdir(), "a1-creative-core-canary-"));
  const videoTemp = path.join(tempRoot, "creative-core-motion-canary-960x540.mp4");
  const run = (args, label) => { const result = spawnSync(remotionBin, args, {cwd: rendererRoot, encoding: "utf8", maxBuffer: 8_000_000}); if (result.status !== 0) throw new Error(`${label}:${result.stderr.slice(-2400)}`); };
  run(["render", compositionId, videoTemp, "--scale", "0.5", "--props", propsFile, "--codec", "h264", "--overwrite"], "creative-core-canary-render-failed");
  const sampleFrames = [54, 144, 234];
  const stills = sampleFrames.map((frame, index) => { const file = path.join(tempRoot, `0${index + 1}-frame-${frame}.png`); run(["still", compositionId, file, "--frame", String(frame), "--scale", "0.5", "--props", propsFile, "--overwrite"], `creative-core-canary-still-failed:${frame}`); return file; });
  const labels = ["SOURCE SAFETY / STANDARD", "ED-10 EXACT COPY / HERO", "QUIET RESOLUTION"];
  const composites = [];
  for (const [index, still] of stills.entries()) {
    const image = await sharp(still).resize(480, 270).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="48"><rect width="100%" height="100%" fill="#111314"/><text x="16" y="31" font-family="Arial" font-size="17" font-weight="700" fill="#efe8d5">${labels[index]}</text></svg>`);
    composites.push({input: image, left: index * 480, top: 0}, {input: label, left: index * 480, top: 270});
  }
  const sheetTemp = path.join(tempRoot, "creative-core-motion-canary-contact-sheet.png");
  await sharp({create: {width: 1440, height: 318, channels: 4, background: "#111314"}}).composite(composites).png().toFile(sheetTemp);
  const outputs = {video: {file: path.basename(videoTemp), sha256: sha256(videoTemp), width: 960, height: 540, fps: 30, durationFrames: 270}, contactSheet: {file: path.basename(sheetTemp), sha256: sha256(sheetTemp), width: 1440, height: 318}, stills: stills.map((file, index) => ({file: path.basename(file), frame: sampleFrames[index], sha256: sha256(file), width: 960, height: 540}))};
  for (const destination of [canaryArtifactDir, canaryPublicDir]) { copyFileSync(videoTemp, path.join(destination, outputs.video.file)); copyFileSync(sheetTemp, path.join(destination, outputs.contactSheet.file)); for (const still of stills) copyFileSync(still, path.join(destination, path.basename(still))); writeFileSync(path.join(destination, "input-props.json"), `${JSON.stringify(props, null, 2)}\n`); }
  const reportBody = {contract: "A1CreativeCoreMotionCanary/v1", status: "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW", phaseId, generatedAt: new Date().toISOString(), source: phaseContractBody.sourceBindings, coverage: [{shot: 1, role: "source-safety-standard", templateId: "article-abstract-crop"}, {shot: 2, role: "hero-exact-copy-risk", templateId: "quote-pull"}, {shot: 3, role: "quiet-resolution", templateId: "conclusion-echo"}], outputs, boundaries: {candidateOnly: true, userApprovalNotImplied: true, workspaceMutationPerformed: false, currentPhaseMutationPerformed: false, assemblyPerformed: false, resolvePerformed: false, finalRenderPerformed: false, productionAdmission: false}};
  const report = {...reportBody, reportSha256: createHash("sha256").update(JSON.stringify(reportBody)).digest("hex")};
  for (const destination of [canaryArtifactDir, canaryPublicDir]) writeFileSync(path.join(destination, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (sha256(workspaceFile) !== workspaceBefore || sha256(currentPhaseFile) !== phaseBefore) throw new Error("creative-core-canary-authority-mutated");
  console.log(JSON.stringify({status: report.status, reportSha256: report.reportSha256, outputs, boundaries: report.boundaries, artifactRoot: path.relative(root, canaryArtifactDir), publicRoot: path.relative(root, canaryPublicDir)}, null, 2));
  process.exit(0);
}

const frames = [
  {templateId: "article-abstract-crop", frame: 54, file: "01-article-abstract-crop.png"},
  {templateId: "official-brand-card", frame: 144, file: "02-official-brand-card.png"},
  {templateId: "compare-split", frame: 234, file: "03-compare-split.png"},
];

function renderStill(frameRecord) {
  return new Promise((resolve, reject) => {
    const output = path.join(artifactDir, frameRecord.file);
    const args = [
      "still",
      compositionId,
      output,
      "--frame",
      String(frameRecord.frame),
      "--scale",
      "0.5",
      "--props",
      path.join(artifactDir, "preview-props.json"),
      "--overwrite",
    ];
    const child = spawn(remotionBin, args, {cwd: rendererRoot, stdio: ["ignore", "pipe", "pipe"]});
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`remotion still failed for ${frameRecord.templateId}: exit ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

const rendered = [];
for (const frame of frames) {
  const output = await renderStill(frame);
  const publicOutput = path.join(publicDir, frame.file);
  copyFileSync(output, publicOutput);
  const meta = await sharp(output).metadata();
  const stats = await sharp(output).removeAlpha().resize(192, 108, {fit: "fill"}).stats();
  const luminance = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  rendered.push({
    ...frame,
    artifactPath: path.relative(root, output),
    publicPath: path.relative(root, publicOutput),
    sha256: sha256(output),
    width: meta.width,
    height: meta.height,
    averageLuminance: Number(luminance.toFixed(3)),
  });
}

const tileWidth = 480;
const tileHeight = 270;
const labelHeight = 58;
const composites = [];
for (const [index, item] of rendered.entries()) {
  const image = await sharp(path.join(root, item.artifactPath)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#efe8d5"/>
    <rect x="0" y="0" width="100%" height="3" fill="#105CFF"/>
    <text x="18" y="36" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#161716">${item.templateId}</text>
  </svg>`);
  composites.push({input: image, left: index * tileWidth, top: 0});
  composites.push({input: label, left: index * tileWidth, top: tileHeight});
}
const contactSheet = path.join(artifactDir, "motion-template-pack-v1-contact-sheet.png");
await sharp({create: {width: tileWidth * rendered.length, height: tileHeight + labelHeight, channels: 4, background: "#efe8d5"}}).composite(composites).png().toFile(contactSheet);
const publicContactSheet = path.join(publicDir, "motion-template-pack-v1-contact-sheet.png");
copyFileSync(contactSheet, publicContactSheet);

const report = {
  contract: "A1MotionTemplatePackVisualPreview/v1",
  status: "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  compositionId,
  previewPropsPath: path.relative(root, path.join(artifactDir, "preview-props.json")),
  sourceEvidence: {
    abstractSource: path.relative(root, abstractSource),
    rendererAsset: path.relative(root, abstractDest),
    abstractSha256: sha256(abstractDest),
  },
  frames: rendered,
  contactSheet: {
    artifactPath: path.relative(root, contactSheet),
    publicPath: path.relative(root, publicContactSheet),
    sha256: sha256(contactSheet),
  },
};
writeFileSync(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(publicDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  contract: report.contract,
  frames: rendered.map((item) => ({templateId: item.templateId, publicPath: item.publicPath})),
  contactSheet: report.contactSheet.publicPath,
  reportPath: path.relative(root, path.join(artifactDir, "report.json")),
  publicReportPath: path.relative(root, path.join(publicDir, "report.json")),
}, null, 2));
