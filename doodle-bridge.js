// SPDX-License-Identifier: GPL-3.0-only
// Shared creative projects only. Keeper identities and vault keys never enter this store.
(function (root) {
  'use strict';
  const KIND = 'doodleverse-telephone-project', MAX_BYTES = 16000000, MAX_PROJECTS = 60;
  const MODES = ['fiction', 'personal', 'observer', 'talky'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const listeners = new Set();
  let database, channel;
  const fail = message => { throw new Error(message); };
  function string(value, limit, label) {
    if (typeof value !== 'string' || value.length > limit) fail('Invalid ' + label + '.');
    return value;
  }
  const mozcorpEngine = engine => ['mozcorp-v13', 'mozcorp-bug-world-v2'].includes(engine);
  function stationData(value, limit = 4000000) {
    let count = 0;
    const visit = (v, depth) => {
      if (++count > 100000 || depth > 20) fail('MozCorp snapshot is too complex.');
      if (v === null || typeof v === 'boolean') return;
      if (typeof v === 'string') return string(v, 250000, 'MozCorp text');
      if (typeof v === 'number' && Number.isFinite(v)) return;
      if (!v || typeof v !== 'object') fail('MozCorp snapshots contain JSON data only.');
      if (Array.isArray(v)) { if (v.length > 5000) fail('MozCorp array is too large.'); }
      else if (Object.prototype.toString.call(v) !== '[object Object]') fail('Invalid MozCorp snapshot object.');
      for (const [key, item] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsafe project property.');
        visit(item, depth + 1);
      }
    };
    visit(value, 0);
    if (new TextEncoder().encode(JSON.stringify(value)).length > limit) fail('MozCorp snapshot exceeds its size limit.');
  }
  function validateStation(m) {
    if (!mozcorpEngine(m.engine)) { if (m.mozcorp !== undefined || m.legacy !== undefined) fail('A MozCorp snapshot needs its original engine.'); return; }
    const s = m.mozcorp;
    if (!s || Array.isArray(s) || s.version !== 1 || s.station !== (m.engine === 'mozcorp-v13' ? 'machine' : 'bug-world')) fail('Invalid MozCorp station snapshot.');
    stationData(s);
    const allowed = ['version', 'station', 'cloud', 'world', 'controls', 'outputs', 'modules', 'animal'];
    if (Object.keys(s).some(k => !allowed.includes(k))) fail('Unsupported MozCorp snapshot field.');
    if (m.engine === 'mozcorp-v13') {
      const c = s.cloud;
      if (!c || c.format !== 'btw-cloud-state-v1' || c.firewall !== 'FINAL STORY // EXIT EXCLUDED' || !MODES.includes(c.sourceHandling)) fail('Invalid MozCorp cloud snapshot.');
      string(c.seed, 250000, 'MozCorp source');
      if (typeof c.savedAt !== 'string' || c.savedAt.length > 80 || !Number.isFinite(Date.parse(c.savedAt)) || !['unhinged', 'cute but wrong', 'dead serious', 'cosmic bureaucratic', 'Saturday cartoon'].includes(c.tone) || !['interesting', 'majority', 'chaos'].includes(c.consensus) || !['open', 'gurl', 'manual'].includes(c.characterLens)) fail('Invalid MozCorp cloud settings.');
      for (const [key, min, max] of [['calls', 1, 100], ['damage', 0, 100], ['brains', 3, 12], ['gens', 1, 12]]) if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) fail('Invalid MozCorp control.');
      if (!c.preStory || Array.isArray(c.preStory)) fail('Invalid MozCorp pre-story outputs.');
      for (const key of ['word', 'character', 'hive']) string(c.preStory[key], 250000, 'MozCorp pre-story output');
      for (const key of ['controls', 'outputs']) if (s[key] !== undefined) {
        if (!s[key] || Array.isArray(s[key]) || Object.keys(s[key]).length > 100) fail('Invalid MozCorp literal fields.');
        for (const text of Object.values(s[key])) string(text, 250000, 'MozCorp literal field');
      }
      if (s.modules !== undefined && (!Array.isArray(s.modules) || s.modules.length > 50 || s.modules.some(x => !x || typeof x.on !== 'boolean' || !Number.isFinite(x.level) || x.level < 0 || x.level > 100))) fail('Invalid MozCorp patch bay.');
      if (s.animal !== undefined) {
        const a = s.animal;
        if (!a || Array.isArray(a) || a.format !== 'btw-animal-animal-v1' || a.firewall !== 'FINAL STORY // EXIT EXCLUDED' || Object.keys(a).some(key => !['format','animals','rule','rounds','source','final','transcript','firewall'].includes(key)) || !Array.isArray(a.animals) || a.animals.length !== 2 || !Number.isInteger(a.rounds) || a.rounds < 1 || a.rounds > 8) fail('Invalid animal telephone snapshot.');
        for (const name of a.animals) string(name, 100, 'Animal cast');
        string(a.rule, 40, 'Animal rule');
        for (const key of ['source','final','transcript']) string(a[key], 250000, 'Animal telephone text');
      }
      if (s.world !== undefined) fail('A machine snapshot cannot replace a Bug World.');
    } else if (s.animal !== undefined || (s.world === undefined ? m.legacy === undefined : (!s.world || s.world.format !== 'mozcorp-new-bug-world-v2' || !s.world.state || Array.isArray(s.world.state)))) fail('Invalid Bug World snapshot.');
    if (m.legacy !== undefined) {
      stationData(m.legacy, 2000000);
      if (m.engine !== 'mozcorp-bug-world-v2' || m.legacy.format !== 'mozcorp-bugworld-package-v1' || !m.legacy.state?.bugWorld) fail('Invalid legacy Bug World package.');
    }
  }
  function validate(value) {
    if (!value || value.kind !== KIND || value.version !== 1) fail('Choose a Telephone World project.');
    if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value.id)) fail('Invalid project identifier.');
    string(value.title, 80, 'project title');
    if (!value.title.trim() || !MODES.includes(value.sourceMode)) fail('Invalid project name or source handling.');
    for (const field of ['createdAt', 'updatedAt']) if (typeof value[field] !== 'string' || !Number.isFinite(Date.parse(value[field]))) fail('Invalid project date.');
    for (const field of ['sourceText', 'storyText', 'poemText', 'characterText', 'masterText', 'asciiText']) string(value[field], 250000, field);
    if (!value.machine || typeof value.machine !== 'object' || Array.isArray(value.machine)) fail('Invalid machine snapshot.');
    const m = value.machine;
    validateStation(m);
    if (m.controls !== undefined) {
      if (!Array.isArray(m.controls) || m.controls.length > 400) fail('Too many machine controls.');
      for (const c of m.controls) {
        if (!c || typeof c.id !== 'string' || !/^[A-Za-z][\w-]{0,99}$/.test(c.id) || !['input', 'textarea', 'select'].includes(c.tag)) fail('Invalid saved control.');
        string(c.value, 250000, 'control value');
        if (typeof c.checked !== 'boolean') fail('Invalid saved switch.');
      }
    }
    if (m.outputs !== undefined) {
      if (!Array.isArray(m.outputs) || m.outputs.length > 200) fail('Too many saved outputs.');
      for (const out of m.outputs) {
        if (!out || typeof out.id !== 'string' || !/^[A-Za-z][\w-]{0,99}$/.test(out.id)) fail('Invalid output identifier.');
        string(out.text, 250000, 'output text');
      }
    }
    if (m.canvases !== undefined) {
      if (!Array.isArray(m.canvases) || m.canvases.length > 4) fail('Too many saved drawings.');
      for (const c of m.canvases) {
        if (!c || !['paintCanvas', 'desire'].includes(c.id) || typeof c.png !== 'string' || c.png.length > 3500000 || !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(c.png)) fail('Invalid saved drawing.');
      }
    }
    if (m.state !== undefined && (!m.state || typeof m.state !== 'object' || Array.isArray(m.state))) fail('Invalid machine state.');
    const state = m.state || {};
    for (const field of ['lastSignal', 'lastPreHive', 'rootHumanSeed']) if (state[field] !== undefined) string(state[field], 250000, field);
    if (state.reiterationCount !== undefined && (!Number.isSafeInteger(state.reiterationCount) || state.reiterationCount < 0 || state.reiterationCount > 10000)) fail('Invalid saved reiteration count.');
    if (state.modules !== undefined) {
      if (!Array.isArray(state.modules) || state.modules.length > 15) fail('Invalid saved module controls.');
      for (const mod of state.modules) if (!mod || Array.isArray(mod) || typeof mod.on !== 'boolean' || typeof mod.level !== 'number' || !Number.isFinite(mod.level) || mod.level < 0 || mod.level > 100) fail('Invalid saved module controls.');
    }
    if (state.lastStoryContext !== undefined && state.lastStoryContext !== null) {
      const context = state.lastStoryContext;
      if (typeof context !== 'object' || Array.isArray(context)) fail('Invalid saved story context.');
      for (const field of ['seed','name','job','want','word','rule','tone']) string(context[field], 250000, 'story context ' + field);
      if (!Number.isInteger(context.calls) || context.calls < 1 || context.calls > 100) fail('Invalid saved telephone call count.');
    }
    if (value.soundtrack !== null && (!value.soundtrack || value.soundtrack.kind !== 'dot-studio-project' || value.soundtrack.version !== 2)) fail('Invalid Studio soundtrack.');
    if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) fail('Invalid project revision.');
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).length > MAX_BYTES) fail('This project is too large. Export sampled audio separately; keep projects below 16 MB.');
    JSON.parse(serialized, (key, data) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Unsafe project property.'); return data; });
    // Whitelist the envelope so imported files cannot smuggle identity or credential fields.
    return clone(Object.fromEntries(['kind', 'version', 'id', 'title', 'createdAt', 'updatedAt', 'revision', 'sourceText', 'sourceMode', 'storyText', 'poemText', 'characterText', 'masterText', 'asciiText', 'machine', 'soundtrack'].filter(key => value[key] !== undefined).map(key => [key, value[key]])));
  }
  function make(title = 'Untitled telephone world') {
    const now = new Date().toISOString();
    return { kind: KIND, version: 1, id: root.crypto.randomUUID(), title, createdAt: now, updatedAt: now, revision: 0,
      sourceText: '', sourceMode: 'fiction', storyText: '', poemText: '', characterText: '', masterText: '', asciiText: '', machine: {}, soundtrack: null };
  }
  function open() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('Browser project storage is unavailable. Export your project to keep it.'));
      const request = root.indexedDB.open('mozcorp-public-creative-projects-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
      request.onerror = () => { database = null; reject(new Error('Could not open project storage. Export your project to keep it.')); };
      request.onblocked = () => reject(new Error('Close another older Doodleverse tab, then try again.'));
    });
    return database;
  }
  async function get(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get(id);
      request.onsuccess = () => { try { resolve(request.result ? validate(request.result) : null); } catch (error) { reject(error); } };
      request.onerror = () => reject(new Error('Could not read this project.'));
    });
  }
  async function list() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => { try { resolve(request.result.map(validate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(p => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, sourceMode: p.sourceMode, hasSoundtrack: !!p.soundtrack, revision: p.revision, engine: p.machine.engine || 'telephone-v2', station: p.machine.mozcorp?.station || 'telephone' }))); } catch (error) { reject(error); } };
      request.onerror = () => reject(new Error('Could not read the project shelf.'));
    });
  }
  function announce(id) {
    for (const listener of listeners) { try { listener(id); } catch {} }
  }
  async function save(value) {
    const checked = validate(value), db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects');
      let saved, reason;
      const abort = message => { reason = new Error(message); tx.abort(); };
      const request = store.get(checked.id);
      request.onsuccess = () => {
        const previous = request.result;
        if (previous && (previous.revision || 0) !== (checked.revision || 0)) return abort('This project changed in another tab. Reload it before saving, or export this version.');
        const count = store.count();
        count.onsuccess = () => {
          if (!previous && count.result >= MAX_PROJECTS) return abort('The shelf holds 60 projects. Export a backup before starting a new shelf.');
          saved = { ...checked, createdAt: previous?.createdAt || checked.createdAt, updatedAt: new Date().toISOString(), revision: (previous?.revision || 0) + 1 };
          store.put(saved);
        };
      };
      tx.oncomplete = () => { announce(saved.id); try { channel?.postMessage(saved.id); } catch {} resolve(clone(saved)); };
      tx.onabort = tx.onerror = () => reject(reason || new Error('Project storage could not save. Export a copy before closing.'));
    });
  }
  function text(value) {
    const p = validate(value);
    const output=id=>p.machine.mozcorp?.outputs?.[id]??p.machine.outputs?.find(x=>x.id===id)?.text??'';
    return [['TITLE', p.title], ['SOURCE HANDLING', p.sourceMode], ['ORIGINAL INPUT', p.sourceText], ['PRESERVED MASTER', p.masterText], ['CHARACTER', p.characterText], ['POEM', p.poemText], ['MACHINE STORY', p.storyText], ['ASCII', p.asciiText]].concat([['CREDITS',output('creditsOut')],['BLOOPER REEL',output('blooperOut')]].filter(([,content])=>content!=='')).map(([label, content]) => label + '\n' + content).join('\n\n');
  }
  function download(value) {
    const p = validate(value), url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = (p.title.replace(/[^\w-]+/g, '-').slice(0, 60) || 'telephone-world') + '.telephone.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function watch(callback) { listeners.add(callback); return () => listeners.delete(callback); }
  function route(record) {
    const p = validate(record);
    return mozcorpEngine(p.machine.engine) ? './?mozcorp=' + encodeURIComponent(p.id) + '#mozcorp' : './telephone.html?project=' + encodeURIComponent(p.id);
  }
  if (typeof root.BroadcastChannel === 'function' && typeof document !== 'undefined') {
    channel = new root.BroadcastChannel('mozcorp-public-creative-projects-v1'); channel.onmessage = event => { if (typeof event.data === 'string') announce(event.data); };
  }
  const api = { KIND, MAX_BYTES, MAX_PROJECTS, validate, make, get, list, save, watch, text, download, route };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DoodleBridge = api;
})(globalThis);
