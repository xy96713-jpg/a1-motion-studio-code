import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toStoryboardRenderProps } from "../lib/storyboard-render-props.js";
import {
  buildHtmlVideoContentGraph,
  buildHtmlVideoTemplateManifest,
  manifestToYaml,
} from "../lib/storyboard-html-video-adapter.js";
import { resolveEntityAsset } from "../lib/storyboard-entity-assets.js";
import { LAYOUT_PRIMITIVE_CONTRACT, LAYOUT_PRIMITIVES, layoutPrimitiveForScene } from "../lib/storyboard-layout-primitives.js";
import { buildArticleFilmTimelineRuntime } from "../lib/storyboard-article-film-runtime.js";

const root = process.cwd();

const sampleProject = {
  title: "AI 辅助写作工作台成熟度复盘",
  projectKind: "document",
  fps: 30,
  durationPerScene: 4,
  sourceText: `Hi，我做了一个 AI 辅助写作工作台。
但真正用下来，问题也很明显：中文稿子经常有 AI 味。
所以更靠谱的写法，是把工作往前移。
Codex 负责后台编排，Kimi 写完整稿，DeepSeek 做局部细修。
写作工具真正该留下的，可能就是这种稳定感。`,
  scenes: [
    { id: "opening", type: "cover", headline: "AI 辅助写作工作台", body: "从模型问题转向流程问题", duration: 4 },
    { id: "problem", type: "point", headline: "问题不是模型本身", body: "中文稿子经常有 AI 味", duration: 4 },
    { id: "method", type: "word-sequence", headline: "把工作往前移", wordSequence: { items: ["先找材料", "先定方向", "先想读者会卡在哪里"] }, duration: 4 },
    { id: "roles", type: "word-sequence", headline: "三套模型分工", body: "Codex 负责后台编排，Kimi 写完整稿，DeepSeek 做局部细修", duration: 4 },
    {
      id: "proof",
      type: "point",
      headline: "证据要回灌",
      body: "每次失败截图都要变成下一轮审计规则",
      duration: 4,
      contentGraphEdit: {
        contract: "A1FrontendContentGraphEdit/v1",
        storyRole: "proof",
        whyThisBeatExists: "用失败截图证明质量闭环",
      },
    },
    {
      id: "real-media",
      type: "point",
      headline: "真实截图先入场",
      body: "图片段落必须使用真实素材，图片和文字分开承载。",
      duration: 4,
      assetUrl: "assets/a1-sample-real-media.svg",
      assets: [
        {
          id: "a1-sample-real-media",
          name: "A1 sample real media",
          url: "assets/a1-sample-real-media.svg",
          type: "image/svg+xml",
          fit: "contain",
        },
      ],
    },
    { id: "closing", type: "closing", headline: "留下稳定感", body: "不是一键好稿，而是可复用判断", duration: 4 },
  ],
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asSafeText(value = "") {
  return escapeHtml(String(value || "").replace(/\s+/g, " ").trim());
}

function svgMarkupForAsset(asset = {}) {
  const svg = asset.iconSvg || "";
  const cropViewBox = asset.visualContract?.cropViewBox || "";
  if (cropViewBox && /\bviewBox=["'][^"']+["']/u.test(svg)) {
    return svg.replace(/\bviewBox=["'][^"']+["']/u, `viewBox="${cropViewBox}"`);
  }
  return svg;
}

function entityRoleIconHtml(label = "") {
  const asset = resolveEntityAsset(label);
  const visual = asset.visualContract || {};
  if (asset.iconSvg && !asset.fallback) {
    return {
      attrs: [
        `data-entity="${escapeHtml(asset.canonicalName || label)}"`,
        `data-asset-source="${escapeHtml(asset.source || "")}"`,
        `data-asset-fallback="false"`,
        `data-asset-type="${escapeHtml(visual.assetType || asset.assetType || "")}"`,
        `data-asset-variant="${escapeHtml(visual.variant || asset.variant || "")}"`,
      ].join(" "),
      icon: `<span class="roleIcon" aria-hidden="true">${svgMarkupForAsset(asset)}</span>`,
    };
  }
  return {
    attrs: [
      `data-entity="${escapeHtml(asset.canonicalName || label)}"`,
      `data-asset-source="${escapeHtml(asset.source || "monogram-fallback")}"`,
      `data-asset-fallback="true"`,
      `data-asset-type="monogram"`,
    ].join(" "),
    icon: `<span class="roleIcon roleIconFallback" aria-hidden="true">${asSafeText(asset.monogram || label.slice(0, 1))}</span>`,
  };
}

function roleRowsForScene(scene = {}) {
  const directRows = Array.isArray(scene.roleRows) ? scene.roleRows : [];
  const flowRows = Array.isArray(scene.roleFlowItems) ? scene.roleFlowItems : [];
  const rows = directRows.length ? directRows : flowRows;
  if (rows.length) {
    return rows
      .map((row) => ({
        name: String(row.name || row.label || row.entity || "").trim(),
        task: String(row.task || row.responsibility || row.body || row.description || "").trim(),
      }))
      .filter((row) => row.name && row.task);
  }

  const actorRows = Array.isArray(scene.beat?.actorPlan) ? scene.beat.actorPlan : [];
  const byIndex = new Map();
  for (const actor of actorRows) {
    const match = String(actor.id || "").match(/role-(\d+)-(name|task)$/u);
    if (!match) continue;
    const [, index, slot] = match;
    const record = byIndex.get(index) || {};
    record[slot] = String(actor.text || "").trim();
    byIndex.set(index, record);
  }
  return [...byIndex.values()]
    .map((row) => ({ name: row.name || "", task: row.task || "" }))
    .filter((row) => row.name && row.task);
}

function motionActorFor(scene = {}, role = "", occurrence = 0) {
  const actors = Array.isArray(scene.motionActorPlan?.actors) ? scene.motionActorPlan.actors : [];
  return actors.filter((actor) => actor.role === role)[occurrence] || null;
}

function motionActorData(scene = {}, role = "", occurrence = 0) {
  const actor = motionActorFor(scene, role, occurrence);
  if (!actor) return "";
  return [
    `data-motion-actor-id="${escapeHtml(actor.id || "")}"`,
    `data-motion-actor-role="${escapeHtml(actor.role || "")}"`,
    `data-motion-actor-phase="${escapeHtml(actor.phase || "")}"`,
    `data-motion-actor-entrance="${escapeHtml(actor.entrance || "")}"`,
    `data-motion-actor-delay-ms="${escapeHtml(String(actor.delayMs || 0))}"`,
    `style="--delay:${Number(actor.delayMs || 0) / 1000}s"`,
  ].join(" ");
}

function firstRealAsset(scene = {}) {
  const assets = Array.isArray(scene.assets) ? scene.assets : [];
  const directUrl = scene.assetUrl || scene.imageUrl || scene.mediaUrl || scene.screenshotUrl || "";
  const asset = assets.find((candidate) => candidate?.url || candidate?.src) || (directUrl ? { id: "scene-asset", name: scene.titleLines?.[0] || "real asset", url: directUrl, type: "" } : null);
  if (!asset) return null;
  const url = String(asset.url || asset.src || "").trim();
  if (!url || /^data:|^blob:/u.test(url)) return null;
  return {
    id: String(asset.id || asset.name || url).trim(),
    name: String(asset.name || asset.title || asset.id || "real asset").trim(),
    url,
    type: String(asset.type || "").trim(),
    fit: String(asset.fit || "contain").trim(),
  };
}

function assetHtml(scene = {}) {
  const asset = firstRealAsset(scene);
  if (!asset) return "";
  return `
    <figure class="realAssetFrame" data-motion-actor="asset" ${motionActorData(scene, "asset", 0)} data-real-asset="true" data-real-asset-id="${escapeHtml(asset.id)}" data-real-asset-source="${escapeHtml(asset.url)}" data-real-asset-type="${escapeHtml(asset.type)}" data-real-asset-fit="${escapeHtml(asset.fit)}">
      <img src="${escapeHtml(asset.url)}" alt="${asSafeText(asset.name)}" />
    </figure>
  `;
}

function actorHtml(scene = {}, node = {}) {
  const title = asSafeText((scene.titleLines || []).join(" "));
  const rawBody = (scene.bodyLines || []).join(" ");
  const body = asSafeText(rawBody);
  const items = Array.isArray(scene.listItems) ? scene.listItems : [];
  const role = node.templateCandidate?.layoutRole === "role-grid" ? "roles" : scene.beat?.storyRole || "point";
  if (firstRealAsset(scene)) {
    return `
      <div class="copyStack" data-motion-actor="copy-stack">
        ${body ? `<p class="body" data-motion-actor="body" ${motionActorData(scene, "body", 0)}>${body}</p>` : ""}
      </div>
      ${assetHtml(scene)}
    `;
  }
  if (role === "roles" || /Codex|Kimi|DeepSeek/u.test(`${title} ${body} ${items.join(" ")}`)) {
    const rows = roleRowsForScene(scene);
    return `
      <div class="roleGrid" data-motion-actor="role-grid">
        ${rows.map((row, index) => {
          const assetView = entityRoleIconHtml(row.name);
          return `
          <div class="roleRow" data-motion-actor="role-row" ${assetView.attrs} ${motionActorData(scene, "role-task", index)}>
            ${assetView.icon}
            <strong ${motionActorData(scene, "role-name", index)}>${asSafeText(row.name)}</strong>
            <span ${motionActorData(scene, "role-task", index)}>${asSafeText(row.task)}</span>
          </div>
        `;}).join("")}
      </div>`;
  }
  if (items.length) {
    return `
      <ol class="stepList" data-motion-actor="step-list">
        ${items.slice(0, 4).map((item, index) => `<li data-motion-actor="step-item" ${motionActorData(scene, motionActorFor(scene, "method-step", index) ? "method-step" : "list-item", index)}>${asSafeText(item)}</li>`).join("")}
      </ol>`;
  }
  return `<p class="body" data-motion-actor="body" ${motionActorData(scene, "body", 0)}>${body}</p>`;
}

function nodeForScene(contentGraph = {}, scene = {}) {
  return (contentGraph.nodes || []).find((node) => node.id === scene.id) || {};
}

function frameRecordsForSidecar(props = {}, contentGraph = {}) {
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  const nodes = Array.isArray(contentGraph.nodes) ? contentGraph.nodes : [];
  const frames = Array.isArray(contentGraph.htmlVideoIr?.frameNodes) ? contentGraph.htmlVideoIr.frameNodes : [];
  const maxScenes = Number.isFinite(props.sidecarMaxScenes) && props.sidecarMaxScenes > 0
    ? Math.floor(props.sidecarMaxScenes)
    : scenes.length;
  return scenes.slice(0, maxScenes).map((scene, index) => {
    const node = nodes.find((candidate) => candidate.id === scene.id) || nodes[index] || {};
    const frameCandidate = frames.find((candidate) => candidate.id === scene.id) || frames[index] || null;
    const frame = frameCandidate || {
      id: scene.id,
      index,
      previousId: index > 0 ? scenes[index - 1]?.id || "" : "",
      nextId: index < scenes.length - 1 ? scenes[index + 1]?.id || "" : "",
      start: scene.start,
      duration: scene.duration,
      relationIn: scene.contentGraphNode?.relationFrom || "",
      relationOut: scene.contentGraphNode?.relationTo || "",
      motionBridgeOut: scene.contentGraphNode?.motionBridge || "",
      shotModule: scene.shotModule || node.shotModule || "",
      shotModuleContract: scene.shotModuleContract || node.shotModuleContract || "",
      shotLayerStackContract: scene.shotLayerStackContract || node.shotLayerStackContract || "",
      shotComposition: scene.shotComposition || node.shotComposition || "",
      vectorComposition: scene.vectorComposition || scene.vectorVisualPlan?.composition || node.vectorComposition || "",
      evidenceContract: scene.evidenceContract || node.evidenceContract || "",
      evidenceLayerContract: scene.evidenceLayerContract || node.evidenceLayerContract || "",
      templateCandidateId: node.templateCandidate?.id || "",
      templateLayoutRole: node.templateCandidate?.layoutRole || "",
      inputSlots: Object.keys(node.templateCandidate?.inputSlots || {}),
      actorSlots: Array.isArray(node.templateCandidate?.actorSlots) ? node.templateCandidate.actorSlots : [],
      sourceTraceContract: node.sourceTrace?.contract || "",
      skillRoute: node.skillRoute || scene.skillRoute || {},
    };
    return {
      index,
      scene,
      node,
      frame,
      candidate: node.templateCandidate || {},
    };
  });
}

function csv(values = []) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(",");
}

