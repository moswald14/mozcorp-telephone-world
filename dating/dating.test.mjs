import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { makeDatingServer } from './server.mjs';
import { openDatingDatabase } from './sqlite.mjs';

test('shared dating accounts, reciprocal matches and private conversations', async t => {
  const db = openDatingDatabase(':memory:');
  const server = await makeDatingServer({ database: db });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  function browser() {
    let cookie = '';
    return async (path, method = 'GET', body, currentOrigin = origin) => {
      const headers = { Cookie: cookie, Origin: currentOrigin };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(`${origin}/dating-api/${path}`, { headers, method,
        body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
  }

  const page = await fetch(origin + '/');
  const landing = await page.text();
  assert.match(landing, /Dating for adults/);
  assert.match(landing, /src="\.\/switchboard-phone\.jpg"/);
  const switchboardPhoto = await fetch(origin + '/switchboard-phone.jpg');
  assert.equal(switchboardPhoto.status, 200);
  assert.equal(switchboardPhoto.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await switchboardPhoto.arrayBuffer()).subarray(0, 2)], [0xff, 0xd8]);
  const datingPage = await fetch(origin + '/dating.html');
  assert.match(await datingPage.text(), /Show my profile to signed-in members/);
  assert.equal((await fetch(origin + '/dating/schema.sql')).status, 404);

  const ari = browser(), jo = browser(), kei = browser(), stranger = browser();
  assert.equal((await stranger('status')).data.ready, true);
  assert.deepEqual((await stranger('session')).data, { member: null, profile: null });
  assert.equal((await stranger('discover')).status, 401);
  assert.equal((await ari('register', 'POST', { adult: true }, 'https://unrelated.example')).status, 403);
  assert.equal((await ari('register', 'POST', { adult: false })).status, 400);

  async function join(user, alias, listed) {
    const { data: { signInKey }, status } = await user('register', 'POST', { adult: true });
    assert.equal(status, 201);
    assert.match(signInKey, /^btw_[\w-]{43}$/);
    const id = (await user('session')).data.member;
    const profile = { alias, age: 29, region: 'Somewhere fictional', intent: 'open', intro: '',
      icebreaker: 'A warm feeling on a rainy day.', listed };
    assert.equal((await user('profile', 'PUT', { ...profile, age: 17 })).status, 400);
    assert.equal((await user('profile', 'PUT', profile)).status, 200);
    return { id, signInKey, profile };
  }

  const a = await join(ari, 'Ari QA', true);
  const j = await join(jo, 'Jo QA', true);
  const k = await join(kei, 'Kei QA', false);
  const first = (await ari('discover')).data.profiles;
  assert.deepEqual(first.map(profile => profile.id), [j.id]);
  assert.deepEqual(Object.keys(first[0]).sort(), ['age', 'alias', 'icebreaker', 'id', 'intent', 'intro', 'region']);
  assert.equal((await kei('discover')).status, 409);
  assert.equal((await ari('choose', 'POST', { profileId: k.id, choice: 'interested' })).status, 404);

  assert.deepEqual((await ari('choose', 'POST', { profileId: j.id, choice: 'interested' })).data, { matched: false });
  assert.deepEqual((await ari('matches')).data.profiles, []);
  assert.equal((await ari(`conversation/${j.id}`)).status, 404);
  assert.deepEqual((await jo('choose', 'POST', { profileId: a.id, choice: 'interested' })).data, { matched: true });
  assert.deepEqual((await ari('matches')).data.profiles.map(profile => profile.id), [j.id]);
  assert.deepEqual((await jo('matches')).data.profiles.map(profile => profile.id), [a.id]);
  assert.equal((await ari('choose', 'POST', { profileId: j.id, choice: 'pass' })).status, 409);

  const payload = { message: 'A small umbrella for big feelings.', clientId: crypto.randomUUID() };
  assert.equal((await ari(`conversation/${j.id}`, 'POST', payload)).status, 201);
  assert.equal((await ari(`conversation/${j.id}`, 'POST', payload)).status, 200);
  const received = (await jo(`conversation/${a.id}`)).data.messages;
  assert.equal(received.length, 1);
  assert.equal(received[0].body, payload.message);
  assert.equal(received[0].mine, 0);
  assert.equal((await kei(`conversation/${a.id}`)).status, 404);

  assert.equal((await ari('profile', 'PUT', { ...a.profile, listed: false })).status, 200);
  assert.deepEqual((await ari('matches')).data.profiles.map(profile => profile.id), [j.id]);
  assert.equal((await ari('sign-out', 'POST')).status, 200);
  assert.equal((await ari('matches')).status, 401);
  assert.equal((await ari('sign-in', 'POST', { key: a.signInKey })).status, 200);
  assert.equal((await ari('session')).data.profile.alias, 'Ari QA');
  assert.equal((await jo('report', 'POST', { profileId: a.id, reason: 'other' })).status, 200);
  assert.deepEqual((await ari('matches')).data.profiles, []);
  assert.deepEqual((await jo('matches')).data.profiles, []);
  assert.equal((await ari(`conversation/${j.id}`)).status, 404);
  assert.equal((await ari(`conversation/${j.id}`, 'POST', { ...payload, clientId: crypto.randomUUID() })).status, 404);

  assert.equal((await ari('account', 'DELETE')).status, 200);
  assert.equal((await ari('sign-in', 'POST', { key: a.signInKey })).status, 401);
  assert.equal(db.prepare('SELECT count(*) AS count FROM dating_messages').first().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM dating_reports').first().count, 1);
});
