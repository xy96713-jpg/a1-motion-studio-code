#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {runBoundedProcessGroup} from "../apps/studio-next/src/lib/a1-bounded-process-group-v1.mjs";
import {readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {readPackagingParagraphEffectiveLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-effective-lifecycle-v1.mjs";
import {readPackagingParagraphUserDecision} from "../apps/studio-next/src/lib/a1-packaging-paragraph-user-decision-v1.mjs";
import {readPackagingParagraphPlayablePlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-plan-v1.mjs";
import {
  assertPackagingParagraphPlayableRenderAuthorization,
  assertPackagingParagraphPlayableRenderResult,
  assertPackagingParagraphPlayableRenderState,
  buildPackagingParagraphPlayableRenderImplementationBinding,
  createPackagingParagraphPlayableAgentAssessment,
  packagingParagraphPlayableRenderPaths,
  updatePackagingParagraphPlayableRenderState,
} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-render-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const expectedPlanSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedPlanSha256 || ""))) throw new Error("paragraph-playable-agent-review-plan-sha-required");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const baseLifecycle = readPackagingParagraphCanaryLifecycle(appRoot);
const lifecycle = readPackagingParagraphEffectiveLifecycle(appRoot, {baseLifecycle}) || baseLifecycle;
const userDecision = readPackagingParagraphUserDecision(appRoot, {lifecycle});
const plan = readPackagingParagraphPlayablePlan(appRoot, {lifecycle, userDecision});
if (!plan || plan.planSha256 !== expectedPlanSha256) throw new Error("paragraph-playable-agent-review-plan-cas-failed");
const paths = packagingParagraphPlayableRenderPaths(appRoot, plan.planSha256);
const implementation = buildPackagingParagraphPlayableRenderImplementationBinding(projectRoot);
const authorization = assertPackagingParagraphPlayableRenderAuthorization(readJson(paths.authorization), {plan, userDecision, implementation});
const initial = assertPackagingParagraphPlayableRenderState(readJson(paths.state), {authorization});
if (["BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW", "BOUNDED_PLAYABLE_VISUAL_REPAIR_REQUIRED"].includes(initial.status)) {
  console.log(JSON.stringify({status: initial.status, idempotent: true, output: initial.output}, null, 2));
  process.exit(0);
}
if (initial.status === "BOUNDED_PLAYABLE_AGENT_REVIEWING" && fs.existsSync(paths.agentReviewLock)) {
  console.log(JSON.stringify({status: initial.status, idempotent: true, agentReviewerAlreadyRunning: true}, null, 2));
  process.exit(0);
}
if (initial.status !== "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW") throw new Error(`paragraph-playable-agent-review-state-invalid:${initial.status}`);
const resultFile = path.join(paths.publicRoot, "result.json");
const result = assertPackagingParagraphPlayableRenderResult(readJson(resultFile), {authorization});
const sheetFile = path.join(paths.publicRoot, "temporal-contact-sheet.png");
const videoFile = path.join(paths.publicRoot, "packaging-paragraph-playable-960x540.mp4");
if (!fs.existsSync(sheetFile) || fileSha256(sheetFile) !== initial.output?.contactSheet?.sha256 || result.output.contactSheet.sha256 !== initial.output.contactSheet.sha256) throw new Error("paragraph-playable-agent-review-contact-sheet-binding-invalid");
if (!fs.existsSync(videoFile) || fileSha256(videoFile) !== initial.output?.video?.sha256 || result.output.video.sha256 !== initial.output.video.sha256) throw new Error("paragraph-playable-agent-review-video-binding-invalid");
if (result.resultSha256 !== initial.output?.resultSha256 || initial.output?.reportPublicUrl !== `${paths.publicUrlRoot}/result.json`) throw new Error("paragraph-playable-agent-review-result-binding-invalid");

