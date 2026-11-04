import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "storyboard-template-confirmation-preview", stamp);
const currentDir = path.join(root, ".codex-artifacts", "storyboard-template-confirmation-preview", "current");
const publicConfirmationDir = path.join(root, "public", "template-confirmations");

await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });
await fs.mkdir(publicConfirmationDir, { recursive: true });

const prototypeCandidate = {
  contract: "A1TemplateConfirmationCandidate/v1",
  status: "prototype-not-approved",
  confirmationMode: "one-template-at-a-time",
  templateFirstContract: "A1TemplateFirstVisualRoute/v1",
  templateFirst: true,
  selfMadeTemplateAllowed: false,
  pack: "EvidenceImagePack",
  templateId: "evidence-browser-source-clean-01",
  visualTask: "real_evidence_image",
  sourceFamily: "A1 handmade CSS browser evidence prototype",
  adapterBoundary: "prototype-only-not-for-routing",
  sourceTier: "real-webpage-screenshot",
  mainSurfaceAllowed: ["cached-png", "cached-jpg", "cached-webp", "live-playwright-screenshot"],
  directExternalRenderAllowed: false,
  importedProductShellAllowed: false,
  approvalNote: "User observed odd motion. This candidate is kept as workflow proof only and must not be routed into article generation.",
  previewAsset: "assets/web-assets/fixtures/jitter-templates-page.png",
  requiredArticleSlots: [
    "sentence.text",
    "sentence.entities",
    "asset.sourceUrl",
    "asset.cachedBitmapPath",
    "asset.sourceHost",
    "focalCrop",
    "caption",
  ],
  editableSlots: [
    {
      id: "assetImage",
      label: "main bitmap / screenshot",
      type: "image-url-or-local-file",
      target: "sourcePlane,browserCard",
      required: true,
    },
    {
      id: "headline",
      label: "headline",
      type: "text",
      target: "captionLockup.h2",
      required: true,
    },
    {
      id: "caption",
      label: "caption",
      type: "text",
      target: "captionLockup.p",
      required: true,
    },
    {
      id: "sourceHost",
      label: "source host / browser path",
      type: "text",
      target: "browserBar,sourceStrip",
      required: true,
    },
    {
      id: "motion",
      label: "duration, easing, push intensity, focus drift",
      type: "motion-params",
      target: "cssVariables",
      required: true,
    },
  ],
  routeWhen: [
    "sentence cites a website, source, paper, product page, dashboard, repository, or public evidence",
    "sentence needs visual proof rather than abstract illustration",
    "article entity can be captured as a real webpage or image",
  ],
  rejectIf: [
    "selfMadeTemplatePromoted",
    "placeholderSvgAsMainVisual",
    "genericHudLineArtAsTemplate",
    "fakeBrowserOrFakeEvidence",
    "templateSourceMissing",
    "adapterBoundaryMissing",
    "screenshotGateMissing",
    "realArticleSlotsMissing",
  ],
  futureRouterRule: {
    contract: "A1ConfirmedTemplateRouterRule/v1",
    statusAfterUserApproval: "confirmed",
    sentenceSignals: ["source", "website", "page", "paper", "report", "screenshot", "repository", "platform", "证据", "来源", "网页", "论文", "报告", "截图"],
    forbiddenFallback: "generic-svg-diagram",
    outputShotModule: "ImageEvidenceShot",
  },
};

