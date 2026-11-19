import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { stations, caseRules } from './public-rooms.mjs';
import { createBrowserWorkspace } from './public-workspace.mjs';
import { PRIVATE_ROOM_BUNDLE } from './keeper-bundle-pin.mjs';

const read = (file, encoding) => readFile(new URL(file, import.meta.url), encoding);
const profile = {
  name: 'Paper Moth', pronouns: 'they/them', role: 'fictional courier',
  place: 'Lantern Nook', bio: 'Carries an imaginary lantern.', theme: 'deep',
};

function fixture() {
  let stored;
  const transaction = async (mode, callback) => callback(structuredClone(stored), next => {
    assert.equal(mode, 'readwrite');
    stored = structuredClone(next);
  });
  return () => createBrowserWorkspace({ transaction, getCaseRules: () => caseRules });
}

test('eight authored rooms and machine aliases use a blocked-network script policy', async () => {
  const canonical = new Set(stations.map(room => room.canonical));
  assert.equal(canonical.size, 8);
  assert.equal(stations.length, 10);
  assert.equal(stations.find(room => room.id === 'recent').canonical, 'machine');
  assert.equal(stations.find(room => room.id === 'voodont').canonical, 'machine');
  for (const room of canonical) {
    // HTML parsers normalize line endings before checking inline script hashes.
    const source = (await read('room-' + room + '.html', 'utf8')).replace(/\r\n?/g, '\n');
    const policy = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1].replaceAll('&#x27;', "'");
    assert.match(policy, /connect-src 'none'/);
    assert.doesNotMatch(source, /\.nabu\.casa|\.duckdns\.org|\.mozzzz\.chatgpt\.site|hassio_ingress|BEGIN [A-Z ]*PRIVATE KEY/);
    assert.doesNotMatch(policy, /script-src [^;]*unsafe-inline/);
    for (const [, code] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const hash = createHash('sha256').update(code).digest('base64');
      assert.ok(policy.includes("'sha256-" + hash + "'"), room + ' authentic inline script is allowed');
      new vm.Script(code);
    }
  }
  const html = await read('mozcorp-ui.mjs', 'utf8');
  assert.match(html, /sandbox', 'allow-scripts allow-forms allow-modals allow-downloads'/);
  assert.doesNotMatch(html, /allow-same-origin|\bfetch\(/);
});

test('the delivered story generator writes four paragraphs and keeps literal source text', async () => {
  const html = await read('room-machine.html', 'utf8');
  const code = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes]) => attributes.includes('machine.inline.1'))[2];
  const generator = code.slice(code.indexOf('    function finishStory('), code.indexOf('    function refreshPostRoll('));
  const seed = 'An invented paper moth writes literal \\n\\n on a sign.';
  const input = { seed, signal: 'A fictional bell.', name: 'Paper Moth', job: 'courier', want: 'a lantern', word: 'paper', rule: 'fictional', calls: 7, tone: 'unhinged' };
  const story = vm.runInNewContext(generator + '\nfinishStory(input)', {
    input, moduleOn: () => true, moduleDefs: new Array(16), pick: entries => entries[1],
  });
  assert.equal(story.split('\n\n').length, 4);
  assert.ok(story.includes(seed));
  assert.match(html, /14 \/\/ CREDITS/);
  assert.match(html, /15 \/\/ BLOOPER REEL/);
  assert.doesNotMatch(html, /old dogs from previous worlds/);
  const bug = await read('room-bug-world.html', 'utf8');
  assert.doesNotMatch(bug, /const LEGACY_SEED=/);
  assert.match(bug, /E\.freshState\(\), paused=true/);
});

test('the browser shelf retains checkpoints and rejects a stale replacement', async () => {
  const open = fixture();
  const first = open();
  const save = await first.cloudWrite({ kind: 'machine', slotName: 'Fictional Lantern Nook', payload: { seed: '  Paper moth  ', firewall: 'FINAL STORY // EXIT EXCLUDED' } });
  const second = open();
  const before = await second.cloudRead();
  assert.equal(before.scope, save.scope);
  assert.equal(before.slots.length, 1);
  assert.equal(JSON.parse(before.slots[0].payload).seed, '  Paper moth  ');
  await first.cloudWrite({ kind: 'animal-animal', slotName: 'Fictional moth', payload: {} });
  await assert.rejects(second.cloudWrite({ action: 'delete', scope: before.scope, revision: before.revision, id: save.id }), { code: 'REVISION_STALE' });
  assert.equal((await second.cloudRead()).slots.length, 2);
});

test('HOPE stays paused by default, validates solved fiction, and retains arrivals when paused again', async () => {
  const open = fixture();
  const world = open();
  let state = await world.hopeRead();
  assert.equal(state.enabled, false);
  const initial = await world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, kind: 'persona', profile, sourceAt: Date.now() });
  assert.equal(initial.outcome, 'cancelled');
  state = await world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: true });
  const person = await world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, kind: 'persona', profile, sourceAt: Date.now() });
  assert.equal(person.total, 1);
  const [caseId, rule] = Object.entries(caseRules)[0];
  const game = { caseId, revealed: 6, pinned: rule.essential, choice: rule.answer, evaluated: true };
  const caseInput = { action: 'seed', scope: state.scope, generation: state.generation, kind: 'case', profile, game, sourceAt: Date.now() };
  await assert.rejects(world.hopeWrite({ ...caseInput, game: { ...game, pinned: [] } }), { code: 'INVALID_SEED' });
  assert.equal((await world.hopeWrite(caseInput)).total, 2);
  assert.equal((await world.hopeWrite(caseInput)).outcome, 'duplicate');
  await world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: false });
  const reopened = await open().hopeRead();
  assert.equal(reopened.enabled, false);
  assert.equal(reopened.total, 2);
});

test('manual proposals stay available after reopening and external AI is unavailable', async () => {
  const open = fixture();
  const world = open();
  const before = await world.upgradeRead();
  assert.equal(before.configured, false);
  const input = {
    scope: before.scope, revision: before.revision, moduleId: 'world_shell', baseRelease: 'public-1',
    instruction: 'Make the fictional doorway label easier to read.',
  };
  await assert.rejects(world.upgradeWrite({ action: 'propose', ...input }), { code: 'PUBLIC_MANUAL_ONLY' });
  const proposal = { title: 'Fictional doorway', summary: 'Clarify the fictional label on this doorway.',
    proposedChanges: [{ area: 'Navigation', change: 'Use a clearer name.', rationale: 'The room will be easier to find.' }],
    privacyImpact: 'No data is requested.', reviewChecklist: ['Check the visible label.'], rollbackPlan: 'Restore the previous label.', riskLevel: 'LOW' };
  const written = await world.upgradeWrite({ action: 'propose_manual', ...input, proposal });
  assert.equal(written.proposals[0].status, 'PENDING_REVIEW');
  const after = await open().upgradeRead();
  assert.equal(after.proposals[0].versions[0].proposal.title, proposal.title);
  assert.equal(after.proposals[0].versions[0].model, 'manual');
});

test('the public Keeper kit matches its own reviewed digest', async () => {
  const kit = await read('MozCorp-Public-Stations.zip');
  assert.equal(kit.length, PRIVATE_ROOM_BUNDLE.bytes);
  assert.equal(createHash('sha256').update(kit).digest('hex'), PRIVATE_ROOM_BUNDLE.sha256);
});
