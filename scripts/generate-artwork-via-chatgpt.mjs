#!/usr/bin/env node
/**
 * generate-artwork-via-chatgpt.mjs
 *
 * 通过 AppleScript 控制真实 Chrome 浏览器中的 ChatGPT 对话，
 * 批量发送生图 prompt，等待生成完成，下载图片到项目目录。
 *
 * 用法:
 *   node scripts/generate-artwork-via-chatgpt.mjs [options]
 *
 * Options:
 *   --prompts-dir <path>   prompt 文件目录 (默认: .codex-artifacts/.../prompts/)
 *   --chat-url <substr>    ChatGPT 对话 URL 匹配子串 (默认: 6a58993b)
 *   --output-dir <path>    输出目录 (默认: public/assets/generated-artwork/)
 *   --batch-size <n>       每批发送的 prompt 数量 (默认: 5, 0=全部一次发)
 *   --poll-interval <sec>  轮询间隔秒数 (默认: 30)
 *   --max-wait <sec>       最大等待秒数 (默认: 600)
 *   --dry-run              只打印 prompt 不发送
 *   --no-refresh-plan      不在读取 prompt 前刷新当前审片账本对应的执行计划
 *
 * 前置条件:
 *   1. Chrome 已打开目标 ChatGPT 对话
 *   2. Chrome → 显示 → 开发者 → 允许 Apple 事件中的 JavaScript 已勾选
 */

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import sharp from "sharp";

// ── Config ──────────────────────────────────────────────────────────────
const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_PROMPTS_DIR = join(
  PROJECT_ROOT,
  ".codex-artifacts/system-progress-system-line/h-series-generated-editorial-artwork-execution-plan-v1/prompts"
);
const DEFAULT_OUTPUT_DIR = join(
  PROJECT_ROOT,
  "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-repair-v1"
);
const DEFAULT_PLAN_PATH = join(
  PROJECT_ROOT,
  ".codex-artifacts/system-progress-system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json"
);
const DEFAULT_CHAT_URL_SUBSTR = "6a58993b";
const DOWNLOADS_DIR = join(process.env.HOME, "Downloads");
const REPAIR_RESULT_PHASE_ID = "h-series-generated-artwork-repair-result-v1";

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1];
}
const hasFlag = (name) => args.includes(`--${name}`);

const promptsDir = getArg("prompts-dir", DEFAULT_PROMPTS_DIR);
const planPath = getArg("plan", DEFAULT_PLAN_PATH);
const chatUrlSubstr = getArg("chat-url", DEFAULT_CHAT_URL_SUBSTR);
const outputDir = getArg("output-dir", DEFAULT_OUTPUT_DIR);
const batchSize = parseInt(getArg("batch-size", "5"), 10);
const pollInterval = parseInt(getArg("poll-interval", "30"), 10) * 1000;
const maxWait = parseInt(getArg("max-wait", "600"), 10) * 1000;
const dryRun = hasFlag("dry-run");
const noRefreshPlan = hasFlag("no-refresh-plan");

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// ── Helpers ─────────────────────────────────────────────────────────────

function runAppleScript(js, timeoutMs = 15000) {
  const escaped = js.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${chatUrlSubstr}" then
        return execute t javascript "${escaped}"
      end if
    end repeat
  end repeat
  return "TAB_NOT_FOUND"
end tell`;
  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: timeoutMs,
      encoding: "utf-8",
    }).trim();
    return result;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString("zh-CN")}] ${msg}`);
}

// ── Step 1: Load prompts ────────────────────────────────────────────────

