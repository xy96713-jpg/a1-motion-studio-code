#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {
  claimShotImagegenToolV1,
  completeShotImagegenToolV1,
  readShotTaskRuntimeV1,
  runShotTaskActionV1,
  syncShotTaskRuntimeV1,
} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

export const HUPO_RESEARCH_PHASE_ID = 'hupo-69-shot-research-reconstruction-v1';
export const HUPO_RESEARCH_TASK_ID = 'hupo-69-shot-reconstruction-v1';
export const HUPO_RESEARCH_PLAN_PATH = `work/${HUPO_RESEARCH_TASK_ID}/shot-task-plan-v1.json`;

const repoRoot = path.resolve(import.meta.dirname, '..');
const phasePath = path.join(repoRoot, '.codex-artifacts/system-progress/current-phase.json');
const taskRoot = path.join(repoRoot, 'work', HUPO_RESEARCH_TASK_ID);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function articleSourceDiscoveryOutcomes(runtime) {
  return (runtime?.workflow?.nodes || []).filter((node) => node.module === 'article-source-discovery').map((node) => {
    const discovery = node.result?.articleSourceDiscovery;
    return {
      nodeId: node.id, shotId: node.shotId, executionState: node.state,
      discoveryStatus: discovery?.status || 'NOT_REPORTED',
      queryBasis: discovery?.request?.queryBasis || node.input?.parameters?.request?.queryBasis || null,
      candidateCount: Number.isInteger(discovery?.counts?.candidateCount) ? discovery.counts.candidateCount : null,
      candidates: (discovery?.candidates || []).slice(0, 5).map((candidate) => ({
        title: String(candidate.title || '').slice(0, 320), publisher: String(candidate.publisher || '').slice(0, 200),
        url: String(candidate.url || '').slice(0, 1200), excerptMatchMode: candidate.excerptMatch?.mode || 'NO_SNIPPET_MATCH',
        excerptMatchScore: Number.isFinite(candidate.excerptMatch?.score) ? candidate.excerptMatch.score : 0,
        candidateOrigin: candidate.candidateOrigin || 'PUBLIC_INDEX',
        ...(candidate.researchRelation ? {researchRelation: candidate.researchRelation} : {}),
        ...(candidate.researchNote ? {researchNote: String(candidate.researchNote).slice(0, 320)} : {}),
        copyVerified: false, rightsVerified: false,
      })),
      candidateReviewRequired: true, articleBodyFetched: false, mediaDownloaded: false,
      sourceSelected: false, sourceLockVerified: false, productionAdmission: false,
    };
  });
}

function assertInside(root, candidate, code) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(code);
  }
}

function assertCurrentResearchPhase() {
  const phase = JSON.parse(fs.readFileSync(phasePath, 'utf8'));
  if (phase.contract !== 'A1SystemProgressPhase/v1' || phase.phaseId !== HUPO_RESEARCH_PHASE_ID
    || phase.status !== 'active' || phase.execution?.approvalState !== 'granted') {
    throw new Error('hupo-research-phase-not-active-or-approved');
  }
  if (!phase.execution.writeScope?.includes(`work/${HUPO_RESEARCH_TASK_ID}`)
    || !phase.execution.writeScope?.includes('scripts/run-hupo-69-shot-research-reconstruction-v1.mjs')) {
    throw new Error('hupo-research-runner-outside-phase-write-scope');
  }
  const planPath = path.join(repoRoot, HUPO_RESEARCH_PLAN_PATH);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (plan.contract !== 'A1ShotTaskPlan/v1' || plan.projectId !== HUPO_RESEARCH_TASK_ID
    || plan.scope !== 'RESEARCH_ONLY' || plan.productionAdmission !== false) {
    throw new Error('hupo-research-task-boundary-invalid');
  }
  return {phase, plan};
}

