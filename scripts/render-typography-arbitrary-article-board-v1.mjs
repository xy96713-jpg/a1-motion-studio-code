import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {deriveTypographyDisplayGroupsV2, deriveTypographySemanticEventV2, resolveTypographyRoleV2} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "work/style-research/gawx-typography-robot-2026-09-22-blind-fixtures.json"), "utf8"));
const outputDir = path.join(root, "work/typography-arbitrary-article-v1");
const escapeXml = (value) => String(value ?? "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const roleColor = {FULLSCREEN_HERO: "#f04b42", CONCLUSION_STAMP: "#ff786f", EXPLANATION_DIAGRAM: "#dfbf43", EVIDENCE_HIGHLIGHT: "#52baa9", SOURCE_NATIVE: "#3563f5", NO_TYPE: "#242829", PRESENTER_MARKER: "#c8ff36"};
const fontFor = (role) => role === "FULLSCREEN_HERO" || role === "CONCLUSION_STAMP" ? "Source Han Serif CN, Noto Serif CJK SC, serif" : "Source Han Sans CN, Noto Sans CJK SC, sans-serif";

const rows = fixture.flatMap((article) => article.beats.map((beat, index) => {
  const semanticEvent = deriveTypographySemanticEventV2({...beat, index, importance: beat.importance});
  const role = resolveTypographyRoleV2({...beat, semanticEvent, sourceNative: beat.sourceBound === true, sourceEvidenceRequired: beat.sourceBound === true});
  const groups = deriveTypographyDisplayGroupsV2({exactCopy: beat.copy, role, semanticEvent});
  return {genre: article.genre, beatId: beat.beatId, semanticEvent, role, groups};
}));

const cellWidth = 580;
const cellHeight = 250;
const columns = 2;
const rowsPerPage = Math.ceil(rows.length / columns);
const width = columns * cellWidth;
const height = rowsPerPage * cellHeight + 92;
const cells = rows.map((item, index) => {
  const x = (index % columns) * cellWidth;
  const y = 92 + Math.floor(index / columns) * cellHeight;
  const color = roleColor[item.role] || "#555";
  const headline = item.groups.headline || "（留白）";
  const support = item.groups.support || "";
  return `<g transform="translate(${x} ${y})"><rect width="${cellWidth - 14}" height="${cellHeight - 14}" rx="3" fill="#121718" stroke="#2e3838"/><rect width="8" height="${cellHeight - 14}" fill="${color}"/><text x="28" y="34" fill="#a4b0aa" font-family="Avenir Next,Arial,sans-serif" font-size="14">${escapeXml(item.genre.toUpperCase())} · ${escapeXml(item.beatId)} · ${escapeXml(item.semanticEvent)}</text><text x="${cellWidth - 46}" y="34" text-anchor="end" fill="${color}" font-family="Avenir Next,Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(item.role)}</text><text x="28" y="112" fill="#f4f1e8" font-family="${fontFor(item.role)}" font-size="42" font-weight="800">${escapeXml(headline)}</text>${support ? `<text x="28" y="156" fill="#b7c0ba" font-family="Source Han Sans CN, Noto Sans CJK SC, sans-serif" font-size="21">${escapeXml(support)}</text>` : ""}<text x="28" y="208" fill="#72807a" font-family="Avenir Next,Arial,sans-serif" font-size="12">${item.groups.reviewRequired ? "REVIEW: needs phrase decision" : item.role === "NO_TYPE" ? "NO TYPE · keep visual breathing" : "headline / support hierarchy"}</text></g>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#080b0b"/><text x="28" y="34" fill="#c8ff36" font-family="Avenir Next,Arial,sans-serif" font-size="18" font-weight="700">A1 TYPOGRAPHY · ARBITRARY ARTICLE BOARD</text><text x="28" y="63" fill="#8d9991" font-family="Avenir Next,Arial,sans-serif" font-size="13">Gawx role switching · editable hierarchy · no-type breathing room · review-only</text>${cells}</svg>`;
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "board.svg"), svg, "utf8");
await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, "board.png"));
const report = {contract: "A1TypographyArbitraryArticleBoard/v1", status: "READY_FOR_REVIEW", articleCount: fixture.length, beatCount: rows.length, board: "work/typography-arbitrary-article-v1/board.png", rows};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, articleCount: report.articleCount, beatCount: report.beatCount, board: report.board}, null, 2));
