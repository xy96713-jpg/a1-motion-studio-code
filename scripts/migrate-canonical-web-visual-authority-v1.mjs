#!/usr/bin/env node

import crypto from "node:crypto";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = new URL("../apps/studio-next/", import.meta.url).pathname.replace(/\/$/u, "");
const {artifactDir} = projectDirs(appRoot);
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const LEGACY_RULE = /默认使用黑[\/／]白[\/／]奶油|小尺度浅黄色|默认使用蓝白|奶油[\/／]炭黑加钴蓝|默认.*钴蓝|固定.*钴蓝/iu;
const ACTIVE_RULES = [
  "当前默认底色为 neutral-white、cool-gray、footage-derived 或 charcoal；颜色由镜头语义决定。",
  "暖黄、米色、棕褐和奶油纸只在明确档案/历史/纸张语义且获得用户批准时启用。",
  "复古像素是视觉语法：像素/手工字体、点阵、半调、旧电脑或实体物件必须承担明确语义动作。",
  "每镜选择 2–4 个真实 hash 参考；参考包提供语法，不提供固定配色、单张母图或重复构图。",
];

function migratePack(pack) {
  const sources = Array.isArray(pack?.sources) ? pack.sources : [];
  const active = [];
  const history = [];
  for (const source of sources) {
    const legacy = /cobalt|(?:-08|-09)$/iu.test(String(source.id || ""));
    if (!legacy) active.push({...source, active: true, historyReadOnly: false});
    else history.push({...source, id: `${source.id}-cobalt-legacy-v1`, active: false, historyReadOnly: true, status: "HISTORY_READ_ONLY", supersededBy: "active-shot-local-reference-selection-v2"});
  }
  return {
    ...pack,
    version: 2,
    status: "USER_PROVIDED_REFERENCE_LOCK_WITH_VERSIONED_LEGACY_SOURCES",
    sourceCount: active.length,
    sources: active,
    historyReadOnlySources: history,
    referenceVersionMap: {
      contract: "A1ReferenceVersionMap/v1",
      activePackVersion: "pinterest-retro-pixel-v1-active-neutral-v2",
      legacy: history.map((source) => ({id: source.id, sha256: source.sha256, status: source.status})),
      sameIdDifferentShaForbidden: true,
    },
    visualThesis: "早期电脑图形的像素秩序与编辑构图结合：中性白、冷灰、素材取色或炭黑承载点阵、像素角色、旧系统物件和实体材质；颜色与构图由镜头语义决定。",
    palette: {
      ...(pack.palette || {}),
      base: ["neutral-white", "cool-gray", "footage-derived", "charcoal"],
      rule: "shot-local semantic palette; warm yellow is opt-in archival material only",
      fixedPaletteForbidden: true,
      paletteMayVaryByShot: true,
    },
    grammar: [...new Set([...(pack.grammar || []), "reference-pack-is-grammar-not-single-mother", "shot-local-reference-subset-required"])],
  };
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  next.visualBible ||= {};
  const oldRules = Array.isArray(next.visualBible.globalRules) ? next.visualBible.globalRules : [];
  const movedRules = oldRules.filter((rule) => LEGACY_RULE.test(String(rule)));
  const retainedRules = oldRules.filter((rule) => !LEGACY_RULE.test(String(rule)) && !/default.*(?:cream|cobalt|yellow)|warm cream|fixed cobalt/iu.test(String(rule)));
  next.visualBible.historyReadOnlyRules = [
    ...(Array.isArray(next.visualBible.historyReadOnlyRules) ? next.visualBible.historyReadOnlyRules : []),
    ...movedRules.map((rule) => ({rule, status: "HISTORY_READ_ONLY", supersededAt: now, reason: "fixed palette or undersized-caption rule cannot govern current web generation"})),
  ].filter((item, index, list) => list.findIndex((other) => other.rule === item.rule) === index);
  next.visualBible.globalRules = [...new Set([...retainedRules, ...ACTIVE_RULES])];
  const oldPack = next.visualBible.visualGenerationPolicy?.visualReferencePack || next.visualBible.visualReferencePack || next.production?.visualDirector?.visualReferencePack;
  const activePack = migratePack(oldPack || {id: "pinterest-retro-pixel-v1", sources: []});
  next.visualBible.visualReferencePack = activePack;
  next.visualBible.visualGenerationPolicy = {...(next.visualBible.visualGenerationPolicy || {}), visualReferencePack: activePack, referencePackVersion: activePack.referenceVersionMap.activePackVersion, fixedPaletteForbidden: true, paletteMayVaryByShot: true};
  next.production.visualDirector = {...(next.production.visualDirector || {}), visualReferencePack: activePack};
  next.typographySystem = {...(next.typographySystem || {}), visualGenerationPolicy: {...(next.typographySystem?.visualGenerationPolicy || {}), visualReferencePack: activePack}};
  next.candidateAdmission = {...(next.candidateAdmission || {}), visualReferencePack: activePack};
  const event = createProductionEvent({workspace: current, action: "canonical-web-visual-authority-migrated", targetId: activePack.id, payload: {movedRuleCount: movedRules.length, activeReferenceCount: activePack.sourceCount, legacyReferenceCount: activePack.historyReadOnlySources.length, activePalettePolicy: "neutral-white/cool-gray/footage-derived/charcoal"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {
    contract: "A1CanonicalWebVisualAuthorityMigration/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    movedRuleCount: movedRules.length,
    movedRules: movedRules.map((rule) => ({rule, status: "HISTORY_READ_ONLY"})),
    activeRules: ACTIVE_RULES,
    referencePack: {id: activePack.id, activeSourceCount: activePack.sourceCount, activeSourceIds: activePack.sources.map((source) => source.id), historyReadOnlySources: activePack.historyReadOnlySources.map((source) => ({id: source.id, sha256: source.sha256}))},
    fixedPaletteForbidden: true,
    palettePolicy: "neutral-white/cool-gray/footage-derived/charcoal; shot-local semantic accent; warm yellow opt-in only",
    generationCalls: 0,
    boardRebuilt: false,
    assemblyStarted: false,
    migratedAt: now,
  };
  const saved = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"canonical-web-generation-v1/visual-authority-migration-report.json": report}});
  return {report, workspaceSha256: saved.workspaceSha256};
});

console.log(JSON.stringify({...result.report, workspaceSha256: result.workspaceSha256}, null, 2));