export function parseHupoResearchRunnerArgs(argv) {
  const [action = 'status', nodeId, workerId, requestPath, outputPath] = argv;
  const actions = new Set(['status', 'report', 'sync-plan', 'tick', 'retry', 'resume', 'verify', 'imagegen-claim', 'imagegen-complete', 'help', '--help']);
  if (!actions.has(action)) throw new Error('hupo-research-action-invalid');
  if (['retry', 'resume', 'verify', 'imagegen-claim', 'imagegen-complete'].includes(action) && !nodeId) {
    throw new Error('hupo-research-node-id-required');
  }
  if (action === 'imagegen-complete' && (!workerId || !requestPath || !outputPath)) {
    throw new Error('hupo-research-imagegen-completion-inputs-required');
  }
  return {action, nodeId, workerId, requestPath, outputPath};
}

function resolveTaskFile(candidate, code) {
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(code);
  const absolute = path.resolve(repoRoot, candidate);
  assertInside(taskRoot, absolute, code);
  const real = fs.realpathSync(absolute);
  assertInside(fs.realpathSync(taskRoot), real, code);
  if (!fs.statSync(real).isFile()) throw new Error(code);
  return real;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/gu, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}

function writeAtomicInsideTask(filename, bytes) {
  const realRoot = fs.realpathSync(taskRoot), absolute = path.resolve(filename);
  if (realRoot !== taskRoot) throw new Error('hupo-research-task-root-symlink-forbidden');
  assertInside(realRoot, absolute, 'hupo-result-path-outside-task');
  const temp = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, bytes, {flag:'wx'});
  try { fs.renameSync(temp, absolute); }
  catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
}

