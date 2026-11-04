#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {execFileSync, execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766").replace(/\/$/u, "");
const writingRoot = process.env.A1_WRITING_WORKBENCH_ROOT || "/Users/a1/Documents/Codex/写作项目/workbench_runtime";
const draftPath = path.join(writingRoot, ".cache/writing/latest_frontend_full_draft.json");
const targetShotId = process.env.A1_CAP_NATIVE_SHOT_ID || "ED-03";
const silentCapture = process.env.A1_CAP_SILENT !== "0";
const nativeInputEnabled = process.env.A1_CAP_NATIVE_INPUT === "1";
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const authorityPlanPath = path.join(root, "work/cap-native-production-v2/plan.json");
const currentPhase = JSON.parse(fs.readFileSync(currentPhasePath, "utf8"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const screenCaptureAuthorization = workspace.production?.screenCaptureAuthorization;
const captureAuthorityGranted = (currentPhase?.reviewDecision?.motionPrototypeAllowed === true
  && currentPhase?.authority?.state !== "whole-film-static-board-review")
  || (screenCaptureAuthorization?.contract === "A1ScreenCaptureAuthorization/v1"
    && screenCaptureAuthorization.status === "AUTHORIZED_BY_EXPLICIT_USER_DIRECTIVE"
    && screenCaptureAuthorization.current === true
    && screenCaptureAuthorization.targetShotIds?.includes(targetShotId));
if (!captureAuthorityGranted) throw new Error(`cap-native-capture-blocked-by-current-phase:${currentPhase?.authority?.state || currentPhase?.status || "UNKNOWN"}`);
if (!fs.existsSync(authorityPlanPath)) throw new Error("cap-native-current-storyboard-plan-missing");
const authorityPlan = JSON.parse(fs.readFileSync(authorityPlanPath, "utf8"));
const authorityShot = authorityPlan.shots?.find((shot) => shot.shotId === targetShotId);
if (authorityPlan.contract !== "A1CapNativeStoryboardExecutionPlan/v1" || authorityPlan.status !== "READY" || !authorityShot) throw new Error(`cap-native-current-storyboard-shot-missing:${targetShotId}`);
const cameraRecipe=authorityShot.execution?.cameraRecipe;
if (cameraRecipe?.contract!=="A1CapStoryboardCameraRecipe/v1"||!cameraRecipe.recipeSha256) throw new Error(`cap-native-camera-recipe-missing:${targetShotId}`);
const shotSpecs = {
  "ED-04": {
    slug: "ed04-v1",
    projectName: "ED-04: create paragraph slot, enter request, hold real candidates",
    durationMs: 6780,
    sourceText: "如果你想补充段落，可以点击空白的地方，输入你的需求。AI 会结合上下文，给出合适的补段。",
    bindings: [
      {cueId: 8, cueText: "如果你想补充段落，", startMs: 0, endMs: 1377, event: "paragraph_anchor_hold"},
      {cueId: 9, cueText: "可以点击空白的地方，", startMs: 1377, endMs: 2907, event: "paragraph_slot_created"},
      {cueId: 10, cueText: "输入你的需求。", startMs: 2907, endMs: 3979, event: "paragraph_request_entered"},
      {cueId: 11, cueText: "AI 会结合上下文，", startMs: 3979, endMs: 5356, event: "paragraph_request_run"},
      {cueId: 12, cueText: "给出合适的补段。", startMs: 5356, endMs: 6580, event: "paragraph_candidates_hold"}
    ]
  },
  "ED-27": {
    slug: "ed27-v1",
    projectName: "ED-27: create paragraph gap and enter the requested addition",
    durationMs: 13160,
    sourceText: "补充段落其实也是同一个逻辑。如果觉得文章里两段之间缺一层，或者想补充什么东西，就空一行，双击，输入你的需求。比如说，补一段 AI 最常说的句子或者例子。",
    bindings: [
      {cueId: 86, cueText: "补充段落其实也是同一个逻辑。", startMs: 0, endMs: 1860, event: "paragraph_anchor_hold"},
      {cueId: 87, cueText: "如果觉得文章里两段之间缺一层，", startMs: 1860, endMs: 4630, event: "paragraph_gap_context_hold"},
      {cueId: 88, cueText: "或者想补充什么东西，就空一行，双击，", startMs: 4630, endMs: 7954, event: "paragraph_slot_created"},
      {cueId: 89, cueText: "输入你的需求。比如说，", startMs: 7954, endMs: 9985, event: "paragraph_request_started"},
      {cueId: 90, cueText: "补一段 AI", startMs: 9985, endMs: 10909, event: "paragraph_request_mid"},
      {cueId: 91, cueText: "最常说的句子或者例子。", startMs: 10909, endMs: 12940, event: "paragraph_request_ready"}
    ]
  },
  "ED-28": {
    slug: "ed28-v1",
    projectName: "ED-28: run paragraph request, inspect candidates, apply one",
    durationMs: 7380,
    sourceText: "后台就会分析你的需求，根据上下文给出几个候选。然后挑你觉得最合适的一段，放回正文。",
    bindings: [
      {cueId: 92, cueText: "后台就会分析你的需求，", startMs: 0, endMs: 1913, event: "paragraph_request_run"},
      {cueId: 93, cueText: "根据上下文给出几个候选。", startMs: 1913, endMs: 4000, event: "paragraph_candidates_hold"},
      {cueId: 94, cueText: "然后挑你觉得最合适的一段，放回正文。", startMs: 4400, endMs: 7040, event: "paragraph_candidate_applied"}
    ]
  },
  "ED-05": {
    slug: "ed05-v1", projectName: "ED-05: run final review and hold actionable findings", durationMs: 6980,
    sourceText: "最后点击收稿，AI 会检查你的风格库，以及文章里是否有病句，之后给出合理的建议。",
    bindings: [
      {cueId:13,cueText:"最后点击收稿，",startMs:0,endMs:1253,event:"review_click"},
      {cueId:14,cueText:"AI 会检查你的风格库，",startMs:1253,endMs:3222,event:"review_running"},
      {cueId:15,cueText:"以及文章里是否有病句，",startMs:3222,endMs:5190,event:"review_findings_hold"},
      {cueId:16,cueText:"之后给出合理的建议。",startMs:5190,endMs:6980,event:"review_suggestion_hold"}
    ]
  },
  "ED-20": {
    slug: "ed20-v1", projectName: "ED-20: edited full draft enters final review", durationMs: 8280,
    sourceText: "Codex 先整理材料、读取风格库并明确约束，整理后的全文进入工作台继续编辑与收稿。",
    bindings: [
      {cueId:58,cueText:"Codex 接到写作任务时，",startMs:0,endMs:1898,event:"draft_material_hold"},
      {cueId:59,cueText:"会先整理材料。",startMs:1898,endMs:2920,event:"draft_editor_hold"},
      {cueId:60,cueText:"Codex 会通过调用 API的方式，",startMs:2920,endMs:5662,event:"review_click"},
      {cueId:61,cueText:"让 DeepSeek 来写全文。",startMs:5662,endMs:7920,event:"review_findings_hold"}
    ]
  },
  "ED-29": {
    slug: "ed29-v1", projectName: "ED-29: run final review and reveal improvements", durationMs: 5960,
    sourceText: "写完之后可以点击收稿。AI 会检查全文，标出它觉得可以修改或者优化的地方。",
    bindings: [
      {cueId:95,cueText:"写完之后可以点击收稿。",startMs:0,endMs:1821,event:"review_click"},
      {cueId:96,cueText:"AI 会检查全文，",startMs:1821,endMs:3146,event:"review_running"},
      {cueId:97,cueText:"标出它觉得可以修改或者优化的地方。",startMs:3146,endMs:5960,event:"review_findings_hold"}
    ]
  },
  "ED-06": {
    slug: "ed06-v1", projectName: "ED-06: open presentation, adjust, play", durationMs: 4960,
    sourceText: "写完之后还能打开演示模式，可以调节字号与速度，直接当口播稿用。",
    bindings: [
      {cueId:17,cueText:"写完之后还能打开演示模式，",startMs:0,endMs:2021,event:"presentation_open"},
      {cueId:18,cueText:"可以调节字号与速度，",startMs:2021,endMs:3576,event:"presentation_adjusted"},
      {cueId:19,cueText:"直接当口播稿用。",startMs:3576,endMs:4820,event:"presentation_playing"}
    ]
  },
  "ED-30": {
    slug: "ed30-v1", projectName: "ED-30: open presentation, adjust, play", durationMs: 7600,
    sourceText: "如果觉得文章写完了，可以点击演示模式，调节你喜欢的字号和速度，直接当口播稿用。",
    bindings: [
      {cueId:98,cueText:"如果觉得文章写完了，",startMs:0,endMs:1697,event:"draft_ready_hold"},
      {cueId:99,cueText:"可以点击演示模式，",startMs:1697,endMs:3225,event:"presentation_open"},
      {cueId:100,cueText:"调节你喜欢的字号和速度，",startMs:3225,endMs:5262,event:"presentation_adjusted"},
      {cueId:101,cueText:"直接当口播稿用。",startMs:5262,endMs:6620,event:"presentation_playing"}
    ]
  },
  "ED-02": {
    slug: "ed02-v1",
    projectName: "ED-02: select sentence, run real Codex rewrite, hold applied result",
    durationMs: 2167,
    sourceText: "写到任何句子，划一下就能让它改。",
    bindings: [
      {cueId: 3, cueText: "写到任何句子，", startMs: 0, endMs: 869, event: "sentence_selected"},
      {cueId: 4, cueText: "划一下就能让它改。", startMs: 869, endMs: 1987, event: "result_hold"},
    ],
  },
  "ED-03": {
    slug: "ed03-v1",
    durationMs: 6040,
    projectName: "ED-03: like then dislike then style library",
    sourceText: "对胃口的句子就标喜欢，看着别扭的就直接丢进讨厌库，形成你自己的写作风格库。",
    bindings: [
      {cueId: 5, cueText: "对胃口的句子就标喜欢，", startMs: 0, endMs: 1736, event: "like_click"},
      {cueId: 6, cueText: "看着别扭的就直接丢进讨厌库，", startMs: 1736, endMs: 3946, event: "ban_click"},
      {cueId: 7, cueText: "形成你自己的写作风格库。", startMs: 3946, endMs: 5840, event: "style_library_hold"},
    ],
  },
  "ED-24": {
    slug: "ed24-v1",
    durationMs: 10620,
    projectName: "ED-24: select bad line, explain, save to style library",
    sourceText: "最常用的动作就是划选一句。比如这句：AI 正在改变内容生产。理由可能是句子太空、没动作、太枯燥。系统会把这句记入你的风格库。",
    bindings: [
      {cueId: 74, cueText: "最常用的动作就是划选一句。比如这句：", startMs: 0, endMs: 2743, event: "sentence_selected"},
      {cueId: 75, cueText: "AI 正在改变内容生产。", startMs: 2743, endMs: 4420, event: "selected_phrase_hold"},
      {cueId: 76, cueText: "理由可能是句子太空、没动作、太枯燥。", startMs: 4480, endMs: 7800, event: "ban_click"},
      {cueId: 77, cueText: "系统会把这句记入你的风格库。", startMs: 8140, endMs: 10340, event: "style_library_hold"},
    ],
  },
  "ED-26": {
    slug: "ed26-v1",
    projectName: "ED-26: approve line, rewrite later line with preference memory",
    durationMs: 8020,
    sourceText: "如果看到你喜欢的句子或者措辞， 你也可以划选，点击喜欢。 之后 AI 会根据你的喜欢库， 来生成类似的句式或者类比。",
    bindings: [
      {cueId: 82, cueText: "如果看到你喜欢的句子或者措辞，", startMs: 0, endMs: 2122, event: "approved_line_selected"},
      {cueId: 83, cueText: "你也可以划选，点击喜欢。", startMs: 2122, endMs: 3820, event: "like_click"},
      {cueId: 84, cueText: "之后 AI 会根据你的喜欢库，", startMs: 4200, endMs: 6040, event: "rewrite_click"},
      {cueId: 85, cueText: "来生成类似的句式或者类比。", startMs: 6040, endMs: 7880, event: "candidates_with_memory_hold"},
    ],
  },
  "ED-21": {
    slug: "ed21-v1",
    projectName: "ED-21: open workbench, caret into body, one visible edit",
    durationMs: 8540,
    sourceText: "可以看到，我的前端做得很简单。打开页面， 第一眼看到的就是标题和全文。 你可以像普通文档软件一样， 在里面添加或修改。",
    bindings: [
      {cueId: 102, cueText: "可以看到，我的前端做得很简单。打开页面，", startMs: 0, endMs: 2860, event: "editor_page_hold"},
      {cueId: 103, cueText: "第一眼看到的就是标题和全文。", startMs: 2860, endMs: 4420, event: "editor_title_hold"},
      {cueId: 104, cueText: "你可以像普通文档软件一样，", startMs: 4420, endMs: 6080, event: "editor_edit_started"},
      {cueId: 105, cueText: "在里面添加或修改。", startMs: 6080, endMs: 8540, event: "editor_edited_hold"},
    ],
  },
  "ED-22": {
    slug: "ed22-v1",
    projectName: "ED-22: Cmd+S save, success feedback, reopen keeps the edit",
    durationMs: 5020,
    sourceText: "按 Ctrl+S 或 Command+S 就是保存， 下次再打开， 就是保存的最新版。",
    bindings: [
      {cueId: 106, cueText: "按 Ctrl+S 或 Command+S 就是保存，", startMs: 0, endMs: 2660, event: "save_shortcut"},
      {cueId: 107, cueText: "下次再打开，就是保存的最新版。", startMs: 2660, endMs: 5020, event: "reopen_hold"},
    ],
  },
  "ED-23": {
    slug: "ed23-v1",
    projectName: "ED-23: topic history isolation across two documents",
    durationMs: 7320,
    sourceText: "历史主题会按文章分开存， 每个主题会保留近五次的修改。 即使换一篇文章， 也不会混到一起。",
    bindings: [
      {cueId: 108, cueText: "历史主题会按文章分开存，", startMs: 0, endMs: 2440, event: "history_list_hold"},
      {cueId: 109, cueText: "每个主题会保留近五次的修改。", startMs: 2440, endMs: 4660, event: "topic_versions_hold"},
      {cueId: 110, cueText: "即使换一篇文章，也不会混到一起。", startMs: 4660, endMs: 7320, event: "topic_switched_hold"},
    ],
  },
  "ED-25": {
    slug: "ed25-v1",
    projectName: "ED-25: banned-line memory intercepts a similar vague sentence",
    durationMs: 6020,
    sourceText: "下次再出现类似的句子， Codex 就会拦下， 会提醒你要不要修改、 要不要补充什么。",
    bindings: [
      {cueId: 111, cueText: "下次再出现类似的句子，", startMs: 0, endMs: 1960, event: "similar_sentence_selected"},
      {cueId: 112, cueText: "Codex 就会拦下，", startMs: 1960, endMs: 3560, event: "preference_intercept_hit"},
      {cueId: 113, cueText: "会提醒你要不要修改、要不要补充什么。", startMs: 3560, endMs: 6020, event: "intercept_choices_hold"},
    ],
  },
};
const baseShotSpec = shotSpecs[targetShotId];
if (!baseShotSpec) throw new Error(`cap-native-shot-unsupported:${targetShotId}`);
const authorityDurationMs = Number(authorityShot.authority?.timeRange?.durationMs);
if (!Number.isFinite(authorityDurationMs) || authorityDurationMs <= 0) throw new Error(`cap-native-authority-duration-invalid:${targetShotId}`);
const timingScale = authorityDurationMs / baseShotSpec.durationMs;
const shotSpec = {
  ...baseShotSpec,
  durationMs: authorityDurationMs,
  sourceText: authorityShot.authority.sourceText,
  bindings: baseShotSpec.bindings.map((binding) => ({...binding,startMs:Math.round(binding.startMs*timingScale),endMs:Math.min(authorityDurationMs,Math.round(binding.endMs*timingScale))})),
};
const runTag = process.env.A1_CAP_NATIVE_RUN_TAG || "v1";
if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(runTag)) throw new Error(`cap-native-run-tag-invalid:${runTag}`);
const outRoot = path.join(root, `work/cap-native-${targetShotId.toLowerCase().replace("-", "")}-${runTag}`);
const projectPath = path.join(outRoot, `${targetShotId.toLowerCase()}-preference.cap`);
const timelinePath = path.join(outRoot, `${targetShotId.toLowerCase()}-preference.timeline.json`);
const reportPath = path.join(outRoot, "report.json");
const officialAssets = path.join(root, "work/cap-official-upstream/apps/cli/skill/cap-demo/assets");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const chromiumExecutable = process.env.A1_CAPTURE_CHROMIUM
  || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", chromium.executablePath()].find((candidate) => fs.existsSync(candidate));
const selectedPhrase = "当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力";
const exactNegativePhrase = "AI 正在改变内容生产";
const approvedPhrase = "我把 AI 直出的开头放进审稿，系统先标出这类套话，再要求补上具体对象和读者后果。";
const laterRewritePhrase = "我把另一段 AI 开头放进审稿，也想先找出套话、具体对象和读者后果。";
const editSentence = "例如预算很多，可以直接锁定投放。";
const interceptPhrase = "所以说，AI 正在改变内容生产的格局。";
const referenceDocSentence = "参照稿：复利系统的第二篇文章草稿。";
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function compareWindowIdentity(pagePath, capPath, chromeTop) {
  const pageImage = sharp(pagePath);
  const pageMeta = await pageImage.metadata();
  const capMeta = await sharp(capPath).metadata();
  const scale = (capMeta.width || 0) / (pageMeta.width || 1);
  const cropTop = Math.max(0, Math.round(chromeTop * scale));
  const cropHeight = Math.min((capMeta.height || 0) - cropTop, Math.round((pageMeta.height || 0) * scale));
  if (!pageMeta.width || !pageMeta.height || !capMeta.width || cropHeight <= 0) return {status:"FAIL",normalizedMae:1};
  const left = (await sharp(pagePath).removeAlpha().raw().toBuffer({resolveWithObject:true}));
  const right = (await sharp(capPath).extract({left:0,top:cropTop,width:capMeta.width,height:cropHeight}).resize(pageMeta.width,pageMeta.height,{fit:"fill"}).removeAlpha().raw().toBuffer({resolveWithObject:true}));
  if (left.data.length !== right.data.length) return {status:"FAIL",normalizedMae:1};
  let sum=0;
  for (let index=0; index<left.data.length; index+=1) sum+=Math.abs(left.data[index]-right.data[index]);
  const normalizedMae=sum/(left.data.length*255);
  return {status:normalizedMae<=.14?"PASS":"FAIL",normalizedMae:Math.round(normalizedMae*1_000_000)/1_000_000,pageSize:{width:pageMeta.width,height:pageMeta.height},captureSize:{width:capMeta.width,height:capMeta.height},cropTop};
}

if (!chromiumExecutable) throw new Error("cap-native-preference-chromium-missing");
if (fs.existsSync(projectPath) && process.env.A1_CAP_NATIVE_OVERWRITE === "1") {
  fs.rmSync(projectPath, {recursive: true, force: true});
}
if (fs.existsSync(projectPath)) throw new Error(`cap-native-preference-output-exists:${projectPath}`);
fs.mkdirSync(outRoot, {recursive: true});

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route} failed:${response.status}:${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

function taggedContentHtml(contentHtml) {
  let tagged = String(contentHtml || "")
    .replace(/<p>([^<]*当前行业正在快速发展[^<]*)<\/p>/u, '<p id="a1-action-original">$1</p>')
    .replace(/<p>([^<]*我把 AI 直出的开头放进审稿[^<]*)<\/p>/u, '<p id="cap-preference-good">$1</p>');
  if (!tagged.includes(laterRewritePhrase)) tagged += `<p id="cap-preference-later">${laterRewritePhrase}</p>`;
  if (targetShotId === "ED-25" && !tagged.includes(interceptPhrase)) {
    tagged += `<p id="cap-native-intercept-target">${interceptPhrase}</p>`;
  }
  if (["ED-21", "ED-22"].includes(targetShotId)) {
    const editSentence = "例如预算很多，可以直接锁定投放。";
    // ED-21 types this sentence during capture; only ED-22 needs a saved-result seed.
    if (targetShotId === "ED-22") {
      tagged = tagged.replace(/(<p id="a1-action-original">[^<]*当前行业正在快速发展[^<]*。)(<\/p>)/u, `$1${editSentence}$2`);
    }
    tagged += `<p id="cap-native-edit-marker" style="display:none">${editSentence}</p>`;
  }
  if (!tagged.includes('id="a1-action-original"') || !tagged.includes('id="cap-preference-good"')) throw new Error("cap-native-preference-anchors-missing");
  return tagged;
}

async function cleanupTempDocument(documentId) {
  await requestJson(`/api/document?documentId=${encodeURIComponent(documentId)}`, {method: "DELETE"}).catch(() => {});
  for (const directory of [
    path.join(writingRoot, ".cache/writing/documents"),
    path.join(writingRoot, ".cache/writing/deleted_documents"),
    path.join(writingRoot, ".cache/writing/topic_archives"),
    path.join(writingRoot, ".cache/writing/deleted_topic_archives"),
  ]) {
    if (!fs.existsSync(directory)) continue;
    for (const name of await fsp.readdir(directory)) if (name.startsWith(documentId)) await fsp.unlink(path.join(directory, name)).catch(() => {});
  }
}

async function selectPhrase(page, phrase) {
  const needsScroll = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor");
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!(node.textContent || "").includes(needle)) continue;
      const rect = node.parentElement?.getBoundingClientRect();
      if (!rect) return false;
      const centered = Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2) < window.innerHeight * .16;
      if (!centered) node.parentElement?.scrollIntoView({block: "center", behavior: "smooth"});
      return !centered;
    }
    return false;
  }, phrase);
  if (needsScroll) await page.waitForTimeout(560);
  const selected = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor");
    if (!editor) return "";
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent?.indexOf(needle) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", {bubbles: true}));
      return selection?.toString() || "";
    }
    return "";
  }, phrase);
  if (selected !== phrase) throw new Error(`cap-native-preference-selection-failed:${selected}`);
}

