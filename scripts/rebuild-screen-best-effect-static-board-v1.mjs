#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

function preferredEvidenceBeat(shotDemand, candidates) {
  const source = `${shotDemand.sourceText || ""} ${shotDemand.visualJob || ""}`;
  const preferred = /写到任何句子|划一下就能让它改/iu.test(source)
    ? "applied"
    : /对胃口.*喜欢|讨厌库|写作风格库/iu.test(source)
      ? "applied"
    : /补充段落.*给出|合适的补段/iu.test(source)
      ? "candidates"
    : /最后点击收稿/iu.test(source)
      ? "selected"
    : /点击收稿|检查全文|病句|合理的建议|标出.*修改/iu.test(source)
      ? "typing-progress"
    : /写完之后还能打开演示模式/iu.test(source)
      ? "typing-progress"
    : /演示模式|字号与速度|口播稿/iu.test(source)
      ? "candidates"
    : /前端.*简单|第一眼.*标题和全文|普通文档软件/iu.test(source)
      ? "selected"
    : /Ctrl\+S|Command\+S|保存的最新版/iu.test(source)
      ? "candidates"
    : /句子太空|记入.*风格库/iu.test(source)
      ? "typing-progress"
    : /拦下|提醒.*修改|提醒.*补充/iu.test(source)
      ? "candidates"
    : /喜欢库.*生成|生成类似|类似的句式|类似的类比/iu.test(source)
      ? "candidates"
    : /两段之间|输入你的需求|补一段/iu.test(source)
      ? "typing-progress"
    : /几个候选|放回正文|正文接纳/iu.test(source)
      ? "applied"
    : null;
  const byBeat = new Map(candidates.map((candidate) => [candidate.sceneGraph.nodes.find((node) => node.id === "primary")?.evidenceBeat, candidate]));
  return byBeat.get(preferred) || byBeat.get("applied") || byBeat.get("candidates") || candidates.at(-1) || candidates[0] || null;
}

const generated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  const targets = next.library.assets
    .filter((asset) => asset.route === "shot-composition" && asset.shotDemand.editMode === "screen-demo")
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order);
  for (const target of targets) next = createSceneGraphCandidates(next, target.id, now);
  const event = createProductionEvent({workspace: current, action: "screen-best-effect-candidates-rebuilt", targetId: current.workspaceSha256, payload: {shotIds: targets.map((target) => target.shotDemand.shotId), aspectPolicy: "native-16:9-or-aspect-preserving-semantic-crop"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return targets.map((target) => target.shotDemand.shotId);
});

for (const shotId of generated) execFileSync(process.execPath, [path.join(root, "scripts/render-shot-scene-graph-candidates-v1.mjs"), `--shot=${shotId}`], {cwd: root, stdio: "inherit"});

const selected = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const selections = [];
  for (const shot of next.library.assets.filter((asset) => asset.route === "shot-composition" && asset.shotDemand.editMode === "screen-demo")) {
    const candidate = preferredEvidenceBeat(shot.shotDemand, shot.candidates || []);
    if (!candidate?.preview?.publicUrl) throw new Error(`screen-best-effect-preview-missing:${shot.shotDemand.shotId}`);
    const primary = candidate.sceneGraph.nodes.find((node) => node.id === "primary");
    shot.selectedCandidateId = candidate.candidateId;
    shot.bestEffectHeroFrame = {
      contract: "A1ScreenBestEffectHeroFrame/v1",
      evidenceBeat: primary?.evidenceBeat || null,
      screenReviewFit: primary?.screenReviewFit || null,
      sourceFramePublicUrl: primary?.sourceFramePublicUrl || null,
      sourceAspectRatio: "16:9",
      selectedAt: now,
    };
    shot.status = "ready-for-best-effect-board-review";
    shot.review = {status: "pending", note: `已按本句视觉任务选择真实操作英雄帧：${primary?.evidenceBeat || "unknown"}；保持原生比例，等待整片静态联系表审计。`, reviewedAt: now, reviewedBy: "system-best-effect-director", approvedContentSha256: null};
    shot.visualCritic = null;
    selections.push({shotId: shot.shotDemand.shotId, candidateId: candidate.candidateId, evidenceBeat: primary?.evidenceBeat || null, screenReviewFit: primary?.screenReviewFit || null});
  }
  delete next.production.maturityLoop.allShotSelectedReview;
  next.production.maturityLoop.bestEffectBoard = {...next.production.maturityLoop.bestEffectBoard, status: "SCREEN_HERO_FRAMES_READY", screenSelections: selections, updatedAt: now};
  const event = createProductionEvent({workspace: current, action: "screen-best-effect-hero-frames-selected", targetId: current.workspaceSha256, payload: {selections}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"screen-best-effect-hero-frame-selections-v1.json": {contract: "A1ScreenBestEffectHeroFrameSelectionSet/v1", selections, createdAt: now}}});
  return selections;
});

execFileSync(process.execPath, [path.join(root, "scripts/render-all-shot-selected-contact-sheet-v1.mjs")], {cwd: root, stdio: "inherit"});
console.log(JSON.stringify({status: "SCREEN_BEST_EFFECT_STATIC_BOARD_REBUILT", shotCount: selected.length, selections: selected}, null, 2));
