#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "visual-production-system-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const planPath = path.join(publicDir, "system-plan.json");
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/reference-conditioned-anchor-index.tsx");
const rendererPublicDir = path.join(rendererRoot, "public");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = rendererRequire("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

async function main() {
  if (!fs.existsSync(planPath)) throw new Error("visual-system-plan-missing; run build:visual-production-system first");
  const plan = readJson(planPath);
  if (plan.contract !== "A1VisualProductionSystem/v1") throw new Error(`unexpected-system-plan-contract:${plan.contract}`);
  const authorityBefore = shaFile(currentPropsPath);
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const output = path.join(publicDir, "typography-system-specimen.png");
  try {
    const composition = await selectComposition({serveUrl, id: "A1TypographySystemSpecimen", inputProps: {}, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition, inputProps: {}, frame: 92, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  } finally {
    await browser.close({silent: true});
  }
  const metadata = await sharp(output).metadata();
  const report = {
    contract: "A1VisualTypographySpecimenReport/v1",
    phaseId,
    status: "PASS",
    systemPlanSha256: shaFile(planPath),
    specimen: {publicUrl: `/generated/system-line/${phaseId}/typography-system-specimen.png`, sha256: shaFile(output), width: Number(metadata.width || 0), height: Number(metadata.height || 0), frame: 92, reviewOnly: true},
    currentAuthority: {propsSha256Before: authorityBefore, propsSha256After: shaFile(currentPropsPath), unchanged: authorityBefore === shaFile(currentPropsPath)},
    gates: {fontSpecimenRendered: "PASS", editableCopyRequired: true, humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullMp4RenderAllowed: false},
  };
  writeJson(path.join(artifactDir, "typography-specimen-report.json"), report);
  writeJson(path.join(publicDir, "typography-specimen-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