function externalTemplateIds(candidate = {}) {
  return csv((candidate.externalTemplateReferences || []).map((reference) => reference.sourceTemplateId));
}

function externalTemplateCategoryIds(candidate = {}, frame = {}) {
  return csv([
    ...(candidate.externalTemplateCategoryReferences || []).map((reference) => reference.categoryId),
    ...(frame.externalTemplateCategoryReferences || []).map((reference) => reference.categoryId),
  ]);
}

function primitiveForRecord(scene = {}, candidate = {}, frame = {}) {
  const primitive = scene.layoutPrimitive?.contract === LAYOUT_PRIMITIVE_CONTRACT
    ? scene.layoutPrimitive
    : layoutPrimitiveForScene({
        ...scene,
        beat: {
          ...(scene.beat || {}),
          storyRole: candidate.layoutRole === "role-grid" ? "roles" : candidate.layoutRole === "method-flow" ? "workflow" : scene.beat?.storyRole,
        },
        listItems: candidate.layoutRole === "method-flow" && !scene.listItems?.length ? ["", ""] : scene.listItems,
      });
  const role = frame.templateLayoutRole || candidate.layoutRole || primitive.layoutRole || primitive.id;
  if (role === "role-grid") return LAYOUT_PRIMITIVES["role-grid"];
  if (role === "method-flow") return LAYOUT_PRIMITIVES["method-flow"];
  return primitive;
}