const candidate = {
  ...prototypeCandidate,
  status: "pending-user-confirmation",
  templateId: "rve-ken-burns-source-faithful-v1",
  sourceFamily: "reactvideoeditor/remotion-templates / Ken Burns",
  sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
  sourceDemo: "https://www.reactvideoeditor.com/remotion-templates/ken-burns",
  sourcePath: "templates/ken-burns.tsx",
  sourceTier: "open-source-remotion-template-pattern",
  sourceTemplateKind: "frame-driven Remotion React component",
  sourceFaithfulPreview: true,
  a1OverlayDefault: false,
  adapterBoundary: "A1 HTML preview adapter now; Remotion component adapter required before confirmed routing",
  approvalNote: "Template 02 shows a source-faithful Ken Burns preview first. A1 text/source overlays are optional and disabled by default.",
  futureRouterRule: {
    ...prototypeCandidate.futureRouterRule,
    statusAfterUserApproval: "confirmed-after-remotion-adapter",
    outputShotModule: "ImageEvidenceShot",
    sourceTemplateId: "rve-ken-burns-evidence-plate",
  },
};

const candidateJson = JSON.stringify(candidate, null, 2);
const prototypeCandidateJson = JSON.stringify(prototypeCandidate, null, 2);
const escapedCandidateJson = candidateJson.replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Template Confirmation - RVE Ken Burns</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050504;
      --ink: #f7f1e3;
      --muted: rgba(247, 241, 227, .64);
      --soft: rgba(247, 241, 227, .42);
      --line: rgba(247, 241, 227, .13);
      --panel: rgba(17, 17, 14, .84);
      --accent: #d9ff3d;
      --cyan: #7fd9ff;
      --red: #ff6d6d;
      --shadow: rgba(0, 0, 0, .54);
      --motion-duration: 9s;
      --source-push-scale: 1.08;
      --source-push-x: -1.6%;
      --source-push-y: -1.2%;
      --page-scan-scale: 1.12;
      --page-scan-y: -5.2%;
      --browser-end-scale: 1.03;
      --browser-end-x: -2.4%;
      --browser-end-y: -1.2%;
      --focus-end-x: -18%;
      --focus-end-y: 18%;
      --focus-end-scale: .82;
      --stage-fit: cover;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 16% 10%, rgba(217, 255, 61, .09), transparent 26rem),
        radial-gradient(circle at 88% 0%, rgba(127, 217, 255, .08), transparent 34rem),
        linear-gradient(180deg, rgba(255, 255, 255, .03), transparent 36rem),
        var(--bg);
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }

    main {
      width: min(1680px, 100vw);
      margin: 0 auto;
      padding: 28px;
    }

    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 500px;
      gap: 34px;
      align-items: end;
      padding: 10px 0 24px;
      border-bottom: 1px solid var(--line);
    }

    h1 {
      margin: 0;
      max-width: 1060px;
      font-size: clamp(34px, 4.8vw, 76px);
      line-height: .92;
      letter-spacing: 0;
    }

    .top p {
      margin: 0;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.55;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      gap: 22px;
      padding-top: 22px;
    }

    .stage-wrap,
    .side,
    .bottom {
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: 0 24px 70px var(--shadow);
    }

    .stage-wrap {
      padding: 18px;
    }

    .template-stage {
      position: relative;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #070705;
      isolation: isolate;
    }

    .source-plane {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #0a0b09;
    }

    .source-plane img {
      position: absolute;
      width: 121%;
      height: 121%;
      left: -9%;
      top: -9%;
      object-fit: var(--stage-fit);
      filter: saturate(.98) contrast(1.03) brightness(.96);
      transform-origin: 49% 41%;
      animation: sourcePush var(--motion-duration) cubic-bezier(.16, 1, .3, 1) infinite;
    }

    .source-plane::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(0, 0, 0, .16), transparent 30%, rgba(0, 0, 0, .18)),
        linear-gradient(0deg, rgba(0, 0, 0, .12), transparent 40%, rgba(0, 0, 0, .08));
      pointer-events: none;
    }

    .browser-card {
      position: absolute;
      inset: 9% 7% 13% 34%;
      border: 1px solid rgba(255, 255, 255, .16);
      background: rgba(11, 13, 14, .42);
      box-shadow: 0 26px 72px rgba(0, 0, 0, .56);
      transform-origin: 62% 50%;
      animation: browserReveal var(--motion-duration) cubic-bezier(.16, 1, .3, 1) infinite;
      overflow: hidden;
      opacity: .86;
      display: none;
    }

    .template-stage[data-browser-frame="true"] .browser-card {
      display: block;
    }

    .browser-bar {
      height: 36px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 13px;
      background: rgba(8, 9, 8, .78);
      border-bottom: 1px solid rgba(255, 255, 255, .12);
    }

    .browser-bar i {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: rgba(255, 255, 255, .35);
    }

    .browser-bar span {
      margin-left: 8px;
      min-width: 0;
      color: rgba(247, 241, 227, .58);
      font: 700 11px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .browser-card img {
      display: block;
      width: 100%;
      height: calc(100% - 36px);
      object-fit: cover;
      object-position: 46% 32%;
      transform-origin: 42% 30%;
      animation: pageScan var(--motion-duration) cubic-bezier(.16, 1, .3, 1) infinite;
    }

    .caption-lockup {
      position: absolute;
      left: 5.2%;
      bottom: 9.5%;
      width: min(52%, 650px);
      z-index: 3;
      display: none;
    }

    .template-stage[data-text-overlay="true"] .caption-lockup:not([data-empty="true"]) {
      display: block;
    }

    .caption-lockup[data-empty="true"] {
      display: none;
    }

    .caption-lockup::before {
      content: "";
      position: absolute;
      left: 0;
      top: 3px;
      bottom: 8px;
      width: 4px;
      background: var(--accent);
      box-shadow: 0 0 28px rgba(217, 255, 61, .38);
      animation: markIn var(--motion-duration) cubic-bezier(.16, 1, .3, 1) infinite;
    }

    .caption-lockup h2 {
      margin: 0;
      padding-left: 24px;
      max-width: 780px;
      font-size: clamp(36px, 4vw, 82px);
      line-height: .94;
      letter-spacing: 0;
    }

    .caption-lockup p {
      margin: 18px 0 0;
      padding-left: 24px;
      max-width: 640px;
      color: rgba(247, 241, 227, .74);
      font-size: clamp(15px, 1.2vw, 22px);
      line-height: 1.42;
      font-weight: 760;
    }

    .source-strip {
      position: absolute;
      left: 5.2%;
      right: 5.2%;
      bottom: 3.6%;
      display: flex;
      justify-content: space-between;
      gap: 18px;
      color: rgba(247, 241, 227, .52);
      font: 800 11px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
      letter-spacing: 0;
      z-index: 4;
      display: none;
    }

    .template-stage[data-source-strip="true"] .source-strip {
      display: flex;
    }

    .focus-window {
      position: absolute;
      right: 8.8%;
      top: 19.4%;
      width: 24%;
      aspect-ratio: 1 / 1;
      border: 1px solid rgba(217, 255, 61, .82);
      box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, .6),
        0 0 0 999px rgba(0, 0, 0, .2),
        0 0 38px rgba(217, 255, 61, .16);
      mix-blend-mode: screen;
      animation: focusDrift var(--motion-duration) cubic-bezier(.16, 1, .3, 1) infinite;
      z-index: 2;
      pointer-events: none;
      display: none;
    }

    .progress {
      position: absolute;
      left: 5.2%;
      right: 5.2%;
      bottom: 1.7%;
      height: 3px;
      background: rgba(255, 255, 255, .1);
      z-index: 4;
      overflow: hidden;
    }

    .progress i {
      display: block;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--cyan));
      transform-origin: left center;
      animation: progress var(--motion-duration) linear infinite;
    }

    .stage-note {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .source-mode-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-bottom: 12px;
      border: 1px solid rgba(217, 255, 61, .34);
      background: rgba(217, 255, 61, .09);
      color: var(--accent);
      padding: 7px 9px;
      font: 900 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }

    .side {
      padding: 18px;
      display: grid;
      gap: 14px;
      align-content: start;
    }

    .side h2,
    .bottom h2 {
      margin: 0;
      font-size: 15px;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .meta {
      display: grid;
      gap: 9px;
      padding: 13px;
      border: 1px solid rgba(247, 241, 227, .1);
      background: rgba(0, 0, 0, .22);
    }

    .meta b {
      color: var(--ink);
      font-size: 13px;
    }

    .meta span,
    .meta li {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.36;
    }

    .meta ul {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
    }

    .reject li {
      color: rgba(255, 170, 170, .74);
    }

    .editor {
      display: grid;
      gap: 11px;
      padding: 13px;
      border: 1px solid rgba(217, 255, 61, .26);
      background: rgba(217, 255, 61, .055);
    }

    .editor label {
      display: grid;
      gap: 6px;
      color: rgba(247, 241, 227, .7);
      font-size: 12px;
      font-weight: 800;
    }

    .editor input,
    .editor textarea,
    .editor select {
      width: 100%;
      min-width: 0;
      border: 1px solid rgba(247, 241, 227, .18);
      border-radius: 0;
      background: rgba(0, 0, 0, .32);
      color: var(--ink);
      padding: 9px 10px;
      font: 700 12px/1.35 "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
      outline: none;
    }

    .editor textarea {
      min-height: 70px;
      resize: vertical;
    }

    .editor input[type="range"] {
      padding: 0;
      accent-color: var(--accent);
    }

    .control-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }

    .toggle-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .toggle-row label {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 38px;
      border: 1px solid rgba(247, 241, 227, .13);
      background: rgba(0, 0, 0, .18);
      padding: 8px;
      font-size: 11px;
    }

    .toggle-row input {
      width: auto;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .editor button {
      border: 1px solid rgba(247, 241, 227, .2);
      background: rgba(247, 241, 227, .08);
      color: var(--ink);
      padding: 9px 10px;
      font: 900 12px/1 "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
      cursor: pointer;
    }

    .editor button.primary {
      border-color: rgba(217, 255, 61, .52);
      background: rgba(217, 255, 61, .16);
      color: var(--accent);
    }

    .export-box {
      min-height: 110px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: rgba(247, 241, 227, .72);
    }

    .bottom {
      margin-top: 22px;
      padding: 18px;
    }

    .route-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 14px;
    }

    .route {
      min-height: 128px;
      padding: 14px;
      border: 1px solid rgba(247, 241, 227, .1);
      background: rgba(0, 0, 0, .2);
    }

    .route strong {
      display: block;
      margin-bottom: 8px;
      font-size: 17px;
    }

    .route p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }

    @keyframes sourcePush {
      0% { transform: scale(1.02) translate3d(0, 0, 0); }
      20% { transform: scale(1.02) translate3d(0, 0, 0); }
      62% { transform: scale(var(--source-push-scale)) translate3d(var(--source-push-x), var(--source-push-y), 0); }
      100% { transform: scale(var(--source-push-scale)) translate3d(var(--source-push-x), var(--source-push-y), 0); }
    }

    @keyframes browserReveal {
      0% { opacity: .72; transform: translate3d(0, 0, 0) scale(.99); clip-path: inset(0 0 0 0); }
      24% { opacity: .86; transform: translate3d(0, 0, 0) scale(.99); clip-path: inset(0 0 0 0); }
      70% { opacity: .9; transform: translate3d(var(--browser-end-x), var(--browser-end-y), 0) scale(var(--browser-end-scale)); }
      100% { opacity: .9; transform: translate3d(var(--browser-end-x), var(--browser-end-y), 0) scale(var(--browser-end-scale)); }
    }

    @keyframes pageScan {
      0%, 16% { transform: scale(1.05) translateY(0); }
      64%, 100% { transform: scale(var(--page-scan-scale)) translateY(var(--page-scan-y)); }
    }

    @keyframes markIn {
      0%, 12% { transform: scaleY(0); transform-origin: top center; }
      22%, 100% { transform: scaleY(1); transform-origin: top center; }
    }

    @keyframes focusDrift {
      0%, 18% { opacity: 0; transform: translate3d(-8%, 4%, 0) scale(.92); }
      30% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      64%, 100% { opacity: .86; transform: translate3d(var(--focus-end-x), var(--focus-end-y), 0) scale(var(--focus-end-scale)); }
    }

    @keyframes progress {
      from { transform: scaleX(0); }
      to { transform: scaleX(1); }
    }
  </style>
