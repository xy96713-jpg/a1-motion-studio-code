#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {compileArticleEffectRoute} from "./lib/compile-article-effect-route-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const scenarioPath = path.resolve(root, process.argv[2] || "");
const reportPath = path.resolve(root, process.argv[3] || "");
const outputPath = path.resolve(root, process.argv[4] || "");
if (!scenarioPath || !reportPath || !outputPath) throw new Error("usage:compile-article-effect-route-v1 <scenario.json> <capture-report.json> <output.json>");
const scenario = JSON.parse(await fs.readFile(scenarioPath, "utf8"));
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const route = compileArticleEffectRoute({scenario, report});
await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(outputPath, `${JSON.stringify(route, null, 2)}\n`);
console.log(JSON.stringify({status: route.status, mode: route.mode, eligible: route.eligible.map((row) => row.id), blocked: route.blocked.map((row) => row.id), output: path.relative(root, outputPath)}, null, 2));
