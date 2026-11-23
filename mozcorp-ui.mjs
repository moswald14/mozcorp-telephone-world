// SPDX-License-Identifier: GPL-3.0-only
// Trusted Keeper controller. Private stations remain opaque-origin sandboxed frames.
import { createCreativeScorePlayer } from './creative-score-player.mjs';
import { createMozCorpCloud } from './mozcorp-cloud.mjs';
import { createMozCorpUpgrades } from './mozcorp-upgrades.mjs';
const PROTOCOL = 'doodle-mozcorp/v1';
const ENGINES = new Set(['mozcorp-v13', 'mozcorp-bug-world-v2']);
const SAVABLE = new Set(['machine', 'bug-world']);
const MODES = new Set(['fiction', 'personal', 'observer', 'talky']);
const TEXT_FIELDS = ['sourceText', 'masterText', 'storyText', 'poemText', 'characterText', 'asciiText'];
const PREF_KEYS = new Set(['btw.mozmoji.fork.v1', 'btw.voodont.blind-backfeed.v1']);
const PREF_STORE = 'doodleverse-mozcorp-preferences-v1';
const CUE_KEY = 'btw-everywhen-fiction-cue-v1', REVIEW_KEY = 'btw.integrity.handoff.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(message); };
const validAnchor = value => typeof value === 'string' && /^[A-Za-z][\w-]{0,99}$/.test(value);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(value);
import { requestPublicService } from './public-services.mjs';
import { stations } from './public-rooms.mjs';

function boundedJSON(value, maxBytes = 2000000) {
  let count = 0;
  function check(item, depth) {
    if (++count > 100000 || depth > 20) fail('This project is too complex to open safely.');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > 250000) fail('A project text field is too large.'); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('Project numbers must be finite.'); return; }
    if (Array.isArray(item)) { if (item.length > 5000) fail('A project list is too large.'); for (const child of item) check(child, depth + 1); return; }
    if (!plain(item) || Object.keys(item).length > 3000) fail('Choose a project containing plain JSON data.');
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('This project contains an unsafe field.');
      check(child, depth + 1);
    }
  }
  check(value, 0);
  const raw = JSON.stringify(value);
  if (new TextEncoder().encode(raw).length > maxBytes) fail('This project exceeds the file size limit.');
  return JSON.parse(raw);
}

function parseJSON(text, maxBytes) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > maxBytes) fail('This file exceeds the project size limit.');
  let value;
  try { value = JSON.parse(text); } catch { fail('That file is not readable JSON.'); }
  return boundedJSON(value, maxBytes);
}

function isMozCorp(record) {
  return !!record && (ENGINES.has(record.machine?.engine) || record.machine?.legacy?.format === 'mozcorp-bugworld-package-v1');
}

function recordStation(record) {
  if (record.machine?.engine === 'mozcorp-bug-world-v2' || record.machine?.legacy) return 'bug-world';
  if (record.machine?.engine === 'mozcorp-v13') return 'machine';
  fail('This project belongs to another Telephone World edition.');
}

export function parseMozCorpImport(text, bridge = globalThis.DoodleBridge) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > (bridge.MAX_BYTES || 16000000)) fail('This file exceeds the project size limit.');
  let value;
  try { value = JSON.parse(text, (key, item) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('This project contains an unsafe field.'); return item; }); } catch (error) { fail(error instanceof SyntaxError ? 'That file is not readable JSON.' : error.message); }
  if (!plain(value)) fail('Choose a project containing plain JSON data.');
  if (value.format === 'mozcorp-bugworld-package-v1') {
    value = boundedJSON(value, 2000000);
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || !plain(value.state) || !plain(value.state.fields) || !plain(value.state.bugWorld)) fail('This legacy file is missing its Bug World state.');
    const source = value.state.fields.seed;
    if (source !== undefined && typeof source !== 'string') fail('The legacy world has an invalid source field.');
    const record = bridge.make(value.name.trim().slice(0, 80));
    record.sourceText = source || '';
    record.sourceMode = 'fiction';
    record.machine = { engine: 'mozcorp-bug-world-v2', mozcorp: { version: 1, station: 'bug-world' }, legacy: value };
    return bridge.validate(record);
  }
  const record = bridge.validate(value);
  if (!isMozCorp(record)) fail('Open this project in its original Telephone World edition.');
  record.id = crypto.randomUUID(); record.revision = 0;
  record.title = (record.title + ' · imported').slice(0, 80);
  return bridge.validate(record);
}

