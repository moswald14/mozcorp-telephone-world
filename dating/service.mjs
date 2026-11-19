const API = '/dating-api/';
const DAY = 86_400_000;
const SESSION_AGE = 14 * DAY;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PROFILE_ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const INTENTS = new Set(['long-term', 'short-term', 'open']);
const REASONS = new Set(['harassment', 'spam', 'underage', 'impersonation', 'other']);
const PROFILE_COLUMNS = 'p.id, p.alias, p.age, p.region, p.intent, p.intro, p.icebreaker';

// Named parameters 1 and 2 are always the signed-in member and the peer.
const UNBLOCKED = `NOT EXISTS (
  SELECT 1 FROM dating_blocks b
  WHERE (b.actor = ?1 AND b.target = ?2) OR (b.actor = ?2 AND b.target = ?1)
)`;
const MUTUAL = `EXISTS (
  SELECT 1 FROM dating_choices outgoing
  JOIN dating_choices incoming ON incoming.actor = outgoing.target AND incoming.target = outgoing.actor
  WHERE outgoing.actor = ?1 AND outgoing.target = ?2
    AND outgoing.choice = 'interested' AND incoming.choice = 'interested'
) AND ${UNBLOCKED}`;
const DISCOVERABLE_PAIR = `EXISTS (SELECT 1 FROM dating_profiles WHERE id = ?1 AND listed = 1)
  AND EXISTS (SELECT 1 FROM dating_profiles WHERE id = ?2 AND listed = 1) AND ${UNBLOCKED}`;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(condition, status, message) {
  if (!condition) throw new RequestError(status, message);
}

function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function reply(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...headers,
  } });
}

async function jsonBody(request) {
  requireValue(request.headers.get('Content-Type')?.split(';')[0]?.trim() === 'application/json',
    415, 'Send a JSON request.');
  const reader = request.body?.getReader();
  requireValue(reader, 400, 'Enter the requested information.');
  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new RequestError(413, 'This entry is too long.');
    }
    text += decoder.decode(value, { stream: true });
  }
  let result;
  try { result = JSON.parse(text + decoder.decode()); } catch {
    throw new RequestError(400, 'The request could not be read.');
  }
  requireValue(result && typeof result === 'object' && !Array.isArray(result),
    400, 'The request could not be read.');
  return result;
}

function cleanText(value, label, min, max) {
  requireValue(typeof value === 'string', 400, `Enter ${label}.`);
  const text = value.trim();
  requireValue(text.length >= min && text.length <= max, 400,
    min ? `${label} must have ${min}–${max} characters.` : `${label} can have up to ${max} characters.`);
  return text;
}

function peerId(value, memberId) {
  requireValue(typeof value === 'string' && PROFILE_ID.test(value) && value !== memberId,
    400, 'Choose another profile.');
  return value;
}

function cookieName(url) {
  return url.protocol === 'https:' ? '__Host-btw_session' : 'btw_local_session';
}