export function sidecarHtml(props = {}, contentGraph = {}) {
  const records = frameRecordsForSidecar(props, contentGraph);
  const ir = contentGraph.htmlVideoIr || {};
  const motif = props.globalMotionMotif || {};
  const motionArc = props.motionArc || {};
  const duration = Number((props.timelineSpec?.totalDuration || props.totalDuration || 1).toFixed(3));
  const articleFilmRuntime = props.articleFilmTimelineRuntime?.contract === "A1ArticleFilmTimelineRuntime/v1"
    ? props.articleFilmTimelineRuntime
    : buildArticleFilmTimelineRuntime({ scenes: props.scenes || [], totalDuration: duration, fps: props.fps || 30 });
  const runtimeJson = JSON.stringify(articleFilmRuntime).replace(/</g, "\\u003c");
  const roleGrid = LAYOUT_PRIMITIVES["role-grid"];
  const methodFlow = LAYOUT_PRIMITIVES["method-flow"];
  return `<!doctype html>
<html id="a1-sidecar-root" lang="zh-CN" data-composition-id="a1-sidecar" data-start="0" data-duration="${duration}" data-composition-duration="${duration}" data-width="1920" data-height="1080" data-composition-width="1920" data-composition-height="1080" data-html-video-contract="${escapeHtml(contentGraph.contract || "")}" data-html-video-ir-contract="${escapeHtml(ir.contract || "")}" data-ir-source-of-truth="${escapeHtml(ir.sourceMaterial?.sourceOfTruth || "")}" data-review-surface="${escapeHtml(ir.reviewSurface || "")}" data-engine-boundary-contract="${escapeHtml(contentGraph.engineBoundary?.contract || "")}" data-engine-adapter="${escapeHtml(ir.engineAdapters?.currentExecutable || "hyperframes")}" data-product-shell-imported="false" data-layout-primitive-contract="${LAYOUT_PRIMITIVE_CONTRACT}" data-article-film-runtime-contract="${escapeHtml(articleFilmRuntime.contract || "")}" data-article-film-runtime-gsap="${escapeHtml(articleFilmRuntime.gsapContract || "")}" data-article-film-runtime-remotion="${escapeHtml(articleFilmRuntime.remotionContract || "")}" data-article-film-runtime-frames="${escapeHtml(String(articleFilmRuntime.totalFrames || 0))}" data-global-motion-motif-contract="${escapeHtml(motif.contract || "")}" data-global-motion-motif-id="${escapeHtml(motif.motifId || "")}" data-global-motion-rhythm="${escapeHtml(motif.visualRhythm || "")}" data-global-motion-accent-strategy="${escapeHtml(motif.accentStrategy || "")}" data-global-motion-recurring-actors="${escapeHtml((motif.recurringActors || []).join(","))}" data-motion-arc-contract="${escapeHtml(motionArc.contract || "")}" data-motion-arc-mode="${escapeHtml(motionArc.arcMode || "")}" data-motion-arc-energy-curve="${escapeHtml((motionArc.energyCurve || []).join(","))}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${asSafeText(props.title)} - HyperFrames Sidecar</title>
  <style>
    :root { color-scheme: dark; --bg:#050707; --ink:#f6f4eb; --muted:#a7aea2; --accent:#c8ff2f; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0b0d0d; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); }
    .stage { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: radial-gradient(circle at 20% 20%, rgba(200,255,47,.08), transparent 28%), var(--bg); border: 1px solid rgba(255,255,255,.08); }
    .scene { position: absolute; inset: 0; padding: 150px 180px; display: grid; align-content: center; gap: 44px; opacity: 0; }
    .scene:first-child { opacity: 1; }
    .scene[data-layout-role="contrast-statement"] { background: linear-gradient(90deg, rgba(200,255,47,.055), transparent 42%); }
    .scene[data-layout-role="cause-chain"] { grid-template-columns: .48fr .52fr; column-gap: 92px; align-content: center; background: radial-gradient(circle at 82% 44%, rgba(200,255,47,.035), transparent 30%), var(--bg); }
    .scene[data-layout-role="cause-chain"] h1 { max-width: 620px; font-size: 66px; line-height: 1.1; }
    .scene[data-layout-role="cause-chain"] .body { max-width: 560px; }
    .scene[data-layout-role="cause-chain"]::after { content:""; grid-column:2; grid-row:1 / span 2; align-self:center; height:320px; border-left:1px solid rgba(200,255,47,.18); background: radial-gradient(circle, rgba(200,255,47,.8) 0 5px, transparent 6px) 0 22% / 100% 1px no-repeat, radial-gradient(circle, rgba(245,243,234,.42) 0 4px, transparent 5px) 0 52% / 100% 1px no-repeat, radial-gradient(circle, rgba(245,243,234,.22) 0 4px, transparent 5px) 0 82% / 100% 1px no-repeat, linear-gradient(90deg, rgba(245,243,234,.14) 0 46%, transparent 46%) 0 22% / 100% 1px no-repeat, linear-gradient(90deg, rgba(245,243,234,.10) 0 58%, transparent 58%) 0 52% / 100% 1px no-repeat, linear-gradient(90deg, rgba(245,243,234,.08) 0 36%, transparent 36%) 0 82% / 100% 1px no-repeat; opacity:.68; }
    .scene[data-layout-role="method-flow"] { align-content: center; grid-template-columns: ${methodFlow.sidecarGridTemplateColumns}; column-gap: ${methodFlow.sidecarColumnGapPx}px; }
    .scene[data-layout-role="method-flow"] .stepList { align-self: center; }
    .scene[data-layout-role="role-grid"] { grid-template-columns: ${roleGrid.sidecarGridTemplateColumns}; column-gap: ${roleGrid.sidecarColumnGapPx}px; align-content: center; }
    .scene[data-layout-role="role-grid"] .roleGrid { align-self: center; }
    .scene[data-layout-role="role-grid"] h1 { max-width: ${roleGrid.title.maxWidthPx}px; font-size: ${roleGrid.title.sidecarFontSizePx}px; line-height: 1.08; text-wrap: nowrap; white-space: nowrap; }
    .scene[data-layout-role="memory-hold"] { justify-items: center; text-align: center; background: radial-gradient(circle at 50% 50%, rgba(200,255,47,.05), transparent 36%), var(--bg); }
    .scene[data-layout-role="memory-hold"] h1,
    .scene[data-layout-role="memory-hold"] .body { max-width: 980px; }
    .scene[data-layout-role="quote-air"] { justify-items: center; text-align: center; background: radial-gradient(circle at 50% 46%, rgba(245,248,238,.045), transparent 42%), var(--bg); }
    .scene[data-layout-role="quote-air"] h1 { max-width: 1040px; font-size: 72px; line-height: 1.14; font-weight: 860; }
    .scene[data-layout-role="quote-air"] .body { max-width: 760px; font-size: 30px; }
    .scene[data-layout-role="closing-hold"] { justify-items: center; text-align: center; background: radial-gradient(circle at 50% 52%, rgba(200,255,47,.055), transparent 44%), var(--bg); }
    .scene[data-layout-role="closing-hold"] h1 { max-width: 940px; font-size: 78px; line-height: 1.08; }
    .scene[data-layout-role="data-metric"] { grid-template-columns: .46fr .54fr; column-gap: 96px; align-content: center; }
    .scene[data-layout-role="data-metric"] h1 { max-width: 560px; font-size: 66px; line-height: 1.08; }
    .scene[data-layout-role="comparison-table"] { grid-template-columns: .44fr .56fr; column-gap: 98px; align-content: center; }
    .scene[data-layout-role="comparison-table"] h1 { max-width: 540px; font-size: 64px; line-height: 1.08; }
    .scene[data-layout-role="image-focus"] { grid-template-columns: minmax(520px, .42fr) minmax(740px, .58fr); column-gap: 92px; align-content: center; align-items: center; }
    .scene[data-layout-role="image-focus"] h1 { grid-column: 1; grid-row: 1; align-self: end; max-width: 520px; font-size: 66px; line-height: 1.1; }
    .scene[data-layout-role="image-focus"] .copyStack { grid-column: 1; grid-row: 2; align-self: start; max-width: 520px; }
    .scene[data-layout-role="image-focus"] .body { max-width: 500px; font-size: 30px; line-height: 1.42; }
    .scene[data-layout-role="image-focus"] .realAssetFrame { grid-column: 2; grid-row: 1 / span 2; }
    .realAssetFrame { margin: 0; width: 820px; height: 560px; display: grid; place-items: center; overflow: hidden; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 34px 90px rgba(0,0,0,.34); }
    .realAssetFrame img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .kicker { color: var(--accent); font-size: 28px; font-weight: 800; letter-spacing: 0; }
    h1 { margin: 0; max-width: 1180px; font-size: 92px; line-height: 1.04; letter-spacing: 0; text-wrap: balance; }
    .body { margin: 0; max-width: 880px; font-size: 38px; line-height: 1.4; color: var(--muted); }
    .stepList { position: relative; margin: 0; padding: 8px 0 8px 0; display: grid; gap: 0; list-style: none; max-width: ${methodFlow.sidecarStepListMaxWidthPx}px; }
    .stepList::before { content: ""; position: absolute; top: 18px; bottom: 18px; left: ${methodFlow.spineLeftPx}px; width: 1px; background: rgba(200,255,47,.34); }
    .stepList li { position: relative; min-height: ${methodFlow.sidecarRowMinHeightPx}px; padding: ${methodFlow.rowPadding}; border-bottom: 1px solid rgba(255,255,255,.12); font-size: 36px; line-height: 1.28; color: var(--ink); }
    .stepList li::before { content: ""; position: absolute; left: ${methodFlow.dotLeftPx}px; top: 34px; width: ${methodFlow.dotSizePx}px; height: ${methodFlow.dotSizePx}px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 ${methodFlow.dotHaloPx}px rgba(200,255,47,.08); }
    .stepList li:last-child { border-bottom-color: rgba(200,255,47,.32); color: var(--accent); }
    .roleGrid { display: grid; gap: 0; width: 920px; }
    .roleRow { display: grid; grid-template-columns: ${roleGrid.rowColumns.sidecar}; gap: ${roleGrid.row.gapPx}px; align-items: center; min-height: ${roleGrid.row.sidecarMinHeightPx}px; padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,.14); }
    .roleRow:first-child { border-top: 1px solid rgba(255,255,255,.14); }
    .roleIcon { width: ${roleGrid.iconSurface.width}px; height: ${roleGrid.iconSurface.height}px; display: grid; place-items: center; border-radius: 12px; background: #f2f0e8; color: #0b0d0d; font-weight: 900; overflow: hidden; }
    .roleIcon svg { width: 28px; height: 28px; display: block; color: #0b0d0d; }
    .roleRow[data-asset-variant="app-icon-square"] .roleIcon svg { width: 30px; height: 30px; max-width: 30px; max-height: 30px; }
    .roleRow[data-asset-type="wordmark"] .roleIcon svg { width: 54px; max-height: 18px; height: auto; }
    .roleIconFallback { background: var(--accent); }
    .roleRow strong, .roleRow span { font-size: 34px; line-height: 1.2; }
  </style>
</head>
<body>
  <main id="a1-sidecar-stage" class="stage" data-composition-id="a1-sidecar" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080" data-fps="${props.fps}" data-html-video-ir-contract="${escapeHtml(ir.contract || "")}" data-ir-source-of-truth="${escapeHtml(ir.sourceMaterial?.sourceOfTruth || "")}" data-review-surface="${escapeHtml(ir.reviewSurface || "")}" data-layout-primitive-contract="${LAYOUT_PRIMITIVE_CONTRACT}" data-article-film-runtime-contract="${escapeHtml(articleFilmRuntime.contract || "")}" data-article-film-runtime-gsap="${escapeHtml(articleFilmRuntime.gsapContract || "")}" data-article-film-runtime-remotion="${escapeHtml(articleFilmRuntime.remotionContract || "")}" data-article-film-runtime-frames="${escapeHtml(String(articleFilmRuntime.totalFrames || 0))}">
    ${records.map(({ scene, node, frame, candidate, index }) => {
      const primitive = primitiveForRecord(scene, candidate, frame);
      const arcNode = scene.motionArcNode || {};
      return `
      <section class="clip scene" id="${escapeHtml(scene.id)}" data-scene-id="${escapeHtml(scene.id)}" data-ir-frame-index="${escapeHtml(frame.index ?? index)}" data-ir-previous-id="${escapeHtml(frame.previousId || "")}" data-ir-next-id="${escapeHtml(frame.nextId || "")}" data-relation-in="${escapeHtml(frame.relationIn || "")}" data-relation-out="${escapeHtml(frame.relationOut || "")}" data-motion-bridge-in="${escapeHtml(frame.motionBridgeIn || "")}" data-motion-bridge-out="${escapeHtml(frame.motionBridgeOut || "")}" data-transition-effect-in="${escapeHtml(frame.transitionEffectIn || "")}" data-transition-effect-out="${escapeHtml(frame.transitionEffectOut || "")}" data-shot-module="${escapeHtml(frame.shotModule || node.shotModule || scene.shotModule || "")}" data-shot-module-contract="${escapeHtml(frame.shotModuleContract || node.shotModuleContract || scene.shotModuleContract || "")}" data-shot-layer-stack-contract="${escapeHtml(frame.shotLayerStackContract || node.shotLayerStackContract || scene.shotLayerStackContract || "")}" data-shot-composition="${escapeHtml(frame.shotComposition || node.shotComposition || scene.shotComposition || "")}" data-vector-composition="${escapeHtml(frame.vectorComposition || node.vectorComposition || scene.vectorComposition || "")}" data-image-evidence-contract="${escapeHtml(frame.evidenceContract || node.evidenceContract || scene.evidenceContract || "")}" data-image-evidence-layer-contract="${escapeHtml(frame.evidenceLayerContract || node.evidenceLayerContract || scene.evidenceLayerContract || "")}" data-skill-route-contract="${escapeHtml(frame.skillRoute?.contract || node.skillRoute?.contract || "")}" data-skill-id="${escapeHtml(frame.skillRoute?.skillId || node.skillRoute?.skillId || "")}" data-skill-source-project="${escapeHtml(frame.skillRoute?.sourceProject || node.skillRoute?.sourceProject || "")}" data-skill-source="${escapeHtml(frame.skillRoute?.sourceSkill || node.skillRoute?.sourceSkill || "")}" data-skill-template-candidates="${escapeHtml(csv(frame.skillRoute?.manifestCandidates || node.skillRoute?.manifestCandidates || []))}" data-skill-motion-candidates="${escapeHtml(csv(frame.skillRoute?.preferredMotionPrimitives || node.skillRoute?.preferredMotionPrimitives || []))}" data-start="${escapeHtml(frame.start ?? scene.start)}" data-duration="${escapeHtml(frame.duration ?? scene.duration)}" data-track-index="${index}" data-runtime-shot-id="${escapeHtml(articleFilmRuntime.shots?.[index]?.id || scene.id)}" data-runtime-start-frame="${escapeHtml(String(articleFilmRuntime.shots?.[index]?.startFrame ?? ""))}" data-runtime-end-frame="${escapeHtml(String(articleFilmRuntime.shots?.[index]?.endFrame ?? ""))}" data-runtime-labels="${escapeHtml(csv(Object.values(articleFilmRuntime.shots?.[index]?.labels || {})))}" data-motion-primitive="${escapeHtml(node.motionPrimitive || scene.beat?.motionPrimitive || "fade-slide")}" data-template-candidate="${escapeHtml(frame.templateCandidateId || candidate.id || "")}" data-source-template-contract="${escapeHtml(candidate.sourceTemplateContract || "")}" data-source-template-id="${escapeHtml(candidate.sourceTemplateId || "")}" data-external-template-contract="A1HtmlVideoExternalTemplateReference/v1" data-external-template-source="nexu-io/html-video" data-external-template-reference-only="true" data-external-template-ids="${escapeHtml(externalTemplateIds(candidate))}" data-external-template-category-contract="A1ExternalTemplateCategoryReference/v1" data-external-template-category-ids="${escapeHtml(externalTemplateCategoryIds(candidate, frame))}" data-layout-role="${escapeHtml(frame.templateLayoutRole || candidate.layoutRole || primitive.layoutRole || "")}" data-layout-primitive-contract="${escapeHtml(primitive.contract || "")}" data-layout-primitive-id="${escapeHtml(primitive.id || "")}" data-motion-grammar="${escapeHtml(candidate.motionGrammar || "")}" data-visual-job="${escapeHtml(candidate.visualJob || scene.motionActorPlan?.visualJob || "")}" data-motion-actor-plan-contract="${escapeHtml(scene.motionActorPlan?.contract || "")}" data-motion-actor-rhythm="${escapeHtml(scene.motionActorPlan?.rhythm || "")}" data-motion-actor-count="${escapeHtml(String(scene.motionActorPlan?.actorCount || 0))}" data-motion-arc-node-contract="${escapeHtml(arcNode.contract || "")}" data-motion-arc-phase="${escapeHtml(arcNode.phase || "")}" data-motion-arc-energy="${escapeHtml(String(arcNode.energy || ""))}" data-motion-arc-transition="${escapeHtml(arcNode.transitionIntent || "")}" data-input-slots="${escapeHtml(csv(frame.inputSlots))}" data-actor-slots="${escapeHtml(csv(frame.actorSlots))}" data-source-trace-contract="${escapeHtml(frame.sourceTraceContract || node.sourceTrace?.contract || "")}">
        <h1 data-motion-actor="title" ${motionActorData(scene, "title", 0)}>${asSafeText((scene.titleLines || []).join(" "))}</h1>
        ${actorHtml(scene, node)}
      </section>
    `;}).join("")}
  </main>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
  <script>
    window.__A1_ARTICLE_FILM_RUNTIME__ = ${runtimeJson};
    if (!window.gsap) {
      window.gsap = {
        timeline() {
          let duration = 0;
          const api = {
            paused: true,
            set() { return api; },
            from(_targets, vars = {}, at = 0) { duration = Math.max(duration, Number(at) + Number(vars.duration || 0)); return api; },
            to(_targets, vars = {}, at = 0) { duration = Math.max(duration, Number(at) + Number(vars.duration || 0)); return api; },
            pause() { return api; },
            seek() { return api; },
            progress() { return api; },
            totalTime() { return api; },
            duration() { return Math.max(duration, ${duration}); },
            totalDuration() { return Math.max(duration, ${duration}); },
          };
          return api;
        },
      };
    }
    window.__timelines = window.__timelines || {};
    const runtime = window.__A1_ARTICLE_FILM_RUNTIME__;
    const tl = gsap.timeline({ paused: true });
    const scenes = Array.from(document.querySelectorAll(".scene"));
    scenes.forEach((scene, index) => {
      const shot = runtime.shots[index] || {};
      const start = Number(shot.start ?? scene.dataset.start);
      const duration = Number(shot.duration ?? scene.dataset.duration);
      Object.values(shot.labels || {}).forEach((label) => tl.addLabel(label, Number((shot.phases || []).find((phase) => label.endsWith(":" + phase.id))?.absoluteStart ?? start)));
      scene.dataset.runtimeShotId = shot.id || scene.dataset.sceneId || "";
      scene.dataset.runtimeStartFrame = String(shot.startFrame ?? "");
      scene.dataset.runtimeEndFrame = String(shot.endFrame ?? "");
      tl.set(scene, { opacity: 1 }, start);
      scene.querySelectorAll("[data-motion-actor], [data-motion-actor-id]").forEach((actor, actorIndex) => {
        const delay = Number(actor.dataset.motionActorDelayMs || 0) / 1000;
        tl.from(actor, {
          y: actor.dataset.motionActorEntrance === "icon-pop-soft" ? 12 : 28,
          opacity: 0,
          duration: 0.56,
          ease: "power3.out",
        }, start + delay + actorIndex * 0.002);
      });
      const emphasis = (shot.phases || []).find((phase) => phase.id === "emphasis");
      const transition = (shot.phases || []).find((phase) => phase.id === "transition");
      const title = scene.querySelector("[data-motion-actor='title']");
      if (title && emphasis) {
        tl.to(title, { scale: 1.012, duration: Math.max(0.18, emphasis.end - emphasis.start), ease: emphasis.easing || "power2.out" }, emphasis.absoluteStart);
      }
      if (transition) {
        tl.to(scene, { x: index % 2 === 0 ? -18 : 18, duration: Math.max(0.18, transition.end - transition.start), ease: transition.easing || "power2.inOut" }, transition.absoluteStart);
      }
      if (index < scenes.length - 1) tl.set(scene, { opacity: 0 }, start + duration - 0.08);
    });
    window.__timelines["a1-sidecar"] = tl;
    tl.progress(0.08);
  </script>
</body>
</html>`;
}

