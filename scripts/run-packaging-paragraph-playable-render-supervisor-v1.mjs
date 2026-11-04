#!/usr/bin/env node
import path from "node:path";

import {runBoundedProcessGroup} from "../apps/studio-next/src/lib/a1-bounded-process-group-v1.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {updatePackagingParagraphPlayableRenderState} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-render-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const expectedPlanSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedPlanSha256 || ""))) throw new Error("paragraph-playable-render-supervisor-plan-sha-required");

try {
  const result = await runBoundedProcessGroup({
    executable: process.execPath,
    args: [path.join(projectRoot, "scripts/render-packaging-paragraph-playable-v1.mjs"), expectedPlanSha256],
    cwd: projectRoot,
    timeoutMs: 20 * 60 * 1000,
    maxStdoutBytes: 2 * 1024 * 1024,
    maxStderrBytes: 2 * 1024 * 1024,
    killGraceMs: 5_000,
    label: "paragraph-playable-render",
  });
  process.stdout.write(result.stdout);
  const afterRender = readExecutionStatus(appRoot);
  if (afterRender.packagingParagraphPlayableRender?.authorization?.source?.playablePlanSha256 === expectedPlanSha256 && afterRender.packagingParagraphPlayableRender.state?.status === "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW") {
    const review = await runBoundedProcessGroup({
      executable: process.execPath,
      args: [path.join(projectRoot, "scripts/run-packaging-paragraph-playable-agent-review-supervisor-v1.mjs"), expectedPlanSha256],
      cwd: projectRoot,
      timeoutMs: 11 * 60 * 1000,
      maxStdoutBytes: 2 * 1024 * 1024,
      maxStderrBytes: 2 * 1024 * 1024,
      killGraceMs: 5_000,
      label: "paragraph-playable-render-then-agent-review",
    });
    process.stdout.write(review.stdout);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const status = readExecutionStatus(appRoot);
    const render = status.packagingParagraphPlayableRender;
    if (message !== "paragraph-playable-render-worker-already-running" && render?.authorization?.source?.playablePlanSha256 === expectedPlanSha256 && ["BOUNDED_PLAYABLE_RENDER_QUEUED", "BOUNDED_PLAYABLE_RENDERING"].includes(render.state?.status)) {
      updatePackagingParagraphPlayableRenderState(appRoot, {authorization: render.authorization, status: "BOUNDED_PLAYABLE_RENDER_FAILED", failure: `supervisor:${message}`});
    }
  } catch {}
  if (message === "paragraph-playable-render-worker-already-running") process.exit(0);
  throw error;
}