function sessionCookie(url, token, age) {
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}` +
    (url.protocol === 'https:' ? '; Secure' : '');
}

function readCookie(request, url) {
  const prefix = cookieName(url) + '=';
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
  return token && TOKEN.test(token) ? token : null;
}

export function createDatingService(db, { signups = true } = {}) {
  const query = (sql, ...args) => args.length ? db.prepare(sql).bind(...args) : db.prepare(sql);
  const first = (sql, ...args) => query(sql, ...args).first();
  const rows = async (sql, ...args) => (await query(sql, ...args).all()).results;

  async function throttle(kind, subject, limit, window) {
    const now = Date.now();
    const salt = await first("SELECT value FROM dating_settings WHERE name = 'rate-salt'");
    const expires = Math.floor(now / window) * window + window;
    const bucket = await digest(`${salt.value}:${kind}:${subject}:${expires}`);
    const result = await first(`INSERT INTO dating_rate_limits (bucket, used, expires_at) VALUES (?1, 1, ?2)
      ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < ?3 RETURNING used`, bucket, expires, limit);
    requireValue(result, 429, 'Too many attempts. Please try again later.');
    if (result.used === 1) {
      await query(`DELETE FROM dating_rate_limits WHERE bucket IN (
        SELECT bucket FROM dating_rate_limits WHERE expires_at <= ? LIMIT 100)`, now).run();
    }
  }

  async function session(request, url) {
    const token = readCookie(request, url);
    if (!token) return null;
    return first('SELECT member_id, token_hash FROM dating_sessions WHERE token_hash = ? AND expires_at > ?',
      await digest(token), Date.now());
  }

  async function startSession(url, id, signInKey, previous) {
    const now = Date.now();
    const token = randomToken();
    const ops = [];
    if (signInKey) {
      ops.push(query('INSERT INTO dating_members VALUES (?, ?, ?)', id, await digest(signInKey), now));
    }
    if (previous) ops.push(query('DELETE FROM dating_sessions WHERE token_hash = ?', previous.token_hash));
    ops.push(query('DELETE FROM dating_sessions WHERE member_id = ? AND expires_at <= ?', id, now));
    ops.push(query('INSERT INTO dating_sessions VALUES (?, ?, ?)', await digest(token), id, now + SESSION_AGE));
    await db.batch(ops);
    return reply(signInKey ? { signInKey } : { signedIn: true }, signInKey ? 201 : 200,
      { 'Set-Cookie': sessionCookie(url, token, SESSION_AGE / 1000) });
  }

  async function saveProfile(request, id) {
    const data = await jsonBody(request);
    const alias = cleanText(data.alias, 'Display name', 2, 40);
    const region = cleanText(data.region, 'Region', 0, 60);
    const intro = cleanText(data.intro, 'About you', 0, 420);
    const icebreaker = cleanText(data.icebreaker, 'Icebreaker answer', 5, 280);
    requireValue(Number.isInteger(data.age) && data.age >= 18 && data.age <= 120, 400,
      'Enter an age from 18 to 120.');
    requireValue(INTENTS.has(data.intent) && typeof data.listed === 'boolean', 400,
      'Choose what you are looking for and whether to show your profile.');
    await query(`INSERT INTO dating_profiles (id, alias, age, region, intent, intro, icebreaker, listed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET alias = excluded.alias, age = excluded.age, region = excluded.region,
        intent = excluded.intent, intro = excluded.intro, icebreaker = excluded.icebreaker,
        listed = excluded.listed, updated_at = excluded.updated_at`,
    id, alias, data.age, region, data.intent, intro, icebreaker, Number(data.listed), Date.now()).run();
    return reply({ saved: true });
  }

  async function discover(url, profile) {
    requireValue(profile?.listed, 409, 'Show your dating profile to browse other members.');
    const intent = url.searchParams.get('intent');
    requireValue(intent === null || INTENTS.has(intent), 400, 'Choose a supported dating intention.');
    return reply({ profiles: await rows(`SELECT ${PROFILE_COLUMNS} FROM dating_profiles p
      WHERE p.id <> ?1 AND p.listed = 1 AND (?2 IS NULL OR p.intent = ?2)
        AND NOT EXISTS (SELECT 1 FROM dating_choices c WHERE c.actor = ?1 AND c.target = p.id)
        AND NOT EXISTS (SELECT 1 FROM dating_blocks b WHERE
          (b.actor = ?1 AND b.target = p.id) OR (b.actor = p.id AND b.target = ?1))
      ORDER BY p.updated_at DESC, p.id LIMIT 30`, profile.id, intent) });
  }

  async function choose(request, id) {
    const data = await jsonBody(request);
    const peer = peerId(data.profileId, id);
    requireValue(data.choice === 'interested' || data.choice === 'pass', 400, 'Choose Interested or Pass.');
    const outcome = await db.batch([
      query(`INSERT OR IGNORE INTO dating_choices (actor, target, choice, created_at)
        SELECT ?1, ?2, ?3, ?4 WHERE ${DISCOVERABLE_PAIR}`, id, peer, data.choice, Date.now()),
      query(`SELECT choice FROM dating_choices WHERE actor = ?1 AND target = ?2 AND ${UNBLOCKED}`, id, peer),
      query(`SELECT 1 AS matched WHERE ${MUTUAL}`, id, peer),
    ]);
    const recorded = outcome[1].results[0]?.choice;
    requireValue(recorded, 404, 'This profile is no longer available.');
    requireValue(recorded === data.choice, 409, 'You already made a different choice for this profile.');
    return reply({ matched: Boolean(outcome[2].results.length) });
  }

  async function matches(id) {
    return reply({ profiles: await rows(`SELECT ${PROFILE_COLUMNS} FROM dating_choices outgoing
      JOIN dating_choices incoming ON incoming.actor = outgoing.target AND incoming.target = outgoing.actor
      JOIN dating_profiles p ON p.id = outgoing.target
      WHERE outgoing.actor = ?1 AND outgoing.choice = 'interested' AND incoming.choice = 'interested'
        AND NOT EXISTS (SELECT 1 FROM dating_blocks b WHERE
          (b.actor = ?1 AND b.target = p.id) OR (b.actor = p.id AND b.target = ?1))
      ORDER BY max(outgoing.created_at, incoming.created_at) DESC, p.id`, id) });
  }

  async function conversation(request, id, peer) {
    if (request.method === 'POST') {
      const { message, clientId } = await jsonBody(request);
      const content = cleanText(message, 'Message', 1, 800);
      requireValue(typeof clientId === 'string' && PROFILE_ID.test(clientId), 400, 'Resend your message.');
      await throttle('message', id, 20, 60_000);
      const written = await first(`INSERT INTO dating_messages (sender, recipient, client_id, body, sent_at)
        SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${MUTUAL}
        ON CONFLICT(sender, client_id) DO NOTHING RETURNING sequence`, id, peer, clientId, content, Date.now());
      if (written) return reply({ sent: true }, 201);
      const prior = await first(`SELECT recipient, body FROM dating_messages
        WHERE sender = ?1 AND recipient = ?2 AND client_id = ?3 AND ${MUTUAL}`, id, peer, clientId);
      requireValue(prior?.body === content, 404, 'This conversation is no longer available.');
      return reply({ sent: true });
    }
    const result = await db.batch([
      query(`SELECT 1 AS matched WHERE ${MUTUAL}`, id, peer),
      query(`SELECT sequence, sender = ?1 AS mine, body, sent_at AS sentAt FROM dating_messages
        WHERE ((sender = ?1 AND recipient = ?2) OR (sender = ?2 AND recipient = ?1)) AND ${MUTUAL}
        ORDER BY sequence DESC LIMIT 80`, id, peer),
    ]);
    requireValue(result[0].results.length, 404, 'This conversation is no longer available.');
    return reply({ messages: result[1].results.reverse() });
  }

  async function blockOrReport(request, route, id) {
    const { profileId, reason } = await jsonBody(request);
    const peer = peerId(profileId, id);
    const commands = [];
    if (route === 'report') {
      requireValue(REASONS.has(reason), 400, 'Choose a reason for your report.');
      await throttle('report', id, 12, DAY);
      commands.push(query(`INSERT OR IGNORE INTO dating_reports (reporter, subject, reason, created_at)
        SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM dating_profiles WHERE id = ?2)`,
      id, peer, reason, Date.now()));
    }
    commands.push(query(`INSERT OR IGNORE INTO dating_blocks (actor, target)
      SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM dating_profiles WHERE id = ?2)`, id, peer));
    await db.batch(commands);
    return reply({ blocked: true });
  }

  return async function handle(request, { clientAddress = '' } = {}) {
    const url = new URL(request.url);
    const method = request.method;
    const route = url.pathname.slice(API.length);
    try {
      requireValue(url.pathname.startsWith(API), 404, 'This service route does not exist.');
      if (method !== 'GET') {
        requireValue(request.headers.get('Origin') === url.origin, 403, 'Open the dating site to make that change.');
      }
      if (method === 'GET' && route === 'status') {
        const schema = await first("SELECT 1 AS ready FROM dating_settings WHERE name = 'rate-salt'");
        return reply({ service: 'telephone-dating', ready: Boolean(schema), signups });
      }
      const active = await session(request, url);
      if (method === 'POST' && (route === 'register' || route === 'sign-in')) {
        const data = await jsonBody(request);
        if (route === 'register') {
          requireValue(signups, 403, 'Dating signups are paused.');
          requireValue(!active, 409, 'Sign out before creating another account.');
          requireValue(data.adult === true, 400, 'Confirm you are 18 or older to join.');
          await throttle('register', clientAddress, 6, 60 * 60_000);
          return await startSession(url, crypto.randomUUID(), 'btw_' + randomToken());
        }
        await throttle('sign-in', clientAddress, 30, 60_000);
        const key = typeof data.key === 'string' ? data.key.trim() : '';
        requireValue(key.startsWith('btw_') && TOKEN.test(key.slice(4)), 401, 'Check your sign-in key.');
        const member = await first('SELECT id FROM dating_members WHERE key_hash = ?', await digest(key));
        requireValue(member, 401, 'Check your sign-in key.');
        return await startSession(url, member.id, undefined, active);
      }
      if (method === 'GET' && route === 'session' && !active) return reply({ member: null, profile: null });
      requireValue(active, 401, 'Sign in to continue.');
      const id = active.member_id;
      if (method === 'POST' && route === 'sign-out') {
        await query('DELETE FROM dating_sessions WHERE token_hash = ?', active.token_hash).run();
        return reply({}, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
      }
      if (method === 'DELETE' && route === 'account') {
        await query('DELETE FROM dating_members WHERE id = ?', id).run();
        return reply({}, 200, { 'Set-Cookie': sessionCookie(url, '', 0) });
      }
      if (method === 'PUT' && route === 'profile') return await saveProfile(request, id);
      const profile = await first(`SELECT ${PROFILE_COLUMNS}, p.listed FROM dating_profiles p WHERE p.id = ?`, id);
      if (method === 'GET' && route === 'session') return reply({ member: id, profile });
      requireValue(profile, 409, 'Save your profile first.');
      if (method === 'GET' && route === 'discover') return await discover(url, profile);
      if (method === 'GET' && route === 'matches') return await matches(id);
      if (method === 'POST' && route === 'choose') return await choose(request, id);
      if (method === 'POST' && (route === 'block' || route === 'report')) return await blockOrReport(request, route, id);
      if (['GET', 'POST'].includes(method) && route.startsWith('conversation/')) {
        return await conversation(request, id, peerId(route.slice('conversation/'.length), id));
      }
      return reply({ error: 'This service route does not exist.' }, 404);
    } catch (error) {
      if (error instanceof RequestError) return reply({ error: error.message }, error.status);
      console.error('Telephone dating request failed', method, error?.name);
      return reply({ error: 'Telephone dating is temporarily unavailable. Please try again.' }, 503);
    }
  };
}
