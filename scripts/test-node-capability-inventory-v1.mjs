import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {auditNodeCapabilityInventoryV1} from './audit-node-capability-inventory-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
const library=path.resolve(import.meta.dirname,'../apps/studio-next/src/lib');
const {registry,definitions}=createNodeAdapterRegistry();
const args={files:fs.readdirSync(library).filter(name=>/^a1-node-.*-adapter-v1\.mjs$/u.test(name)),registry,definitions,
  registrySource:fs.readFileSync(path.join(library,'a1-node-module-execution-v1.mjs'),'utf8'),
  installedRecordingSource:fs.readFileSync(path.join(library,'a1-node-screen-recording-installed-context-v1.mjs'),'utf8')};
assert.equal(auditNodeCapabilityInventoryV1(args).status,'PASS');
assert.equal(auditNodeCapabilityInventoryV1({...args,files:[...args.files,'a1-node-unknown-adapter-v1.mjs']}).status,'FAIL','new adapters still require classification');
assert.equal(auditNodeCapabilityInventoryV1({...args,installedRecordingSource:''}).status,'FAIL','installed wrapper must actually import the recording producer');
const disabled={...registry,'image-generation':{...registry['image-generation'],enabled:false,available:false}};
const disabledDefinitions={...definitions,'image-generation':{...definitions['image-generation'],available:false}};
assert.equal(auditNodeCapabilityInventoryV1({...args,registry:disabled,definitions:disabledDefinitions}).status,'PASS','honest unavailability is not a missing-registration error');
const drift=auditNodeCapabilityInventoryV1({...args,registry:disabled});
assert.ok(drift.failures.includes('REGISTRY_AVAILABILITY_DRIFT:image-generation'));
assert.ok(auditNodeCapabilityInventoryV1({...args,definitions:{...definitions,'invented-module':{available:true}}}).failures.includes('UNCLASSIFIED_REGISTRY_MODULE:invented-module'));
console.log('PASS current and indirect registrations, conditional availability, unknown adapters/modules and registry-definition drift. No module execution.');
