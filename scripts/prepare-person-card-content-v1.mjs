#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePersonCardContentLayoutV1, createPersonCardSceneFromContentLayoutV1} from '../apps/studio-next/src/lib/a1-person-card-content-preparation-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {createHash} from 'node:crypto';
import {compilePersonCardContentShotV1} from '../apps/studio-next/src/lib/a1-person-card-content-preparation-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!['--input', '--output', '--preparation', '--accepted', '--motion'].includes(args[i]) || !args[i + 1]
    || flags.has(args[i])) throw new Error('Usage: --input input.json --output NEW_DIR; or --preparation prepared.json --accepted accepted.json --motion motion.json --output NEW_DIR');
  flags.set(args[i], args[i + 1]);
}
function within(filename) {
  const relative = path.relative(root, filename);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function read(filename) {
  const absolute = path.resolve(filename ?? '');
  if (!within(absolute) || path.extname(absolute) !== '.json' || !within(fs.realpathSync(absolute))) throw new Error('INPUT_JSON_MUST_BE_IN_CHECKOUT');
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error('INPUT_JSON_BYTE_LIMIT');
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
const output = path.resolve(flags.get('--output') ?? '');
const allowedRoot = path.join(root, 'work/module-development-launch-v1/person-card-content-layout-v1');
if (!output.startsWith(allowedRoot + path.sep) || fs.existsSync(output)
  || !within(fs.realpathSync(path.dirname(output)))) throw new Error('OUTPUT_MUST_BE_NEW_PREPARATION_DIRECTORY');
let result, plan;
if (flags.has('--input') && flags.size === 2) {
  const input = read(flags.get('--input'));
  result = await preparePersonCardContentLayoutV1(input);
  if (result.status === 'READY') {
    const bytes = JSON.stringify(result, null, 2) + '\n', receiptSHA = createHash('sha256').update(bytes).digest('hex');
    plan = {contract: 'A1ShotTaskPlan/v1', scope: 'RESEARCH_ONLY', productionAdmission: false,
      projectId: input.id.toLowerCase().replaceAll('_', '-'),
      researchCopyAuthorityReceipts: [{path: 'preparation.json', sha256: receiptSHA}],
      shots: [compilePersonCardContentShotV1(result, receiptSHA)]};
  }
} else if (!flags.has('--input') && flags.size === 4 && ['--preparation', '--accepted', '--motion'].every(k => flags.has(k))) {
  result = await createPersonCardSceneFromContentLayoutV1(read(flags.get('--preparation')), read(flags.get('--accepted')), read(flags.get('--motion')));
} else throw new Error('PREPARATION_ARGUMENT_COMBINATION_INVALID');
fs.mkdirSync(output, {recursive: false});
fs.writeFileSync(path.join(output, 'preparation.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
if (plan) fs.writeFileSync(path.join(output, 'shot-task-plan.json'), JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({status: result.status ?? 'NATIVE_SCENE_PREPARED', reason: result.reason ?? null,
  output, resultSha256: nodeInputHash(result), executesRuntime: false, actualPixelReview: false}));
if (result.status === 'BLOCKED') process.exitCode = 2;
