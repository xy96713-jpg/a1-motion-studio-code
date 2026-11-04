#!/usr/bin/env node
/**
 * Cross-project SRT fixtures for intelligent storyboard generalization.
 *
 * This runs the real SRT storyboard generator into isolated system-line output
 * folders. It does not mutate /storyboard/current, renderer props, or any
 * review MP4.
 */
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-cross-project-srt-fixtures-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const sourcePropsPath = "remotion-renderer/src/generated/microbeatLayeredFullProps.json";
const generatorPath = "scripts/generate-storyboard-from-srt-v1.mjs";

const lanes = [
  {
    id: "opinion",
    title: "观点评论",
    cues: [
      ["00:00:00,000", "00:00:02,200", "很多人以为，效率工具越多，工作就越快。"],
      ["00:00:02,200", "00:00:04,900", "但真正的问题不是工具数量，而是判断顺序。"],
      ["00:00:04,900", "00:00:08,000", "如果先选工具，再想目标，很容易越做越乱。"],
      ["00:00:08,000", "00:00:11,200", "所以我更关心的是，先把任务拆成可验证的步骤。"],
      ["00:00:11,200", "00:00:14,000", "最后，工具只是执行层，不应该替代判断。"],
    ],
  },
  {
    id: "tutorial",
    title: "教程演示",
    cues: [
      ["00:00:00,000", "00:00:02,000", "先打开项目，找到字幕文件。"],
      ["00:00:02,000", "00:00:04,000", "然后点击生成分镜，系统会先合并短句。"],
      ["00:00:04,000", "00:00:06,300", "接着检查每一镜的屏幕字和画面说明。"],
      ["00:00:06,300", "00:00:09,000", "如果某一镜太长，就标记为拆分候选。"],
      ["00:00:09,000", "00:00:11,800", "保存以后，再进入素材和动效阶段。"],
    ],
  },
  {
    id: "data-explanation",
    title: "数据解释",
    cues: [
      ["00:00:00,000", "00:00:02,400", "这组数字本身并不说明趋势。"],
      ["00:00:02,400", "00:00:05,200", "要先看口径，样本和时间窗口。"],
      ["00:00:05,200", "00:00:08,500", "如果只比较最后一个月，结论会被异常值带偏。"],
      ["00:00:08,500", "00:00:11,100", "所以这里应该画出基线，再标出变化区间。"],
      ["00:00:11,100", "00:00:13,800", "结论不是上涨或下跌，而是波动变大。"],
    ],
  },
  {
    id: "product-analysis",
    title: "产品分析",
    cues: [
      ["00:00:00,000", "00:00:02,100", "这个产品最强的地方，不是功能多。"],
      ["00:00:02,100", "00:00:04,600", "而是每一步都有明确的下一步。"],
      ["00:00:04,600", "00:00:07,300", "用户不会在空白页里猜自己该做什么。"],
      ["00:00:07,300", "00:00:10,000", "但它的问题是，高级设置藏得太深。"],
      ["00:00:10,000", "00:00:12,500", "所以改版重点应该是默认简单，细节折叠。"],
    ],
  },
  {
    id: "personal-narrative",
    title: "个人叙事",
    cues: [
      ["00:00:00,000", "00:00:02,400", "我第一次做这个系统的时候，其实只想省时间。"],
      ["00:00:02,400", "00:00:05,000", "后来发现，省时间不是最大的价值。"],
      ["00:00:05,000", "00:00:07,800", "真正有用的是，它会逼我把判断写清楚。"],
      ["00:00:07,800", "00:00:10,600", "每一次返工，都能留下一个更稳定的规则。"],
      ["00:00:10,600", "00:00:13,600", "最后它不只是工具，更像一个工作记忆。"],
    ],
  },
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function srtFor(lane) {
  return lane.cues.map((cue, index) => [
    String(index + 1),
    `${cue[0]} --> ${cue[1]}`,
    cue[2],
  ].join("\n")).join("\n\n") + "\n";
}

function routeCounts(scenes) {
  return scenes.reduce((acc, scene) => {
    const route = scene.storyboard?.semanticDecision?.semanticStageKind || scene.storyboard?.semanticFill?.assetRoute || scene.route || "missing";
    acc[route] = (acc[route] || 0) + 1;
    return acc;
  }, {});
}

function storyArcCoverage(scenes) {
  return scenes.filter((scene) => scene.storyboard?.storyArcSegmentation?.contract === "A1StoryboardStoryArcSegmentation/v1").length;
}

const laneReports = [];
const blockers = [];

for (const lane of lanes) {
  const laneArtifact = path.join(artifactRoot, lane.id);
  const lanePublic = path.join(publicRoot, lane.id);
  const srtPath = path.join(laneArtifact, `${lane.id}.srt`);
  const outDir = path.join(lanePublic, "storyboard");
  fs.mkdirSync(laneArtifact, {recursive: true});
  fs.mkdirSync(outDir, {recursive: true});
  writeText(srtPath, srtFor(lane));
  try {
    execFileSync(process.execPath, [
      generatorPath,
      "--srt", srtPath,
      "--source-props", sourcePropsPath,
      "--out-dir", outDir,
      "--macro-count", "5",
    ], {
      cwd: root,
      stdio: "pipe",
      env: {...process.env},
    });
  } catch (error) {
    blockers.push({
      id: "fixture-generation-failed",
      laneId: lane.id,
      detail: error instanceof Error ? error.message : String(error),
    });
    continue;
  }
  const propsPath = path.join(outDir, "storyboard-props.json");
  const manifestPath = path.join(outDir, "storyboard-manifest.json");
  const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  laneReports.push({
    laneId: lane.id,
    title: lane.title,
    srtPath: rel(srtPath),
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    manifestPath: rel(manifestPath),
    sceneCount: scenes.length,
    macroCount: manifest.current?.macroCount || 0,
    macroIds: manifest.current?.macroIds || [],
    routeCounts: routeCounts(scenes),
    storyArcCoverage: storyArcCoverage(scenes),
    storyArcActionCounts: props.sourceTimeline?.storyArcSegmentation?.actionCounts || {},
    firstScene: scenes[0] ? {
      beatId: scenes[0].beatId,
      screenText: scenes[0].screenText,
      visualFocusText: scenes[0].storyboard?.visualFocusText,
      cognitiveRole: scenes[0].storyboard?.storyArcSegmentation?.cognitiveRole || null,
    } : null,
  });
}

const distinctSceneCounts = new Set(laneReports.map((lane) => lane.sceneCount));
const allHaveStoryArc = laneReports.every((lane) => lane.storyArcCoverage === lane.sceneCount && lane.sceneCount > 0);
const noFixed50 = laneReports.every((lane) => lane.sceneCount !== 50);
const noFixed11Macros = laneReports.every((lane) => lane.macroCount <= 5 && !lane.macroIds.includes("H11"));
const routeDiversityOk = laneReports.every((lane) => Object.keys(lane.routeCounts).length >= 2);

const report = {
  contract: "A1StoryboardCrossProjectSrtFixtures/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : (allHaveStoryArc && noFixed50 && noFixed11Macros && routeDiversityOk ? "PASS" : "REVIEW_RISKS"),
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    generatorPath,
    sourcePropsPath,
    sourcePropsSha256: sha256File(path.join(root, sourcePropsPath)),
  },
  summary: {
    laneCount: lanes.length,
    generatedLaneCount: laneReports.length,
    blockerCount: blockers.length,
    distinctSceneCounts: [...distinctSceneCounts].sort((a, b) => a - b),
    allHaveStoryArc,
    noFixed50,
    noFixed11Macros,
    routeDiversityOk,
  },
  blockers,
  lanes: laneReports,
  nextAction: "use-cross-project-fixtures-as-regression-for-future-srt-storyboard-generator-changes",
};

const md = [
  "# Storyboard Cross-Project SRT Fixtures v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- lanes: ${report.summary.generatedLaneCount}/${report.summary.laneCount}`,
  `- distinct scene counts: ${report.summary.distinctSceneCounts.join(", ")}`,
  `- all have story arc: ${report.summary.allHaveStoryArc}`,
  `- no fixed 50: ${report.summary.noFixed50}`,
  `- no fixed H11 macro: ${report.summary.noFixed11Macros}`,
  `- route diversity: ${report.summary.routeDiversityOk}`,
  "",
  "## Lanes",
  "",
  ...laneReports.map((lane) => [
    `### ${lane.laneId}`,
    "",
    `- scene count: ${lane.sceneCount}`,
    `- macro ids: ${lane.macroIds.join(", ")}`,
    `- route counts: ${JSON.stringify(lane.routeCounts)}`,
    `- story arc coverage: ${lane.storyArcCoverage}/${lane.sceneCount}`,
    "",
  ].join("\n")),
].join("\n");

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
writeText(path.join(artifactRoot, "report.md"), md);
writeText(path.join(publicRoot, "report.md"), md);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
