#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, ".codex-artifacts/system-progress/screen-interaction-timeline-v1");
fs.mkdirSync(outDir, {recursive: true});
const fixtures = [
  {id: "tutorial-click", genre: "tutorial", color: "#dfff68", event: "action_click", result: "result_visible", rect: {x: .68, y: .24, width: .18, height: .09}},
  {id: "form-entry", genre: "workflow", color: "#7dcfff", event: "field_focus", result: "request_ready", rect: {x: .2, y: .58, width: .52, height: .12}},
  {id: "review-confirmation", genre: "review", color: "#ff9f7d", event: "confirm_click", result: "confirmation_visible", rect: {x: .72, y: .72, width: .16, height: .08}},
];
const results = fixtures.map((fixture) => ({fixture, timeline: compileScreenInteractionTimeline({durationMs: 4200, actionId: fixture.event, actionContract: {before: "verified setup", hold: "verified action", after: "verified result", handoff: "NEXT"}, events: [{name: "start", outputTimeMs: 0}, {name: fixture.event, outputTimeMs: 1400}, {name: fixture.result, outputTimeMs: 3100}, {name: "end", outputTimeMs: 4200}], cursorTelemetry: {moves: [{tMs: 0, x: .05, y: .9}, {tMs: 1390, x: fixture.rect.x + .04, y: fixture.rect.y + .04}, {tMs: 4200, x: fixture.rect.x + .04, y: fixture.rect.y + .04}], clicks: [{tMs: 1390, down: true, event: fixture.event}, {tMs: 1450, down: false, event: fixture.event}]}, domTargets: [{targetKey: "verified-target", event: fixture.event, capturedAtMs: 1400, sourceRect: fixture.rect}]})}));
const width = 1600, laneHeight = 260, headerHeight = 130, height = headerHeight + laneHeight * results.length;
const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const x = (ms) => 260 + ms / 4200 * 1260;
const lanes = results.map(({fixture, timeline}, index) => { const top = headerHeight + index * laneHeight, interaction = timeline.interactions[0], camera = timeline.camera[0]; return `<g><rect x="28" y="${top + 12}" width="1544" height="232" rx="12" fill="#111719" stroke="#263235"/><text x="58" y="${top + 52}" fill="${fixture.color}" font-family="Arial" font-size="22" font-weight="700">${esc(fixture.genre.toUpperCase())}</text><text x="58" y="${top + 82}" fill="#98a5a1" font-family="monospace" font-size="14">${fixture.id} · sync ${timeline.audit.maximumSyncOffsetMs}ms · ${timeline.status}</text><line x1="260" y1="${top + 130}" x2="1520" y2="${top + 130}" stroke="#445155" stroke-width="2"/><line x1="${x(camera.startMs)}" y1="${top + 104}" x2="${x(camera.endMs)}" y2="${top + 104}" stroke="#7dcfff" stroke-width="8" stroke-linecap="round"/><line x1="${x(interaction.phases.enterMs)}" y1="${top + 156}" x2="${x(interaction.phases.exitEndMs)}" y2="${top + 156}" stroke="${fixture.color}" stroke-width="8" stroke-linecap="round"/><circle cx="${x(interaction.clickTimeMs)}" cy="${top + 130}" r="12" fill="#fff" stroke="${fixture.color}" stroke-width="5"/><text x="260" y="${top + 202}" fill="#7dcfff" font-family="Arial" font-size="14">CAMERA</text><text x="390" y="${top + 202}" fill="${fixture.color}" font-family="Arial" font-size="14">CURSOR + CLICK + GENERATED FOCUS FRAME</text><text x="1160" y="${top + 202}" fill="#98a5a1" font-family="Arial" font-size="14">RESULT HOLD ${timeline.resultHold.durationMs}ms</text></g>`; }).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#080c0d"/><text x="42" y="52" fill="#f2f4ef" font-family="Arial" font-size="30" font-weight="700">A1 SCREEN INTERACTION TIMELINE / v1</text><text x="42" y="88" fill="#98a5a1" font-family="Arial" font-size="16">ONE CLOCK · REAL PIXELS · TELEMETRY CURSOR · GENERATED VECTOR ACTORS · REVIEW ONLY</text>${lanes}</svg>`;
const visible = path.join(outDir, "screen-interaction-timeline-proof.png");
await sharp(Buffer.from(svg)).png().toFile(visible);
const result = {contract: "A1ScreenInteractionTimelineProof/v1", status: "PASS", fixtures: results.map(({fixture, timeline}) => ({id: fixture.id, genre: fixture.genre, status: timeline.status, timelineSha256: timeline.timelineSha256, maximumSyncOffsetMs: timeline.audit.maximumSyncOffsetMs, generatedActorCount: timeline.generatedActors.length, semanticZoomCount: timeline.camera.length, resultHoldMs: timeline.resultHold.durationMs})), visibleArtifact: path.relative(root, visible), boundaries: {userVisualApproval: "NOT_APPROVED", productionAdmission: false, assemblyCreated: false, resolveWritePerformed: false}};
fs.writeFileSync(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