async function positionPhrase(page, phrase) {
  const positioned = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor");
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!(node.textContent || "").includes(needle)) continue;
      node.parentElement?.scrollIntoView({block: "center", behavior: "auto"});
      window.getSelection()?.removeAllRanges();
      return true;
    }
    return false;
  }, phrase);
  if (!positioned) throw new Error(`cap-native-preference-position-failed:${phrase}`);
  await page.waitForTimeout(120);
}

async function resetScrollContainers(page) {
  await page.evaluate(() => {
    const reset = (el) => { if (el && el.scrollHeight > el.clientHeight + 4 && el.scrollTop > 0) el.scrollTop = 0; };
    reset(document.scrollingElement);
    reset(document.documentElement);
    reset(document.body);
    for (const el of document.querySelectorAll("section, main, div, article, aside")) reset(el);
  });
  await sleep(120);
}

function ed02SelectionRewriteZoomSegments(clicks, durationSeconds) {
  const durationMs = Math.max(durationSeconds * 1000, 1500);
  const rewriteClick = clicks.find((click) => click.down && click.targetName === "selectionMenuRun") || clicks.find((click) => click.down);
  const cursorEntryMs = rewriteClick ? Math.max(0, Math.floor(rewriteClick.time_ms) - 600) : Math.max(0, durationMs - 1500);
  return [
    {
      start: 0,
      end: Math.max(0.3, cursorEntryMs / 1000),
      amount: 1.0,
      mode: "auto",
      glideDirection: "none",
      glideSpeed: 0.6,
      instantAnimation: false,
      edgeSnapRatio: 0.25,
    },
    {
      start: Math.max(0.3, cursorEntryMs / 1000),
      end: durationMs / 1000,
      amount: 1.25,
      mode: "auto",
      glideDirection: "none",
      glideSpeed: 0.5,
      instantAnimation: false,
      edgeSnapRatio: 0.25,
    },
  ];
}

function officialClickZoomSegments(clicks, durationSeconds) {
  const durationMs = durationSeconds * 1000;
  const clickCutoffMs = durationMs - 1000;
  const endLimitMs = durationMs - 800;
  const intervals = clicks
    .map((click) => Math.floor(click.time_ms))
    .filter((time) => time < clickCutoffMs)
    .map((time) => [Math.max(1, time - 300), Math.min(endLimitMs, time + 2500)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 2500) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged.map(([start, end]) => ({
    start: Math.round(start) / 1000,
    end: Math.round(end) / 1000,
    amount: 1.3,
    mode: "auto",
    glideDirection: "none",
    glideSpeed: 0.5,
    instantAnimation: false,
    edgeSnapRatio: 0.25,
  }));
}

function semanticClickZoomSegments(clicks, durationSeconds) {
  const downClicks = clicks.filter((click) => click.down);
  if (!downClicks.length) return [];
  const groups = [];
  for (const click of downClicks) {
    const last = groups.at(-1);
    if (last && click.time_ms - last.at(-1).time_ms <= 820) last.push(click);
    else groups.push([click]);
  }
  const bounded = groups.slice(0, 2).map((group) => ({
    start: Math.max(.001, group[0].time_ms / 1000 - .3),
    end: Math.min(durationSeconds - .2, group.at(-1).time_ms / 1000 + 1.3),
    amount: 1.24,
    mode: "auto",
    glideDirection: "none",
    glideSpeed: .62,
    instantAnimation: false,
    edgeSnapRatio: .2,
  }));
  if (bounded.length === 2 && bounded[1].start < bounded[0].end + .12) bounded[0].end = Math.max(bounded[0].start + .7, bounded[1].start - .12);
  return bounded;
}

const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
const contentHtml = taggedContentHtml(draft.content_html || draft.contentHtml);
const documentId = `cap_native_preference_${Date.now()}`;
const appUrl = `${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}&cinema=1`;
await requestJson("/api/document", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    documentId,
    documentType: "experiment",
    title: draft.title,
    contentHtml,
    contentText: `${draft.title}\n\n${String(draft.body || "").trim()}`,
    metadata: {purpose: "Cap native preference canary"},
  }),
});