async function main() {
  const outArg = argValue("--out");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(root, outArg || path.join(".codex-artifacts", "hyperframes-sidecars", timestamp));
  const props = toStoryboardRenderProps(sampleProject);
  const contentGraph = buildHtmlVideoContentGraph(props);
  const templateManifest = buildHtmlVideoTemplateManifest(props);

  await fs.mkdir(path.join(outDir, "compositions"), { recursive: true });
  await fs.mkdir(path.join(outDir, "assets"), { recursive: true });
  await fs.writeFile(path.join(outDir, "assets", "a1-sample-real-media.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 560" role="img" aria-label="A1 sample real media">
  <rect width="820" height="560" rx="22" fill="#f4f1e8"/>
  <rect x="42" y="42" width="736" height="476" rx="18" fill="#111515"/>
  <rect x="82" y="86" width="210" height="26" rx="13" fill="#c8ff2f"/>
  <rect x="82" y="134" width="420" height="18" rx="9" fill="#f6f4eb" opacity=".92"/>
  <rect x="82" y="174" width="356" height="18" rx="9" fill="#a7aea2" opacity=".8"/>
  <rect x="82" y="238" width="656" height="1" fill="#f6f4eb" opacity=".18"/>
  <circle cx="136" cy="314" r="34" fill="#c8ff2f"/>
  <rect x="196" y="286" width="286" height="18" rx="9" fill="#f6f4eb" opacity=".9"/>
  <rect x="196" y="326" width="450" height="16" rx="8" fill="#a7aea2" opacity=".72"/>
  <circle cx="136" cy="414" r="34" fill="#f6f4eb" opacity=".88"/>
  <rect x="196" y="386" width="320" height="18" rx="9" fill="#f6f4eb" opacity=".9"/>
  <rect x="196" y="426" width="384" height="16" rx="8" fill="#a7aea2" opacity=".72"/>
</svg>
`);
  await fs.writeFile(path.join(outDir, "a1-sidecar.json"), JSON.stringify(props, null, 2));
  await fs.writeFile(path.join(outDir, "content-graph.json"), JSON.stringify(contentGraph, null, 2));
  await fs.writeFile(path.join(outDir, "html-video-ir.json"), JSON.stringify(contentGraph.htmlVideoIr || {}, null, 2));
  await fs.writeFile(path.join(outDir, "template.html-video.yaml"), manifestToYaml(templateManifest));
  await fs.writeFile(path.join(outDir, "DESIGN.md"), `# DESIGN\n\n视觉身份：深色 matte、单一 lime 强调、真实内容优先。\n\n禁止：制作词、假图标、随机三色字、跳动弹跳、过密背景。\n`);
  await fs.writeFile(path.join(outDir, "SCRIPT.md"), `# SCRIPT\n\n${sampleProject.sourceText}\n`);
  await fs.writeFile(path.join(outDir, "STORYBOARD.md"), `# STORYBOARD\n\n${props.beatGraph.beats.map((beat) => `- ${beat.index + 1}. ${beat.storyRoleLabel}: ${beat.screenText}\n  - purpose: ${beat.purpose}\n  - bridge: ${beat.previousBridge} / ${beat.nextBridge}`).join("\n")}\n`);
  await fs.writeFile(path.join(outDir, "MOTION.md"), `# MOTION\n\n${props.timelineSpec.scenes.map((scene) => `- ${scene.id}: ${scene.motionPrimitive}, ${scene.transition}, ${scene.frameStart}-${scene.frameEnd}f`).join("\n")}\n`);
  await fs.writeFile(path.join(outDir, "index.html"), sidecarHtml(props, contentGraph));
  await fs.writeFile(path.join(outDir, "compositions", "README.md"), "A1 sidecar keeps the HTML composition in index.html for HyperFrames lint/inspect.\n");

  console.log(outDir);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