</head>
<body>
  <main data-template-confirmation-contract="A1TemplateConfirmationCandidate/v1" data-template-count="1" data-confirmation-mode="one-template-at-a-time">
    <section class="top">
      <h1>模板确认 02：RVE Ken Burns 原版优先</h1>
      <p>先看来源模板本身：只保留图片和 Ken Burns 推拉。文字、来源条、浏览器框都默认关闭，确认原版运动对了之后再决定是否加 A1 叠加层。</p>
    </section>

    <section class="layout">
      <div class="stage-wrap">
        <div class="source-mode-badge">source faithful preview</div>
        <div class="template-stage" id="templateStage" data-text-overlay="false" data-source-strip="false" data-browser-frame="false" aria-label="RVE Ken Burns source-faithful template preview">
          <div class="source-plane">
            <img class="editable-asset-image" src="${candidate.previewAsset}" alt="" />
          </div>
          <div class="browser-card">
            <div class="browser-bar"><i></i><i></i><i></i><span id="browserPathText">reactvideoeditor.com/remotion-templates/ken-burns</span></div>
            <img class="editable-asset-image" src="${candidate.previewAsset}" alt="" />
          </div>
          <div class="focus-window" aria-hidden="true"></div>
          <div class="caption-lockup">
            <h2 id="headlineText"></h2>
            <p id="captionText"></p>
          </div>
          <div class="source-strip"><span id="sourceLeftText">RVE / Ken Burns</span><span id="sourceRightText">preview</span></div>
          <div class="progress"><i></i></div>
        </div>
        <div class="stage-note">
          <span>阶段：pending-user-confirmation</span>
          <span>只评估源模板运动；叠加层默认关闭。</span>
        </div>
      </div>

      <aside class="side">
        <h2>Template Editor</h2>
        <div class="editor" data-template-editor-contract="A1TemplateParameterEditor/v1">
          <label>
            图片 URL
            <input id="assetUrlInput" type="text" value="${candidate.previewAsset}" autocomplete="off" />
          </label>
          <label>
            本地图片
            <input id="assetFileInput" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label>
            主标题
            <textarea id="headlineInput" placeholder="可选：需要 A1 文字层时再填写"></textarea>
          </label>
          <label>
            字幕
            <textarea id="captionInput" placeholder="可选：需要字幕层时再填写"></textarea>
          </label>
          <label>
            来源 / 浏览器地址
            <input id="sourceInput" type="text" value="reactvideoeditor.com/remotion-templates/ken-burns" autocomplete="off" />
          </label>
          <div class="control-row">
            <label>
              时长 <span id="durationValue">9s</span>
              <input id="durationInput" type="range" min="4" max="16" step="0.5" value="9" />
            </label>
            <label>
              推拉强度 <span id="pushValue">1.00</span>
              <input id="pushInput" type="range" min="0" max="2" step="0.05" value="1" />
            </label>
          </div>
          <div class="control-row">
            <label>
              曲线
              <select id="easingInput">
                <option value="cinematic" selected>Cinematic</option>
                <option value="snappy">Snappy</option>
                <option value="soft">Soft</option>
                <option value="linear">Linear</option>
              </select>
            </label>
            <label>
              焦点漂移 <span id="focusValue">1.00</span>
              <input id="focusInput" type="range" min="0" max="2" step="0.05" value="1" />
            </label>
          </div>
          <div class="toggle-row">
            <label><input id="textOverlayInput" type="checkbox" />文字层</label>
            <label><input id="sourceStripInput" type="checkbox" />来源条</label>
            <label><input id="browserFrameInput" type="checkbox" />浏览器框</label>
          </div>
          <div class="button-row">
            <button class="primary" id="exportParamsButton" type="button">导出参数</button>
            <button id="resetParamsButton" type="button">重置</button>
          </div>
          <textarea class="export-box" id="exportParamsText" readonly></textarea>
        </div>
        <h2>Candidate Contract</h2>
        <div class="meta">
          <b>模板包</b>
          <span>${candidate.pack}</span>
        </div>
        <div class="meta">
          <b>来源边界</b>
          <span>${candidate.sourceFamily}</span>
          <span>${candidate.sourceDemo}</span>
          <span>${candidate.adapterBoundary}</span>
          <span>Template 01: prototype-not-approved</span>
        </div>
        <div class="meta">
          <b>必须提供</b>
          <ul>${candidate.requiredArticleSlots.map((slot) => `<li>${slot}</li>`).join("")}</ul>
        </div>
        <div class="meta reject">
          <b>硬拒绝</b>
          <span>不能用自制 SVG 线框、假浏览器或占位图冒充成熟模板。</span>
          <ul>${candidate.rejectIf.slice(0, 5).map((rule) => `<li>${rule}</li>`).join("")}</ul>
        </div>
      </aside>
    </section>

    <section class="bottom">
      <h2>确认后文章路由</h2>
      <div class="route-grid">
        <article class="route">
          <strong>适用句型</strong>
          <p>“报告显示……”“网页上可以看到……”“论文/仓库/产品页证明……”这类需要真实材料的句子。</p>
        </article>
        <article class="route">
          <strong>自动素材动作</strong>
          <p>先抓网页或图片，缓存成 PNG/JPG/WebP，记录来源，再交给模板做裁切、推拉、来源条和字幕。</p>
        </article>
        <article class="route">
          <strong>不允许降级</strong>
          <p>没有真实截图时不能假装浏览器、不能用简单线条画、不能把调试 HUD 当成专业模板。</p>
        </article>
      </div>
    </section>
  </main>
  <script type="application/json" id="a1-template-confirmation-candidate">${escapedCandidateJson}</script>
  <script>
    (() => {
      const candidate = JSON.parse(document.getElementById("a1-template-confirmation-candidate").textContent);
      const stage = document.getElementById("templateStage");
      const assetImages = Array.from(document.querySelectorAll(".editable-asset-image"));
      const controls = {
        assetUrl: document.getElementById("assetUrlInput"),
        assetFile: document.getElementById("assetFileInput"),
        headline: document.getElementById("headlineInput"),
        caption: document.getElementById("captionInput"),
        source: document.getElementById("sourceInput"),
        duration: document.getElementById("durationInput"),
        push: document.getElementById("pushInput"),
        easing: document.getElementById("easingInput"),
        focus: document.getElementById("focusInput"),
        textOverlay: document.getElementById("textOverlayInput"),
        sourceStrip: document.getElementById("sourceStripInput"),
        browserFrame: document.getElementById("browserFrameInput"),
        exportText: document.getElementById("exportParamsText"),
        exportButton: document.getElementById("exportParamsButton"),
        resetButton: document.getElementById("resetParamsButton"),
      };
      const textNodes = {
        headline: document.getElementById("headlineText"),
        caption: document.getElementById("captionText"),
        browserPath: document.getElementById("browserPathText"),
        sourceLeft: document.getElementById("sourceLeftText"),
        sourceRight: document.getElementById("sourceRightText"),
        durationValue: document.getElementById("durationValue"),
        pushValue: document.getElementById("pushValue"),
        focusValue: document.getElementById("focusValue"),
      };
      const easingMap = {
        cinematic: "cubic-bezier(.16, 1, .3, 1)",
        snappy: "cubic-bezier(.2, .9, .12, 1)",
        soft: "cubic-bezier(.33, 0, .2, 1)",
        linear: "linear",
      };
      const defaults = {
        assetUrl: candidate.previewAsset,
        headline: "",
        caption: "",
        source: "reactvideoeditor.com/remotion-templates/ken-burns",
        duration: 9,
        push: 1,
        easing: "cinematic",
        focus: 1,
        textOverlay: false,
        sourceStrip: false,
        browserFrame: false,
      };
      let objectUrl = "";

      const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
      const params = () => ({
        contract: "A1TemplateParameterSet/v1",
        templateId: candidate.templateId,
        status: "draft-from-review-ui",
        asset: {
          url: controls.assetUrl.value.trim() || defaults.assetUrl,
          sourceHost: controls.source.value.trim() || defaults.source,
          localFilePreview: Boolean(objectUrl),
        },
        text: {
          headline: controls.headline.value.trim(),
          caption: controls.caption.value.trim(),
        },
        overlays: {
          text: controls.textOverlay.checked,
          sourceStrip: controls.sourceStrip.checked,
          browserFrame: controls.browserFrame.checked,
        },
        motion: {
          durationSeconds: clamp(controls.duration.value, 4, 16),
          easing: controls.easing.value,
          easingCurve: easingMap[controls.easing.value] || easingMap.cinematic,
          pushIntensity: clamp(controls.push.value, 0, 2),
          focusDrift: clamp(controls.focus.value, 0, 2),
        },
      });

      const applyMotion = (motion) => {
        const push = motion.pushIntensity;
        const focus = motion.focusDrift;
        stage.style.setProperty("--motion-duration", motion.durationSeconds + "s");
        stage.style.setProperty("--source-push-scale", String(1.02 + push * .06));
        stage.style.setProperty("--source-push-x", (-1.6 * push) + "%");
        stage.style.setProperty("--source-push-y", (-1.2 * push) + "%");
        stage.style.setProperty("--page-scan-scale", String(1.05 + push * .07));
        stage.style.setProperty("--page-scan-y", (-5.2 * push) + "%");
        stage.style.setProperty("--browser-end-scale", String(1 + push * .03));
        stage.style.setProperty("--browser-end-x", (-2.4 * push) + "%");
        stage.style.setProperty("--browser-end-y", (-1.2 * push) + "%");
        stage.style.setProperty("--focus-end-x", (-18 * focus) + "%");
        stage.style.setProperty("--focus-end-y", (18 * focus) + "%");
        stage.style.setProperty("--focus-end-scale", String(1 - focus * .18));
        for (const node of document.querySelectorAll(".source-plane img, .browser-card, .browser-card img, .caption-lockup, .focus-window")) {
          node.style.animationTimingFunction = motion.easingCurve;
        }
        document.querySelector(".progress i").style.animationTimingFunction = "linear";
      };

      const apply = () => {
        const next = params();
        const imageUrl = objectUrl || next.asset.url;
        for (const image of assetImages) image.src = imageUrl;
        textNodes.headline.textContent = next.text.headline;
        textNodes.caption.textContent = next.text.caption;
        document.querySelector(".caption-lockup").dataset.empty = next.text.headline || next.text.caption ? "false" : "true";
        stage.dataset.textOverlay = next.overlays.text ? "true" : "false";
        stage.dataset.sourceStrip = next.overlays.sourceStrip ? "true" : "false";
        stage.dataset.browserFrame = next.overlays.browserFrame ? "true" : "false";
        textNodes.browserPath.textContent = next.asset.sourceHost;
        textNodes.sourceLeft.textContent = next.asset.sourceHost;
        textNodes.sourceRight.textContent = "preview";
        textNodes.durationValue.textContent = next.motion.durationSeconds + "s";
        textNodes.pushValue.textContent = next.motion.pushIntensity.toFixed(2);
        textNodes.focusValue.textContent = next.motion.focusDrift.toFixed(2);
        applyMotion(next.motion);
        controls.exportText.value = JSON.stringify(next, null, 2);
      };

      controls.assetFile.addEventListener("change", () => {
        const file = controls.assetFile.files && controls.assetFile.files[0];
        if (!file) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);
        controls.assetUrl.value = file.name;
        apply();
      });

      for (const control of [controls.assetUrl, controls.headline, controls.caption, controls.source, controls.duration, controls.push, controls.easing, controls.focus, controls.textOverlay, controls.sourceStrip, controls.browserFrame]) {
        control.addEventListener("input", apply);
        control.addEventListener("change", apply);
      }

      controls.exportButton.addEventListener("click", () => {
        controls.exportText.focus();
        controls.exportText.select();
      });

      controls.resetButton.addEventListener("click", () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = "";
        controls.assetFile.value = "";
        controls.assetUrl.value = defaults.assetUrl;
        controls.headline.value = defaults.headline;
        controls.caption.value = defaults.caption;
        controls.source.value = defaults.source;
        controls.duration.value = String(defaults.duration);
        controls.push.value = String(defaults.push);
        controls.easing.value = defaults.easing;
        controls.focus.value = String(defaults.focus);
        controls.textOverlay.checked = defaults.textOverlay;
        controls.sourceStrip.checked = defaults.sourceStrip;
        controls.browserFrame.checked = defaults.browserFrame;
        apply();
      });

      apply();
    })();
  </script>
