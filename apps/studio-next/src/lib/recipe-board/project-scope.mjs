// Project execution policy: only operations explicitly listed here are restricted.
// Missing and other scope values retain historical behaviour.
const RESTRICTIONS = { STILLS_ONLY: new Set(['voice', 'greybox', 'motion', 'chapter', 'animatic', 'final', 'reel', 'sequence', 'segment', 'medium', 'module', 'passage']) };

export function scopeRestriction(project, operation) {
  const scope = project?.scope;
  return RESTRICTIONS[scope]?.has(operation)
    ? { state: 'scope-restricted', scope, operation, reason: `project scope ${scope} restricts ${operation}` }
    : null;
}

export function assertScopeAllows(project, operation) {
  const restriction = scopeRestriction(project, operation);
  if (restriction) throw new Error(`SCOPE_RESTRICTED: ${restriction.reason}`);
}