async function createIncompleteResearchProof({phase, plan, runtime, planSha256}) {
  if (runtime.pending || !runtime.workflow) throw new Error('hupo-research-report-plan-not-current');
  const artifactRoot = fs.realpathSync(runtime.artifactRoot);
  const shots = [], excludedUnverifiedAssets = [];
  for (const shot of plan.shots) {
    const nodes = runtime.workflow.nodes.filter((node) => node.id.startsWith(`${shot.id}:`));
    const candidateAssets = [];
    for (const task of imageOutputTasks(plan, shot.id)) {
      const node = nodes.find((item) => item.module === task.module);
      if (node?.state !== 'succeeded') continue;
      for (const artifact of node.result?.artifactManifest?.artifacts || []) {
        if (artifact.kind !== 'IMAGE' || !/^[a-f0-9]{64}$/u.test(artifact.sha256 || '')) continue;
        if (['reference','reference-only','source-frame'].includes(String(artifact.role || '').toLowerCase())
          || !hasNoSourcePixelsProvenance(task, artifact.sha256)) {
          excludedUnverifiedAssets.push({shotId:shot.id,nodeId:node.id,role:artifact.role,reason:'SOURCE_PIXEL_PROVENANCE_NOT_CLEAR'});
          continue;
        }
        const absolute = path.resolve(artifactRoot, artifact.path);
        assertInside(artifactRoot, absolute, 'hupo-preview-artifact-path-invalid');
        const real = fs.realpathSync(absolute);
        assertInside(artifactRoot, real, 'hupo-preview-artifact-symlink-invalid');
        const bytes = fs.readFileSync(real);
        if (sha256(bytes) !== artifact.sha256 || (artifact.bytes != null && bytes.length !== artifact.bytes)) {
          throw new Error(`hupo-preview-artifact-sha-mismatch:${node.id}`);
        }
        if (bytes.length > 32 * 1024 * 1024) continue;
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp'].includes(metadata.format)) continue;
        candidateAssets.push({
          nodeId: node.id, module: node.module, role: artifact.role,
          sha256: artifact.sha256, width: metadata.width, height: metadata.height,
          path: artifact.path, bytes: bytes.length, previewBytes: bytes,
        });
      }
    }
    const stateCounts = {};
    for (const node of nodes) stateCounts[node.state] = (stateCounts[node.state] || 0) + 1;
    const state = nodes.some((node) => node.state === 'blocked') ? 'BLOCKED'
      : nodes.some((node) => node.state === 'needs-review') ? 'REVIEW_REQUIRED'
      : nodes.some((node) => node.state === 'succeeded') ? 'TECHNICAL_OUTPUT_PRESENT' : 'NO_NODE';
    shots.push({
      shotId: shot.id, state, taskCount: (shot.tasks || []).length, nodeStateCounts: stateCounts,
      blockedNodeIds: nodes.filter((node) => node.state === 'blocked').map((node) => node.id),
      candidateAssets: candidateAssets.map(({previewBytes, ...asset}) => asset),
      previewAssets: candidateAssets,
    });
  }

  const width = 2240, columns = 7, cellWidth = 320, cellHeight = 186, headerHeight = 150, footerHeight = 116;
  const rows = Math.ceil(shots.length / columns), height = headerHeight + rows * cellHeight + footerHeight;
  const statusCounts = {};
  for (const shot of shots) statusCounts[shot.state] = (statusCounts[shot.state] || 0) + 1;
  const candidateAssetCount = shots.reduce((total, shot) => total + shot.candidateAssets.length, 0);
  const shotsWithCandidates = shots.filter((shot) => shot.candidateAssets.length > 0).length;
  const registry = createNodeAdapterRegistry().registry;
  const moduleInventory = runtime.coverage.modules.map((module) => ({
    id:module.id, label:module.label, registered:Object.hasOwn(registry,module.id),
    executorAvailable:registry[module.id]?.available===true && typeof registry[module.id]?.execute==='function', selectedShots:module.selectedShots,
    runtimeStates:module.runtimeStates, disposition:module.decision, status:module.status, reason:module.reason,
  }));
  const registryModuleIds=Object.keys(registry).sort();
  const executableAdapterIds=registryModuleIds.filter((id)=>registry[id]?.available===true&&typeof registry[id]?.execute==='function');
  const registeredWithoutExecutor=registryModuleIds.filter((id)=>!executableAdapterIds.includes(id));
  const coveredModuleIds=new Set(moduleInventory.map((module)=>module.id));
  const moduleAudit={
    scope:'ACTIVE_HUBO_RESEARCH_TASK', registryEntryCount:registryModuleIds.length, executableAdapterCount:executableAdapterIds.length,
    registeredWithoutExecutor, coverageEntryCount:moduleInventory.length,
    missingRegisteredModules:registryModuleIds.filter((id)=>!coveredModuleIds.has(id)),
    coverageOnlyStages:moduleInventory.filter((module)=>!module.registered).map(({id,status,disposition,reason})=>({id,status,disposition,reason})),
    routeGaps:runtime.coverage.routeGaps, unreviewedModules:runtime.coverage.unreviewedModules,
    readinessDisclaimer:'executorAvailable means a registered adapter execute function exists; registry presence does not prove provider credentials, live submission, accepted output, visual approval, or production admission.',
    modules:moduleInventory,
  };
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#101820"/>`,
    `<text x="40" y="52" fill="#f4f0e6" font-family="Arial,sans-serif" font-size="32" font-weight="700">HuBo 69-shot current output inventory</text>`,
    `<text x="40" y="92" fill="#ffbd69" font-family="Arial,sans-serif" font-size="22" font-weight="700">INCOMPLETE · NOT A VISUAL ACCEPTANCE BOARD · RESEARCH ONLY</text>`,
    `<text x="40" y="128" fill="#b7c3cc" font-family="Arial,sans-serif" font-size="17">Plan ${escapeXml(planSha256.slice(0,12))} · runtime r${runtime.workflow.revision} · ${shotsWithCandidates}/${shots.length} shots have technically accepted generated/type candidates · ${candidateAssetCount} candidate assets</text>`];
  const composites = [];
  for (const [index, shot] of shots.entries()) {
    const column = index % columns, row = Math.floor(index / columns);
    const x = column * cellWidth, y = headerHeight + row * cellHeight;
    const statusColor = shot.state === 'BLOCKED' ? '#f29475'
      : shot.state === 'REVIEW_REQUIRED' ? '#ffcf70'
      : shot.state === 'TECHNICAL_OUTPUT_PRESENT' ? '#7bd5b1' : '#96a4ad';
    svg.push(`<rect x="${x+4}" y="${y+4}" width="${cellWidth-8}" height="${cellHeight-8}" rx="8" fill="#1a2933" stroke="#31424d"/>`);
    svg.push(`<text x="${x+16}" y="${y+29}" fill="#f4f0e6" font-family="Arial,sans-serif" font-size="21" font-weight="700">${escapeXml(shot.shotId)}</text>`);
    svg.push(`<text x="${x+cellWidth-14}" y="${y+28}" text-anchor="end" fill="${statusColor}" font-family="Arial,sans-serif" font-size="13" font-weight="700">${escapeXml(shot.state)}</text>`);
    if (shot.previewAssets.length) {
      const previews = shot.previewAssets.slice(0,2);
      const slotWidth = previews.length === 1 ? 278 : 132;
      for (const [assetIndex, asset] of previews.entries()) {
        const left = x + 16 + assetIndex * 142, top = y + 43;
        svg.push(`<rect x="${left}" y="${top}" width="${slotWidth}" height="86" rx="5" fill="#243742"/>`);
        const thumb = await sharp(asset.previewBytes).resize(slotWidth-8, 72, {fit:'contain',background:{r:36,g:55,b:66,alpha:1}}).png().toBuffer();
        composites.push({input:thumb,left:left+4,top:top+4});
      }
      svg.push(`<text x="${x+16}" y="${y+146}" fill="#a9d8c7" font-family="Arial,sans-serif" font-size="12">CANDIDATE ONLY · ${shot.previewAssets.length} image output${shot.previewAssets.length===1?'':'s'}</text>`);
    } else {
      svg.push(`<rect x="${x+16}" y="${y+43}" width="${cellWidth-32}" height="86" rx="5" fill="#202f38" stroke="#465761" stroke-dasharray="7 5"/>`);
      svg.push(`<text x="${x+cellWidth/2}" y="${y+91}" text-anchor="middle" fill="#96a4ad" font-family="Arial,sans-serif" font-size="15">NO ELIGIBLE IMAGE OUTPUT</text>`);
      svg.push(`<text x="${x+16}" y="${y+146}" fill="#b7c3cc" font-family="Arial,sans-serif" font-size="12">${shot.blockedNodeIds.length ? `${shot.blockedNodeIds.length} blocked node(s)` : 'No visual node output'}</text>`);
    }
    const modules = Object.entries(shot.nodeStateCounts).map(([state,count])=>`${state}:${count}`).join(' · ') || 'no node';
    svg.push(`<text x="${x+16}" y="${y+168}" fill="#80919b" font-family="Arial,sans-serif" font-size="11">${escapeXml(modules.slice(0,45))}</text>`);
  }
  const footerY = headerHeight + rows * cellHeight;
  svg.push(`<text x="40" y="${footerY+34}" fill="#f4f0e6" font-family="Arial,sans-serif" font-size="17">Visual approval: NOT_GRANTED · Full-film render: not registered · Packaging decisions blocked: ${runtime.decisions.length}</text>`);
  svg.push(`<text x="40" y="${footerY+64}" fill="#b7c3cc" font-family="Arial,sans-serif" font-size="14">Only technically accepted, SHA-bound generated illustrations and editable type candidates are previewed. Original/source-derived frames and external assets are excluded.</text>`);
  svg.push(`<text x="40" y="${footerY+91}" fill="#ffbd69" font-family="Arial,sans-serif" font-size="14">This sheet is an output inventory for blocker review; it does not show final shot compositions or grant visual approval.</text></svg>`);

  const png = await sharp(Buffer.from(svg.join(''))).composite(composites).png().toBuffer();
  const pngMetadata = await sharp(png).metadata();
  const sheetPath = path.join(taskRoot, '69-shot-contact-sheet.png');
  const resultPath = path.join(taskRoot, 'result.json');
  const report = {
    contract: 'A1HuBo69ShotResearchResult/v1', status: 'INCOMPLETE',
    phaseId: phase.phaseId, taskId: HUPO_RESEARCH_TASK_ID, scope: 'RESEARCH_ONLY',
    generatedAt: new Date().toISOString(), planSha256: planSha256,
    runtimeRevision: runtime.workflow.revision, shotCount: shots.length,
    packagingDecisionCount: runtime.decisions.length, decisionStates: runtime.decisions.reduce((counts, item) => {
      const state=item.decision?.status||'UNSPECIFIED'; counts[state]=(counts[state]||0)+1; return counts;
    }, {}),
    nodeCounts: runtime.summary?.counts || {}, shotStates: statusCounts,
    moduleAudit,
    articleSourceDiscoveryOutcomes: articleSourceDiscoveryOutcomes(runtime),
    preview: {shotsWithCandidateImages:shotsWithCandidates,candidateImageCount:candidateAssetCount,
      sourceFramesIncluded:0, externallySourcedImagesIncluded:0, excludedUnverifiedAssetCount:excludedUnverifiedAssets.length,
      visualApproval:'NOT_GRANTED', productionAdmission:false},
    excludedUnverifiedAssets,
    visibleArtifact: {path:`work/${HUPO_RESEARCH_TASK_ID}/69-shot-contact-sheet.png`,sha256:sha256(png),bytes:png.length,
      width:pngMetadata.width,height:pngMetadata.height,kind:'PARTIAL_OUTPUT_INVENTORY_NOT_VISUAL_ACCEPTANCE'},
    blockers: [...new Set(shots.flatMap((shot)=>shot.blockedNodeIds))].sort(),
    missingProof: ['69/69 final shot outputs and SHA receipts','complete packaging decisions','continuous full-timeline render and playback review','visual acceptance'],
    productionAdmission: false,
    shots: shots.map(({previewAssets,...shot})=>shot),
  };
  const latest = assertCurrentResearchPhase();
  if (latest.phase.phaseId !== phase.phaseId || nodeInputHash(latest.plan) !== planSha256) throw new Error('hupo-research-plan-changed-during-report');
  const resultBytes = Buffer.from(`${JSON.stringify(report,null,2)}\n`);
  writeAtomicInsideTask(sheetPath,png);
  writeAtomicInsideTask(resultPath,resultBytes);
  return {resultPath:`work/${HUPO_RESEARCH_TASK_ID}/result.json`,resultSha256:sha256(resultBytes),
    sheetPath:`work/${HUPO_RESEARCH_TASK_ID}/69-shot-contact-sheet.png`,sheetSha256:sha256(png),sheetBytes:png.length,
    status:report.status,shotsWithCandidateImages:shotsWithCandidates,candidateImageCount:candidateAssetCount,
    visualApproval:'NOT_GRANTED',productionAdmission:false};
}