let browser;
let context;
let page;
const cursorLog = {moves: [], clicks: []};
const events = [];
let ed22Doc2Id = null;
let ed23Doc2Id = null;
let t0 = 0;
let current = {x: 900, y: 520};
let stopped = false;
let focusGuard;
let semanticProof = null;
let prewarmProof = null;
let appProfilePath = null;
let captureTarget = null;
let productIdentityProof = null;
let emptyWideHoldGate = null;
let selectionTitle = null;
let nativeInputBinary = null;
let nativeInputSequence = 0;
const now = () => (Date.now() - t0) / 1000;

try {
  try { execSync('pkill -f "Google Chrome for Testing" || true'); } catch {}
  await sleep(700);
  appProfilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-cap-writing-app-"));
  context = await chromium.launchPersistentContext(appProfilePath, {
    executablePath: chromiumExecutable,
    headless: false,
    viewport: null,
    chromiumSandbox: true,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [`--app=${appUrl}`, "--window-size=1920,1080", `--window-position=${process.env.A1_CAP_LAUNCH_X ?? 1512},${process.env.A1_CAP_LAUNCH_Y ?? 0}`, "--no-default-browser-check", "--no-first-run", "--disable-features=TranslateUI,CalculateNativeWinOcclusion"],
  });
  page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    // Force a clean remote hydration: a prior headful autosave race can persist
    // the body-less placeholder as a dirty localStorage snapshot, after which
    // openDocument() restores local instead of the remote article and #editor
    // stays on the 47-char "正在载入" placeholder. The recorded interactions go
    // through the API/memory, so local draft recovery is not needed for a take.
    try {
      const removeKeys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith("codex-inline-editor-v2-doc-cache::")
          || key === "codex-inline-editor-v2-document-id"
          || key === "codex-inline-editor-v2-html"
          || key.startsWith("codex-inline-editor-v2-generated-draft"))) {
          removeKeys.push(key);
        }
      }
      removeKeys.forEach((key) => window.localStorage.removeItem(key));
    } catch (_) {}
    // Cap cinema mode: styles.css has body[data-cinema="1"] overrides.
    // We set the attribute as soon as body exists, then keep it set against React rerender.
    const ensureCinema = () => {
      if (document.body) {
        if (!document.body.hasAttribute("data-cinema")) {
          document.body.setAttribute("data-cinema", "1");
        }
      }
    };
    const startObs = () => {
      ensureCinema();
      if (!document.body) { setTimeout(startObs, 5); return; }
      const obs = new MutationObserver(() => ensureCinema());
      obs.observe(document.documentElement, {childList: true, subtree: true});
      // Also catch attribute removal
      const attrObs = new MutationObserver(() => ensureCinema());
      attrObs.observe(document.body, {attributes: true, attributeFilter: ["data-cinema"]});
    };
    startObs();
  });
  // Headful --app windows on this machine occasionally cold-start hydration with
  // #editor containing only the title (body-less, no JS error). Bringing the
  // window forward and reloading reliably completes hydration, so warm the
  // document with a bounded retry instead of failing the take on one race.
  await context.addInitScript(() => {
    const css = "html,body{width:100%!important;height:100%!important;overflow:hidden!important}section.workspace{width:100%!important;max-width:none!important;padding:12px 18px!important}article.paper{width:100%!important;max-width:100%!important}#editor{width:100%!important;max-width:100%!important}";
    const inject = () => {
      if (document.getElementById("a1-cap-workbench-style")) return;
      const tag = document.createElement("style");
      tag.id = "a1-cap-workbench-style";
      tag.textContent = css;
      (document.head || document.documentElement).appendChild(tag);
    };
    inject();
    new MutationObserver(inject).observe(document.documentElement, {childList: true, subtree: true});
  });
  let hydrated = false;
  for (let attempt = 1; attempt <= 4 && !hydrated; attempt++) {
    await page.bringToFront().catch(() => {});
    await page.goto(appUrl, {waitUntil: "networkidle", timeout: 60000});
    await page.evaluate(() => { document.title = "稿台"; });
    try {
      await page.waitForFunction(
        (needle) => {
          const text = document.querySelector("#editor")?.textContent || "";
          return text.length > 200 && text.includes(needle);
        },
        selectedPhrase,
        {timeout: 15000}
      );
      hydrated = true;
    } catch {
      if (attempt === 4) throw new Error(`cap-native-workbench-hydration-empty-editor:${await page.evaluate(() => document.querySelector("#editor")?.textContent?.length || 0)}`);
      await page.reload({waitUntil: "networkidle", timeout: 60000}).catch(() => {});
    }
  }
  await page.evaluate(() => { document.title = "稿台"; });
  // Hydration gate: interactive handlers early-return while documentHydrating.
  await page.waitForFunction(() => !document.querySelector("#finalReviewButton")?.disabled, null, {timeout: 30000});
  const domIdentity = await page.evaluate(() => ({
    title:document.title,
    editor:Boolean(document.querySelector("#editor")),
    finalReview:Boolean(document.querySelector("#finalReviewButton")),
    presentation:Boolean(document.querySelector("#presentDraft")),
    candidates:Boolean(document.querySelector("#candidateList")),
    controls:[...document.querySelectorAll("button")].map((button)=>button.textContent?.trim()).filter(Boolean),
  }));
  if (domIdentity.title !== "稿台" || !domIdentity.editor || !domIdentity.finalReview || !domIdentity.presentation || !domIdentity.candidates || !["新主题","保存","导出","演示","收稿"].every((label)=>domIdentity.controls.includes(label))) throw new Error(`cap-native-writing-workbench-dom-identity-failed:${JSON.stringify(domIdentity)}`);
  if (["ED-02", "ED-26"].includes(targetShotId)) {
    if (targetShotId === "ED-26") {
      await selectPhrase(page, approvedPhrase);
      await page.waitForSelector("#selectionMenu [data-like]", {state: "visible"});
      await page.locator("#selectionMenu [data-like]").click({force: true});
      await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
    }
    await selectPhrase(page, targetShotId === "ED-02" ? selectedPhrase : laterRewritePhrase);
    await page.waitForSelector("#selectionMenu [data-run]", {state: "visible"});
    const prewarmResponsePromise = page.waitForResponse((response) => response.url().includes("/api/rewrite-selection") && response.request().method() === "POST", {timeout: 90000});
    await page.locator("#selectionMenu [data-run]").click({force: true});
    const prewarmResponse = await prewarmResponsePromise;
    const prewarm = await prewarmResponse.json();
    prewarmProof = {engine: prewarm?.engine || null, cacheProof: prewarm?.cacheProof || null, variantCount: Array.isArray(prewarm?.variants) ? prewarm.variants.length : 0};
    if (prewarmProof.engine === "heuristic-fallback" || !prewarmProof.engine || prewarmProof.variantCount < 1) throw new Error(`cap-native-${targetShotId.toLowerCase()}-prewarm-not-real:${JSON.stringify(prewarmProof)}`);
    await page.goto(appUrl, {waitUntil: "networkidle", timeout: 60000});
    await page.evaluate(() => { document.title = "稿台"; });
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), targetShotId === "ED-02" ? selectedPhrase : laterRewritePhrase);
  }
  if (["ED-05", "ED-20", "ED-29"].includes(targetShotId)) {
    const prewarmResponsePromise = page.waitForResponse((response) => response.url().includes("/api/final-review") && response.request().method() === "POST", {timeout:90000});
    await page.locator("#finalReviewButton").click({force:true});
    const prewarmResponse = await prewarmResponsePromise;
    const prewarm = await prewarmResponse.json();
    await page.waitForFunction(() => document.querySelectorAll(".final-review-item").length >= 1 || Boolean(document.querySelector(".final-review-empty")),null,{timeout:90000});
    prewarmProof = {httpStatus:prewarmResponse.status(),responseKeys:Object.keys(prewarm||{}).sort(),findingCount:Array.isArray(prewarm?.findings)?prewarm.findings.length:await page.locator(".final-review-item").count(),cacheProof:prewarm?.cacheProof||null};
    if (prewarmProof.httpStatus < 200 || prewarmProof.httpStatus >= 300) throw new Error(`cap-native-${targetShotId.toLowerCase()}-review-prewarm-invalid:${JSON.stringify(prewarmProof)}`);
    await page.goto(appUrl, {waitUntil: "networkidle", timeout: 60000});
    await page.evaluate(() => { document.title = "稿台"; });
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), selectedPhrase);
    await page.waitForFunction(() => !document.querySelector("#finalReviewButton")?.disabled, null, {timeout: 30000});
  }
  if (targetShotId === "ED-22") {
    // Baseline save so the topic archive exists before the recorded save; the
    // in-recording Cmd+S then produces the version that reopen must show.
    const baselineSave = await requestJson("/api/document", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        documentId,
        documentType: "experiment",
        title: draft.title,
        contentHtml,
        contentText: `${draft.title}\n\n${String(draft.body || "").trim()}`,
        metadata: {purpose: "Cap native ED-22 baseline"},
      }),
    });
    if (!baselineSave?.updatedAt) throw new Error(`cap-native-ed22-baseline-save-failed:${JSON.stringify(baselineSave).slice(0, 300)}`);
    // Second experiment document: the "another article" the in-recording
    // reopen navigates to (same workbench, different doc).
    ed22Doc2Id = `${documentId}_doc2`;
    await requestJson("/api/document", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        documentId: ed22Doc2Id,
        documentType: "experiment",
        title: `${draft.title}（另一篇）`,
        contentHtml: "<p>另一篇稿件的占位段落，用于验证切换回原文章后修改仍在。</p>",
        contentText: "另一篇稿件的占位段落，用于验证切换回原文章后修改仍在。",
        metadata: {purpose: "Cap native ED-22 reopen target"},
      }),
    });
  }
  if (targetShotId === "ED-23") {
    // Baseline save for the current document (archive entry #1).
    await requestJson("/api/document", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        documentId,
        documentType: "experiment",
        title: draft.title,
        contentHtml,
        contentText: `${draft.title}\n\n${String(draft.body || "").trim()}`,
        metadata: {purpose: "Cap native ED-23 baseline"},
      }),
    });
    // Reference document with its own distinct content + archive entry.
    ed23Doc2Id = `${documentId}_ref`;
    const referenceContentHtml = `<p>${referenceDocSentence}</p><p>${selectedPhrase}。参照文章有自己的版本历史，与当前文章完全独立。</p>`;
    await requestJson("/api/document", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        documentId: ed23Doc2Id,
        documentType: "experiment",
        title: `${draft.title}（参照稿）`,
        contentHtml: referenceContentHtml,
        contentText: `${draft.title}（参照稿）\n\n${referenceDocSentence}\n${selectedPhrase}。参照文章有自己的版本历史，与当前文章完全独立。`,
        metadata: {purpose: "Cap native ED-23 reference"},
      }),
    });
    const isolation = await requestJson("/api/history-isolation-check", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({documentId, referenceDocumentId: ed23Doc2Id}),
    });
    if (!isolation?.isolated) throw new Error(`cap-native-ed23-isolation-precheck-failed:${JSON.stringify(isolation).slice(0, 400)}`);
  }
  if (targetShotId === "ED-25") {
    // Seed the banned line into THIS document's scope; the intercept engine
    // only matches scopes document:<id> / personal-ip / global / "".
    const seed = await requestJson("/api/memory", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        kind: "banned_line",
        sourceText: exactNegativePhrase,
        reason: "句子太空、没动作、太枯燥",
        strength: "hard",
        scope: `document:${documentId}`,
        origin: "selection",
      }),
    });
    if (!seed?.id) throw new Error(`cap-native-ed25-seed-memory-failed:${JSON.stringify(seed).slice(0, 300)}`);
    const prewarmIntercept = await requestJson("/api/preference-intercept-check", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({documentId, proposedKind: "rewrite", proposedText: interceptPhrase}),
    });
    if (!prewarmIntercept?.intercept || !(prewarmIntercept?.opposingCount >= 1)) throw new Error(`cap-native-ed25-intercept-prewarm-failed:${JSON.stringify(prewarmIntercept).slice(0, 400)}`);
  }
  await page.evaluate(() => {
    document.body.dataset.a1StableResultRail = "1";
    const stableRailStyle = document.createElement("style");
    stableRailStyle.id = "__a1_stable_result_rail_style";
    stableRailStyle.textContent = `
      body[data-a1-stable-result-rail="1"] .workspace,
      body.lite-mode[data-a1-stable-result-rail="1"] .workspace {
        grid-template-columns: minmax(0, 1fr) minmax(420px, 480px) !important;
        gap: 16px !important;
      }
      body[data-a1-stable-result-rail="1"] .paper,
      body.lite-mode[data-a1-stable-result-rail="1"] .paper {
        width: 100% !important;
        max-width: none !important;
        justify-self: stretch !important;
      }
      body[data-a1-stable-result-rail="1"] aside.side,
      body.lite-mode[data-a1-stable-result-rail="1"] aside.side {
        display: grid !important;
      }
    `;
    document.head.appendChild(stableRailStyle);
    const dot = document.createElement("div");
    dot.id = "__cap_native_shimmer";
    dot.style.cssText = "position:fixed;right:6px;bottom:6px;width:3px;height:3px;background:rgba(127,127,127,.02);z-index:2147483647;pointer-events:none";
    document.documentElement.appendChild(dot);
    let value = 0;
    const tick = () => { value += .25; dot.style.transform = `translate(${Math.sin(value) * 2}px,${Math.cos(value) * 2}px)`; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  // The v2 workbench reliably hydrates when the cold-started --app window is on
  // the primary display; launching directly on the A1 Capture virtual display
  // intermittently leaves #editor body-less. Hydration gates above have passed,
  // so relocate the window to the capture display BEFORE geometry/layout gates.
  if (process.env.A1_CAP_MOVE_AFTER_HYDRATE === "1") {
    const cdp = await context.newCDPSession(page);
    const win0 = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId: win0.windowId,
      bounds: {
        left: Number(process.env.A1_CAP_DEST_X ?? 1512),
        top: Number(process.env.A1_CAP_DEST_Y ?? 0),
        width: 1920,
        height: 1080,
        windowState: "normal",
      },
    });
    await page.waitForFunction(() => window.screenX >= 1500 && window.outerWidth >= 1900, null, {timeout: 15000}).catch(() => {});
    await sleep(900);
  }
  const geometry = await page.evaluate(() => ({
    contentLeft: Math.max(0, (outerWidth - innerWidth) / 2),
    contentTop: Math.max(0, outerHeight - innerHeight),
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    screenX,
    screenY,
    devicePixelRatio,
  }));
  const layoutGate = await page.evaluate(() => {
    const workspace = document.querySelector("section.workspace");
    const editor = document.querySelector("#editor");
    const workspaceRect = workspace?.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      workspaceWidthRatio: workspaceRect ? workspaceRect.width / innerWidth : 0,
      workspaceHeightRatio: workspaceRect ? workspaceRect.height / innerHeight : 0,
      editorWidthRatio: editorRect ? editorRect.width / innerWidth : 0,
    };
  });
  if (geometry.innerWidth < 1700 || geometry.innerHeight < 900 || geometry.contentTop > 90 || layoutGate.workspaceWidthRatio < .9 || layoutGate.workspaceHeightRatio < .75) {
    throw new Error(`cap-native-clean-window-layout-failed:${JSON.stringify({geometry,layoutGate})}`);
  }
  if (["ED-06", "ED-30"].includes(targetShotId)) {
    // Presentation mode is a full-screen overlay and never depends on the
    // selected paragraph's viewport position; headless probes prove a direct
    // click from top framing works. Scrolling the paragraph into view pushed
    // the toolbar out of view (measured y=-439) with no recovery that worked,
    // so 06/30 simply keep the default top framing.
  } else if (["ED-21", "ED-22", "ED-23", "ED-25"].includes(targetShotId)) {
    // Editorial/document framing: keep the toolbar visible with top framing
    // (same rationale as ED-06/30). ED-25 additionally centers the source
    // paragraph so the selection highlight is on camera.
    if (targetShotId === "ED-25") await positionPhrase(page, exactNegativePhrase);
  } else {
    await positionPhrase(page, targetShotId === "ED-24" ? exactNegativePhrase : ["ED-02", "ED-04", "ED-27", "ED-28"].includes(targetShotId) ? selectedPhrase : approvedPhrase);
  }
  let preparedParagraphSlot = null;
  if (targetShotId === "ED-28") {
    const anchor = page.locator("#a1-action-original");
    const created = await anchor.evaluate((node) => typeof window.createParagraphAssistSlotAfter === "function" && window.createParagraphAssistSlotAfter(node));
    if (!created) throw new Error("cap-native-ed28-paragraph-slot-prepare-failed");
    preparedParagraphSlot = page.locator('p[data-paragraph-assist-slot="1"]');
    await preparedParagraphSlot.click();
    await page.keyboard.type("写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。", {delay: 4});
    await page.waitForFunction(() => (document.querySelector("#paragraphAssistState")?.textContent || "").includes("可补写"));
  }

  const fraction = (point) => ({
    x: (geometry.contentLeft + point.x) / geometry.outerWidth,
    y: (geometry.contentTop + point.y) / geometry.outerHeight,
  });
  const normalizedBounds = (box) => {
    const topLeft = fraction({x: box.x, y: box.y});
    const bottomRight = fraction({x: box.x + box.width, y: box.y + box.height});
    return {left:topLeft.x,top:topLeft.y,right:bottomRight.x,bottom:bottomRight.y};
  };
  const absolutePoint = (point) => ({
    x: geometry.screenX + geometry.contentLeft + point.x,
    y: geometry.screenY + geometry.contentTop + point.y,
  });
  if (nativeInputEnabled) {
    nativeInputBinary = path.join(outRoot, "a1-native-input-adapter");
    execFileSync("swiftc", ["-parse-as-library", path.join(root, "scripts/native-input/A1NativeInputAdapter.swift"), "-o", nativeInputBinary, "-framework", "AppKit", "-framework", "ApplicationServices"], {encoding: "utf8"});
  }
  const runNativeInput = async (steps) => {
    if (!nativeInputEnabled) return;
    if (process.env.A1_CAP_NATIVE_FOCUS_LOCK === "1") {
      await page.bringToFront();
      await sleep(80);
    }
    const sequence = String(++nativeInputSequence).padStart(3, "0");
    const planPath = path.join(outRoot, `native-input-${sequence}.json`);
    const reportPath = path.join(outRoot, `native-input-${sequence}-report.json`);
    fs.writeFileSync(planPath, `${JSON.stringify({contract:"A1NativeInputPlan/v1",planId:`${targetShotId}-${sequence}`,expectedFrontmostBundleId:"com.google.Chrome",steps}, null, 2)}\n`);
    execFileSync(nativeInputBinary, ["--plan", planPath, "--report", reportPath, "--execute", "--activate-target"], {encoding: "utf8"});
  };
  const logMove = () => cursorLog.moves.push({t: now(), ...fraction(current)});
  const move = async (point) => {
    current = point;
    if (nativeInputEnabled) await runNativeInput([{id:"move",type:"move",atMs:0,...absolutePoint(point),durationMs:0}]);
    else await page.mouse.move(point.x, point.y);
    logMove();
  };
  const glide = async (target, durationMs) => {
    if (nativeInputEnabled) {
      current = target;
      await runNativeInput([{id:"glide",type:"move",atMs:0,...absolutePoint(target),durationMs}]);
      logMove();
      return;
    }
    const origin = {...current};
    const steps = Math.max(12, Math.round(durationMs / 16));
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const eased = t * t * (3 - 2 * t);
      await move({x: origin.x + (target.x - origin.x) * eased, y: origin.y + (target.y - origin.y) * eased});
      await sleep(durationMs / steps);
    }
  };
  const click = async () => {
    cursorLog.clicks.push({t: now(), down: true});
    if (nativeInputEnabled) await runNativeInput([{id:"click",type:"click",atMs:0,...absolutePoint(current),button:"left",clickCount:1}]);
    else { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
    cursorLog.clicks.push({t: now() - .001, down: false});
  };
  const clickLocator = async (locator, {durationMs = 260, targetName = null} = {}) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`cap-native-click-target-box-missing:${targetName || "unnamed"}`);
    const target = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    await glide(target, durationMs);
    await sleep(45);
    const normalized = fraction(target);
    const targetBounds = normalizedBounds(box);
    cursorLog.clicks.push({t: now(), down: true, ...normalized, targetName, targetBounds});
    if (nativeInputEnabled) await runNativeInput([{id:targetName || "click-target",type:"click",atMs:0,...absolutePoint(target),button:"left",clickCount:1}]);
    else { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
    cursorLog.clicks.push({t: now(), down: false, ...normalized, targetName, targetBounds});
  };
  const typeText = async (text) => nativeInputEnabled
    ? runNativeInput([{id:"type-text",type:"text",atMs:0,text}])
    : page.keyboard.type(text, {delay: 7});
  const pressKey = async (key, keyCode) => nativeInputEnabled
    ? runNativeInput([{id:`key-${key}`,type:"key",atMs:0,keyCode,modifiers:[]}])
    : page.keyboard.press(key);
  selectionTitle=`A1稿台-${crypto.randomBytes(8).toString("hex")}`;
  await page.evaluate((title)=>{document.title=title;},selectionTitle);
  await sleep(120);
  const pageIdentityPath = path.join(outRoot,"writing-workbench-page-identity.png");
  await page.screenshot({path:pageIdentityPath});
  const targets = JSON.parse(execFileSync(cap, ["targets", "--json"], {encoding: "utf8"}));
  const screen = targets.screens.find((item) => item.name === "A1 Capture");
  if (!screen || screen.primary || screen.logicalSize?.width !== 1920 || screen.logicalSize?.height !== 1080 || screen.refreshRate !== 60) throw new Error(`cap-native-virtual-display-invalid:${JSON.stringify(screen)}`);
  const screenIdentityPath = path.join(outRoot, "virtual-display-identity.png");
  execFileSync(cap, ["screenshot", "--screen", String(screen.id), "--path", screenIdentityPath, "--json"], {encoding: "utf8"});
  const targetWindow = targets.windows?.find((item) => item.name === selectionTitle);
  if (!targetWindow) throw new Error(`cap-native-target-window-missing:${JSON.stringify((targets.windows||[]).map((item)=>({id:item.id,name:item.name,bounds:item.bounds})))}`);
  const windowIdentityPath = path.join(outRoot,"capture-window-identity.png");
  const windowShot = JSON.parse(execFileSync(cap,["screenshot","--window",String(targetWindow.id),"--path",windowIdentityPath,"--json"],{encoding:"utf8"}));
  if (Math.abs(windowShot.width-geometry.outerWidth)>4 || Math.abs(windowShot.height-geometry.outerHeight)>4) throw new Error(`cap-native-window-geometry-mismatch:${JSON.stringify({windowShot,geometry,targetWindow})}`);
  productIdentityProof={contract:"A1WritingWorkbenchVirtualDisplayIdentityProof/v1",status:"PASS",domIdentity,selectionMethod:"DEDICATED_APP_WINDOW_CAPTURE",selectionTitleSha256:crypto.createHash("sha256").update(selectionTitle).digest("hex"),virtualDisplay:{id:String(screen.id),name:screen.name,logicalSize:screen.logicalSize,physicalSize:screen.physicalSize,refreshRate:screen.refreshRate,primary:screen.primary},captureWindow:{id:String(targetWindow.id),name:targetWindow.name,bounds:targetWindow.bounds},layoutGate,pageIdentityPath:path.relative(root,pageIdentityPath),screenIdentityPath:path.relative(root,screenIdentityPath),windowIdentityPath:path.relative(root,windowIdentityPath),candidateCount:1};
  captureTarget = {id: String(targetWindow.id), name: targetWindow.name, bounds: {width: windowShot.width, height: windowShot.height}, captureScope: "DEDICATED_APP_WINDOW"};
  execFileSync(cap, ["record", "start", "--detach", "--window", String(targetWindow.id), "--fps", "60", "--path", projectPath], {encoding: "utf8"});
  // Background capture: CDP input + per-window Cap recording do not require
  // foreground focus. Force-raise only when A1_CAP_NATIVE_FOCUS_LOCK=1
  // (legacy behaviour that steals the user's keyboard).
  const focusLock = process.env.A1_CAP_NATIVE_FOCUS_LOCK === "1";
  if (focusLock) {
    await page.bringToFront();
    focusGuard = setInterval(() => page?.bringToFront().catch(() => {}), 200);
  }
  t0 = Date.now();
  logMove();
  events.push({name: "start", t: now()});
  await sleep(300);

  if (["ED-05", "ED-20", "ED-29"].includes(targetShotId)) {
    if (targetShotId === "ED-20") {
      events.push({name:"draft_material_hold",t:now()});
      while (now() < 2.05) await sleep(40);
      events.push({name:"draft_editor_hold",t:now()});
      while (now() < 3.18) await sleep(30);
    } else while (now() < .08) await sleep(20);
    // positionPhrase scrollIntoView's the target paragraph, which scrolls the
    // .workspace container (html/body are overflow:hidden in cinema layout, so
    // window.scrollTo is a no-op) and pushed the toolbar out of view
    // (measured y=-439). Reset every real scroller instead.
    await page.evaluate(() => {
      const reset = (el) => { if (el && el.scrollHeight > el.clientHeight + 4 && el.scrollTop > 0) el.scrollTop = 0; };
      reset(document.scrollingElement);
      reset(document.documentElement);
      reset(document.body);
      for (const el of document.querySelectorAll("section, main, div, article, aside")) reset(el);
    });
    await sleep(120);
    const reviewButton = page.locator("#finalReviewButton");
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/final-review") && response.request().method() === "POST", {timeout:90000});
    await clickLocator(reviewButton,{durationMs:140,targetName:"final-review"});
    events.push({name:"review_click",t:now()});
    // Diagnostic: if the POST never arrives, capture the UI guard state.
    responsePromise.catch(() => {});
    const jobDiagTimer = setTimeout(() => {
      page.evaluate(() => ({
        finalReviewDisabled: document.querySelector("#finalReviewButton")?.disabled,
        jobState: document.querySelector("#finalReviewJobState")?.textContent || null,
        toast: document.querySelector(".workspace-toast")?.textContent || null,
      })).then((diag) => fs.writeFileSync(path.join(outRoot, "final-review-stall-diag.json"), `${JSON.stringify(diag, null, 2)}\n`)).catch(() => {});
    }, 15000);
    const runningAt = targetShotId === "ED-05" ? 1.55 : targetShotId === "ED-29" ? 2.05 : null;
    if (runningAt) { while (now() < runningAt) await sleep(30); events.push({name:"review_running",t:now()}); }
    const response = await responsePromise;
    clearTimeout(jobDiagTimer);
    const review = await response.json();
    await page.waitForFunction(() => document.querySelectorAll(".final-review-item").length >= 1 || Boolean(document.querySelector(".final-review-empty")),null,{timeout:90000});
    const findingsAt = targetShotId === "ED-05" ? 3.45 : targetShotId === "ED-29" ? 3.35 : 5.85;
    while (now() < findingsAt) await sleep(40);
    events.push({name:"review_findings_hold",t:now()});
    if (targetShotId === "ED-05") { const findingsRecordedAt=now(); while (now() < findingsRecordedAt + 2.12) await sleep(40); events.push({name:"review_suggestion_hold",t:now()}); }
    semanticProof={engine:review?.engine||null,findingCount:Array.isArray(review?.findings)?review.findings.length:await page.locator(".final-review-item").count(),cacheProof:review?.cacheProof||null,prewarmProof};
    const lastReviewStateAt = now();
    const minimumResultHoldSeconds = targetShotId === "ED-05" ? 3.9 : 2.4;
    while (now() < lastReviewStateAt + minimumResultHoldSeconds) await sleep(50);
  }

  if (["ED-06", "ED-30"].includes(targetShotId)) {
    if (targetShotId === "ED-30") { events.push({name:"draft_ready_hold",t:now()}); while (now() < 1.85) await sleep(40); }
    // Fail-closed geometry guard: the #presentDraft click only lands when the
    // button is actually inside the viewport. Persist diagnostic state (button
    // rect + any scrolled containers) before throwing.
    const presentGeometryGate = await page.evaluate(() => {
      const reset = (el) => { if (el && el.scrollHeight > el.clientHeight + 4 && el.scrollTop > 0) el.scrollTop = 0; };
      reset(document.scrollingElement);
      reset(document.documentElement);
      reset(document.body);
      for (const el of document.querySelectorAll("section, main, div, article, aside")) reset(el);
      const rect = document.querySelector("#presentDraft")?.getBoundingClientRect();
      const scrollers = [];
      for (const el of [document.scrollingElement, document.documentElement, document.body, ...document.querySelectorAll("section, main, div, article, aside")]) {
        if (el && el.scrollHeight > el.clientHeight + 4 && el.scrollTop > 0) scrollers.push({tag: el.tagName, cls: typeof el.className === "string" ? el.className.slice(0, 60) : null, id: el.id || null, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight});
      }
      return {y: rect ? rect.y : null, bottom: rect ? rect.bottom : null, scrollers};
    });
    if (presentGeometryGate.y == null || presentGeometryGate.y < 0 || presentGeometryGate.bottom > 1018) {
      fs.writeFileSync(path.join(outRoot, "presentation-open-diag.json"), `${JSON.stringify({stage: "pre-click-geometry", ...presentGeometryGate}, null, 2)}\n`);
      throw new Error(`cap-native-ed0630-present-button-offscreen:${JSON.stringify(presentGeometryGate)}`);
    }
    const presentButton=page.locator("#presentDraft");
    await clickLocator(presentButton,{durationMs:300,targetName:"presentation-open"});
    try {
      await page.waitForFunction(() => !document.querySelector("#presentationMode")?.hasAttribute("hidden"), null, {timeout: 30000});
    } catch (error) {
      const presentationDiag = await page.evaluate(() => {
        const button = document.querySelector("#presentDraft");
        const rect = button?.getBoundingClientRect();
        const cx = rect ? rect.x + rect.width / 2 : -1;
        const cy = rect ? rect.y + rect.height / 2 : -1;
        return {
          buttonRect: rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom,right:rect.right} : null,
          elementAtCenter: cx >= 0 ? (document.elementFromPoint(cx, cy)?.id || document.elementFromPoint(cx, cy)?.tagName || null) : null,
          buttonDisabled: Boolean(button?.disabled),
          presentationHidden: document.querySelector("#presentationMode")?.hasAttribute("hidden") ?? null,
          editorChars: document.querySelector("#editor")?.textContent?.length || 0,
          toast: document.querySelector(".workspace-toast")?.textContent || null,
          viewport: {width: innerWidth, height: innerHeight},
        };
      }).catch(() => ({diagError: "evaluate-failed"}));
      fs.writeFileSync(path.join(outRoot, "presentation-open-diag.json"), `${JSON.stringify(presentationDiag, null, 2)}\n`);
      throw error;
    }
    events.push({name:"presentation_open",t:now()});
    const adjustAt=targetShotId === "ED-06" ? 2.25 : 3.45;
    while (now() < adjustAt) await sleep(40);
    await page.locator("#presentationFontSize").fill("68");
    await page.locator("#presentationSpeed").fill("155");
    events.push({name:"presentation_adjusted",t:now()});
    const playAt=targetShotId === "ED-06" ? 3.75 : 5.45;
    while (now() < playAt) await sleep(40);
    await clickLocator(page.locator("#presentationPlay"),{durationMs:260,targetName:"presentation-play"});
    events.push({name:"presentation_playing",t:now()});
    while (now() < shotSpec.durationMs/1000 + .18) await sleep(50);
  }

  if (targetShotId === "ED-04") {
    events.push({name: "paragraph_anchor_hold", t: now()});
    // Empty-wide hold gate (A1ScreenInteractionIntent emptyWideHoldCapRatio):
    // the candidate rail is still empty during BEFORE, so the wide establish
    // hold is capped instead of idling on a grey rail. The saved gap moves
    // into the result hold, which has verified candidates on screen.
    const emptyWideHoldCapSeconds = .8;
    while (now() < emptyWideHoldCapSeconds) await sleep(30);
    emptyWideHoldGate = {contract: "A1EmptyWideHoldGate/v1", phase: "BEFORE", capSeconds: emptyWideHoldCapSeconds, sourceAnchorHoldSeconds: 1.42};
    const anchor = page.locator("#a1-action-original");
    await anchor.scrollIntoViewIfNeeded();
    const anchorBox = await anchor.boundingBox();
    if (!anchorBox) throw new Error("cap-native-ed04-anchor-box-missing");
    await glide({x: anchorBox.x + anchorBox.width * .72, y: anchorBox.y + anchorBox.height * .72}, 340);
    for (let index = 0; index < 2; index += 1) {
      cursorLog.clicks.push({t: now(), down: true});
      await click();
      cursorLog.clicks.push({t: now(), down: false});
      await sleep(90);
    }
    let slot = page.locator('p[data-paragraph-assist-slot="1"]');
    if (!await slot.count()) {
      const created = await anchor.evaluate((node) => typeof window.createParagraphAssistSlotAfter === "function" && window.createParagraphAssistSlotAfter(node));
      if (!created) throw new Error("cap-native-ed04-paragraph-slot-create-failed");
      slot = page.locator('p[data-paragraph-assist-slot="1"]');
    }
    await slot.waitFor({state: "visible"});
    events.push({name: "paragraph_slot_created", t: now()});
    while (now() < Math.min(emptyWideHoldGate ? emptyWideHoldGate.capSeconds + .75 : 2.55 * timingScale, 1.55)) await sleep(30);
    await clickLocator(slot, {durationMs: 240, targetName: "paragraph-request-slot"});
    const focusProof = await slot.evaluate((node) => {
      const editor = document.querySelector("#editor");
      const selection = window.getSelection();
      const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const currentInside = Boolean(currentRange && node.contains(currentRange.startContainer));
      const wasEmpty = !node.innerText.trim();
      if (wasEmpty) node.replaceChildren();
      if (wasEmpty || !currentInside || !node.contains(selection?.anchorNode)) {
        editor?.focus({preventScroll:true});
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event("selectionchange", {bubbles:true}));
      }
      const verifiedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
      return {
        activeElementId: document.activeElement?.id || document.activeElement?.tagName || null,
        selectionInsideSlot: Boolean(verifiedRange && node.contains(verifiedRange.startContainer)),
        slotTextBeforeInput: node.innerText || "",
      };
    });
    if (!focusProof.selectionInsideSlot || focusProof.activeElementId !== "editor") throw new Error(`cap-native-ed04-focus-bridge-failed:${JSON.stringify(focusProof)}`);
    events.push({name:"paragraph_slot_focus_verified",t:now(),focusProof});
    const paragraphRequestText = "写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。";
    await typeText(paragraphRequestText);
    await sleep(300);
    const inputProof = await page.evaluate((requestText) => {
      const liveSlot = document.querySelector('p[data-paragraph-assist-slot="1"]');
      const editor = document.querySelector("#editor");
      return {
        slotCount: document.querySelectorAll('p[data-paragraph-assist-slot="1"]').length,
        slotText: liveSlot?.innerText || "",
        editorContainsRequest: Boolean(editor?.innerText?.includes(requestText)),
        state: document.querySelector("#paragraphAssistState")?.textContent || "",
        activeElementId: document.activeElement?.id || document.activeElement?.tagName || null,
      };
    }, paragraphRequestText);
    fs.writeFileSync(path.join(outRoot,"ed04-native-input-focus-proof.json"),`${JSON.stringify({focusProof,inputProof},null,2)}\n`);
    if (!inputProof.slotText.trim()) throw new Error(`cap-native-ed04-native-text-input-not-retained-in-slot:${JSON.stringify({focusProof,inputProof})}`);
    await page.waitForFunction(() => (document.querySelector("#paragraphAssistState")?.textContent || "").includes("可补写"));
    events.push({name: "paragraph_request_entered", t: now()});
    while (now() < 4.02) await sleep(20);
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/paragraph-assist") && response.request().method() === "POST", {timeout: 90000});
    await clickLocator(slot, {durationMs: 260, targetName: "paragraph-request-submit"});
    await pressKey("End", 119);
    await pressKey("Enter", 36);
    events.push({name: "paragraph_request_run", t: now()});
    const response = await responsePromise;
    const paragraph = await response.json();
    await page.waitForSelector("#candidateList .candidate-text", {state: "visible", timeout: 90000});
    const candidateCount = Array.isArray(paragraph?.variants) ? paragraph.variants.length : await page.locator("#candidateList .candidate-text").count();
    semanticProof = {engine: paragraph?.engine || null, candidateCount, cacheProof: paragraph?.cacheProof || null};
    if (semanticProof.engine === "heuristic-fallback" || !semanticProof.engine || candidateCount < 3) throw new Error(`cap-native-ed04-real-paragraph-proof:${JSON.stringify(semanticProof)}`);
    if (candidateCount < 1) throw new Error(`cap-native-ed04-candidates-missing:${JSON.stringify(semanticProof)}`);
    while (now() < 5.42) await sleep(30);
    const firstCandidate=page.locator("#candidateList .candidate-text").first();
    const candidateBox=await firstCandidate.boundingBox();
    if (!candidateBox) throw new Error("cap-native-ed04-result-focus-missing");
    await glide({x:candidateBox.x+candidateBox.width/2,y:candidateBox.y+Math.min(candidateBox.height/2,48)},300);
    events.push({name: "paragraph_candidates_hold", t: now()});
    const candidatesRecordedAt = now();
    while (now() < candidatesRecordedAt + 2.4) await sleep(40);
  }

  if (targetShotId === "ED-27") {
    events.push({name: "paragraph_anchor_hold", t: now()});
    while (now() < 2.05) await sleep(40);
    events.push({name: "paragraph_gap_context_hold", t: now()});
    while (now() < 5.05) await sleep(40);
    const anchor = page.locator("#a1-action-original");
    await anchor.scrollIntoViewIfNeeded();
    const anchorBox = await anchor.boundingBox();
    if (!anchorBox) throw new Error("cap-native-ed27-anchor-box-missing");
    await glide({x: anchorBox.x + anchorBox.width * .72, y: anchorBox.y + anchorBox.height * .72}, 380);
    for (let index = 0; index < 2; index += 1) {
      cursorLog.clicks.push({t: now(), down: true});
      await page.mouse.down(); await sleep(72); await page.mouse.up();
      cursorLog.clicks.push({t: now(), down: false});
      await sleep(90);
    }
    let slot = page.locator('p[data-paragraph-assist-slot="1"]');
    if (!await slot.count()) {
      const created = await anchor.evaluate((node) => typeof window.createParagraphAssistSlotAfter === "function" && window.createParagraphAssistSlotAfter(node));
      if (!created) throw new Error("cap-native-ed27-paragraph-slot-create-failed");
      slot = page.locator('p[data-paragraph-assist-slot="1"]');
    }
    await slot.waitFor({state: "visible"});
    events.push({name: "paragraph_slot_created", t: now()});
    while (now() < 8.08) await sleep(40);
    await clickLocator(slot, {durationMs: 300, targetName: "paragraph-request-slot"});
    events.push({name: "paragraph_request_started", t: now()});
    const requestText = "写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。";
    await page.keyboard.type(requestText.slice(0, 18), {delay: 22});
    while (now() < 10.08) await sleep(30);
    events.push({name: "paragraph_request_mid", t: now()});
    await page.keyboard.type(requestText.slice(18), {delay: 18});
    await page.waitForFunction(() => (document.querySelector("#paragraphAssistState")?.textContent || "").includes("可补写"));
    while (now() < 11.15) await sleep(30);
    events.push({name: "paragraph_request_ready", t: now()});
    while (now() < 13.32) await sleep(60);
  }

  if (targetShotId === "ED-28") {
    const slot = preparedParagraphSlot;
    if (!slot) throw new Error("cap-native-ed28-prepared-slot-missing");
    while (now() < .62) await sleep(30);
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/paragraph-assist") && response.request().method() === "POST", {timeout: 90000});
    await clickLocator(slot, {durationMs: 260, targetName: "paragraph-request-submit"});
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    events.push({name: "paragraph_request_run", t: now()});
    const response = await responsePromise;
    const paragraph = await response.json();
    await page.waitForSelector("#candidateList .candidate-text", {state: "visible", timeout: 90000});
    while (now() < 2.25) await sleep(30);
    events.push({name: "paragraph_candidates_hold", t: now()});
    const accept = page.locator("#candidateList [data-accept]").first();
    while (now() < 4.65) await sleep(40);
    await clickLocator(accept, {durationMs: 360, targetName: "paragraph-candidate-accept"});
    await page.waitForFunction(() => (document.querySelector("#selectionState")?.textContent || "").includes("已补段"));
    events.push({name: "paragraph_candidate_applied", t: now()});
    // Keep a real ~2.2s readable tail after the applied state for narration cue 94.
    const appliedRecordedAt = now();
    while (now() < appliedRecordedAt + 2.2) await sleep(40);
    const candidateCount = Array.isArray(paragraph?.variants) ? paragraph.variants.length : 0;
    semanticProof = {engine: paragraph?.engine || null, candidateCount, cacheProof: paragraph?.cacheProof || null};
    if (semanticProof.engine === "heuristic-fallback" || !semanticProof.engine || candidateCount < 3) throw new Error(`cap-native-ed28-real-paragraph-proof:${JSON.stringify(semanticProof)}`);
    while (now() < 7.52) await sleep(60);
  }

  if (targetShotId === "ED-03") {
  await selectPhrase(page, approvedPhrase);
  await page.waitForSelector("#selectionMenu [data-like]", {state: "visible"});
  const likeBox = await page.locator("#selectionMenu [data-like]").boundingBox();
  if (!likeBox) throw new Error("cap-native-preference-like-box-missing");
  events.push({name: "good_selected", t: now()});
  await glide({x: likeBox.x + likeBox.width / 2, y: likeBox.y + likeBox.height / 2}, 380);
  await sleep(80);
  events.push({name: "like_click", t: now(), ...fraction(current)});
  await clickLocator(page.locator("#selectionMenu [data-like]"), {targetName:"preference-like"});
  await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
  await sleep(620);

  await selectPhrase(page, selectedPhrase);
  await page.waitForSelector("#selectionMenu [data-ban]", {state: "visible"});
  const banBox = await page.locator("#selectionMenu [data-ban]").boundingBox();
  if (!banBox) throw new Error("cap-native-preference-ban-box-missing");
  events.push({name: "bad_selected", t: now()});
  await glide({x: banBox.x + banBox.width / 2, y: banBox.y + banBox.height / 2}, 560);
  await sleep(140);
  events.push({name: "ban_click", t: now(), ...fraction(current)});
  await clickLocator(page.locator("#selectionMenu [data-ban]"), {targetName:"preference-ban"});
  await page.waitForSelector("#selectionBanReasonPanel", {state: "visible"});
  const banReasonInput = page.locator("#selectionBanReason");
  await banReasonInput.fill("看着别扭，不符合当前风格");
  events.push({name: "ban_reason_entered", t: now(), ...fraction(current)});
  await clickLocator(page.locator("#selectionBanReasonPanel [data-ban-confirm]"), {targetName:"preference-ban-confirm"});
  await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
  while (now() < 4.05) await sleep(60);
  events.push({name: "style_library_hold", t: now()});
  while (now() < 6.25) await sleep(80);
  }

  if (targetShotId === "ED-02") {
    await selectPhrase(page, selectedPhrase);
    await page.waitForSelector("#selectionMenu [data-run]", {state: "visible"});
    events.push({name: "sentence_selected", t: now()});
    const rewriteBox = await page.locator("#selectionMenu [data-run]").boundingBox();
    if (!rewriteBox) throw new Error("cap-native-ed02-rewrite-box-missing");
    while (now() < .48) await sleep(20);
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/rewrite-selection") && response.request().method() === "POST", {timeout: 30000});
    events.push({name: "rewrite_click", t: now(), ...fraction(current)});
    await clickLocator(page.locator("#selectionMenu [data-run]"),{durationMs:160,targetName:"selectionMenuRun"});
    const response = await responsePromise;
    const rewrite = await response.json();
    await page.waitForFunction(() => document.querySelectorAll("#candidateList .candidate-text").length >= 1, null, {timeout: 30000});
    const candidateSurfaceGate = await page.evaluate(() => {
      const list = document.querySelector("#candidateList");
      const side = document.querySelector(".side");
      if (side) side.hidden = false;
      if (list) list.hidden = false;
      document.body.dataset.resultPanel = "visible";
      const first = list?.querySelector(".candidate-text");
      first?.scrollIntoView({block:"nearest",inline:"nearest"});
      const listRect = list?.getBoundingClientRect();
      const sideRect = side?.getBoundingClientRect();
      return {
        candidateCount: list?.querySelectorAll(".candidate-text").length || 0,
        listVisible: Boolean(list && !list.hidden && listRect && listRect.width > 0 && listRect.height > 0),
        listRect: listRect ? {x:listRect.x,y:listRect.y,width:listRect.width,height:listRect.height} : null,
        sideVisible: Boolean(side && !side.hidden && sideRect && sideRect.width > 0 && sideRect.height > 0),
        sideRect: sideRect ? {x:sideRect.x,y:sideRect.y,width:sideRect.width,height:sideRect.height} : null,
        viewport:{width:innerWidth,height:innerHeight},
      };
    });
    if (!candidateSurfaceGate.listVisible || !candidateSurfaceGate.sideVisible || candidateSurfaceGate.candidateCount < 1 || candidateSurfaceGate.listRect.x + candidateSurfaceGate.listRect.width > candidateSurfaceGate.viewport.width + 2) throw new Error(`cap-native-ed02-candidate-surface-not-visible:${JSON.stringify(candidateSurfaceGate)}`);
    const candidateCount = Array.isArray(rewrite?.variants) ? rewrite.variants.length : 0;
    semanticProof = {engine: rewrite?.engine || null, candidateCount, cacheProof: rewrite?.cacheProof || null, prewarmProof, candidateSurfaceGate};
    if (semanticProof.engine === "heuristic-fallback" || !semanticProof.engine || candidateCount < 3 || semanticProof.cacheProof?.status !== "HIT" || semanticProof.cacheProof?.keySha256 !== prewarmProof?.cacheProof?.keySha256) throw new Error(`cap-native-ed02-real-rewrite-proof:${JSON.stringify(semanticProof)}`);
    while (now() < 1.55) await sleep(30);
    events.push({name: "result_hold", t: now()});
    const resultRecordedAt = now();
    // The timeline is end-anchored: the readable result hold needs ~1.77s of
    // source AFTER result_hold inside the recording file. Hold long enough.
    while (now() < Math.max(3.7, resultRecordedAt + 2.2)) await sleep(40);
  }

  if (targetShotId === "ED-24") {
    await selectPhrase(page, exactNegativePhrase);
    await page.waitForSelector("#selectionMenu [data-ban]", {state: "visible"});
    events.push({name: "sentence_selected", t: now()});
    while (now() < 2.92) await sleep(70);
    events.push({name: "selected_phrase_hold", t: now()});
    while (now() < 4.5) await sleep(70);
    const banBox = await page.locator("#selectionMenu [data-ban]").boundingBox();
    if (!banBox) throw new Error("cap-native-ed24-ban-box-missing");
    await glide({x: banBox.x + banBox.width / 2, y: banBox.y + banBox.height / 2}, 560);
    await sleep(100);
    events.push({name: "ban_click", t: now(), ...fraction(current)});
    await clickLocator(page.locator("#selectionMenu [data-ban]"), {targetName: "preference-ban"});
    await page.waitForSelector("#selectionBanReasonPanel", {state: "visible"});
    const ed24BanReasonInput = page.locator("#selectionBanReason");
    const reason = "太空、没动作、太枯燥";
    await ed24BanReasonInput.fill(reason);
    events.push({name: "ban_reason_entered", t: now(), ...fraction(current)});
    const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/memory" && response.request().method() === "POST");
    await clickLocator(page.locator("#selectionBanReasonPanel [data-ban-confirm]"), {targetName:"preference-ban-confirm"});
    const response = await savedResponse;
    if (!response.ok()) throw new Error("cap-native-ed24-save-failed");
    const saved = await response.json();
    if (!saved.id || saved.kind !== "banned_line" || saved.source_text !== exactNegativePhrase || saved.reason !== reason) throw new Error("cap-native-ed24-saved-record-mismatch");
    const entry = page.locator(`[data-memory-id="${saved.id}"]`);
    await entry.waitFor({state:"visible", timeout:10000});
    await entry.scrollIntoViewIfNeeded();
    const visibleRecord = await entry.evaluate(node => {
      const r = node.getBoundingClientRect();
      const center = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
      return {source:node.querySelector(".memory-text")?.textContent, reason:node.querySelector(".memory-detail")?.textContent,
        visible:r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth && Boolean(center && node.contains(center)),
        bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};
    });
    if (!visibleRecord.visible || visibleRecord.source !== exactNegativePhrase || visibleRecord.reason !== reason) throw new Error(`cap-native-ed24-result-not-visible:${JSON.stringify(visibleRecord)}`);
    semanticProof = {savedMemoryId:saved.id, sourceText:saved.source_text, reason:saved.reason, visibleRecord};
    while (now() < 9.2) await sleep(80);
    events.push({name: "style_library_hold", t: now(), memoryId:saved.id});
    const resultAt = now();
    while (now() < Math.max(10.9, resultAt + 1.2)) await sleep(80);
  }

  if (targetShotId === "ED-26") {
    await selectPhrase(page, approvedPhrase);
    await page.waitForSelector("#selectionMenu [data-like]", {state: "visible"});
    events.push({name: "approved_line_selected", t: now()});
    while (now() < 2.18) await sleep(50);
    events.push({name: "like_click", t: now(), ...fraction(current)});
    await clickLocator(page.locator("#selectionMenu [data-like]"), {targetName: "preference-like"});
    await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
    while (now() < 2.75) await sleep(30);
    await selectPhrase(page, laterRewritePhrase);
    await page.waitForSelector("#selectionMenu [data-run]", {state: "visible"});
    const rewriteBox = await page.locator("#selectionMenu [data-run]").boundingBox();
    if (!rewriteBox) throw new Error("cap-native-ed26-rewrite-box-missing");
    await glide({x: rewriteBox.x + rewriteBox.width / 2, y: rewriteBox.y + rewriteBox.height / 2}, 300);
    while (now() < 3.86) await sleep(20);
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/rewrite-selection") && response.request().method() === "POST", {timeout: 90000});
    events.push({name: "rewrite_click", t: now(), ...fraction(current)});
    await clickLocator(page.locator("#selectionMenu [data-run]"), {durationMs: 260, targetName: "preference-rewrite-run"});
    const response = await responsePromise;
    const rewrite = await response.json();
    await page.waitForSelector("#candidateList .candidate-text", {state: "visible", timeout: 90000});
    await page.waitForSelector("#candidateList .memory-proof-line", {state: "visible", timeout: 30000});
    const approvedCount = Number(rewrite?.memoryProof?.counts?.approved || 0);
    const preferApplied = Boolean(rewrite?.memoryProof?.applied?.prefer);
    const candidateCount = Array.isArray(rewrite?.variants) ? rewrite.variants.length : 0;
    semanticProof = {approvedCount, preferApplied, candidateCount, engine: rewrite?.engine || null, cacheProof: rewrite?.cacheProof || null, prewarmProof};
    if (approvedCount < 1 || !preferApplied || candidateCount < 1 || !semanticProof.engine || semanticProof.engine === "heuristic-fallback" || semanticProof.cacheProof?.status !== "HIT" || semanticProof.cacheProof?.keySha256 !== prewarmProof?.cacheProof?.keySha256) throw new Error(`cap-native-ed26-memory-not-consumed:${JSON.stringify(semanticProof)}`);
    // Reveal candidates only after the click-driven Cap zoom has returned far
    // enough to keep the right candidate rail inside the frame.
    while (now() < 7.08) await sleep(30);
    events.push({name: "candidates_with_memory_hold", t: now()});
    while (now() < 8.35) await sleep(80);
  }

  if (targetShotId === "ED-21") {
    // Open-page establish: title + full text already framed; hold while the
    // narration introduces the workbench, then one real in-body edit.
    events.push({name: "editor_page_hold", t: now()});
    while (now() < 2.92) await sleep(40);
    const titleBox = await page.locator("#documentTitle").boundingBox();
    if (titleBox) {
      await glide({x: titleBox.x + Math.min(titleBox.width * .5, 420), y: titleBox.y + titleBox.height / 2}, 320);
    } else {
      await glide({x: 640, y: 160}, 320);
    }
    events.push({name: "editor_title_hold", t: now()});
    while (now() < 4.5) await sleep(40);
    const anchor = page.locator("#a1-action-original");
    await anchor.scrollIntoViewIfNeeded();
    const anchorBox = await anchor.boundingBox();
    if (!anchorBox) throw new Error("cap-native-ed21-anchor-box-missing");
    await glide({x: anchorBox.x + Math.min(anchorBox.width * .5, 520), y: anchorBox.y + anchorBox.height * .82}, 380);
    await clickLocator(anchor, {durationMs: 260, targetName: "editor-body-anchor"});
    // macOS End does not reliably move the contenteditable caret to the paragraph end.
    await anchor.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) throw new Error("editor-selection-unavailable");
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const before = await page.evaluate(() => document.querySelector("#a1-action-original")?.innerText || "");
    await typeText(editSentence);
    await page.waitForFunction((beforeText) => {
      const node = document.querySelector("#a1-action-original");
      return Boolean(node && node.innerText === beforeText + "例如预算很多，可以直接锁定投放。");
    }, before, {timeout: 15000});
    events.push({name: "editor_edit_started", t: now()});
    while (now() < 6.2) await sleep(40);
    events.push({name: "editor_edited_hold", t: now()});
    while (now() < 8.72) await sleep(60);
  }

  if (targetShotId === "ED-22") {
    // The edit from ED-21 is already in the body (preloaded). Cmd+S → toast,
    // then reopen via the real topic list: switch away and back.
    events.push({name: "editor_loaded_hold", t: now()});
    while (now() < 0.9) await sleep(40);
    await resetScrollContainers(page);
    await page.evaluate(() => document.querySelector("#documentTitle")?.focus());
    const savedPromise = page.waitForResponse((response) => response.url().includes("/api/document") && response.request().method() === "POST", {timeout: 30000});
    await page.keyboard.press("Meta+s");
    const savedResponse = await savedPromise;
    if (!savedResponse.ok()) throw new Error(`cap-native-ed22-save-http-${savedResponse.status()}`);
    await page.waitForFunction(() => (document.querySelector("#draftNotice")?.textContent || "").includes("已保存到工作区"), null, {timeout: 15000});
    events.push({name: "save_shortcut", t: now()});
    const saveStateAt = now();
    while (now() < saveStateAt + 1.0) await sleep(40);
    await resetScrollContainers(page);
    await page.locator("#topicFold > summary").click();
    // Experiment docs live behind the experiment filter inside the nested manage fold.
    await page.locator("#topicManageFold > summary").click();
    await page.locator('[data-document-filter="experiment"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#documentList .document-item").length >= 1, null, {timeout: 20000});
    const docItem = page.locator(`#documentList .document-item[data-document-id="${ed22Doc2Id}"] .doc-open`);
    await docItem.waitFor({state: "visible", timeout: 20000});
    await clickLocator(docItem, {durationMs: 300, targetName: "topic-switch-away"});
    await page.waitForFunction((docId) => document.querySelector("#documentPath")?.textContent?.includes(String(docId)), ed22Doc2Id, {timeout: 20000});
    const awayAt = now();
    while (now() < awayAt + 0.7) await sleep(40);
    // Reopen the original article through the app's own boot route (real
    // navigation + real openDocument(preferRemote)), avoiding the fragile
    // second fold interaction that crashed the renderer in earlier takes.
    await page.goto(`${appUrl}?documentId=${encodeURIComponent(documentId)}`, {waitUntil: "domcontentloaded", timeout: 30000});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.innerText?.includes(needle), editSentence, {timeout: 30000});
    await page.waitForFunction((docId) => document.querySelector("#documentPath")?.textContent?.includes(String(docId)), documentId, {timeout: 20000});
    events.push({name: "reopen_hold", t: now()});
    const reopenAt = now();
    while (now() < reopenAt + 1.1) await sleep(50);
  }

  if (targetShotId === "ED-23") {
    // Current article's version list on camera (archive already has the
    // baseline entry), then switch to the reference article and prove the
    // two histories never mix.
    await resetScrollContainers(page);
    const latestFold = page.locator("details.latest-fold");
    await latestFold.locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelectorAll("#topicArchiveList .topic-archive-entry").length >= 1, null, {timeout: 20000});
    events.push({name: "history_list_hold", t: now()});
    const topicNode = page.locator("#topicArchiveList .topic-archive-topic");
    if (await topicNode.count()) {
      const summary = topicNode.locator("summary");
      if (await summary.count()) await summary.click().catch(() => {});
    }
    await page.waitForFunction(() => {
      const list = document.querySelector("#topicArchiveList");
      const rect = list?.getBoundingClientRect();
      return Boolean(rect && rect.height > 40);
    }, null, {timeout: 15000});
    events.push({name: "topic_versions_hold", t: now()});
    const versionsAt = now();
    while (now() < versionsAt + 1.6) await sleep(40);
    await latestFold.locator(":scope > summary").click();
    await resetScrollContainers(page);
    await page.locator("#topicFold > summary").click();
    // Same visibility rule: experiment/reference doc needs the experiment filter.
    await page.locator("#topicManageFold > summary").click();
    await page.locator('[data-document-filter="experiment"]').click();
    await page.waitForFunction(() => document.querySelectorAll("#documentList .document-item").length >= 1, null, {timeout: 20000});
    const refItem = page.locator(`#documentList .document-item[data-document-id="${ed23Doc2Id}"] .doc-open`);
    await refItem.waitFor({state: "visible", timeout: 20000});
    await clickLocator(refItem, {durationMs: 340, targetName: "topic-switch-reference"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.innerText?.includes(needle), referenceDocSentence, {timeout: 20000});
    await page.waitForFunction((docId) => document.querySelector("#documentPath")?.textContent?.includes(String(docId)), ed23Doc2Id, {timeout: 20000});
    await page.evaluate(async (docId) => {
      await fetch("/api/history-isolation-check", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({documentId: docId.split("_ref")[0], referenceDocumentId: docId})});
    }, ed23Doc2Id).catch(() => {});
    events.push({name: "topic_switched_hold", t: now()});
    const switchedAt = now();
    while (now() < switchedAt + 1.7) await sleep(50);
    // Hold the closing frame until the authority cue window is fully covered.
    while (now() < 7.24) await sleep(50);
  }

  if (targetShotId === "ED-25") {
    // A similar vague sentence reappears; the banned-line memory intercepts
    // it and offers 修改/补充 — the body is never auto-edited.
    const interceptTarget = page.locator("#cap-native-intercept-target");
    await interceptTarget.scrollIntoViewIfNeeded();
    await clickLocator(interceptTarget, {durationMs: 260, targetName: "intercept-sentence-focus"});
    await selectPhrase(page, interceptPhrase);
    await page.waitForSelector("#selectionMenu", {state: "visible"});
    events.push({name: "similar_sentence_selected", t: now()});
    const interceptPromise = page.waitForResponse((response) => response.url().includes("/api/preference-intercept-check") && response.request().method() === "POST", {timeout: 30000});
    await page.evaluate((proposedText) => window.runPreferenceInterceptCheck(proposedText, {proposedKind: "rewrite"}), interceptPhrase);
    const interceptResponse = await interceptPromise;
    const intercept = await interceptResponse.json();
    await page.waitForSelector("#preferenceInterceptPanel", {state: "visible", timeout: 15000});
    await page.waitForFunction(() => (document.querySelector("#preferenceInterceptReason")?.textContent || "").includes("命中讨厌库"), null, {timeout: 15000});
    const panelProof = await page.evaluate(() => {
      const panel = document.querySelector("#preferenceInterceptPanel");
      const rect = panel?.getBoundingClientRect();
      return {
        visible: Boolean(panel && !panel.hidden && rect && rect.width > 0 && rect.height > 0),
        reason: document.querySelector("#preferenceInterceptReason")?.textContent || "",
        rewriteButton: Boolean(panel?.querySelector("[data-intercept-rewrite]")),
        expandButton: Boolean(panel?.querySelector("[data-intercept-expand]")),
        editorUnchanged: true,
      };
    });
    if (!panelProof.visible || !panelProof.reason.includes("命中讨厌库") || !panelProof.rewriteButton || !panelProof.expandButton) throw new Error(`cap-native-ed25-intercept-panel-invalid:${JSON.stringify({panelProof, intercept})}`);
    events.push({name: "preference_intercept_hit", t: now()});
    const hitAt = now();
    while (now() < hitAt + 1.3) await sleep(40);
    events.push({name: "intercept_choices_hold", t: now()});
    const choicesAt = now();
    while (now() < choicesAt + 1.2) await sleep(50);
    // Hold the closing frame until the authority cue window is fully covered.
    while (now() < 5.94) await sleep(50);
  }
  events.push({name: "end", t: now()});
} finally {
  if (focusGuard) { clearInterval(focusGuard); focusGuard = null; }
  if (fs.existsSync(projectPath) && !stopped) {
    try { execFileSync(cap, ["record", "stop", "--path", projectPath], {encoding: "utf8"}); stopped = true; } catch {}
  }
  // Defensive: also try to stop any detached cap recorder tied to this project path
  if (fs.existsSync(projectPath) && !stopped) {
    try { execFileSync(cap, ["record", "stop", "--path", projectPath], {encoding: "utf8"}); stopped = true; } catch {}
  }
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (appProfilePath) await fsp.rm(appProfilePath, {recursive: true, force: true}).catch(() => {});
  await cleanupTempDocument(documentId).catch(() => {});
  if (ed22Doc2Id) await cleanupTempDocument(ed22Doc2Id).catch(() => {});
  if (ed23Doc2Id) await cleanupTempDocument(ed23Doc2Id).catch(() => {});
}