let reviewLock;
try {
  reviewLock = fs.openSync(paths.agentReviewLock, "wx", 0o600);
} catch {
  console.log(JSON.stringify({status: initial.status, idempotent: true, agentReviewerAlreadyRunning: true}, null, 2));
  process.exit(0);
}
try {
  updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: "BOUNDED_PLAYABLE_AGENT_REVIEWING", output: initial.output, pid: process.pid});
  const schemaPath = path.join(projectRoot, "docs/contracts/a1-packaging-paragraph-playable-agent-review-output.schema.json");
  const codexExecutable = process.env.A1_CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
  if (!fs.existsSync(codexExecutable)) throw new Error("paragraph-playable-agent-review-codex-unavailable");
  const prompt = `你是 A1 的独立视觉导演代理。附图是一段连续三镜视频在 setup/action/hold 三个相位抽取的 3×3 实际像素审片表，行分别为 ED-12、ED-13、ED-14，列为 setup、action、hold。你只能审这个有界段落，不得声称人类身份、用户批准或全片批准。\n\n语义：ED-12 应把五个实际尝试的模型按顺序建立为证据集合；ED-13 应先推进表面流畅，再让“根本问题未解决”形成可见阻断；ED-14 应先建立真实论文来源，再依次收束到句法、词汇和表达范围边界。段落必须读成“证据→机制→有边界结论”，而不是三张海报轮播。\n\n客观审计已经证明：MP4 有音轨、30fps、960×540、完整覆盖 51.559–70.480 秒权威音频窗口、无时间压缩，9 个样本有变化且 hold 回到绑定静帧。你仍需只根据附图实际像素判断：动作是否解释语义、镜间交接是否连续、阅读停留是否充足、动作是否克制、三镜是否有 A1 原创编辑人格而不是统一模板、来源与结论是否保持边界。\n\n必须严格返回 schema JSON。dimensions 必须恰好按 semanticAction、paragraphContinuity、readability、motionRestraint、aestheticCoherence、sourceAlignment 顺序；shots 必须按 ED-12、ED-13、ED-14 顺序。任何一项 FAIL 都必须 verdict=REPAIR，并给出只针对失败镜或失败交接的 repairInstruction；不得建议扩镜、重做已通过静帧、自动生图、全片 motion、Resolve 或 final。`;
  const args = ["exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--ignore-user-config", "--output-schema", schemaPath, "--color", "never", "-i", sheetFile, "-"];
  const run = await runBoundedProcessGroup({executable: codexExecutable, args, cwd: projectRoot, input: prompt, timeoutMs: 8 * 60 * 1000, maxStdoutBytes: 1_000_000, maxStderrBytes: 100_000, killGraceMs: 5_000, label: "paragraph-playable-agent-review"});
  const raw = JSON.parse(run.stdout.trim());
  const assessment = createPackagingParagraphPlayableAgentAssessment({authorization, result, raw});
  const assessmentFile = path.join(paths.publicRoot, "agent-visual-director-assessment.json");
  fs.writeFileSync(assessmentFile, `${JSON.stringify(assessment, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
  const nextOutput = {...initial.output, agentAssessment: {publicUrl: `${paths.publicUrlRoot}/agent-visual-director-assessment.json`, sha256: fileSha256(assessmentFile), assessmentSha256: assessment.assessmentSha256, status: assessment.status}};
  const stateStatus = assessment.status === "AGENT_RECOMMENDS_USER_PLAYABLE_REVIEW" ? "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW" : "BOUNDED_PLAYABLE_VISUAL_REPAIR_REQUIRED";
  const state = updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: stateStatus, output: nextOutput});
  console.log(JSON.stringify({status: state.status, assessmentStatus: assessment.status, assessmentSha256: assessment.assessmentSha256, nextAction: state.nextAction.id, userVisualApproval: "NOT_APPROVED", fullFilmVisualApproval: false, wholeFilmMotionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const current = assertPackagingParagraphPlayableRenderState(readJson(paths.state), {authorization});
    if (["BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", "BOUNDED_PLAYABLE_AGENT_REVIEWING"].includes(current.status)) updatePackagingParagraphPlayableRenderState(appRoot, {authorization, status: "BOUNDED_PLAYABLE_AGENT_REVIEW_FAILED", output: initial.output, failure: message});
  } catch {}
  throw error;
} finally {
  if (reviewLock != null) fs.closeSync(reviewLock);
  fs.rmSync(paths.agentReviewLock, {force: true});
}
