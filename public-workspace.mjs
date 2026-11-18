import { CONSENT_VERSION, MODULES, MozCorpWorldError, fail, object, keys, text, integer, identifier, hash, noSecrets, json, slotInput, normalizeProposal, fictionSeed } from './public-validation.mjs';

const randomUUID = () => crypto.randomUUID();

const MAX_STATE = 8000000;
const iso = () => new Date().toISOString(), clone = value => JSON.parse(JSON.stringify(value));
const fresh = () => ({ format: 'keeper-mozcorp-world', version: 1, scope: randomUUID(), revision: 0,
  cloud: { revision: 0, slots: [] }, hope: { generation: 0, enabled: false, seeds: [] },
  upgrades: { revision: 0, generation: 0, settings: { enabled: false, consentAt: null, updatedAt: null }, proposals: [], audit: [], requests: [] } });

function validateState(input) {
  const s = json(input, MAX_STATE, 'Shared world storage');
  keys(s, ['format', 'version', 'scope', 'revision', 'cloud', 'hope', 'upgrades'], 'storage');
  if (s.format !== 'keeper-mozcorp-world' || s.version !== 1) throw Error('Invalid storage format');
  identifier(s.scope); integer(s.revision, 0, Number.MAX_SAFE_INTEGER, 'storage revision');
  keys(s.cloud, ['revision', 'slots'], 'cloud storage'); integer(s.cloud.revision, 0, Number.MAX_SAFE_INTEGER, 'cloud revision');
  if (!Array.isArray(s.cloud.slots) || s.cloud.slots.length > 24) throw Error('Cloud capacity');
  const slotIds = new Set();
  for (const slot of s.cloud.slots) { keys(slot, ['id', 'slotName', 'kind', 'payload', 'createdAt'], 'stored slot'); identifier(slot.id); if (slotIds.has(slot.id)) throw Error('Duplicate slot'); slotIds.add(slot.id); slotInput(slot); if (!Number.isFinite(Date.parse(slot.createdAt))) throw Error('Slot date'); }
  keys(s.hope, ['generation', 'enabled', 'seeds'], 'feed storage'); integer(s.hope.generation, 0, Number.MAX_SAFE_INTEGER, 'feed generation');
  if (typeof s.hope.enabled !== 'boolean' || !Array.isArray(s.hope.seeds) || s.hope.seeds.length > 50) throw Error('Feed storage');
  const seedKeys = new Set();
  for (const row of s.hope.seeds) {
    keys(row, ['seedKey', 'sourceAt', 'updatedAt', 'seed'], 'stored seed'); text(row.seedKey, 1, 80, 'seed key'); if (seedKeys.has(row.seedKey)) throw Error('Duplicate seed'); seedKeys.add(row.seedKey); integer(row.sourceAt, 0, Number.MAX_SAFE_INTEGER, 'seed time');
    if (!Number.isFinite(Date.parse(row.updatedAt))) throw Error('Seed date');
    keys(row.seed, ['version', 'scope', 'kind', 'profile', 'caseId'], 'stored fictional seed');
    if (row.seed.version !== 1 || row.seed.scope !== 'FICTIONAL' || !['persona', 'case'].includes(row.seed.kind)) throw Error('Invalid fictional scope');
    keys(row.seed.profile, ['name', 'pronouns', 'role', 'place', 'bio', 'theme'], 'stored fictional profile');
    for (const [name, limit] of [['name', 60], ['pronouns', 20], ['role', 100], ['place', 100], ['bio', 350], ['theme', 20]]) text(row.seed.profile[name], name === 'name' ? 1 : 0, limit, 'stored profile');
    if (row.seed.kind === 'case') text(row.seed.caseId, 1, 60, 'stored case identifier');
    if (row.seed.kind === 'persona' ? row.seedKey !== 'persona' : !/^case:[a-f0-9]{64}$/.test(row.seedKey)) throw Error('Seed key mismatch');
  }
  const u = s.upgrades; keys(u, ['revision', 'generation', 'settings', 'proposals', 'audit', 'requests'], 'upgrade storage');
  integer(u.revision, 0, Number.MAX_SAFE_INTEGER, 'upgrade revision'); integer(u.generation, 0, Number.MAX_SAFE_INTEGER, 'upgrade generation');
  keys(u.settings, ['enabled', 'consentAt', 'updatedAt'], 'upgrade settings'); if (typeof u.settings.enabled !== 'boolean') throw Error('Invalid upgrade setting');
  for (const key of ['consentAt', 'updatedAt']) if (u.settings[key] !== null && (typeof u.settings[key] !== 'string' || !Number.isFinite(Date.parse(u.settings[key])))) throw Error('Invalid settings date');
  if (!Array.isArray(u.proposals) || u.proposals.length > 32 || !Array.isArray(u.audit) || u.audit.length > 256 || !Array.isArray(u.requests) || u.requests.length > 8) throw Error('Upgrade capacity');
  const proposals = new Set();
  for (const p of u.proposals) {
    keys(p, ['id', 'moduleId', 'baseRelease', 'status', 'currentVersion', 'approvedVersion', 'deploymentReference', 'rollbackReference', 'createdAt', 'updatedAt', 'approvedAt', 'deployedAt', 'rolledBackAt', 'versions'], 'stored proposal');
    identifier(p.id); if (proposals.has(p.id)) throw Error('Duplicate proposal'); proposals.add(p.id);
    if (!MODULES.some(m => m.id === p.moduleId) || !['PENDING_REVIEW', 'APPROVED', 'DECLINED', 'DEPLOYED', 'ROLLED_BACK'].includes(p.status)) throw Error('Proposal metadata');
    text(p.baseRelease, 3, 120, 'stored release'); integer(p.currentVersion, 1, 8, 'proposal version'); if (!Array.isArray(p.versions) || p.versions.length !== p.currentVersion) throw Error('Proposal history');
    for (const [index, v] of p.versions.entries()) { keys(v, ['id', 'proposalId', 'version', 'requestText', 'requestHash', 'baseRelease', 'proposal', 'model', 'providerRequestId', 'createdAt'], 'proposal version'); identifier(v.id); if (v.proposalId !== p.id || v.version !== index + 1) throw Error('Version sequence'); text(v.requestText, 16, 4000, 'stored instruction'); if (!/^[a-f0-9]{64}$/.test(v.requestHash)) throw Error('Instruction hash'); text(v.baseRelease, 3, 120, 'stored release'); normalizeProposal(v.proposal); text(v.model, 1, 100, 'stored model'); if (!Number.isFinite(Date.parse(v.createdAt))) throw Error('Version date'); }
    if (p.approvedVersion !== null && p.approvedVersion !== p.currentVersion) throw Error('Approval version');
    if (['APPROVED', 'DEPLOYED', 'ROLLED_BACK'].includes(p.status) && p.approvedVersion !== p.currentVersion) throw Error('Missing approval');
    if (['DEPLOYED', 'ROLLED_BACK'].includes(p.status)) text(p.deploymentReference, 3, 160, 'deployment reference');
    if (p.status === 'ROLLED_BACK') text(p.rollbackReference, 3, 160, 'rollback reference');
    for (const key of ['createdAt', 'updatedAt']) if (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key]))) throw Error('Proposal date');
    for (const key of ['approvedAt', 'deployedAt', 'rolledBackAt']) if (p[key] !== null && (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key])))) throw Error('Proposal date');
  }
  for (const event of u.audit) { keys(event, ['id', 'proposalId', 'versionId', 'eventType', 'metadata', 'createdAt'], 'audit'); identifier(event.id); text(event.eventType, 1, 80, 'audit type'); object(event.metadata, 'audit metadata'); if (!Number.isFinite(Date.parse(event.createdAt))) throw Error('Audit date'); }
  for (const request of u.requests) { keys(request, ['id', 'at'], 'provider reservation'); identifier(request.id); integer(request.at, 0, Number.MAX_SAFE_INTEGER, 'provider reservation time'); }
  return s;
}

