#!/usr/bin/env node
// Run the current checked chapter in an isolated test-only project, without changing its answers or gates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { boardConfig, loadProject, projectPaths } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { chapterGroups, runtimeCheck } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { loadChapterMotionContract } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';

const args = process.argv.slice(2), opt = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const source = opt('--project'), chapter = opt('--chapter'), target = opt('--test-project'), codeFile = opt('--code-file'), contractFile = opt('--contract-file');
if (!source || !chapter || !target || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(target) || !/^[A-Za-z0-9_-]{1,32}$/.test(chapter)) throw new Error('usage: probe-chapter-motion.mjs --project ID --chapter ID --test-project NEW_ID');
const cfg = boardConfig(), src = projectPaths(cfg, source), dest = path.join(cfg.dataDir, 'projects', target);
if (fs.existsSync(dest)) throw new Error(`test project already exists: ${dest}`);
const group = chapterGroups(cfg, source).find((x) => x.id === chapter);
const contract = contractFile ? JSON.parse(fs.readFileSync(path.resolve(contractFile), 'utf8')) : loadChapterMotionContract(cfg, source, chapter);
const checked = codeFile ? { code: fs.readFileSync(path.resolve(codeFile), 'utf8') } : JSON.parse(fs.readFileSync(path.join(src.root, 'tasks', `morph-${chapter}.checked.json`), 'utf8'));
if (!group || !contract?.shots?.length || !checked?.code) throw new Error('source chapter, checked code, or motion contract is missing');
const codeHash = crypto.createHash('sha256').update(checked.code).digest('hex');
const project = { ...loadProject(cfg, source), id: target, title: `Motion evidence canary: ${source} ${chapter}`, testOnly: true };
delete project.nasOutput; delete project.design; delete project.final; delete project.look; delete project.rough; delete project.direction; delete project.waits;
fs.mkdirSync(dest, { recursive: false });
fs.writeFileSync(path.join(dest, 'project.json'), JSON.stringify(project, null, 2) + '\n');
fs.writeFileSync(path.join(dest, 'source-code.mjs'), checked.code);
fs.writeFileSync(path.join(dest, 'source-motion-contract.json'), JSON.stringify(contract, null, 2) + '\n');
for (const file of ['plan.json', 'storyboard.json', 'brief.json', 'style.json']) if (fs.existsSync(path.join(src.root, file))) fs.copyFileSync(path.join(src.root, file), path.join(dest, file));
fs.cpSync(path.join(src.root, 'shots'), path.join(dest, 'shots'), { recursive: true, errorOnExist: true });
const started = Date.now();
const result = await runtimeCheck(cfg, target, group, checked.code, {}, { motionContract: contract, greyboxDiffer: {} });
const report = { contract: 'A1MotionEvidenceCanary/v1', source, chapter, testProject: target, codeHash, sourceContract: 'source-motion-contract.json', sourceCode: 'source-code.mjs', seconds: +((Date.now() - started) / 1000).toFixed(1), note: 'Diagnostic only: no user gate or chapter accepted; declared deviations are not applied in this probe.', errors: result.errors, warnings: result.warnings, motionEvidence: result.motionEvidence, keyframes: result.keyframes, strips: result.strips };
fs.writeFileSync(path.join(dest, 'motion-evidence-canary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: path.join(dest, 'motion-evidence-canary.json'), seconds: report.seconds, errors: report.errors.length, evidence: report.motionEvidence }, null, 2));
