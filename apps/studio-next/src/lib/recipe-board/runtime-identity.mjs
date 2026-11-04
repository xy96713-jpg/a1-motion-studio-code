// Operational provenance, not authentication against local environment/DB tampering.
// No caller-supplied actor ID: consume only runtime attribution and this profile's DB.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);

export function resolveRuntimeIdentity(env = process.env) {
  const hermes = env.HERMES_SESSION_ID, codex = env.CODEX_THREAD_ID;
  const hermesRuntime = hermes !== undefined || env.HERMES_AGENT === 'true' || env.AI_AGENT === 'hermes-agent';
  const valid = (id) => typeof id === 'string' && !!id.trim() && id.trim() === id;
  if (hermesRuntime && codex !== undefined) return null; // Never silently pick a runtime.
  if (!hermesRuntime) return valid(codex) ? { runtime: 'codex', actorThread: hash(`codex-thread:${codex}`) } : null;
  if (!valid(hermes)) return null;
  let db;
  try {
    if (!env.HERMES_HOME || !path.isAbsolute(env.HERMES_HOME)) return null;
    const home = fs.realpathSync(env.HERMES_HOME);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(path.join(home, 'state.db'), { readOnly: true });
    db.exec('BEGIN');
    // Select provenance fields only: never load messages, prompts or credential-bearing config.
    const get = db.prepare(`SELECT id, source, parent_session_id, ended_at, end_reason,
      json_extract(model_config, '$._delegate_from') AS delegateFrom,
      json_extract(model_config, '$._branched_from') AS branchedFrom,
      json_extract(model_config, '$._reset_from') AS resetFrom
      FROM sessions WHERE id = ?`);
    let row = get.get(hermes);
    if (!row || row.ended_at !== null || row.end_reason !== null) return null;
    const seen = new Set();
    for (;;) {
      if (seen.has(row.id) || seen.size >= 1000 || !row.source || row.source === 'tool' || row.branchedFrom || row.resetFrom) return null;
      seen.add(row.id);
      if (!row.parent_session_id) {
        if (row.source === 'subagent' || row.delegateFrom) return null;
        break;
      }
      const parent = get.get(row.parent_session_id);
      if (!parent || seen.has(parent.id)) return null;
      // A real delegate is a fresh actor even when its parent later compresses.
      if (row.delegateFrom === parent.id) {
        if (row.source !== 'subagent') return null;
        break;
      }
      // parent_session_id alone is NOT independence. Only proven compression
      // continuations collapse; inherited _delegate_from belongs to the original child.
      if (parent.end_reason !== 'compression' || parent.ended_at === null || row.source !== parent.source
        || (row.delegateFrom && row.delegateFrom !== parent.delegateFrom)) return null;
      row = parent;
    }
    return { runtime: 'hermes', actorThread: hash(`hermes-session:${JSON.stringify([home, row.id])}`), source: row.source };
  } catch { return null; } finally { if (db) db.close(); }
}