export function createBrowserWorkspace({ transaction, getCaseRules }) {
  const read = fn => transaction('readonly', value => clone(fn(validateState(value ?? fresh()))));
  const mutate = fn => transaction('readwrite', (value, write) => {
    const next = validateState(value ?? fresh());
    const result = fn(next);
    if (result?.unchanged) return clone(result.value);
    next.revision++;
    write(validateState(next));
    return clone(result);
  });
  // Persist the scope once to keep revision checks stable across windows.
  const ready = transaction('readwrite', (value, write) => { if (value === undefined) write(fresh()); });
  const waitForScope = fn => async (...args) => { await ready; return fn(...args); };
  function scope(s, body, required = true) { if ((required || body.scope !== undefined) && body.scope !== s.scope) fail(409, 'WORKSPACE_CHANGED', 'This Keeper workspace changed. Refresh before continuing.'); }
  function revision(body, current, required = true) { if (!required && body.revision === undefined) return; integer(body.revision, 0, Number.MAX_SAFE_INTEGER, 'workspace revision'); if (body.revision !== current) fail(409, 'REVISION_STALE', 'The shared workspace changed. Refresh before continuing.'); }
  const cloudView = s => ({ scope: s.scope, revision: s.cloud.revision, slots: s.cloud.slots.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)) });
  const hopeView = s => ({ scope: s.scope, generation: s.hope.generation, enabled: s.hope.enabled, total: s.hope.seeds.length, seeds: s.hope.seeds.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.seedKey.localeCompare(b.seedKey)) });
  const upgradeView = s => ({ scope: s.scope, revision: s.upgrades.revision, generation: s.upgrades.generation, settings: s.upgrades.settings, configured: false, model: 'manual', dailyLimit: 8, consentVersion: CONSENT_VERSION, modules: MODULES, proposals: s.upgrades.proposals.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), audit: s.upgrades.audit.slice().reverse() });
  function audit(s, eventType, metadata = {}, proposalId = null, versionId = null) { s.upgrades.audit.push({ id: randomUUID(), proposalId, versionId, eventType, metadata, createdAt: iso() }); s.upgrades.audit = s.upgrades.audit.slice(-256); }
  function proposal(s, id) { identifier(id); const found = s.upgrades.proposals.find(p => p.id === id); if (!found) fail(404, 'PROPOSAL_NOT_FOUND', 'This proposal is not in this Keeper workspace.'); return found; }
  const cloudRead = () => read(cloudView), hopeRead = () => read(hopeView), upgradeRead = () => read(upgradeView);

  async function cloudWrite(input) {
    const body = json(input, 6200000), action = body.action ?? 'save'; keys(body, ['action', 'scope', 'revision', 'id', 'slotName', 'kind', 'payload', 'slots'], 'cloud request');
    let slots;
    if (action === 'save') slots = [slotInput(body)];
    else if (action === 'import') { if (!Array.isArray(body.slots) || !body.slots.length || body.slots.length > 24) fail(400, 'INVALID_REQUEST', 'Import one to twenty-four savepoints.'); slots = body.slots.map(slotInput); }
    else if (action !== 'delete') fail(400, 'INVALID_REQUEST', 'Unknown cloud savepoint action.');
    return mutate(s => {
      scope(s, body, action !== 'save'); revision(body, s.cloud.revision, action !== 'save');
      if (action === 'delete') { identifier(body.id); const index = s.cloud.slots.findIndex(slot => slot.id === body.id); if (index < 0) fail(404, 'SLOT_NOT_FOUND', 'That savepoint is not in this Keeper workspace.'); s.cloud.slots.splice(index, 1); }
      else { if (s.cloud.slots.length + slots.length > 24) fail(429, 'CLOUD_QUOTA', 'This Keeper holds twenty-four savepoints. Export or delete one before adding another.'); for (const slot of slots) s.cloud.slots.push({ id: randomUUID(), ...slot, createdAt: iso() }); }
      s.cloud.revision++; const result = cloudView(s); if (action === 'save') Object.assign(result, s.cloud.slots.at(-1)); return result;
    });
  }

  async function hopeWrite(input) {
    const body = json(input, 20000); keys(body, ['action', 'scope', 'generation', 'enabled', 'kind', 'profile', 'game', 'sourceAt'], 'fiction feed request');
    if (!['settings', 'clear', 'seed'].includes(body.action)) fail(400, 'INVALID_REQUEST', 'Unknown fictional feed action.');
    integer(body.generation, 0, Number.MAX_SAFE_INTEGER, 'feed generation');
    if (body.action === 'settings' && typeof body.enabled !== 'boolean') fail(400, 'INVALID_REQUEST', 'Choose whether the fictional feed is enabled.');
    let seed; if (body.action === 'seed') { integer(body.sourceAt, 0, Date.now() + 300000, 'fiction source time'); seed = fictionSeed(body, getCaseRules); }
    const seedKey = !seed ? '' : seed.kind === 'persona' ? 'persona' : 'case:' + await hash(JSON.stringify(seed));
    return mutate(s => {
      scope(s, body); const h = s.hope;
      if (body.action !== 'seed') {
        if (body.generation !== h.generation) fail(409, 'GENERATION_STALE', 'The fictional feed changed. Refresh before changing its settings.');
        if (body.action === 'clear') { h.seeds = []; h.enabled = false; } else h.enabled = body.enabled;
        h.generation++; return hopeView(s);
      }
      if (!h.enabled || body.generation !== h.generation) return { unchanged: true, value: { ...hopeView(s), added: false, outcome: 'cancelled' } };
      const existing = h.seeds.find(row => row.seedKey === seedKey);
      if (existing && (seed.kind === 'case' || body.sourceAt <= existing.sourceAt)) return { unchanged: true, value: { ...hopeView(s), added: false, outcome: JSON.stringify(existing.seed) === JSON.stringify(seed) ? 'duplicate' : 'superseded' } };
      if (!existing && h.seeds.length >= 50) fail(429, 'HOPE_QUOTA', 'The fictional feed holds fifty seeds. Clear or export the current feed before adding more.');
      const row = { seedKey, sourceAt: body.sourceAt, updatedAt: existing && JSON.stringify(existing.seed) === JSON.stringify(seed) ? existing.updatedAt : iso(), seed };
      if (existing) h.seeds[h.seeds.indexOf(existing)] = row; else h.seeds.push(row);
      return { ...hopeView(s), added: true, outcome: 'saved' };
    });
  }

  function proposalInput(body) {
    if (!MODULES.some(m => m.id === body.moduleId)) fail(400, 'MODULE_INVALID', 'Choose one of the listed upgrade areas.');
    const input = { moduleId: body.moduleId, instruction: text(body.instruction, 16, 4000, 'Upgrade instruction'), baseRelease: text(body.baseRelease, 3, 120, 'Base release', true) }; noSecrets(JSON.stringify(input));
    if (body.proposalId !== undefined) input.proposalId = identifier(body.proposalId); return input;
  }
  function saveProposal(s, input, generated, requestHash) {
    let p = input.proposalId ? proposal(s, input.proposalId) : null;
    if (p && p.currentVersion >= 8) fail(429, 'VERSION_QUOTA', 'This proposal has eight versions. Keep its audit trail and start a new proposal.');
    if (!p && s.upgrades.proposals.length >= 32) fail(429, 'PROPOSAL_QUOTA', 'This workspace holds thirty-two proposals. Export or delete an old proposal first.');
    const now = iso(), revised = Boolean(p);
    if (!p) { p = { id: randomUUID(), moduleId: input.moduleId, baseRelease: input.baseRelease, status: 'PENDING_REVIEW', currentVersion: 0, approvedVersion: null, deploymentReference: null, rollbackReference: null, createdAt: now, updatedAt: now, approvedAt: null, deployedAt: null, rolledBackAt: null, versions: [] }; s.upgrades.proposals.push(p); }
    p.moduleId = input.moduleId; p.baseRelease = input.baseRelease; p.status = 'PENDING_REVIEW'; p.currentVersion++; p.updatedAt = now;
    for (const key of ['approvedVersion', 'deploymentReference', 'rollbackReference', 'approvedAt', 'deployedAt', 'rolledBackAt']) p[key] = null;
    const version = { id: randomUUID(), proposalId: p.id, version: p.currentVersion, requestText: input.instruction, requestHash, baseRelease: input.baseRelease, proposal: generated.proposal, model: generated.model, providerRequestId: generated.providerRequestId, createdAt: now }; p.versions.push(version);
    audit(s, revised ? 'proposal.revised' : 'proposal.created', { version: version.version, model: version.model, requestHash: version.requestHash }, p.id, version.id); s.upgrades.revision++; return upgradeView(s);
  }

  async function upgradeWrite(input) {
    const body = json(input, 128000); keys(body, ['action', 'scope', 'revision', 'generation', 'enabled', 'moduleId', 'baseRelease', 'instruction', 'proposal', 'proposalId', 'consent', 'version', 'deploymentReference', 'rollbackReference'], 'upgrade request');
    if (body.action === 'propose' || body.action === 'settings') fail(403, 'PUBLIC_MANUAL_ONLY', 'This public edition uses manual proposals.');
    if (body.action === 'propose_manual') {
      const request = proposalInput(body);
      const manual = normalizeProposal(body.proposal);
      const requestHash = await hash(JSON.stringify(request));
      return mutate(s => { scope(s, body); revision(body, s.upgrades.revision); return saveProposal(s, request, { proposal: manual, model: 'manual', providerRequestId: null }, requestHash); });
    }
    const result = await mutate(s => {
      scope(s, body); revision(body, s.upgrades.revision); const u = s.upgrades, now = iso();
        const p = proposal(s, body.proposalId);
        if (['approve', 'decline', 'record_deployment'].includes(body.action)) integer(body.version, 1, 8, 'proposal version');
        if (body.action === 'approve' || body.action === 'decline') { if (p.status !== 'PENDING_REVIEW' || p.currentVersion !== body.version) fail(409, 'REVIEW_STALE', 'Only the current pending proposal version can be reviewed.'); p.status = body.action === 'approve' ? 'APPROVED' : 'DECLINED'; p.approvedVersion = body.action === 'approve' ? body.version : null; p.approvedAt = body.action === 'approve' ? now : null; audit(s, 'proposal.' + (body.action === 'approve' ? 'approved' : 'declined'), { version: body.version }, p.id); }
        else if (body.action === 'record_deployment') { if (p.status !== 'APPROVED' || p.currentVersion !== body.version || p.approvedVersion !== body.version) fail(409, 'DEPLOYMENT_NOT_APPROVED', 'Only the currently approved version can receive a deployment reference.'); const reference = text(body.deploymentReference, 3, 160, 'Deployment reference', true); noSecrets(reference); p.status = 'DEPLOYED'; p.deploymentReference = reference; p.deployedAt = now; audit(s, 'proposal.deployment_recorded', { version: body.version, deploymentReference: reference }, p.id); }
        else if (body.action === 'record_rollback') { if (p.status !== 'DEPLOYED') fail(409, 'ROLLBACK_NOT_AVAILABLE', 'Only a recorded deployment can receive a rollback reference.'); const reference = text(body.rollbackReference, 3, 160, 'Restored release reference', true); noSecrets(reference); p.status = 'ROLLED_BACK'; p.rollbackReference = reference; p.rolledBackAt = now; audit(s, 'proposal.rollback_recorded', { rollbackReference: reference }, p.id); }
        else if (body.action === 'delete') { u.proposals.splice(u.proposals.indexOf(p), 1); audit(s, 'proposal.deleted', { retained: 'audit metadata only' }, p.id); }
        else fail(400, 'ACTION_INVALID', 'Unknown upgrade proposal action.');
        if (body.action !== 'delete') p.updatedAt = now;
      u.revision++; return upgradeView(s);
    });
    return result;
  }
  return Object.freeze({ cloudRead: waitForScope(cloudRead), cloudWrite: waitForScope(cloudWrite),
    hopeRead: waitForScope(hopeRead), hopeWrite: waitForScope(hopeWrite),
    upgradeRead: waitForScope(upgradeRead), upgradeWrite: waitForScope(upgradeWrite) });
}