</body>
</html>`;

const publicHtmlPath = path.join(root, "public", "storyboard-template-confirmation-preview.html");
const artifactHtmlPath = path.join(artifactDir, "storyboard-template-confirmation-preview.html");
const currentHtmlPath = path.join(currentDir, "storyboard-template-confirmation-preview.html");
const publicJsonPath = path.join(publicConfirmationDir, "rve-ken-burns-source-faithful-v1.json");
const artifactJsonPath = path.join(artifactDir, "rve-ken-burns-source-faithful-v1.json");
const currentJsonPath = path.join(currentDir, "rve-ken-burns-source-faithful-v1.json");
const publicPrototypeJsonPath = path.join(publicConfirmationDir, "evidence-browser-source-clean-01.json");
const artifactPrototypeJsonPath = path.join(artifactDir, "evidence-browser-source-clean-01.prototype-not-approved.json");
const currentPrototypeJsonPath = path.join(currentDir, "evidence-browser-source-clean-01.prototype-not-approved.json");

await fs.writeFile(publicHtmlPath, html);
await fs.writeFile(artifactHtmlPath, html);
await fs.writeFile(currentHtmlPath, html);
await fs.writeFile(publicJsonPath, `${candidateJson}\n`);
await fs.writeFile(artifactJsonPath, `${candidateJson}\n`);
await fs.writeFile(currentJsonPath, `${candidateJson}\n`);
await fs.writeFile(publicPrototypeJsonPath, `${prototypeCandidateJson}\n`);
await fs.writeFile(artifactPrototypeJsonPath, `${prototypeCandidateJson}\n`);
await fs.writeFile(currentPrototypeJsonPath, `${prototypeCandidateJson}\n`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(`file://${publicHtmlPath}`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(artifactDir, "storyboard-template-confirmation-preview.png"), fullPage: true });
await page.screenshot({ path: path.join(currentDir, "storyboard-template-confirmation-preview.png"), fullPage: true });
await browser.close();

console.log(JSON.stringify({
  contract: "A1TemplateConfirmationPreviewArtifact/v1",
  publicHtmlPath,
  publicJsonPath,
  artifactHtmlPath,
  artifactJsonPath,
  screenshotPath: path.join(artifactDir, "storyboard-template-confirmation-preview.png"),
}, null, 2));