export function hasResearchOnlyCompositionSourceBoundaryV1(shot, sourceVideoSha256) {
  const task=(shot?.tasks||[]).find(item=>item.module==='layer-compositor');
  const intent=task?.parameters?.compositionIntent, canvas=task?.parameters?.compositionCanvas;
  if(!task||intent?.contract!=='A1NodeLayerCompositionIntent/v1'||!Array.isArray(intent.layers)||!intent.layers.length
    ||canvas?.sourceVideoSha256!==sourceVideoSha256||(task.crossShotDependencies||[]).length) return false;
  const localModules=new Set(['asset-treatment','media-files','image-generation','editable-typography']);
  return intent.layers.every(layer=>typeof layer?.dependencyNodeId==='string'
    &&layer.dependencyNodeId.startsWith(`${shot.id}:`)
    &&localModules.has(layer.dependencyNodeId.slice(shot.id.length+1))
    &&typeof layer.artifactRole==='string'&&['IMAGE','SVG'].includes(layer.artifactKind));
}

function imageOutputTasks(plan, shotId) {
  const shot = plan.shots.find((item) => item.id === shotId);
  return (shot?.tasks || []).filter((task) => {
    if (!['image-generation', 'editable-typography', 'layer-compositor'].includes(task.module)) return false;
    if (task.module === 'image-generation' && (task.parameters?.generationRequest?.references || []).length) return false;
    if (task.module === 'layer-compositor' && (!shot.packagingDecision
      || task.parameters?.compositionIntent?.contract !== 'A1NodeLayerCompositionIntent/v1'
      || !Array.isArray(task.parameters?.compositionIntent?.layers) || !task.parameters.compositionIntent.layers.length
      || (task.crossShotDependencies || []).length)) return false;
    return true;
  }).map((task) => ({...task, reportShotId: shotId,
    ...(task.module==='layer-compositor'?{researchOnlyCompositionSourceBoundary:hasResearchOnlyCompositionSourceBoundaryV1(shot,plan.source?.videoSha256)}:{})}));
}