function loadPrompts() {
  if (!existsSync(planPath)) throw new Error(`执行计划不存在: ${planPath}`);
  const plan = JSON.parse(readFileSync(planPath, "utf-8"));
  const jobs = Array.isArray(plan.jobs) ? plan.jobs : [];
  if (plan.contract !== "A1HSeriesGeneratedArtworkExecutionPlan/v1" || jobs.length === 0) {
    throw new Error("执行计划无效或没有待生成 job");
  }
  if (plan.generationDispatchAllowed !== true || plan.summary?.allGenerationJobsUserApproved !== true) {
    throw new Error(`生图被审片闸门阻断: ${plan.nextAction || "先完成逐镜视觉决定"}`);
  }
  const jobsByFile = new Map(jobs.map((job) => [basename(job.promptArtifactPath || ""), job]));
  const files = readdirSync(promptsDir)
    .filter((f) => f.endsWith(".txt"))
    .filter((f) => jobsByFile.has(f))
    .sort();
  if (files.length === 0) {
    console.error(`No .txt files found in ${promptsDir}`);
    process.exit(1);
  }
  if (files.length !== jobs.length) {
    throw new Error(`执行计划与 prompt 文件数量不一致: plan=${jobs.length}, files=${files.length}`);
  }
  return files.map((f) => {
    const content = readFileSync(join(promptsDir, f), "utf-8").trim();
    const job = jobsByFile.get(f);
    if (job.promptSha256 && sha256Text(content) !== job.promptSha256) {
      throw new Error(`prompt hash mismatch: ${f}`);
    }
    const promptInstructionText = content.split(/\nForbidden:/u, 1)[0];
    if (/wireframe|grid lines|construction lines|dashed guide lines|crosshairs/iu.test(promptInstructionText)) {
      throw new Error(`prompt policy blocked: ${f}; rebuild the execution plan before generation`);
    }
    // Extract beat ID from first line: "Beat: H03-B02."
    const beatMatch = content.match(/Beat:\s*([\w-]+)/);
    const beat = beatMatch ? beatMatch[1] : basename(f, ".txt");
    // Extract concept
    const conceptMatch = content.match(/Concept:\s*([^.]+)/);
    const concept = conceptMatch ? conceptMatch[1].trim() : beat;
    const outputName = basename(job.output?.localPath || `${beat}-repair.png`);
    return {file: f, beat, concept, content, outputName, job};
  });
}

