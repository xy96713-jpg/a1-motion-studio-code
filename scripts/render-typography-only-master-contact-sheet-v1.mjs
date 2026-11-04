import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/typography-only-authority-v1");
const library = JSON.parse(fs.readFileSync(path.join(root, "work/typography-director-v2/figma-typography-master-library-v1.json"), "utf8"));
const families = ["PRESENTER_IDENTITY_HERO", "FULLSCREEN_CHAPTER_HERO", "CONCLUSION_STAMP", "GIANT_NUMBER_OBJECT", "ROLE_GRID_PROCESS", "DARK_RESET_VERDICT"];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cells = [];
const checks = [];

for (const [index, family] of families.entries()) {
  const file = path.join(root, "work/typography-director-v2/figma-scale-review", family, "1920x1080.png");
  const svgFile = path.join(root, "work/typography-director-v2/compiled-master-svg", `${family}.svg`);
  const svg = fs.readFileSync(svgFile, "utf8");
  const forbiddenElementMatches = svg.match(/<(?:rect|line|circle|ellipse|polygon|star)\b/gu) || [];
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let offset = 3; offset < data.length; offset += info.channels) {
    if (data[offset] === 0) transparentPixels += 1;
    else visiblePixels += 1;
  }
  const binding = library.bindings.find((item) => item.masterFamily === family);
  const pass = info.width === 1920 && info.height === 1080 && info.channels === 4 && transparentPixels > 0 && visiblePixels > 0 && forbiddenElementMatches.length === 0 && binding?.typographyOnlyAudit?.status === "PASS";
  checks.push({family, pass, width: info.width, height: info.height, channels: info.channels, transparentPixels, visiblePixels, forbiddenSvgElementCount: forbiddenElementMatches.length, typographyOnlyAuditStatus: binding?.typographyOnlyAudit?.status || "MISSING"});
  const resized = await sharp(file).resize(640, 360, {fit: "fill"}).png().toBuffer();
  const cell = await sharp({create: {width: 640, height: 360, channels: 4, background: {r: 119, g: 119, b: 119, alpha: 1}}}).composite([{input: resized, left: 0, top: 0}]).png().toBuffer();
  cells.push({input: cell, left: (index % 3) * 640, top: Math.floor(index / 3) * 360});
}

fs.mkdirSync(workDir, {recursive: true});
const output = path.join(workDir, "typography-only-six-master-contact-sheet.png");
await sharp({create: {width: 1920, height: 720, channels: 4, background: {r: 119, g: 119, b: 119, alpha: 1}}}).composite(cells).png().toFile(output);
const receipt = {
  contract: "A1TypographyOnlyMasterContactSheet/v1",
  status: checks.every((item) => item.pass) ? "PASS" : "BLOCK",
  masterCount: checks.length,
  output: path.relative(root, output),
  outputSha256: sha(fs.readFileSync(output)),
  reviewPlate: {kind: "NEUTRAL_MID_GRAY", reviewOnly: true, authoredDesignElement: false, exportAllowed: false, productionAllowed: false},
  checks,
  formalAssetsRemainTransparent: true,
  formalBoardMutation: false,
};
fs.writeFileSync(path.join(workDir, "contact-sheet-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(JSON.stringify(receipt, null, 2));
if (receipt.status !== "PASS") process.exitCode = 1;