function hasNoSourcePixelsProvenance(task, artifactSha256) {
  if (task.module === 'editable-typography') return true;
  if (task.module === 'layer-compositor') {
    return task.researchOnlyCompositionSourceBoundary === true && /^[a-f0-9]{64}$/u.test(artifactSha256);
  }
  const request = task.parameters?.generationRequest;
  if (request && Array.isArray(request.references) && request.references.length === 0
    && !(task.parameters.referenceOnlySha256 || []).includes(artifactSha256)) return true;
  const binding = (task.parameters?.generatedResults || []).find((item) => item.file?.sha256 === artifactSha256);
  if (!binding || binding.file?.referenceOnly !== false || typeof binding.receiptPath !== 'string'
    || !/^[a-f0-9]{64}$/u.test(binding.receiptSha256 || '')) return false;
  const receiptFile = resolveTaskFile(binding.receiptPath, 'hupo-generated-result-receipt-outside-task');
  const receiptBytes = fs.readFileSync(receiptFile);
  if (sha256(receiptBytes) !== binding.receiptSha256) throw new Error(`hupo-generated-result-receipt-sha-mismatch:${task.module}`);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  return receipt.generationMethod === 'BUILT_IN_IMAGEGEN' && receipt.sourceFilmPixelsUsed === false
    && receipt.productionAdmission === false && receipt.asset?.sha256 === artifactSha256;
}

