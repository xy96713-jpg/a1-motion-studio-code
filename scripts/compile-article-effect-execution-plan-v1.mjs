#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {compileArticleEffectExecutionPlan} from "./lib/compile-article-effect-execution-plan-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scenarioPath = path.resolve(root, process.argv[2] || "");
const reportPath = path.resolve(root, process.argv[3] || "");
const routePath = path.resolve(root, process.argv[4] || "");
const outputPath = path.resolve(root, process.argv[5] || "");
if (!scenarioPath || !reportPath || !routePath || !outputPath) throw new Error("usage:compile-article-effect-execution-plan-v1 <scenario.json> <capture-report.json> <route.json> <output.json>");
const [scenario, report, route] = await Promise.all([scenarioPath, reportPath, routePath].map((file) => fs.readFile(file, "utf8").then(JSON.parse)));
const plan = compileArticleEffectExecutionPlan({scenario, report, route});
await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({status: plan.status, plannedEffectCount: plan.summary.plannedEffectCount, blockedEffectCount: plan.summary.blockedEffectCount, nextAction: plan.nextAction, output: path.relative(root, outputPath)}, null, 2));