export function validateMozCorpHandoff(value) {
  if (!plain(value) || Object.keys(value).some(key => ![CUE_KEY, REVIEW_KEY].includes(key))) fail('This station requested an unsupported handoff.');
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string' || raw.length > (key === CUE_KEY ? 4096 : 700000)) fail('This station handoff is too large.');
    const packet = parseJSON(raw, key === CUE_KEY ? 4096 : 700000);
    if (key === CUE_KEY) {
      if (!plain(packet) || Object.keys(packet).sort().join(',') !== 'fictional,format,icon,scene' || packet.format !== 'everywhen.fiction-cue.v1' || packet.fictional !== true || !Number.isInteger(packet.scene) || packet.scene < 1 || packet.scene > 8) fail('Only a fictional EVERYWHEN cue can enter the story.');
      const icon = packet.icon;
      if (!plain(icon) || Object.keys(icon).sort().join(',') !== 'palette,pattern,shape,source,symbol' || !['citron', 'tide', 'violet', 'ember', 'mono'].includes(icon.palette) || !['circle', 'tile', 'hexagon'].includes(icon.shape) || !['ring', 'spark', 'wave', 'gate', 'orbit'].includes(icon.symbol) || !['custom', 'receipt-derived'].includes(icon.source) || !/^[a-f0-9]{8}$/i.test(icon.pattern)) fail('This EVERYWHEN cue contains unsupported icon settings.');
    } else if (!plain(packet) || packet.format !== 'BTW-INTEGRITY-HANDOFF-1' || typeof packet.createdAt !== 'string' || !Number.isFinite(Date.parse(packet.createdAt)) || !plain(packet.notebook)) fail('This source-review handoff is invalid.');
    result[key] = raw;
  }
  return result;
}

function narrative(record) {
  return JSON.stringify([record.title, record.sourceMode, ...TEXT_FIELDS.map(key => record[key]), record.machine]);
}

function checkpoint(value) {
  if (!plain(value) || !Number.isSafeInteger(value.editVersion) || value.editVersion < 0 || value.editVersion > 1000000000) fail('This station returned an invalid edit checkpoint.');
  return value.editVersion;
}

function captureRecord(bridge, value, base, title, stationId) {
  if (!plain(value) || !ENGINES.has(value.engine) || (stationId === 'machine') !== (value.engine === 'mozcorp-v13')) fail('This station returned a snapshot from another engine.');
  checkpoint(value);
  const snapshot = boundedJSON(value, 8000000);
  const next = clone(base);
  next.title = title.trim().slice(0, 80) || (stationId === 'bug-world' ? 'Untitled Bug World' : 'Untitled MozCorp world');
  for (const key of TEXT_FIELDS) {
    const text = snapshot[key] ?? next[key] ?? '';
    if (typeof text !== 'string' || text.length > 250000) fail('This station returned an invalid narrative field.');
    next[key] = text;
  }
  if (!MODES.has(snapshot.sourceMode)) fail('This station returned invalid source handling.');
  next.sourceMode = snapshot.sourceMode;
  const room = { version: 1, station: stationId };
  for (const key of ['cloud', 'world', 'controls', 'outputs', 'modules', 'animal']) if (snapshot[key] !== undefined) room[key] = snapshot[key];
  if (stationId === 'machine' && !plain(room.cloud) || stationId === 'bug-world' && !plain(room.world)) fail('The station snapshot is missing its real world state.');
  next.machine = { engine: snapshot.engine, mozcorp: room, ...(base.machine?.legacy ? { legacy: clone(base.machine.legacy) } : {}) };
  return bridge.validate(next);
}

