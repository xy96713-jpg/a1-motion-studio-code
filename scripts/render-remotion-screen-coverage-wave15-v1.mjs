#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";

const root = path.resolve(import.meta.dirname, ".."), rendererRoot = path.join(root, "remotion-renderer"), planPath = path.join(root, "work/remotion-screen-coverage-wave15-v1/plan.json"), plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
if (plan.status !== "READY" || plan.shotCount !== 15) throw new Error("coverage-wave15-render-plan-required");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (item) => new Promise((resolve, reject) => {
  const output = path.join(root, item.outputPath), props = path.join(root, item.propsPath); fs.mkdirSync(path.dirname(output), {recursive: true});
  const child = spawn("npx", ["remotion", "render", "src/screen-camera-diagnostic-entry.tsx", "A1ScreenCameraDiagnosticV1", output, "--props", props, "--codec", "h264", "--crf", "16", "--concurrency", "1"], {cwd: rendererRoot, stdio: ["ignore", "pipe", "pipe"]});
  let stdout = "", stderr = ""; child.stdout.on("data", (chunk) => {stdout += chunk;}); child.stderr.on("data", (chunk) => {stderr += chunk;}); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve({shotId: item.shotId, status: "PASS", outputPath: item.outputPath, outputSha256: sha256(output), propsSha256: item.propsSha256}) : reject(new Error(`coverage-wave15-render:${item.shotId}:${stderr || stdout}`)));
});
const batchPath=path.join(root,"work/remotion-screen-coverage-wave15-v1/render-batch.json"),previous=fs.existsSync(batchPath)?JSON.parse(fs.readFileSync(batchPath,"utf8")):null,reused=[],pending=[];
for(const item of plan.items){const prior=previous?.results?.find((candidate)=>candidate.shotId===item.shotId),output=path.join(root,item.outputPath);if(prior&&prior.propsSha256===item.propsSha256&&fs.existsSync(output)&&sha256(output)===prior.outputSha256)reused.push({...prior,reused:true});else pending.push(item);}
const results = [...reused];
for (let index = 0; index < pending.length; index += 2) results.push(...await Promise.all(pending.slice(index, index + 2).map(run)));
results.sort((left,right)=>plan.items.findIndex((item)=>item.shotId===left.shotId)-plan.items.findIndex((item)=>item.shotId===right.shotId));
const body = {contract: "A1RemotionScreenCoverageWave15RenderBatch/v1", status: results.length === 15 ? "PASS" : "FAIL", sourcePlanSha256: plan.planSha256, concurrency: 2, reusedCount:reused.length,renderedCount:pending.length,results}; body.batchSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex"); fs.writeFileSync(batchPath, `${JSON.stringify(body, null, 2)}\n`); console.log(JSON.stringify({status: body.status, count: results.length,reusedCount:body.reusedCount,renderedCount:body.renderedCount,batchSha256: body.batchSha256}, null, 2)); if (body.status !== "PASS") process.exitCode = 1;
