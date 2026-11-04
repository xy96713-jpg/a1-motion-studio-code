import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {buildTypographySequenceLedger} from "../apps/studio-next/src/lib/a1-whole-film-typography-duty-map-v1.mjs";
import {displayCopyForTypographyRole, fontConfigurationForTypographyRole} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json");
const outputDir = path.join(root, "work/typography-director-v2/blind-fixtures");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const escapeXml = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const modeByGenre = {
  "evidence-explainer": "EVIDENCE_ESSAY",
  "product-tutorial": "PRODUCT_TUTORIAL",
  "personal-opinion": "LONG_TAKE_OPINION",
};

function roleForBeat(genre, index) {
  if (index === 0) return genre === "evidence-explainer" ? "EVIDENCE_HIGHLIGHT" : genre === "product-tutorial" ? "SOURCE_NATIVE" : "PRESENTER_MARKER";
  if (index === 1) return genre === "product-tutorial" ? "SOURCE_NATIVE" : "FULLSCREEN_HERO";
  if (index === 2) return genre === "evidence-explainer" ? "EVIDENCE_TRANSLATION" : genre === "product-tutorial" ? "OBJECT_ATTACHED_LABEL" : "PRESENTER_MARKER";
  if (index === 3) return "NO_TYPE";
  if (index === 4) return "SOURCE_NATIVE";
  if (index === 5) return "EXPLANATION_DIAGRAM";
  if (index === 6) return genre === "product-tutorial" ? "SOURCE_NATIVE" : "OBJECT_ATTACHED_LABEL";
  return "CONCLUSION_STAMP";
}

const reports = fixtures.articles.map((article) => {
  const programMode = modeByGenre[article.genre];
  assert.ok(programMode, `unsupported blind genre:${article.genre}`);
  const assignments = article.shots.map((copy, index) => {
    const typographyRole = roleForBeat(article.genre, index);
    const masterFamily = typographyRole === "FULLSCREEN_HERO" ? "FULLSCREEN_CHAPTER_HERO" : typographyRole === "CONCLUSION_STAMP" ? "CONCLUSION_STAMP" : typographyRole === "EXPLANATION_DIAGRAM" && index === 5 ? "ROLE_GRID_PROCESS" : null;
    return {
      shotId: `${article.id}-${String(index + 1).padStart(2, "0")}`,
      programMode,
      typographyRole,
      carrier: typographyRole === "NO_TYPE" ? "NONE" : typographyRole === "SOURCE_NATIVE" ? "REAL_SOURCE_SURFACE" : masterFamily ? "FIGMA_MASTER" : "SEMANTIC_ATTACHED",
      masterFamily,
      exactCopy: typographyRole === "NO_TYPE" ? "" : copy,
      displayCopy: displayCopyForTypographyRole({exactCopy: copy, role: typographyRole, sourceLocked: typographyRole === "SOURCE_NATIVE" || typographyRole.startsWith("EVIDENCE_")}),
      fontConfiguration: fontConfigurationForTypographyRole(typographyRole),
      motionPlan: masterFamily ? {handoffFromPrevious: "PREVIOUS_BEAT", handoffToNext: "NEXT_BEAT"} : null,
    };
  });
  const ledger = buildTypographySequenceLedger(assignments);
  assert.equal(ledger.status, "PASS_REVIEW_ONLY", `${article.id} sequence must pass`);
  assert.equal(assignments.filter((item) => item.typographyRole === "NO_TYPE").length, 1);
  assert.ok(assignments.filter((item) => item.typographyRole === "SOURCE_NATIVE").every((item) => item.displayCopy === item.exactCopy));
  assert.ok(assignments.filter((item) => item.masterFamily).every((item) => item.motionPlan));
  return {articleId: article.id, genre: article.genre, programMode, assignments, sequenceLedger: ledger};
});

assert.equal(reports.length, 6);
assert.equal(reports.filter((item) => item.genre === "evidence-explainer").length, 2);
assert.equal(reports.filter((item) => item.genre === "product-tutorial").length, 2);
assert.equal(reports.filter((item) => item.genre === "personal-opinion").length, 2);

const colors = {SOURCE_NATIVE: "#2358ff", EVIDENCE_HIGHLIGHT: "#50b9a6", EVIDENCE_TRANSLATION: "#348f80", PRESENTER_MARKER: "#c8ff36", FULLSCREEN_HERO: "#ff473d", CONCLUSION_STAMP: "#ff786f", EXPLANATION_DIAGRAM: "#d9b842", OBJECT_ATTACHED_LABEL: "#8a79d8", NO_TYPE: "#25292a"};
const cellWidth = 188;
const rowHeight = 150;
const svgHeight = 110 + reports.length * rowHeight;
const rows = reports.map((report, rowIndex) => {
  const y = 90 + rowIndex * rowHeight;
  const cells = report.assignments.map((item, index) => `<g transform="translate(${310 + index * cellWidth} ${y})"><rect width="176" height="108" fill="${colors[item.typographyRole] || "#777"}"/><text x="12" y="25" fill="#fff" font-family="Arial" font-size="12" font-weight="700">${escapeXml(item.typographyRole)}</text><text x="12" y="88" fill="#fff" font-family="Arial" font-size="11">${index + 1}</text></g>`).join("");
  return `<text x="28" y="${y + 26}" fill="#f3f2ec" font-family="Arial" font-size="18" font-weight="700">${escapeXml(report.articleId)}</text><text x="28" y="${y + 54}" fill="#8e9791" font-family="Arial" font-size="13">${escapeXml(report.programMode)}</text>${cells}`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${svgHeight}" viewBox="0 0 1920 ${svgHeight}"><rect width="1920" height="${svgHeight}" fill="#0b0e0f"/><text x="28" y="42" fill="#c8ff36" font-family="Arial" font-size="16" font-weight="700">A1 TYPOGRAPHY DIRECTOR V2  SIX BLIND FIXTURES</text><text x="28" y="66" fill="#89928d" font-family="Arial" font-size="12">2 evidence  2 product  2 opinion  frozen router</text>${rows}</svg>`;
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "blind-fixture-board.svg"), svg, "utf8");
await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "blind-fixture-board.png"));
const report = {contract: "A1TypographyDirectorV2BlindFixtureReport/v1", status: "PASS", frozenFixtureSha256: sha(fs.readFileSync(fixturePath)), articleCount: reports.length, genres: Object.fromEntries([...new Set(reports.map((item) => item.genre))].map((genre) => [genre, reports.filter((item) => item.genre === genre).length])), reports, board: {svg: "work/typography-director-v2/blind-fixtures/blind-fixture-board.svg", png: "work/typography-director-v2/blind-fixtures/blind-fixture-board.png", pngSha256: sha(fs.readFileSync(path.join(outputDir, "blind-fixture-board.png")))}, productionAdmission: false};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, articleCount: report.articleCount, genres: report.genres, boardSha256: report.board.pngSha256}, null, 2));

