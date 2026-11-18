// SPDX-License-Identifier: GPL-3.0-only
const MAX_FILE = 6200000;
const fail = message => { throw new Error(message); };
export function parseCloudImport(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_FILE) fail('Choose a savepoint export smaller than 6.2 MB.');
  let value;
  try { value = JSON.parse(text, (key, item) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error(); return item; }); }
  catch { fail('That savepoint file is not readable JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== undefined && (value.format !== 'mozcorp-cloud-export' || value.version !== 1) || !Array.isArray(value.slots) || !value.slots.length || value.slots.length > 24) fail('Choose a MozCorp savepoint export containing one to 24 slots.');
  return value.slots.map(slot => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot) || typeof slot.slotName !== 'string' || !slot.slotName.trim() || slot.slotName.length > 48 || typeof slot.kind !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/.test(slot.kind) || slot.payload === undefined) fail('A savepoint is missing its name, kind or state.');
    const payload = typeof slot.payload === 'string' ? slot.payload : JSON.stringify(slot.payload);
    if (new TextEncoder().encode(payload).length > 120000) fail('A savepoint is larger than 120 KB.');
    try { JSON.parse(payload); } catch { fail('A savepoint contains unreadable state.'); }
    return { slotName: slot.slotName, kind: slot.kind, payload };
  });
}
function node(tag, text, className) { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; }
function button(text, action) { const item = node('button', text, 'button quiet'); item.type = 'button'; item.onclick = action; return item; }
export function createMozCorpCloud({ container, request, onRestore, setStatus = () => {} }) {
  let state = null, busy = false, ticket = 0, destroyed = false;
  const heading = node('h2', 'Browser savepoints');
  const note = node('p', 'These unencrypted savepoints stay in this browser. They hold pre-story machine state; use Save world for the final story and Studio score.', 'moz-note');
  const message = node('p', 'Refresh to read the browser savepoints.', 'moz-note'); message.setAttribute('role', 'status');
  const actions = node('div', undefined, 'moz-actions');
  const list = node('div', undefined, 'moz-cloud-list');
  const input = node('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
  const refreshButton = button('Refresh savepoints', () => perform(refresh));
  const exportButton = button('Export savepoints', () => perform(async () => {
    await refresh();
    const blob = new Blob([JSON.stringify({ format: 'mozcorp-cloud-export', version: 1, exportedAt: new Date().toISOString(), slots: state.slots }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = 'MozCorp-savepoints.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = 'Savepoint export prepared. Keep this file private.';
  }));
  const importButton = button('Import savepoints', () => input.click());
  actions.append(refreshButton, exportButton, importButton);
  const migration = node('p', 'Import a savepoint export to add copies to this browser. Personal receipts and review notebooks stay at their own desks.', 'moz-note');
  container.replaceChildren(heading, note, actions, input, message, list, migration);
  function update() {
    for (const item of container.querySelectorAll('button')) item.disabled = busy;
    exportButton.disabled ||= !state?.slots?.length;
    importButton.disabled ||= !state;
  }
  function paint() {
    list.replaceChildren();
    for (const slot of state.slots) {
      const row = node('article', undefined, 'moz-cloud-slot utility-card');
      row.append(node('h3', slot.slotName), node('p', slot.kind + ' · ' + slot.createdAt, 'moz-note'));
      const controls = node('div', undefined, 'moz-actions');
      if (['machine', 'animal-animal'].includes(slot.kind)) controls.append(button('Open in machine', () => perform(() => onRestore(slot))));
      controls.append(button('Remove savepoint', () => perform(async () => {
        if (!confirm('Remove “' + slot.slotName + '” from this shared Keeper? Export savepoints first if you want a copy.')) return;
        state = await request('POST', { action: 'delete', scope: state.scope, revision: state.revision, id: slot.id });
        paint(); message.textContent = 'Savepoint removed from the shared Keeper.';
      })));
      row.append(controls); list.append(row);
    }
    message.textContent = state.slots.length ? state.slots.length + ' of 24 savepoints in this browser.' : 'No savepoints yet. Open the machine’s Cloud Bus and save one.';
    update();
  }
  async function refresh() {
    const current = ++ticket, next = await request('GET');
    if (destroyed || current !== ticket) return;
    if (!next || typeof next.scope !== 'string' || !Number.isSafeInteger(next.revision) || !Array.isArray(next.slots) || next.slots.length > 24) fail('The savepoint list could not be read.');
    state = next; paint();
  }
  async function perform(action) {
    if (busy || destroyed) return;
    busy = true; update();
    try { await action(); }
    catch (error) { message.textContent = error.message; setStatus(error.message, true); }
    finally { busy = false; update(); }
  }
  input.onchange = () => perform(async () => {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    if (!state) fail('Refresh the savepoints first.');
    if (file.size > MAX_FILE) fail('Choose an export smaller than 6.2 MB.');
    const slots = parseCloudImport(await file.text());
    if (!confirm('Add ' + slots.length + ' savepoint copies to this shared Keeper? Anyone with access to this Keeper can open them.')) return;
    state = await request('POST', { action: 'import', scope: state.scope, revision: state.revision, slots });
    paint(); message.textContent = 'Savepoint copies imported. Existing slots were preserved.';
  });
  update();
  return { refresh: () => perform(refresh), setVisible(value) { if (value) return perform(refresh); }, destroy() { destroyed = true; ticket++; container.replaceChildren(); } };
}
