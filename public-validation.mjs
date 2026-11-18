const byteLength = value => new TextEncoder().encode(value).byteLength;

export class MozCorpWorldError extends Error {
  constructor(status, code, message) { super(message); this.name = 'MozCorpWorldError'; this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new MozCorpWorldError(status, code, message); };
export const CONSENT_VERSION = 'BTW-AI-UPGRADE-CONSENT-1';
export const MODULES = Object.freeze([
  { id: 'world_shell', label: 'World shell and navigation', boundary: 'Visible navigation, layout and explanatory text only.' },
  { id: 'fiction_surface', label: 'Fictional creative surfaces', boundary: 'Opt-in fictional experiences without personal accounts, uploaded files or identity claims.' },
  { id: 'upgrade_studio', label: 'Upgrade proposal desk', boundary: 'Proposal, review and release-reference records; no execution or deployment access.' },
  { id: 'local_first_boundary', label: 'Local storage and privacy boundaries', boundary: 'Architecture only. No vaults, private desks, profiles, receipts, imported files, keys or source code.' }
]);
export function object(value, label = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(400, 'INVALID_REQUEST', 'Invalid ' + label + '.');
  return value;
}
export function keys(value, allowed, label = 'request') { object(value, label); if (Object.keys(value).some(k => !allowed.includes(k))) fail(400, 'INVALID_REQUEST', 'Unsupported ' + label + ' field.'); }
export function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'INVALID_REQUEST', 'Invalid ' + label + '.'); return value; }
export function text(value, min, max, label, collapse = false) {
  if (typeof value !== 'string') fail(400, 'INVALID_REQUEST', label + ' must be text.');
  const cleaned = (collapse ? value.replace(/\s+/g, ' ') : value).trim();
  if (cleaned.length < min || cleaned.length > max) fail(400, 'INVALID_REQUEST', label + ' must contain ' + min + '–' + max + ' characters.');
  return cleaned;
}
export const identifier = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) fail(400, 'INVALID_REQUEST', 'Invalid record identifier.'); return value; };
export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function noSecrets(value) {
  if (/(?:sk|rk|sess)-[A-Za-z0-9_-]{16,}|-----BEGIN[\s\S]{0,32}PRIVATE KEY-----|authorization\s*:/i.test(value)) fail(400, 'SENSITIVE_INPUT_REJECTED', 'Keep credentials and private keys out of proposal text.');
}
export function json(value, maxBytes, label = 'request') {
  const seen = new Set(); let nodes = 0;
  function walk(v, depth) {
    if (++nodes > 150000 || depth > 24) fail(413, 'REQUEST_TOO_LARGE', label + ' is too complex.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail(400, 'INVALID_REQUEST', 'Invalid number in ' + label + '.'); return; }
    if (!v || typeof v !== 'object' || seen.has(v)) fail(400, 'INVALID_REQUEST', 'Invalid JSON in ' + label + '.');
    seen.add(v);
    if (Array.isArray(v)) { if (v.length > 10000) fail(413, 'REQUEST_TOO_LARGE', label + ' has too many entries.'); for (const item of v) walk(item, depth + 1); }
    else { object(v, label); for (const [key, item] of Object.entries(v)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(400, 'INVALID_REQUEST', 'Unsafe JSON property.'); walk(item, depth + 1); } }
    seen.delete(v);
  }
  walk(value, 0); const encoded = JSON.stringify(value);
  if (byteLength(encoded) > maxBytes) fail(413, 'REQUEST_TOO_LARGE', label + ' is too large.');
  return JSON.parse(encoded);
}
export function slotInput(value) {
  object(value, 'cloud slot');
  const kind = value.kind ?? 'machine'; if (typeof kind !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(kind)) fail(400, 'INVALID_REQUEST', 'Invalid cloud slot kind.');
  const slotName = value.slotName === undefined ? 'SAVEPOINT::' : text(value.slotName, 1, 48, 'Savepoint name', true);
  const payload = typeof value.payload === 'string' ? value.payload : JSON.stringify(json(value.payload ?? {}, 120000, 'Cloud payload'));
  if (byteLength(payload) > 120000) fail(413, 'REQUEST_TOO_LARGE', 'Keep a cloud savepoint below 120 KB.');
  return { slotName, kind, payload };
}
export function normalizeProposal(value) {
  keys(value, ['title', 'summary', 'proposedChanges', 'privacyImpact', 'reviewChecklist', 'rollbackPlan', 'riskLevel'], 'proposal');
  if (!Array.isArray(value.proposedChanges) || value.proposedChanges.length < 1 || value.proposedChanges.length > 12) fail(400, 'INVALID_PROPOSAL', 'Use one to twelve proposed changes.');
  if (!Array.isArray(value.reviewChecklist) || value.reviewChecklist.length < 1 || value.reviewChecklist.length > 16) fail(400, 'INVALID_PROPOSAL', 'Use one to sixteen review checks.');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(value.riskLevel)) fail(400, 'INVALID_PROPOSAL', 'Choose LOW, MEDIUM or HIGH risk.');
  const result = {
    title: text(value.title, 3, 180, 'Proposal title'), summary: text(value.summary, 16, 6000, 'Proposal summary'),
    proposedChanges: value.proposedChanges.map(change => { keys(change, ['area', 'change', 'rationale'], 'proposed change'); return { area: text(change.area, 1, 160, 'Change area'), change: text(change.change, 1, 2000, 'Proposed change'), rationale: text(change.rationale, 1, 2000, 'Change rationale') }; }),
    privacyImpact: text(value.privacyImpact, 1, 4000, 'Privacy impact'), reviewChecklist: value.reviewChecklist.map(x => text(x, 1, 500, 'Review check')),
    rollbackPlan: text(value.rollbackPlan, 1, 4000, 'Rollback plan'), riskLevel: value.riskLevel
  };
  noSecrets(JSON.stringify(result)); return result;
}
export function fictionSeed(body, getCaseRules) {
  keys(body.profile, ['name', 'pronouns', 'role', 'place', 'bio', 'theme'], 'fictional profile');
  const clean = (v, max) => typeof v === 'string' ? v.normalize('NFC').trim().slice(0, max) : '';
  const p = body.profile, name = clean(p.name, 60); if (!name) fail(400, 'INVALID_SEED', 'A fictional profile needs a name.');
  const pronouns = clean(p.pronouns, 20), theme = clean(p.theme, 20);
  const profile = { name, pronouns: ['they/them', 'she/her', 'he/him', ''].includes(pronouns) ? pronouns : '', role: clean(p.role, 100), place: clean(p.place, 100), bio: clean(p.bio, 350), theme: ['deep', 'rainbow', 'fire'].includes(theme) ? theme : 'deep' };
  if (body.kind === 'persona') { if (body.game !== undefined) fail(400, 'INVALID_SEED', 'A persona cannot include a private game or notebook.'); return { version: 1, scope: 'FICTIONAL', kind: 'persona', profile }; }
  if (body.kind !== 'case') fail(400, 'INVALID_SEED', 'Only fictional personas and solved fictional cases enter this feed.');
  keys(body.game, ['caseId', 'revealed', 'pinned', 'choice', 'evaluated'], 'fictional case');
  const game = body.game, caseId = clean(game.caseId, 60); let rules;
  try { rules = getCaseRules(); object(rules, 'private case configuration'); } catch { fail(503, 'CASE_CONFIGURATION_UNAVAILABLE', 'The private fictional case configuration is unavailable.'); }
  const rule = Object.hasOwn(rules, caseId) ? rules[caseId] : null;
  const pins = game.pinned;
  if (!rule || typeof rule.answer !== 'string' || !Array.isArray(rule.essential) || !rule.essential.length || rule.essential.length > 6 || !rule.essential.every(x => typeof x === 'string') || game.evaluated !== true || game.revealed !== 6 || game.choice !== rule.answer || !Array.isArray(pins) || pins.length > 6 || new Set(pins).size !== pins.length || !pins.every(x => typeof x === 'string' && x.length <= 80) || !rule.essential.every(x => pins.includes(x))) fail(400, 'INVALID_SEED', 'This seed needs a solved, configured fictional case and its supporting clues.');
  return { version: 1, scope: 'FICTIONAL', kind: 'case', profile, caseId };
}