export function createMozCorpUI(container, { onVault, onWorld, navigate, starter = null, openStudio, stopStudio } = {}) {
  const B = globalThis.DoodleBridge;
  if (!B) throw new Error('Open MozCorp through your Keeper.');
  container.innerHTML = `<section class="moz-install" id="moz-install" hidden><p id="moz-install-note" role="alert"></p></section>
    <div class="moz-workspace" id="moz-workspace" hidden><nav id="moz-stations" class="moz-stations" aria-label="MozCorp stations"></nav>
      <section class="moz-project utility-card" id="moz-project-controls"><div class="moz-title-row"><label>PROJECT NAME<input id="moz-title" maxlength="80" value="Untitled MozCorp world" autocomplete="off"></label><span id="moz-save-state" role="status">Ready</span></div>
      <div class="moz-actions"><button id="moz-save" class="button primary" type="button">Save world</button><button id="moz-new" class="button quiet" type="button">New</button><button id="moz-export" class="button quiet" type="button">Export project</button><button id="moz-import" class="button quiet" type="button">Import project</button><button id="moz-stop" class="button quiet" type="button">Stop sound & motion</button></div>
      <div class="moz-actions moz-shelf"><label class="sr-only" for="moz-projects">Saved MozCorp projects</label><select id="moz-projects" aria-label="Saved MozCorp projects"><option value="">Your saved worlds…</option></select><button id="moz-open" class="button quiet" type="button">Open</button><button id="moz-play" class="button quiet" type="button">▶ Soundtrack</button><button id="moz-studio" class="button quiet" type="button">Edit soundtrack</button><button id="moz-vault" hidden class="button quiet" type="button">Copy text to vault</button><button id="moz-world" hidden class="button quiet" type="button">Make playable map</button></div>
      <p class="moz-note" id="moz-scope">Machine and Bug World projects use this browser’s unencrypted creative shelf. Other desks keep their own exports. Export projects to bring them into Keeper.</p><input id="moz-project-file" type="file" accept=".json,.btwpkg,application/json" hidden></section>
      <p class="moz-status" id="moz-status" role="status" aria-live="polite">Choose a room to begin.</p>
      <div class="moz-original" id="moz-original" hidden><p id="moz-original-note"></p><a id="moz-original-link" class="button quiet" target="_blank" rel="noopener noreferrer">Open source ↗</a></div>
      <section id="moz-cloud-desk" class="moz-local-desk utility-card" hidden></section>
      <section id="moz-upgrades-desk" class="moz-local-desk utility-card" hidden></section>
      <div id="moz-frames" class="moz-frames" aria-label="MozCorp workspace"></div>
    </div>`;
  const $ = id => container.querySelector('#' + id);
  const frames = new Map(), allFrames = new Set(), handoffs = new Map(), handoffAnchors = new Map();
  let installed = null, active = null, visible = false, busy = false, sequence = 0, refreshTicket = 0, shelfTicket = 0, requestedOpened = false;
  let localDesk = null;
  let preferences = {};
  try { const raw = localStorage.getItem(PREF_STORE); if (raw) { const data = parseJSON(raw, 140000); for (const key of PREF_KEYS) if (typeof data[key] === 'string' && data[key].length <= 65536) preferences[key] = data[key]; } } catch {}
  const status = (message, error = false) => { $('moz-status').textContent = message; $('moz-status').dataset.error = String(error); };
  const scorePlayer = createCreativeScorePlayer({ onStatus: message => status(typeof message === 'string' ? message : message?.message || 'Soundtrack updated.') });
  const serviceRequest = area => (method, payload) => fetchJSON(area, method === 'POST' ? { method, headers: { 'X-Keeper-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
  const cloudDesk = createMozCorpCloud({ container: $('moz-cloud-desk'), request: serviceRequest('cloud'), onRestore: slot => run(() => openCloudSlot(slot.id)), setStatus: status });
  const upgradesDesk = createMozCorpUpgrades({ container: $('moz-upgrades-desk'), request: serviceRequest('upgrades'), setStatus: status });
  const requestToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  function update() {
    const writable = !localDesk && active && SAVABLE.has(active.stationId) && !active.closed;
    for (const id of ['moz-save', 'moz-export', 'moz-play', 'moz-studio', 'moz-vault', 'moz-world']) $(id).disabled = busy || !writable;
    for (const id of ['moz-new', 'moz-open', 'moz-import']) $(id).disabled = busy;
    $('moz-title').disabled = busy || !writable;
    $('moz-stop').disabled = !active;
    $('moz-project-controls').hidden = !!localDesk;
    $('moz-frames').hidden = !!localDesk;
    $('moz-cloud-desk').hidden = localDesk !== 'cloud';
    $('moz-upgrades-desk').hidden = localDesk !== 'upgrades';
    if (active) {
      $('moz-save-state').textContent = active.dirty || active.titleDirty ? 'Unsaved changes' : active.record ? 'Saved on this browser' : 'New world';
      $('moz-save').textContent = active.dirty || active.titleDirty ? 'Save world ●' : 'Save world';
      $('moz-world').disabled ||= active.record?.sourceMode !== 'fiction';
      $('moz-scope').textContent = writable ? 'Machine and Bug World projects use this browser’s unencrypted creative shelf. Other desks keep their own exports. Export projects to bring them into Keeper.' : 'This desk stays separate from story projects. Use its own export controls to keep receipts, source reviews, or personal notes.';
    }
    for (const button of $('moz-stations').children) { const match = installed?.stations.find(station => station.id === button.dataset.station); button.classList.toggle('active', button.dataset.service ? button.dataset.service === localDesk : !localDesk && !!active && match?.canonical === active.stationId); button.disabled = busy; }
  }
  async function run(fn) {
    if (busy) return;
    busy = true; update();
    try { return await fn(); } catch (error) { status(error.message || 'This room could not finish that action.', true); }
    finally { busy = false; update(); }
  }
  function fetchJSON(path, options = {}) {
    if (path === 'status') return { installed: true, expected: {}, stations };
    return requestPublicService(path, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined);
  }
  function station(id) {
    const value = installed?.stations.find(item => item.id === id);
    if (!value) fail('That MozCorp room is not installed.');
    return value;
  }
  function dispose(session) {
    if (!session || session.closed) return;
    session.closed = true; clearTimeout(session.readyTimer); session.rejectReady(new Error('This room was closed.'));
    for (const job of session.pending.values()) { clearTimeout(job.timer); job.reject(new Error('This room was closed.')); }
    session.pending.clear(); allFrames.delete(session); session.frame.remove();
    if (frames.get(session.stationId) === session) frames.delete(session.stationId);
  }
  function send(session, value) { if (!session.closed) session.frame.contentWindow.postMessage({ protocol: PROTOCOL, stationId: session.stationId, token: session.token, ...value }, '*'); }
  function newFrame(id, memory = {}) {
    const spec = station(id), canonical = spec.canonical || spec.id;
    const frame = document.createElement('iframe');
    frame.className = 'moz-frame'; frame.title = spec.title; frame.hidden = true; frame.inert = true;
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-downloads'); frame.setAttribute('referrerpolicy', 'no-referrer');
    const session = { frame, stationId: canonical, token: requestToken(), ready: false, closed: false, pending: new Map(), handled: new Set(), inFlight: 0, editVersion: 0, changeGeneration: 0, titleGeneration: 0, dirty: false, titleDirty: false, record: null, importBase: null, title: canonical === 'bug-world' ? 'Untitled Bug World' : 'Untitled MozCorp world', memory };
    session.readyPromise = new Promise((resolve, reject) => { session.resolveReady = resolve; session.rejectReady = reject; });
    session.readyPromise.catch(() => {});
    session.readyTimer = setTimeout(() => session.rejectReady(new Error('This room did not open. Refresh the private rooms, then try again.')), 20000);
    allFrames.add(session); frame.src = new URL('./room-' + encodeURIComponent(canonical) + '.html', import.meta.url).href;
    $('moz-frames').append(frame);
    return session;
  }
  async function rpc(session, requestType, payload = {}, timeout = 20000) {
    if (session.closed) fail('This room is closed.');
    await session.readyPromise;
    const requestId = 'keeper-' + (++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { session.pending.delete(requestId); reject(new Error('This room did not finish. Your previous world is still kept.')); }, timeout);
      session.pending.set(requestId, { resolve, reject, timer });
      send(session, { type: 'request', requestId, requestType, payload });
    });
  }
  async function stop(session) { if (session && !session.closed) await rpc(session, 'stop', {}, 3000); }
  async function stopAll() { scorePlayer.stop(); stopStudio?.(); await Promise.all([...allFrames].map(session => stop(session).catch(() => {}))); }
  function activate(session) {
    localDesk = null; cloudDesk.setVisible(false); upgradesDesk.setVisible(false);
    active = session;
    for (const other of allFrames) { other.frame.hidden = other !== session; other.frame.inert = other !== session || !visible; if (other !== session) stop(other).catch(() => {}); }
    $('moz-title').value = session.title; update();
  }
  function needsWarning(session) { return session && (session.dirty || session.titleDirty); }
  function confirmReplace(sessions) {
    if (sessions.some(needsWarning) && !confirm('Open a different world here? Save or export your current work first. Unsaved changes in the replaced room will be lost.')) return false;
    return true;
  }
  async function focus(session, spec, memory = {}) {
    const transfer = validateMozCorpHandoff(memory);
    const ack = await rpc(session, 'focus', { anchor: validAnchor(spec.startAnchor) ? spec.startAnchor : '', session: transfer });
    if (!plain(ack) || ack.focused !== true || Object.keys(transfer).length && ack.handoff !== true) fail('This room did not confirm the requested handoff. Your existing room remains kept.');
    const queued = handoffs.get(session.stationId);
    if (queued) { for (const [key, value] of Object.entries(transfer)) if (queued[key] === value) delete queued[key]; if (!Object.keys(queued).length) { handoffs.delete(session.stationId); handoffAnchors.delete(session.stationId); } }
  }
  async function openStation(id, supplied = {}, anchor = '') {
    if (id === 'upgrades' || id === 'cloud') return openDesk(id);
    scorePlayer.stop();
    const spec = station(id), canonical = spec.canonical || spec.id;
    const memory = { ...(handoffs.get(canonical) || {}), ...validateMozCorpHandoff(supplied) };
    if (Object.keys(memory).length) { handoffs.set(canonical, memory); if (validAnchor(anchor)) handoffAnchors.set(canonical, anchor); }
    let session = frames.get(canonical), created = false;
    if (!session) { session = newFrame(canonical); created = true; }
    try {
      await session.readyPromise;
      await focus(session, { ...spec, startAnchor: validAnchor(anchor) ? anchor : handoffAnchors.get(canonical) || spec.startAnchor }, memory);
      if (created) { frames.set(canonical, session); checkpoint(await rpc(session, 'checkpoint')); }
      activate(session); status(SAVABLE.has(canonical) ? 'Room open. Save a world to carry it into Dot Studio or your Keeper.' : 'Room open. Its personal notes and receipts stay at this desk.');
    } catch (error) { if (created) dispose(session); throw error; }
  }
  async function openDesk(name) {
    if (!['cloud', 'upgrades'].includes(name)) fail('Choose a MozCorp service.');
    await stopAll(); localDesk = name;
    for (const session of allFrames) { session.frame.hidden = true; session.frame.inert = true; }
    $('moz-original').hidden = true; update();
    status(name === 'cloud' ? 'Savepoints live in this browser. Open rooms and unsaved edits remain kept while you use this desk.' : 'This desk saves manual proposals and reviews in this browser.');
    await (name === 'cloud' ? cloudDesk : upgradesDesk).setVisible(visible);
  }
  async function openCloudSlot(id) {
    const result = await fetchJSON('cloud'), slot = result.slots?.find(item => item.id === id);
    if (!slot || !['machine', 'animal-animal'].includes(slot.kind)) fail('That savepoint is no longer available for the machine. Refresh the list.');
    const payload = typeof slot.payload === 'string' ? parseJSON(slot.payload, 120000) : boundedJSON(slot.payload, 120000);
    const previous = frames.get('machine'), generation = previous?.changeGeneration, titleGeneration = previous?.titleGeneration;
    if (!confirmReplace([previous])) return { restored: false, cancelled: true };
    if (previous) previous.frame.inert = true;
    let candidate;
    try {
      await stopAll(); candidate = newFrame('machine');
      const ack = await rpc(candidate, 'cloud-restore', { kind: slot.kind, payload });
      if (!plain(ack) || ack.restored !== true || ack.kind !== slot.kind) fail('The machine did not confirm that the savepoint was restored.');
      candidate.editVersion = checkpoint(await rpc(candidate, 'checkpoint'));
      if (previous && (previous.changeGeneration !== generation || previous.titleGeneration !== titleGeneration)) fail('Restore canceled because the current machine changed. Save those edits first.');
      candidate.title = slot.slotName.slice(0, 80); candidate.dirty = true; candidate.titleDirty = true;
      if (previous) dispose(previous);
      frames.set('machine', candidate); activate(candidate); candidate = null;
      status('Savepoint opened as an unsaved world. The final story and soundtrack were outside that savepoint; run the machine and Save world when ready.');
      return { restored: true, kind: slot.kind };
    } finally { if (candidate) dispose(candidate); if (previous && !previous.closed) previous.frame.inert = !!localDesk || previous !== active || !visible; }
  }
  async function openRecord(value) {
    scorePlayer.stop();
    const before = active;
    const oldGeneration = before?.changeGeneration, oldTitle = before?.titleGeneration;
    if (!confirmReplace([before])) return;
    if (before) before.frame.inert = true;
    let candidate;
    try {
      const record = B.validate(typeof value === 'string' ? await B.get(value) : value);
      if (!isMozCorp(record)) fail('Choose a MozCorp or Bug World project.');
      const target = recordStation(record), replaced = frames.get(target);
      if (replaced && replaced !== before && !confirmReplace([replaced])) return;
      const replacedGeneration = replaced?.changeGeneration, replacedTitle = replaced?.titleGeneration;
      candidate = newFrame(target);
      const ack = await rpc(candidate, 'restore', record);
      if (!plain(ack) || ack.restored !== true || ack.engine !== record.machine.engine) fail('This room did not confirm that the world was restored.');
      candidate.editVersion = checkpoint(await rpc(candidate, 'checkpoint'));
      if (before && (before.changeGeneration !== oldGeneration || before.titleGeneration !== oldTitle) || replaced && (replaced.changeGeneration !== replacedGeneration || replaced.titleGeneration !== replacedTitle)) fail('Opening canceled because your current world changed. Save those edits, then open the other project again.');
      candidate.record = record; candidate.title = record.title; candidate.dirty = false; candidate.titleDirty = false;
      if (replaced) dispose(replaced);
      frames.set(target, candidate); activate(candidate); candidate = null;
      status('World opened and restored. Sound and motion wait for your choice.');
      navigate?.('mozcorp');
    } finally {
      if (candidate) dispose(candidate);
      if (before && !before.closed) before.frame.inert = before !== active || !visible;
    }
  }
  async function newProject(premise = null) {
    scorePlayer.stop();
    const target = !premise && active && SAVABLE.has(active.stationId) ? active.stationId : 'machine';
    const previous = frames.get(target), generation = previous?.changeGeneration, titleGeneration = previous?.titleGeneration;
    if (!confirmReplace([previous])) return;
    if (previous) previous.frame.inert = true;
    let candidate;
    try {
      candidate = newFrame(target);
      if (premise) {
        const snapshot = await rpc(candidate, 'capture');
        const draft = captureRecord(B, snapshot, B.make(premise.title), premise.title, target);
        if (draft.sourceMode !== 'fiction') fail('A starter needs a fresh fiction workspace.');
        draft.sourceText = premise.seed;
        const ack = await rpc(candidate, 'restore', B.validate(draft));
        if (!plain(ack) || ack.restored !== true || ack.engine !== 'mozcorp-v13') fail('The machine could not load that premise.');
        candidate.title = draft.title;
        candidate.dirty = true;
      }
      candidate.editVersion = checkpoint(await rpc(candidate, 'checkpoint'));
      if (previous && (previous.changeGeneration !== generation || previous.titleGeneration !== titleGeneration)) fail('New world canceled because the current world changed.');
      if (previous) dispose(previous);
      frames.set(target, candidate); activate(candidate); candidate = null;
      if (premise) {
        try { await focus(active, { startAnchor: 'machineHopper' }); } catch {}
        status('Premise loaded. Run the machine from the Input Hopper, then save your world or edit its soundtrack.');
      } else status('New world ready. Your saved project shelf is preserved.');
      return true;
    } finally { if (candidate) dispose(candidate); if (previous && !previous.closed) previous.frame.inert = previous !== active || !visible; }
  }
  async function baseForSave(session) {
    if (!session.record) return session.importBase ? clone(session.importBase) : B.make(session.title);
    const latest = await B.get(session.record.id);
    if (!latest) fail('This project is no longer on the shelf. Export this room to keep it.');
    if (latest.revision !== session.record.revision && narrative(latest) !== narrative(session.record)) fail('Another tab changed this world. Export your current edits, or reopen its saved project before saving.');
    return latest;
  }
  async function saveSession(session = active) {
    if (!session || session !== active || !SAVABLE.has(session.stationId)) fail('Only the main machine and Bug World save to the creative project shelf.');
    const capture = await rpc(session, 'capture'), capturedVersion = checkpoint(capture), titleGeneration = session.titleGeneration, title = session.title;
    const base = await baseForSave(session);
    const snapshot = captureRecord(B, capture, base, title, session.stationId);
    const saved = await B.save(snapshot);
    session.record = saved; session.importBase = null;
    let latestVersion;
    try { latestVersion = checkpoint(await rpc(session, 'checkpoint')); } catch { latestVersion = null; }
    const clean = latestVersion === capturedVersion && session.editVersion <= capturedVersion && session.titleGeneration === titleGeneration;
    session.dirty = !clean; session.titleDirty = session.titleGeneration !== titleGeneration;
    if (clean) session.editVersion = capturedVersion;
    await refreshShelf(); update();
    status(clean ? 'World saved with its story, real engine state and attached Studio score.' : 'Earlier version saved. Newer edits remain unsaved; choose Save world again to keep them.');
    return saved;
  }
  async function refreshShelf() {
    const ticket = ++shelfTicket, selected = $('moz-projects').value;
    const summaries = await B.list();
    const records = await Promise.all(summaries.filter(item => !Object.hasOwn(item, 'engine') || ENGINES.has(item.engine)).map(item => B.get(item.id)));
    if (ticket !== shelfTicket) return;
    $('moz-projects').replaceChildren(new Option('Your saved worlds…', ''));
    for (const record of records.filter(isMozCorp)) $('moz-projects').append(new Option(record.title + (record.soundtrack ? ' ♫' : ''), record.id));
    $('moz-projects').value = selected || active?.record?.id || '';
  }
  async function refresh() {
    const ticket = ++refreshTicket;
    const info = await fetchJSON('status');
    if (ticket !== refreshTicket) return;
    if (!plain(info) || typeof info.installed !== 'boolean' || !plain(info.expected) || !Array.isArray(info.stations) || info.stations.length > 24) fail('The private-room status could not be read.');
    const seen = new Set();
    for (const item of info.stations) { if (!plain(item) || !validId(item.id) || !validId(item.canonical || item.id) || typeof item.title !== 'string' || item.title.length > 120 || seen.has(item.id)) fail('The private-room list is invalid.'); seen.add(item.id); }
    installed = { ...info, stations: info.stations.map(item => ({ ...item, canonical: item.canonical || item.id })) };
    $('moz-workspace').hidden = false;
    $('moz-stations').replaceChildren();
    for (const item of installed.stations) { const button = document.createElement('button'); button.type = 'button'; button.className = 'moz-station'; button.dataset.station = item.id; button.textContent = item.title; button.onclick = () => run(() => openStation(item.id)); $('moz-stations').append(button); }
    for (const [name, label] of [['cloud', 'Savepoints'], ['upgrades', 'Upgrade desk']]) { const button = document.createElement('button'); button.type = 'button'; button.className = 'moz-station'; button.dataset.service = name; button.textContent = label; button.onclick = () => run(() => openDesk(name)); $('moz-stations').append(button); }
    await refreshShelf(); update();
    const requested = new URLSearchParams(location.search).get('mozcorp');
    if (info.installed && requested && !requestedOpened) { requestedOpened = true; await openRecord(requested); }
    else if (info.installed && visible && !active && !localDesk) {
      if (starter) {
        const premise = starter; starter = null;
        await run(async () => {
          try {
            if (await newProject(premise)) {
              const url = new URL(location.href);
              url.searchParams.delete('transmission');
              history.replaceState(history.state, '', url);
              $('moz-project-controls').scrollIntoView({ block: 'start' });
            }
          } catch {
            await openStation('machine');
            status('Could not load the premise. You can enter it in the Input Hopper.', true);
          }
        });
      } else await openStation('machine');
    }
  }
  function sourceLink(payload) {
    if (!plain(payload) || typeof payload.url !== 'string' || payload.url.length > 4096) fail('Choose a supported source link.');
    let url; try { url = new URL(payload.url); } catch { fail('This source address could not be read.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('Only ordinary web source links can be opened here.');
    $('moz-original-link').href = url.href; $('moz-original-link').textContent = 'Open source ↗';
    $('moz-original-note').textContent = 'Source link ready: ' + url.href;
    $('moz-original').hidden = false;
    status('Review the source address above, then open it when you choose.');
    return { opened: false, ready: true };
  }
  async function childRequest(session, message) {
    const payload = message.payload;
    if (message.requestType === 'pref-set') {
      if (!plain(payload) || !PREF_KEYS.has(payload.key) || payload.value !== null && (typeof payload.value !== 'string' || payload.value.length > 65536)) fail('This station preference is not supported.');
      if (payload.value === null) delete preferences[payload.key]; else preferences[payload.key] = payload.value;
      localStorage.setItem(PREF_STORE, JSON.stringify(preferences)); return { saved: true };
    }
    if (session !== active || !visible || localDesk) fail('Return to this room before using that action.');
    if (message.requestType === 'open-link') return sourceLink(payload);
    if (message.requestType === 'open-original') { if (payload?.path === '/upgrades') { await openDesk('upgrades'); return { opened: true }; } fail('This service runs in your own Keeper installation.'); }
    if (message.requestType === 'upgrades') {
      if (session.stationId !== 'machine' || !plain(payload) || payload.action !== 'open') fail('Open the upgrade desk from the machine.');
      await openDesk('upgrades'); return { opened: true };
    }
    if (message.requestType === 'cloud') {
      if (session.stationId !== 'machine' || !plain(payload)) fail('Use the machine’s Cloud Bus for savepoints.');
      if (payload.action === 'list') return fetchJSON('cloud');
      if (payload.action === 'save') return serviceRequest('cloud')('POST', boundedJSON(payload, 125000));
      if (payload.action === 'restore' && typeof payload.slotId === 'string' && payload.slotId.length < 100) {
        if (busy) fail('Finish the current Keeper action, then open the savepoint.');
        const restored = await run(() => openCloudSlot(payload.slotId));
        if (!restored) fail('The savepoint could not be opened. Review the Keeper message.');
        return restored;
      }
      fail('This cloud savepoint action is not supported.');
    }
    if (message.requestType === 'hope') {
      if (!['hope-lon', 'swordfish'].includes(session.stationId) || !plain(payload)) fail('Open Swordfish or HOPE-LON to use the fictional feed.');
      if (payload.action === 'read') return fetchJSON('hope');
      if (!['settings', 'clear', 'seed'].includes(payload.action)) fail('Choose a supported fictional feed action.');
      return serviceRequest('hope')('POST', boundedJSON(payload, 20000));
    }
    if (message.requestType === 'news') {
      if (!plain(payload) || typeof payload.query !== 'string' || payload.query.length > 120 || !Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 12) fail('Choose a short news query and up to twelve results.');
      sourceLink({ url: 'https://news.google.com/rss' });
      fail('Live news intake runs in Keeper. Open the public RSS feed with the source link above.');
    }
    if (message.requestType === 'save') {
      if (session !== active || !SAVABLE.has(session.stationId)) fail('Return to the main machine or Bug World to save a project.');
      if (busy) fail('Finish the current Keeper action, then save again.');
      const record = await run(() => saveSession(session));
      if (!record) fail('This world could not be saved. Review the Keeper message and try again.');
      return { id: record.id, title: record.title, revision: record.revision };
    }
    fail('This station action is not permitted.');
  }
  function onMessage(event) {
    if (event.origin !== 'null') return;
    const session = [...allFrames].find(item => !item.closed && item.frame.contentWindow === event.source);
    const message = event.data;
    if (!session || !plain(message) || message.protocol !== PROTOCOL || message.stationId !== session.stationId) return;
    if (message.type === 'ready') {
      if (session.ready) return;
      session.ready = true; clearTimeout(session.readyTimer);
      send(session, { type: 'init', session: session.memory, preferences: { ...preferences } });
      session.memory = {}; session.resolveReady(); return;
    }
    if (!session.ready || message.token !== session.token) return;
    if (message.type === 'response') {
      const job = session.pending.get(message.requestId); if (!job) return;
      session.pending.delete(message.requestId); clearTimeout(job.timer);
      if (message.error) job.reject(new Error(typeof message.error === 'string' ? message.error : 'The private room could not finish.')); else job.resolve(message.result);
      return;
    }
    if (message.type === 'dirty') {
      if (!Number.isSafeInteger(message.editVersion) || message.editVersion < 0 || message.editVersion > 1000000000 || message.editVersion <= session.editVersion) return;
      session.editVersion = message.editVersion; session.changeGeneration++; session.dirty = true; update(); return;
    }
    if (message.type === 'navigate') {
      if (session !== active || !visible || localDesk || busy || !plain(message.payload) || !validId(message.payload.stationId)) return;
      run(() => openStation(message.payload.stationId, validateMozCorpHandoff(message.payload.session || {}), message.payload.anchor || ''));
      return;
    }
    if (message.type === 'request' && typeof message.requestId === 'string' && /^[\w-]{1,100}$/.test(message.requestId) && !session.handled.has(message.requestId) && session.handled.size < 1000) {
      if (session.inFlight >= 12) { send(session, { type: 'response', requestId: message.requestId, error: 'Finish the pending room actions, then try again.' }); return; }
      session.handled.add(message.requestId); session.inFlight++;
      Promise.resolve().then(() => childRequest(session, message)).then(result => send(session, { type: 'response', requestId: message.requestId, result }), error => send(session, { type: 'response', requestId: message.requestId, error: { message: error.message || 'The Keeper could not complete this action.', status: error.status || 400, code: error.code || 'MOZCORP_REQUEST' } })).finally(() => { session.inFlight--; });
    }
  }
  window.addEventListener('message', onMessage);
  $('moz-title').addEventListener('input', () => { if (!active || !SAVABLE.has(active.stationId)) return; active.title = $('moz-title').value; active.titleGeneration++; active.changeGeneration++; active.titleDirty = true; update(); });
  $('moz-save').onclick = () => run(() => saveSession());
  $('moz-new').onclick = () => run(newProject);
  $('moz-open').onclick = () => run(() => { const id = $('moz-projects').value; if (!id) fail('Choose a saved world first.'); return openRecord(id); });
  $('moz-stop').onclick = () => { stopAll().then(() => status('Sound and motion stopped. Use each room’s controls when you want to resume.')); };
  $('moz-import').onclick = () => $('moz-project-file').click();
  $('moz-project-file').onchange = event => run(async () => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (file.size > (B.MAX_BYTES || 16000000)) fail('Choose a project smaller than 16 MB. Legacy Bug World packages have a 2 MB limit.');
    const record = parseMozCorpImport(await file.text(), B);
    await openRecord(record);
    if (active?.record?.id === record.id) { active.importBase = active.record; active.record = null; active.titleDirty = true; active.dirty = true; update(); status('Imported into a separate room. Review the world, then Save world to keep the new copy.'); }
  });
  $('moz-export').onclick = () => run(async () => { if (!active || !SAVABLE.has(active.stationId)) fail('This desk uses its own exports.'); const capture = await rpc(active, 'capture'), base = await baseForSave(active); B.download(captureRecord(B, capture, base, active.title, active.stationId)); status('Portable project exported. Your current unsaved edits remain in this room.'); });
  $('moz-studio').onclick = () => run(async () => {
    const record = await saveSession();
    await stopAll();
    await openStudio(record);
  });
  $('moz-play').onclick = () => run(async () => { const record = await saveSession(); await stopAll(); await scorePlayer.play(record); });
  $('moz-vault').onclick = () => run(async () => { const record = await saveSession(); await stopAll(); await onVault?.(record); });
  $('moz-world').onclick = () => run(async () => { const record = await saveSession(); if (record.sourceMode !== 'fiction') fail('This source is held. Choose fiction in its machine before generating a fictional map.'); await stopAll(); await onWorld?.(record); });
  B.watch(() => { refreshShelf().catch(error => status(error.message, true)); });
  window.addEventListener('beforeunload', event => { if ([...allFrames].some(needsWarning)) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', () => { scorePlayer.stop(); for (const session of [...allFrames]) { send(session, { type: 'request', requestId: 'closing-' + (++sequence), requestType: 'stop', payload: {} }); dispose(session); } });
  refresh().catch(error => { $('moz-install').hidden = false; $('moz-install-note').textContent = error.message; });
  return {
    refresh,
    setVisible(value) {
      visible = !!value;
      for (const session of allFrames) session.frame.inert = !!localDesk || !visible || session !== active;
      cloudDesk.setVisible(visible && localDesk === 'cloud'); upgradesDesk.setVisible(visible && localDesk === 'upgrades');
      if (!visible) stopAll();
      else if (installed?.installed && !active && !localDesk && !busy) run(() => openStation('machine'));
    },
  };
}
