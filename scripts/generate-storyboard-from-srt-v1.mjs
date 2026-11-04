#!/usr/bin/env node
/**
 * Build the isolated /storyboard review draft from the real subtitle timeline.
 *
 * This intentionally updates only apps/studio-next/public/generated/storyboard/current.
 * It does not mutate remotion-renderer/src/generated/microbeatLayeredFullProps.json.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function parseTimestamp(raw) {
  const match = raw.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/u);
  if (!match) throw new Error(`invalid srt timestamp: ${raw}`);
  const [, hh, mm, ss, ms] = match;
  return ((Number(hh) * 60 * 60 + Number(mm) * 60 + Number(ss)) * 1000) + Number(ms);
}

function parseSrt(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/u)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex === -1) return null;
      const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((part) => part.trim());
      const text = lines.slice(timeLineIndex + 1).join(" ").replace(/\s+/g, " ").trim();
      if (!text) return null;
      return {
        index: Number(lines[0]) || 0,
        startMs: parseTimestamp(startRaw),
        endMs: parseTimestamp(endRaw),
        text,
      };
    })
    .filter(Boolean);
}

function splitTitleLines(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 12) return [normalized];
  const parts = normalized
    .split(/(?<=[，。！？；：,.!?;:])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const lines = [];
  for (const part of parts.length ? parts : [normalized]) {
    if (part.length <= 14) {
      lines.push(part);
      continue;
    }
    for (let cursor = 0; cursor < part.length; cursor += 14) {
      lines.push(part.slice(cursor, cursor + 14));
    }
  }
  return lines.slice(0, 3);
}

function decideSemanticVisual(shot, visualFocusText, index) {
  const text = shot.text;
  const hasQuestion = /[？?]|为什么|怎么|如何|是否|要不要|能不能|会不会/u.test(text);
  const hasOperation = /划一下|点击|点一下|点选|输入|打开|调节|保存|双击|收稿|标喜欢|丢进|生成|检查|提醒|选择|回填|修改/u.test(text);
  const hasArchive = /喜欢库|讨厌库|风格库|历史|归档|保存|保留|版本|近五次|下次|记住|记录/u.test(text);
  const hasCriteria = /理由|问题|缺|不够|泛泛|废稿|不说人话|没动作|枯燥|是否把.*讲清/u.test(text);
  const hasModel = /模型|Kimi|DeepSeek|AI|Codex|vibe coding|智能写作/u.test(text);
  const hasBranch = /方向|自己的风格|可控|不是一键|要不要|下一步|往哪走/u.test(text);
  const hasCause = /因为|所以|但是|而是|不是|如果|只要|先|再|然后/u.test(text);
  const shortStatement = visualFocusText.length <= 12 || text.length <= 16;

  if (hasArchive) {
    return {
      family: "archive-stack",
      state: /下次|记住|保存/u.test(text) ? "writeback-archive" : "revision-stack",
      label: "归档结构",
      route: "semantic-archive-structure",
      semanticStageKind: "archive-structure",
      mode: "archive",
      layoutFamily: "negative-space-right",
      motionStyle: "stack-accumulate",
      motionArchetype: "stack-accumulate",
      primaryAction: "stack-accumulate",
      primaryCurve: "archive-settle",
      backgroundState: "archive-density",
      choreography: "archive-accumulate",
      kineticMode: "keyword-lock",
      animationTier: "standard-typography",
    };
  }

  if (hasOperation) {
    return {
      family: /理由|检查|提醒/u.test(text) ? "annotation-judgement" : "process-chain",
      state: /理由|检查|提醒/u.test(text) ? "criteria-write" : "line-select",
      label: "操作路径",
      route: "semantic-operation-flow",
      semanticStageKind: "operation-flow",
      mode: "operation",
      layoutFamily: "vertical-sequence",
      motionStyle: "path-draw",
      motionArchetype: "path-draw",
      primaryAction: "path-draw",
      primaryCurve: "editorial-reveal",
      backgroundState: "wireframe-space",
      choreography: "wireframe-draw",
      kineticMode: "relay",
      animationTier: "standard-typography",
    };
  }

  if (hasQuestion || hasBranch) {
    return {
      family: hasBranch ? "direction-convergence" : "editorial-metaphor",
      state: hasBranch ? "decision-branch" : "question",
      label: hasBranch ? "方向判断" : "问题判断",
      route: "semantic-argument-grammar",
      semanticStageKind: "argument-grammar",
      mode: hasBranch ? "decision" : "question",
      layoutFamily: "center-impact",
      motionStyle: hasBranch ? "path-draw" : "relay-reveal",
      motionArchetype: hasBranch ? "path-draw" : "relay-reveal",
      primaryAction: hasBranch ? "path-draw" : "relay-reveal",
      primaryCurve: hasBranch ? "selection-snap" : "editorial-reveal",
      backgroundState: hasBranch ? "wireframe-space" : "paper-field",
      choreography: hasBranch ? "wireframe-draw" : "collage-recompose",
      kineticMode: "keyword-lock",
      animationTier: "formal-highlight",
    };
  }

  if (hasCriteria || hasCause) {
    return {
      family: hasModel ? "model-comparison" : "editorial-metaphor",
      state: hasCriteria ? "criteria-write" : "comparison",
      label: hasCriteria ? "判断标准" : "因果判断",
      route: "semantic-argument-grammar",
      semanticStageKind: "argument-grammar",
      mode: hasCriteria ? "criteria" : "cause",
      layoutFamily: "asymmetric-split",
      motionStyle: hasCriteria ? "annotation-write" : "layout-morph",
      motionArchetype: hasCriteria ? "annotation-write" : "layout-morph",
      primaryAction: hasCriteria ? "annotation-write" : "layout-morph",
      primaryCurve: hasCriteria ? "verdict-cut" : "selection-snap",
      backgroundState: hasCriteria ? "archive-density" : "paper-field",
      choreography: hasCriteria ? "ink-build" : "plate-register",
      kineticMode: "keyword-lock",
      animationTier: "formal-highlight",
    };
  }

  if (hasModel || shortStatement) {
    return {
      family: shortStatement ? "type-statement" : "model-comparison",
      state: "claim",
      label: shortStatement ? "关键词包装" : "模型判断",
      route: "typographic-packaging",
      semanticStageKind: "typographic-packaging",
      mode: "typography",
      layoutFamily: shortStatement ? "center-impact" : "left-anchor",
      motionStyle: "text-mask",
      motionArchetype: "text-mask",
      primaryAction: "text-mask",
      primaryCurve: "editorial-reveal",
      backgroundState: "paper-field",
      choreography: "ink-build",
      kineticMode: "keyword-lock",
      animationTier: index === 0 ? "formal-highlight" : "standard-typography",
    };
  }

  return {
    family: "editorial-metaphor",
    state: "claim",
    label: "字幕包装",
    route: "typographic-packaging",
    semanticStageKind: "typographic-packaging",
    mode: "typography",
    layoutFamily: "left-anchor",
    motionStyle: "relay-reveal",
    motionArchetype: "relay-reveal",
    primaryAction: "relay-reveal",
    primaryCurve: "editorial-reveal",
    backgroundState: "paper-field",
    choreography: "collage-recompose",
    kineticMode: "relay",
    animationTier: "standard-typography",
  };
}

function diversifyVisualDecisionForStoryArc(decision, storyArc, index) {
  const role = storyArc?.cognitiveRole || "supporting-explanation";
  const next = {...decision};
  if (next.backgroundState === "paper-field") {
    if (role === "operation-or-example" || role === "question-or-doubt") {
      next.backgroundState = "wireframe-space";
      next.choreography = next.choreography === "collage-recompose" ? "wireframe-draw" : next.choreography;
    } else if (role === "memory-or-archive" || role === "closing-synthesis") {
      next.backgroundState = "archive-density";
      next.choreography = next.choreography === "collage-recompose" ? "archive-accumulate" : next.choreography;
    } else if (role === "supporting-explanation" && index % 2 === 1) {
      next.backgroundState = "wireframe-space";
      next.choreography = next.choreography === "collage-recompose" ? "plate-register" : next.choreography;
    } else if (role === "cause-effect-judgement" && index % 3 === 2) {
      next.backgroundState = "archive-density";
      next.choreography = next.choreography === "collage-recompose" ? "ink-build" : next.choreography;
    }
  }
  return next;
}

function groupCuesIntoShots(cues) {
  const shots = [];
  let current = null;
  for (const cue of cues) {
    if (!current) {
      current = {
        startMs: cue.startMs,
        endMs: cue.endMs,
        cues: [],
      };
    }
    current.cues.push(cue);
    current.endMs = cue.endMs;
    const text = current.cues.map((item) => item.text).join(" ");
    const duration = current.endMs - current.startMs;
    const sentenceClosed = /[。！？!?]$/u.test(cue.text.trim());
    const tooLong = duration >= 6200;
    const tooManyCues = current.cues.length >= 4;
    if (sentenceClosed || tooLong || tooManyCues) {
      shots.push({
        index: shots.length + 1,
        sourceSubtitleIndexes: current.cues.map((item) => item.index || 0),
        startMs: current.startMs,
        endMs: current.endMs,
        text: text.replace(/\s+/g, " ").trim(),
      });
      current = null;
    }
  }
  if (current) {
    shots.push({
      index: shots.length + 1,
      sourceSubtitleIndexes: current.cues.map((item) => item.index || 0),
      startMs: current.startMs,
      endMs: current.endMs,
      text: current.cues.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
    });
  }
  return shots;
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function inferCognitiveRole(text, index, total) {
  if (index === 0 || /hi|你好|我用|做了一款/u.test(text)) return "opening-orientation";
  if (/[？?]|为什么|怎么|如何|是否|要不要/u.test(text)) return "question-or-doubt";
  if (hasAny(text, ["划一下", "点击", "点一下", "点选", "输入", "打开", "调节", "保存", "双击", "收稿", "标喜欢", "丢进", "生成", "检查", "提醒", "选择", "回填", "修改"])) return "operation-or-example";
  if (hasAny(text, ["喜欢库", "讨厌库", "风格库", "历史", "归档", "保存", "保留", "版本", "近五次", "下次", "记住", "记录"])) return "memory-or-archive";
  if (hasAny(text, ["不是", "但", "但是", "反而", "区别", "对比", "AI 味", "不像人话"])) return "contrast-or-correction";
  if (hasAny(text, ["因为", "所以", "导致", "最后", "结果", "问题", "废稿", "硬伤"])) return "cause-effect-judgement";
  if (index >= total - 2 || hasAny(text, ["总之", "形成", "自己的系统", "下一次"])) return "closing-synthesis";
  return "supporting-explanation";
}

function storyTransition(prevRole, role) {
  if (!prevRole) return "start";
  if (prevRole === role) return "continuation";
  if (role === "question-or-doubt") return "new-question";
  if (role === "operation-or-example") return "example-or-demo";
  if (role === "contrast-or-correction") return "correction";
  if (role === "cause-effect-judgement") return "judgement";
  if (role === "memory-or-archive") return "state-accumulation";
  if (role === "closing-synthesis") return "closing";
  return "support";
}

function segmentationActionFor(shot, role, prevRole, nextRole) {
  const text = shot.text || "";
  const durationMs = Math.max(0, Number(shot.endMs || 0) - Number(shot.startMs || 0));
  if (/^[，。,.、\s]+$/u.test(text) || text.length < 4) {
    return {
      action: "merge-candidate",
      issue: "weak-fragment",
      reason: "Shot text is too weak to carry an independent cognitive unit.",
    };
  }
  if (durationMs < 1300 && role === prevRole) {
    return {
      action: "merge-candidate",
      issue: "short-same-role",
      reason: "Very short shot repeats the previous cognitive role.",
    };
  }
  if (durationMs > 7600 && /但是|但|比如|最后|所以|然后|接着|同时/u.test(text)) {
    return {
      action: "split-candidate",
      issue: "long-multi-connector",
      reason: "Long row contains connector words that may represent two cognition steps.",
    };
  }
  if (role === "supporting-explanation" && prevRole === "supporting-explanation" && nextRole === "supporting-explanation") {
    return {
      action: "merge-or-soften-candidate",
      issue: "support-run",
      reason: "Three adjacent support rows risk feeling mechanical unless motion/layout differentiates them.",
    };
  }
  return {
    action: "keep",
    issue: null,
    reason: "Shot is acceptable as an independent story/cognition unit.",
  };
}

function annotateStoryArcSegmentation(shots) {
  const roles = shots.map((shot, index) => inferCognitiveRole(shot.text || "", index, shots.length));
  return shots.map((shot, index) => {
    const role = roles[index];
    const prevRole = index > 0 ? roles[index - 1] : null;
    const nextRole = index < shots.length - 1 ? roles[index + 1] : null;
    const decision = segmentationActionFor(shot, role, prevRole, nextRole);
    return {
      ...shot,
      storyArcSegmentation: {
        contract: "A1StoryboardStoryArcSegmentation/v1",
        source: "generate-storyboard-from-srt-v1",
        cognitiveRole: role,
        transitionFromPrevious: storyTransition(prevRole, role),
        recommendedSegmentationAction: decision.action,
        issue: decision.issue,
        reason: decision.reason,
        neighbors: {
          previousRole: prevRole,
          nextRole,
        },
        durationMs: Math.max(0, Number(shot.endMs || 0) - Number(shot.startMs || 0)),
      },
    };
  });
}

function inferVisualFocusText(text) {
  const strongPhrases = [
    "智能写作工作台",
    "写作风格库",
    "划一下就能让它改",
    "演示模式",
    "AI 常常不说人话",
    "完成度很高的废稿",
    "泛泛而谈",
    "可控的工作流",
    "自己的风格",
  ];
  for (const phrase of strongPhrases) {
    if (text.includes(phrase)) return phrase;
  }
  const quoted = text.match(/[“"']([^“”"']{2,14})[”"']/u);
  if (quoted) return quoted[1];
  const chunks = text
    .replace(/[。！？!?]$/u, "")
    .split(/[，、；：,.!?！？\s]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && part.length <= 14);
  return chunks.at(-1) || text.replace(/[。！？!?]$/u, "").slice(0, 14);
}

function nearestSceneByTime(scenes, startMs, endMs) {
  const midpoint = (startMs + endMs) / 2;
  let best = scenes[0] || null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const scene of scenes) {
    const sceneMidpoint = ((scene.sourceStartMs || 0) + (scene.sourceEndMs || 0)) / 2;
    const distance = Math.abs(sceneMidpoint - midpoint);
    if (distance < bestDistance) {
      best = scene;
      bestDistance = distance;
    }
  }
  return best;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function tokensFor(text, visualFocusText) {
  const cleaned = text.replace(/[。！？!?]$/u, "");
  const segments = cleaned.split(/[，、；：,.!?！？\s]+/u).map((part) => part.trim()).filter((part) => part.length >= 2);
  return [visualFocusText, ...segments]
    .filter(Boolean)
    .map((part) => part.slice(0, 14))
    .slice(0, 3);
}

function evidenceNeed(text) {
  if (/Kimi|DeepSeek|Claude|GPT|Codex|AI|模型|产品|项目|网页|文件|截图|数据|数字/u.test(text)) return "source-check-or-text-fallback";
  return "recording-replaceable-no-fake-ui";
}

function assetRouteFor(decision) {
  if (decision.semanticStageKind === "typographic-packaging") return "typography-only";
  if (decision.semanticStageKind === "archive-structure" || decision.semanticStageKind === "operation-flow" || decision.semanticStageKind === "argument-grammar") return "deterministic-semantic-stage";
  return "typography-only";
}

function semanticIntentFor(shot, decision) {
  if (decision.semanticStageKind === "operation-flow") return "把字幕动作变成对象、动作、结果的可读流程。";
  if (decision.semanticStageKind === "archive-structure") return "把积累、保存、版本或记忆关系变成归档结构。";
  if (decision.semanticStageKind === "argument-grammar") return "把判断、反转、因果或问题变成论证关系。";
  return "提取焦点词，用文字包装承接当前句子的观看任务。";
}

function fillWhatFor(shot, decision, visualFocusText) {
  if (decision.semanticStageKind === "operation-flow") return `围绕“${visualFocusText}”画出操作路径，不出现真实软件截图或假 UI。`;
  if (decision.semanticStageKind === "archive-structure") return `把“${visualFocusText}”做成标签、层叠纸片或版本条目，表达积累关系。`;
  if (decision.semanticStageKind === "argument-grammar") return `把“${visualFocusText}”做成判断焦点，并用线、箭头或对冲结构说明关系。`;
  return `把“${visualFocusText}”作为可编辑主字，背景只放抽象符号化辅助图形。`;
}

function fillHowFor(decision) {
  if (decision.semanticStageKind === "operation-flow") return "先出对象位，再画动作线，最后锁定结果位；标题保持独立安全区。";
  if (decision.semanticStageKind === "archive-structure") return "用纸片层级、扫描标签和时间线节奏表达状态写回，不让小标签抢标题。";
  if (decision.semanticStageKind === "argument-grammar") return "用大字或对冲结构先给判断，再用钴蓝线条显示方向或因果。";
  return "本地 editable 大字优先，背景低密度纸纹和符号化线框辅助，不强制补图。";
}

function executionStepsFor(route) {
  if (route === "deterministic-semantic-stage") return ["选择语义组件", "填对象/动作/结果或论证节点", "保留标题安全区", "检查遮挡和重复"];
  return ["提取短焦点词", "本地排版", "关键词动效", "检查读时和断词"];
}

function semanticFillForShot(shot, decision, visualFocusText, beatId, macroId, index) {
  const route = assetRouteFor(decision);
  return {
    contract: "A1StoryboardSemanticFill/v1",
    source: "generate-storyboard-from-srt-v1",
    order: index + 1,
    beatId,
    macroId,
    sourceText: shot.text,
    visibleText: visualFocusText,
    semanticStageKind: decision.semanticStageKind,
    presentationState: decision.state,
    intent: semanticIntentFor(shot, decision),
    fillWhat: fillWhatFor(shot, decision, visualFocusText),
    fillHow: fillHowFor(decision),
    assetRoute: route,
    evidenceNeed: evidenceNeed(shot.text),
    motionJob: decision.primaryAction || decision.motionStyle,
    layoutJob: decision.layoutFamily,
    executionSteps: executionStepsFor(route),
    status: route === "typography-only" || route === "deterministic-semantic-stage" ? "filled-deterministic" : "needs-artwork-generation",
    acceptance: [
      "中文必须是本地可编辑层",
      "不放假 UI / 假文件 / 假证据 / 假 logo",
      "画面主体不得遮挡可读标题",
      "本镜画面对象必须对应当前字幕语义",
    ],
  };
}

function latinTextFor(text) {
  const pairs = [
    [/系统|流程|工作流|步骤|顺序/u, "WORKFLOW"],
    [/工具|产品|项目|工作台/u, "SYSTEM"],
    [/数据|数字|趋势|样本|基线|波动/u, "DATA"],
    [/问题|判断|结论|目标/u, "JUDGEMENT"],
    [/字幕|演示|口播|文件/u, "PROMPT"],
    [/记忆|记录|保存|版本|归档/u, "ARCHIVE"],
    [/用户|空白页|设置|界面/u, "PRODUCT"],
  ];
  const matched = pairs.find(([pattern]) => pattern.test(text));
  return matched ? matched[1] : null;
}

function typographyPresetFor(shot, decision, visualFocusText) {
  const text = `${shot.text} ${visualFocusText}`;
  if (/不是|但是|但|问题|异常|带偏|太深|不应该|替代|真正|最后/u.test(text) || ["criteria-write", "decision-branch", "comparison"].includes(decision.state)) return "poster-slam";
  if (latinTextFor(text) && decision.semanticStageKind === "typographic-packaging") return "cinema-condensed";
  if (decision.semanticStageKind === "archive-structure") return "archive-label";
  if (decision.semanticStageKind === "operation-flow") return "quiet-subtitle";
  return "keyword-mask";
}

function typographyToneFor(shot, decision, visualFocusText) {
  const text = `${shot.text} ${visualFocusText}`;
  if (/不是|问题|异常|带偏|太深|不应该|替代/u.test(text)) return "verdict-red";
  if (/系统|流程|顺序|目标|产品|工具|工作流/u.test(text)) return "signal-yellow";
  if (/归档|保存|版本|记录|记忆/u.test(text)) return "archive-green";
  if (decision.semanticStageKind === "operation-flow") return "cobalt";
  return "ink";
}

function typographyDirectorForShot(shot, decision, visualFocusText, index) {
  const preset = typographyPresetFor(shot, decision, visualFocusText);
  const latin = latinTextFor(`${shot.text} ${visualFocusText}`);
  return {
    contract: "A1TypographyDirector/v1",
    phaseId: "storyboard-typography-director-v1",
    source: "generate-storyboard-from-srt-v1",
    order: index + 1,
    preset,
    displayText: visualFocusText,
    latinText: latin,
    colorRole: typographyToneFor(shot, decision, visualFocusText),
    layoutRole: preset === "poster-slam" ? "center-slam" : preset === "cinema-condensed" ? "left-poster-stack" : preset === "archive-label" ? "archive-tag-left" : preset === "quiet-subtitle" ? "stage-owned-minimal" : "keyword-focus",
    motion: preset === "poster-slam" ? "slam-in" : preset === "cinema-condensed" ? "track-expand" : preset === "archive-label" ? "scan-label" : preset === "quiet-subtitle" ? "quiet-hold" : "mask-reveal",
    semanticStageKind: decision.semanticStageKind,
    editableTextLayer: true,
    imageBakedTextAllowed: false,
    generatedArtworkTextAllowed: false,
    useCase: preset === "poster-slam"
      ? "观点/问题/转折用大字压屏"
      : preset === "cinema-condensed"
        ? "产品词、系统词或数据词用窄长英文海报字加中文主标题"
        : preset === "archive-label"
          ? "归档/版本/记录用标签化扫描入场"
          : preset === "quiet-subtitle"
            ? "操作说明让语义组件讲清楚，文字只保留可读焦点"
            : "普通关键词用可编辑大字和遮罩入场",
    rules: [
      "文字必须保持本地可编辑，不进入生图 prompt",
      "优先显示分镜焦点词，不把整句硬塞进画面",
      "字形变化来自语义角色，不做随机模板轮换",
      "信息弱的镜头允许只做文字包装，不强制补图",
    ],
    referenceTaste: {
      condensedPosterLatin: preset === "cinema-condensed",
      massiveCjkImpact: preset === "poster-slam",
      highSaturationAccent: ["poster-slam", "cinema-condensed"].includes(preset),
      abstractSymbolicArtworkOnly: true,
    },
  };
}

const defaultSrtPath = path.resolve(root, "../../../../声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt");
const srtPath = path.resolve(root, argValue("--srt", defaultSrtPath));
const sourcePropsPath = path.resolve(root, argValue("--source-props", "remotion-renderer/src/generated/microbeatLayeredFullProps.json"));
const outDir = path.resolve(root, argValue("--out-dir", "apps/studio-next/public/generated/storyboard/current"));
const propsOutPath = path.join(outDir, "storyboard-props.json");
const manifestOutPath = path.join(outDir, "storyboard-manifest.json");
const approvalPath = path.join(outDir, "storyboard-approval.json");
const stillsDir = path.resolve(root, "apps/studio-next/public/generated/storyboard-stills");
const artworkDir = path.resolve(root, "apps/studio-next/public/generated-artwork");
const fps = Number(argValue("--fps", "30"));

if (!fs.existsSync(srtPath)) throw new Error(`srt not found: ${srtPath}`);
if (!fs.existsSync(sourcePropsPath)) throw new Error(`source props not found: ${sourcePropsPath}`);

const srtRaw = fs.readFileSync(srtPath, "utf8");
const sourceProps = JSON.parse(fs.readFileSync(sourcePropsPath, "utf8"));
const sourceScenes = Array.isArray(sourceProps.scenes) ? sourceProps.scenes : [];
const cues = parseSrt(srtRaw);
if (!cues.length) throw new Error("no subtitle cues parsed");
const shots = annotateStoryArcSegmentation(groupCuesIntoShots(cues));

const totalDurationMs = Math.max(...shots.map((shot) => shot.endMs));
const macroCount = Number(argValue("--macro-count", "11"));
const macroBeatCounts = new Map();

const scenes = shots.map((shot, index) => {
  const macroNumber = Math.min(macroCount, Math.floor((shot.startMs / Math.max(1, totalDurationMs)) * macroCount) + 1);
  const macroId = `H${String(macroNumber).padStart(2, "0")}`;
  const beatNumber = (macroBeatCounts.get(macroId) || 0) + 1;
  macroBeatCounts.set(macroId, beatNumber);
  const beatId = `${macroId}-B${String(beatNumber).padStart(2, "0")}`;
  const representative = nearestSceneByTime(sourceScenes, shot.startMs, shot.endMs);
  const durationFrames = Math.max(1, Math.round(((shot.endMs - shot.startMs) / 1000) * fps));
  const visualFocusText = inferVisualFocusText(shot.text);
  const decision = diversifyVisualDecisionForStoryArc(decideSemanticVisual(shot, visualFocusText, index), shot.storyArcSegmentation, index);
  const titleLines = splitTitleLines(visualFocusText);
  const base = cloneJson(representative || sourceScenes[0] || {});
  const supportTokens = tokensFor(shot.text, visualFocusText);
  const semanticFill = semanticFillForShot(shot, decision, visualFocusText, beatId, macroId, index);
  const typographyDirector = typographyDirectorForShot(shot, decision, visualFocusText, index);
  return {
    ...base,
    contract: base.contract || "A1MicrobeatLayeredFullScene/v1",
    beatId,
    macroId,
    sourceStartMs: shot.startMs,
    sourceEndMs: shot.endMs,
    startFrame: Math.round((shot.startMs / 1000) * fps),
    durationInFrames: durationFrames,
    screenText: shot.text,
    titleLines,
    layoutFamily: decision.layoutFamily,
    motionArchetype: decision.motionArchetype,
    backgroundState: decision.backgroundState,
    choreography: decision.choreography,
    animationTier: decision.animationTier,
    family: decision.family,
    route: decision.route,
    supportTokens,
    entityEvidence: Array.isArray(base.entityEvidence) ? base.entityEvidence : [],
    recordingReplaceable: Boolean(base.recordingReplaceable),
    compositionVariant: Number.isFinite(base.compositionVariant) ? base.compositionVariant : index % 4,
    layout: {
      ...(base.layout || {}),
      typography: {
        ...(base.layout?.typography || {}),
        lines: titleLines,
      },
    },
    presentation: {
      ...(base.presentation || {}),
      contract: "A1MicroEventPresentation/v1",
      state: decision.state,
      label: decision.label,
      primary: visualFocusText,
      fullSentence: shot.text,
      secondary: "",
      tokens: supportTokens,
      showSceneTitle: false,
      semanticDelta: `${decision.semanticStageKind}:${decision.mode}:${visualFocusText}`,
      audit: base.presentation?.audit || {cleanTerminalPunctuation: true},
      semanticRole: "subtitle-cue",
      visualRole: decision.family,
    },
    motionPlan: {
      ...(base.motionPlan || {}),
      primaryAction: decision.primaryAction,
      motionStyle: decision.motionStyle,
      primaryCurve: decision.primaryCurve,
      kineticText: {
        ...(base.motionPlan?.kineticText || {}),
        mode: decision.kineticMode,
        staggerFrames: Number.isFinite(base.motionPlan?.kineticText?.staggerFrames) ? base.motionPlan.kineticText.staggerFrames : 6,
        keywordIndex: 0,
      },
      semanticStates: {
        ...(base.motionPlan?.semanticStates || {}),
        initial: `subtitle:${decision.mode}:initial`,
        established: `subtitle:${decision.mode}:established`,
        emphasized: `subtitle:${decision.mode}:emphasized`,
        resolved: `subtitle:${decision.mode}:resolved`,
      },
    },
    layers: Array.isArray(base.layers) ? base.layers : [],
    storyboard: {
      arcPosition: decision.state,
      arcIntensity: index === 0 ? 1 : 0.55,
      artworkStatus: "source-timeline-review",
      visualSource: "type",
      representativeStillBeatId: representative?.beatId || null,
      visualFocusText,
      packagingMode: visualFocusText !== shot.text ? "focus-phrase-typographic-packaging" : "full-sentence-typographic-packaging",
      semanticDecision: {
        source: "srt-semantic-decision-v1",
        semanticStageKind: decision.semanticStageKind,
        mode: decision.mode,
        family: decision.family,
        presentationState: decision.state,
        motionStyle: decision.motionStyle,
        backgroundState: decision.backgroundState,
        choreography: decision.choreography,
      },
      sourceSubtitleIndexes: shot.sourceSubtitleIndexes,
      sourceSubtitleText: shot.text,
      sourceSubtitlePath: rel(srtPath),
      storyArcSegmentation: shot.storyArcSegmentation,
      semanticFill,
      fillStatus: semanticFill.status,
      typographyDirector,
      motionTemplate: null,
    },
  };
});

const macroIds = [...new Set(scenes.map((scene) => scene.macroId))];
const props = {
  contract: "A1MicrobeatLayeredFullPlan/v1",
  projectId: sourceProps.projectId || "july1-writing-workbench",
  fps,
  sourceProductionHash: sha256Text(srtRaw),
  sourceVariationHash: sha256Text(JSON.stringify(scenes.map((scene) => [scene.beatId, scene.sourceStartMs, scene.sourceEndMs, scene.screenText]))),
  visualMasterHash: sourceProps.visualMasterHash,
  visualPreference: sourceProps.visualPreference,
  reviewOnly: true,
  finalRenderAllowed: false,
  accentPolicy: sourceProps.accentPolicy,
  referenceInterpretationPolicy: sourceProps.referenceInterpretationPolicy,
  sourceTimeline: {
    contract: "A1SubtitleTimelineSource/v1",
    kind: "srt",
    path: rel(srtPath),
    sha256: sha256Text(srtRaw),
    cueCount: cues.length,
    shotCount: shots.length,
    groupingPolicy: "merge subtitle cues until sentence punctuation, then assign one visual focus phrase and deterministic Stage-2-shaped semantic visual decision",
    storyArcSegmentation: {
      contract: "A1StoryboardStoryArcSegmentationPolicy/v1",
      source: "generate-storyboard-from-srt-v1",
      enabled: true,
      roleField: "scene.storyboard.storyArcSegmentation.cognitiveRole",
      actionField: "scene.storyboard.storyArcSegmentation.recommendedSegmentationAction",
      note: "This version annotates split/merge/soften candidates without mutating shot boundaries. A later generator pass may use these fields to revise grouping.",
      actionCounts: shots.reduce((acc, shot) => {
        const action = shot.storyArcSegmentation?.recommendedSegmentationAction || "missing";
        acc[action] = (acc[action] || 0) + 1;
        return acc;
      }, {}),
    },
  },
  scenes,
  reviewBeatIds: macroIds.map((macroId) => scenes.find((scene) => scene.macroId === macroId)?.beatId).filter(Boolean),
  familyCounts: scenes.reduce((acc, scene) => {
    acc[scene.family] = (acc[scene.family] || 0) + 1;
    return acc;
  }, {
    "editorial-metaphor": 0,
    "type-statement": 0,
    "model-comparison": 0,
    "process-chain": 0,
    "archive-stack": 0,
    "annotation-judgement": 0,
    "insertion-flow": 0,
    "direction-convergence": 0,
  }),
};
props.contentHash = sha256Text(JSON.stringify(props));

const stillFiles = fs.existsSync(stillsDir)
  ? fs.readdirSync(stillsDir).filter((file) => file.endsWith(".png"))
  : [];
const stillBeatIds = new Set(stillFiles.map((file) => file.replace(/\.png$/u, "")));
const missingRepresentativeStills = scenes
  .filter((scene) => scene.storyboard?.representativeStillBeatId && !stillBeatIds.has(scene.storyboard.representativeStillBeatId))
  .map((scene) => ({beatId: scene.beatId, representativeStillBeatId: scene.storyboard.representativeStillBeatId}));

fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(propsOutPath, `${JSON.stringify(props, null, 2)}\n`, "utf8");
if (fs.existsSync(approvalPath)) fs.unlinkSync(approvalPath);

const propsSha = sha256File(propsOutPath);
const manifest = {
  contract: "A1StoryboardDraftManifest/v1",
  status: "review-only-isolated-draft",
  authority: "storyboard-draft-not-system-line-review",
  generatedAt: new Date().toISOString(),
  source: {
    path: rel(srtPath),
    sha256: sha256Text(srtRaw),
    sourcePropsPath: rel(sourcePropsPath),
  },
  current: {
    propsPath: rel(propsOutPath),
    propsSha256: propsSha,
    sceneCount: scenes.length,
    macroCount: macroIds.length,
    macroIds,
    reviewBeatIds: props.reviewBeatIds,
    totalDurationMs,
  },
  assets: {
    stillsDir: rel(stillsDir),
    stillCount: stillFiles.length,
    missingStillCount: missingRepresentativeStills.length,
    missingStills: missingRepresentativeStills,
    artworkDir: rel(artworkDir),
    adoptedArtworkCount: 0,
    adoptedArtwork: [],
    generatedArtworkCount: 0,
    pendingVisualReviewArtworkCount: 0,
    representativeStillReuseCount: scenes.filter((scene) => scene.storyboard?.representativeStillBeatId).length,
  },
  isolation: {
    mustNotMutateSystemLineProps: true,
    systemLinePropsPath: "remotion-renderer/src/generated/microbeatLayeredFullProps.json",
    systemLineReviewPage: "/system-line-review",
    storyboardPage: "/storyboard",
  },
  notes: [
    "This storyboard draft is generated from the corrected subtitle timeline, not the compressed article fixture.",
    "Representative stills are temporarily borrowed from the nearest existing H-series shot by time.",
    "It is not proof that the H-series 540p review MP4, audit reports, or human-review packet are current.",
    "Promote into the system line only through an explicit adoption/render/audit step.",
  ],
};
fs.writeFileSync(manifestOutPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  contract: props.contract,
  source: manifest.source.path,
  propsPath: manifest.current.propsPath,
  propsSha256: manifest.current.propsSha256,
  sceneCount: scenes.length,
  macroIds,
  firstScene: {
    beatId: scenes[0]?.beatId,
    sourceStartMs: scenes[0]?.sourceStartMs,
    sourceEndMs: scenes[0]?.sourceEndMs,
    screenText: scenes[0]?.screenText,
    visualFocusText: scenes[0]?.storyboard?.visualFocusText,
  },
  representativeStillReuseCount: manifest.assets.representativeStillReuseCount,
  missingStillCount: manifest.assets.missingStillCount,
}, null, 2));