function refreshExecutionPlanIfRequested() {
  if (noRefreshPlan || resolve(planPath) !== resolve(DEFAULT_PLAN_PATH)) return;
  const builder = join(PROJECT_ROOT, "scripts/build-h-series-generated-artwork-execution-plan-v1.mjs");
  if (!existsSync(builder)) throw new Error(`执行计划刷新器不存在: ${builder}`);
  log("刷新当前审片账本绑定的配图执行计划…");
  try {
    execFileSync(process.execPath, [builder], {cwd: PROJECT_ROOT, encoding: "utf8", stdio: "inherit"});
  } catch (error) {
    throw new Error(`执行计划刷新失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Step 2: Build batch message ─────────────────────────────────────────

function buildBatchMessage(prompts, startIndex, count) {
  const batch = prompts.slice(startIndex, startIndex + count);
  if (batch.length === 1) {
    // Single prompt — send as-is but add output spec
    return `${batch[0].content}\n\n输出：1536x864、16:9 PNG；不要输出正方形。`;
  }
  // Multiple prompts — merge into one message
  const lines = [
    `请一次性生成以下 ${batch.length} 张无文字编辑插画，每张 1536x864、16:9。`,
    `统一风格：H系列复古印刷档案拼贴——暖白纸底(#f2efe7)、炭墨实体块面、复印颗粒感、切纸与压印层次、仅用电光钴蓝(#2848a8)做语义方向标记。大量留白用于叠加中文排版。不要文字、不要UI、不要logo。`,
    "",
  ];
  batch.forEach((p, i) => {
    lines.push(`${i + 1}. [${p.beat}] ${p.concept}`);
  });
  return lines.join("\n");
}

// ── Step 3: Send to ChatGPT ─────────────────────────────────────────────

function sendToChatGPT(message) {
  const js = `(function(){
    var el = document.querySelector("#prompt-textarea");
    if(!el) return "NO_INPUT";
    el.focus();
    el.innerText = ${JSON.stringify(message)};
    el.dispatchEvent(new Event("input", {bubbles: true}));
    setTimeout(function(){
      el.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", code:"Enter", keyCode:13, which:13, bubbles:true, cancelable:true}));
    }, 300);
    return "SENT";
  })()`;
  return runAppleScript(js);
}

// ── Step 4: Wait for generation ─────────────────────────────────────────

async function waitForGeneration(minimumWideImageCount = 0) {
  const start = Date.now();
  let lastCount = 0;
  let stableTicks = 0;

  while (Date.now() - start < maxWait) {
    const js = `(function(){
      var stop = document.querySelector("[data-testid=\\"stop-button\\"], button[aria-label*=\\"Stop\\"], button[aria-label*=\\"停止\\"]");
      var imgs = document.querySelectorAll("img[alt*=\\"已生成图片\\"]");
      var wide = 0;
      for(var i=0;i<imgs.length;i++){
        var ratio = imgs[i].naturalHeight ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0;
        if(imgs[i].naturalWidth >= 1200 && imgs[i].naturalHeight >= 675 && ratio > 1.6 && ratio < 1.9) wide++;
      }
      return JSON.stringify({generating: !!stop, wideCount: wide});
    })()`;
    const raw = runAppleScript(js, 10000);
    let status;
    try {
      status = JSON.parse(raw);
    } catch {
      log(`⚠ 解析状态失败: ${raw}`);
      await sleep(pollInterval);
      continue;
    }

    log(`生成中: ${status.generating ? "是" : "否"} | 16:9 图: ${status.wideCount}`);

    if (!status.generating && status.wideCount > minimumWideImageCount) {
      if (status.wideCount === lastCount) {
        stableTicks++;
        if (stableTicks >= 2) {
          log("✓ 生成完成（连续 2 次无变化）");
          return status.wideCount;
        }
      } else {
        stableTicks = 0;
      }
      lastCount = status.wideCount;
    } else if (status.generating) {
      stableTicks = 0;
      lastCount = status.wideCount;
    }

    await sleep(pollInterval);
  }

  log("⚠ 超时，继续尝试下载已有 16:9 图片");
  return lastCount;
}

// ── Step 5: Extract & download images ───────────────────────────────────

function extractImageUrls() {
  const js = `(function(){
    var imgs = document.querySelectorAll("img[alt*=\\"已生成图片\\"]");
    var seen = {};
    var urls = [];
    for(var i=0;i<imgs.length;i++){
      var ratio = imgs[i].naturalHeight ? imgs[i].naturalWidth / imgs[i].naturalHeight : 0;
      if(imgs[i].naturalWidth >= 1200 && imgs[i].naturalHeight >= 675 && ratio > 1.6 && ratio < 1.9){
        var src = imgs[i].src;
        var id = src.match(/id=([^&]+)/);
        var key = id ? id[1] : src;
        if(!seen[key]){ seen[key] = true; urls.push(src); }
      }
    }
    return JSON.stringify(urls);
  })()`;
  const raw = runAppleScript(js, 10000);
  try {
    return JSON.parse(raw);
  } catch {
    log(`⚠ 提取 URL 失败: ${raw}`);
    return [];
  }
}

function triggerBrowserDownload(urls, names) {
  const urlArr = JSON.stringify(urls);
  const nameArr = JSON.stringify(names);
  const js = `(function(){
    var urls = ${urlArr};
    var names = ${nameArr};
    for(var i=0;i<urls.length;i++){
      var a = document.createElement("a");
      a.href = urls[i];
      a.download = names[i];
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    return "DOWNLOADING_" + urls.length;
  })()`;
  return runAppleScript(js, 15000);
}

async function waitForDownloads(count, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(5000);
    try {
      const crdownloads = execSync(
        `find "${DOWNLOADS_DIR}" -name "*.crdownload" -mmin -3 2>/dev/null | wc -l`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      const pngs = execSync(
        `find "${DOWNLOADS_DIR}" -name "*.png" -mmin -3 2>/dev/null | wc -l`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      log(`下载中: ${pngs} 完成, ${crdownloads} 进行中`);
      if (parseInt(crdownloads) === 0 && parseInt(pngs) > 0) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function collectDownloadedFiles(expectedNames = []) {
  if (expectedNames.length) {
    return expectedNames
      .map((name) => join(DOWNLOADS_DIR, name))
      .filter((file) => existsSync(file));
  }
  try {
    const files = execSync(
      `find "${DOWNLOADS_DIR}" -name "*.png" -mmin -5 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    return files;
  } catch {
    return [];
  }
}

async function writeRepairResultManifest(prompts) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const assets = [];
  for (const prompt of prompts) {
    const job = plan.jobs.find((candidate) => candidate.beatId === prompt.beat);
    if (!job?.output?.localPath || !job.output.publicUrl) throw new Error(`执行计划缺少输出绑定: ${prompt.beat}`);
    const file = join(PROJECT_ROOT, job.output.localPath);
    if (!existsSync(file)) throw new Error(`生成结果文件缺失: ${file}`);
    const metadata = await sharp(file).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (width < 1200 || height < 675 || width / height < 1.6 || width / height > 1.9) {
      throw new Error(`生成结果不是合格 16:9 素材: ${prompt.beat} ${width}x${height}`);
    }
    assets.push({
      beatId: prompt.beat,
      screenText: job.screenText,
      promptSha256: job.promptSha256,
      promptArtifactPath: job.promptArtifactPath,
      publicUrl: job.output.publicUrl,
      localPath: job.output.localPath,
      sha256: sha256File(file),
      dimensions: {width, height},
      reviewStatus: "pending-visual-review",
      renderAllowedBeforeApproval: false,
      factualEvidenceAllowed: false,
      rendererAdoptionAllowed: false,
    });
  }
  const report = {
    contract: "A1HSeriesGeneratedArtworkRepairResultManifest/v1",
    phaseId: REPAIR_RESULT_PHASE_ID,
    status: "GENERATED_PENDING_VISUAL_REVIEW",
    generatedAt: new Date().toISOString(),
    reviewOnly: true,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    rendererAdoptionAllowed: false,
    source: {
      executionPlanPath: planPath,
      executionPlanSha256: sha256File(planPath),
    },
    summary: {
      expectedCount: prompts.length,
      generatedCount: assets.length,
      pendingVisualReviewCount: assets.length,
      reviewedApprovedCount: 0,
      allAssetsLocalToSystemLine: assets.every((asset) => asset.localPath.startsWith("apps/studio-next/public/generated/system-line/")),
      allAssetsPromptBound: assets.every((asset) => /^[a-f0-9]{64}$/u.test(asset.promptSha256 || "")),
      allAssetsReviewBlocked: assets.every((asset) => asset.renderAllowedBeforeApproval === false && asset.rendererAdoptionAllowed === false),
      allAssetsNonEvidence: assets.every((asset) => asset.factualEvidenceAllowed === false),
    },
    assets,
    nextAction: "review-generated-artwork-assets-before-render-or-adoption",
  };
  const artifactRoot = join(PROJECT_ROOT, ".codex-artifacts/system-progress-system-line", REPAIR_RESULT_PHASE_ID);
  const publicRoot = join(PROJECT_ROOT, "apps/studio-next/public/generated/system-line", REPAIR_RESULT_PHASE_ID);
  mkdirSync(artifactRoot, {recursive: true});
  mkdirSync(publicRoot, {recursive: true});
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(artifactRoot, "report.json"), json);
  writeFileSync(join(publicRoot, "report.json"), json);
  return report;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  log("=== GPT 生图工作流 ===");
  log(`Prompts: ${promptsDir}`);
  log(`Plan:    ${planPath}`);
  log(`Output:  ${outputDir}`);
  log(`Chat URL match: ${chatUrlSubstr}`);

  refreshExecutionPlanIfRequested();

  // Load prompts
  const prompts = loadPrompts();
  log(`✓ 加载 ${prompts.length} 个 prompt`);

  if (dryRun) {
    log("── DRY RUN ──");
    const size = batchSize || prompts.length;
    for (let i = 0; i < prompts.length; i += size) {
      const msg = buildBatchMessage(prompts, i, size);
      log(`\nBatch ${Math.floor(i / size) + 1} (${Math.min(size, prompts.length - i)} prompts):\n${msg}\n`);
    }
    return;
  }

  // Verify Chrome tab is accessible only after the local plan gate passes.
  const check = runAppleScript(`(function(){ return document.querySelector("#prompt-textarea") ? "OK" : "NO_INPUT"; })()`);
  if (check !== "OK") {
    console.error(`✗ 无法访问 ChatGPT 输入框 (result: ${check})`);
    console.error("  确认: 1) Chrome 已打开目标对话  2) 已启用 Apple 事件 JavaScript");
    process.exit(1);
  }
  log("✓ Chrome 连接正常");

  mkdirSync(outputDir, { recursive: true });
  const newImageUrls = [];

  // Send in batches
  const size = batchSize || prompts.length;
  for (let i = 0; i < prompts.length; i += size) {
    const batchNum = Math.floor(i / size) + 1;
    const totalBatches = Math.ceil(prompts.length / size);
    const msg = buildBatchMessage(prompts, i, size);
    const beforeBatchUrls = extractImageUrls();

    log(`\n── Batch ${batchNum}/${totalBatches} (${Math.min(size, prompts.length - i)} prompts) ──`);
    const sendResult = sendToChatGPT(msg);
    if (sendResult !== "SENT") {
      console.error(`✗ 发送失败: ${sendResult}`);
      process.exit(1);
    }
    log("✓ 已发送，等待生成...");

    const count = await waitForGeneration(beforeBatchUrls.length);
    const afterBatchUrls = extractImageUrls();
    const beforeSet = new Set(beforeBatchUrls);
    const batchUrls = afterBatchUrls.filter((url) => !beforeSet.has(url));
    const expectedBatchCount = Math.min(size, prompts.length - i);
    if (batchUrls.length !== expectedBatchCount) {
      throw new Error(`本批新增图片数量不符: expected=${expectedBatchCount}, actual=${batchUrls.length}; 为避免错配，不整理任何输出`);
    }
    newImageUrls.push(...batchUrls);
    log(`本批生成 ${count} 张 16:9 图，新增 ${batchUrls.length} 张`);

    // Wait a bit between batches
    if (i + size < prompts.length) {
      log("等待 10s 后发送下一批...");
      await sleep(10000);
    }
  }

  const urls = newImageUrls;
  log(`\n── 整理本次新增图片：${urls.length} 张 ──`);
  if (urls.length !== prompts.length) throw new Error(`本次生成数量不符: expected=${prompts.length}, actual=${urls.length}`);
  const names = prompts.map((prompt) => prompt.outputName);
  const staleDownloadNames = names.filter((name) => existsSync(join(DOWNLOADS_DIR, name)));
  if (staleDownloadNames.length) throw new Error(`下载目录已有同名旧文件，拒绝错配: ${staleDownloadNames.join(", ")}`);

  // Trigger browser download
  log("触发浏览器下载...");
  const dlResult = triggerBrowserDownload(urls, names);
  log(`下载: ${dlResult}`);

  // Wait for downloads
  await waitForDownloads(urls.length);

  // Move to output dir
  log("\n── 整理文件 ──");
  const downloaded = collectDownloadedFiles(names);
  let moved = 0;
  for (const src of downloaded) {
    const name = basename(src);
    const dest = join(outputDir, name);
    if (existsSync(dest)) throw new Error(`目标文件已存在，拒绝覆盖: ${dest}`);
    copyFileSync(src, dest);
    moved++;
  }
  if (moved !== names.length || names.some((name) => !existsSync(join(outputDir, name)))) {
    throw new Error(`输出整理不完整: expected=${names.length}, moved=${moved}`);
  }
  log(`✓ 移动 ${moved} 个文件到 ${outputDir}`);
  const repairResultManifest = await writeRepairResultManifest(prompts);
  log(`✓ 已写入返修配图结果清单: ${repairResultManifest.status}`);

  // Summary
  const finalFiles = readdirSync(outputDir).filter((f) => f.endsWith(".png"));
  log(`\n=== 完成 ===`);
  log(`输出目录: ${outputDir}`);
  log(`共 ${finalFiles.length} 张图片:`);
  finalFiles.sort().forEach((f) => log(`  ${f}`));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
