import assert from "node:assert/strict";
import {createMiniMaxServerCredentialAccessV1} from "../apps/studio-next/src/lib/a1-minimax-server-credential-v1.mjs";

let reads = 0;
let dummy;
const access = createMiniMaxServerCredentialAccessV1({readCredential: () => {reads += 1; return dummy;}});
assert.equal(reads, 0);
assert.deepEqual(access.status(), {present: false, nonempty: false, validation: "NOT_VALIDATED"});
await assert.rejects(access.getExistingCredential(), {message: "MINIMAX_BRIDGE_EXISTING_CREDENTIAL_REQUIRED"});
dummy = "";
assert.deepEqual(access.status(), {present: true, nonempty: false, validation: "NOT_VALIDATED"});
await assert.rejects(access.getExistingCredential(), {message: "MINIMAX_BRIDGE_EXISTING_CREDENTIAL_REQUIRED"});
dummy = "synthetic.FIXTURE_ONLY";
assert.deepEqual(access.status(), {present: true, nonempty: true, validation: "NOT_VALIDATED"});
assert.equal(await access.getExistingCredential(), dummy);
dummy = "synthetic.REPLACED_FIXTURE";
assert.equal(await access.getExistingCredential(), dummy);
globalThis.window = {};
try {
  assert.throws(() => access.status(), {message: "MINIMAX_SERVER_ONLY"});
  await assert.rejects(access.getExistingCredential(), {message: "MINIMAX_SERVER_ONLY"});
  assert.throws(() => createMiniMaxServerCredentialAccessV1(), {message: "MINIMAX_SERVER_ONLY"});
} finally { delete globalThis.window; }
assert.equal(reads, 7);
console.log(JSON.stringify({status: "PASS", lazy: true, fixtureOnly: true, realEnvReads: 0, networkCalls: 0,
  statusFields: ["present", "nonempty", "validation"], validation: "NOT_VALIDATED"}));