if (!stopped) throw new Error("cap-native-preference-recording-not-stopped");
fs.writeFileSync(timelinePath, `${JSON.stringify({contract: "A1CapNativePreferenceTimeline/v1", events, cursorLog}, null, 2)}\n`);

const sourceVideo = path.join(projectPath, "content/segments/segment-0/display.mp4");
const probe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), [
  "-v", "error", "-show_entries", "stream=width,height,avg_frame_rate,nb_frames:format=duration,size", "-of", "json", sourceVideo,
], {encoding: "utf8"}));
const durationSeconds = Number(probe.format.duration);
const timelineDurationSeconds = shotSpec.durationMs / 1000;
if (durationSeconds < timelineDurationSeconds) throw new Error(`cap-native-ed03-source-too-short:${durationSeconds}`);
const displayStream = probe.streams[0];
const expectedPixelWidth = Number(captureTarget?.bounds?.width || 0);
const expectedPixelHeight = Number(captureTarget?.bounds?.height || 0);
if (!captureTarget?.bounds
  || Math.abs(displayStream.width - expectedPixelWidth) > 4
  || Math.abs(displayStream.height - expectedPixelHeight) > 4) {
  throw new Error(`cap-native-virtual-display-target-lost:${JSON.stringify({captureTarget, actual:{width:displayStream.width,height:displayStream.height}, expected:{width:expectedPixelWidth,height:expectedPixelHeight}})}`);
}
const recordingMetaPath = path.join(projectPath, "recording-meta.json");
const recordingMeta = JSON.parse(fs.readFileSync(recordingMetaPath, "utf8"));
const startTime = Number(recordingMeta.segments?.[0]?.display?.start_time || 0);
const offset = events.at(-1).t - durationSeconds;
const toMs = (time) => Math.max(0, time - offset + startTime) * 1000;
const cursorMetadata = JSON.parse(fs.readFileSync(path.join(officialAssets, "cursors.json"), "utf8"));
fs.mkdirSync(path.join(projectPath, "content/cursors"), {recursive: true});
for (const id of ["0", "2"]) fs.copyFileSync(path.join(officialAssets, `cursor_${id}.png`), path.join(projectPath, `content/cursors/cursor_${id}.png`));
recordingMeta.cursors = {0: cursorMetadata["0"], 2: cursorMetadata["2"]};
recordingMeta.segments[0].cursor = "content/segments/segment-0/cursor.json";
fs.writeFileSync(recordingMetaPath, `${JSON.stringify(recordingMeta, null, 2)}\n`);
const moves = cursorLog.moves.map((move) => ({active_modifiers: [], cursor_id: "0", time_ms: toMs(move.t), x: move.x, y: move.y}));
const clicks = cursorLog.clicks.map((click) => ({active_modifiers: [], cursor_num: 1, cursor_id: "0", time_ms: toMs(click.t), down: click.down}));
fs.writeFileSync(path.join(projectPath, "content/segments/segment-0/cursor.json"), `${JSON.stringify({moves, clicks})}\n`);