export async function runHupoResearchPhaseAction({action = 'status', nodeId, workerId, requestPath, outputPath} = {}) {
  const {phase, plan} = assertCurrentResearchPhase();
  const options = {repoRoot, taskId: HUPO_RESEARCH_TASK_ID};
  const inputPlanSha256 = nodeInputHash(plan);
  let runtime;
  let proofArtifacts = null;

  if (action === 'status' || action === 'report') runtime = readShotTaskRuntimeV1(options);
  else if (action === 'sync-plan') runtime = syncShotTaskRuntimeV1({...options, expectedPlanSha256: inputPlanSha256});
  else if (['tick', 'retry', 'resume', 'verify'].includes(action)) {
    runtime = await runShotTaskActionV1({
      ...options,
      action,
      nodeId,
      expectedPlanSha256: inputPlanSha256,
      workerId: workerId || `hupo-phase-${process.pid}`,
      reviewerId: action === 'verify' ? 'technical-file-verifier' : undefined,
    });
  } else if (action === 'imagegen-claim') {
    runtime = claimShotImagegenToolV1({...options, nodeId, workerId: workerId || `hupo-phase-${process.pid}`});
  } else if (action === 'imagegen-complete') {
    const requestFile = resolveTaskFile(requestPath, 'hupo-research-request-outside-task');
    const outputFile = resolveTaskFile(outputPath, 'hupo-research-output-outside-task');
    const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    runtime = await completeShotImagegenToolV1({
      ...options, nodeId, workerId, inputSha256: request.inputSha256,
      requestSha256: request.requestSha256, outputPath: outputFile,
    });
  } else throw new Error('hupo-research-action-invalid');

  if (action === 'report') proofArtifacts = await createIncompleteResearchProof({phase, plan, runtime, planSha256:inputPlanSha256});

  const counts = runtime?.summary?.counts || null;
  const registry = createNodeAdapterRegistry().registry;
  const registeredModuleIds = Object.keys(registry).sort();
  const executableAdapterIds = registeredModuleIds.filter((id) => registry[id]?.available === true && typeof registry[id]?.execute === 'function');
  const registeredWithoutExecutor = registeredModuleIds.filter((id) => !executableAdapterIds.includes(id));
  const coverageModuleIds = (runtime?.coverage?.modules || []).map((module) => module.id).sort();
  const registeredModuleSet = new Set(registeredModuleIds);
  const coverageIntegrity = {
    registryEntryCount: registeredModuleIds.length,
    executableAdapterCount: executableAdapterIds.length,
    registeredWithoutExecutor,
    coverageModuleCount: coverageModuleIds.length,
    missingRegisteredModules: registeredModuleIds.filter((id) => !coverageModuleIds.includes(id)),
    coverageOnlyStages: (runtime?.coverage?.modules || [])
      .filter((module) => !registeredModuleSet.has(module.id))
      .map(({id, status, decision, reason}) => ({id, status, decision, reason})),
    routeGaps: runtime?.coverage?.routeGaps || [],
    unreviewedModules: runtime?.coverage?.unreviewedModules || [],
  };
  const decisionStates = {};
  for (const {decision} of runtime?.decisions || []) {
    const state = decision?.status || 'UNSPECIFIED';
    decisionStates[state] = (decisionStates[state] || 0) + 1;
  }
  const discoveryOutcomes = (runtime?.workflow?.nodes || [])
    .filter((node) => node.module === 'external-media-discovery')
    .map((node) => ({
      nodeId: node.id,
      executionState: node.state,
      discoveryStatus: node.result?.discoveryStatus || 'NOT_REPORTED',
      candidateCount: Number.isInteger(node.result?.candidateCount) ? node.result.candidateCount : null,
      downloadedMedia: node.result?.downloadedMedia === true,
      productionAdmission: node.result?.productionAdmission === true,
    }));
  const articleSourceOutcomes = articleSourceDiscoveryOutcomes(runtime);
  return {
    contract: 'A1HuBoResearchPhaseRunnerResult/v1',
    phaseId: phase.phaseId,
    taskId: HUPO_RESEARCH_TASK_ID,
    action,
    scope: 'RESEARCH_ONLY',
    productionAdmission: false,
    planSha256: inputPlanSha256,
    ...(runtime?.workflow ? {
      revision: runtime.workflow.revision,
      shotCount: plan.shots.length,
      packagingDecisionCount: runtime.decisions.length,
      decisionStates,
      counts,
      pending: runtime.pending,
      coverageIntegrity,
      modules: runtime.coverage.modules.map(({id, decision: routeDecision, status, selectedShots, runtimeStates}) => ({
        id, decision: routeDecision, status, selectedShots, runtimeStates,
      })),
      discoveryOutcomes,
      articleSourceDiscoveryOutcomes: articleSourceOutcomes,
      routeGaps: runtime.coverage.routeGaps,
      unreviewedModules: runtime.coverage.unreviewedModules,
      ...(proofArtifacts ? {proofArtifacts} : {}),
    } : {result: runtime}),
  };
}

function usage() {
  console.log('Usage: node scripts/run-hupo-69-shot-research-reconstruction-v1.mjs <status|report|sync-plan|tick|retry NODE_ID|resume NODE_ID|verify NODE_ID|imagegen-claim NODE_ID|imagegen-complete NODE_ID WORKER REQUEST.json OUTPUT.png>');
  console.log('report writes an explicitly INCOMPLETE current-output inventory and contact sheet; it grants no visual approval or production admission.');
  console.log('This phase-ID adapter uses the existing RESEARCH_ONLY shot-task scheduler and registered optional render adapters; it does not add a second scheduler or production admission.');
}

async function main(argv) {
  const parsed = parseHupoResearchRunnerArgs(argv);
  if (parsed.action === 'help' || parsed.action === '--help') return usage();
  const result = await runHupoResearchPhaseAction(parsed);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