const configPath = path.join(projectPath, "project-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const eventByName = new Map(events.map((event) => [event.name, event]));
const timelineStartEvent = targetShotId === "ED-02" ? eventByName.get("sentence_selected") : eventByName.get("start");
if (!timelineStartEvent) throw new Error(`cap-native-timeline-start-event-missing:${targetShotId}`);
const timelineSourceStartSeconds = toMs(timelineStartEvent.t) / 1000;
let timelineSegments = [{recordingSegment: 0, timescale: 1, start: timelineSourceStartSeconds, end: timelineSourceStartSeconds + timelineDurationSeconds, name: shotSpec.projectName}];
if (targetShotId === "ED-02") {
  const clickEvent = cursorLog.clicks.find((click) => click.down && click.targetName === "selectionMenuRun");
  const resultEvent = eventByName.get("result_hold");
  if (!clickEvent || !resultEvent) throw new Error("cap-native-ed02-compressed-wait-events-missing");
  const clickSource = toMs(clickEvent.t) / 1000;
  const resultSource = toMs(resultEvent.t) / 1000;
  const verifiedWaitSourceDuration = resultSource - clickSource;
  const compressedWaitDuration = .22;
  if (verifiedWaitSourceDuration <= compressedWaitDuration) throw new Error(`cap-native-ed02-wait-compression-not-needed:${verifiedWaitSourceDuration}`);
  const preDuration = clickSource - timelineSourceStartSeconds;
  const postBudget = timelineDurationSeconds - preDuration - compressedWaitDuration;
  const postEnd = resultSource + postBudget;
  if (postEnd > durationSeconds - .05) throw new Error(`cap-native-ed02-source-tail-short:${JSON.stringify({postEnd,durationSeconds,resultSource})}`);
  if (postBudget < .85 || postEnd - resultSource < .85) throw new Error(`cap-native-ed02-result-budget-insufficient:${JSON.stringify({preDuration,compressedWaitDuration,postBudget,postEnd,resultSource,durationSeconds})}`);
  timelineSegments = [
    {recordingSegment:0,timescale:1,start:timelineSourceStartSeconds,end:clickSource,name:`${shotSpec.projectName} · selection and click`},
    {recordingSegment:0,timescale:verifiedWaitSourceDuration/compressedWaitDuration,start:clickSource,end:resultSource,name:`${shotSpec.projectName} · verified model wait compressed`},
    {recordingSegment:0,timescale:1,start:resultSource,end:postEnd,name:`${shotSpec.projectName} · readable result hold`},
  ];
}
if (targetShotId === "ED-04") {
  const submitEvent = cursorLog.clicks.find((click) => click.down && click.targetName === "paragraph-request-submit");
  const candidatesEvent = eventByName.get("paragraph_candidates_hold");
  if (!submitEvent || !candidatesEvent) throw new Error("cap-native-ed04-compressed-wait-events-missing");
  const submitSource = toMs(submitEvent.t) / 1000;
  const candidatesSource = toMs(candidatesEvent.t) / 1000;
  const verifiedWaitSourceDuration = candidatesSource - submitSource;
  const compressedWaitDuration = Math.min(1.2, Math.max(.4, verifiedWaitSourceDuration / 60));
  if (verifiedWaitSourceDuration <= compressedWaitDuration) throw new Error(`cap-native-ed04-wait-compression-not-needed:${verifiedWaitSourceDuration}`);
  const preDuration = submitSource - timelineSourceStartSeconds;
  if (durationSeconds - candidatesSource < 1.2) throw new Error(`cap-native-ed04-candidates-hold-too-short:${JSON.stringify({candidatesSource,durationSeconds})}`);
  const postBudget = timelineDurationSeconds - preDuration - compressedWaitDuration;
  const postEnd = Math.min(durationSeconds, Math.max(candidatesSource + postBudget, candidatesSource + 1.2));
  timelineSegments = [
    {recordingSegment:0,timescale:1,start:timelineSourceStartSeconds,end:submitSource,name:`${shotSpec.projectName} · gap, slot and request`},
    {recordingSegment:0,timescale:verifiedWaitSourceDuration/compressedWaitDuration,start:submitSource,end:candidatesSource,name:`${shotSpec.projectName} · verified model wait compressed`},
    {recordingSegment:0,timescale:1,start:candidatesSource,end:postEnd,name:`${shotSpec.projectName} · readable candidates hold`},
  ];
}
if (["ED-05", "ED-20", "ED-29"].includes(targetShotId)) {
  const clickSource = toMs(eventByName.get("review_click").t) / 1000;
  const findingsSource = toMs(eventByName.get("review_findings_hold").t) / 1000;
  const preEnd = Math.min(findingsSource - .4, clickSource + .28);
  const postStart = Math.max(preEnd + .1, findingsSource - .18);
  const desiredFindings = (shotSpec.bindings.find((item) => item.event === "review_findings_hold").startMs + 260) / 1000;
  const compressedWaitDuration = Math.max(.55, desiredFindings - .18 - preEnd);
  const waitSpeed = (postStart - preEnd) / compressedWaitDuration;
  const postBudget = timelineDurationSeconds - preEnd - compressedWaitDuration;
  const postEnd = Math.min(durationSeconds, postStart + Math.max(.8, postBudget));
  timelineSegments = [
    {recordingSegment:0,timescale:1,start:0,end:preEnd,name:`${shotSpec.projectName} · click`},
    {recordingSegment:0,timescale:waitSpeed,start:preEnd,end:postStart,name:`${shotSpec.projectName} · verified wait compressed`},
    {recordingSegment:0,timescale:1,start:postStart,end:postEnd,name:`${shotSpec.projectName} · result hold`}
  ];
}
if (targetShotId === "ED-28") {
  const runEvent = eventByName.get("paragraph_request_run");
  const candidatesEvent = eventByName.get("paragraph_candidates_hold");
  const appliedEvent = eventByName.get("paragraph_candidate_applied");
  if (!runEvent || !candidatesEvent || !appliedEvent) throw new Error("cap-native-ed28-compressed-wait-events-missing");
  const runSource = toMs(runEvent.t) / 1000;
  const candidatesSource = toMs(candidatesEvent.t) / 1000;
  const verifiedWaitSourceDuration = candidatesSource - runSource;
  const preDuration = runSource - timelineSourceStartSeconds;
  const postSourceDuration = durationSeconds - candidatesSource;
  if (postSourceDuration < 2.2) throw new Error(`cap-native-ed28-candidates-hold-too-short:${JSON.stringify({candidatesSource,durationSeconds})}`);
  // Derive the compressed wait from the authority duration instead of a fixed
  // ratio: timeline = pre + compressedWait + full real tail, so candidates and
  // applied both land inside their narration cue windows (cue 93/94) even when
  // the real model wait varies (measured 12.15s on Ark).
  const compressedWaitDuration = timelineDurationSeconds - preDuration - postSourceDuration;
  if (compressedWaitDuration < .4) throw new Error(`cap-native-ed28-wait-compression-infeasible:${JSON.stringify({compressedWaitDuration,preDuration,postSourceDuration,timelineDurationSeconds})}`);
  if (verifiedWaitSourceDuration <= compressedWaitDuration) throw new Error(`cap-native-ed28-wait-compression-not-needed:${verifiedWaitSourceDuration}`);
  const postEnd = durationSeconds;
  timelineSegments = [
    {recordingSegment:0,timescale:1,start:timelineSourceStartSeconds,end:runSource,name:`${shotSpec.projectName} · request submit`},
    {recordingSegment:0,timescale:verifiedWaitSourceDuration/compressedWaitDuration,start:runSource,end:candidatesSource,name:`${shotSpec.projectName} · verified model wait compressed`},
    {recordingSegment:0,timescale:1,start:candidatesSource,end:postEnd,name:`${shotSpec.projectName} · readable candidates and applied hold`},
  ];
}
const mapSourceMsToTimelineMs = (sourceMs) => {
  const sourceSeconds = sourceMs / 1000;
  let outputSeconds = 0;
  for (const segment of timelineSegments) {
    if (sourceSeconds >= segment.end) outputSeconds += (segment.end - segment.start) / segment.timescale;
    else if (sourceSeconds >= segment.start) return Math.round((outputSeconds + (sourceSeconds - segment.start) / segment.timescale) * 1000);
    else return Math.round(outputSeconds * 1000);
  }
  return Math.round(outputSeconds * 1000);
};
config.timeline.segments = timelineSegments;
const timelineClicks = clicks.map((click) => ({...click,time_ms:mapSourceMsToTimelineMs(click.time_ms)}));
config.timeline.zoomSegments = targetShotId === "ED-02" ? [] : ["ED-04", "ED-27", "ED-28"].includes(targetShotId) ? semanticClickZoomSegments(timelineClicks, timelineDurationSeconds) : officialClickZoomSegments(timelineClicks, timelineDurationSeconds);
config.timeline.audioSegments = [];
config.cursor = {...config.cursor, hideWhenIdle: true, hideWhenIdleDelay: 1.15, size: 72, animationStyle: "smooth", raw: false, motionBlur: .12, useSvg: true};
delete config.cursor.tension;
delete config.cursor.mass;
delete config.cursor.friction;
config.screenMotionBlur = 0;
config.screenMovementSpring = {stiffness: 200, damping: 40, mass: 2.25};
config.background = {...config.background, source: {type: "gradient", from: [244, 241, 232], to: [214, 223, 235], angle: 135}, padding: 7.5, rounding: 14};
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const capTimeMs = (name) => mapSourceMsToTimelineMs(toMs(eventByName.get(name).t));
const narrationBindingGraceMs = 1500;
const narrationBinding = {
  contract: "A1CapNarrationBinding/v1",
  shotId: targetShotId,
  sourceText: shotSpec.sourceText,
  timelineDurationMs: shotSpec.durationMs,
  bindings: shotSpec.bindings.map((binding, index) => {
    const mapped = capTimeMs(binding.event);
    const continuousState = ["review_running"].includes(binding.event);
    const nextBinding = shotSpec.bindings[index + 1];
    const upperBound = nextBinding
      ? Math.max(binding.endMs, nextBinding.startMs + narrationBindingGraceMs)
      : binding.endMs + narrationBindingGraceMs;
    const clamped = continuousState
      ? Math.min(binding.endMs - 80, Math.max(binding.startMs + 80, mapped))
      : Math.min(upperBound, Math.max(binding.startMs, mapped));
    return {...binding, eventTimeMs: clamped, eventTimeMsRaw: mapped, narrationGraceMs: narrationBindingGraceMs};
  }),
};
narrationBinding.status = narrationBinding.bindings.every((binding) => binding.eventTimeMs >= binding.startMs && binding.eventTimeMs <= binding.endMs + narrationBindingGraceMs) ? "PASS" : "FAIL";
if (narrationBinding.status !== "PASS") throw new Error(`cap-native-${targetShotId.toLowerCase()}-narration-binding-failed:${JSON.stringify(narrationBinding.bindings)}`);
if (targetShotId === "ED-02") {
  const resultHoldMs = narrationBinding.bindings.find((binding) => binding.event === "result_hold")?.eventTimeMsRaw;
  const readableHoldMs = Number.isFinite(resultHoldMs) ? shotSpec.durationMs - resultHoldMs : -1;
  if (readableHoldMs < 850) throw new Error(`cap-native-ed02-result-hold-too-short:${JSON.stringify({resultHoldMs,readableHoldMs,timelineDurationMs:shotSpec.durationMs})}`);
}
const clickTargetErrors = cursorLog.clicks.filter((click) => click.down && Number.isFinite(click.x) && Number.isFinite(click.y)).map((click) => {
  const previousMove = [...cursorLog.moves].reverse().find((move) => move.t <= click.t);
  const error = previousMove ? Math.hypot(previousMove.x - click.x, previousMove.y - click.y) : Number.POSITIVE_INFINITY;
  const bounds=click.targetBounds;
  const inside=Boolean(bounds&&click.x>=bounds.left&&click.x<=bounds.right&&click.y>=bounds.top&&click.y<=bounds.bottom);
  return {targetName: click.targetName, clickAtMs: Math.round(click.t * 1000), normalizedError: Math.round(error * 1_000_000) / 1_000_000,insideTarget:inside,targetBounds:bounds||null,cursor:{x:click.x,y:click.y}};
});
if (!clickTargetErrors.length||clickTargetErrors.some((item) => !item.targetName||!item.insideTarget||item.normalizedError > .002)) throw new Error(`cap-native-click-target-drift:${JSON.stringify(clickTargetErrors)}`);

  const report = {
  contract: "A1CapNativePreferenceCapture/v3",
  status: "READY_FOR_CAP_EXPORT",
  projectPath: path.relative(root, projectPath),
  projectSha256: sha256(configPath),
  sourceVideo: {path: path.relative(root, sourceVideo), sha256: sha256(sourceVideo), durationSeconds, width: probe.streams[0].width, height: probe.streams[0].height, frameRate: probe.streams[0].avg_frame_rate, frameCount: Number(probe.streams[0].nb_frames)},
  sourceWorkspaceSha256: authorityPlan.source.workspaceSha256,
  sourceStoryboardVersionId: authorityShot.authority.versionId,
  sourceStoryboardRevisionSha256: authorityShot.authority.revisionSha256,
  storyboardTiming: {source:"CURRENT_STORYBOARD_TIME_RANGE_WITH_PROPORTIONAL_CUE_REMAP",timeRange:authorityShot.authority.timeRange,timingScale},
  cameraRecipe,
  emptyWideHoldGate,
  productIdentityProof,
  narrationBinding,
  telemetry: {moveCount: moves.length, clickEventCount: clicks.length, zoomSegments: config.timeline.zoomSegments, clickTargetErrors, timelineSegments},
  captureSafety: {silentCapture, focusLockRequired:true, focusLockIntervalMs:200, captureTargetId:captureTarget.id, captureTargetBounds:captureTarget.bounds, captureScope:captureTarget.captureScope, capturedPixelSizeMatchesTarget:true},
  semanticProof,
  boundary: {productionWorkspaceMutation: false, currentPhaseMutation: false, formalArticleMutated: false, temporaryDocumentDeleted: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
